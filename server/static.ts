import express, { type Express, type Request } from "express";
import fs from "fs";
import path from "path";
import { CLINIC_NAME, PORTAL_KEYS } from "@shared/clinic";

// Clinic portals (patients./staff./doctors. or ?portal=) must not reveal the main site, so
// their HTML drops its title, description, share-preview tags, icons and manifest.
const BRANDED_TAG = /<(?:meta|link)\b[^>]*(?:og:|name="description"|apple-mobile-web-app-title|rel="icon"|rel="manifest"|apple-touch-icon)[^>]*>\s*/g;

function clinicHtml(html: string): string {
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${CLINIC_NAME}</title>`)
    .replace(BRANDED_TAG, "")
    .replace("</head>", `<link rel="icon" type="image/svg+xml" href="/clinic-icon.svg" />\n</head>`);
}

function isPortalRequest(req: Request): boolean {
  const keys: readonly string[] = PORTAL_KEYS;
  return keys.includes(req.hostname.split(".")[0]) || keys.includes(String(req.query.portal ?? ""));
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const indexHtml = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");
  const portalHtml = clinicHtml(indexHtml);

  // index: false so "/" reaches the handler below and portals get their own HTML.
  app.use(express.static(distPath, { index: false }));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (req, res) => {
    res.type("html").send(isPortalRequest(req) ? portalHtml : indexHtml);
  });
}
