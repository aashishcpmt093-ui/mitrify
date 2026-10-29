import { z } from "zod/v4";

// The AI behind the doctor's consultation panel runs through OpenRouter (https://openrouter.ai).
// Set on the server, no code edit:
//   OPENROUTER_API_KEY  the OpenRouter key (required)
//   AI_MODEL            optional; any OpenRouter model id. Default "openrouter/free", OpenRouter's
//                       router over its free models, which accepts photos.
// Free models are rate limited by OpenRouter and the router may pick a different model each time,
// so answers are asked for as JSON in the instructions and checked here, with one retry.

const BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openrouter/free";

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
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AiError("AI is not set up yet: add OPENROUTER_API_KEY on the server.", 503);
  return { key, model: process.env.AI_MODEL || DEFAULT_MODEL };
}

export function describeAi(): string {
  try {
    return `OpenRouter (${settings().model})`;
  } catch {
    return "not set up";
  }
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: unknown };

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

async function complete(key: string, model: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages }),
  });
  if (res.status === 401 || res.status === 403) throw new AiError("The OpenRouter key on the server is not valid.", 500);
  if (res.status === 402) throw new AiError("OpenRouter account balance is negative. Add credit or check the account.", 402);
  if (res.status === 429) {
    throw new AiError("Free AI limit reached for now (per minute or per day). Try again later.", 429);
  }
  if (!res.ok) {
    console.error(`[clinic-ai] openrouter ${res.status}`, (await res.text()).slice(0, 500));
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
  const { key, model } = settings();
  const { $schema: _meta, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  const messages = toChatMessages(
    `${system}\n\nAnswer with one JSON object only, no other text, matching this JSON schema:\n${JSON.stringify(jsonSchema)}`,
    turns,
  );

  const first = await complete(key, model, messages);
  const parsed = parseAnswer(first, schema);
  if (parsed) return parsed;

  // One retry, showing the model its own answer and what was wrong with it.
  const second = await complete(key, model, [
    ...messages,
    { role: "assistant", content: first },
    { role: "user", content: "That was not one JSON object matching the schema. Reply again with only the JSON object." },
  ]);
  const retried = parseAnswer(second, schema);
  if (retried) return retried;
  console.error("[clinic-ai] unreadable answer", second.slice(0, 500));
  throw new AiError("AI gave an answer that could not be read. Try again.", 502);
}
