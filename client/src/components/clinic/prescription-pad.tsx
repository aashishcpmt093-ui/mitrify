import { PRESCRIPTION_PAD } from "@shared/clinic";
import { formatAge, type PatientRow } from "@/lib/clinic";

// Layout copied from the doctor's paper pad (A5). Sizes use container units (cqw), so the pad
// scales down on a phone and prints at exactly 148mm x 210mm.
const NAVY = "#24318f";

// "2026-10-24T11:34" -> "24/10/26", as the doctor writes it on the pad.
function padDate(visitAt: string): string {
  const [date] = visitAt.split("T");
  const [y, m, d] = date.split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : visitAt;
}

function Field({ label, value, grow = false }: { label: string; value: string; grow?: boolean }) {
  return (
    <div className={`flex items-end gap-[1cqw] ${grow ? "flex-1 min-w-0" : ""}`}>
      <span className="shrink-0" style={{ fontSize: "2.6cqw" }}>{label}</span>
      <span
        className="flex-1 min-w-0 truncate border-b border-black/70 px-[1cqw] leading-tight"
        style={{ fontSize: "3cqw" }}
      >
        {value}
      </span>
    </div>
  );
}

function DoubleRule() {
  return (
    <div className="flex flex-col gap-[0.5cqw]">
      <div style={{ borderTop: `0.8cqw solid ${NAVY}` }} />
      <div style={{ borderTop: `0.25cqw solid ${NAVY}` }} />
    </div>
  );
}

type Props = {
  patient: PatientRow;
  medicines: string;
  onMedicinesChange: (value: string) => void;
};

export default function PrescriptionPad({ patient, medicines, onMedicinesChange }: Props) {
  const pad = PRESCRIPTION_PAD;

  return (
    <>
      {/* Print only the pad, on one A5 sheet. */}
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important;
                       height: 210mm !important; overflow: hidden !important; }
          .rx-pad { width: 148mm !important; height: 210mm !important; max-width: none !important;
                    border: 0 !important; box-shadow: none !important; margin: 0 !important;
                    overflow: hidden !important; break-after: avoid; page-break-after: avoid; }
        }
      `}</style>

      <div
        className="rx-pad w-full max-w-[148mm] mx-auto bg-white text-black shadow-md border flex flex-col"
        style={{ aspectRatio: "148 / 210", containerType: "inline-size", padding: "5cqw 5cqw 3cqw" }}
      >
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col" style={{ color: NAVY }}>
            <span className="font-bold leading-none" style={{ fontSize: "6.4cqw" }}>{pad.doctorName}</span>
            <span className="font-bold text-black/80" style={{ fontSize: "2.5cqw", marginTop: "2cqw", marginLeft: "8cqw" }}>
              {pad.degrees}
            </span>
            <span className="font-bold text-black/80" style={{ fontSize: "2.5cqw", marginLeft: "8cqw" }}>
              {pad.registration}
            </span>
          </div>
          <div className="flex flex-col text-left" style={{ fontSize: "2.9cqw", lineHeight: 1.35 }}>
            {pad.addressLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
            <span className="font-bold">{pad.mobile}</span>
          </div>
        </div>

        <div style={{ marginTop: "2cqw" }}>
          <DoubleRule />
        </div>

        {/* Patient details, filled from the patient / staff form */}
        <div className="flex flex-col" style={{ gap: "1.6cqw", marginTop: "2.5cqw" }}>
          <Field label="Name" value={patient.name} grow />
          <div className="flex" style={{ gap: "2cqw" }}>
            <Field label="Age" value={formatAge(patient.age)} grow />
            <Field label="Weight" value={`${patient.weight} kg`} />
            <Field label="Date" value={padDate(patient.visitAt)} />
          </div>
          <div className="flex" style={{ gap: "2cqw" }}>
            <Field label="Mother/Father" value={patient.parentName} grow />
            <Field label="Address" value={patient.address} grow />
          </div>
        </div>

        {/* Rx mark */}
        <div
          className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
          style={{ background: NAVY, width: "6cqw", height: "6cqw", fontSize: "3cqw", marginTop: "1.5cqw" }}
        >
          R<sub style={{ fontSize: "2cqw" }}>x</sub>
        </div>

        {/* Where the doctor writes: typed on screen, printed as text */}
        <div className="flex-1 min-h-0 flex flex-col" style={{ padding: "1cqw 4cqw 0 8cqw" }}>
          <textarea
            value={medicines}
            onChange={(e) => onMedicinesChange(e.target.value)}
            placeholder="Write medicines here"
            aria-label="Medicines"
            className="flex-1 w-full resize-none bg-transparent outline-none border border-dashed border-black/20 rounded print:hidden"
            style={{ fontSize: "3.2cqw", lineHeight: 1.6, padding: "1cqw" }}
          />
          <div className="hidden print:block whitespace-pre-wrap" style={{ fontSize: "3.2cqw", lineHeight: 1.6 }}>
            {medicines}
          </div>
        </div>

        {/* Footer */}
        <div className="relative" style={{ marginTop: "2cqw" }}>
          <DoubleRule />
          <span
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 top-1/2 rounded-full text-white font-bold"
            style={{ background: NAVY, fontSize: "2.6cqw", padding: "0.6cqw 3cqw" }}
          >
            TIMING
          </span>
        </div>
        <div className="flex justify-end" style={{ fontSize: "2.4cqw", marginTop: "1.5cqw" }}>
          {pad.timings.join("   ")}
        </div>
      </div>
    </>
  );
}
