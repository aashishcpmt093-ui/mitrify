import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError, type IntakeInput } from "@/lib/clinic";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function nowForInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Keeps the 10-digit number when "+91 98765 43210" or "098765..." is typed or pasted.
function tenDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

const emptyForm = (): IntakeInput => ({
  name: "",
  ageDays: "",
  ageMonths: "",
  ageYears: "",
  address: "",
  parentName: "",
  mobile: "",
  weight: "",
  visitAt: nowForInput(),
});

type Props = {
  onSave: (input: IntakeInput) => Promise<void>;
  // Details to start from, e.g. a returning patient's last visit. Visit time is always now.
  initial?: Partial<IntakeInput>;
  submitLabel?: string;
};

export default function PatientIntakeForm({ onSave, initial, submitLabel = "Submit" }: Props) {
  const [form, setForm] = useState<IntakeInput>(() => ({ ...emptyForm(), ...initial, visitAt: nowForInput() }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const update = (key: keyof IntakeInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await onSave(form);
      setForm(emptyForm());
      setMessage({ kind: "ok", text: "Saved. The doctor can now see this entry." });
    } catch (err) {
      setMessage({ kind: "error", text: friendlyError(err, "Could not save. Try again.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md text-left">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Patient name</Label>
          <Input id="name" value={form.name} onChange={update("name")} required />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium mb-2">Age (leave 0 where not needed)</legend>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="ageDays">Days</Label>
              <Input id="ageDays" type="number" inputMode="numeric" min="0" max="31" placeholder="0" value={form.ageDays} onChange={update("ageDays")} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ageMonths">Months</Label>
              <Input id="ageMonths" type="number" inputMode="numeric" min="0" max="11" placeholder="0" value={form.ageMonths} onChange={update("ageMonths")} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ageYears">Years</Label>
              <Input id="ageYears" type="number" inputMode="numeric" min="0" max="120" placeholder="0" value={form.ageYears} onChange={update("ageYears")} />
            </div>
          </div>
        </fieldset>
        <div className="flex flex-col gap-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={form.address} onChange={update("address")} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="parentName">Mother / Father name</Label>
          <Input id="parentName" value={form.parentName} onChange={update("parentName")} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mobile">Mobile number</Label>
          <Input
            id="mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="10 digit mobile number"
            pattern="[0-9]{10}"
            title="Enter a 10 digit mobile number"
            value={form.mobile}
            onChange={(e) => setForm((prev) => ({ ...prev, mobile: tenDigits(e.target.value) }))}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="weight">Weight (kg)</Label>
          <Input id="weight" type="number" min="0" step="0.1" value={form.weight} onChange={update("weight")} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="visitAt">Date and time</Label>
          <Input id="visitAt" type="datetime-local" value={form.visitAt} onChange={update("visitAt")} required />
        </div>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving..." : submitLabel}
        </Button>
      </form>

      {message && (
        <p className={`mt-4 text-sm ${message.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{message.text}</p>
      )}
    </div>
  );
}
