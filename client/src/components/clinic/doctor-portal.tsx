import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import LoginCard from "@/components/clinic/login-card";
import {
  auth,
  createStaff,
  formatAge,
  friendlyError,
  listPrescriptions,
  listStaff,
  savePrescription,
  signIn,
  subscribePatients,
  useClinicSession,
  type PatientRow,
  type PrescriptionRow,
  type Profile,
} from "@/lib/clinic";

type Tab = "patients" | "staff";

export default function DoctorPortal() {
  const session = useClinicSession("doctor");

  if (session.status === "loading") {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  if (session.status !== "ready") {
    return (
      <div className="flex flex-col items-center gap-6 w-full">
        <h1 className="text-2xl font-semibold">Doctor sign in</h1>
        <LoginCard
          identifierLabel="Email"
          identifierType="email"
          wrongRole={session.status === "wrong-role"}
          onSignOut={() => signOut(auth)}
          onSignIn={(email, pw) => signIn(email.trim(), pw, "doctor")}
        />
      </div>
    );
  }

  return <DoctorDashboard uid={session.uid} name={session.profile.name} />;
}

function DoctorDashboard({ uid, name }: { uid: string; name: string }) {
  const [tab, setTab] = useState<Tab>("patients");

  return (
    <div className="w-full max-w-3xl flex flex-col gap-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">Dr. {name}</h1>
        <Button variant="outline" size="sm" onClick={() => signOut(auth)}>
          Sign out
        </Button>
      </div>
      <div className="flex gap-2 print:hidden">
        <Button variant={tab === "patients" ? "default" : "outline"} onClick={() => setTab("patients")}>
          Patients
        </Button>
        <Button variant={tab === "staff" ? "default" : "outline"} onClick={() => setTab("staff")}>
          Staff
        </Button>
      </div>
      {tab === "patients" ? <PatientList uid={uid} doctorName={name} /> : <StaffManager />}
    </div>
  );
}

function PatientList({ uid, doctorName }: { uid: string; doctorName: string }) {
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PatientRow | null>(null);

  useEffect(
    () =>
      subscribePatients(
        (next) => {
          setRows(next);
          setError(null);
        },
        (err) => setError(friendlyError(err, "Could not load patients.")),
      ),
    [],
  );

  if (selected) {
    return (
      <PrescriptionEditor
        patient={selected}
        doctorUid={uid}
        doctorName={doctorName}
        onDone={() => setSelected(null)}
      />
    );
  }

  if (error) {
    return <p className="text-red-600">{error}</p>;
  }

  if (rows.length === 0) {
    return <p className="text-muted-foreground">No patient entries yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {rows.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => setSelected(p)}
            className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-muted"
          >
            <span className="font-medium">{p.name}</span>
            <span className="text-sm text-muted-foreground">
              {p.visitAt.replace("T", " ")} · {p.status === "prescribed" ? "Prescribed" : "New"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PrescriptionEditor({
  patient,
  doctorUid,
  doctorName,
  onDone,
}: {
  patient: PatientRow;
  doctorUid: string;
  doctorName: string;
  onDone: () => void;
}) {
  const [medicines, setMedicines] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PrescriptionRow[]>([]);

  useEffect(() => {
    listPrescriptions(patient.id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [patient.id]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await savePrescription(patient, medicines, doctorUid);
      onDone();
    } catch (err) {
      setError(friendlyError(err, "Could not save prescription."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Printed header: only shows on paper. */}
      <div className="hidden print:block border-b pb-3">
        <p className="text-xl font-semibold">Mitrify Clinic</p>
        <p>Dr. {doctorName}</p>
        <p className="text-sm">Date: {new Date().toLocaleDateString("en-IN")}</p>
      </div>

      <div className="rounded-md border p-4 text-sm grid grid-cols-2 gap-2 print:border-0">
        <p><strong>Patient:</strong> {patient.name}</p>
        <p><strong>Age:</strong> {formatAge(patient.age)}</p>
        <p className="col-span-2"><strong>Address:</strong> {patient.address}</p>
        <p><strong>Mother / Father:</strong> {patient.parentName}</p>
        <p><strong>Weight:</strong> {patient.weight} kg</p>
        <p className="col-span-2"><strong>Date and time:</strong> {patient.visitAt.replace("T", " ")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="medicines">Prescription (medicines)</Label>
        <Textarea
          id="medicines"
          rows={10}
          value={medicines}
          onChange={(e) => setMedicines(e.target.value)}
          placeholder="Write medicines, dose and duration"
          className="print:border-0"
        />
      </div>

      {error && <p className="text-sm text-red-600 print:hidden">{error}</p>}

      <div className="flex gap-3 print:hidden">
        <Button onClick={save} disabled={busy || medicines.trim() === ""}>
          {busy ? "Saving..." : "Save prescription"}
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Back
        </Button>
      </div>

      {history.length > 0 && (
        <div className="flex flex-col gap-2 print:hidden">
          <h2 className="text-lg font-medium">Earlier prescriptions</h2>
          <ul className="flex flex-col divide-y rounded-md border">
            {history.map((h) => (
              <li key={h.id} className="p-3 text-sm">
                <p className="text-muted-foreground mb-1">
                  {h.createdAt ? h.createdAt.toDate().toLocaleString("en-IN") : "Saving..."}
                </p>
                <p className="whitespace-pre-wrap">{h.medicines}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StaffManager() {
  const [staff, setStaff] = useState<(Profile & { id: string })[]>([]);
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const refresh = () => listStaff().then(setStaff).catch(() => setStaff([]));
  useEffect(() => {
    refresh();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await createStaff(loginId, password, name);
      setMessage({ kind: "ok", text: `Staff ${loginId} created.` });
      setLoginId("");
      setName("");
      setPassword("");
      refresh();
    } catch (err) {
      setMessage({ kind: "error", text: friendlyError(err, "Could not create staff.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={add} className="flex flex-col gap-4 max-w-sm">
        <h2 className="text-lg font-medium">Add staff</h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor="staffName">Name</Label>
          <Input id="staffName" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="staffId">Staff ID</Label>
          <Input id="staffId" value={loginId} onChange={(e) => setLoginId(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="staffPassword">Password (min 6 characters)</Label>
          <Input id="staffPassword" type="text" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Creating..." : "Create staff login"}
        </Button>
        {message && (
          <p className={`text-sm ${message.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{message.text}</p>
        )}
      </form>

      <div>
        <h2 className="text-lg font-medium mb-2">Staff list</h2>
        {staff.length === 0 ? (
          <p className="text-muted-foreground text-sm">No staff yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {staff.map((s) => (
              <li key={s.id} className="p-3 text-sm">
                {s.name} <span className="text-muted-foreground">({s.loginId})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
