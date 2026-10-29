import { z } from "zod/v4";

// The AI behind the doctor's consultation panel. Two providers, both OpenAI-compatible chat APIs.
// Set on the server, no code edit:
//   OPENROUTER_API_KEY  key from https://openrouter.ai
//   GROK_API_KEY        key from https://console.x.ai
//   AI_PROVIDER         optional: "openrouter" or "grok". If unset, OpenRouter is used when its key
//                       is set, otherwise Grok.
//   AI_MODEL            optional model id. Defaults: "openrouter/free" (OpenRouter's router over its
//                       free models, accepts photos) and "grok-4.6".
// The JSON shape is also given in the instructions and every answer is checked here, with one retry,
// because free models on OpenRouter do not all support structured output.

type ProviderName = "openrouter" | "grok";

const PROVIDERS: Record<ProviderName, { label: string; baseUrl: string; model: string; keyEnv: string; jsonSchema: boolean }> = {
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openrouter/free",
    keyEnv: "OPENROUTER_API_KEY",
    jsonSchema: false,
  },
  grok: { label: "Grok", baseUrl: "https://api.x.ai/v1", model: "grok-4.6", keyEnv: "GROK_API_KEY", jsonSchema: true },
};

export type AiPart = { type: "text"; text: string } | { type: "image"; mediaType: string; data: string };
export type AiTurn = { role: "user" | "assistant"; parts: AiPart[] };

// Errors carry the message the doctor sees.
export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function settings() {
  const chosen = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (chosen && chosen !== "openrouter" && chosen !== "grok") {
    throw new AiError(`AI_PROVIDER "${chosen}" is not supported. Use openrouter or grok.`, 503);
  }
  const name: ProviderName =
    (chosen as ProviderName | undefined) ?? (process.env.OPENROUTER_API_KEY || !process.env.GROK_API_KEY ? "openrouter" : "grok");
  const provider = PROVIDERS[name];
  const key = process.env[provider.keyEnv];
  if (!key) {
    throw new AiError(
      chosen
        ? `AI is not set up yet: add ${provider.keyEnv} on the server.`
        : "AI is not set up yet: add OPENROUTER_API_KEY or GROK_API_KEY on the server.",
      503,
    );
  }
  return { ...provider, key, model: process.env.AI_MODEL || provider.model };
}

export function describeAi(): string {
  try {
    const s = settings();
    return `${s.label} (${s.model})`;
  } catch {
    return "not set up";
  }
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: unknown };
type Settings = ReturnType<typeof settings>;

function toChatMessages(system: string, turns: AiTurn[]): ChatMessage[] {
  return [
    { role: "system", content: system },
    ...turns.map((t) => ({
      role: t.role,
      content:
        t.role === "assistant"
          ? t.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n")
          : t.parts.map((p) =>
              p.type === "text"
                ? { type: "text", text: p.text }
                : { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } },
            ),
    })),
  ];
}

async function complete(s: Settings, messages: ChatMessage[], jsonSchema: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${s.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.key}` },
    body: JSON.stringify({
      model: s.model,
      messages,
      ...(s.jsonSchema && { response_format: { type: "json_schema", json_schema: { name: "answer", schema: jsonSchema } } }),
    }),
  });
  if (res.status === 401 || res.status === 403) throw new AiError(`The ${s.label} key on the server is not valid.`, 500);
  if (res.status === 402) throw new AiError(`${s.label} account balance is low or negative. Add credit or check the account.`, 402);
  if (res.status === 429) {
    throw new AiError(`${s.label} limit reached for now (per minute or per day). Try again later.`, 429);
  }
  if (!res.ok) {
    console.error(`[clinic-ai] ${s.label} ${res.status}`, (await res.text()).slice(0, 500));
    throw new AiError("AI could not answer. Try again.", 502);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

// Models often wrap JSON in ```json fences or add a sentence; take the outermost object.
function parseAnswer<T>(text: string, schema: z.ZodType<T>): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const result = schema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// Asks the AI and returns its answer checked against `schema`.
export async function generateJson<T>(system: string, turns: AiTurn[], schema: z.ZodType<T>): Promise<T> {
  const s = settings();
  // "$schema" is metadata some providers reject; the rest is the actual shape.
  const { $schema: _meta, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  const messages = toChatMessages(
    `${system}\n\nAnswer with one JSON object only, no other text, matching this JSON schema:\n${JSON.stringify(jsonSchema)}`,
    turns,
  );

  const first = await complete(s, messages, jsonSchema);
  const parsed = parseAnswer(first, schema);
  if (parsed) return parsed;

  // One retry, showing the model its own answer and what was wrong with it.
  const second = await complete(
    s,
    [
      ...messages,
      { role: "assistant", content: first },
      { role: "user", content: "That was not one JSON object matching the schema. Reply again with only the JSON object." },
    ],
    jsonSchema,
  );
  const retried = parseAnswer(second, schema);
  if (retried) return retried;
  console.error("[clinic-ai] unreadable answer", second.slice(0, 500));
  throw new AiError("AI gave an answer that could not be read. Try again.", 502);
}
