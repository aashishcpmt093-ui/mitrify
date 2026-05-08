import fs from "fs";
import path from "path";
import { createWriteStream } from "fs";
import nodemailer from "nodemailer";
import { Storage } from "@google-cloud/storage";
import { pool, db } from "./db";
import { siteContent, NO_ALERT_NEEDED_MESSAGE } from "@shared/schema";
import { eq } from "drizzle-orm";

export const BACKUPS_DIR = path.resolve(process.cwd(), "backups");
const RETENTION = 30;
const STATUS_KEY = "backup_status";

// ─────────────────────────────────────────────────────────────
// Alert — send a push notification when a backup problem occurs
// Set BACKUP_ALERT_WEBHOOK to a Slack/Discord/generic webhook URL
// or to a Telegram Bot API URL:
//   https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>
// ─────────────────────────────────────────────────────────────

export async function sendBackupAlert(opts: {
  filename?: string;
  errorMessage?: string;
  successMessage?: string;
  dashboardUrl?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const webhookUrl = process.env.BACKUP_ALERT_WEBHOOK;
  if (!webhookUrl) return { sent: false, error: "BACKUP_ALERT_WEBHOOK not configured" };

  const { filename, errorMessage, successMessage, dashboardUrl } = opts;
  const dash = dashboardUrl ?? (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}/admin`
    : "/admin");

  const isSuccess = !!successMessage && !errorMessage;
  const lines: string[] = isSuccess
    ? [
        "✅ *Mitrify nightly backup heartbeat*",
        filename ? `📁 File: \`${filename}\`` : "📁 File: (unknown)",
        `🟢 ${successMessage}`,
        `🔗 Dashboard: ${dash}`,
      ]
    : [
        "⚠️ *Mitrify nightly backup alert*",
        filename ? `📁 File: \`${filename}\`` : "📁 File: (not generated)",
        `❌ Error: ${errorMessage ?? "(no detail)"}`,
        `🔗 Dashboard: ${dash}`,
      ];
  const message = lines.join("\n");

  try {
    const isTelegram = webhookUrl.includes("api.telegram.org");
    const body = isTelegram
      ? JSON.stringify({ text: message, parse_mode: "Markdown" })
      : JSON.stringify({ text: message });

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const errMsg = `Webhook returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
      console.error(`[backup] alert webhook returned ${res.status}: ${detail}`);
      return { sent: false, error: errMsg };
    } else {
      console.log("[backup] alert sent to webhook");
      return { sent: true };
    }
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    console.error("[backup] failed to send alert webhook:", err);
    return { sent: false, error: errMsg };
  }
}

function sqlLiteral(val: any, dataType?: string): string {
  if (val === null || val === undefined) return "NULL";
  if (dataType === "json" || dataType === "jsonb") {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "bigint") return val.toString();
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (Array.isArray(val)) {
    const inner = val.map((v) => {
      if (v === null || v === undefined) return "NULL";
      const s = String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `"${s}"`;
    }).join(",");
    return `'{${inner.replace(/'/g, "''")}}'`;
  }
  if (typeof val === "object") {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  // Use PostgreSQL escape-string syntax (E'...') so backslash sequences are
  // interpreted by the server and the literal stays on a single line.
  return `E'${String(val).replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t")}'`;
}

function quoteIdent(s: string) { return `"${s.replace(/"/g, '""')}"`; }

function columnTypeSql(col: any): string {
  const dt: string = col.data_type;
  const udt: string = col.udt_name;
  const len: number | null = col.character_maximum_length;
  const prec: number | null = col.numeric_precision;
  const scale: number | null = col.numeric_scale;
  switch (dt) {
    case "character varying": return len ? `varchar(${len})` : "varchar";
    case "character":         return len ? `char(${len})` : "char";
    case "text":              return "text";
    case "integer":           return "integer";
    case "bigint":            return "bigint";
    case "smallint":          return "smallint";
    case "boolean":           return "boolean";
    case "real":              return "real";
    case "double precision":  return "double precision";
    case "numeric":           return prec ? `numeric(${prec}${scale != null ? `,${scale}` : ""})` : "numeric";
    case "json":              return "json";
    case "jsonb":             return "jsonb";
    case "uuid":              return "uuid";
    case "date":              return "date";
    case "timestamp without time zone": return "timestamp";
    case "timestamp with time zone":    return "timestamptz";
    case "time without time zone":      return "time";
    case "time with time zone":         return "timetz";
    case "bytea":             return "bytea";
    case "ARRAY": {
      const base = udt && udt.startsWith("_") ? udt.slice(1) : (udt || "text");
      return `${base}[]`;
    }
    default:
      return udt || dt;
  }
}

function pad(n: number) { return n.toString().padStart(2, "0"); }

export function makeBackupFilename(now: Date = new Date()): string {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `mitrify-backup-${stamp}.sql`;
}

/**
 * Writes a full SQL dump (CREATE TABLE IF NOT EXISTS + every row) to the
 * provided write callback. Used by both the on-demand admin endpoint and the
 * nightly scheduled job so the two stay in lockstep.
 */
/**
 * Compare current per-table row counts to the previous backup and flag
 * tables that have suffered a suspicious drop. A table is flagged if EITHER:
 *   - it dropped by more than `BACKUP_ROW_DROP_PCT` (default 20%), OR
 *   - it dropped by more than `BACKUP_ROW_DROP_MIN` rows (default 100)
 * Catches both "small % but lots of rows" (botched bulk delete on a huge
 * table) and "big % drop on small but important table" (e.g. an admin
 * config table going from 30 → 5 rows).
 */
const BACKUP_ROW_DROP_PCT = 0.2;
const BACKUP_ROW_DROP_MIN = 100;

export function computeBackupWarnings(
  current: Record<string, number>,
  previous: Record<string, number> | undefined | null,
): string[] {
  if (!previous) return [];
  const warnings: string[] = [];
  for (const [table, prevRows] of Object.entries(previous)) {
    if (prevRows <= 0) continue;
    const curRows = current[table];
    if (curRows === undefined) {
      // Table existed before but isn't in this dump at all — definitely worth flagging.
      warnings.push(`Table "${table}" disappeared (had ${prevRows} rows in previous backup)`);
      continue;
    }
    const drop = prevRows - curRows;
    if (drop <= 0) continue;
    const pct = drop / prevRows;
    if (drop > BACKUP_ROW_DROP_MIN || pct > BACKUP_ROW_DROP_PCT) {
      warnings.push(
        `Table "${table}" dropped ${drop} rows (${(pct * 100).toFixed(1)}%): ${prevRows} → ${curRows}`,
      );
    }
  }
  return warnings;
}

export async function streamBackupSql(
  write: (s: string) => void,
  opts: {
    filename?: string;
    /** Per-table row counts from the previous successful backup. When provided
     *  enables the row-drop comparison; warnings (if any) are written into the
     *  dump header AND returned in the result for callers to surface in the UI. */
    previousPerTable?: Record<string, number>;
    /** Fired exactly once after counts + warnings are computed but BEFORE any
     *  `write()` is called. Lets callers (e.g. HTTP route handlers) set
     *  response headers before the body stream begins. */
    onMetricsReady?: (info: { perTable: Record<string, number>; warnings: string[] }) => void;
  } = {},
): Promise<{ totalRows: number; tableCount: number; perTable: Record<string, number>; warnings: string[] }> {
  const now = new Date();
  const filename = opts.filename ?? makeBackupFilename(now);

  // ── Phase 1: enumerate tables and count rows up front ──
  // We need counts BEFORE writing the header so we can include any
  // `-- WARNING:` lines for tables that lost a lot of rows since last backup.
  // COUNT(*) on every table is cheap relative to the per-row INSERT dump
  // we're about to produce.
  const tablesRes = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  const tableNames: string[] = tablesRes.rows.map((r: any) => r.table_name);

  const perTable: Record<string, number> = {};
  for (const table of tableNames) {
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS c FROM ${quoteIdent(table)}`,
    );
    perTable[table] = countRes.rows[0]?.c ?? 0;
  }

  const warnings = computeBackupWarnings(perTable, opts.previousPerTable);
  // Fire the metrics-ready callback BEFORE the first write so HTTP routes
  // can set response headers (which must precede res.write()).
  try { opts.onMetricsReady?.({ perTable, warnings }); } catch {}

  write(`-- Mitrify database backup\n`);
  write(`-- Generated: ${now.toISOString()}\n`);
  write(`-- Contents: 100% full snapshot of every table, every row\n`);
  write(`-- Restore: psql <connection-url> < ${filename}\n`);
  if (warnings.length > 0) {
    write(`--\n`);
    write(`-- WARNING: ${warnings.length} table(s) shrank significantly since the previous backup.\n`);
    write(`-- WARNING: This may indicate accidental data loss. Review before discarding the prior backup.\n`);
    for (const w of warnings) {
      write(`-- WARNING: ${w}\n`);
    }
  }
  write(`\nBEGIN;\n\n`);

  const BATCH = 500;
  let totalRows = 0;
  let tableCount = 0;

  for (const table of tableNames) {
    const colsRes = await pool.query(
      `SELECT column_name, data_type, udt_name, character_maximum_length,
              numeric_precision, numeric_scale, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position`,
      [table],
    );
    const colRows: any[] = colsRes.rows;
    const cols: string[] = colRows.map((r) => r.column_name);
    const colTypes: Record<string, string> = Object.fromEntries(
      colRows.map((r) => [r.column_name, r.data_type]),
    );
    if (cols.length === 0) continue;

    const pkRes = await pool.query(
      `SELECT a.attname AS column_name
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = ('public.' || $1)::regclass AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)`,
      [table],
    );
    const pkCols: string[] = pkRes.rows.map((r: any) => r.column_name);

    const total: number = perTable[table] ?? 0;
    totalRows += total;
    tableCount += 1;

    write(`-- ─────────────────────────────────────────\n`);
    write(`-- Table: ${table}  |  rows in dump: ${total}\n`);
    write(`-- ─────────────────────────────────────────\n`);

    const colDefs = colRows.map((c) => {
      const isSerialDefault =
        typeof c.column_default === "string" &&
        c.column_default.startsWith("nextval(");
      let typeSql: string;
      let emitDefault = c.column_default !== null && c.column_default !== undefined;
      if (isSerialDefault) {
        const dt = c.data_type;
        typeSql = dt === "bigint" ? "bigserial" : dt === "smallint" ? "smallserial" : "serial";
        emitDefault = false;
      } else {
        typeSql = columnTypeSql(c);
      }
      const parts: string[] = [quoteIdent(c.column_name), typeSql];
      if (emitDefault) parts.push(`DEFAULT ${c.column_default}`);
      if (c.is_nullable === "NO" && !isSerialDefault) parts.push("NOT NULL");
      return "  " + parts.join(" ");
    });
    if (pkCols.length > 0) {
      colDefs.push(`  PRIMARY KEY (${pkCols.map(quoteIdent).join(", ")})`);
    }
    write(`CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (\n${colDefs.join(",\n")}\n);\n`);

    if (total === 0) {
      write(`-- (no rows)\n\n`);
      continue;
    }

    const colList = cols.map(quoteIdent).join(", ");
    const idType = colTypes["id"];
    const hasNumericId = cols.includes("id") && idType && /int|serial|numeric/i.test(idType);

    if (hasNumericId) {
      let lastId = 0;
      while (true) {
        const rowsRes = await pool.query(
          `SELECT ${colList} FROM ${quoteIdent(table)} WHERE "id" > ${lastId} ORDER BY "id" LIMIT ${BATCH}`,
        );
        if (rowsRes.rows.length === 0) break;
        for (const row of rowsRes.rows) {
          const vals = cols.map((c) => sqlLiteral(row[c], colTypes[c])).join(", ");
          write(`INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`);
          lastId = Number(row.id) || lastId;
        }
      }
    } else {
      const orderCol = cols[0];
      let offset = 0;
      while (offset < total) {
        const rowsRes = await pool.query(
          `SELECT ${colList} FROM ${quoteIdent(table)} ORDER BY ${quoteIdent(orderCol)} LIMIT ${BATCH} OFFSET ${offset}`,
        );
        if (rowsRes.rows.length === 0) break;
        for (const row of rowsRes.rows) {
          const vals = cols.map((c) => sqlLiteral(row[c], colTypes[c])).join(", ");
          write(`INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`);
        }
        offset += rowsRes.rows.length;
      }
    }

    if (hasNumericId) {
      write(`SELECT setval(pg_get_serial_sequence('${table.replace(/'/g, "''")}', 'id'), COALESCE((SELECT MAX("id") FROM ${quoteIdent(table)}), 1), true);\n`);
    }
    write(`\n`);
  }

  write(`COMMIT;\n`);
  write(`-- End of backup\n`);
  return { totalRows, tableCount, perTable, warnings };
}

// ─────────────────────────────────────────────────────────────
// Restore — replay an uploaded .sql backup into the database
// ─────────────────────────────────────────────────────────────

export interface RestoreTableSummary {
  table: string;
  rowsBefore: number;
  rowsAfter: number;
  delta: number;
  /** Merge mode only: rows actually inserted from the dump. */
  rowsAdded?: number;
  /** Merge mode only: rows from the dump that were skipped (already existed). */
  rowsSkipped?: number;
  /** Expected row count as recorded in the dump header. Present when the dump
   *  contains header metadata (produced by streamBackupSql). */
  rowsInDump?: number;
  /** True when a row-count discrepancy is detected beyond RESTORE_MISMATCH_THRESHOLD.
   *  Overwrite mode: |rowsAfter − rowsInDump| > threshold.
   *  Merge mode: rowsAfter < rowsInDump − threshold (DB has fewer rows than the dump
   *  declared, meaning rows were silently lost rather than merely conflicted-away).
   *  Only set for tables in the active restore scope; absent for untouched tables. */
  mismatch?: boolean;
}

export interface RestoreMismatch {
  table: string;
  /** Row count expected from the dump header. */
  expected: number;
  /** Actual row count in the database after restore. */
  actual: number;
  /** Absolute difference (actual − expected). Negative means rows are missing. */
  diff: number;
}

export interface RestoreResult {
  durationMs: number;
  totalRowsBefore: number;
  totalRowsAfter: number;
  tables: RestoreTableSummary[];
  mode: "overwrite" | "merge" | "lenient";
  /** Lenient mode only: count of INSERT statements that were skipped due to errors. */
  skippedCount?: number;
  /** Lenient mode only: first few error messages for display. */
  skippedSamples?: string[];
  /** Tables where the post-restore row count deviates from the dump's recorded
   *  count by more than RESTORE_MISMATCH_THRESHOLD. Empty array = clean restore. */
  rowMismatches: RestoreMismatch[];
  /** Lenient mode only: tables where column lists were adjusted to match live schema. */
  schemaAdjustments?: Array<{ table: string; stripped: string[]; injected: string[]; unrecoverable: string[] }>;
}

// ─────────────────────────────────────────────────────────────
// Schema-aware INSERT rewriting for lenient restore mode
// ─────────────────────────────────────────────────────────────

interface LiveColInfo {
  name: string;
  /** True when the column has IS_NULLABLE = 'YES'. */
  isNullable: boolean;
  /** True when a column_default is set (Postgres will auto-fill on omission). */
  hasDefault: boolean;
}

/**
 * Tokenise a VALUES expression of the form `(v1, v2, ...)`.
 * Handles single-quoted strings with '' escapes and nested parentheses.
 */
function splitSqlValues(parenExpr: string): string[] {
  const inner = parenExpr.slice(1, parenExpr.length - 1);
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  let inStr = false;
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (inStr) {
      current += ch;
      if (ch === "'") {
        if (inner[i + 1] === "'") { current += "'"; i += 2; continue; }
        inStr = false;
      }
      i++;
    } else if (ch === "'") {
      inStr = true; current += ch; i++;
    } else if (ch === "(") {
      depth++; current += ch; i++;
    } else if (ch === ")") {
      depth--; current += ch; i++;
    } else if (ch === "," && depth === 0) {
      tokens.push(current.trim()); current = ""; i++;
    } else {
      current += ch; i++;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

interface ParsedInsert {
  table: string;
  cols: string[];
  valuesExpr: string;
  suffix: string;
}

/** Parse `INSERT INTO "t" (c1, c2) VALUES (...) ON CONFLICT DO NOTHING` into parts. */
function parseInsertStatement(stmt: string): ParsedInsert | null {
  const headerMatch = /^INSERT\s+INTO\s+"?(\w+)"?\s*\(([^)]+)\)\s+VALUES\s*/i.exec(stmt);
  if (!headerMatch) return null;
  const table = headerMatch[1];
  const cols = headerMatch[2].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const rest = stmt.slice(headerMatch[0].length);
  // Find the VALUES (...) group using balanced-paren scan with string awareness
  let depth = 0;
  let start = -1;
  let end = -1;
  let inStr = false;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (inStr) {
      if (ch === "'" && rest[i + 1] === "'") { i++; continue; }
      if (ch === "'") inStr = false;
    } else if (ch === "'") {
      inStr = true;
    } else if (ch === "(" && depth === 0) {
      depth = 1; start = i;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (start === -1 || end === -1) return null;
  return {
    table,
    cols,
    valuesExpr: rest.slice(start, end + 1),
    suffix: rest.slice(end + 1),
  };
}

/**
 * Rewrite an INSERT statement so its column list matches the live schema.
 * - Columns in the dump that no longer exist in the live schema are dropped.
 * - Nullable columns missing from the dump are injected as NULL (safe).
 * - Columns with a server-side default that are missing from the dump are
 *   omitted entirely so Postgres fills them automatically (safe).
 * - NOT NULL / no-default columns missing from the dump are also omitted;
 *   the INSERT will still fail with a constraint error — those rows are
 *   unrecoverable and reported separately rather than silently corrupted.
 * Returns null when no rewrite is needed.
 */
function rewriteInsertForSchema(
  stmt: string,
  liveCols: LiveColInfo[],
): { rewritten: string; stripped: string[]; injected: string[]; unrecoverable: string[] } | null {
  const parsed = parseInsertStatement(stmt);
  if (!parsed) return null;

  const liveColNames = new Set(liveCols.map((c) => c.name));
  const dumpColNames = new Set(parsed.cols);

  // Columns in the dump that no longer exist in live schema → strip them.
  const stripped = parsed.cols.filter((c) => !liveColNames.has(c));

  // Live columns not in the dump, split by recoverability:
  // - nullable or has a server-side default → safe to omit (Postgres fills) or inject NULL
  // - NOT NULL and no default → NULL injection would violate the constraint; unrecoverable per row.
  const missingFromDump = liveCols.filter((c) => !dumpColNames.has(c.name));
  const injected = missingFromDump
    .filter((c) => c.isNullable && !c.hasDefault)
    .map((c) => c.name);
  const unrecoverable = missingFromDump
    .filter((c) => !c.isNullable && !c.hasDefault)
    .map((c) => c.name);

  // Only rewrite when something actually changes in the column list.
  if (stripped.length === 0 && injected.length === 0) return null;

  const values = splitSqlValues(parsed.valuesExpr);
  if (values.length !== parsed.cols.length) return null;

  const dumpValMap: Record<string, string> = {};
  for (let i = 0; i < parsed.cols.length; i++) {
    dumpValMap[parsed.cols[i]] = values[i];
  }

  const newCols: string[] = [];
  const newVals: string[] = [];
  for (const lc of liveCols) {
    if (dumpValMap[lc.name] !== undefined) {
      // Column present in both dump and live schema → keep as-is.
      newCols.push(`"${lc.name}"`);
      newVals.push(dumpValMap[lc.name]);
    } else if (lc.isNullable && !lc.hasDefault) {
      // Nullable column missing from dump → inject NULL safely.
      newCols.push(`"${lc.name}"`);
      newVals.push("NULL");
    }
    // Has a server-side default → omit; Postgres fills it automatically.
    // NOT NULL / no-default (unrecoverable) → also omit; the INSERT will still
    // fail with a constraint error, which lenient mode catches per-row.
  }

  if (newCols.length === 0) return null;

  const rewritten = `INSERT INTO "${parsed.table}" (${newCols.join(", ")}) VALUES (${newVals.join(", ")})${parsed.suffix}`;
  return { rewritten, stripped, injected, unrecoverable };
}

/**
 * Transform INSERT statements in a dump so they become
 * INSERT ... ON CONFLICT DO NOTHING — enabling merge (idempotent) restores.
 * Processes line-by-line and replaces the LAST semicolon on each INSERT line,
 * so semicolons inside quoted string values are never mistaken for the
 * statement terminator (the old regex `[^;]*?` would stop at the first `;`).
 */
function applyMergeConflictResolution(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      const upper = trimmed.toUpperCase();
      // Skip lines that already carry a conflict clause immediately before the
      // final semicolon (idempotent). We check the *tail* of the statement so
      // that string literals containing the text "on conflict" are not mistaken
      // for an actual SQL ON CONFLICT clause.
      if (/ON CONFLICT\s+DO\s+\w+\s*;[\t ]*$/i.test(line)) return line;
      if (upper.startsWith("INSERT INTO") && line.trimEnd().endsWith(";")) {
        const lastSemi = line.lastIndexOf(";");
        return line.slice(0, lastSemi) + " ON CONFLICT DO NOTHING;";
      }
      return line;
    })
    .join("\n");
}

export interface PreviewTableEntry {
  name: string;
  rowsInDump: number;
  existingRowCount?: number;
}

export interface PreviewResult {
  tableCount: number;
  tables: PreviewTableEntry[];
  unknownStatements: string[];
  mode?: "overwrite" | "merge";
}

/**
 * Parse a .sql dump produced by streamBackupSql and return a summary of what
 * a restore would do — without executing any SQL or touching the database.
 *
 * When `allowList` is provided only those tables are included in the result
 * (mirroring the selective-restore behaviour of restoreFromSql).
 */
export function previewSqlBackup(
  sql: string,
  allowList?: string[],
): PreviewResult {
  const sections = parseDumpSections(sql);

  // Row counts embedded in dump comments: "-- Table: <name>  |  rows in dump: <n>"
  const tableRowCounts = new Map<string, number>();
  const headerRe = /-- Table: (\S+)\s+\|\s+rows in dump: (\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(sql)) !== null) {
    tableRowCounts.set(m[1], parseInt(m[2], 10));
  }

  // All table names present in the dump (ordered as they appear).
  const allTables: string[] = [];
  sections.forEach((_, table) => {
    if (table) allTables.push(table);
  });

  const targetTables =
    allowList && allowList.length > 0
      ? allTables.filter((t) => allowList.includes(t))
      : allTables;

  const tables: PreviewTableEntry[] = targetTables.map((name) => {
    // Prefer the metadata comment count; fall back to counting INSERT lines.
    const block = sections.get(name) ?? "";
    const insertCount = (block.match(/^INSERT\s+INTO\s+/gim) ?? []).length;
    return {
      name,
      rowsInDump: tableRowCounts.get(name) ?? insertCount,
    };
  });

  // Collect statement keywords that are not part of a normal pg_dump output.
  const knownPrefixRe =
    /^\s*(--|\/\*|\*|INSERT\s|CREATE\s|SET\s|BEGIN\s*;|COMMIT\s*;|ROLLBACK\s*;|TRUNCATE\s|ALTER\s|DROP\s|SELECT\s|COPY\s|\\\.|\$\$)/i;
  const seenKeywords = new Set<string>();
  const unknownStatements: string[] = [];
  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (knownPrefixRe.test(trimmed)) continue;
    const keyword = trimmed.split(/\s+/)[0].toUpperCase();
    if (!seenKeywords.has(keyword)) {
      seenKeywords.add(keyword);
      unknownStatements.push(trimmed.slice(0, 120));
    }
  }

  return { tableCount: tables.length, tables, unknownStatements };
}

async function listPublicTables(): Promise<string[]> {
  const res = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  return res.rows.map((r: any) => r.table_name as string);
}

export async function countRowsPerTable(tables: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) {
    try {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${quoteIdent(t)}`);
      out[t] = r.rows[0]?.c ?? 0;
    } catch {
      out[t] = 0;
    }
  }
  return out;
}

/**
 * Parse a dump produced by streamBackupSql into per-table SQL sections.
 * Returns a map of table name → the SQL lines that belong to that table
 * (including the CREATE TABLE, INSERTs, and setval lines).
 * The preamble content (before the first table block) is stored under the
 * key "" (empty string).
 */
function parseDumpSections(sql: string): Map<string, string> {
  const sections = new Map<string, string>();

  // Each table block starts with a comment line: "-- Table: <name>  |  rows …"
  // We split on the triple-line separator that surrounds it.
  const tableHeaderRe = /-- ─+[\r\n]+-- Table: (\S+)[^\r\n]*[\r\n]+-- ─+[\r\n]*/g;

  const matches: Array<{ table: string; headerStart: number; contentStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = tableHeaderRe.exec(sql)) !== null) {
    matches.push({ table: m[1], headerStart: m.index, contentStart: m.index + m[0].length });
  }

  // Preamble (everything before the first table block)
  const preamble = matches.length > 0 ? sql.slice(0, matches[0].headerStart) : sql;
  sections.set("", preamble);

  for (let i = 0; i < matches.length; i++) {
    const { table, headerStart } = matches[i];
    const sectionEnd = i + 1 < matches.length ? matches[i + 1].headerStart : sql.length;
    sections.set(table, sql.slice(headerStart, sectionEnd));
  }

  return sections;
}

/**
 * Return the ordered list of table names present in a dump produced by
 * `streamBackupSql`. Used by the restore route to validate the caller's
 * allow-list against what is actually in the uploaded file.
 */
export function parseTablesFromDump(sql: string): string[] {
  const sections = parseDumpSections(sql);
  const tables: string[] = [];
  sections.forEach((_block, table) => {
    if (table) tables.push(table);
  });
  return tables;
}

/**
 * Count the number of INSERT statements present in each table section of a dump.
 *
 * This is the fallback source of expected row counts when a dump does not contain
 * our header metadata comments (`-- Table: <name>  |  rows in dump: N`).  It works
 * on any standards-compliant pg_dump SQL file — not just those produced by
 * streamBackupSql.
 *
 * Each line that begins with INSERT (case-insensitive, allowing for leading
 * whitespace) is counted as one row.  Multi-row VALUES lists are not produced by
 * our backup; if they exist in an external dump the count will be conservative, but
 * the caller can still use it as a lower-bound sanity check.
 *
 * Returns a Map<tableName, insertCount>.  Tables with zero INSERTs are included
 * so callers can distinguish "no INSERT lines found" from "table not in dump".
 */
export function parseDumpInsertCounts(sql: string): Map<string, number> {
  const sections = parseDumpSections(sql);
  const counts = new Map<string, number>();
  const insertLineRe = /^\s*INSERT\s+INTO\s+/im;

  sections.forEach((block, table) => {
    if (!table) return; // skip preamble
    // Count lines starting with INSERT INTO in this table's section.
    const lines = block.split("\n");
    let n = 0;
    for (const line of lines) {
      if (insertLineRe.test(line)) n++;
    }
    counts.set(table, n);
  });
  return counts;
}

// ─────────────────────────────────────────────────────────────
// Cancel support — track the active restore's Postgres backend PID
// so that a cancel request can issue pg_cancel_backend() against it.
// ─────────────────────────────────────────────────────────────

export class RestoreCancelledError extends Error {
  constructor() {
    super("RESTORE_CANCELLED");
    this.name = "RestoreCancelledError";
  }
}

interface ActiveRestoreState {
  pid: number | null;
  cancelled: boolean;
}

let _activeRestore: ActiveRestoreState | null = null;

export function getActiveRestoreState(): ActiveRestoreState | null {
  return _activeRestore;
}

export function markRestoreCancelled(): boolean {
  if (!_activeRestore) return false;
  _activeRestore.cancelled = true;
  return true;
}

/**
 * Replay an uploaded .sql backup. The dump is run inside a single
 * transaction with FK-trigger checks disabled (session_replication_role
 * = 'replica') so cross-table inserts apply in any order.
 *
 * When `allowList` is provided only those tables are TRUNCATEd and
 * re-populated; all other tables are left untouched. When it is omitted
 * (or empty) every table is overwritten — the original full-restore
 * behaviour.
 *
 * The dump's own outer BEGIN/COMMIT are stripped because Postgres does
 * not support nested transactions (a literal COMMIT inside our wrapper
 * would prematurely end the transaction).
 */
export async function restoreFromSql(
  sql: string,
  allowList?: string[],
  mode: "overwrite" | "merge" | "lenient" = "overwrite",
): Promise<RestoreResult> {
  const startedAt = Date.now();

  // Strip the outer BEGIN; / COMMIT; the dump emits — we run the whole
  // thing inside our own transaction below.
  const stripped = sql
    .replace(/^[ \t]*BEGIN\s*;[ \t]*\r?\n?/im, "")
    .replace(/COMMIT\s*;[ \t]*\r?\n?(?![\s\S]*COMMIT\s*;)/i, "");

  const tablesBefore = await listPublicTables();
  const beforeCounts = await countRowsPerTable(tablesBefore);

  // Selective mode: filter the SQL down to only the allowed table sections.
  const selective = allowList && allowList.length > 0;
  let sqlToRun = stripped;
  let tablesToClear = tablesBefore;

  if (selective) {
    const allowed = new Set(allowList!);
    const sections = parseDumpSections(stripped);
    const parts: string[] = [sections.get("") ?? ""];
    sections.forEach((block, table) => {
      if (table && allowed.has(table)) parts.push(block);
    });
    sqlToRun = parts.join("");
    tablesToClear = tablesBefore.filter((t) => allowed.has(t));
  }

  // In merge mode: skip clearing (no TRUNCATE/DELETE) and rewrite
  // INSERTs to be idempotent (ON CONFLICT DO NOTHING).
  if (mode === "merge") {
    sqlToRun = applyMergeConflictResolution(sqlToRun);
  }

  // Smoke-test log: parse statements with the proper splitter and find the
  // first INSERT to confirm ON CONFLICT DO NOTHING is intact before executing.
  {
    const stmts = splitSqlStatements(sqlToRun);
    const firstInsert = stmts.find((s) => /^INSERT\s+INTO/i.test(s));
    if (firstInsert) {
      const snippet = firstInsert.slice(0, 200);
      if (/ON\s+CONFLICT\s+DO\s+NOTHING/i.test(firstInsert)) {
        console.log("[restore] First INSERT has ON CONFLICT DO NOTHING. Snippet:", snippet);
      } else {
        console.warn("[restore] WARNING: First INSERT is missing ON CONFLICT DO NOTHING. Snippet:", snippet);
      }
    }
  }

  // ── Lenient mode: statement-by-statement, best-effort, no wrapping transaction ──
  let lenientSkippedCount = 0;
  const lenientSkippedSamples: string[] = [];
  const lenientSchemaAdjustments: Array<{ table: string; stripped: string[]; injected: string[]; unrecoverable: string[] }> = [];

  if (mode === "lenient") {
    // Pre-load live schema for all tables that appear in the dump.
    // We need column name, nullable, and default presence.
    const dumpTables = Array.from(parseDumpSections(sqlToRun).keys()).filter(Boolean);
    const liveSchemaMap = new Map<string, LiveColInfo[]>();
    if (dumpTables.length > 0) {
      try {
        const schemaRes = await pool.query<{
          table_name: string;
          column_name: string;
          is_nullable: string;
          column_default: string | null;
        }>(
          `SELECT table_name, column_name, is_nullable, column_default
             FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ANY($1)
            ORDER BY table_name, ordinal_position`,
          [dumpTables],
        );
        for (const row of schemaRes.rows) {
          if (!liveSchemaMap.has(row.table_name)) liveSchemaMap.set(row.table_name, []);
          liveSchemaMap.get(row.table_name)!.push({
            name: row.column_name,
            isNullable: row.is_nullable === "YES",
            hasDefault: row.column_default !== null,
          });
        }
      } catch (schemaErr: unknown) {
        const msg = schemaErr instanceof Error ? schemaErr.message : String(schemaErr);
        console.warn("[restore/lenient] Could not pre-load live schema — column rewriting disabled:", msg);
      }
    }

    // Track which tables have already had their schema-adjustment logged.
    const adjustedTables = new Set<string>();

    const lenientClient = await pool.connect();
    _activeRestore = { pid: null, cancelled: false };
    let lenientReplicationRoleSet = false;
    try {
      try {
        const pidRes = await lenientClient.query("SELECT pg_backend_pid() AS pid");
        if (_activeRestore) _activeRestore.pid = Number(pidRes.rows[0].pid);
      } catch {}
      // Best-effort FK suppression (non-fatal if not allowed)
      try {
        await lenientClient.query("SET session_replication_role = 'replica'");
        lenientReplicationRoleSet = true;
      } catch {}
      try { await lenientClient.query("SET CONSTRAINTS ALL DEFERRED"); } catch {}

      const stmts = splitSqlStatements(sqlToRun);
      for (const stmt of stmts) {
        if (_activeRestore?.cancelled) throw new RestoreCancelledError();

        // Attempt schema-aware rewrite for INSERT statements.
        let stmtToRun = stmt;
        if (/^INSERT\s+INTO\s+/i.test(stmt)) {
          const parsed = parseInsertStatement(stmt);
          if (parsed && liveSchemaMap.has(parsed.table)) {
            const rewriteResult = rewriteInsertForSchema(stmt, liveSchemaMap.get(parsed.table)!);
            if (rewriteResult) {
              stmtToRun = rewriteResult.rewritten;
              if (!adjustedTables.has(parsed.table)) {
                adjustedTables.add(parsed.table);
                lenientSchemaAdjustments.push({
                  table: parsed.table,
                  stripped: rewriteResult.stripped,
                  injected: rewriteResult.injected,
                  unrecoverable: rewriteResult.unrecoverable,
                });
                console.log(
                  `[restore/lenient] Schema-adjusted INSERT for table "${parsed.table}":`,
                  `stripped=[${rewriteResult.stripped.join(",")}]`,
                  `injected=[${rewriteResult.injected.join(",")}]`,
                  `unrecoverable=[${rewriteResult.unrecoverable.join(",")}]`,
                );
              }
            }
          }
        }

        const body = stmtToRun.endsWith(";") ? stmtToRun : `${stmtToRun};`;
        try {
          await lenientClient.query(body);
        } catch (stmtErr: unknown) {
          lenientSkippedCount++;
          const errMsg = stmtErr instanceof Error ? stmtErr.message : String(stmtErr);
          if (lenientSkippedSamples.length < 5) {
            const sqlSnippet = stmt.slice(0, 80).replace(/\s+/g, " ");
            lenientSkippedSamples.push(`${errMsg.slice(0, 120)} | SQL: ${sqlSnippet}…`);
          }
          console.warn("[restore/lenient] Skipped statement:", errMsg.slice(0, 200));
        }
      }
    } catch (err) {
      if (_activeRestore?.cancelled || err instanceof RestoreCancelledError) {
        // release handled in finally
        throw new RestoreCancelledError();
      }
      throw err;
    } finally {
      // Always restore session role before returning client to pool
      if (lenientReplicationRoleSet) {
        try { await lenientClient.query("SET session_replication_role = 'origin'"); } catch {}
      }
      _activeRestore = null;
      lenientClient.release();
    }
  } else {
  // ── Normal (transactional) path ───────────────────────────────────────────
  const client = await pool.connect();
  _activeRestore = { pid: null, cancelled: false };
  try {
    await client.query("BEGIN");
    // Record the Postgres backend PID so a cancel request can call pg_cancel_backend().
    try {
      const pidRes = await client.query("SELECT pg_backend_pid() AS pid");
      if (_activeRestore) _activeRestore.pid = Number(pidRes.rows[0].pid);
    } catch {}
    // Best-effort: disable FK trigger checks so cross-table inserts apply
    // in any order. Requires superuser on some managed Postgres providers;
    // ignore the error if it isn't allowed.
    let replicationRoleSet = false;
    try {
      await client.query("SET session_replication_role = 'replica'");
      replicationRoleSet = true;
    } catch {}
    try { await client.query("SET CONSTRAINTS ALL DEFERRED"); } catch {}

    // In overwrite mode, clear the target tables first.
    // In merge mode we skip this entirely — existing rows are kept.
    if (mode === "overwrite" && tablesToClear.length > 0) {
      if (selective) {
        // In selective mode we use DELETE rather than TRUNCATE so that we
        // never accidentally clear tables outside the allow-list.
        // PostgreSQL enforces FK constraints at the planning stage of TRUNCATE
        // (before triggers run), meaning TRUNCATE on a referenced table would
        // need CASCADE and could wipe unselected child tables even when
        // session_replication_role = 'replica' is set.
        // DELETE operates via trigger-based FK checks, which ARE suppressed
        // by session_replication_role = 'replica', so each selected table
        // can be cleared independently without touching anything else.
        // Sequence reset is handled by the setval statements already present
        // in the dump SQL that runs immediately after.
        for (const t of tablesToClear) {
          await client.query(`DELETE FROM ${quoteIdent(t)}`);
        }
      } else {
        // Full restore: TRUNCATE all tables at once with CASCADE — safe because
        // we are about to repopulate every table from the dump.
        const list = tablesToClear.map(quoteIdent).join(", ");
        await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
      }
    }

    await client.query(sqlToRun);

    // Hard cancellation gate: if cancel was requested while the bulk SQL
    // was executing (but pg_cancel_backend did not interrupt it), roll back
    // here before COMMIT so the database is never mutated.
    if (_activeRestore?.cancelled) {
      throw new RestoreCancelledError();
    }

    if (replicationRoleSet) {
      try { await client.query("SET session_replication_role = 'origin'"); } catch {}
    }
    await client.query("COMMIT");
  } catch (err) {
    const wasCancelled = _activeRestore?.cancelled || err instanceof RestoreCancelledError;
    try { await client.query("ROLLBACK"); } catch {}
    if (wasCancelled) {
      throw new RestoreCancelledError();
    }
    throw err;
  } finally {
    _activeRestore = null;
    client.release();
  }
  } // end of normal path

  const tablesAfter = await listPublicTables();
  const afterCounts = await countRowsPerTable(tablesAfter);

  // Build per-table expected row counts for the post-restore sanity check.
  //
  // Primary source: header comments embedded by streamBackupSql:
  //   "-- Table: <name>  |  rows in dump: <n>"
  // These are exact COUNT(*) values captured at backup time — preferred.
  //
  // Fallback source: count INSERT statements in each table's SQL section.
  // This works on any pg_dump-style file, including external/manual dumps
  // that lack our header metadata.  One INSERT line = one row (our backup
  // always emits single-row inserts; multi-row VALUES would be under-counted
  // but still provide a meaningful lower-bound sanity check).
  //
  // Tables that appear in the dump but have no header AND zero INSERT lines
  // are included with a count of 0 so mismatch logic can still flag them.
  const insertCounts = parseDumpInsertCounts(sql);
  const dumpRowCounts = new Map<string, number>();
  // First populate with INSERT counts (covers every table in the dump).
  insertCounts.forEach((n, table) => dumpRowCounts.set(table, n));
  // Then override with authoritative header metadata where present.
  {
    const headerRe = /-- Table: (\S+)\s+\|\s+rows in dump: (\d+)/g;
    let hm: RegExpExecArray | null;
    while ((hm = headerRe.exec(sql)) !== null) {
      dumpRowCounts.set(hm[1], parseInt(hm[2], 10));
    }
  }
  // Track which tables have header metadata for logging purposes.
  const tablesWithHeaderMetadata = new Set<string>();
  {
    const headerRe2 = /-- Table: (\S+)\s+\|\s+rows in dump: (\d+)/g;
    let hm2: RegExpExecArray | null;
    while ((hm2 = headerRe2.exec(sql)) !== null) {
      tablesWithHeaderMetadata.add(hm2[1]);
    }
  }

  // Configurable mismatch threshold: number of rows difference that is
  // tolerated before a table is flagged. Defaults to 0 (any deviation flagged).
  const RESTORE_MISMATCH_THRESHOLD = Math.max(
    0,
    parseInt(process.env.RESTORE_MISMATCH_THRESHOLD ?? "0", 10) || 0,
  );

  // The set of tables that were actually in scope for this restore operation.
  const restoredTableSet = selective
    ? new Set(allowList!)
    : new Set([...tablesBefore, ...tablesAfter]);

  // Summary covers all tables that existed before OR after.
  const allTables = Array.from(new Set([...tablesBefore, ...tablesAfter])).sort();
  const tables: RestoreTableSummary[] = allTables.map((t) => {
    const rowsBefore = beforeCounts[t] ?? 0;
    const rowsAfter = afterCounts[t] ?? 0;
    const delta = rowsAfter - rowsBefore;
    const rowsInDump = dumpRowCounts.get(t);
    const inScope = restoredTableSet.has(t);

    if (mode === "merge") {
      // In merge mode no rows are deleted before insert, so delta = rows actually added.
      const rowsAdded = Math.max(0, delta);
      // rowsSkipped is a display hint: rows from the dump that did not add to the count.
      // Kept as a simple derived field for the UI — NOT used for mismatch detection.
      const rowsSkipped = rowsInDump != null ? Math.max(0, rowsInDump - rowsAdded) : undefined;
      // Merge-mode mismatch: after inserting (with ON CONFLICT DO NOTHING), the table
      // must contain AT LEAST as many rows as the dump declared — because every dump
      // row either landed in the DB (rowsAdded) or conflicted with an already-existing
      // row (which is still in the DB). If rowsAfter < rowsInDump the DB has fewer rows
      // than the dump expected: rows were silently lost rather than merely skipped.
      // This formula is intentionally asymmetric and NOT self-canceling.
      const mismatch =
        inScope && rowsInDump != null
          ? rowsAfter < rowsInDump - RESTORE_MISMATCH_THRESHOLD
          : undefined;
      return { table: t, rowsBefore, rowsAfter, delta, rowsAdded, rowsSkipped, rowsInDump, mismatch };
    }

    // Overwrite mode: rowsAfter should match rowsInDump exactly (within threshold).
    const mismatch =
      inScope && rowsInDump != null
        ? Math.abs(rowsAfter - rowsInDump) > RESTORE_MISMATCH_THRESHOLD
        : undefined;
    return { table: t, rowsBefore, rowsAfter, delta, rowsInDump, mismatch };
  });

  const totalRowsBefore = tables.reduce((s, t) => s + t.rowsBefore, 0);
  const totalRowsAfter = tables.reduce((s, t) => s + t.rowsAfter, 0);

  // Collect tables where the mismatch flag is true for structured reporting.
  const rowMismatches: RestoreMismatch[] = tables
    .filter((t) => t.mismatch === true && t.rowsInDump != null)
    .map((t) => ({
      table: t.table,
      expected: t.rowsInDump!,
      actual: t.rowsAfter,
      diff: t.rowsAfter - t.rowsInDump!,
    }));

  {
    const checkedCount = tables.filter(
      (t) => t.rowsInDump != null && restoredTableSet.has(t.table),
    ).length;
    const headerCount = tablesWithHeaderMetadata.size;
    const insertFallbackCount = checkedCount - headerCount;
    const sourceNote =
      insertFallbackCount > 0
        ? `${headerCount} from header metadata, ${insertFallbackCount} from INSERT-count fallback`
        : `${headerCount} from header metadata`;

    if (rowMismatches.length > 0) {
      console.warn(
        `[restore] ⚠ Row-count mismatch on ${rowMismatches.length} table(s) after ${mode} restore` +
          ` (threshold=${RESTORE_MISMATCH_THRESHOLD}, counts source: ${sourceNote}):`,
      );
      for (const m of rowMismatches) {
        const sign = m.diff >= 0 ? "+" : "";
        console.warn(
          `[restore]   table="${m.table}"  expected=${m.expected}  actual=${m.actual}  diff=${sign}${m.diff}`,
        );
      }
    } else {
      console.log(
        `[restore] ✓ Row-count sanity check passed — ${checkedCount} table(s) checked` +
          ` within threshold=${RESTORE_MISMATCH_THRESHOLD} (${sourceNote}).`,
      );
    }
  }

  return {
    durationMs: Date.now() - startedAt,
    totalRowsBefore,
    totalRowsAfter,
    tables,
    mode,
    ...(mode === "lenient" ? {
      skippedCount: lenientSkippedCount,
      skippedSamples: lenientSkippedSamples,
      schemaAdjustments: lenientSchemaAdjustments.length > 0 ? lenientSchemaAdjustments : undefined,
    } : {}),
    rowMismatches,
  };
}

// ─────────────────────────────────────────────────────────────
// Status persistence (key/value row in `site_content`)
// ─────────────────────────────────────────────────────────────

export interface BackupHistoryEntry {
  filename: string;
  size: number;
  generatedAt: string; // ISO
  emailed: boolean;
  emailError?: string;
  gcsUploaded?: boolean;
  gcsName?: string;
  gcsError?: string;
  durationMs: number;
  alertSent: boolean;
  alertError?: string;
  /** Total rows captured across all tables in the dump. Optional for
   *  back-compat with history entries written before this field existed. */
  totalRows?: number;
  /** Number of tables included in the dump. Optional for back-compat. */
  tableCount?: number;
  /** Per-table row counts captured during this backup. Used by the next
   *  backup run to detect suspicious row drops. Optional for back-compat. */
  perTableRows?: Record<string, number>;
  /** Human-readable warnings about tables that shrank significantly since
   *  the previous backup. Empty/undefined when nothing was flagged. */
  warnings?: string[];
}

export interface BackupStatus {
  lastSuccessAt: string | null;
  lastSuccess: BackupHistoryEntry | null;
  lastError: { at: string; message: string } | null;
  history: BackupHistoryEntry[];
}

async function readStatus(): Promise<BackupStatus> {
  const [row] = await db.select().from(siteContent).where(eq(siteContent.key, STATUS_KEY));
  if (!row) {
    return { lastSuccessAt: null, lastSuccess: null, lastError: null, history: [] };
  }
  const v = row.value as any;
  return {
    lastSuccessAt: v?.lastSuccessAt ?? null,
    lastSuccess: v?.lastSuccess ?? null,
    lastError: v?.lastError ?? null,
    history: Array.isArray(v?.history) ? v.history : [],
  };
}

async function writeStatus(status: BackupStatus): Promise<void> {
  const existing = await db.select().from(siteContent).where(eq(siteContent.key, STATUS_KEY));
  if (existing.length > 0) {
    await db.update(siteContent)
      .set({ value: status as any, updatedAt: new Date() })
      .where(eq(siteContent.key, STATUS_KEY));
  } else {
    await db.insert(siteContent).values({ key: STATUS_KEY, value: status as any, updatedAt: new Date() });
  }
}

export async function getBackupStatus(): Promise<BackupStatus> {
  try {
    const status = await readStatus();
    if (!status.lastSuccess && status.history.length === 0) {
      const files = fs.existsSync(BACKUPS_DIR)
        ? fs.readdirSync(BACKUPS_DIR)
            .filter((f) => f.startsWith("mitrify-backup-") && f.endsWith(".sql"))
            .map((f) => ({ filename: f, size: fs.statSync(path.join(BACKUPS_DIR, f)).size, generatedAt: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.toISOString() }))
            .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
        : [];
      if (files.length > 0) {
        return {
          lastSuccessAt: files[0].generatedAt,
          lastSuccess: {
            filename: files[0].filename,
            size: files[0].size,
            generatedAt: files[0].generatedAt,
            emailed: false,
            durationMs: 0,
            alertSent: false,
          },
          lastError: null,
          history: files.slice(0, RETENTION).map((f) => ({
            filename: f.filename,
            size: f.size,
            generatedAt: f.generatedAt,
            emailed: false,
            durationMs: 0,
            alertSent: false,
          })),
        };
      }
    }
    return status;
  } catch {
    return { lastSuccessAt: null, lastSuccess: null, lastError: null, history: [] };
  }
}

/**
 * Append a new entry to the persisted backup history. Used by the
 * on-demand admin endpoints (browser download + GCS upload) so manual
 * backups show up in the same history table as the nightly job.
 *
 * Only metadata is stored — never any dump contents (no PII).
 */
export async function recordBackupHistory(entry: BackupHistoryEntry): Promise<void> {
  const status = await readStatus();
  status.lastSuccessAt = entry.generatedAt;
  status.lastSuccess = entry;
  status.history = [entry, ...status.history].slice(0, RETENTION);
  if (entry.emailed || entry.emailError === undefined) status.lastError = null;
  await writeStatus(status);
}

// ─────────────────────────────────────────────────────────────
// Test alert history — record every "Send test alert" attempt
// from the admin dashboard so admins have an audit trail of
// when tests were fired and whether they succeeded.
// ─────────────────────────────────────────────────────────────

const TEST_ALERT_HISTORY_KEY = "backup_test_alert_history";
const TEST_ALERT_HISTORY_LIMIT = 20;

export interface TestAlertEntry {
  at: string; // ISO timestamp
  sent: boolean;
  message: string;
  triggeredBy?: string;
}

export async function getTestAlertHistory(): Promise<TestAlertEntry[]> {
  const [row] = await db.select().from(siteContent).where(eq(siteContent.key, TEST_ALERT_HISTORY_KEY));
  if (!row) return [];
  const v = row.value as any;
  if (Array.isArray(v?.entries)) return v.entries as TestAlertEntry[];
  return [];
}

export async function recordTestAlert(entry: TestAlertEntry): Promise<TestAlertEntry[]> {
  const existing = await getTestAlertHistory();
  const next = [entry, ...existing].slice(0, TEST_ALERT_HISTORY_LIMIT);
  const payload = { entries: next } as any;
  const found = await db.select().from(siteContent).where(eq(siteContent.key, TEST_ALERT_HISTORY_KEY));
  if (found.length > 0) {
    await db.update(siteContent)
      .set({ value: payload, updatedAt: new Date() })
      .where(eq(siteContent.key, TEST_ALERT_HISTORY_KEY));
  } else {
    await db.insert(siteContent).values({ key: TEST_ALERT_HISTORY_KEY, value: payload, updatedAt: new Date() });
  }
  return next;
}

// ─────────────────────────────────────────────────────────────
// Run-now rate-limit timestamp — persisted so restarts don't
// reset the 5-minute cooldown.
//
// claimRunNowSlot() atomically checks and updates the timestamp
// inside a transaction using SELECT FOR UPDATE so that concurrent
// requests cannot both pass the cooldown check simultaneously.
// ─────────────────────────────────────────────────────────────
const RUN_NOW_KEY = "backup_run_now_at";

export async function claimRunNowSlot(
  cooldownMs: number,
): Promise<{ allowed: true } | { allowed: false; remainingSecs: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure the row exists (no-op if it was already created).
    await client.query(
      `INSERT INTO site_content (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO NOTHING`,
      [RUN_NOW_KEY, JSON.stringify({ ts: 0 })],
    );

    // Lock the row exclusively so parallel requests wait here.
    const { rows } = await client.query<{ value: { ts: number } }>(
      `SELECT value FROM site_content WHERE key = $1 FOR UPDATE`,
      [RUN_NOW_KEY],
    );

    const storedTs: number =
      typeof rows[0]?.value?.ts === "number" ? rows[0].value.ts : 0;
    const now = Date.now();
    const remaining = cooldownMs - (now - storedTs);

    if (remaining > 0) {
      await client.query("ROLLBACK");
      return { allowed: false, remainingSecs: Math.ceil(remaining / 1000) };
    }

    await client.query(
      `UPDATE site_content SET value = $2::jsonb, updated_at = NOW() WHERE key = $1`,
      [RUN_NOW_KEY, JSON.stringify({ ts: now })],
    );
    await client.query("COMMIT");
    return { allowed: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────
// Run a backup: write to disk, email, prune, persist status
// ─────────────────────────────────────────────────────────────

function makeMailer() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Google Cloud Storage helpers
// ─────────────────────────────────────────────────────────────

export function isGCSConfigured(): boolean {
  return !!(process.env.GCS_SERVICE_ACCOUNT_KEY && process.env.GCS_BUCKET_NAME);
}

function getGCSClient(): { storage: Storage; bucketName: string } | null {
  const keyJson = process.env.GCS_SERVICE_ACCOUNT_KEY;
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!keyJson || !bucketName) return null;
  try {
    // When the JSON service-account key is pasted into hosting providers
    // (Railway, Heroku, Vercel) the private_key field's newlines often get
    // mangled — either converted to literal "\n" text, double-escaped to
    // "\\n", or stripped entirely. We normalize it to real newlines before
    // handing the credentials to the Google SDK, otherwise the JWT signing
    // step fails with "invalid_grant: Invalid JWT Signature".
    const credentials = JSON.parse(keyJson);
    if (typeof credentials.private_key === "string") {
      let pk: string = credentials.private_key;
      pk = pk.replace(/\\\\n/g, "\n");
      pk = pk.replace(/\\n/g, "\n");
      if (!pk.endsWith("\n")) pk += "\n";
      credentials.private_key = pk;
    }
    const storage = new Storage({ credentials });
    return { storage, bucketName };
  } catch (err) {
    console.error("[gcs] failed to parse GCS credentials:", err);
    return null;
  }
}

/**
 * Upload a local backup file to Google Cloud Storage.
 * mode "overwrite" → always saved as mitrify-backup-latest.sql (replaces old)
 * mode "new"       → saved with the timestamped filename (keeps history)
 */
export async function uploadToGCS(
  filepath: string,
  filename: string,
  mode: "overwrite" | "new",
): Promise<{ url: string; gcsName: string }> {
  const gcs = getGCSClient();
  if (!gcs) throw new Error("GCS not configured — GCS_SERVICE_ACCOUNT_KEY / GCS_BUCKET_NAME missing");

  const { storage, bucketName } = gcs;
  const gcsName = mode === "overwrite" ? "mitrify-backup-latest.sql" : filename;

  const bucket = storage.bucket(bucketName);
  await bucket.upload(filepath, {
    destination: gcsName,
    metadata: {
      contentType: "application/sql",
      cacheControl: "no-cache",
    },
  });

  const url = `gs://${bucketName}/${gcsName}`;
  console.log(`[gcs] uploaded ${filename} → ${url} (mode: ${mode})`);
  return { url, gcsName };
}

/**
 * List backup files in the configured GCS bucket. Returns name, size, and
 * generation time. Sorted newest-first.
 */
export async function listGCSBackups(): Promise<Array<{ name: string; size: number; updated: string }>> {
  const gcs = getGCSClient();
  if (!gcs) throw new Error("GCS not configured — GCS_SERVICE_ACCOUNT_KEY / GCS_BUCKET_NAME missing");
  const { storage, bucketName } = gcs;
  const [files] = await storage.bucket(bucketName).getFiles();
  const out = files
    .filter((f) => f.name.endsWith(".sql"))
    .map((f) => ({
      name: f.name,
      size: Number(f.metadata.size ?? 0),
      updated: String(f.metadata.updated ?? f.metadata.timeCreated ?? ""),
    }))
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  return out;
}

/**
 * Download a backup file from GCS and return its SQL content as a string.
 */
export async function downloadFromGCS(gcsName: string): Promise<string> {
  const gcs = getGCSClient();
  if (!gcs) throw new Error("GCS not configured — GCS_SERVICE_ACCOUNT_KEY / GCS_BUCKET_NAME missing");
  const { storage, bucketName } = gcs;
  const file = storage.bucket(bucketName).file(gcsName);
  const [exists] = await file.exists();
  if (!exists) throw new Error(`File "${gcsName}" not found in bucket`);
  const [buf] = await file.download();
  return buf.toString("utf8");
}

function pruneOldBackups(): void {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return;
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith("mitrify-backup-") && f.endsWith(".sql"))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const old of files.slice(RETENTION)) {
      try { fs.unlinkSync(path.join(BACKUPS_DIR, old.f)); } catch {}
    }
  } catch (err) {
    console.error("[backup] prune failed:", err);
  }
}

export async function runDailyBackup(): Promise<BackupHistoryEntry> {
  const startedAt = Date.now();
  const now = new Date();
  const filename = makeBackupFilename(now);

  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const filepath = path.join(BACKUPS_DIR, filename);

  console.log(`[backup] starting nightly backup → ${filename}`);

  // Stream SQL to disk
  const stream = createWriteStream(filepath, { encoding: "utf8" });
  const writeP = (s: string) => {
    if (!stream.write(s)) {
      return new Promise<void>((resolve) => stream.once("drain", () => resolve()));
    }
  };
  // Read previous backup's per-table counts so we can flag suspicious drops
  // in this run's dump header AND on the persisted history entry.
  const prevStatus = await readStatus();
  const previousPerTable = prevStatus.lastSuccess?.perTableRows;

  let totals: {
    totalRows: number;
    tableCount: number;
    perTable: Record<string, number>;
    warnings: string[];
  } = { totalRows: 0, tableCount: 0, perTable: {}, warnings: [] };
  try {
    totals = await streamBackupSql(
      (s) => { writeP(s); },
      { filename, previousPerTable },
    );
    await new Promise<void>((resolve, reject) => {
      stream.end((err?: Error | null) => err ? reject(err) : resolve());
    });
  } catch (err: any) {
    try { stream.destroy(); } catch {}
    try { fs.unlinkSync(filepath); } catch {}
    const status = await readStatus();
    const errMsg = String(err?.message || err);
    status.lastError = { at: new Date().toISOString(), message: errMsg };
    await writeStatus(status);
    console.error("[backup] generation failed:", err);
    await sendBackupAlert({ filename, errorMessage: `Backup generation failed: ${errMsg}` });
    throw err;
  }

  let alertSent = false;
  let alertError: string | undefined;

  const size = fs.statSync(filepath).size;

  // Email it (best-effort)
  let emailed = false;
  let emailError: string | undefined;
  const transporter = makeMailer();
  const recipient = process.env.BACKUP_RECIPIENT_EMAIL || process.env.GMAIL_USER;
  if (transporter && recipient) {
    try {
      await transporter.sendMail({
        from: `"Mitrify Backup" <${process.env.GMAIL_USER}>`,
        to: recipient,
        subject: `Mitrify nightly backup — ${filename}`,
        text: `Automatic nightly database backup.\n\nFile: ${filename}\nSize: ${(size / 1024).toFixed(1)} KB\nGenerated: ${now.toISOString()}\n`,
        attachments: [{ filename, path: filepath }],
      });
      emailed = true;
      console.log(`[backup] emailed backup to ${recipient}`);
    } catch (err: any) {
      emailError = String(err?.message || err);
      console.error("[backup] email failed:", err);
    }
  } else {
    emailError = "Gmail transporter not configured (GMAIL_USER / GMAIL_APP_PASSWORD missing)";
    console.warn(`[backup] ${emailError}`);
  }

  if (!emailed && emailError) {
    const alertResult = await sendBackupAlert({
      filename,
      errorMessage: `Backup email delivery failed: ${emailError}`,
    });
    alertSent = alertResult.sent;
    alertError = alertResult.error;
  } else if (emailed) {
    // Backup + email both succeeded. Either fire a heartbeat (if explicitly
    // opted in via BACKUP_ALERT_ON_SUCCESS=true) or record an explicit
    // "no alert needed" status so the history table shows a clear label
    // instead of a bare "—" placeholder.
    if (process.env.BACKUP_ALERT_ON_SUCCESS === "true") {
      const alertResult = await sendBackupAlert({
        filename,
        successMessage: `Backup completed successfully (${(size / 1024).toFixed(1)} KB)`,
      });
      alertSent = alertResult.sent;
      alertError = alertResult.error;
    } else {
      alertError = NO_ALERT_NEEDED_MESSAGE;
    }
  }

  pruneOldBackups();

  // GCS upload (best-effort, automatic "new" mode for daily backups)
  let gcsUploaded = false;
  let gcsName: string | undefined;
  let gcsError: string | undefined;
  if (isGCSConfigured()) {
    try {
      const result = await uploadToGCS(filepath, filename, "new");
      gcsUploaded = true;
      gcsName = result.gcsName;
      console.log(`[backup] GCS upload succeeded → ${result.url}`);
    } catch (err: any) {
      gcsError = String(err?.message || err);
      console.error("[backup] GCS upload failed:", err);
    }
  }

  const entry: BackupHistoryEntry = {
    filename,
    size,
    generatedAt: now.toISOString(),
    emailed,
    emailError,
    gcsUploaded,
    gcsName,
    gcsError,
    durationMs: Date.now() - startedAt,
    alertSent,
    alertError,
    totalRows: totals.totalRows,
    tableCount: totals.tableCount,
    perTableRows: totals.perTable,
    warnings: totals.warnings.length > 0 ? totals.warnings : undefined,
  };

  const status = await readStatus();
  status.lastSuccessAt = entry.generatedAt;
  status.lastSuccess = entry;
  status.history = [entry, ...status.history].slice(0, RETENTION);
  if (emailed) status.lastError = null;
  await writeStatus(status);

  console.log(`[backup] complete in ${entry.durationMs}ms (${size} bytes, ${totals.totalRows} rows across ${totals.tableCount} tables, emailed=${emailed}, warnings=${totals.warnings.length})`);
  if (totals.warnings.length > 0) {
    for (const w of totals.warnings) console.warn(`[backup] WARNING: ${w}`);
  }
  return entry;
}

// ─────────────────────────────────────────────────────────────
// Scheduler — fire daily at 2 AM IST (Asia/Kolkata, UTC+5:30)
// ─────────────────────────────────────────────────────────────

function msUntilNext2amIST(from: Date = new Date()): number {
  // IST = UTC + 5:30; 2 AM IST = 20:30 UTC the previous day.
  const nowUtcMs = from.getTime();
  // Compute today's 20:30 UTC (which is tomorrow 02:00 IST).
  const today2amIstUtc = Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
    20, 30, 0, 0,
  );
  let target = today2amIstUtc;
  if (target <= nowUtcMs) target += 24 * 60 * 60 * 1000;
  return target - nowUtcMs;
}

let scheduled = false;
export function startBackupScheduler(): void {
  if (scheduled) return;
  scheduled = true;
  const schedule = () => {
    const delay = msUntilNext2amIST();
    const fireAt = new Date(Date.now() + delay);
    console.log(`[backup] next nightly run scheduled at ${fireAt.toISOString()} (${Math.round(delay / 60000)} min)`);
    setTimeout(async () => {
      try { await runDailyBackup(); }
      catch (err) { console.error("[backup] nightly run threw:", err); }
      finally { schedule(); }
    }, delay).unref?.();
  };
  schedule();
}

/**
 * Split a SQL string into individual statements using a character-level parser
 * that respects single-quoted strings (including '' escape sequences).
 * This prevents semicolons or newlines inside quoted values from being
 * mistakenly treated as statement boundaries.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (inString) {
      if (ch === "'") {
        // Check for escaped quote '' — consume both and stay in string
        if (sql[i + 1] === "'") {
          current += "''";
          i += 2;
          continue;
        }
        // Closing quote
        current += ch;
        inString = false;
      } else {
        current += ch;
      }
      i++;
    } else {
      if (ch === "'") {
        inString = true;
        current += ch;
        i++;
      } else if (ch === "-" && sql[i + 1] === "-") {
        // Line comment — skip to end of line
        const end = sql.indexOf("\n", i);
        i = end === -1 ? sql.length : end + 1;
      } else if (ch === ";") {
        const stmt = current.trim();
        if (stmt && stmt !== "BEGIN" && stmt !== "COMMIT") {
          statements.push(stmt);
        }
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  const remainder = current.trim();
  if (remainder && remainder !== "BEGIN" && remainder !== "COMMIT") {
    statements.push(remainder);
  }
  return statements;
}

export async function restoreBackupSql(sqlText: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const statements = splitSqlStatements(sqlText);
    for (const body of statements) {
      await client.query(body.endsWith(";") ? body : `${body};`);
    }
    await client.query("COMMIT");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    client.release();
  }
}
