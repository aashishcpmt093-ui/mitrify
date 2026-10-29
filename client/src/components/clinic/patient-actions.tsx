import { useState } from "react";
import { CalendarClock, MoreVertical, Pencil, SkipForward, Trash2, Undo2 } from "lucide-react";
import PatientIntakeForm from "@/components/patient-intake-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deletePatient,
  friendlyError,
  scheduleRevisit,
  setQueueStatus,
  updatePatientDetails,
  type IntakeInput,
  type PatientRow,
} from "@/lib/clinic";

// "YYYY-MM-DDTHH:mm" for a datetime-local input, `days` from now at the same time of day.
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const QUICK_DAYS = [3, 5, 7, 14, 30];

// The form starts from what is saved. Entries from before age was split into parts held years only.
function detailsOf(p: PatientRow): IntakeInput {
  const age = typeof p.age === "number" ? { days: 0, months: 0, years: p.age } : p.age;
  return {
    name: p.name,
    ageDays: String(age.days),
    ageMonths: String(age.months),
    ageYears: String(age.years),
    address: p.address,
    parentName: p.parentName,
    mobile: p.mobile ?? "",
    weight: String(p.weight),
    visitAt: p.visitAt,
  };
}

// The ⋮ menu on each patient in the doctor's list: edit details, skip (or bring back), book a revisit, delete.
export default function PatientActions({
  patient,
  uid,
  revisitFee,
  onNotice,
}: {
  patient: PatientRow;
  uid: string;
  // OPD fee from Edit profile, saved with a booked revisit.
  revisitFee: number;
  onNotice: (text: string) => void;
}) {
  const [revisitOpen, setRevisitOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [when, setWhen] = useState(() => inDays(7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, done: string) => {
    try {
      await action();
      onNotice(done);
    } catch (err) {
      onNotice(friendlyError(err, "That did not work. Try again."));
    }
  };

  const remove = () => {
    if (!window.confirm(`Delete ${patient.name}'s entry from the list? Saved prescriptions stay in records.`)) return;
    void run(() => deletePatient(patient.id), `${patient.name} deleted from the list.`);
  };

  const book = async () => {
    setBusy(true);
    setError(null);
    try {
      await scheduleRevisit(patient, when, uid, revisitFee);
      setRevisitOpen(false);
      const [date, time] = when.split("T");
      onNotice(`Revisit booked for ${patient.name}: ${date.split("-").reverse().join("/")} at ${time}.`);
    } catch (err) {
      setError(friendlyError(err, "Could not book the revisit."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`More for ${patient.name}`}>
            <MoreVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          {patient.status === "new" && (
            <DropdownMenuItem onSelect={() => run(() => setQueueStatus(patient.id, "skipped"), `${patient.name} skipped.`)}>
              <SkipForward className="mr-2 h-4 w-4" /> Skip
            </DropdownMenuItem>
          )}
          {patient.status === "skipped" && (
            <DropdownMenuItem onSelect={() => run(() => setQueueStatus(patient.id, "new"), `${patient.name} is back in the queue.`)}>
              <Undo2 className="mr-2 h-4 w-4" /> Back to queue
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              setWhen(inDays(7));
              setError(null);
              setRevisitOpen(true);
            }}
          >
            <CalendarClock className="mr-2 h-4 w-4" /> Revisit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={remove} className="text-red-600 focus:text-red-700">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {patient.name}</DialogTitle>
            <DialogDescription>Correct any detail. The queue position and prescriptions stay as they are.</DialogDescription>
          </DialogHeader>
          {/* Remounted on each opening, so it always starts from the saved details. */}
          {editOpen && (
            <PatientIntakeForm
              initial={detailsOf(patient)}
              submitLabel="Save changes"
              onSave={async (input) => {
                await updatePatientDetails(patient.id, input);
                setEditOpen(false);
                onNotice(`${input.name.trim()}'s details updated.`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={revisitOpen} onOpenChange={setRevisitOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revisit for {patient.name}</DialogTitle>
            <DialogDescription>
              On this date the patient appears in the queue automatically, with earlier prescriptions in history.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {QUICK_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                // Today + d days, keeping the time already chosen.
                onClick={() => setWhen(`${inDays(d).split("T")[0]}T${when.split("T")[1] || "17:30"}`)}
                className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted"
              >
                {d} days
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`revisit-${patient.id}`}>Date and time</Label>
            <Input
              id={`revisit-${patient.id}`}
              type="datetime-local"
              min={inDays(0)}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRevisitOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={book} disabled={busy || !when}>
              {busy ? "Booking..." : "Book revisit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
