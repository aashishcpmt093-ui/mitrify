import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MedicineRows, { withTrailingRow } from "@/components/clinic/medicine-rows";
import { useBackStep } from "@/lib/back-step";
import {
  deleteDrug,
  deleteTemplate,
  friendlyError,
  listDrugs,
  listTemplates,
  saveLibraryDrug,
  saveTemplateRecord,
  type DiagnosisTemplate,
  type RememberedDrug,
} from "@/lib/clinic";
import {
  COMMON_DRUGS,
  FORMS,
  FREQUENCIES,
  LIQUID_FORMS,
  emptyMedicine,
  isFilled,
  medicineLine,
  suggestDose,
} from "@/lib/medicines";

// Memories: the doctor's own medicine list (with weight-based dosing) and saved prescriptions.
export default function Memories() {
  const [section, setSection] = useState<"medicines" | "prescriptions">("medicines");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button size="sm" variant={section === "medicines" ? "default" : "outline"} onClick={() => setSection("medicines")}>
          Medicines
        </Button>
        <Button
          size="sm"
          variant={section === "prescriptions" ? "default" : "outline"}
          onClick={() => setSection("prescriptions")}
        >
          Saved prescriptions
        </Button>
      </div>
      {section === "medicines" ? <MedicineLibrary /> : <SavedPrescriptions />}
    </div>
  );
}

// ---- Medicines --------------------------------------------------------------------------------

type DrugForm = {
  form: string;
  name: string;
  strengthMg: string;
  strengthMl: string;
  mgPerKg: string;
  maxMg: string;
  dose: string;
  frequency: string;
  days: string;
};

const emptyDrugForm = (): DrugForm => ({
  form: "Syp",
  name: "",
  strengthMg: "",
  strengthMl: "5",
  mgPerKg: "",
  maxMg: "",
  dose: "",
  frequency: "",
  days: "",
});

const toNumber = (s: string) => (s.trim() ? Number(s) : null);

function drugSummary(d: RememberedDrug): string {
  return [
    d.strengthMg && d.strengthMl ? `${d.strengthMg} mg/${d.strengthMl} ml` : "",
    d.mgPerKg ? `${d.mgPerKg} mg/kg per dose${d.maxMg ? ` (max ${d.maxMg} mg)` : ""}` : d.dose,
    d.frequency,
    d.days ? `x ${d.days} days` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function MedicineLibrary() {
  const [drugs, setDrugs] = useState<RememberedDrug[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ form: DrugForm; previousName?: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useBackStep(editing !== null, () => setEditing(null));
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    listDrugs()
      .then((list) => setDrugs([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((err) => setMessage(friendlyError(err, "Could not load medicines.")));
  useEffect(() => {
    refresh();
  }, []);

  const startEdit = (d?: RememberedDrug) => {
    setMessage(null);
    setEditing(
      d
        ? {
            previousName: d.name,
            form: {
              form: d.form || "",
              name: d.name,
              strengthMg: d.strengthMg ? String(d.strengthMg) : "",
              strengthMl: d.strengthMl ? String(d.strengthMl) : LIQUID_FORMS.has(d.form) ? "5" : "",
              mgPerKg: d.mgPerKg ? String(d.mgPerKg) : "",
              maxMg: d.maxMg ? String(d.maxMg) : "",
              dose: d.dose || "",
              frequency: d.frequency || "",
              days: d.days || "",
            },
          }
        : { form: emptyDrugForm() },
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const f = editing.form;
    setBusy(true);
    setMessage(null);
    try {
      await saveLibraryDrug(
        {
          name: f.name,
          form: f.form,
          dose: f.dose,
          frequency: f.frequency,
          days: f.days,
          strengthMg: LIQUID_FORMS.has(f.form) ? toNumber(f.strengthMg) : null,
          strengthMl: LIQUID_FORMS.has(f.form) ? toNumber(f.strengthMl) : null,
          mgPerKg: toNumber(f.mgPerKg),
          maxMg: toNumber(f.maxMg),
        },
        editing.previousName,
      );
      setEditing(null);
      setMessage(`${f.name} saved.`);
      refresh();
    } catch (err) {
      setMessage(friendlyError(err, "Could not save the medicine."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: RememberedDrug) => {
    if (!window.confirm(`Delete ${d.name} from memory?`)) return;
    try {
      await deleteDrug(d.name);
      refresh();
    } catch (err) {
      setMessage(friendlyError(err, "Could not delete."));
    }
  };

  if (editing) {
    const f = editing.form;
    const set = (patch: Partial<DrugForm>) => setEditing({ ...editing, form: { ...f, ...patch } });
    const liquid = LIQUID_FORMS.has(f.form);
    const example = suggestDose(
      f.form,
      { strengthMg: toNumber(f.strengthMg), strengthMl: toNumber(f.strengthMl), mgPerKg: toNumber(f.mgPerKg), maxMg: toNumber(f.maxMg) },
      10,
    );
    return (
      <form onSubmit={save} className="flex flex-col gap-4 max-w-xl">
        <h2 className="text-lg font-medium">{editing.previousName ? `Edit ${editing.previousName}` : "Add medicine"}</h2>
        <datalist id="library-drug-names">
          {COMMON_DRUGS.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <datalist id="library-frequency">
          {FREQUENCIES.map((x) => (
            <option key={x.value} value={x.value}>
              {x.hint}
            </option>
          ))}
        </datalist>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="lib-form">Form</Label>
            <select
              id="lib-form"
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              value={f.form}
              onChange={(e) => set({ form: e.target.value, strengthMl: LIQUID_FORMS.has(e.target.value) ? f.strengthMl || "5" : "" })}
            >
              {FORMS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <Label htmlFor="lib-name">Drug name</Label>
            <Input id="lib-name" list="library-drug-names" value={f.name} onChange={(e) => set({ name: e.target.value })} required />
          </div>
        </div>

        {liquid && (
          <div className="flex flex-col gap-1">
            <Label>Strength (as on the bottle)</Label>
            <div className="flex items-center gap-2 text-sm">
              <Input aria-label="Strength mg" inputMode="decimal" className="w-24" value={f.strengthMg} onChange={(e) => set({ strengthMg: e.target.value })} placeholder="120" />
              <span>mg in</span>
              <Input aria-label="Strength ml" inputMode="decimal" className="w-20" value={f.strengthMl} onChange={(e) => set({ strengthMl: e.target.value })} placeholder="5" />
              <span>ml</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="lib-mgkg">Dose (mg per kg, per dose)</Label>
            <Input id="lib-mgkg" inputMode="decimal" value={f.mgPerKg} onChange={(e) => set({ mgPerKg: e.target.value })} placeholder="15" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="lib-max">Max per dose (mg, optional)</Label>
            <Input id="lib-max" inputMode="decimal" value={f.maxMg} onChange={(e) => set({ maxMg: e.target.value })} placeholder="500" />
          </div>
        </div>

        {!f.mgPerKg.trim() && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="lib-dose">Fixed dose (if not by weight)</Label>
            <Input id="lib-dose" value={f.dose} onChange={(e) => set({ dose: e.target.value })} placeholder="e.g. 1 sachet, L/A" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="lib-freq">Frequency</Label>
            <Input id="lib-freq" list="library-frequency" value={f.frequency} onChange={(e) => set({ frequency: e.target.value })} placeholder="TDS" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="lib-days">Days</Label>
            <Input id="lib-days" inputMode="numeric" value={f.days} onChange={(e) => set({ days: e.target.value.replace(/[^0-9]/g, "") })} placeholder="3" />
          </div>
        </div>

        {example && (
          <p className="text-sm rounded-md bg-muted p-3">
            Example for a 10 kg child: <strong>{example.dose}</strong> ({example.explain})
          </p>
        )}
        {liquid && f.mgPerKg.trim() && !example && (
          <p className="text-sm text-amber-700">Add the strength (mg in ml) so the dose can be given in ml.</p>
        )}

        {message && <p className="text-sm text-red-600">{message}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save medicine"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  const shown = drugs.filter((d) => d.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Save how you give each medicine. With a dose in mg/kg, the prescription works out the dose from the child's
        weight: syrups and drops in ml, tablets and capsules in mg. Medicines you prescribe are added here on their own.
      </p>
      <div className="flex gap-2">
        <Input placeholder="Search medicines" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button type="button" onClick={() => startEdit()}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No medicines yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {shown.map((d) => (
            <li key={d.name} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div>
                <p>
                  {d.form && <span>{d.form} </span>}
                  <span className="font-medium">{d.name}</span>
                </p>
                <p className="text-muted-foreground">{drugSummary(d) || "No dose saved yet"}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${d.name}`} onClick={() => startEdit(d)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`Delete ${d.name}`} onClick={() => remove(d)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Saved prescriptions ------------------------------------------------------------------------

function SavedPrescriptions() {
  const [templates, setTemplates] = useState<DiagnosisTemplate[]>([]);
  const [drugs, setDrugs] = useState<RememberedDrug[]>([]);
  const [editing, setEditing] = useState<{ t: DiagnosisTemplate; previous?: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useBackStep(editing !== null, () => setEditing(null));
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    listTemplates()
      .then(setTemplates)
      .catch((err) => setMessage(friendlyError(err, "Could not load saved prescriptions.")));
  useEffect(() => {
    refresh();
    listDrugs().then(setDrugs).catch(() => setDrugs([]));
  }, []);

  const start = (t?: DiagnosisTemplate) => {
    setMessage(null);
    setEditing(
      t
        ? { previous: t.diagnosis, t: { ...t, items: withTrailingRow(t.items.map((i) => ({ ...i }))) } }
        : { t: { diagnosis: "", items: [emptyMedicine()], advice: "", investigations: "" } },
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveTemplateRecord(editing.t, editing.previous);
      setEditing(null);
      setMessage(`${editing.t.diagnosis.trim()} saved.`);
      refresh();
    } catch (err) {
      setMessage(friendlyError(err, "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: DiagnosisTemplate) => {
    if (!window.confirm(`Delete the saved prescription for ${t.diagnosis}?`)) return;
    try {
      await deleteTemplate(t.diagnosis);
      refresh();
    } catch (err) {
      setMessage(friendlyError(err, "Could not delete."));
    }
  };

  if (editing) {
    const t = editing.t;
    const set = (patch: Partial<DiagnosisTemplate>) => setEditing({ ...editing, t: { ...t, ...patch } });
    return (
      <form onSubmit={save} className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">{editing.previous ? `Edit ${editing.previous}` : "New saved prescription"}</h2>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tpl-diagnosis">Diagnosis</Label>
          <Input id="tpl-diagnosis" value={t.diagnosis} onChange={(e) => set({ diagnosis: e.target.value })} placeholder="e.g. URTI" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Medicines</Label>
          <p className="text-xs text-muted-foreground">
            Doses of medicines saved with mg/kg are worked out from each patient's weight when this is used.
          </p>
          <MedicineRows items={t.items} onChange={(items) => set({ items })} drugs={drugs} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tpl-inv">Investigations</Label>
          <Textarea id="tpl-inv" rows={2} value={t.investigations} onChange={(e) => set({ investigations: e.target.value })} placeholder="e.g. CBC, CRP" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tpl-advice">Advice</Label>
          <Textarea id="tpl-advice" rows={2} value={t.advice} onChange={(e) => set({ advice: e.target.value })} />
        </div>
        {message && <p className="text-sm text-red-600">{message}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !t.items.some(isFilled)}>
            {busy ? "Saving..." : "Save prescription"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        A saved prescription fills in all its medicines, tests and advice when you pick its diagnosis on a patient.
      </p>
      <Button type="button" className="self-start" onClick={() => start()}>
        <Plus className="h-4 w-4 mr-1" /> New saved prescription
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No saved prescriptions yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {templates.map((t) => (
            <li key={t.diagnosis} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-medium">{t.diagnosis}</p>
                <p className="text-muted-foreground whitespace-pre-line">{t.items.map(medicineLine).join("\n")}</p>
                {t.investigations && <p className="text-muted-foreground">Tests: {t.investigations}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${t.diagnosis}`} onClick={() => start(t)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`Delete ${t.diagnosis}`} onClick={() => remove(t)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
