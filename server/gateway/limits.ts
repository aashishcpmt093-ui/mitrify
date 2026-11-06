// Concurrency slots with a bounded queue, circuit breakers, per-client rate limits and the lockout
// that protects the setup code from guessing. All in memory: they reset when the process restarts,
// which errs on the side of letting traffic through again, never of leaking access.

export class QueueFullError extends Error {
  constructor(readonly retryAfterSec: number) {
    super("queue full");
  }
}

export class QueueTimeoutError extends Error {
  constructor(readonly retryAfterSec: number) {
    super("queue timeout");
  }
}

interface Waiter {
  resolve: () => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout | null;
  onAbort: () => void;
  signal?: AbortSignal;
}

export class Semaphore {
  private active = 0;
  private waiters: Waiter[] = [];

  constructor(
    private max: number,
    private maxQueue: number,
    private queueTimeoutMs: number,
  ) {}

  get inUse() {
    return this.active;
  }
  get queued() {
    return this.waiters.length;
  }
  /** A request could start right now, without waiting. */
  get hasSlot() {
    return this.active < this.max;
  }
  /** True when a request could start right now or join the queue. */
  get hasRoom() {
    return this.active < this.max || this.waiters.length < this.maxQueue;
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return this.releaser();
    }
    if (this.waiters.length >= this.maxQueue) throw new QueueFullError(Math.max(1, Math.ceil(this.queueTimeoutMs / 1000)));
    await new Promise<void>((resolve, reject) => {
      const w: Waiter = {
        resolve,
        reject,
        timer: null,
        signal,
        onAbort: () => {
          this.drop(w);
          reject(new Error("aborted"));
        },
      };
      w.timer = setTimeout(() => {
        this.drop(w);
        reject(new QueueTimeoutError(Math.max(1, Math.ceil(this.queueTimeoutMs / 1000))));
      }, this.queueTimeoutMs);
      signal?.addEventListener("abort", w.onAbort, { once: true });
      this.waiters.push(w);
    });
    return this.releaser();
  }

  private drop(w: Waiter) {
    const i = this.waiters.indexOf(w);
    if (i >= 0) this.waiters.splice(i, 1);
    if (w.timer) clearTimeout(w.timer);
    w.signal?.removeEventListener("abort", w.onAbort);
  }

  private releaser() {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.waiters.shift();
      if (next) {
        if (next.timer) clearTimeout(next.timer);
        next.signal?.removeEventListener("abort", next.onAbort);
        next.resolve(); // the slot passes straight to the next waiter
      } else {
        this.active--;
      }
    };
  }
}

/** Opens after `threshold` consecutive failures, lets one trial request through after `cooldownMs`. */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private trialInFlight = false;

  constructor(
    private threshold = 5,
    private cooldownMs = 60_000,
    private now: () => number = Date.now,
  ) {}

  get state(): "closed" | "open" | "half_open" {
    if (this.failures < this.threshold) return "closed";
    return this.now() - this.openedAt >= this.cooldownMs ? "half_open" : "open";
  }

  /** May a request be sent now? Reserves the single half-open trial. */
  allow(): boolean {
    const s = this.state;
    if (s === "closed") return true;
    if (s === "half_open" && !this.trialInFlight) {
      this.trialInFlight = true;
      return true;
    }
    return false;
  }

  /** Is the provider usable, without reserving anything (for choosing a route). */
  available(): boolean {
    const s = this.state;
    return s === "closed" || (s === "half_open" && !this.trialInFlight);
  }

  /** Gives back a reserved half-open trial without counting a result (nothing was sent). */
  release() {
    this.trialInFlight = false;
  }

  success() {
    this.failures = 0;
    this.trialInFlight = false;
  }

  failure() {
    this.trialInFlight = false;
    this.failures++;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }
}

/** Requests per minute per client, as a token bucket. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private now: () => number = Date.now) {}

  take(id: string, perMinute: number): { ok: boolean; retryAfterSec: number } {
    const t = this.now();
    const b = this.buckets.get(id) ?? { tokens: perMinute, at: t };
    b.tokens = Math.min(perMinute, b.tokens + ((t - b.at) / 60_000) * perMinute);
    b.at = t;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      this.buckets.set(id, b);
      return { ok: true, retryAfterSec: 0 };
    }
    this.buckets.set(id, b);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(((1 - b.tokens) / perMinute) * 60)) };
  }
}

/**
 * Locks out guessing of the setup code: 5 wrong tries from one address lock that address for
 * 15 minutes; 20 wrong tries in an hour from anywhere lock all admin actions for an hour.
 */
export class Lockout {
  private perIp = new Map<string, { count: number; until: number; first: number }>();
  private global: number[] = [];
  private globalUntil = 0;

  constructor(
    private now: () => number = Date.now,
    private ipMax = 5,
    private ipLockMs = 15 * 60_000,
    private globalMax = 20,
    private globalLockMs = 60 * 60_000,
  ) {}

  blocked(ip: string): number {
    const t = this.now();
    if (this.globalUntil > t) return this.globalUntil - t;
    const r = this.perIp.get(ip);
    return r && r.until > t ? r.until - t : 0;
  }

  fail(ip: string) {
    const t = this.now();
    const r = this.perIp.get(ip) ?? { count: 0, until: 0, first: t };
    if (t - r.first > this.ipLockMs) {
      r.count = 0;
      r.first = t;
    }
    r.count++;
    if (r.count >= this.ipMax) {
      r.until = t + this.ipLockMs;
      r.count = 0;
      r.first = t;
    }
    this.perIp.set(ip, r);
    this.global = this.global.filter((x) => t - x < 60 * 60_000);
    this.global.push(t);
    if (this.global.length >= this.globalMax) {
      this.globalUntil = t + this.globalLockMs;
      this.global = [];
    }
  }

  succeed(ip: string) {
    this.perIp.delete(ip);
  }
}
