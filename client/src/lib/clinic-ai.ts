import { auth } from "./clinic";
import type { MedicineItem } from "./medicines";

// Calls the server's /api/clinic-ai routes (Claude). The patient's name and address are never sent.

export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiContext = {
  age: string;
  weightKg: number;
  vitals: string;
  diagnosis: string;
  currentMedicines: string;
};

export type AiPrescription = {
  diagnosis: string;
  medicines: MedicineItem[];
  advice: string;
  investigations: string;
  warnings: string;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again to use AI.");
  const res = await fetch(`/api/clinic-ai/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(data.message || "AI is not available right now.");
  return data;
}

export const askAi = (context: AiContext, messages: AiMessage[]) =>
  post<{ reply: string }>("chat", { context, messages }).then((r) => r.reply);

export const draftPrescription = (context: AiContext, messages: AiMessage[]) =>
  post<AiPrescription>("prescription", { context, messages });
