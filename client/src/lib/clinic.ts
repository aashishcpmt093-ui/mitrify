import { useEffect, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  arrayUnion,
  deleteDoc,
  increment,
  limit,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase";
import { isFilled, medicineLine, type DrugDosing, type MedicineItem } from "./medicines";
import { DEFAULT_PROFILE, type ClinicProfile } from "@shared/clinic";

// The default app is created in ./firebase, so getApp() returns the same project.
const app = getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);

export type Role = "doctor" | "staff";
export type Profile = { role: Role; name: string; loginId?: string };

// Staff sign in with an ID. Firebase Auth needs an email, so the ID is mapped to one.
export const staffEmail = (loginId: string) => `${loginId.trim().toLowerCase()}@staff.mitrify.com`;

export type IntakeInput = {
  name: string;
  ageDays: string;
  ageMonths: string;
  ageYears: string;
  address: string;
  parentName: string;
  // Kept for the clinic's records only; never printed on the pad.
  mobile: string;
  weight: string;
  visitAt: string;
};

// Age is stored as days/months/years so newborns (0 days) up to adults fit.
// Older entries saved a plain number of years.
export type AgeParts = { days: number; months: number; years: number };

// How the patient came in. Entries made on the public patient page have none and count as "new".
// "revisit" is a follow-up the doctor booked for a later date.
export type VisitType = "emergency" | "new" | "old" | "revisit";

export type PatientRow = Omit<IntakeInput, "ageDays" | "ageMonths" | "ageYears" | "weight" | "mobile"> & {
  id: string;
  visitType?: VisitType;
  // Each visit is its own entry. Repeat visits share the first visit's id here, so history follows the
  // child across visits. Missing on first visits: the entry's own id is the key.
  patientKey?: string;
  // Missing on patients registered before the mobile field existed.
  mobile?: string;
  age: AgeParts | number;
  weight: number;
  source: "patient" | "staff";
  // Who registered the visit (staff or doctor uid); null for the public patient page.
  createdBy?: string | null;
  // "skipped": the doctor put the patient aside (e.g. not present when called); they can go back in the queue.
  status: "new" | "prescribed" | "skipped";
  createdAt?: Timestamp | null;
};

const FRIENDLY_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "Wrong ID/email or password.",
  "auth/wrong-password": "Wrong ID/email or password.",
  "auth/user-not-found": "Wrong ID/email or password.",
  "auth/invalid-email": "This ID/email is not valid.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "No internet connection. Check the network and try again.",
  "auth/email-already-in-use": "This staff ID already exists. Choose another ID.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/operation-not-allowed": "Email/Password sign-in is not enabled in Firebase.",
  "permission-denied": "This could not be saved. Check the details and try again; staff and doctor should sign in again.",
  unavailable: "Cannot reach the server. Check the network and try again.",
};

// Firebase errors carry a code like "auth/invalid-credential"; show a readable message instead.
export function friendlyError(err: unknown, fallback = "Something went wrong. Try again."): string {
  const code = (err as { code?: string } | null)?.code;
  if (code && FRIENDLY_ERRORS[code]) return FRIENDLY_ERRORS[code];
  return err instanceof Error && !code ? err.message : fallback;
}

export function formatAge(age: AgeParts | number): string {
  if (typeof age === "number") return `${age} years`;
  const parts = [
    age.years ? `${age.years} ${age.years === 1 ? "year" : "years"}` : "",
    age.months ? `${age.months} ${age.months === 1 ? "month" : "months"}` : "",
    age.days ? `${age.days} ${age.days === 1 ? "day" : "days"}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "0 days";
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as Profile) : null;
}

// Clinic owner accounts: their doctor profile is created on first sign-in, so nobody has to
// add it in the Firestore console. Keep in sync with OWNER_EMAILS in firestore.rules.
const OWNER_DOCTOR_EMAILS = ["doc.asheesh@icloud.com", "doc.asheesh@gmail.com"];

// Writes the owner's doctor profile when it is missing; returns null for any other account.
async function createOwnerProfile(uid: string, email: string | null): Promise<Profile | null> {
  if (!OWNER_DOCTOR_EMAILS.includes(email?.toLowerCase() ?? "")) return null;
  const profile: Profile = { role: "doctor", name: "Asheesh" };
  await setDoc(doc(db, "users", uid), { ...profile, createdAt: serverTimestamp() });
  return profile;
}

// Signs in and makes sure the account has the role this portal needs.
export async function signIn(email: string, password: string, expected: Role): Promise<void> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  let profile: Profile | null = null;
  try {
    profile = await getProfile(cred.user.uid);
  } catch {
    profile = null;
  }
  if (!profile && expected === "doctor") {
    profile = await createOwnerProfile(cred.user.uid, cred.user.email);
  }
  if (!profile) {
    const uid = cred.user.uid;
    await signOut(auth);
    // The password was right but the Firestore profile is missing; say exactly what to create.
    throw new Error(
      `Password is correct, but this account has no profile yet. In Firestore, create collection "users", ` +
        `document ID ${uid}, with fields role = "${expected}" and name = (the person's name).`,
    );
  }
  if (profile.role !== expected) {
    await signOut(auth);
    throw new Error(`This account is set up as "${profile.role}", not "${expected}", so it cannot use this portal.`);
  }
}

export type Session =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "wrong-role" }
  | { status: "ready"; uid: string; profile: Profile };

export function useClinicSession(expected: Role): Session {
  const [session, setSession] = useState<Session>({ status: "loading" });

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSession({ status: "signed-out" });
        return;
      }
      let profile: Profile | null = null;
      try {
        profile = await getProfile(user.uid);
        // Covers an owner who was already signed in before the profile existed.
        if (!profile && expected === "doctor") profile = await createOwnerProfile(user.uid, user.email);
      } catch {
        // A failed profile read must not leave the page stuck on "Loading".
        profile = null;
      }
      if (!profile || profile.role !== expected) {
        setSession({ status: "wrong-role" });
        return;
      }
      setSession({ status: "ready", uid: user.uid, profile });
    });
  }, [expected]);

  return session;
}

// Doctor creates a staff login. A second Firebase app keeps the doctor signed in
// while the staff account is being created.
// Staff IDs become part of an email address, so keep them to safe characters.
const STAFF_ID_PATTERN = /^[a-z0-9._-]{3,30}$/;

export async function createStaff(loginId: string, password: string, name: string): Promise<void> {
  const id = loginId.trim().toLowerCase();
  if (!STAFF_ID_PATTERN.test(id)) {
    throw new Error("Staff ID must be 3-30 characters: letters, numbers, dot, dash or underscore, no spaces.");
  }
  const secondary = getApps().find((a) => a.name === "staff-admin") ?? initializeApp(firebaseConfig, "staff-admin");
  const secondaryAuth = getAuth(secondary);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, staffEmail(id), password);
    await setDoc(doc(db, "users", cred.user.uid), {
      role: "staff",
      name: name.trim(),
      loginId: id,
      createdAt: serverTimestamp(),
    });
  } finally {
    await signOut(secondaryAuth);
  }
}

export async function listStaff(): Promise<(Profile & { id: string })[]> {
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "staff")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Profile) }));
}

// by.source "patient" is the public form (no login). "staff" must be signed in as staff.
// The public patient form must save without a sign-in even on a device where the doctor or staff
// is signed in (same site, shared browser). It uses its own Firebase app, which never signs in, so
// the request matches the "no sign-in" rule for patient entries.
function publicDb() {
  const publicApp = getApps().find((a) => a.name === "public-intake") ?? initializeApp(firebaseConfig, "public-intake");
  return getFirestore(publicApp);
}

export const patientKeyOf = (p: PatientRow) => p.patientKey ?? p.id;

type IntakeBy = { source: "patient" } | { source: "staff"; uid: string; visitType: VisitType; patientKey?: string };

export async function saveIntake(input: IntakeInput, by: IntakeBy) {
  const target = by.source === "patient" ? publicDb() : db;
  // The public page may only send the fields its rule lists, so visit details come from staff and doctor only.
  const visit =
    by.source === "staff" ? { visitType: by.visitType, ...(by.patientKey ? { patientKey: by.patientKey } : {}) } : {};
  await addDoc(collection(target, "patients"), {
    ...visit,
    name: input.name.trim(),
    age: {
      days: Number(input.ageDays || 0),
      months: Number(input.ageMonths || 0),
      years: Number(input.ageYears || 0),
    },
    address: input.address.trim(),
    parentName: input.parentName.trim(),
    mobile: input.mobile.replace(/\D/g, ""),
    weight: Number(input.weight),
    visitAt: input.visitAt,
    source: by.source,
    createdBy: by.source === "staff" ? by.uid : null,
    status: "new",
    createdAt: serverTimestamp(),
  });
}

const toPatient = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as Omit<PatientRow, "id">) });

// Today's date as visits store it ("YYYY-MM-DD"), in the clinic's local time.
export function todayKey(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const tomorrowKey = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return todayKey(d);
};

// Live list for the doctor. Only today's visits, or the latest ones, are downloaded, so the page stays
// light and within the free Firestore quota however many patients build up over the years.
export const RECENT_PATIENTS = 300;

export function subscribePatients(
  range: "today" | "recent",
  cb: (rows: PatientRow[]) => void,
  onError: (err: unknown) => void,
) {
  const patients = collection(db, "patients");
  const q =
    range === "today"
      ? query(patients, where("visitAt", ">=", todayKey()), where("visitAt", "<", tomorrowKey()))
      : query(patients, orderBy("createdAt", "desc"), limit(RECENT_PATIENTS));
  return onSnapshot(q, (snap) => cb(snap.docs.map(toPatient)), onError);
}

// Finds patients across all visits by the start of their name or mobile number, downloading only the
// matches. Names are stored as typed, so the common ways of capitalising them are each tried.
export async function searchPatients(term: string): Promise<PatientRow[]> {
  const text = term.trim().replace(/\s+/g, " ");
  const digits = text.replace(/\D/g, "");
  const patients = collection(db, "patients");
  const prefix = (field: string, value: string, max: number) =>
    query(patients, where(field, ">=", value), where(field, "<=", value + "\uf8ff"), limit(max));

  let queries;
  if (digits.length >= 3 && digits.length === text.replace(/[\s+-]/g, "").length) {
    queries = [prefix("mobile", digits.length > 10 ? digits.slice(-10) : digits, 30)];
  } else {
    if (text.length < 2) return [];
    const lower = text.toLowerCase();
    const title = lower.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    const variants = new Set([text, lower, lower[0].toUpperCase() + lower.slice(1), title, text.toUpperCase()]);
    queries = [...variants].map((v) => prefix("name", v, 15));
  }
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  const rows = new Map<string, PatientRow>();
  for (const snap of snaps) for (const d of snap.docs) rows.set(d.id, toPatient(d));
  return [...rows.values()].sort((a, b) => b.visitAt.localeCompare(a.visitAt));
}

export type Vitals = { temp: string; pulse: string; rr: string; spo2: string };

export const EMPTY_VITALS: Vitals = { temp: "", pulse: "", rr: "", spo2: "" };

// What the doctor writes on the pad.
export type PrescriptionContent = {
  // Presenting complaints, one per line.
  complaints: string;
  diagnosis: string;
  items: MedicineItem[];
  advice: string;
  // Anything else for the pad, e.g. a referral.
  notes: string;
  investigations: string;
  vitals: Vitals;
};

export type PrescriptionRow = {
  id: string;
  // Printed lines, kept so older screens and history can show the prescription as text.
  medicines: string;
  // Missing on prescriptions saved before these fields existed.
  complaints?: string;
  diagnosis?: string;
  items?: MedicineItem[];
  advice?: string;
  notes?: string;
  investigations?: string;
  vitals?: Vitals;
  createdAt?: Timestamp | null;
};

// Earlier prescriptions for one patient across all visits, newest first. Prescriptions saved before
// repeat visits existed only have patientId (the first visit's id), so both fields are searched.
// Sorted here so no composite index is needed.
export async function listPrescriptions(patient: PatientRow): Promise<PrescriptionRow[]> {
  const key = patientKeyOf(patient);
  const prescriptions = collection(db, "prescriptions");
  const [byKey, byId] = await Promise.all([
    getDocs(query(prescriptions, where("patientKey", "==", key))),
    getDocs(query(prescriptions, where("patientId", "==", key))),
  ]);
  const rows = new Map<string, PrescriptionRow>();
  for (const d of [...byKey.docs, ...byId.docs]) rows.set(d.id, { id: d.id, ...(d.data() as Omit<PrescriptionRow, "id">) });
  return [...rows.values()].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}

export async function savePrescription(patient: PatientRow, content: PrescriptionContent, doctorUid: string) {
  await addDoc(collection(db, "prescriptions"), {
    patientId: patient.id,
    patientKey: patientKeyOf(patient),
    patient: {
      name: patient.name,
      age: patient.age,
      address: patient.address,
      parentName: patient.parentName,
      mobile: patient.mobile ?? "",
      weight: patient.weight,
      visitAt: patient.visitAt,
    },
    complaints: content.complaints.trim(),
    diagnosis: content.diagnosis.trim(),
    items: cleanItems(content.items),
    medicines: content.items.filter(isFilled).map(medicineLine).join("\n"),
    advice: content.advice.trim(),
    notes: content.notes.trim(),
    investigations: content.investigations.trim(),
    vitals: {
      temp: content.vitals.temp.trim(),
      pulse: content.vitals.pulse.trim(),
      rr: content.vitals.rr.trim(),
      spo2: content.vitals.spo2.trim(),
    },
    doctorUid,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "patients", patient.id), { status: "prescribed" });
}

export async function setQueueStatus(patientId: string, status: "new" | "skipped"): Promise<void> {
  await updateDoc(doc(db, "patients", patientId), { status });
}

export async function deletePatient(patientId: string): Promise<void> {
  await deleteDoc(doc(db, "patients", patientId));
}

// Books a follow-up: a new visit for the same child on the chosen date and time. It appears in the
// doctor's queue that day, with the child's earlier prescriptions in history. Age is moved on to that
// date; weight is the last one recorded, to be updated on the day.
export async function scheduleRevisit(patient: PatientRow, visitAt: string, uid: string): Promise<void> {
  const age = ageNow(patient.age, patient.visitAt, new Date(visitAt));
  await saveIntake(
    {
      name: patient.name,
      ageDays: String(age.days),
      ageMonths: String(age.months),
      ageYears: String(age.years),
      address: patient.address,
      parentName: patient.parentName,
      mobile: patient.mobile ?? "",
      weight: String(patient.weight),
      visitAt,
    },
    { source: "staff", uid, visitType: "revisit", patientKey: patientKeyOf(patient) },
  );
}

// Everything one staff member registered between two dates ("YYYY-MM-DD", end included), oldest first.
// Filtered by date in Firestore and by staff here, so no extra index has to be set up.
export async function listRegistrationsBy(uid: string, from: string, to: string): Promise<PatientRow[]> {
  const end = new Date(`${to}T00:00`);
  end.setDate(end.getDate() + 1);
  const snap = await getDocs(
    query(collection(db, "patients"), where("visitAt", ">=", from), where("visitAt", "<", todayKey(end))),
  );
  return snap.docs
    .map(toPatient)
    .filter((p) => p.createdBy === uid)
    .sort((a, b) => a.visitAt.localeCompare(b.visitAt));
}

// For a patient seen without a prescription (e.g. only advice), so the queue still moves on.
export async function markSeen(patientId: string): Promise<void> {
  await updateDoc(doc(db, "patients", patientId), { status: "prescribed" });
}

function cleanItems(items: MedicineItem[]): MedicineItem[] {
  return items.filter(isFilled).map((item) => ({
    form: item.form.trim(),
    name: item.name.trim(),
    dose: item.dose.trim(),
    frequency: item.frequency.trim(),
    days: item.days.trim(),
  }));
}

// Diagnosis templates: the medicines, advice and investigations the doctor usually gives for a
// diagnosis, so the next patient with it starts from them instead of an empty pad.
export type DiagnosisTemplate = {
  diagnosis: string;
  items: MedicineItem[];
  advice: string;
  investigations: string;
};

const templateId = (diagnosis: string) => encodeURIComponent(diagnosis.trim().toLowerCase());

export async function listTemplates(): Promise<DiagnosisTemplate[]> {
  const snap = await getDocs(collection(db, "templates"));
  return snap.docs
    .map((d) => d.data() as DiagnosisTemplate)
    .sort((a, b) => a.diagnosis.localeCompare(b.diagnosis));
}

export async function saveTemplate(content: PrescriptionContent): Promise<void> {
  await setDoc(doc(db, "templates", templateId(content.diagnosis)), {
    diagnosis: content.diagnosis.trim(),
    items: cleanItems(content.items),
    advice: content.advice.trim(),
    investigations: content.investigations.trim(),
    updatedAt: serverTimestamp(),
  });
}

// Saved prescriptions edited in Memories. Renaming moves the record to its new name.
export async function saveTemplateRecord(t: DiagnosisTemplate, previousDiagnosis?: string): Promise<void> {
  await setDoc(doc(db, "templates", templateId(t.diagnosis)), {
    diagnosis: t.diagnosis.trim(),
    items: cleanItems(t.items),
    advice: t.advice.trim(),
    investigations: t.investigations.trim(),
    updatedAt: serverTimestamp(),
  });
  if (previousDiagnosis && templateId(previousDiagnosis) !== templateId(t.diagnosis)) {
    await deleteDoc(doc(db, "templates", templateId(previousDiagnosis)));
  }
}

export async function deleteTemplate(diagnosis: string): Promise<void> {
  await deleteDoc(doc(db, "templates", templateId(diagnosis)));
}

export const findTemplate = (templates: DiagnosisTemplate[], diagnosis: string) =>
  templates.find((t) => t.diagnosis.toLowerCase() === diagnosis.trim().toLowerCase());

// Drug memory: every drug the doctor prescribes is remembered with how it was last given,
// so it can be picked again with its form, dose and frequency filled in.
// Drugs added or edited in Memories also carry how they are dosed by weight (DrugDosing).
export type RememberedDrug = Omit<MedicineItem, "name"> & DrugDosing & { name: string; count: number };

// Firestore IDs cannot contain "/", so the lower-cased name is URL-encoded.
const drugId = (name: string) => encodeURIComponent(name.trim().toLowerCase());

export async function listDrugs(): Promise<RememberedDrug[]> {
  const snap = await getDocs(collection(db, "drugs"));
  return snap.docs
    .map((d) => d.data() as RememberedDrug)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
}

export async function rememberDrugs(items: MedicineItem[]): Promise<void> {
  await Promise.all(
    items.filter(isFilled).map((item) =>
      setDoc(
        doc(db, "drugs", drugId(item.name)),
        {
          name: item.name.trim(),
          form: item.form.trim(),
          dose: item.dose.trim(),
          frequency: item.frequency.trim(),
          days: item.days.trim(),
          count: increment(1),
          lastUsed: serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );
}

// A medicine saved from Memories with its weight-based dosing. Firestore keeps no undefined, so
// blank numbers are stored as null. Renaming moves the record to its new name.
export async function saveLibraryDrug(drug: Omit<RememberedDrug, "count">, previousName?: string): Promise<void> {
  const num = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);
  await setDoc(
    doc(db, "drugs", drugId(drug.name)),
    {
      name: drug.name.trim(),
      form: drug.form.trim(),
      dose: drug.dose.trim(),
      frequency: drug.frequency.trim(),
      days: drug.days.trim(),
      strengthMg: num(drug.strengthMg),
      strengthMl: num(drug.strengthMl),
      mgPerKg: num(drug.mgPerKg),
      maxMg: num(drug.maxMg),
      inLibrary: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  if (previousName && drugId(previousName) !== drugId(drug.name)) {
    await deleteDoc(doc(db, "drugs", drugId(previousName)));
  }
}

export async function deleteDrug(name: string): Promise<void> {
  await deleteDoc(doc(db, "drugs", drugId(name)));
}

// Complaints typed before are offered again. One document: settings/memory.
export async function getComplaintMemory(): Promise<string[]> {
  const snap = await getDoc(doc(db, "settings", "memory"));
  const list = snap.exists() ? (snap.data().complaints as unknown) : null;
  return Array.isArray(list) ? list.filter((c): c is string => typeof c === "string") : [];
}

export async function rememberComplaints(complaints: string[]): Promise<void> {
  const list = complaints.map((c) => c.trim()).filter(Boolean);
  if (!list.length) return;
  await setDoc(doc(db, "settings", "memory"), { complaints: arrayUnion(...list) }, { merge: true });
}

// Clinic profile: clinic name and everything printed on the pad. One document, settings/pad, which
// anyone may read (the portals show the clinic name) and only the doctor may change.
function profileFrom(data: Record<string, unknown> | undefined): ClinicProfile {
  const text = (key: keyof ClinicProfile) =>
    typeof data?.[key] === "string" && (data[key] as string).trim() ? (data[key] as string) : (DEFAULT_PROFILE[key] as string);
  const lines = (key: "addressLines" | "timings") =>
    Array.isArray(data?.[key]) ? (data[key] as unknown[]).filter((l): l is string => typeof l === "string") : DEFAULT_PROFILE[key];
  return {
    clinicName: text("clinicName"),
    doctorName: text("doctorName"),
    degrees: text("degrees"),
    registration: text("registration"),
    mobile: text("mobile"),
    addressLines: lines("addressLines"),
    timings: lines("timings"),
  };
}

// Live, so a change saved in "Edit profile" shows at once on the pad and the page header.
export function useClinicProfile(): ClinicProfile {
  const [profile, setProfile] = useState<ClinicProfile>(DEFAULT_PROFILE);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "settings", "pad"),
        (snap) => setProfile(profileFrom(snap.data())),
        () => setProfile(DEFAULT_PROFILE),
      ),
    [],
  );
  return profile;
}

export async function saveClinicProfile(profile: ClinicProfile): Promise<void> {
  await setDoc(doc(db, "settings", "pad"), { ...profile, updatedAt: serverTimestamp() }, { merge: true });
}

// Age today, worked out from the age given at an earlier visit, so a repeat visit starts correct.
export function ageNow(age: AgeParts | number, visitAt: string, now = new Date()): AgeParts {
  const parts = typeof age === "number" ? { days: 0, months: 0, years: age } : age;
  const seen = new Date(visitAt);
  if (Number.isNaN(seen.getTime())) return parts;
  const birth = new Date(seen.getFullYear() - parts.years, seen.getMonth() - parts.months, seen.getDate() - parts.days);
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return years < 0 ? parts : { days, months, years };
}
