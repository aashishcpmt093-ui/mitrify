// Finds and replaces the top-level "model" value of a JSON request body, working on the raw bytes.
//
// The gateway never parses and re-serialises a request it forwards. In pinned mode the body is sent
// byte for byte. In auto-cheap mode only the bytes of the top-level "model" value are swapped; every
// other byte (whitespace, key order, number formatting, unicode escapes) stays exactly as the client
// sent it. Scanning raw UTF-8 bytes is safe because every structural JSON character is ASCII and no
// byte of a multi-byte UTF-8 sequence is below 0x80.

export class JsonScanError extends Error {}

const WS = new Set([0x20, 0x09, 0x0a, 0x0d]);

function skipWs(buf: Uint8Array, i: number): number {
  while (i < buf.length && WS.has(buf[i])) i++;
  return i;
}

/** Index just past the closing quote of the string that starts at i. */
function skipString(buf: Uint8Array, i: number): number {
  if (buf[i] !== 0x22) throw new JsonScanError("expected a string");
  i++;
  while (i < buf.length) {
    const c = buf[i];
    if (c === 0x5c) {
      i += 2;
      continue;
    }
    if (c === 0x22) return i + 1;
    i++;
  }
  throw new JsonScanError("unterminated string");
}

/** Index just past the value that starts at i (object, array, string or literal). */
function skipValue(buf: Uint8Array, i: number): number {
  const c = buf[i];
  if (c === 0x22) return skipString(buf, i);
  if (c === 0x7b || c === 0x5b) {
    let depth = 0;
    while (i < buf.length) {
      const d = buf[i];
      if (d === 0x22) {
        i = skipString(buf, i);
        continue;
      }
      if (d === 0x7b || d === 0x5b) depth++;
      else if (d === 0x7d || d === 0x5d) {
        depth--;
        if (depth === 0) return i + 1;
      }
      i++;
    }
    throw new JsonScanError("unterminated object or array");
  }
  const start = i;
  while (i < buf.length && !WS.has(buf[i]) && buf[i] !== 0x2c && buf[i] !== 0x7d && buf[i] !== 0x5d) i++;
  if (i === start) throw new JsonScanError("expected a value");
  return i;
}

export interface ModelSpan {
  start: number;
  end: number;
}

/**
 * Byte span of the top-level "model" value, or null when the key is absent.
 * Throws on a malformed body or on more than one top-level "model" key (ambiguous).
 */
export function findTopLevelModel(buf: Uint8Array): ModelSpan | null {
  let i = skipWs(buf, 0);
  if (buf[i] !== 0x7b) throw new JsonScanError("the body must be a JSON object");
  i++;
  let found: ModelSpan | null = null;
  for (;;) {
    i = skipWs(buf, i);
    if (buf[i] === 0x7d) break;
    const keyStart = i;
    i = skipString(buf, i);
    const key = JSON.parse(Buffer.from(buf.subarray(keyStart, i)).toString("utf8")) as string;
    i = skipWs(buf, i);
    if (buf[i] !== 0x3a) throw new JsonScanError("expected ':'");
    i = skipWs(buf, i + 1);
    const valueStart = i;
    i = skipValue(buf, i);
    if (key === "model") {
      if (found) throw new JsonScanError('more than one top-level "model" key');
      found = { start: valueStart, end: i };
    }
    i = skipWs(buf, i);
    if (buf[i] === 0x2c) {
      i++;
      continue;
    }
    if (buf[i] === 0x7d) break;
    throw new JsonScanError("expected ',' or '}'");
  }
  if (skipWs(buf, i + 1) !== buf.length) throw new JsonScanError("unexpected data after the JSON object");
  return found;
}

/** A copy of the body with only the top-level "model" value replaced. */
export function replaceTopLevelModel(buf: Buffer, newModel: string): Buffer {
  const span = findTopLevelModel(buf);
  if (!span) throw new JsonScanError('the body has no top-level "model"');
  return Buffer.concat([buf.subarray(0, span.start), Buffer.from(JSON.stringify(newModel), "utf8"), buf.subarray(span.end)]);
}
