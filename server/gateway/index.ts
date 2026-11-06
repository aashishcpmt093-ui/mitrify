import type { IncomingMessage, ServerResponse } from "http";
import { loadConfig, type GatewayConfig } from "./config";
import { Gateway } from "./gateway";
import { hostOf, sendError } from "./http";
import { PgStore } from "./pgStore";
import type { GatewayStore } from "./store";

// Mounts the gateway on the existing Mitrify server, before any body parser or request logger.
//
// It only answers requests whose Host is the gateway host (gateway.mitrify.com). Every other request
// goes on to the marketplace untouched, and a request to the gateway host never reaches marketplace
// routes. With MITRIFY_GATEWAY_ENABLED unset, this adds nothing at all.

type Next = (err?: unknown) => void;

export function createGatewayMiddleware(opts: { config?: GatewayConfig; store?: GatewayStore } = {}) {
  const config = opts.config ?? loadConfig();
  if (!config.enabled) {
    return (_req: IncomingMessage, _res: ServerResponse, next: Next) => next();
  }

  let gateway: Gateway | null = null;
  const start = async () => {
    const store = opts.store ?? new PgStore((await import("../db")).pool);
    const gw = new Gateway(config, store);
    await gw.start();
    await gw.refreshIfRulesChanged();
    await gw.refreshCatalogIfDue();
    // Daily pool refresh (checked hourly) and optional active health probes every 5 minutes.
    setInterval(() => void gw.refreshCatalogIfDue(), 60 * 60_000).unref();
    setInterval(() => {
      for (const p of config.providers) if (p.status === "active" && p.healthPath) void gw.probeProvider(p);
    }, 5 * 60_000).unref();
    gateway = gw;
    const active = config.providers.filter((p) => p.status === "active").map((p) => p.id);
    console.log(
      `[gateway] ready on ${config.hosts.join(", ")}; active providers: ${active.join(", ") || "none"}` +
        (config.setupCode ? "" : `; ${config.setupCodeProblem}`),
    );
  };
  // If the database is not reachable at boot, keep the marketplace running and try again every 30 s.
  let ready: Promise<void>;
  const attempt = (): Promise<void> =>
    start().catch((e) => {
      console.error("[gateway] could not start (gateway requests get 503), retrying in 30 s:", (e as Error).message);
      setTimeout(() => {
        ready = attempt();
      }, 30_000).unref();
    });
  ready = attempt();

  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    // Two paths are answered on ANY host, so no new address has to be set up first:
    //  - /portal-api: what the API portal page (mitrify.com/?portal=api) calls;
    //  - /v1: the OpenAI-compatible API itself (https://mitrify.com/v1), which always needs an API key.
    // Everything else (the admin paths, /healthz) is answered only on the gateway host, and the
    // marketplace keeps all its own paths.
    const path = (req.url ?? "/").split("?")[0];
    const anywhere = path === "/portal-api" || path.startsWith("/portal-api/") || path === "/v1" || path.startsWith("/v1/");
    if (!anywhere && !config.hosts.includes(hostOf(req))) return next();
    void (async () => {
      await ready;
      if (!gateway) return sendError(res, 503, "gateway_unavailable", "The gateway is starting or its database is unreachable. See the server log.");
      await gateway.handle(req, res);
    })();
  };
}
