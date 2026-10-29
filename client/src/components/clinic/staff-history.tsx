import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feeFor } from "@shared/clinic";
import {
  formatAge,
  friendlyError,
  diagnosesBetween,
  listRegistrationsBy,
  listStaff,
  todayKey,
  useClinicProfile,
  type PatientRow,
} from "@/lib/clinic";

type Period = "day" | "month" | "custom";

const TYPE_LABEL: Record<string, string> = {
  emergency: "Emergency",
  new: "New OPD",
  old: "Old patient",
  revisit: "Revisit",
};
// Online registrations approved by this staff member count as "Online".
const typeKey = (p: PatientRow) => (p.source === "patient" ? "online" : (p.visitType ?? "new"));
const typeOf = (p: PatientRow) => (p.source === "patient" ? "Online" : TYPE_LABEL[p.visitType ?? "new"]);
const statusOf = (p: PatientRow) =>
  p.status === "prescribed" ? "Seen" : p.status === "skipped" ? "Skipped" : "In queue";
// "2026-10-29" -> "29/10/2026"
const showDate = (key: string) => key.split("-").reverse().join("/");

// Last day of the month "YYYY-MM", as "YYYY-MM-DD".
function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return todayKey(new Date(y, m, 0));
}

// Read-only list of visits with Excel and PDF downloads. Staff see the visits they registered or approved.
// The doctor (doctorUid set) sees every visit, who registered it and the diagnosis written.
export default function StaffHistory({
  uid,
  staffName,
  doctorUid,
}: {
  uid: string | null;
  staffName: string;
  doctorUid?: string;
}) {
  const everyone = !!doctorUid;
  const profile = useClinicProfile();
  const { clinicName } = profile;
  const today = todayKey();
  const [period, setPeriod] = useState<Period>("day");
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffNames, setStaffNames] = useState<Map<string, string>>(new Map());
  const [diagnoses, setDiagnoses] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!everyone) return;
    listStaff()
      .then((list) => setStaffNames(new Map(list.map((s) => [s.id, s.name]))))
      .catch(() => undefined);
  }, [everyone]);

  const range =
    period === "day"
      ? { from: day, to: day, label: showDate(day) }
      : period === "month"
        ? { from: `${month}-01`, to: monthEnd(month), label: new Date(`${month}-01T00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) }
        : { from, to, label: `${showDate(from)} to ${showDate(to)}` };
  const valid = !!range.from && !!range.to && range.from <= range.to;

  useEffect(() => {
    if (!valid) return;
    let current = true;
    setLoading(true);
    setError(null);
    Promise.all([
      listRegistrationsBy(uid, range.from, range.to),
      everyone ? diagnosesBetween(range.from, range.to).catch(() => new Map<string, string>()) : null,
    ])
      .then(([found, dx]) => {
        if (!current) return;
        setRows(found);
        if (dx) setDiagnoses(dx);
      })
      .catch((err) => current && setError(friendlyError(err, "Could not load the history.")))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [uid, range.from, range.to, valid, everyone]);

  // Who put the visit in the queue: a staff member, the doctor, or the patient online (and who approved).
  const nameOf = (id?: string | null) =>
    !id ? "" : id === doctorUid ? "Doctor" : (staffNames.get(id) ?? "Staff");
  const registeredBy = (p: PatientRow) =>
    p.source === "patient" ? `Online${p.approvedBy ? ` (approved by ${nameOf(p.approvedBy)})` : ""}` : nameOf(p.createdBy);

  const count = (type: string) => rows.filter((p) => typeKey(p) === type).length;

  // Revenue: each visit's saved fee; older visits without one use today's fee from Edit profile.
  // Online visits are normal OPD visits.
  const feeOf = (p: PatientRow) => p.fee ?? feeFor(p.source === "patient" ? "new" : p.visitType, profile);
  const revenue = rows.reduce((sum, p) => sum + feeOf(p), 0);
  const emergencyRows = rows.filter((p) => p.source !== "patient" && p.visitType === "emergency");
  const emergencyRevenue = emergencyRows.reduce((sum, p) => sum + feeOf(p), 0);
  const feesSet = profile.opdFee > 0 || profile.emergencyFee > 0 || rows.some((p) => p.fee);
  const inr = (n: number) => n.toLocaleString("en-IN");
  const summary = [
    `Total ${rows.length}`,
    ...(everyone ? [`Seen ${rows.filter((p) => p.status === "prescribed").length}`] : []),
    `Emergency ${count("emergency")}`,
    `New OPD ${count("new")}`,
    `Old ${count("old")}`,
    `Online ${count("online")}`,
  ];

  const table = () =>
    rows.map((p, i) => ({
      "#": i + 1,
      Token: p.token ?? "",
      Date: showDate(p.visitAt.slice(0, 10)),
      Time: p.visitAt.slice(11, 16),
      Patient: p.name,
      Age: formatAge(p.age),
      "Weight (kg)": p.weight,
      "Mother/Father": p.parentName,
      Mobile: p.mobile ?? "",
      Type: typeOf(p),
      Status: statusOf(p),
      "Fee (Rs)": feeOf(p),
      ...(everyone ? { "Registered by": registeredBy(p), Diagnosis: diagnoses.get(p.id) ?? "" } : {}),
    }));
  const fileBase = `${everyone ? "clinic-patients" : `${staffName}-registrations`}-${range.from}${range.to !== range.from ? `-to-${range.to}` : ""}`.replace(/\s+/g, "-");

  // The libraries load only when a download is tapped, so the page itself stays light.
  const downloadExcel = async () => {
    const XLSX = await import("xlsx");
    const data = table();
    const sheet = XLSX.utils.json_to_sheet(data);
    // Total revenue as the last row, under the Fee column (same column order as the rows above).
    const totalRow = Object.fromEntries(Object.keys(data[0]).map((key) => [key, ""]));
    XLSX.utils.sheet_add_json(sheet, [{ ...totalRow, Status: "Total", "Fee (Rs)": revenue }], {
      skipHeader: true,
      origin: -1,
    });
    sheet["!cols"] = [4, 7, 11, 7, 22, 16, 11, 20, 13, 12, 10, 9, 24, 28].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Registrations");
    XLSX.writeFile(book, `${fileBase}.xlsx`);
  };

  const downloadPdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.setFontSize(15);
    pdf.text(clinicName, 14, 15);
    pdf.setFontSize(10.5);
    pdf.text(`${everyone ? "All patients" : `Registrations by ${staffName}`}  ·  ${range.label}`, 14, 22);
    pdf.text(
      [...summary, ...(feesSet ? [`Revenue Rs. ${inr(revenue)}`] : [])].join("   ·   "),
      14,
      28,
    );
    const data = table();
    autoTable(pdf, {
      startY: 33,
      head: [Object.keys(data[0] ?? { "#": 0 })],
      body: data.map((r) => Object.values(r).map(String)),
      styles: { fontSize: everyone ? 7.5 : 8.5, cellPadding: 1.6 },
      headStyles: { fillColor: [36, 49, 143] },
    });
    pdf.save(`${fileBase}.pdf`);
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-md border p-3">
        <div className="flex w-fit overflow-hidden rounded-md border text-sm">
          {(["day", "month", "custom"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 ${period === p ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted"}`}
            >
              {p === "day" ? "Daily" : p === "month" ? "Monthly" : "Custom"}
            </button>
          ))}
        </div>
        {period === "day" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="history-day">Date</Label>
            <Input id="history-day" type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
        )}
        {period === "month" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="history-month">Month</Label>
            <Input id="history-month" type="month" max={today.slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        )}
        {period === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="history-from">From</Label>
              <Input id="history-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="history-to">To</Label>
              <Input id="history-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}
        {!valid && <p className="text-sm text-red-600">"From" must be on or before "To".</p>}
      </div>

      {/* Revenue for the chosen period, the number the doctor checks most. */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border bg-green-50/60 p-3">
          {feesSet ? (
            <>
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {everyone ? "Revenue" : "Fees collected"} · {range.label}
                </span>
                <span className="text-2xl font-bold tabular-nums text-green-800">₹{inr(revenue)}</span>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                OPD {rows.length - emergencyRows.length} · ₹{inr(revenue - emergencyRevenue)}
                <br />
                Emergency {emergencyRows.length} · ₹{inr(emergencyRevenue)}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              {everyone
                ? "Add your OPD and emergency fees in Patients → Edit profile to see revenue here."
                : "Fees are not set yet. The doctor can add them in Edit profile."}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold">{range.label}</span>
          <span className="text-muted-foreground"> · {summary.join(" · ")}</span>
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadExcel} disabled={!rows.length}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4 text-green-700" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf} disabled={!rows.length}>
            <FileText className="mr-1.5 h-4 w-4 text-red-700" /> PDF
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        !error && (
          <p className="text-sm text-muted-foreground">
            {everyone ? "No patients in this period." : "No registrations by you in this period."}
          </p>
        )
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {rows.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 p-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">
                  {p.token ? <span className="mr-1 tabular-nums text-muted-foreground">#{p.token}</span> : null}
                  {p.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {formatAge(p.age)} · {p.weight} kg
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {showDate(p.visitAt.slice(0, 10))} {p.visitAt.slice(11, 16)}
                  {p.mobile ? ` · ${p.mobile}` : ""}
                  {everyone && registeredBy(p) ? ` · by ${registeredBy(p)}` : ""}
                </span>
                {everyone && diagnoses.get(p.id) && (
                  <span className="text-xs font-medium">Dx: {diagnoses.get(p.id)}</span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                <span className={p.visitType === "emergency" ? "font-semibold text-red-700" : "text-muted-foreground"}>
                  {typeOf(p)}
                </span>
                <span className={p.status === "prescribed" ? "text-green-700" : "text-amber-700"}>{statusOf(p)}</span>
                {feesSet && <span className="font-medium tabular-nums">₹{inr(feeOf(p))}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
