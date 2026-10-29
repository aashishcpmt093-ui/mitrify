import { auth } from "./clinic";
import type { MedicineItem } from "./medicines";

// Calls the server's /api/clinic-ai routes. The patient's name and address are never sent.

export type AiContext = {
  age: string;
  weightKg: number;
  vitals: string;
  diagnosis: string;
  currentMedicines: string;
};

export type CaseQA = { question: string; answer: string };

export type Provisional = {
  diagnosis: string;
  differentials: string[];
  redFlags: string;
  investigations: string;
  advice: string;
  medicines: MedicineItem[];
};

export type ConsultTurn = {
  message: string;
  questions: string[];
  caseSummary: string;
  provisional: Provisional | null;
};

export type ConsultImage = {
  mediaType: "image/jpeg";
  data: string; // base64 without the data: prefix
  preview: string; // data URL for the thumbnail
  name: string;
};

export type ConsultRequest = {
  context: AiContext;
  caseSummary: string;
  caseLog: CaseQA[];
  history: { role: "user" | "assistant"; text: string }[];
  message: string;
  images: { mediaType: string; data: string }[];
  wantProvisional: boolean;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again to use AI.");
  const res = await fetch(`/api/clinic-ai/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status === 413) throw new Error("The photos are too large. Send fewer photos at a time.");
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(data.message || "AI is not available right now.");
  return data;
}

export const consult = (request: ConsultRequest) => post<ConsultTurn>("consult", request);

// Phone photos are several MB; shrink to at most 1600px JPEG so a few fit in one request
// and the AI can still read films, ECG strips and printed reports.
export function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<ConsultImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) return reject(new Error("Could not read the photo."));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve({ mediaType: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl, name: file.name });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} is not a photo the browser can open.`));
    };
    img.src = url;
  });
}
