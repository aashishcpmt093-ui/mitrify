// Frontend-only mode.
// The Express backend is not deployed. Every same-origin request to /api/* or
// /health is answered in the browser so no request leaves the page and no
// error banner or retry loop appears. Set BACKEND_ENABLED to true to restore
// the normal fetch behaviour once the server is deployed again.
export const BACKEND_ENABLED = false;

if (!BACKEND_ENABLED && typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);

  const isBackendPath = (input: RequestInfo | URL): boolean => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    try {
      const url = new URL(raw, window.location.origin);
      // The clinic AI route runs on the server without the database, so it is allowed through.
      if (url.pathname.startsWith("/api/clinic-ai/")) return false;
      return url.origin === window.location.origin && (url.pathname.startsWith("/api/") || url.pathname === "/health");
    } catch {
      return false;
    }
  };

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isBackendPath(input)) return originalFetch(input, init);

    const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    if (path.includes("/health")) {
      return Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    // 404 keeps every existing `if (!res.ok)` branch on its normal fallback path
    // and stops react-query from retrying.
    return Promise.resolve(new Response(JSON.stringify({ message: "Backend disabled" }), { status: 404, headers: { "Content-Type": "application/json" } }));
  };
}
