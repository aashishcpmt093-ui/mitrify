import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntakeInput } from "@/lib/clinic";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function nowForInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = (): IntakeInput => ({
  name: "",
  age: "",
  address: "",
  parentName: "",
  weight: "",
  visitAt: nowForInput(),
});

type Props = {
  onSave: (input: IntakeInput) => Promise<void>;
};

export default function PatientIntakeForm({ onSave }: Props) {
  const [form, setForm] = useState<IntakeInput>(emptyForm);
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
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not save. Try again." });
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="age">Age</Label>
          <Input id="age" type="number" min="0" value={form.age} onChange={update("age")} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={form.address} onChange={update("address")} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="parentName">Mother / Father name</Label>
          <Input id="parentName" value={form.parentName} onChange={update("parentName")} required />
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
          {busy ? "Saving..." : "Submit"}
        </Button>
      </form>

      {message && (
        <p className={`mt-4 text-sm ${message.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{message.text}</p>
      )}
    </div>
  );
}
