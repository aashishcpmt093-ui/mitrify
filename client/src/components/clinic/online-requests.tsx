import { useEffect, useState } from "react";
import { Check, Globe, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { feeFor } from "@shared/clinic";
import {
  approveOnline,
  formatAge,
  friendlyError,
  rejectOnline,
  subscribeOnlinePending,
  useClinicProfile,
  type PatientRow,
} from "@/lib/clinic";

// Live list of online registrations waiting for approval; its length is shown on the "Online" buttons.
// Starts only once someone is signed in, since only staff and the doctor may read it.
export function useOnlinePending(enabled = true): { rows: PatientRow[]; error: string | null } {
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setRows([]);
      return;
    }
    return subscribeOnlinePending(
      (next) => {
        setRows(next);
        setError(null);
      },
      (err) => setError(friendlyError(err, "Could not load online registrations.")),
    );
  }, [enabled]);
  return { rows, error };
}

// Patients who registered themselves on the patient page. Staff approve after taking the fee (the
// doctor can too); approving gives the next token number and sends the patient to the doctor's queue.
export default function OnlineRequests({
  uid,
  rows,
  error,
  approver,
}: {
  uid: string;
  rows: PatientRow[];
  error: string | null;
  approver: "staff" | "doctor";
}) {
  const profile = useClinicProfile();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const approve = async (p: PatientRow) => {
    setBusyId(p.id);
    setNotice(null);
    try {
      // Online visits are normal OPD visits.
      const token = await approveOnline(p.id, uid, feeFor("new", profile));
      setNotice({ ok: true, text: `${p.name} approved. Token number ${token}. Now in the doctor's queue.` });
    } catch (err) {
      setNotice({ ok: false, text: friendlyError(err, "Could not approve. Try again.") });
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (p: PatientRow) => {
    if (!window.confirm(`Reject ${p.name}'s online registration? It will not reach the doctor.`)) return;
    setBusyId(p.id);
    setNotice(null);
    try {
      await rejectOnline(p.id);
      setNotice({ ok: true, text: `${p.name}'s registration rejected.` });
    } catch (err) {
      setNotice({ ok: false, text: friendlyError(err, "Could not reject. Try again.") });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {approver === "staff"
          ? "Patients who registered themselves online. Take the fee, then approve: the patient gets the next token number and goes to the doctor."
          : "Patients who registered themselves online. They reach your list once staff approve them (after the fee), or when you approve here."}
      </p>
      {notice && (
        <p
          role="status"
          className={`rounded-md p-3 text-sm ${notice.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}
        >
          {notice.ok ? "✓ " : ""}
          {notice.text}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && rows.length === 0 && (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No online registrations waiting.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex min-w-0 items-start gap-3">
                <Globe className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden="true" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">
                    {p.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {formatAge(p.age)} · {p.weight} kg
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[p.parentName, p.mobile, p.visitAt.replace("T", " ")].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => approve(p)} disabled={busyId !== null}>
                  <Check className="mr-1 h-4 w-4" />
                  {busyId === p.id ? "Working..." : "Approve"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => reject(p)} disabled={busyId !== null}>
                  <X className="mr-1 h-4 w-4" /> Reject
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
