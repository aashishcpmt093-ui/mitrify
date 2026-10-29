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
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase";
import { isFilled, medicineLine, type MedicineItem } from "./medicines";

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
  weight: string;
  visitAt: string;
};

// Age is stored as days/months/years so newborns (0 days) up to adults fit.
// Older entries saved a plain number of years.
export type AgeParts = { days: number; months: number; years: number };

export type PatientRow = Omit<IntakeInput, "ageDays" | "ageMonths" | "ageYears" | "weight"> & {
  id: string;
  age: AgeParts | number;
  weight: number;
  source: "patient" | "staff";
  status: "new" | "prescribed";
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
  "permission-denied": "You do not have permission for this. Check the Firestore rules and your account role.",
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
export async function saveIntake(input: IntakeInput, by: { source: "patient" } | { source: "staff"; uid: string }) {
  await addDoc(collection(db, "patients"), {
    name: input.name.trim(),
    age: {
      days: Number(input.ageDays || 0),
      months: Number(input.ageMonths || 0),
      years: Number(input.ageYears || 0),
    },
    address: input.address.trim(),
    parentName: input.parentName.trim(),
    weight: Number(input.weight),
    visitAt: input.visitAt,
    source: by.source,
    createdBy: by.source === "staff" ? by.uid : null,
    status: "new",
    createdAt: serverTimestamp(),
  });
}

export function subscribePatients(cb: (rows: PatientRow[]) => void, onError: (err: unknown) => void) {
  return onSnapshot(
    query(collection(db, "patients"), orderBy("createdAt", "desc")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PatientRow, "id">) }))),
    onError,
  );
}

export type Vitals = { temp: string; pulse: string; rr: string; spo2: string };

export const EMPTY_VITALS: Vitals = { temp: "", pulse: "", rr: "", spo2: "" };

// What the doctor writes on the pad.
export type PrescriptionContent = {
  items: MedicineItem[];
  advice: string;
  investigations: string;
  vitals: Vitals;
};

export type PrescriptionRow = {
  id: string;
  // Printed lines, kept so older screens and history can show the prescription as text.
  medicines: string;
  // Missing on prescriptions saved before these fields existed.
  items?: MedicineItem[];
  advice?: string;
  investigations?: string;
  vitals?: Vitals;
  createdAt?: Timestamp | null;
};

// Earlier prescriptions for one patient, newest first. Sorted here so no composite index is needed.
export async function listPrescriptions(patientId: string): Promise<PrescriptionRow[]> {
  const snap = await getDocs(query(collection(db, "prescriptions"), where("patientId", "==", patientId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<PrescriptionRow, "id">) }))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}

export async function savePrescription(patient: PatientRow, content: PrescriptionContent, doctorUid: string) {
  await addDoc(collection(db, "prescriptions"), {
    patientId: patient.id,
    patient: {
      name: patient.name,
      age: patient.age,
      address: patient.address,
      parentName: patient.parentName,
      weight: patient.weight,
      visitAt: patient.visitAt,
    },
    items: content.items.filter(isFilled).map((item) => ({
      form: item.form.trim(),
      name: item.name.trim(),
      dose: item.dose.trim(),
      frequency: item.frequency.trim(),
      days: item.days.trim(),
    })),
    medicines: content.items.filter(isFilled).map(medicineLine).join("\n"),
    advice: content.advice.trim(),
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

// Drug memory: every drug the doctor prescribes is remembered with how it was last given,
// so it can be picked again with its form, dose and frequency filled in.
export type RememberedDrug = Omit<MedicineItem, "name"> & { name: string; count: number };

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
