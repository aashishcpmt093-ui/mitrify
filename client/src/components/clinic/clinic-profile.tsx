import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClinicProfile } from "@shared/clinic";
import { friendlyError, saveClinicProfile, useClinicProfile } from "@/lib/clinic";

type Draft = Omit<ClinicProfile, "addressLines" | "timings"> & { addressLines: string; timings: string };

const toDraft = (p: ClinicProfile): Draft => ({
  ...p,
  addressLines: p.addressLines.join("\n"),
  timings: p.timings.join("\n"),
});

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

// "Edit profile": clinic name shown on all three pages, and the doctor's details printed on every pad.
export default function ClinicProfileForm({ onDone }: { onDone: () => void }) {
  const profile = useClinicProfile();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The saved profile arrives a moment after opening; the form starts from it once it is here.
  const form = draft ?? toDraft(profile);

  const field = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft({ ...form, [key]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveClinicProfile({
        clinicName: form.clinicName.trim(),
        doctorName: form.doctorName.trim(),
        degrees: form.degrees.trim(),
        registration: form.registration.trim(),
        mobile: form.mobile.trim(),
        addressLines: lines(form.addressLines),
        timings: lines(form.timings),
      });
      onDone();
    } catch (err) {
      setError(friendlyError(err, "Could not save the profile."));
    } finally {
      setBusy(false);
    }
  };

  const text = (key: keyof Draft, label: string, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`profile-${key}`}>{label}</Label>
      <Input id={`profile-${key}`} value={form[key]} onChange={field(key)} required />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-md border p-4">
      <div>
        <h2 className="text-lg font-semibold">Edit profile</h2>
        <p className="text-sm text-muted-foreground">These details print on every prescription.</p>
      </div>
      {text("clinicName", "Clinic name", "Shown at the top of the patient, staff and doctor pages.")}
      <div className="grid gap-4 sm:grid-cols-2">
        {text("doctorName", "Doctor name (as printed)")}
        {text("degrees", "Degrees")}
        {text("registration", "Registration no.")}
        {text("mobile", "Mobile number", 'Printed as "Mob.: …"')}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-addressLines">Address (one line each)</Label>
        <Textarea id="profile-addressLines" rows={3} value={form.addressLines} onChange={field("addressLines")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-timings">Clinic timing (one line each)</Label>
        <Textarea
          id="profile-timings"
          rows={2}
          value={form.timings}
          onChange={field("timings")}
          placeholder={"Morning: 10:00 am to 1:00 pm\nEvening: 5:30 pm to 8:00 pm"}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save profile"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
