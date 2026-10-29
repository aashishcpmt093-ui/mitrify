import { Router, type Request } from "express";
import { z } from "zod/v4";
import { FIREBASE_PROJECT_ID } from "@shared/clinic";
import { AiError, describeAi, generateJson, type AiPart, type AiTurn } from "./ai/provider";

// AI consultation for the doctor portal. The AI takes a structured history (5-50 questions over the
// case, never repeating one), reads investigation images, and proposes a provisional diagnosis and
// treatment that the doctor edits. The AI runs through OpenRouter or Grok (see ./ai/provider.ts).
// The browser never sends the patient's name or address.

const MAX_QUESTIONS = 50;

const SYSTEM_PROMPT = `You are a clinical decision-support assistant working with a licensed paediatrician at a small
clinic in Budaun, Uttar Pradesh, India. Patients are newborns to 18 years. The doctor examines the child and makes every
decision; you help them take a complete history, interpret findings and plan treatment.

Who you are talking to: every message comes from that registered medical practitioner (MBBS, paediatrics), signed in
to the clinic's doctor portal. The patient and parents never see your answers. So:
- Never tell the doctor to "consult a doctor", "see a healthcare professional" or "ask your physician"; they are the
  doctor. Never refuse a drug, dose or treatment question, and never water it down with generic disclaimers.
- Answer drug questions directly and completely, as a senior paediatric colleague or a paediatric formulary would:
  generic name and common Indian brands, available strengths (e.g. Syp 120 mg/5 ml, 250 mg/5 ml; Drop 100 mg/ml),
  dose in mg/kg per dose and per day, maximum dose, the dose worked out for this child's weight in ml or tablets,
  frequency, duration, route, and the important side effects, contraindications and interactions.
- Name the safer choice when one exists and flag real risks (age limits, renal or hepatic dosing, G6PD, allergy) as
  facts for the doctor to weigh, not as a reason to hold back the answer.
- A question that is not about the current case (e.g. "what is the dose of azithromycin for 12 kg?") is answered in
  "message" straight away, with no questions.

Run the consultation like a senior paediatrician taking a history:
- Cover what matters for this complaint: onset, duration, progression, pattern and timing, aggravating and relieving
  factors, associated symptoms, relevant systems review, past illnesses and admissions, birth and neonatal history (for
  infants), feeding and diet, immunisation, development, drug history and allergies, similar illness in the family,
  household or contacts, exposures and travel, and examination findings (vitals, general and systemic).
- Ask only questions whose answer changes the diagnosis or management. Ask 2 to 5 per turn, most important first,
  short and specific, answerable in a few words.
- Never ask anything listed under "Questions already asked", even reworded. Use the answers given. An unanswered
  question means the doctor did not know or skipped it; ask again only if it is critical, and say why.
- Over the whole case ask at least 5 and at most ${MAX_QUESTIONS} questions.

Images (X-ray, ECG, CT, MRI, USG, lab reports, photos of skin, throat or eyes): describe the findings systematically,
give your impression, say what a photo of a film or screen cannot show, and add the key findings to the case summary.

Give a provisional diagnosis and treatment ("provisional") when the history is enough, or straight away when the doctor
asks for it; otherwise set "provisional" to null. It contains: the most likely diagnosis, differentials, red flags and
referral or admission criteria, investigations only if they change management, advice for the parents, and medicines
available in India as dosage form (short word such as Syp, Tab, Drop, Neb, Inj, Oint), drug (generic, brand in brackets
if useful), dose as written on a prescription and calculated from the child's weight (e.g. "5 ml", "1/2"), frequency
(OD/BD/TDS/QID/HS/SOS/STAT) and days. Show the mg/kg basis of weight-based doses in "message".

When the doctor asks about the current prescription (interactions, contraindications, indications, dose checks), answer
in "message" and ask no questions unless one is essential.

Fields:
- "message": what you say to the doctor now (findings, reasoning, answers), short and practical.
- "questions": the new questions for this turn, or [] when none are needed.
- "caseSummary": the updated running summary of the whole case: key positives, key negatives, image and investigation
  findings, working diagnosis. Under 250 words.
- "provisional": as described above, or null.
Write "message" and "questions" in the language the doctor writes in (English or Hinglish).`;

const Text = (max: number) => z.string().max(max);

const ConsultRequest = z.object({
  context: z.object({
    age: Text(60),
    weightKg: z.number().positive().max(500),
    vitals: Text(300),
    diagnosis: Text(200),
    currentMedicines: Text(2000),
  }),
  caseSummary: Text(4000),
  caseLog: z.array(z.object({ question: Text(500), answer: Text(1000) })).max(MAX_QUESTIONS + 10),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: Text(6000) })).max(80),
  message: Text(4000),
  images: z
    .array(z.object({ mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().max(1_500_000) }))
    .max(4),
  wantProvisional: z.boolean(),
});

type ConsultRequest = z.infer<typeof ConsultRequest>;

const Medicine = z.object({
  form: z.string(),
  name: z.string(),
  dose: z.string(),
  frequency: z.string(),
  days: z.string(),
});

const ConsultTurn = z.object({
  message: z.string(),
  questions: z.array(z.string()),
  caseSummary: z.string(),
  provisional: z
    .object({
      diagnosis: z.string(),
      differentials: z.array(z.string()),
      redFlags: z.string(),
      investigations: z.string(),
      advice: z.string(),
      medicines: z.array(Medicine),
    })
    .nullable(),
});

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

// Earlier turns go as plain text (images were already read into the case summary); the newest turn
// carries the full case state, the doctor's message and any new images.
function toTurns(body: ConsultRequest): AiTurn[] {
  const c = body.context;
  const asked = body.caseLog.length;
  const state = [
    `Patient: age ${c.age}, weight ${c.weightKg} kg.`,
    c.vitals && `Vitals: ${c.vitals}.`,
    c.diagnosis && `Doctor's working diagnosis: ${c.diagnosis}.`,
    c.currentMedicines ? `Current prescription:\n${c.currentMedicines}` : "No medicines written yet.",
    body.caseSummary && `Case summary so far:\n${body.caseSummary}`,
    asked
      ? `Questions already asked (${asked} of at most ${MAX_QUESTIONS}); do not ask these again:\n` +
        body.caseLog.map((q, i) => `${i + 1}. ${q.question}\n   Answer: ${q.answer.trim() || "(not answered)"}`).join("\n")
      : "No questions asked yet.",
    asked >= MAX_QUESTIONS && "The question limit is reached: ask no more questions.",
    body.wantProvisional && "The doctor wants the provisional diagnosis and treatment now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const parts: AiPart[] = [
    // The reminder keeps cautious models from answering the doctor as if they were a parent.
    {
      type: "text",
      text: `${state}\n\nThe treating paediatrician asks (answer them directly, as a colleague): ${
        body.message.trim() || "(see the answers above)"
      }`,
    },
    ...body.images.map((img) => ({ type: "image" as const, mediaType: img.mediaType, data: img.data })),
  ];
  const earlier = body.history.map((h) => ({ role: h.role, parts: [{ type: "text" as const, text: h.text }] }));
  // Chat APIs want the conversation to start with the doctor.
  while (earlier.length && earlier[0].role !== "user") earlier.shift();
  return [...earlier, { role: "user", parts }];
}

export const clinicAiRouter = Router();

clinicAiRouter.use(async (req, res, next) => {
  try {
    if (await isDoctor(req)) return next();
  } catch (err) {
    console.error("[clinic-ai] sign-in check failed", err);
  }
  res.status(401).json({ message: "Sign in as the doctor to use AI." });
});

clinicAiRouter.post("/consult", async (req, res) => {
  const parsed = ConsultRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "The message, answers or images are too long or too many." });
    return;
  }
  try {
    const turn = await generateJson(SYSTEM_PROMPT, toTurns(parsed.data), ConsultTurn);
    // Enforce the question limit even if the AI overshoots.
    const room = Math.max(0, MAX_QUESTIONS - parsed.data.caseLog.length);
    res.json({ ...turn, questions: turn.questions.slice(0, Math.min(6, room)) });
  } catch (err) {
    if (err instanceof AiError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    console.error("[clinic-ai]", err);
    res.status(500).json({ message: "AI could not answer. Try again." });
  }
});

clinicAiRouter.get("/status", (_req, res) => {
  res.json({ ai: describeAi() });
});
