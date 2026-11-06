// Mitrify AI Gateway — configuration.
//
// Everything is read from the server's environment (Render / Hostinger / VPS settings), never from
// the code or the browser. Nothing here is a secret value: only the NAMES of the variables live in
// the repository. When a variable is missing the gateway stays off, it never falls back to a default
// secret.

export const PROVIDER_IDS = ["surplus", "routerone", "siliconflow", "deepinfra", "novita", "openrouter"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number] | string;

export type ProviderStatus = "active" | "pending_approval" | "not_configured" | "invalid_config";

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  /** https base URL of the provider's OpenAI-compatible API, e.g. https://api.example.com/v1. */
  baseUrl: string | null;
  /** Upstream API key. Never logged, never returned by any endpoint. */
  apiKey: string | null;
  /** The owner confirmed this provider's terms allow this use (MITRIFY_<ID>_APPROVED=1). */
  approved: boolean;
  /**
   * The owner confirmed the provider's terms allow reselling or passing its models on to other people
   * (MITRIFY_<ID>_RESALE_APPROVED=1). Customers of the API portal are only ever routed to such providers.
   */
  resaleApproved: boolean;
  /** Requests sent to this provider at the same time. Set it from the provider's verified limit. */
  maxConcurrency: number;
  /** Requests allowed to wait for a free slot; beyond this the client gets 429. */
  maxQueue: number;
  /** Optional path for an active health probe, e.g. "/models". Empty = passive health only. */
  healthPath: string | null;
  /** Free-model calls this provider allows per day (UTC) and per minute for the whole account; null = no local count. */
  freePerDay: number | null;
  freePerMinute: number | null;
  /** Lower number = preferred when two entries cost the same. */
  priority: number;
  status: ProviderStatus;
  statusReason: string;
}

export interface GatewayConfig {
  enabled: boolean;
  hosts: string[];
  /** The owner's code, required for every admin action including creating API keys. */
  setupCode: string | null;
  setupCodeProblem: string | null;
  envKillSwitch: boolean;
  maxBodyBytes: number;
  firstByteTimeoutMs: number;
  idleTimeoutMs: number;
  totalTimeoutMs: number;
  queueTimeoutMs: number;
  maxInflight: number;
  /** Total size of the request bodies being worked on at once. Beyond it new requests are told to wait. */
  maxInflightBytes: number;
  /** Total estimated spend allowed per day (UTC) across all clients. null = not set = traffic refused. */
  globalDailyBudgetUsd: number | null;
  /** Streaming requests must ask for usage (stream_options.include_usage) so they can be billed. */
  requireStreamUsage: boolean;
  trustProxy: boolean;
  adminIps: string[];
  poolSize: number;
  /** Places in the pool always kept for paid models, behind the free ones. */
  poolPaid: number;
  /** A free model that has not started answering after this long is skipped (automatic mode). */
  freeFirstByteTimeoutMs: number;
  /** Also move on from a PAID model that failed before answering (could, rarely, run a paid job twice). */
  retryPaid: boolean;
  /** Models imported from a provider's own price list join the cheapest pool by themselves (free first). */
  autoSelect: boolean;
  /** Shortest context (tokens) an automatically chosen model may have. */
  minContext: number;
  maxPriceAgeDays: number;
  maxAttempts: number;
  keyRotationGraceHours: number;
  /** Signs API portal sign-in tokens. Without it (32+ characters) the portal accounts are off. */
  portalSecret: string | null;
  portalProblem: string | null;
  /** Extra percent added to the provider's listed price for portal customers. 0 = same price. */
  resaleMarkupPercent: number;
  /** Shown to customers as the API address. */
  publicBaseUrl: string | null;
  maxKeysPerCustomer: number;
  providers: ProviderConfig[];
}

// Fixed, documented addresses of providers whose OpenAI-compatible API address is public and stable.
// A setting in the environment still wins. Only https addresses of the provider itself belong here.
const DEFAULT_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
};

const LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  surplus: "Surplus Intelligence",
  routerone: "Router One",
  siliconflow: "SiliconFlow",
  deepinfra: "DeepInfra",
  novita: "Novita AI",
};

export const MIN_SETUP_CODE_LENGTH = 32;

type Env = Record<string, string | undefined>;

function int(env: Env, name: string, fallback: number, min = 0): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

function limitOrNull(env: Env, name: string, fallback: number | null): number | null {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n === 0 ? null : Math.floor(n);
}

function num(env: Env, name: string): number | null {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function list(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function loadProvider(env: Env, id: string, index: number): ProviderConfig {
  const up = id.toUpperCase();
  const apiKey = env[`MITRIFY_${up}_API_KEY`]?.trim() || null;
  const rawUrl = env[`MITRIFY_${up}_BASE_URL`]?.trim() || DEFAULT_BASE_URLS[id] || null;
  const approved = env[`MITRIFY_${up}_APPROVED`] === "1";
  let baseUrl: string | null = null;
  let status: ProviderStatus = "active";
  let statusReason = "ready";

  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      // Fixed, server-side destinations only, and only over TLS (certificates are verified by Node).
      if (u.protocol !== "https:" && !(env.MITRIFY_GATEWAY_ALLOW_HTTP_UPSTREAM === "1" && u.protocol === "http:")) {
        status = "invalid_config";
        statusReason = `MITRIFY_${up}_BASE_URL must start with https://`;
      } else if (u.username || u.password || u.search || u.hash) {
        status = "invalid_config";
        statusReason = `MITRIFY_${up}_BASE_URL must not contain credentials, a query or a fragment`;
      } else {
        baseUrl = u.toString().replace(/\/+$/, "");
      }
    } catch {
      status = "invalid_config";
      statusReason = `MITRIFY_${up}_BASE_URL is not a valid URL`;
    }
  }

  if (status === "active") {
    if (!apiKey || !baseUrl) {
      status = "not_configured";
      statusReason = `set MITRIFY_${up}_API_KEY and MITRIFY_${up}_BASE_URL`;
    } else if (!approved) {
      status = "pending_approval";
      statusReason = `terms not confirmed: set MITRIFY_${up}_APPROVED=1 after checking the provider's terms`;
    }
  }

  return {
    id,
    label: LABELS[id] ?? id,
    baseUrl,
    apiKey,
    approved,
    resaleApproved: env[`MITRIFY_${up}_RESALE_APPROVED`] === "1",
    // Conservative until the provider's real limit is verified and written in the environment.
    // Set these from the provider's real limit. The defaults are for a provider that takes a lot of parallel work.
    maxConcurrency: int(env, `MITRIFY_${up}_MAX_CONCURRENCY`, 32, 1),
    maxQueue: int(env, `MITRIFY_${up}_MAX_QUEUE`, 1000, 0),
    healthPath: env[`MITRIFY_${up}_HEALTH_PATH`]?.trim() || null,
    // OpenRouter: 1000 free calls a day once $10 of credit was bought (50 before), and 20 a minute. The
    // provider enforces these itself (and counts refused tries); counting here keeps requests from being
    // sent only to be refused. Set MITRIFY_<ID>_FREE_PER_DAY / _FREE_PER_MINUTE (0 = do not count).
    freePerDay: limitOrNull(env, `MITRIFY_${up}_FREE_PER_DAY`, id === "openrouter" ? 1000 : null),
    freePerMinute: limitOrNull(env, `MITRIFY_${up}_FREE_PER_MINUTE`, id === "openrouter" ? 20 : null),
    priority: int(env, `MITRIFY_${up}_PRIORITY`, index + 1, 0),
    status,
    statusReason,
  };
}

export function loadConfig(env: Env = process.env): GatewayConfig {
  const rawCode = env.MITRIFY_GATEWAY_SETUP_CODE ?? "";
  let setupCode: string | null = null;
  let setupCodeProblem: string | null = null;
  if (!rawCode) {
    setupCodeProblem = "MITRIFY_GATEWAY_SETUP_CODE is not set: admin actions and API key creation are disabled";
  } else if (rawCode.length < MIN_SETUP_CODE_LENGTH) {
    setupCodeProblem = `MITRIFY_GATEWAY_SETUP_CODE is shorter than ${MIN_SETUP_CODE_LENGTH} characters: admin actions are disabled`;
  } else {
    setupCode = rawCode;
  }

  const rawSecret = env.MITRIFY_PORTAL_SECRET ?? "";
  let portalSecret: string | null = null;
  let portalProblem: string | null = null;
  if (!rawSecret) portalProblem = "MITRIFY_PORTAL_SECRET is not set: API portal accounts are off";
  else if (rawSecret.length < MIN_SETUP_CODE_LENGTH) portalProblem = `MITRIFY_PORTAL_SECRET is shorter than ${MIN_SETUP_CODE_LENGTH} characters: API portal accounts are off`;
  else portalSecret = rawSecret;
  const markup = num(env, "MITRIFY_RESALE_MARKUP_PERCENT");

  const extra = list(env.MITRIFY_GATEWAY_EXTRA_PROVIDERS).filter((id) => /^[a-z0-9]{2,32}$/.test(id));
  const ids = [...PROVIDER_IDS, ...extra.filter((id) => !(PROVIDER_IDS as readonly string[]).includes(id))];

  return {
    enabled: env.MITRIFY_GATEWAY_ENABLED === "1",
    hosts: list(env.MITRIFY_GATEWAY_HOST || "gateway.mitrify.com"),
    setupCode,
    setupCodeProblem,
    envKillSwitch: env.MITRIFY_GATEWAY_KILL === "1",
    maxBodyBytes: int(env, "MITRIFY_GATEWAY_MAX_BODY_BYTES", 8 * 1024 * 1024, 1024),
    firstByteTimeoutMs: int(env, "MITRIFY_GATEWAY_FIRST_BYTE_TIMEOUT_MS", 120_000, 1000),
    idleTimeoutMs: int(env, "MITRIFY_GATEWAY_IDLE_TIMEOUT_MS", 120_000, 1000),
    totalTimeoutMs: int(env, "MITRIFY_GATEWAY_TOTAL_TIMEOUT_MS", 30 * 60_000, 1000),
    queueTimeoutMs: int(env, "MITRIFY_GATEWAY_QUEUE_TIMEOUT_MS", 90_000, 0),
    maxInflight: int(env, "MITRIFY_GATEWAY_MAX_INFLIGHT", 1500, 1),
    maxInflightBytes: int(env, "MITRIFY_GATEWAY_MAX_INFLIGHT_MB", 512, 1) * 1024 * 1024,
    globalDailyBudgetUsd: num(env, "MITRIFY_GATEWAY_DAILY_BUDGET_USD"),
    requireStreamUsage: env.MITRIFY_GATEWAY_REQUIRE_STREAM_USAGE !== "0",
    trustProxy: env.MITRIFY_GATEWAY_TRUST_PROXY === "1",
    adminIps: list(env.MITRIFY_GATEWAY_ADMIN_IPS),
    poolSize: int(env, "MITRIFY_GATEWAY_POOL_SIZE", 40, 1),
    poolPaid: int(env, "MITRIFY_GATEWAY_POOL_PAID", 8, 0),
    freeFirstByteTimeoutMs: int(env, "MITRIFY_GATEWAY_FREE_FIRST_BYTE_TIMEOUT_MS", 45_000, 200),
    retryPaid: env.MITRIFY_GATEWAY_RETRY_PAID === "1",
    autoSelect: env.MITRIFY_GATEWAY_AUTO_SELECT !== "0",
    minContext: int(env, "MITRIFY_GATEWAY_MIN_CONTEXT", 8000, 0),
    maxPriceAgeDays: int(env, "MITRIFY_GATEWAY_MAX_PRICE_AGE_DAYS", 30, 1),
    maxAttempts: Math.min(int(env, "MITRIFY_GATEWAY_MAX_ATTEMPTS", 5, 1), 8),
    keyRotationGraceHours: int(env, "MITRIFY_GATEWAY_KEY_ROTATION_GRACE_HOURS", 24, 0),
    portalSecret,
    portalProblem,
    resaleMarkupPercent: markup !== null && markup <= 1000 ? markup : 0,
    // null: the portal page shows the address it was opened on, plus /v1.
    publicBaseUrl: env.MITRIFY_GATEWAY_PUBLIC_URL?.trim() || null,
    maxKeysPerCustomer: int(env, "MITRIFY_PORTAL_MAX_KEYS", 5, 1),
    providers: ids.map((id, i) => loadProvider(env, id, i)),
  };
}

/** Safe view of a provider for admin screens: whether a key is set, never the key itself. */
export function describeProvider(p: ProviderConfig) {
  return {
    id: p.id,
    label: p.label,
    status: p.status,
    statusReason: p.statusReason,
    apiKeyConfigured: !!p.apiKey,
    baseUrlHost: p.baseUrl ? new URL(p.baseUrl).host : null,
    approved: p.approved,
    resaleApproved: p.resaleApproved,
    maxConcurrency: p.maxConcurrency,
    maxQueue: p.maxQueue,
    priority: p.priority,
    freePerDay: p.freePerDay,
    freePerMinute: p.freePerMinute,
  };
}
