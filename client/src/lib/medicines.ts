// Structured medicine lines for the prescription: form, drug, dose, frequency, days.

export type MedicineItem = {
  form: string; // "Syp", "Tab", ... printed before the drug name
  name: string;
  dose: string; // free text: "5 ml", "1/2", "1 respule"
  frequency: string; // "TDS", "BD", or anything typed
  days: string; // number of days, may be empty
};

export const emptyMedicine = (): MedicineItem => ({ form: "", name: "", dose: "", frequency: "", days: "" });

export const isFilled = (item: MedicineItem) => item.name.trim() !== "";

// Dosage forms seen on paediatric prescriptions. The value is what gets printed.
export const FORMS = [
  "Tab", "Cap", "Syp", "Susp", "Drop", "Inj", "Neb", "Inhaler", "Rotacap", "Oint", "Cream", "Gel",
  "Lotion", "Powder", "Sachet", "Spray", "Nasal drop", "Eye drop", "Ear drop", "Supp", "Gargle",
  "Lozenge", "Soap", "Shampoo",
] as const;

const DOSE_BY_FORM: Record<string, string[]> = {
  Tab: ["1/4", "1/2", "1", "2"],
  Cap: ["1", "2"],
  Rotacap: ["1"],
  Lozenge: ["1"],
  Syp: ["2.5 ml", "3 ml", "4 ml", "5 ml", "7.5 ml", "10 ml"],
  Susp: ["2.5 ml", "3 ml", "4 ml", "5 ml", "7.5 ml", "10 ml"],
  Drop: ["0.3 ml", "0.5 ml", "0.6 ml", "0.8 ml", "1 ml"],
  "Nasal drop": ["1 drop", "2 drops"],
  "Eye drop": ["1 drop", "2 drops"],
  "Ear drop": ["2 drops", "3 drops"],
  Neb: ["1/2 respule", "1 respule", "1 ml + 2 ml NS"],
  Inhaler: ["1 puff", "2 puffs"],
  Spray: ["1 spray", "2 sprays"],
  Inj: ["250 mg", "500 mg", "1 g"],
  Oint: ["L/A"],
  Cream: ["L/A"],
  Gel: ["L/A"],
  Lotion: ["L/A"],
  Powder: ["L/A", "1 sachet"],
  Sachet: ["1/2 sachet", "1 sachet"],
  Supp: ["1"],
  Gargle: ["10 ml"],
};

export const doseSuggestions = (form: string): string[] => DOSE_BY_FORM[form] ?? ["1/4", "1/2", "1", "5 ml"];

export const FREQUENCIES: { value: string; hint: string }[] = [
  { value: "OD", hint: "once a day" },
  { value: "BD", hint: "twice a day" },
  { value: "TDS", hint: "three times a day" },
  { value: "QID", hint: "four times a day" },
  { value: "HS", hint: "at bedtime" },
  { value: "SOS", hint: "when needed" },
  { value: "STAT", hint: "immediately" },
  { value: "Q4H", hint: "every 4 hours" },
  { value: "Q6H", hint: "every 6 hours" },
  { value: "Q8H", hint: "every 8 hours" },
  { value: "Alt day", hint: "alternate days" },
  { value: "Weekly", hint: "once a week" },
];

// One printed line, e.g. "Syp Paracetamol  5 ml  TDS  x 5 days".
export function medicineLine(item: MedicineItem): string {
  const days = item.days.trim();
  return [
    [item.form, item.name].filter(Boolean).join(" "),
    item.dose,
    item.frequency,
    days ? `x ${days} ${days === "1" ? "day" : "days"}` : "",
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("  ");
}

// Older prescriptions saved only text; turn each line into a row so it can be edited and reprinted.
export function itemsFromText(text: string): MedicineItem[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ ...emptyMedicine(), name: line }));
}

// ---- Weight-based dosing from the doctor's medicine memory -------------------------------------

// Forms dosed by volume: the dose is shown in ml. Everything else is shown in mg.
export const LIQUID_FORMS = new Set(["Syp", "Susp", "Drop", "Gargle"]);

// How the doctor gives a drug, saved in Memories. Strength is what is printed on the bottle,
// e.g. 120 mg in 5 ml; tablets and capsules only need the mg per kg.
export type DrugDosing = {
  strengthMg?: number | null;
  strengthMl?: number | null;
  mgPerKg?: number | null; // per dose
  maxMg?: number | null; // per dose
};

const round = (value: number, step: number) => Math.round(value / step) * step;
const trim = (n: number) => String(Number(n.toFixed(2)));

// Dose for this child's weight, or null when the memory has no mg/kg or the weight is unknown.
export function suggestDose(
  form: string,
  dosing: DrugDosing,
  weightKg: number,
): { dose: string; explain: string } | null {
  if (!dosing.mgPerKg || !weightKg) return null;
  const raw = dosing.mgPerKg * weightKg;
  const capped = dosing.maxMg ? Math.min(raw, dosing.maxMg) : raw;
  const basis = `${trim(dosing.mgPerKg)} mg/kg × ${trim(weightKg)} kg = ${trim(raw)} mg${capped < raw ? `, capped at ${trim(capped)} mg` : ""}`;

  if (LIQUID_FORMS.has(form) && dosing.strengthMg && dosing.strengthMl) {
    const ml = capped / (dosing.strengthMg / dosing.strengthMl);
    // Drops are measured to 0.1 ml; syrups to 0.5 ml, but never rounded down to nothing.
    const step = form === "Drop" ? 0.1 : 0.5;
    const shown = Math.max(step, round(ml, step));
    return {
      dose: `${trim(shown)} ml`,
      explain: `${basis} → ${trim(ml)} ml of ${trim(dosing.strengthMg)} mg/${trim(dosing.strengthMl)} ml`,
    };
  }
  const mg = capped >= 10 ? round(capped, 5) : round(capped, 0.5);
  return { dose: `${trim(mg)} mg`, explain: basis };
}

// ---- Built-in suggestions so typing works from the first day ------------------------------------

// Common paediatric generics in India (names only; doses always come from the doctor).
export const COMMON_DRUGS = [
  "Paracetamol", "Ibuprofen", "Mefenamic acid", "Amoxicillin", "Amoxicillin + Clavulanic acid", "Azithromycin",
  "Cefixime", "Cefpodoxime", "Cefuroxime", "Cephalexin", "Cefadroxil", "Ofloxacin", "Ciprofloxacin", "Metronidazole",
  "Nitazoxanide", "Albendazole", "Ivermectin", "Cetirizine", "Levocetirizine", "Fexofenadine", "Chlorpheniramine",
  "Montelukast", "Montelukast + Levocetirizine", "Salbutamol", "Levosalbutamol", "Ipratropium", "Budesonide",
  "Fluticasone", "Prednisolone", "Dexamethasone", "Ambroxol", "Dextromethorphan", "Guaifenesin", "Ondansetron",
  "Domperidone", "ORS", "Zinc", "Racecadotril", "Lactulose", "Polyethylene glycol", "Probiotic (Saccharomyces)",
  "Ranitidine", "Famotidine", "Omeprazole", "Pantoprazole", "Rabeprazole", "Simethicone", "Dicyclomine",
  "Drotaverine", "Iron (Ferrous)", "Folic acid", "Vitamin D3", "Calcium", "Multivitamin", "Vitamin A", "Vitamin C",
  "B-complex", "Saline nasal drops", "Oxymetazoline", "Xylometazoline", "Hypertonic saline 3%", "Normal saline",
  "Mupirocin", "Fusidic acid", "Clotrimazole", "Permethrin", "Calamine", "Hydrocortisone", "Betamethasone",
  "Ciprofloxacin eye drops", "Moxifloxacin eye drops", "Tobramycin", "Chloramphenicol", "Fluconazole", "Nystatin",
  "Acyclovir", "Oseltamivir", "Phenobarbitone", "Levetiracetam", "Sodium valproate", "Diazepam", "Midazolam",
];

// Common presenting complaints, offered while typing in the complaints box.
export const COMMON_COMPLAINTS = [
  "Fever", "Cough", "Cold / running nose", "Sore throat", "Fast breathing", "Wheezing", "Vomiting", "Loose motions",
  "Pain abdomen", "Constipation", "Not feeding well", "Poor weight gain", "Rash", "Itching", "Ear pain",
  "Ear discharge", "Eye redness", "Headache", "Body ache", "Seizure", "Lethargy", "Excessive crying",
  "Burning micturition", "Jaundice", "Bleeding", "Swelling", "Joint pain", "Belching / gas",
];
