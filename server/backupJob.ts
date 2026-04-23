import fs from "fs";
import path from "path";
import { createWriteStream } from "fs";
import nodemailer from "nodemailer";
import { Storage } from "@google-cloud/storage";
import { pool, db } from "./db";
import { siteContent } from "@shared/schema";
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
  errorMessage: string;
  dashboardUrl?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const webhookUrl = process.env.BACKUP_ALERT_WEBHOOK;
  if (!webhookUrl) return { sent: false, error: "BACKUP_ALERT_WEBHOOK not configured" };

  const { filename, errorMessage, dashboardUrl } = opts;
  const dash = dashboardUrl ?? (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}/admin`
    : "/admin");

  const lines: string[] = [
    "⚠️ *Mitrify nightly backup alert*",
    filename ? `📁 File: \`${filename}\`` : "📁 File: (not generated)",
    `❌ Error: ${errorMessage}`,
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

function sqlLiteral(val: any): string {
  if (val === null || val === undefined) return "NULL";
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
  return `'${String(val).replace(/'/g, "''")}'`;
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
export async function streamBackupSql(
  write: (s: string) => void,
  opts: { filename?: string } = {},
): Promise<void> {
  const now = new Date();
  const filename = opts.filename ?? makeBackupFilename(now);

  write(`-- Mitrify database backup\n`);
  write(`-- Generated: ${now.toISOString()}\n`);
  write(`-- Contents: 100% full snapshot of every table, every row\n`);
  write(`-- Restore: psql <connection-url> < ${filename}\n`);
  write(`\nBEGIN;\n\n`);

  const tablesRes = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  const tableNames: string[] = tablesRes.rows.map((r: any) => r.table_name);

  const BATCH = 500;

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

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS c FROM ${quoteIdent(table)}`,
    );
    const total: number = countRes.rows[0]?.c ?? 0;

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
          const vals = cols.map((c) => sqlLiteral(row[c])).join(", ");
          write(`INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${vals});\n`);
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
          const vals = cols.map((c) => sqlLiteral(row[c])).join(", ");
          write(`INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${vals});\n`);
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
}

// ─────────────────────────────────────────────────────────────
// Restore — replay an uploaded .sql backup into the database
// ─────────────────────────────────────────────────────────────

export interface RestoreTableSummary {
  table: string;
  rowsBefore: number;
  rowsAfter: number;
  delta: number;
}

export interface RestoreResult {
  durationMs: number;
  totalRowsBefore: number;
  totalRowsAfter: number;
  tables: RestoreTableSummary[];
}

export interface PreviewTableEntry {
  name: string;
  rowsInDump: number;
}

export interface PreviewResult {
  tableCount: number;
  tables: PreviewTableEntry[];
  unknownStatements: string[];
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

async function countRowsPerTable(tables: string[]): Promise<Record<string, number>> {
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
  let tablesToTruncate = tablesBefore;

  if (selective) {
    const allowed = new Set(allowList!);
    const sections = parseDumpSections(stripped);
    const parts: string[] = [sections.get("") ?? ""];
    sections.forEach((block, table) => {
      if (table && allowed.has(table)) parts.push(block);
    });
    sqlToRun = parts.join("");
    tablesToTruncate = tablesBefore.filter((t) => allowed.has(t));
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Best-effort: disable FK trigger checks so cross-table inserts apply
    // in any order. Requires superuser on some managed Postgres providers;
    // ignore the error if it isn't allowed.
    let replicationRoleSet = false;
    try {
      await client.query("SET session_replication_role = 'replica'");
      replicationRoleSet = true;
    } catch {}
    try { await client.query("SET CONSTRAINTS ALL DEFERRED"); } catch {}

    if (tablesToTruncate.length > 0) {
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
        for (const t of tablesToTruncate) {
          await client.query(`DELETE FROM ${quoteIdent(t)}`);
        }
      } else {
        // Full restore: TRUNCATE all tables at once with CASCADE — safe because
        // we are about to repopulate every table from the dump.
        const list = tablesToTruncate.map(quoteIdent).join(", ");
        await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
      }
    }

    await client.query(sqlToRun);

    if (replicationRoleSet) {
      try { await client.query("SET session_replication_role = 'origin'"); } catch {}
    }
    await client.query("COMMIT");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    client.release();
  }

  const tablesAfter = await listPublicTables();
  const afterCounts = await countRowsPerTable(tablesAfter);

  // Summary covers all tables that existed before OR after.
  const allTables = Array.from(new Set([...tablesBefore, ...tablesAfter])).sort();
  const tables: RestoreTableSummary[] = allTables.map((t) => {
    const rowsBefore = beforeCounts[t] ?? 0;
    const rowsAfter = afterCounts[t] ?? 0;
    return { table: t, rowsBefore, rowsAfter, delta: rowsAfter - rowsBefore };
  });

  const totalRowsBefore = tables.reduce((s, t) => s + t.rowsBefore, 0);
  const totalRowsAfter = tables.reduce((s, t) => s + t.rowsAfter, 0);

  return {
    durationMs: Date.now() - startedAt,
    totalRowsBefore,
    totalRowsAfter,
    tables,
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
  return readStatus();
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
    const credentials = JSON.parse(keyJson);
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
  try {
    await streamBackupSql((s) => { writeP(s); }, { filename });
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
  };

  const status = await readStatus();
  status.lastSuccessAt = entry.generatedAt;
  status.lastSuccess = entry;
  status.history = [entry, ...status.history].slice(0, RETENTION);
  if (emailed) status.lastError = null;
  await writeStatus(status);

  console.log(`[backup] complete in ${entry.durationMs}ms (${size} bytes, emailed=${emailed})`);
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

export async function restoreBackupSql(sqlText: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cleaned = sqlText.replace(/\r\n/g, "\n");
    const statements = cleaned
      .split(";\n")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));
    for (const statement of statements) {
      const body = statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim();
      if (!body || body === "BEGIN" || body === "COMMIT") continue;
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
