import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoginCard from "@/components/clinic/login-card";
import PrescriptionPad, { type PrintMode, type PrintOffset } from "@/components/clinic/prescription-pad";
import { Textarea } from "@/components/ui/textarea";
import {
  auth,
  createStaff,
  EMPTY_VITALS,
  formatAge,
  friendlyError,
  listPrescriptions,
  listStaff,
  savePrescription,
  signIn,
  subscribePatients,
  useClinicSession,
  type PatientRow,
  type PrescriptionContent,
  type PrescriptionRow,
  type Profile,
  type Vitals,
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
    <div className="w-full max-w-3xl flex flex-col gap-6 print:gap-0 print:max-w-none">
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
      {tab === "patients" ? <PatientList uid={uid} /> : <StaffManager />}
    </div>
  );
}

function PatientList({ uid }: { uid: string }) {
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

// Print settings belong to this device's printer, so they are kept in this browser only.
const PRINT_SETTINGS_KEY = "rxPrintSettings";
type PrintSettings = { mode: PrintMode; offset: PrintOffset };
const DEFAULT_PRINT_SETTINGS: PrintSettings = { mode: "overlay", offset: { x: 0, y: 0 } };

function loadPrintSettings(): PrintSettings {
  try {
    const raw = localStorage.getItem(PRINT_SETTINGS_KEY);
    if (!raw) return DEFAULT_PRINT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PrintSettings>;
    return {
      mode: parsed.mode === "full" ? "full" : "overlay",
      offset: { x: Number(parsed.offset?.x) || 0, y: Number(parsed.offset?.y) || 0 },
    };
  } catch {
    return DEFAULT_PRINT_SETTINGS;
  }
}

function storePrintSettings(settings: PrintSettings) {
  try {
    localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or blocked storage: settings just last for this visit.
  }
}

const VITAL_FIELDS: { key: keyof Vitals; label: string }[] = [
  { key: "temp", label: "Temp (°F)" },
  { key: "pulse", label: "Pulse (/min)" },
  { key: "rr", label: "RR (/min)" },
  { key: "spo2", label: "SpO2 (%)" },
];

function PrescriptionEditor({
  patient,
  doctorUid,
  onDone,
}: {
  patient: PatientRow;
  doctorUid: string;
  onDone: () => void;
}) {
  const [content, setContent] = useState<PrescriptionContent>({
    medicines: "",
    investigations: "",
    vitals: EMPTY_VITALS,
  });
  const [print, setPrint] = useState<PrintSettings>(loadPrintSettings);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PrescriptionRow[]>([]);

  useEffect(() => {
    listPrescriptions(patient.id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [patient.id]);

  const edit = (next: Partial<PrescriptionContent>) => {
    setContent((prev) => ({ ...prev, ...next }));
    setSaved(false);
  };

  const updatePrint = (next: Partial<PrintSettings>) => {
    setPrint((prev) => {
      const merged = { ...prev, ...next };
      storePrintSettings(merged);
      return merged;
    });
  };

  const isEmpty = content.medicines.trim() === "" && content.investigations.trim() === "";

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await savePrescription(patient, content, doctorUid);
      // Stay on the pad so the doctor can print right after saving.
      setSaved(true);
      listPrescriptions(patient.id).then(setHistory).catch(() => undefined);
    } catch (err) {
      setError(friendlyError(err, "Could not save prescription."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 print:gap-0">
      <div className="flex flex-col gap-4 print:hidden">
        <p className="text-sm text-muted-foreground">
          {patient.name} · {formatAge(patient.age)} · {patient.weight} kg
        </p>

        <div className="flex flex-col gap-2">
          <Label htmlFor="medicines">Medicines</Label>
          <Textarea
            id="medicines"
            rows={7}
            value={content.medicines}
            onChange={(e) => edit({ medicines: e.target.value })}
            placeholder="One medicine per line, e.g. Syp Paracetamol 5ml TDS"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="investigations">Investigations</Label>
          <Textarea
            id="investigations"
            rows={3}
            value={content.investigations}
            onChange={(e) => edit({ investigations: e.target.value })}
            placeholder="e.g. CBC, CRP"
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium mb-2">Vitals</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {VITAL_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <Label htmlFor={`vital-${key}`}>{label}</Label>
                <Input
                  id={`vital-${key}`}
                  inputMode="decimal"
                  value={content.vitals[key]}
                  onChange={(e) => edit({ vitals: { ...content.vitals, [key]: e.target.value } })}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-md border p-4">
          <legend className="text-sm font-medium px-1">Print settings (this device)</legend>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={print.mode === "overlay" ? "default" : "outline"}
              onClick={() => updatePrint({ mode: "overlay" })}
            >
              On my printed pad
            </Button>
            <Button
              type="button"
              variant={print.mode === "full" ? "default" : "outline"}
              onClick={() => updatePrint({ mode: "full" })}
            >
              On plain paper
            </Button>
          </div>
          {print.mode === "overlay" && (
            <>
              <p className="text-xs text-muted-foreground">
                Put the pad in the printer, choose paper size A5 and scale "Actual size / 100%". If the text lands
                off the lines, move it here and print again.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="offset-x">Move right (mm), minus = left</Label>
                  <Input
                    id="offset-x"
                    type="number"
                    step="0.5"
                    value={print.offset.x}
                    onChange={(e) => updatePrint({ offset: { ...print.offset, x: Number(e.target.value) || 0 } })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="offset-y">Move down (mm), minus = up</Label>
                  <Input
                    id="offset-y"
                    type="number"
                    step="0.5"
                    value={print.offset.y}
                    onChange={(e) => updatePrint({ offset: { ...print.offset, y: Number(e.target.value) || 0 } })}
                  />
                </div>
              </div>
            </>
          )}
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <Button onClick={save} disabled={busy || saved || isEmpty}>
            {busy ? "Saving..." : saved ? "Saved" : "Save prescription"}
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={isEmpty}>
            Print
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Back
          </Button>
        </div>

        <p className="text-sm font-medium">Preview</p>
      </div>

      <PrescriptionPad patient={patient} content={content} mode={print.mode} offset={print.offset} />

      {history.length > 0 && (
        <div className="flex flex-col gap-2 print:hidden">
          <h2 className="text-lg font-medium">Earlier prescriptions</h2>
          <ul className="flex flex-col divide-y rounded-md border">
            {history.map((h) => (
              <li key={h.id}>
                {/* Tap to put an earlier prescription back on the pad, e.g. to reprint it. */}
                <button
                  type="button"
                  onClick={() => {
                    setContent({
                      medicines: h.medicines,
                      investigations: h.investigations ?? "",
                      vitals: h.vitals ?? EMPTY_VITALS,
                    });
                    setSaved(true);
                  }}
                  className="w-full p-3 text-sm text-left hover:bg-muted"
                >
                  <p className="text-muted-foreground mb-1">
                    {h.createdAt ? h.createdAt.toDate().toLocaleString("en-IN") : "Saving..."}
                  </p>
                  <p className="whitespace-pre-wrap">{h.medicines}</p>
                  {h.investigations && <p className="text-muted-foreground mt-1">Investigations: {h.investigations}</p>}
                </button>
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
