import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

// Mitrify API portal. One small page for two kinds of people:
//  * a customer: sees credit, creates API keys, sees usage;
//  * the owner: enters the setup code, creates customer accounts and adds credit.
// Everything is checked on the server. The customer's sign-in token lives in this tab only
// (sessionStorage), and the owner's setup code is never stored anywhere, only held while this page is open.

type Obj = Record<string, any>;
const TOKEN_KEY = "mitrify_api_token";

class ApiError extends Error {}

async function call(path: string, o: { token?: string; code?: string; method?: string; body?: unknown } = {}): Promise<Obj> {
  const res = await fetch(`/portal-api${path}`, {
    method: o.method ?? (o.body === undefined ? "GET" : "POST"),
    headers: {
      "content-type": "application/json",
      ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
      ...(o.code ? { "x-mitrify-setup-code": o.code } : {}),
    },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  const text = await res.text();
  let data: Obj = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError("The API portal is not switched on on this server yet.");
  }
  if (!res.ok) throw new ApiError(data?.error?.message || data?.message || `Something went wrong (${res.status}).`);
  return data;
}

const usd = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "unknown";
  const parts = (Math.abs(n) >= 1 ? n.toFixed(4) : n.toFixed(6)).split(".");
  // At least two decimals, no useless trailing zeros: 2.50, 0.003, 0.000012.
  const decimals = (parts[1] ?? "").replace(/0+$/, "").padEnd(2, "0");
  return (n < 0 ? "-$" : "$") + parts[0].replace("-", "") + "." + decimals;
};
const when = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");

function copy(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    /* the text is visible on screen, it can still be copied by hand */
  }
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card text-card-foreground p-4 space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const input = "w-full rounded-md border bg-background px-3 py-2 text-base";
const btn = "rounded-md bg-indigo-600 px-4 py-2 text-white text-base font-medium disabled:opacity-50";
const btn2 = "rounded-md border px-3 py-1.5 text-sm";

function Notice({ kind, children }: { kind: "error" | "ok"; children: ReactNode }) {
  return (
    <p className={`rounded-md px-3 py-2 text-sm ${kind === "error" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`} role="status">
      {children}
    </p>
  );
}

function Secret({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border-2 border-amber-400 bg-amber-50 text-amber-950 p-3 space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <code className="block break-all text-sm select-all">{value}</code>
      <button className={btn2} onClick={() => copy(value)}>
        Copy
      </button>
    </div>
  );
}

// ── Customer ─────────────────────────────────────────────────────────────────────────────────────

function Customer({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [me, setMe] = useState<Obj | null>(null);
  const [keys, setKeys] = useState<Obj[]>([]);
  const [usage, setUsage] = useState<Obj | null>(null);
  const [hours, setHours] = useState(24);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [newKey, setNewKey] = useState("");
  const [keyName, setKeyName] = useState("");
  const [budget, setBudget] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");

  const load = useCallback(async () => {
    try {
      const [m, k, u] = await Promise.all([call("/me", { token }), call("/keys", { token }), call(`/usage?hours=${hours}`, { token })]);
      setMe(m);
      setKeys(k.keys);
      setUsage(u);
      setErr("");
    } catch (e) {
      if ((e as Error).message.includes("sign in again")) onSignOut();
      else setErr((e as Error).message);
    }
  }, [token, hours, onSignOut]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setErr("");
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (!me) return <p className="text-muted-foreground">{err || "Loading..."}</p>;
  const example = `curl ${me.apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"mitrify/auto-cheap","messages":[{"role":"user","content":"Hello"}]}'`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground break-all">{me.email}</p>
        <button className={btn2} onClick={onSignOut}>
          Sign out
        </button>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}

      <Card title="Credit">
        <p className="text-3xl font-semibold">{usd(me.balanceUsd)}</p>
        {me.balanceUsd <= 0 && <Notice kind="error">No credit left. Ask the owner to add credit, then your keys work again.</Notice>}
        <p className="text-sm text-muted-foreground">
          You pay the provider's listed price for the tokens you use{me.markupPercent ? `, plus ${me.markupPercent}%` : ", with no markup"}. Every request is listed below.
        </p>
      </Card>

      <Card title="Connect">
        <p className="text-sm">API address (OpenAI-compatible)</p>
        <code className="block break-all rounded bg-muted p-2 text-sm select-all">{me.apiBaseUrl}</code>
        <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{example}</pre>
        <p className="text-sm text-muted-foreground">
          Use <b>mitrify/auto-cheap</b> to let Mitrify pick the cheapest model, or send a model name from <code>/models</code>. For streaming, also send{" "}
          <code>"stream_options": {"{"}"include_usage": true{"}"}</code> so the cost can be counted.
        </p>
      </Card>

      <Card title={`API keys (${keys.filter((k) => !k.revokedAt).length}/${me.keyLimit})`}>
        {newKey && <Secret label="Your new key. It is shown only once. Copy it now and keep it secret." value={newKey} />}
        <ul className="space-y-2">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
              <span className="min-w-0">
                <b>{k.name}</b> <code className="text-xs">{k.keyPrefix}…</code>
                <br />
                <span className="text-xs text-muted-foreground">
                  {k.revokedAt ? "Revoked" : `Last used ${when(k.lastUsedAt)}`}
                  {k.dailyBudgetUsd ? ` · limit ${usd(k.dailyBudgetUsd)}/day` : ""}
                </span>
              </span>
              {!k.revokedAt && (
                <button
                  className={btn2}
                  onClick={() => confirm(`Revoke "${k.name}"? Apps using it stop working at once.`) && run(async () => {
                    await call(`/keys/${k.id}/revoke`, { token, method: "POST", body: {} });
                    await load();
                  })}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
          {!keys.length && <li className="text-sm text-muted-foreground">No keys yet.</li>}
        </ul>
        <form
          className="space-y-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(async () => {
              const r = await call("/keys", { token, body: { name: keyName, dailyBudgetUsd: budget === "" ? null : Number(budget) } });
              setNewKey(r.key);
              setKeyName("");
              setBudget("");
              await load();
            });
          }}
        >
          <input className={input} placeholder="Key name, e.g. my-app" value={keyName} onChange={(e) => setKeyName(e.target.value)} maxLength={60} required />
          <input className={input} placeholder="Daily limit in $ (optional)" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <button className={btn} type="submit">
            Create key
          </button>
        </form>
      </Card>

      <Card title="Usage">
        <div className="flex gap-2">
          {[24, 168, 720].map((h) => (
            <button key={h} className={`${btn2} ${hours === h ? "bg-indigo-600 text-white" : ""}`} onClick={() => setHours(h)}>
              {h === 24 ? "24 hours" : h === 168 ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
        {usage && (
          <>
            <p className="text-sm">
              Charged: <b>{usd(usage.chargedUsd)}</b> · {usage.rows.length} requests
              {usage.requestsWithUnknownCost > 0 && ` · ${usage.requestsWithUnknownCost} with unknown cost (not charged)`}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="py-1 pr-2">Time</th>
                    <th className="pr-2">Model</th>
                    <th className="pr-2">In</th>
                    <th className="pr-2">Out</th>
                    <th className="pr-2">Charged</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.rows.map((r: Obj) => (
                    <tr key={r.requestId} className="border-b align-top">
                      <td className="py-1 pr-2 whitespace-nowrap">{when(r.at)}</td>
                      <td className="pr-2 break-all">{r.model}</td>
                      <td className="pr-2">{r.inputTokens ?? "?"}</td>
                      <td className="pr-2">{r.outputTokens ?? "?"}</td>
                      <td className="pr-2 whitespace-nowrap">{usd(r.chargedUsd)}</td>
                      <td>{r.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card title="Change password">
        <form
          className="space-y-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(async () => {
              await call("/password", { token, body: { current: cur, next } });
              setCur("");
              setNext("");
              setMsg("Password changed.");
            });
          }}
        >
          <input className={input} type="password" placeholder="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
          <input className={input} type="password" placeholder="New password (10+ characters)" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
          <button className={btn} type="submit">
            Change password
          </button>
        </form>
      </Card>
    </div>
  );
}

// ── Owner: prices and models ─────────────────────────────────────────────────────────────────────

function Prices({ code, providers }: { code: string; providers: Obj[] }) {
  const [prices, setPrices] = useState<Obj[]>([]);
  const [pool, setPool] = useState<Obj[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [f, setF] = useState({ provider: "", model: "", input: "", output: "", cached: "", url: "" });

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([call("/owner/prices", { code }), call("/owner/catalog", { code })]);
      setPrices(p.prices);
      setPool(c.entries ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [code]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const m = await fn();
      if (m) setMsg(m);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const importer = providers.find((p) => p.id === "openrouter" && p.status === "active");
  const needle = q.trim().toLowerCase();
  const shown = prices
    .filter((p) => !needle || `${p.provider} ${p.upstreamModel}`.toLowerCase().includes(needle))
    .sort((a, b) => a.inputPerMTokUsd + a.outputPerMTokUsd - (b.inputPerMTokUsd + b.outputPerMTokUsd))
    .slice(0, 40);
  // The box changes at once; if the server refuses, the list is reloaded and the box goes back.
  const flag = (p: Obj, key: "enabled" | "qualityPassed", value: boolean) => {
    setPrices((prev) => prev.map((x) => (x.provider === p.provider && x.upstreamModel === p.upstreamModel ? { ...x, [key]: value } : x)));
    return run(async () => void (await call("/owner/prices/flags", { code, body: { provider: p.provider, upstreamModel: p.upstreamModel, [key]: value } })));
  };

  return (
    <Card title={`Prices and models (${prices.length})`}>
      {err && <Notice kind="error">{err}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}
      <p className="text-sm text-muted-foreground">
        <b>On</b>: the model can be called and is listed. <b>Pool</b>: you checked its quality, so "cheapest" may choose it. Prices are dollars per 1 million tokens.
      </p>
      <div className="flex flex-wrap gap-2">
        {importer && (
          <button
            className={btn2}
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await call("/owner/prices/import", { code, body: { provider: "openrouter" } });
                return `OpenRouter: ${r.added} new models (switched off), ${r.updated} updated.`;
              })
            }
          >
            Import prices from OpenRouter
          </button>
        )}
        <button
          className={btn2}
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await call("/owner/catalog/refresh", { code, body: {} });
              return `Cheapest pool rebuilt: ${r.entries.length} models.`;
            })
          }
        >
          Rebuild cheapest pool
        </button>
      </div>

      {pool.length > 0 && (
        <div className="rounded border p-2 text-xs space-y-1">
          <p className="font-medium">Cheapest pool today</p>
          {pool.map((e: Obj) => (
            <p key={`${e.provider}/${e.upstreamModel}`} className="break-all">
              {e.upstreamModel} · {e.provider} · {usd(e.blendedPerMTokUsd)}
            </p>
          ))}
        </div>
      )}

      <input className={input} placeholder="Search models (name or provider)" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="space-y-2">
        {shown.map((p) => (
          <li key={`${p.provider}/${p.upstreamModel}`} className="rounded border p-2 text-sm">
            <p className="break-all font-medium">{p.upstreamModel}</p>
            <p className="text-xs text-muted-foreground">
              {p.provider} · in {usd(p.inputPerMTokUsd)} · out {usd(p.outputPerMTokUsd)}
            </p>
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!p.enabled} disabled={busy} onChange={(e) => flag(p, "enabled", e.target.checked)} /> On
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!p.qualityPassed} disabled={busy} onChange={(e) => flag(p, "qualityPassed", e.target.checked)} /> Pool
              </label>
            </div>
          </li>
        ))}
        {!shown.length && <li className="text-sm text-muted-foreground">{prices.length ? "No model matches." : "No prices yet. Import them, or add one by hand."}</li>}
      </ul>
      {prices.length > shown.length && <p className="text-xs text-muted-foreground">Showing the cheapest {shown.length}. Type in the search box to find others.</p>}

      <button className="text-sm underline" onClick={() => setManual(!manual)}>
        {manual ? "Hide" : "Add a price by hand"}
      </button>
      {manual && (
        <form
          className="space-y-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(async () => {
              await call("/owner/prices", {
                code,
                method: "PUT",
                body: {
                  provider: f.provider,
                  upstreamModel: f.model.trim(),
                  inputPerMTokUsd: Number(f.input),
                  outputPerMTokUsd: Number(f.output),
                  cachedInputPerMTokUsd: f.cached === "" ? null : Number(f.cached),
                  sourceUrl: f.url.trim(),
                  verifiedAt: new Date().toISOString().slice(0, 10),
                  enabled: false,
                  qualityPassed: false,
                },
              });
              setF({ ...f, model: "", input: "", output: "", cached: "" });
              return "Saved, switched off. Turn it On in the list when you are ready.";
            });
          }}
        >
          <select className={input} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} required>
            <option value="">Provider...</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input className={input} placeholder="Model name, exactly as the provider writes it" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} required />
          <input className={input} placeholder="Input price, $ per 1M tokens" inputMode="decimal" value={f.input} onChange={(e) => setF({ ...f, input: e.target.value })} required />
          <input className={input} placeholder="Output price, $ per 1M tokens" inputMode="decimal" value={f.output} onChange={(e) => setF({ ...f, output: e.target.value })} required />
          <input className={input} placeholder="Cached input price (optional)" inputMode="decimal" value={f.cached} onChange={(e) => setF({ ...f, cached: e.target.value })} />
          <input className={input} type="url" placeholder="Link of the provider's official price page (https://...)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} required />
          <button className={btn} type="submit" disabled={busy}>
            Save price
          </button>
        </form>
      )}
    </Card>
  );
}

// ── Owner ────────────────────────────────────────────────────────────────────────────────────────

function Owner({ code, onLeave }: { code: string; onLeave: () => void }) {
  const [status, setStatus] = useState<Obj | null>(null);
  const [customers, setCustomers] = useState<Obj[]>([]);
  const [err, setErr] = useState("");
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [ledger, setLedger] = useState<{ id: string; entries: Obj[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([call("/owner/status", { code }), call("/owner/customers", { code })]);
      setStatus(s);
      setCustomers(c.customers);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [code]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setErr("");
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Owner</p>
        <button className={btn2} onClick={onLeave}>
          Leave
        </button>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      {secret && <Secret label={secret.label} value={secret.value} />}

      {status && (
        <Card title="Gateway">
          <p className="text-sm">
            Spent today: <b>{usd(status.spentTodayUsd)}</b> of {status.dailyBudgetUsd === null ? "no budget set" : usd(status.dailyBudgetUsd)}
          </p>
          <ul className="space-y-1 text-sm">
            {status.providers.map((p: Obj) => (
              <li key={p.id}>
                <b>{p.label}</b>: {p.status.replace("_", " ")}
                {p.disabledByAdmin ? " (switched off)" : ""} · resale {p.resaleApproved ? "approved" : "not approved"}
              </li>
            ))}
          </ul>
          <button
            className={status.killSwitch.admin ? btn : `${btn2} border-red-500 text-red-700`}
            onClick={() =>
              confirm(status.killSwitch.admin ? "Switch the gateway back on?" : "Switch the whole gateway OFF? All API keys stop working.") &&
              run(async () => {
                await call("/owner/kill", { code, body: { enabled: !status.killSwitch.admin } });
              })
            }
          >
            {status.killSwitch.admin ? "Gateway is OFF: switch on" : "Emergency stop (kill switch)"}
          </button>
        </Card>
      )}

      {status && <Prices code={code} providers={status.providers} />}

      <Card title={`Customers (${customers.length})`}>
        <ul className="space-y-3">
          {customers.map((c) => (
            <li key={c.id} className="rounded border p-2 space-y-2 text-sm">
              <p>
                <b className="break-all">{c.email}</b> ({c.name}) {c.disabledAt && <span className="text-red-700">· switched off</span>}
                <br />
                Credit: <b>{usd(c.balanceUsd)}</b>
              </p>
              <div className="flex gap-2">
                <input
                  className={input}
                  placeholder="Add credit in $"
                  inputMode="decimal"
                  value={amounts[c.id] ?? ""}
                  onChange={(e) => setAmounts({ ...amounts, [c.id]: e.target.value })}
                />
                <button
                  className={btn2}
                  onClick={() =>
                    run(async () => {
                      await call(`/owner/customers/${c.id}/credit`, { code, body: { amountUsd: Number(amounts[c.id]) } });
                      setAmounts({ ...amounts, [c.id]: "" });
                    })
                  }
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={btn2}
                  onClick={() => run(async () => void (await call(`/owner/customers/${c.id}/disable`, { code, body: { disabled: !c.disabledAt } })))}
                >
                  {c.disabledAt ? "Switch on" : "Switch off"}
                </button>
                <button
                  className={btn2}
                  onClick={() =>
                    confirm("Make a new password for this customer? The old one stops working.") &&
                    run(async () => {
                      const r = await call(`/owner/customers/${c.id}/password`, { code, body: {} });
                      setSecret({ label: `New password for ${c.email}. Shown only once.`, value: r.password });
                    })
                  }
                >
                  New password
                </button>
                <button
                  className={btn2}
                  onClick={() =>
                    run(async () => {
                      const r = await call(`/owner/customers/${c.id}/ledger`, { code });
                      setLedger({ id: c.id, entries: r.entries });
                    })
                  }
                >
                  History
                </button>
                <button
                  className={`${btn2} border-red-500 text-red-700`}
                  onClick={() => {
                    const warn =
                      `Delete ${c.email}? Their keys stop at once and the account is removed.` +
                      (c.balanceUsd > 0 ? ` The remaining credit (${usd(c.balanceUsd)}) is lost.` : "") +
                      `\n\nType the email to confirm:`;
                    const typed = prompt(warn);
                    if (typed === null) return;
                    void run(async () => {
                      await call(`/owner/customers/${c.id}/delete`, { code, body: { confirmEmail: typed } });
                      setLedger(null);
                    });
                  }}
                >
                  Delete
                </button>
              </div>
              {ledger && ledger.id === c.id && (
                <ul className="text-xs space-y-1">
                  {ledger.entries.slice(0, 30).map((e) => (
                    <li key={e.id}>
                      {when(e.createdAt)} · {e.kind} {usd(e.amountUsd)} → {usd(e.balanceAfterUsd)} {e.note && `· ${e.note}`}
                    </li>
                  ))}
                  {!ledger.entries.length && <li>No entries.</li>}
                </ul>
              )}
            </li>
          ))}
          {!customers.length && <li className="text-sm text-muted-foreground">No customers yet.</li>}
        </ul>
        <form
          className="space-y-2 border-t pt-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(async () => {
              const r = await call("/owner/customers", { code, body: { email, name, ...(password ? { password } : {}) } });
              setSecret(r.password ? { label: `Password for ${email}. Shown only once. Give it to the customer.`, value: r.password } : null);
              setEmail("");
              setName("");
              setPassword("");
            });
          }}
        >
          <p className="text-sm font-medium">New customer</p>
          <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className={input} placeholder="Password (leave empty to generate one)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className={btn} type="submit">
            Create account
          </button>
        </form>
      </Card>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────────────────────────

export default function ApiPortal() {
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [who, setWho] = useState<"customer" | "owner">("customer");
  const [code, setCode] = useState("");
  const [ownerCode, setOwnerCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Mitrify API";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* nothing stored */
    }
    setToken("");
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (who === "customer") {
        const r = await call("/login", { body: { email, password } });
        try {
          sessionStorage.setItem(TOKEN_KEY, r.token);
        } catch {
          /* the token stays in memory for this visit */
        }
        setToken(r.token);
        setPassword("");
      } else {
        await call("/owner/status", { code });
        setOwnerCode(code);
        setCode("");
      }
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <h1 className="text-2xl font-semibold">Mitrify API</h1>
        {token ? (
          <Customer token={token} onSignOut={signOut} />
        ) : ownerCode ? (
          <Owner
            code={ownerCode}
            onLeave={() => {
              setOwnerCode("");
              setWho("customer");
            }}
          />
        ) : (
          <Card title={who === "customer" ? "Sign in" : "Owner"}>
            <form className="space-y-3" onSubmit={submit}>
              {who === "customer" ? (
                <>
                  <input className={input} type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  <input className={input} type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </>
              ) : (
                <input className={input} type="password" placeholder="Owner setup code" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} required />
              )}
              {err && <Notice kind="error">{err}</Notice>}
              <button className={`${btn} w-full`} type="submit" disabled={busy}>
                {busy ? "Please wait..." : who === "customer" ? "Sign in" : "Open owner tools"}
              </button>
            </form>
            <p className="text-sm text-muted-foreground">Accounts are created by the owner. There is no public sign-up.</p>
            <button
              className="text-sm underline"
              onClick={() => {
                setWho(who === "customer" ? "owner" : "customer");
                setErr("");
              }}
            >
              {who === "customer" ? "I am the owner" : "I am a customer"}
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}
