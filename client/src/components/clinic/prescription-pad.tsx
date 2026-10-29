import { useId, type CSSProperties, type ReactNode } from "react";
import type { ClinicProfile } from "@shared/clinic";
import type { AgeParts, PatientRow, PrescriptionContent } from "@/lib/clinic";
import { isFilled, type MedicineItem } from "@/lib/medicines";

// A5 pad (148mm x 210mm) laid out in millimetres, measured from the doctor's paper pad.
// Two layers:
// - "art": what is already printed on the paper pad (header, rules, labels, Rx, footer)
// - "ink": what we fill in (patient details, vitals, medicines, investigations)
// Printing in "overlay" mode prints only the ink, onto the real pad. "full" prints both on
// plain paper. On screen both show, scaled with container units so it fits a phone.

export type PrintMode = "overlay" | "full";
export type PrintOffset = { x: number; y: number }; // mm; + moves right / down

const PAD_W = 148;
const NAVY = "#24318f";

// Millimetres to container width units, so 148mm = 100cqw on screen and 148mm on paper.
const mm = (n: number) => `${(n * 100) / PAD_W}cqw`;

function at(left: number, top: number, extra: CSSProperties = {}): CSSProperties {
  return { position: "absolute", left: mm(left), top: mm(top), ...extra };
}

// The age box on the pad is small: "1Y 3M", "5D", "12Y".
function shortAge(age: AgeParts | number): string {
  if (typeof age === "number") return `${age}Y`;
  const parts = [age.years ? `${age.years}Y` : "", age.months ? `${age.months}M` : "", age.days ? `${age.days}D` : ""];
  return parts.filter(Boolean).join(" ") || "0D";
}

// "2026-10-24T11:34" -> "24/10/26", as written on the pad.
function padDate(visitAt: string): string {
  const [y, m, d] = visitAt.split("T")[0].split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : visitAt;
}

const STAMP_RED = "#c4161c";

// Round "EMERGENCY" seal for emergency visits, in the gap between the doctor's name and the address.
// 18.4 mm across, tilted like a hand stamp, with small ink gaps. It is part of what we print, so it
// also prints on the pre-printed pad.
function EmergencySeal({ clinicName, date }: { clinicName: string; date: string }) {
  // Filter and path ids must be unique on the page and plain enough for url(#...).
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const name = clinicName.toUpperCase();
  // The clinic name runs round the top half (about 125 units of arc); longer names get smaller
  // letters so they still fit. Bold sans letters are about 0.66 of the font size wide.
  const nameSize = Math.max(5, Math.min(10, (125 / Math.max(name.length, 1) - 1.2) / 0.66));
  return (
    <div style={at(72.3, 5.3, { width: mm(18.4), height: mm(18.4), transform: "rotate(-12deg)" })}>
      <svg viewBox="0 0 120 120" width="100%" height="100%" style={{ overflow: "visible" }} aria-label="Emergency">
        <defs>
          <filter id={`ink${id}`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 2.55"
              result="speckle"
            />
            <feComposite in="SourceGraphic" in2="speckle" operator="in" result="speckled" />
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="1" seed="2" result="warp" />
            <feDisplacementMap in="speckled" in2="warp" scale="2.2" />
          </filter>
          <path id={`top${id}`} d="M 18 60 A 42 42 0 0 1 102 60" />
          <path id={`bottom${id}`} d="M 14 60 A 46 46 0 0 0 106 60" />
        </defs>
        <g filter={`url(#ink${id})`} stroke={STAMP_RED} fill="none">
          <circle cx="60" cy="60" r="56" strokeWidth="4" />
          <circle cx="60" cy="60" r="38" strokeWidth="1.6" />
          <text fill={STAMP_RED} stroke="none" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize={nameSize} letterSpacing="1.2">
            <textPath href={`#top${id}`} startOffset="50%" textAnchor="middle">
              {name}
            </textPath>
          </text>
          <text fill={STAMP_RED} stroke="none" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="9.5" letterSpacing="1.5">
            <textPath href={`#bottom${id}`} startOffset="50%" textAnchor="middle" dominantBaseline="hanging">
              {`★ ${date} ★`}
            </textPath>
          </text>
          <rect x="6" y="47" width="108" height="26" fill={STAMP_RED} stroke="none" />
          <text x="60" y="66.5" textAnchor="middle" fill="#fff" stroke="none" fontFamily="'Arial Black', Arial, sans-serif" fontWeight="900" fontSize="15" textLength="98" lengthAdjust="spacingAndGlyphs">
            EMERGENCY
          </text>
        </g>
      </svg>
    </div>
  );
}

function Ink({ left, top, width, size = 3.6, children, multiline = false, height }: {
  left: number;
  top: number;
  width: number;
  size?: number;
  children: ReactNode;
  multiline?: boolean;
  height?: number;
}) {
  return (
    <div
      className={multiline ? "whitespace-pre-wrap overflow-hidden" : "whitespace-nowrap overflow-hidden text-ellipsis"}
      style={at(left, top, {
        width: mm(width),
        height: height === undefined ? undefined : mm(height),
        fontSize: mm(size),
        lineHeight: multiline ? 1.55 : 1.2,
        color: "#111",
      })}
    >
      {children}
    </div>
  );
}

// Medicines in columns (drug | dose | frequency | days); advice and notes below them.
// Placed inside the body column, so it moves down when there are many complaints.
function MedicineBlock({ items, advice, notes }: { items: MedicineItem[]; advice: string; notes: string }) {
  const size = mm(3.4);
  return (
    <div className="flex flex-col" style={{ paddingLeft: mm(4) }}>
      {items.map((item, i) => (
        <div key={i} className="grid" style={{ gridTemplateColumns: "40fr 20fr 12fr 9fr", columnGap: mm(1.5), fontSize: size, lineHeight: 1.65 }}>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {item.form && <span>{item.form} </span>}
            <span className="font-semibold">{item.name}</span>
          </span>
          <span className="whitespace-nowrap overflow-hidden">{item.dose}</span>
          <span className="whitespace-nowrap overflow-hidden">{item.frequency}</span>
          <span className="whitespace-nowrap overflow-hidden">{item.days ? `x ${item.days}d` : ""}</span>
        </div>
      ))}
      {advice.trim() && (
        <div className="whitespace-pre-wrap" style={{ fontSize: mm(3.1), lineHeight: 1.5, marginTop: mm(4) }}>
          <span className="font-semibold">Advice: </span>
          {advice.trim()}
        </div>
      )}
      {notes.trim() && (
        <div className="whitespace-pre-wrap" style={{ fontSize: mm(3.1), lineHeight: 1.5, marginTop: mm(2) }}>
          <span className="font-semibold">Note: </span>
          {notes.trim()}
        </div>
      )}
    </div>
  );
}

// Investigations sit apart from the medicines: their own column on the right edge behind a
// divider, with a heading, in a different typeface and colour. "CBC, CRP" or one per line both work.
const INVESTIGATION_COLOR = "#8b1a1a";

function InvestigationList({ text }: { text: string }) {
  const items = text
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!items.length) return null;
  return (
    <div
      className="flex flex-col"
      style={at(119, 52, {
        width: mm(27),
        height: mm(100),
        overflow: "hidden",
        color: INVESTIGATION_COLOR,
        borderLeft: `${mm(0.35)} solid ${INVESTIGATION_COLOR}`,
        paddingLeft: mm(2.2),
        fontFamily: 'Georgia, "Times New Roman", serif',
      })}
    >
      <span className="font-bold uppercase" style={{ fontSize: mm(2.4), letterSpacing: mm(0.15), marginBottom: mm(1.2) }}>
        Investigations
      </span>
      {items.map((item, i) => (
        // Hanging bullet, so a long test that wraps still reads as one item.
        <span
          key={i}
          className="italic"
          style={{ fontSize: mm(3.1), lineHeight: 1.45, paddingLeft: mm(2.4), textIndent: mm(-2.4), overflowWrap: "anywhere" }}
        >
          • {item}
        </span>
      ))}
    </div>
  );
}

function Rule({ top, left, right, weight }: { top: number; left: number; right: number; weight: number }) {
  return <div style={at(left, top, { width: mm(PAD_W - left - right), borderTop: `${mm(weight)} solid ${NAVY}` })} />;
}

function PadArt({ pad }: { pad: ClinicProfile }) {
  const label = (text: string, left: number, top: number) => (
    <span style={at(left, top, { fontSize: mm(2.8) })}>{text}</span>
  );
  const line = (left: number, right: number, top: number) => (
    <div style={at(left, top, { width: mm(right - left), borderTop: `${mm(0.25)} solid #333` })} />
  );

  return (
    <div className="pad-art">
      <span className="font-bold" style={at(12, 8, { fontSize: mm(7.5), color: NAVY, lineHeight: 1 })}>
        {pad.doctorName}
      </span>
      <span className="font-bold" style={at(23, 18.5, { fontSize: mm(2.8), color: "#333" })}>{pad.degrees}</span>
      <span className="font-bold" style={at(23, 22.5, { fontSize: mm(2.8), color: "#333" })}>{pad.registration}</span>
      <div className="flex flex-col" style={at(100, 6, { fontSize: mm(3), lineHeight: 1.35 })}>
        {pad.addressLines.map((l) => (
          <span key={l}>{l}</span>
        ))}
        <span className="font-bold">Mob.: {pad.mobile}</span>
      </div>

      <Rule top={27.5} left={8} right={0} weight={1.1} />
      <Rule top={29.4} left={8} right={0} weight={0.35} />

      {label("Name", 6, 33)}
      {line(15, 74, 36.6)}
      {label("Age", 75, 33)}
      {line(80, 94, 36.6)}
      {label("Weight", 95, 33)}
      {line(103.5, 120, 36.6)}
      {label("Date", 121, 33)}
      {line(127, 146, 36.6)}

      <div
        className="rounded-full flex items-center justify-center text-white font-bold"
        style={at(7, 38.5, { width: mm(7), height: mm(7), background: NAVY, fontSize: mm(3.4) })}
      >
        R<sub style={{ fontSize: mm(2.2) }}>x</sub>
      </div>

      <Rule top={196.5} left={8} right={0} weight={1.1} />
      <Rule top={198.4} left={8} right={0} weight={0.35} />
      <span
        className="rounded-full text-white font-bold"
        style={at(64, 195, { background: NAVY, fontSize: mm(3), padding: `${mm(0.6)} ${mm(3)}` })}
      >
        TIMING
      </span>
      <div className="text-right" style={at(60, 201.5, { width: mm(86), fontSize: mm(2.6), lineHeight: 1.3 })}>
        {pad.timings.map((t) => (
          <div key={t}>{t}</div>
        ))}
      </div>
    </div>
  );
}

type Props = {
  patient: PatientRow;
  content: PrescriptionContent;
  mode: PrintMode;
  offset: PrintOffset;
  // Doctor's details and clinic timing, as set in "Edit profile".
  profile: ClinicProfile;
};

export default function PrescriptionPad({ patient, content, mode, offset, profile }: Props) {
  const { vitals } = content;
  const complaints = content.complaints
    .split("\n")
    .map((c) => c.trim())
    .filter(Boolean);
  const vitalsLine = [
    vitals.temp && `Temp ${vitals.temp}°F`,
    vitals.pulse && `Pulse ${vitals.pulse}/min`,
    vitals.rr && `RR ${vitals.rr}/min`,
    vitals.spo2 && `SpO2 ${vitals.spo2}%`,
  ]
    .filter(Boolean)
    .join("    ");

  return (
    <>
      {/* One A5 sheet with only the pad. In overlay mode the pre-printed artwork is hidden. */}
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important;
                       height: 210mm !important; overflow: hidden !important; }
          .rx-pad { width: 148mm !important; max-width: none !important; border: 0 !important;
                    box-shadow: none !important; margin: 0 !important; break-after: avoid; }
          .rx-pad[data-mode="overlay"] .pad-art { visibility: hidden !important; }
        }
      `}</style>

      <div
        className="rx-pad relative w-full max-w-[148mm] mx-auto bg-white text-black shadow-md border overflow-hidden"
        data-mode={mode}
        style={{ aspectRatio: "148 / 210", containerType: "inline-size" }}
      >
        <PadArt pad={profile} />

        {/* Printer calibration moves only what we print, never the paper pad. */}
        <div className="absolute inset-0" style={{ transform: `translate(${mm(offset.x)}, ${mm(offset.y)})` }}>
          <Ink left={16} top={32} width={57}>{patient.name}</Ink>
          <Ink left={80.5} top={32.4} width={14} size={3.2}>{shortAge(patient.age)}</Ink>
          <Ink left={104} top={32.4} width={16} size={3.2}>{`${patient.weight} kg`}</Ink>
          <Ink left={127.5} top={32.4} width={19} size={3.2}>{padDate(patient.visitAt)}</Ink>
          {patient.visitType === "emergency" && (
            <EmergencySeal clinicName={profile.clinicName} date={padDate(patient.visitAt).replace(/\//g, "·")} />
          )}
          {/* Parent's name, address and mobile stay in the records only. */}
          {/* Body column: vitals, complaints, diagnosis, medicines, advice and notes flow one under the
              other, so more complaints simply push the rest down. Investigations stay on the right. */}
          <div
            className="flex flex-col"
            style={at(16, 37.5, { width: mm(100), height: mm(156), overflow: "hidden", color: "#111" })}
          >
            {vitalsLine && <div style={{ fontSize: mm(3), lineHeight: 1.3 }}>{vitalsLine}</div>}
            {complaints.length > 0 && (
              <div style={{ marginTop: mm(1.5), paddingLeft: mm(4), fontSize: mm(3.2), lineHeight: 1.45 }}>
                <span className="font-semibold" style={{ fontSize: mm(2.8) }}>
                  C/O
                </span>
                {complaints.map((c, i) => (
                  <div key={i} style={{ paddingLeft: mm(2.4), textIndent: mm(-2.4) }}>
                    • {c}
                  </div>
                ))}
              </div>
            )}
            {content.diagnosis.trim() && (
              <div
                className="font-bold underline text-center"
                style={{ marginTop: mm(2.5), marginBottom: mm(3), fontSize: mm(4), overflowWrap: "anywhere" }}
              >
                {content.diagnosis.trim()}
              </div>
            )}
            {!content.diagnosis.trim() && <div style={{ height: mm(4) }} />}
            <MedicineBlock items={content.items.filter(isFilled)} advice={content.advice} notes={content.notes} />
          </div>
          <InvestigationList text={content.investigations} />
        </div>
      </div>
    </>
  );
}
