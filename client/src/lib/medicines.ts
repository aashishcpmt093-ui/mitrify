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
