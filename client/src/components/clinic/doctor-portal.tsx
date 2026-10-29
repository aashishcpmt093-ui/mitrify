import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoginCard from "@/components/clinic/login-card";
import PrescriptionPad, { type PrintMode, type PrintOffset } from "@/components/clinic/prescription-pad";
import { Textarea } from "@/components/ui/textarea";
import MedicineRows, { withTrailingRow } from "@/components/clinic/medicine-rows";
import ComplaintsInput from "@/components/clinic/complaints-input";
import Memories from "@/components/clinic/memories";
import ClinicProfileForm from "@/components/clinic/clinic-profile";
import RegisterVisit from "@/components/clinic/register-visit";
import BackButton from "@/components/clinic/back-button";
import { useBackStep } from "@/lib/back-step";
import { CheckCircle2, ChevronDown, ClipboardList, Clock, Printer, Search, Settings, UserPlus } from "lucide-react";
import AiAssistant, { AiAssistantButton } from "@/components/clinic/ai-assistant";
import type { AiContext, Provisional } from "@/lib/clinic-ai";
import { emptyMedicine, isFilled, itemsFromText, medicineLine, suggestDose, type MedicineItem } from "@/lib/medicines";
import {
  auth,
  createStaff,
  EMPTY_VITALS,
  formatAge,
  friendlyError,
  findTemplate,
  getComplaintMemory,
  useClinicProfile,
  listDrugs,
  listPrescriptions,
  listStaff,
  listTemplates,
  markSeen,
  rememberComplaints,
  rememberDrugs,
  saveTemplate,
  savePrescription,
  signIn,
  searchPatients,
  subscribePatients,
  useClinicSession,
  type DiagnosisTemplate,
  type PatientRow,
  type PrescriptionContent,
  type PrescriptionRow,
  type Profile,
  type RememberedDrug,
  type Vitals,
} from "@/lib/clinic";

type Tab = "patients" | "memories" | "staff";

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
  // From Memories or Staff, the phone's back button returns to Patients.
  useBackStep(tab !== "patients", () => setTab("patients"));

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
        <Button variant={tab === "memories" ? "default" : "outline"} onClick={() => setTab("memories")}>
          Memories
        </Button>
        <Button variant={tab === "staff" ? "default" : "outline"} onClick={() => setTab("staff")}>
          Staff
        </Button>
      </div>
      {tab === "patients" && <PatientList uid={uid} />}
      {tab === "memories" && <Memories />}
      {tab === "staff" && <StaffManager />}
    </div>
  );
}

type View = "list" | "register" | "profile";
type StatusFilter = "all" | "queue" | "seen" | "emergency";
type SortOrder = "queue" | "newest" | "oldest" | "name";

const isEmergency = (p: PatientRow) => p.visitType === "emergency";
const isSeen = (p: PatientRow) => p.status === "prescribed";

// Queue order: emergencies waiting, then others waiting in the order they came, then those already seen.
function queueRank(p: PatientRow) {
  if (isSeen(p)) return 2;
  return isEmergency(p) ? 0 : 1;
}
const visitTime = (p: PatientRow) => p.createdAt?.toMillis() ?? (Date.parse(p.visitAt) || 0);

const SORTERS: Record<SortOrder, (a: PatientRow, b: PatientRow) => number> = {
  queue: (a, b) =>
    queueRank(a) - queueRank(b) || (isSeen(a) ? visitTime(b) - visitTime(a) : visitTime(a) - visitTime(b)),
  newest: (a, b) => visitTime(b) - visitTime(a),
  oldest: (a, b) => visitTime(a) - visitTime(b),
  name: (a, b) => a.name.localeCompare(b.name),
};

function PatientList({ uid }: { uid: string }) {
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PatientRow | null>(null);
  const [view, setView] = useState<View>("list");
  const [term, setTerm] = useState("");
  const [todayOnly, setTodayOnly] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOrder>("queue");
  useBackStep(view !== "list", () => setView("list"));

  useEffect(
    () =>
      subscribePatients(
        todayOnly ? "today" : "recent",
        (next) => {
          setRows(next);
          setError(null);
        },
        (err) => setError(friendlyError(err, "Could not load patients.")),
      ),
    [todayOnly],
  );

  // Typing searches every visit ever saved (by name or mobile), downloading only the matches.
  const q = term.trim();
  const [found, setFound] = useState<PatientRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (q.length < 2) {
      setFound(null);
      return;
    }
    let current = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchPatients(q)
        .then((rows) => current && setFound(rows))
        .catch((err) => current && setError(friendlyError(err, "Could not search patients.")))
        .finally(() => current && setSearching(false));
    }, 400);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [q]);

  const searched = found ?? rows;
  const counts = {
    all: searched.length,
    queue: searched.filter((p) => !isSeen(p)).length,
    seen: searched.filter(isSeen).length,
    emergency: searched.filter((p) => isEmergency(p) && !isSeen(p)).length,
  };
  const shown = searched
    .filter((p) =>
      status === "queue" ? !isSeen(p) : status === "seen" ? isSeen(p) : status === "emergency" ? isEmergency(p) && !isSeen(p) : true,
    )
    .sort(SORTERS[sort]);

  if (selected) {
    return (
      <PrescriptionEditor
        patient={selected}
        doctorUid={uid}
        onDone={() => setSelected(null)}
      />
    );
  }

  if (view === "register") return <RegisterVisit uid={uid} onClose={() => setView("list")} />;
  if (view === "profile") return <ClinicProfileForm onDone={() => setView("list")} />;

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "queue", label: "In queue" },
    { key: "seen", label: "Seen" },
    { key: "emergency", label: "Emergency" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setView("register")}>
          <UserPlus className="mr-1.5 h-4 w-4" /> New registration
        </Button>
        <Button variant="outline" onClick={() => setView("profile")}>
          <Settings className="mr-1.5 h-4 w-4" /> Edit profile
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-md border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name or mobile"
            aria-label="Search patients"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                status === f.key
                  ? f.key === "emergency"
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {f.label} ({counts[f.key]})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex overflow-hidden rounded-md border">
            {[true, false].map((t) => (
              <button
                key={String(t)}
                type="button"
                onClick={() => setTodayOnly(t)}
                className={`px-3 py-1 ${todayOnly === t ? "bg-muted font-medium" : ""}`}
              >
                {t ? "Today" : "All days"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Sort</span>
            <select
              aria-label="Sort patients"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOrder)}
              className="h-8 rounded-md border bg-background px-2"
            >
              <option value="queue">Queue order</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <p className="text-red-600">{error}</p>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground">
          {searching
            ? "Searching..."
            : q
              ? "No patient matches."
              : todayOnly && status === "all"
                ? "No patients today yet. Tap \"All days\" to see earlier ones."
                : rows.length === 0
                  ? "No patient entries yet."
                  : "No patient matches."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {shown.map((p) => (
            <li key={p.id} className={isEmergency(p) && !isSeen(p) ? "bg-red-50" : undefined}>
              <button
                type="button"
                onClick={() => setSelected(p)}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted sm:p-4"
              >
                {isSeen(p) ? (
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" aria-label="Seen" />
                ) : (
                  <Clock className={`h-6 w-6 shrink-0 ${isEmergency(p) ? "text-red-600" : "text-amber-500"}`} aria-label="In queue" />
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{p.name}</span>
                    {isEmergency(p) && (
                      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Emergency
                      </span>
                    )}
                    {p.visitType === "old" && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-800">
                        Old
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {formatAge(p.age)} · {p.weight} kg · {todayOnly && !found ? p.visitAt.slice(11, 16) : p.visitAt.replace("T", " ")}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    isSeen(p) ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {isSeen(p) ? "✓ Seen" : "In queue"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
    complaints: "",
    diagnosis: "",
    items: [emptyMedicine()],
    advice: "",
    notes: "",
    investigations: "",
    vitals: EMPTY_VITALS,
  });
  const [drugs, setDrugs] = useState<RememberedDrug[]>([]);
  const profile = useClinicProfile();
  const [templates, setTemplates] = useState<DiagnosisTemplate[]>([]);
  const [complaintMemory, setComplaintMemory] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [print, setPrint] = useState<PrintSettings>(loadPrintSettings);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PrescriptionRow[]>([]);

  useEffect(() => {
    listPrescriptions(patient)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [patient]);

  useEffect(() => {
    listDrugs()
      .then(setDrugs)
      .catch(() => setDrugs([]));
    listTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
    getComplaintMemory()
      .then(setComplaintMemory)
      .catch(() => setComplaintMemory([]));
  }, []);

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

  const isEmpty =
    !content.items.some(isFilled) && content.advice.trim() === "" && content.investigations.trim() === "";
  const hasUnsaved =
    !saved &&
    (!isEmpty || [content.complaints, content.diagnosis, content.notes].some((t) => t.trim() !== ""));

  // Opened the wrong patient? Back returns to the list. Anything written and not saved is checked first.
  const leave = () => {
    if (hasUnsaved && !window.confirm("This prescription is not saved. Go back and lose it?")) return false;
    onDone();
  };
  useBackStep(true, leave);
  useBackStep(aiOpen, () => setAiOpen(false));

  const matchedTemplate = findTemplate(templates, content.diagnosis);
  // Offer the template only when what is written differs from it.
  const drugNames = (items: MedicineItem[]) => items.filter(isFilled).map((i) => i.name.trim().toLowerCase()).join("|");
  const templateDiffers = !!matchedTemplate && drugNames(matchedTemplate.items) !== drugNames(content.items);

  // Copies are made so editing this patient's doses never changes the saved template. Medicines with
  // mg/kg in Memories get their dose worked out for this child's weight.
  const applyTemplate = (t: DiagnosisTemplate) => {
    const forThisChild = t.items.map((item) => {
      const known = drugs.find((d) => d.name.toLowerCase() === item.name.trim().toLowerCase());
      const byWeight = known ? suggestDose(item.form || known.form, known, patient.weight) : null;
      return { ...item, dose: byWeight?.dose ?? item.dose };
    });
    setPickerOpen(false);
    setContent((prev) => ({
      ...prev,
      diagnosis: t.diagnosis,
      items: withTrailingRow(forThisChild),
      advice: t.advice || prev.advice,
      investigations: t.investigations || prev.investigations,
    }));
    setSaved(false);
    setTemplateNote(`Loaded ${t.items.length} medicines for ${t.diagnosis}. Edit doses if needed.`);
  };

  const setDiagnosis = (diagnosis: string) => {
    const t = findTemplate(templates, diagnosis);
    // Fill automatically only while nothing is written yet; otherwise the doctor chooses.
    if (t && !content.items.some(isFilled)) {
      applyTemplate({ ...t, diagnosis });
      return;
    }
    edit({ diagnosis });
    setTemplateNote(null);
  };

  // What the AI may see: no name or address.
  const aiContext: AiContext = {
    age: formatAge(patient.age),
    weightKg: patient.weight,
    vitals: VITAL_FIELDS.filter(({ key }) => content.vitals[key].trim())
      .map(({ key, label }) => `${label} ${content.vitals[key].trim()}`)
      .join(", "),
    diagnosis: content.diagnosis.trim(),
    currentMedicines: content.items.filter(isFilled).map(medicineLine).join("\n"),
  };

  // Copies are made so later edits never change what the AI suggested.
  const applyAiDraft = (draft: Provisional) => {
    setContent((prev) => ({
      ...prev,
      diagnosis: draft.diagnosis || prev.diagnosis,
      items: withTrailingRow(draft.medicines.length ? draft.medicines.map((m) => ({ ...m })) : prev.items),
      advice: draft.advice || prev.advice,
      investigations: draft.investigations || prev.investigations,
    }));
    setSaved(false);
    setTemplateNote(
      `AI's provisional treatment is in the prescription. Check every medicine and dose before saving.${draft.redFlags ? ` Red flags: ${draft.redFlags}` : ""}`,
    );
  };

  const storeTemplate = async () => {
    setTemplateBusy(true);
    setTemplateNote(null);
    try {
      await saveTemplate(content);
      setTemplates(await listTemplates());
      setTemplateNote(`Saved to Memories. Next time pick "${content.diagnosis.trim()}" from Saved ▾ to fill everything.`);
    } catch (err) {
      setTemplateNote(friendlyError(err, "Could not save to Memories."));
    } finally {
      setTemplateBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await savePrescription(patient, content, doctorUid);
      // Stay on the pad so the doctor can print right after saving.
      setSaved(true);
      // Remembering drugs and complaints must never block the prescription itself.
      rememberComplaints(content.complaints.split("\n")).catch(() => undefined);
      rememberDrugs(content.items)
        .then(() => listDrugs().then(setDrugs))
        .catch(() => undefined);
      listPrescriptions(patient).then(setHistory).catch(() => undefined);
    } catch (err) {
      setError(friendlyError(err, "Could not save prescription. It was not marked Seen; press Save prescription to try again."));
    } finally {
      setBusy(false);
    }
  };

  // One tap: the prescription is saved (which marks the patient Seen) and the print dialog opens.
  // Printing starts in the same tap, because phones block a print dialog opened after waiting.
  const printAndSave = () => {
    if (!saved && !busy) void save();
    window.print();
  };

  const [marking, setMarking] = useState(false);
  const seenWithoutPrescription = async () => {
    setMarking(true);
    setError(null);
    try {
      await markSeen(patient.id);
      onDone();
    } catch (err) {
      setError(friendlyError(err, "Could not mark as seen."));
      setMarking(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 print:gap-0">
      <AiAssistant context={aiContext} open={aiOpen} onOpenChange={setAiOpen} onApply={applyAiDraft} />
      <div className="flex flex-col gap-4 print:hidden">
        <BackButton onClick={leave} label="Back to patients" />
        <div>
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {patient.name}
            {patient.visitType === "emergency" && (
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Emergency
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatAge(patient.age)} · {patient.weight} kg
            {patient.mobile && ` · ${patient.mobile}`}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="complaints">Complaints (one per line)</Label>
          <ComplaintsInput value={content.complaints} onChange={(complaints) => edit({ complaints })} remembered={complaintMemory} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="diagnosis">Diagnosis</Label>
            <AiAssistantButton onClick={() => setAiOpen(true)} />
          </div>
          <datalist id="diagnosis-templates">
            {templates.map((t) => (
              <option key={t.diagnosis} value={t.diagnosis}>
                {t.items.length} medicines
              </option>
            ))}
          </datalist>
          {/* The button inside the box opens the saved prescriptions from Memories. */}
          <div className="relative">
            <Input
              id="diagnosis"
              list="diagnosis-templates"
              autoComplete="off"
              placeholder="e.g. URTI, AGE, Fever"
              className="pr-28"
              value={content.diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="absolute right-1 top-1 bottom-1 flex items-center gap-1 rounded px-2 text-xs font-medium bg-muted hover:bg-muted/70"
              aria-expanded={pickerOpen}
            >
              <ClipboardList className="h-3.5 w-3.5" /> Saved
              <ChevronDown className="h-3 w-3" />
            </button>
            {pickerOpen && (
              <div className="absolute right-0 z-30 mt-1 w-72 max-h-72 overflow-y-auto rounded-md border bg-background shadow-lg">
                {templates.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No saved prescriptions yet. Add them in Memories, or use "Save to Memories" below.
                  </p>
                ) : (
                  templates.map((t) => (
                    <button
                      key={t.diagnosis}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-0"
                    >
                      <span className="font-medium">{t.diagnosis}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t.items.map((i) => i.name).join(", ")}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {matchedTemplate && templateDiffers && content.items.some(isFilled) && (
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => applyTemplate(matchedTemplate)}>
              Use saved medicines for {matchedTemplate.diagnosis} ({matchedTemplate.items.length})
            </Button>
          )}
          {templateNote && <p className="text-sm text-muted-foreground">{templateNote}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Medicines</Label>
          <MedicineRows items={content.items} onChange={(items) => edit({ items })} drugs={drugs} weightKg={patient.weight} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="advice">Advice</Label>
          <Textarea
            id="advice"
            rows={2}
            value={content.advice}
            onChange={(e) => edit({ advice: e.target.value })}
            placeholder="e.g. Plenty of fluids. Review after 3 days."
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Extra notes (optional)</Label>
          <Textarea
            id="notes"
            rows={2}
            value={content.notes}
            onChange={(e) => edit({ notes: e.target.value })}
            placeholder="e.g. Refer to district hospital paediatric ward"
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
          <Button variant="outline" onClick={printAndSave} disabled={isEmpty}>
            <Printer className="mr-1.5 h-4 w-4" /> Print
          </Button>
          <Button
            variant="outline"
            onClick={storeTemplate}
            disabled={templateBusy || content.diagnosis.trim() === "" || !content.items.some(isFilled)}
            title="Save this diagnosis with its medicines, tests and advice to Memories"
          >
            {templateBusy ? "Saving..." : matchedTemplate ? "Update in Memories" : "Save to Memories"}
          </Button>
          {patient.status !== "prescribed" && !saved && (
            <Button variant="ghost" onClick={seenWithoutPrescription} disabled={marking || busy}>
              <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />
              {marking ? "Marking..." : "Mark as seen (no prescription)"}
            </Button>
          )}
          <Button variant="ghost" onClick={leave}>
            Back
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Print also saves the prescription and marks the patient ✓ Seen in the queue.
        </p>

        <p className="text-sm font-medium">Preview</p>
      </div>

      <PrescriptionPad patient={patient} content={content} mode={print.mode} offset={print.offset} profile={profile} />

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
                      complaints: h.complaints ?? "",
                      diagnosis: h.diagnosis ?? "",
                      items: withTrailingRow(h.items?.length ? h.items : itemsFromText(h.medicines)),
                      advice: h.advice ?? "",
                      notes: h.notes ?? "",
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
                  {h.diagnosis && <p className="font-medium">{h.diagnosis}</p>}
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
