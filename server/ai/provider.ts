import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";

// One switch for which AI company answers the doctor. Change it on the server, no code edit:
//   AI_PROVIDER  grok (default) | openai | kimi | glm | claude
//   AI_API_KEY   the key from that company (for claude, ANTHROPIC_API_KEY also works)
//   AI_MODEL     optional; the provider's model name (required for openai, kimi and glm)
//   AI_BASE_URL  optional; overrides the provider's API address
// grok, openai, kimi and glm speak the OpenAI-compatible chat API; claude uses the Anthropic SDK.

export type AiPart = { type: "text"; text: string } | { type: "image"; mediaType: string; data: string };
export type AiTurn = { role: "user" | "assistant"; parts: AiPart[] };

type CompatiblePreset = { baseUrl: string; model?: string; json: "json_schema" | "json_object" };

const COMPATIBLE: Record<string, CompatiblePreset> = {
  grok: { baseUrl: "https://api.x.ai/v1", model: "grok-4.6", json: "json_schema" },
  openai: { baseUrl: "https://api.openai.com/v1", json: "json_schema" },
  kimi: { baseUrl: "https://api.moonshot.ai/v1", json: "json_object" },
  glm: { baseUrl: "https://open.bigmodel.cn/api/paas/v4", json: "json_object" },
};

const CLAUDE_MODEL = "claude-opus-5-5";

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
  const provider = (process.env.AI_PROVIDER || "grok").trim().toLowerCase();
  if (provider !== "claude" && !COMPATIBLE[provider]) {
    throw new AiError(`AI_PROVIDER "${provider}" is not supported. Use grok, openai, kimi, glm or claude.`, 503);
  }
  const key = process.env.AI_API_KEY || (provider === "claude" ? process.env.ANTHROPIC_API_KEY : undefined);
  if (!key) throw new AiError("AI is not set up yet: add AI_API_KEY on the server.", 503);
  const preset = COMPATIBLE[provider];
  const model = process.env.AI_MODEL || (provider === "claude" ? CLAUDE_MODEL : preset.model);
  if (!model) throw new AiError(`Set AI_MODEL on the server for ${provider}.`, 503);
  return { provider, key, model, baseUrl: process.env.AI_BASE_URL || preset?.baseUrl };
}

export function describeAi(): string {
  try {
    const s = settings();
    return `${s.provider} (${s.model})`;
  } catch {
    return "not set up";
  }
}

// Asks the configured AI and returns its answer parsed against `schema`.
export async function generateJson<T>(system: string, turns: AiTurn[], schema: z.ZodType<T>, name: string): Promise<T> {
  const s = settings();
  return s.provider === "claude"
    ? claudeJson(s.key, s.model, system, turns, schema)
    : compatibleJson(s.provider, s.key, s.model, s.baseUrl!, system, turns, schema, name);
}

async function compatibleJson<T>(
  provider: string,
  key: string,
  model: string,
  baseUrl: string,
  system: string,
  turns: AiTurn[],
  schema: z.ZodType<T>,
  name: string,
): Promise<T> {
  // "$schema" is metadata some providers reject; the rest is the actual shape.
  const { $schema: _meta, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  const responseFormat =
    COMPATIBLE[provider].json === "json_schema"
      ? { type: "json_schema", json_schema: { name, schema: jsonSchema } }
      : { type: "json_object" };
  // json_object mode only promises valid JSON, so the schema also goes in the instructions.
  const instructions =
    COMPATIBLE[provider].json === "json_object"
      ? `${system}\n\nAnswer with JSON only, matching this JSON schema:\n${JSON.stringify(jsonSchema)}`
      : system;

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: responseFormat,
      messages: [
        { role: "system", content: instructions },
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
      ],
    }),
  });

  if (res.status === 401 || res.status === 403) throw new AiError("The AI key on the server is not valid.", 500);
  if (res.status === 429) throw new AiError("AI is busy or out of credit. Try again in a minute.", 429);
  if (!res.ok) {
    console.error(`[clinic-ai] ${provider} ${res.status}`, (await res.text()).slice(0, 500));
    throw new AiError("AI could not answer. Try again.", 502);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  return parseAnswer(data.choices?.[0]?.message?.content ?? "", schema);
}

// Some models wrap JSON in ```json fences or add a sentence; take the outermost object.
function parseAnswer<T>(text: string, schema: z.ZodType<T>): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    return schema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch (err) {
    console.error("[clinic-ai] unreadable answer", err, text.slice(0, 500));
    throw new AiError("AI gave an answer that could not be read. Try again.", 502);
  }
}

async function claudeJson<T>(key: string, model: string, system: string, turns: AiTurn[], schema: z.ZodType<T>): Promise<T> {
  const client = new Anthropic({ apiKey: key });
  try {
    const message = await client.beta.messages
      .stream({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
        system,
        messages: turns.map((t) => ({
          role: t.role,
          content: t.parts.map((p) =>
            p.type === "text"
              ? { type: "text" as const, text: p.text }
              : {
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: p.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                    data: p.data,
                  },
                },
          ),
        })),
      })
      .finalMessage();
    if (message.stop_reason === "refusal" || !message.parsed_output) {
      throw new AiError("AI declined this request. Rephrase the clinical question.", 422);
    }
    return message.parsed_output;
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new AiError("The AI key on the server is not valid.", 500);
    if (err instanceof Anthropic.RateLimitError) throw new AiError("AI is busy. Try again in a minute.", 429);
    if (err instanceof Anthropic.APIError) {
      console.error("[clinic-ai] claude", err.status, err.message);
      throw new AiError("AI could not answer. Try again.", 502);
    }
    throw err;
  }
}
