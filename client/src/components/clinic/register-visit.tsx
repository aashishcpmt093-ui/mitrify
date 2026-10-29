import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, Search, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import PatientIntakeForm from "@/components/patient-intake-form";
import BackButton from "@/components/clinic/back-button";
import { useBackStep } from "@/lib/back-step";
import {
  ageNow,
  formatAge,
  friendlyError,
  patientKeyOf,
  saveIntake,
  searchPatients,
  type IntakeInput,
  type PatientRow,
  type VisitType,
} from "@/lib/clinic";

const CHOICES: {
  type: VisitType;
  title: string;
  detail: string;
  icon: typeof UserPlus;
  tone: string;
}[] = [
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
export default function RegisterVisit({
  uid,
  onClose,
}: {
  uid: string;
  onClose?: () => void;
}) {
  const [type, setType] = useState<VisitType | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Tapped the wrong type? Back (on screen or the phone's) returns to the three choices.
  useBackStep(type !== null, () => setType(null));

  const register = async (
    input: IntakeInput,
    visitType: VisitType,
    patientKey?: string,
  ) => {
    const token = await saveIntake(input, { source: "staff", uid, visitType, patientKey });
    setNotice(
      `${input.name.trim()} has been sent to the doctor${visitType === "emergency" ? " as EMERGENCY" : ""}.` +
        (token ? ` Token number ${token}.` : ""),
    );
    setType(null);
  };

  if (!type) {
    return (
      <div className="flex w-full flex-col gap-4">
        {onClose && <BackButton onClick={onClose} label="Back to patients" />}
        {notice && (
          <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">
            ✓ {notice}
          </p>
        )}
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
      </div>
    );
  }

  const choice = CHOICES.find((c) => c.type === type)!;
  return (
    <div className="flex w-full flex-col gap-4">
      <BackButton onClick={() => setType(null)} label="Back to visit type" />
      <div
        className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 font-semibold ${choice.tone}`}
      >
        <choice.icon className="h-5 w-5" /> {choice.title}
      </div>
      {type === "old" ? (
        <OldPatient onSend={(input, key) => register(input, "old", key)} />
      ) : (
        <PatientIntakeForm
          key={type}
          submitLabel={
            type === "emergency" ? "Send as emergency" : "Send to doctor"
          }
          onSave={(input) => register(input, type)}
        />
      )}
    </div>
  );
}

function OldPatient({
  onSend,
}: {
  onSend: (input: IntakeInput, patientKey: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<PatientRow | null>(null);
  useBackStep(picked !== null, () => setPicked(null));

  // Searches once typing pauses, and only the matching patients are downloaded.
  useEffect(() => {
    if (term.trim().length < 2) {
      setRows([]);
      return;
    }
    let current = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchPatients(term)
        .then((found) => {
          if (!current) return;
          setRows(found);
          setError(null);
        })
        .catch(
          (err) =>
            current &&
            setError(friendlyError(err, "Could not search old patients.")),
        )
        .finally(() => current && setSearching(false));
    }, 400);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term]);

  // One line per child: their latest visit (results arrive newest first).
  const matches = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((p) => {
      const key = patientKeyOf(p);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rows]);

  if (picked) {
    return (
      <div className="flex flex-col gap-3">
        <BackButton onClick={() => setPicked(null)} label="Back to search" />
        <p className="text-sm text-muted-foreground">
          Last visit {picked.visitAt.replace("T", " ")}. Age is updated to
          today; check it and enter today's weight.
        </p>
        <PatientIntakeForm
          initial={fromLastVisit(picked)}
          submitLabel="Send to doctor"
          onSave={(input) => onSend(input, patientKeyOf(picked))}
        />
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
          placeholder="Type name or mobile number (first letters)"
          aria-label="Search old patient"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {searching && (
        <p className="text-sm text-muted-foreground">Searching...</p>
      )}
      {term.trim().length >= 2 &&
        !searching &&
        matches.length === 0 &&
        !error && (
          <p className="text-sm text-muted-foreground">
            No old patient found. Use New OPD instead.
          </p>
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
                  {p.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {formatAge(p.age)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {[
                    p.parentName,
                    p.mobile,
                    `last visit ${p.visitAt.slice(0, 10)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
