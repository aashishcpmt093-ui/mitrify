import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { FIREBASE_PROJECT_ID } from "@shared/clinic";

// AI assistant for the doctor portal: a consultation chat and a structured prescription draft.
// The Anthropic key stays on the server (ANTHROPIC_API_KEY); only signed-in doctors may call it.
// The browser never sends the patient's name or address, only age, weight, vitals and what
// the doctor types.

const MODEL = "claude-opus-5-5";

const SYSTEM_PROMPT = `You assist a licensed paediatrician at a small clinic in Budaun, Uttar Pradesh, India.
Patients range from newborns to 18 years. The doctor examines the child; you suggest, the doctor decides.

When the doctor describes a case:
- Ask briefly for any missing detail that would change management (duration, red flags, hydration, feeding).
- Give the most likely diagnosis and important differentials in a few lines.
- Suggest treatment as medicines commonly available in India: dosage form, drug (generic, brand in brackets if useful),
  dose calculated from the child's weight and stated as given (e.g. "5 ml"), frequency (OD/BD/TDS/QID/HS/SOS/STAT),
  and days. Show the mg/kg basis for weight-based doses so the doctor can check it.
- List investigations only when they change management.
- Clearly flag danger signs that need referral or admission.
Keep answers short and practical. Reply in the language the doctor writes in (English or Hinglish).`;

const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const RequestBody = z.object({
  context: z.object({
    age: z.string().max(60),
    weightKg: z.number().positive().max(500),
    vitals: z.string().max(300),
    diagnosis: z.string().max(200),
    currentMedicines: z.string().max(2000),
  }),
  messages: z.array(ChatMessage).min(1).max(40),
});

type RequestBody = z.infer<typeof RequestBody>;

const PrescriptionDraft = z.object({
  diagnosis: z.string(),
  medicines: z.array(
    z.object({
      form: z.string(),
      name: z.string(),
      dose: z.string(),
      frequency: z.string(),
      days: z.string(),
    }),
  ),
  advice: z.string(),
  investigations: z.string(),
  warnings: z.string(),
});

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

// The doctor's Firebase ID token is checked by Firestore itself: reading users/{uid} only succeeds
// with a valid token for that uid (see firestore.rules), and the profile must say "doctor".
async function isDoctor(req: Request): Promise<boolean> {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  let uid = "";
  try {
    uid = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).sub ?? "";
  } catch {
    return false;
  }
  if (!/^[A-Za-z0-9]{1,128}$/.test(uid)) return false;
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return false;
  const doc = (await res.json()) as { fields?: { role?: { stringValue?: string } } };
  return doc.fields?.role?.stringValue === "doctor";
}

// Patient context goes in front of the doctor's first message; the system prompt stays fixed.
function toMessages(body: RequestBody): Anthropic.Beta.BetaMessageParam[] {
  const c = body.context;
  const context = [
    `Patient: age ${c.age}, weight ${c.weightKg} kg.`,
    c.vitals && `Vitals: ${c.vitals}.`,
    c.diagnosis && `Doctor's working diagnosis: ${c.diagnosis}.`,
    c.currentMedicines && `Already written on the prescription:\n${c.currentMedicines}`,
  ]
    .filter(Boolean)
    .join("\n");
  return body.messages.map((m, i) =>
    i === 0 && m.role === "user" ? { role: "user", content: `${context}\n\n${m.content}` } : m,
  );
}

function sendError(res: Response, err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) {
    res.status(500).json({ message: "The AI key on the server is not valid." });
  } else if (err instanceof Anthropic.RateLimitError) {
    res.status(429).json({ message: "AI is busy. Try again in a minute." });
  } else if (err instanceof Anthropic.APIError) {
    console.error("[clinic-ai] API error", err.status, err.message);
    res.status(502).json({ message: "AI could not answer. Try again." });
  } else {
    console.error("[clinic-ai]", err);
    res.status(500).json({ message: "AI could not answer. Try again." });
  }
}

export const clinicAiRouter = Router();

clinicAiRouter.use(async (req, res, next) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ message: "AI is not set up yet: add ANTHROPIC_API_KEY on the server." });
    return;
  }
  try {
    if (await isDoctor(req)) return next();
  } catch (err) {
    console.error("[clinic-ai] sign-in check failed", err);
  }
  res.status(401).json({ message: "Sign in as the doctor to use AI." });
});

clinicAiRouter.post("/chat", async (req, res) => {
  const parsed = RequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Message is empty or too long." });
    return;
  }
  try {
    const message = await getClient()
      .beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: SYSTEM_PROMPT,
        messages: toMessages(parsed.data),
      })
      .finalMessage();
    if (message.stop_reason === "refusal") {
      res.status(422).json({ message: "AI declined this request. Rephrase the clinical question." });
      return;
    }
    const reply = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim();
    res.json({ reply });
  } catch (err) {
    sendError(res, err);
  }
});

clinicAiRouter.post("/prescription", async (req, res) => {
  const parsed = RequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Describe the case first." });
    return;
  }
  try {
    const message = await getClient()
      .beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(PrescriptionDraft) },
        system: SYSTEM_PROMPT,
        messages: [
          ...toMessages(parsed.data),
          {
            role: "user",
            content:
              "Write the prescription for this consultation now. medicines: one entry per drug, form as a short " +
              "word like Syp, Tab, Drop, Neb, Inj, Oint; dose as written on a prescription (e.g. \"5 ml\", \"1/2\"); " +
              "frequency like OD/BD/TDS/QID/HS/SOS/STAT; days as a number, or empty. warnings: danger signs or dose " +
              "checks the doctor must look at, or empty.",
          },
        ],
      })
      .finalMessage();
    if (message.stop_reason === "refusal" || !message.parsed_output) {
      res.status(422).json({ message: "AI could not write a prescription for this. Ask in the chat instead." });
      return;
    }
    res.json(message.parsed_output);
  } catch (err) {
    sendError(res, err);
  }
});
