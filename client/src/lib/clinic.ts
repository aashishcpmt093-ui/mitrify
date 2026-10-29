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

export async function getProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as Profile) : null;
}

// Signs in and makes sure the account has the role this portal needs.
export async function signIn(email: string, password: string, expected: Role): Promise<void> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profile = await getProfile(cred.user.uid);
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
      const profile = await getProfile(user.uid);
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
export async function createStaff(loginId: string, password: string, name: string): Promise<void> {
  const secondary = getApps().find((a) => a.name === "staff-admin") ?? initializeApp(firebaseConfig, "staff-admin");
  const secondaryAuth = getAuth(secondary);
  const cred = await createUserWithEmailAndPassword(secondaryAuth, staffEmail(loginId), password);
  await setDoc(doc(db, "users", cred.user.uid), {
    role: "staff",
    name: name.trim(),
    loginId: loginId.trim().toLowerCase(),
    createdAt: serverTimestamp(),
  });
  await signOut(secondaryAuth);
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

export function subscribePatients(cb: (rows: PatientRow[]) => void) {
  return onSnapshot(query(collection(db, "patients"), orderBy("createdAt", "desc")), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PatientRow, "id">) }))),
  );
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
