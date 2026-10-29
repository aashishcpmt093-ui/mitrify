import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { RememberedDrug } from "@/lib/clinic";
import {
  COMMON_DRUGS,
  FORMS,
  FREQUENCIES,
  doseSuggestions,
  emptyMedicine,
  isFilled,
  suggestDose,
  type MedicineItem,
} from "@/lib/medicines";

type Props = {
  items: MedicineItem[];
  onChange: (items: MedicineItem[]) => void;
  drugs: RememberedDrug[];
  // The child's weight, for doses from mg/kg saved in Memories. Omit where there is no patient.
  weightKg?: number;
};

// There is always one empty row at the end, so the next medicine can be typed straight away.
export function withTrailingRow(items: MedicineItem[]): MedicineItem[] {
  const kept = items.filter((item, i) => isFilled(item) || i === items.length - 1);
  return kept.length && !isFilled(kept[kept.length - 1]) ? kept : [...kept, emptyMedicine()];
}

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// Mobile: form + drug on one line, dose + frequency + days below. Desktop: all on one line.
const rowGrid = "grid grid-cols-6 md:grid-cols-[6.5rem_minmax(0,1fr)_8.5rem_6rem_4.5rem_2.25rem] gap-2 items-center";

export default function MedicineRows({ items, onChange, drugs, weightKg = 0 }: Props) {
  const findDrug = (name: string) => drugs.find((d) => d.name.toLowerCase() === name.trim().toLowerCase());
  const update = (index: number, patch: Partial<MedicineItem>) => {
    onChange(withTrailingRow(items.map((item, i) => (i === index ? { ...item, ...patch } : item))));
  };

  // Picking a remembered drug fills in how it is given, without overwriting what is typed. A drug with
  // mg/kg in Memories gets its dose worked out from this child's weight instead of the last dose.
  const setName = (index: number, name: string) => {
    const known = findDrug(name);
    const item = items[index];
    const form = item.form || known?.form || "";
    const byWeight = known ? suggestDose(form, known, weightKg) : null;
    update(index, {
      name,
      ...(known && {
        form,
        dose: item.dose || byWeight?.dose || known.dose,
        frequency: item.frequency || known.frequency,
        days: item.days || known.days,
      }),
    });
  };

  // Built-in names fill the gaps until the doctor's own drugs are remembered.
  const ownNames = new Set(drugs.map((d) => d.name.toLowerCase()));
  const builtIn = COMMON_DRUGS.filter((n) => !ownNames.has(n.toLowerCase()));

  const remove = (index: number) => onChange(withTrailingRow(items.filter((_, i) => i !== index)));

  return (
    <div className="flex flex-col gap-3">
      <datalist id="drug-memory">
        {drugs.map((d) => (
          <option key={d.name} value={d.name}>
            {[d.form, d.mgPerKg ? `${d.mgPerKg} mg/kg` : d.dose, d.frequency].filter(Boolean).join(" ")}
          </option>
        ))}
        {builtIn.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="frequency-list">
        {FREQUENCIES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.hint}
          </option>
        ))}
      </datalist>

      <div className={`${rowGrid} hidden md:grid text-xs font-medium text-muted-foreground`}>
        <span>Form</span>
        <span>Drug name</span>
        <span>Dose</span>
        <span>Frequency</span>
        <span>Days</span>
        <span />
      </div>

      {items.map((item, index) => {
        const last = index === items.length - 1;
        const known = isFilled(item) ? findDrug(item.name) : undefined;
        const byWeight = known ? suggestDose(item.form || known.form, known, weightKg) : null;
        return (
          <div key={index} className="flex flex-col gap-1 border-b pb-3 md:border-0 md:pb-0">
          <div className={rowGrid}>
            <select
              aria-label="Form"
              className={`${selectClass} col-span-2 md:col-span-1`}
              value={item.form}
              onChange={(e) => update(index, { form: e.target.value })}
            >
              <option value="">Form</option>
              {FORMS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
              {item.form && !(FORMS as readonly string[]).includes(item.form) && (
                <option value={item.form}>{item.form}</option>
              )}
            </select>

            <Input
              aria-label="Drug name"
              className="col-span-4 md:col-span-1"
              list="drug-memory"
              autoComplete="off"
              placeholder={last ? "Type drug name" : "Drug name"}
              value={item.name}
              onChange={(e) => setName(index, e.target.value)}
            />

            <datalist id={`dose-${index}`}>
              {doseSuggestions(item.form).map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <Input
              aria-label="Dose"
              className="col-span-2 md:col-span-1"
              list={`dose-${index}`}
              autoComplete="off"
              placeholder="Dose"
              value={item.dose}
              onChange={(e) => update(index, { dose: e.target.value })}
            />

            <Input
              aria-label="Frequency"
              className="col-span-2 md:col-span-1"
              list="frequency-list"
              autoComplete="off"
              placeholder="OD/BD/TDS"
              value={item.frequency}
              onChange={(e) => {
                // "tds" becomes "TDS"; anything else is kept as typed.
                const known = FREQUENCIES.find((f) => f.value.toLowerCase() === e.target.value.trim().toLowerCase());
                update(index, { frequency: known ? known.value : e.target.value });
              }}
            />

            <Input
              aria-label="Days"
              className="col-span-1"
              inputMode="numeric"
              placeholder="Days"
              value={item.days}
              onChange={(e) => update(index, { days: e.target.value.replace(/[^0-9]/g, "") })}
            />

            <button
              type="button"
              aria-label="Remove medicine"
              onClick={() => remove(index)}
              disabled={last && !isFilled(item)}
              className="col-span-1 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {byWeight && (
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
              <span>
                By weight: <strong>{byWeight.dose}</strong> ({byWeight.explain})
              </span>
              {item.dose.trim() !== byWeight.dose && (
                <button type="button" className="underline" onClick={() => update(index, { dose: byWeight.dose })}>
                  Use {byWeight.dose}
                </button>
              )}
            </p>
          )}
          </div>
        );
      })}
    </div>
  );
}
