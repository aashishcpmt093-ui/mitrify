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
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase";

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
  age: string;
  address: string;
  parentName: string;
  weight: string;
  visitAt: string;
};

export type PatientRow = Omit<IntakeInput, "age" | "weight"> & {
  id: string;
  age: number;
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

export async function getProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as Profile) : null;
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
  if (!profile || profile.role !== expected) {
    await signOut(auth);
    throw new Error("This account does not have access to this portal.");
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
    age: Number(input.age),
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

export type PrescriptionRow = {
  id: string;
  medicines: string;
  createdAt?: Timestamp | null;
};

// Earlier prescriptions for one patient, newest first. Sorted here so no composite index is needed.
export async function listPrescriptions(patientId: string): Promise<PrescriptionRow[]> {
  const snap = await getDocs(query(collection(db, "prescriptions"), where("patientId", "==", patientId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<PrescriptionRow, "id">) }))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}

export async function savePrescription(patient: PatientRow, medicines: string, doctorUid: string) {
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
    medicines: medicines.trim(),
    doctorUid,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "patients", patient.id), { status: "prescribed" });
}
