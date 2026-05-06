process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION — server kept alive:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION — server kept alive:", reason);
});

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "5mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.get("/health", (_req, res) => {
  const aiConfigured = !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
  res.status(200).json({ status: "ok", ai: aiConfigured ? "enabled" : "disabled" });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // Don't log response bodies for known-large/poll endpoints — they
      // include phone numbers, can be multi-MB, and are hit every ~1s.
      const skipBody = path.startsWith("/api/admin/auto-tags");
      if (capturedJsonResponse && !skipBody) {
        const body = JSON.stringify(capturedJsonResponse);
        // Cap length defensively — even endpoints we don't explicitly skip
        // shouldn't be allowed to flood logs with multi-KB blobs.
        logLine += ` :: ${body.length > 500 ? body.slice(0, 500) + `… [+${body.length - 500} chars]` : body}`;
      }

      log(logLine);
    }
  });

  next();
});

const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen(
  {
    port,
    host: "0.0.0.0",
  },
  () => {
    log(`serving on port ${port}`);
    const aiProvider = process.env.GROQ_API_KEY ? "groq" : process.env.DEEPSEEK_API_KEY ? "deepseek" : (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) ? "gemini" : null;
    if (aiProvider) {
      log(`[AI] Provider: ${aiProvider} — AI chat enabled`, "startup");
    } else {
      log(`[AI] WARNING: No AI key found. Set GROQ_API_KEY, DEEPSEEK_API_KEY, GOOGLE_API_KEY, or GEMINI_API_KEY.`, "startup");
    }
  },
);

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }
})();
