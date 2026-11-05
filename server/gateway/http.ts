import type { IncomingMessage, ServerResponse } from "http";

// Small HTTP helpers. The gateway reads request bodies itself, as raw bytes, so the body that is
// forwarded is exactly the body that arrived.

export class BodyTooLargeError extends Error {}

export function readRawBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      req.resume();
      reject(new BodyTooLargeError());
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on("data", (c: Buffer) => {
      if (failed) return;
      size += c.length;
      if (size > limit) {
        failed = true;
        reject(new BodyTooLargeError());
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => !failed && resolve(Buffer.concat(chunks)));
    req.on("error", (e) => !failed && reject(e));
  });
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
    "cache-control": "no-store",
    ...headers,
  });
  res.end(data);
}

/** An error produced by Mitrify itself (not by the upstream), in the OpenAI error shape. */
export function sendError(
  res: ServerResponse,
  status: number,
  type: string,
  message: string,
  headers: Record<string, string> = {},
) {
  sendJson(res, status, { error: { type, message, source: "mitrify" } }, { "x-mitrify-error": type, ...headers });
}

export function hostOf(req: IncomingMessage): string {
  return String(req.headers.host ?? "")
    .toLowerCase()
    .replace(/:\d+$/, "");
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}
