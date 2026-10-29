import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PRESCRIPTION_PAD } from "@shared/clinic";
import { friendlyError, getPadTimings, savePadTimings } from "@/lib/clinic";

// Clinic timing printed at the foot of every pad. Set once here; each prescription reads the saved value.
export default function ClinicTiming() {
  const [timings, setTimings] = useState<string[]>(PRESCRIPTION_PAD.timings);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    getPadTimings()
      .then((saved) => {
        if (saved?.length) setTimings(saved);
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    const lines = (draft ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    setBusy(true);
    setNote(null);
    try {
      await savePadTimings(lines);
      setTimings(lines);
      setDraft(null);
      setNote("Saved. Every new prescription will print this timing.");
    } catch (err) {
      setNote(friendlyError(err, "Could not save the timing."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-md border p-4 print:hidden">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Clinic timing on the pad</h2>
        {draft === null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(timings.join("\n"));
              setNote(null);
            }}
          >
            Change
          </Button>
        )}
      </div>
      {draft === null ? (
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {timings.join("\n") || "No timing set"}
        </p>
      ) : (
        <>
          <Textarea
            aria-label="Clinic timing, one line each"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              "Morning: 10:00 am to 1:00 pm\nEvening: 5:30 pm to 8:00 pm"
            }
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={save} disabled={busy}>
              {busy ? "Saving..." : "Save timing"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDraft(null)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </section>
  );
}
