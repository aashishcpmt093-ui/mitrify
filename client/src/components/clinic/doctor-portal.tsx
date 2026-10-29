import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoginCard from "@/components/clinic/login-card";
import { PRESCRIPTION_PAD } from "@shared/clinic";
import PrescriptionPad, { type PrintMode, type PrintOffset } from "@/components/clinic/prescription-pad";
import { Textarea } from "@/components/ui/textarea";
import MedicineRows, { withTrailingRow } from "@/components/clinic/medicine-rows";
import ComplaintsInput from "@/components/clinic/complaints-input";
import Memories from "@/components/clinic/memories";
import { ChevronDown, ClipboardList } from "lucide-react";
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
  getPadTimings,
  listDrugs,
  listPrescriptions,
  listStaff,
  listTemplates,
  rememberComplaints,
  rememberDrugs,
  savePadTimings,
  saveTemplate,
  savePrescription,
  signIn,
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
    complaints: "",
    diagnosis: "",
    items: [emptyMedicine()],
    advice: "",
    notes: "",
    investigations: "",
    vitals: EMPTY_VITALS,
  });
  const [drugs, setDrugs] = useState<RememberedDrug[]>([]);
  const [timings, setTimings] = useState<string[]>(PRESCRIPTION_PAD.timings);
  const [timingDraft, setTimingDraft] = useState(PRESCRIPTION_PAD.timings.join("\n"));
  const [timingNote, setTimingNote] = useState<string | null>(null);
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
    listPrescriptions(patient.id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [patient.id]);

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
    getPadTimings()
      .then((saved) => {
        if (!saved?.length) return;
        setTimings(saved);
        setTimingDraft(saved.join("\n"));
      })
      .catch(() => undefined);
  }, []);

  const storeTimings = async () => {
    const lines = timingDraft
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    setTimingNote(null);
    try {
      await savePadTimings(lines);
      setTimings(lines);
      setTimingNote("Timing saved. It prints on plain paper and shows in the preview.");
    } catch (err) {
      setTimingNote(friendlyError(err, "Could not save the timing."));
    }
  };

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
      setTemplateNote(`Saved: next time type "${content.diagnosis.trim()}" to fill these medicines.`);
    } catch (err) {
      setTemplateNote(friendlyError(err, "Could not save the template."));
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
      listPrescriptions(patient.id).then(setHistory).catch(() => undefined);
    } catch (err) {
      setError(friendlyError(err, "Could not save prescription."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 print:gap-0">
      <AiAssistant context={aiContext} open={aiOpen} onOpenChange={setAiOpen} onApply={applyAiDraft} />
      <div className="flex flex-col gap-4 print:hidden">
        <p className="text-sm text-muted-foreground">
          {patient.name} · {formatAge(patient.age)} · {patient.weight} kg
          {patient.mobile && ` · ${patient.mobile}`}
        </p>

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
                    No saved prescriptions yet. Add them in Memories, or use "Save as template" below.
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

        <fieldset className="flex flex-col gap-2 rounded-md border p-4">
          <legend className="text-sm font-medium px-1">Clinic timing on the pad</legend>
          <Textarea
            aria-label="Clinic timing, one line each"
            rows={2}
            value={timingDraft}
            onChange={(e) => setTimingDraft(e.target.value)}
            placeholder={"Morning: 10:00 am to 1:00 pm\nEvening: 5:30 pm to 8:00 pm"}
          />
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={storeTimings}>
              Save timing
            </Button>
            {timingNote && <p className="text-xs text-muted-foreground">{timingNote}</p>}
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
          <Button
            variant="outline"
            onClick={storeTemplate}
            disabled={templateBusy || content.diagnosis.trim() === "" || !content.items.some(isFilled)}
            title="Save these medicines for this diagnosis"
          >
            {templateBusy ? "Saving..." : matchedTemplate ? "Update template" : "Save as template"}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Back
          </Button>
        </div>

        <p className="text-sm font-medium">Preview</p>
      </div>

      <PrescriptionPad patient={patient} content={content} mode={print.mode} offset={print.offset} timings={timings} />

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
