import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type IntakeForm = {
  patientName: string;
  age: string;
  address: string;
  parentName: string;
  weight: string;
  dateTime: string;
};

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function nowForInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = (): IntakeForm => ({
  patientName: "",
  age: "",
  address: "",
  parentName: "",
  weight: "",
  dateTime: nowForInput(),
});

export default function PatientIntakeForm() {
  const [form, setForm] = useState<IntakeForm>(emptyForm);
  const [submitted, setSubmitted] = useState<IntakeForm | null>(null);

  const update = (key: keyof IntakeForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // No backend is deployed, so the entry is shown here and not stored anywhere.
    setSubmitted(form);
    setForm(emptyForm());
  };

  return (
    <div className="w-full max-w-md text-left">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="patientName">Patient name</Label>
          <Input id="patientName" value={form.patientName} onChange={update("patientName")} required />
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
          <Label htmlFor="dateTime">Date and time</Label>
          <Input id="dateTime" type="datetime-local" value={form.dateTime} onChange={update("dateTime")} required />
        </div>
        <Button type="submit" size="lg">Submit</Button>
      </form>

      {submitted && (
        <div className="mt-6 rounded-md border p-4 text-sm">
          <p className="font-medium mb-2">Entry received</p>
          <p>Name: {submitted.patientName}</p>
          <p>Age: {submitted.age}</p>
          <p>Address: {submitted.address}</p>
          <p>Mother / Father: {submitted.parentName}</p>
          <p>Weight: {submitted.weight} kg</p>
          <p>Date and time: {submitted.dateTime.replace("T", " ")}</p>
        </div>
      )}
    </div>
  );
}
