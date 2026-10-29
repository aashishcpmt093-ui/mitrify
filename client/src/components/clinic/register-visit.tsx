import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PatientIntakeForm from "@/components/patient-intake-form";
import {
  ageNow,
  formatAge,
  friendlyError,
  patientKeyOf,
  saveIntake,
  subscribePatients,
  type IntakeInput,
  type PatientRow,
  type VisitType,
} from "@/lib/clinic";

const CHOICES: { type: VisitType; title: string; detail: string; icon: typeof UserPlus; tone: string }[] = [
  {
    type: "emergency",
    title: "Emergency",
    detail: "Shown to the doctor first",
    icon: AlertTriangle,
    tone: "border-red-300 bg-red-50 text-red-800 hover:bg-red-100",
  },
  {
    type: "new",
    title: "New OPD",
    detail: "First visit to the clinic",
    icon: UserPlus,
    tone: "border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100",
  },
  {
    type: "old",
    title: "Old patient",
    detail: "Find by name or mobile",
    icon: History,
    tone: "border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100",
  },
];

// A returning patient's last details, with the age moved on to today. Weight is left for a fresh reading.
function fromLastVisit(p: PatientRow): Partial<IntakeInput> {
  const age = ageNow(p.age, p.visitAt);
  return {
    name: p.name,
    ageDays: String(age.days),
    ageMonths: String(age.months),
    ageYears: String(age.years),
    address: p.address,
    parentName: p.parentName,
    mobile: p.mobile ?? "",
    weight: "",
  };
}

// Registration used by staff and by the doctor: Emergency, New OPD, or an old patient sent to the doctor again.
export default function RegisterVisit({ uid, onClose }: { uid: string; onClose?: () => void }) {
  const [type, setType] = useState<VisitType | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const register = async (input: IntakeInput, visitType: VisitType, patientKey?: string) => {
    await saveIntake(input, { source: "staff", uid, visitType, patientKey });
    setNotice(`${input.name.trim()} has been sent to the doctor${visitType === "emergency" ? " as EMERGENCY" : ""}.`);
    setType(null);
  };

  if (!type) {
    return (
      <div className="flex w-full flex-col gap-4">
        {notice && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">✓ {notice}</p>}
        <p className="text-sm font-medium">Choose the type of visit</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {CHOICES.map((c) => (
            <button
              key={c.type}
              type="button"
              onClick={() => {
                setType(c.type);
                setNotice(null);
              }}
              className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-colors sm:flex-col sm:items-start ${c.tone}`}
            >
              <c.icon className="h-6 w-6 shrink-0" />
              <span>
                <span className="block text-base font-semibold">{c.title}</span>
                <span className="block text-xs opacity-80">{c.detail}</span>
              </span>
            </button>
          ))}
        </div>
        {onClose && (
          <Button variant="ghost" className="self-start" onClick={onClose}>
            Back
          </Button>
        )}
      </div>
    );
  }

  const choice = CHOICES.find((c) => c.type === type)!;
  return (
    <div className="flex w-full flex-col gap-4">
      <div className={`flex items-center justify-between gap-3 rounded-lg border-2 px-4 py-2 ${choice.tone}`}>
        <span className="flex items-center gap-2 font-semibold">
          <choice.icon className="h-5 w-5" /> {choice.title}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setType(null)}>
          Change
        </Button>
      </div>
      {type === "old" ? (
        <OldPatient onSend={(input, key) => register(input, "old", key)} />
      ) : (
        <PatientIntakeForm
          key={type}
          submitLabel={type === "emergency" ? "Send as emergency" : "Send to doctor"}
          onSave={(input) => register(input, type)}
        />
      )}
    </div>
  );
}

function OldPatient({ onSend }: { onSend: (input: IntakeInput, patientKey: string) => Promise<void> }) {
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<PatientRow | null>(null);

  useEffect(
    () =>
      subscribePatients(
        (next) => {
          setRows(next);
          setError(null);
        },
        (err) => setError(friendlyError(err, "Could not load old patients.")),
      ),
    [],
  );

  // One line per child: their latest visit (rows arrive newest first).
  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    if (q.length < 2) return [];
    const seen = new Set<string>();
    return rows
      .filter((p) => {
        const key = patientKeyOf(p);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.parentName.toLowerCase().includes(q) ||
          (digits.length >= 3 && (p.mobile ?? "").includes(digits)),
      )
      .slice(0, 20);
  }, [rows, term]);

  if (picked) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Last visit {picked.visitAt.replace("T", " ")}. Age is updated to today; check it and enter today's weight.
        </p>
        <PatientIntakeForm
          initial={fromLastVisit(picked)}
          submitLabel="Send to doctor"
          onSave={(input) => onSend(input, patientKeyOf(picked))}
        />
        <Button variant="ghost" className="self-start" onClick={() => setPicked(null)}>
          Search again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          className="pl-9"
          placeholder="Type name or mobile number"
          aria-label="Search old patient"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {term.trim().length >= 2 && matches.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No old patient found. Use New OPD instead.</p>
      )}
      {matches.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPicked(p)}
                className="flex w-full flex-col gap-0.5 p-3 text-left hover:bg-muted"
              >
                <span className="font-medium">
                  {p.name} <span className="font-normal text-muted-foreground">· {formatAge(p.age)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {[p.parentName, p.mobile, `last visit ${p.visitAt.slice(0, 10)}`].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
