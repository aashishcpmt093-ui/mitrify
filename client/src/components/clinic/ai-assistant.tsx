import { useEffect, useRef, useState } from "react";
import { Camera, ChevronDown, ChevronUp, ClipboardList, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  compressImage,
  consult,
  type AiContext,
  type CaseQA,
  type ConsultImage,
  type ConsultTurn,
  type Provisional,
} from "@/lib/clinic-ai";

type Props = {
  context: AiContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (provisional: Provisional) => void;
};

type Entry =
  | { kind: "doctor"; text: string; answers: CaseQA[]; images: string[] }
  | { kind: "ai"; turn: ConsultTurn };

const MAX_IMAGES = 4;

// One-tap questions about what is on the prescription right now.
const QUICK_CHECKS = [
  { label: "Interactions", prompt: "Check the medicines on the prescription for drug interactions." },
  { label: "Contraindications", prompt: "Any contraindications or cautions for these medicines in this child?" },
  { label: "Doses for weight", prompt: "Check each dose against the child's weight. Flag any that look high or low." },
  { label: "Indications", prompt: "What is each medicine for here, and is anything expected for the diagnosis missing?" },
];

export function AiAssistantButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick}>
      <Sparkles className="h-4 w-4 mr-1" />
      Make diagnosis &amp; treatment by AI
    </Button>
  );
}

// What the AI said, as plain text for the conversation history sent on later turns.
const turnText = (t: ConsultTurn) =>
  [t.message, t.questions.length ? `Questions:\n${t.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : ""]
    .filter(Boolean)
    .join("\n\n");

function ProvisionalCard({ p, onApply, applied }: { p: Provisional; onApply: () => void; applied: boolean }) {
  return (
    <div className="mt-2 rounded-md border border-teal-600/40 bg-teal-50 dark:bg-teal-950/30 p-3 text-sm flex flex-col gap-1">
      <p className="font-semibold">Provisional diagnosis: {p.diagnosis}</p>
      {p.differentials.length > 0 && <p>Differentials: {p.differentials.join(", ")}</p>}
      {p.redFlags && <p className="text-red-700 dark:text-red-400">Red flags: {p.redFlags}</p>}
      {p.medicines.length > 0 && (
        <ul className="list-disc pl-5">
          {p.medicines.map((m, i) => (
            <li key={i}>{[m.form, m.name, m.dose, m.frequency, m.days && `x ${m.days} days`].filter(Boolean).join(" ")}</li>
          ))}
        </ul>
      )}
      {p.investigations && <p>Investigations: {p.investigations}</p>}
      {p.advice && <p>Advice: {p.advice}</p>}
      <Button type="button" size="sm" variant={applied ? "outline" : "default"} className="self-start mt-1" onClick={onApply}>
        {applied ? "Put in prescription again" : "Put in prescription"}
      </Button>
    </div>
  );
}

// Side panel (not a modal) so the prescription stays visible and editable during the consultation.
// It stays mounted while closed, so the case is not lost when the doctor hides it.
export default function AiAssistant({ context, open, onOpenChange, onApply }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [caseLog, setCaseLog] = useState<CaseQA[]>([]);
  const [caseSummary, setCaseSummary] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<ConsultImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showCase, setShowCase] = useState(false);
  const [appliedTurns, setAppliedTurns] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries, busy, questions]);

  // Seconds waited, so a slow free model does not look like nothing is happening.
  useEffect(() => {
    if (!busy) return;
    setWaited(0);
    const timer = setInterval(() => setWaited((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  // On wider screens make room for the panel so the whole prescription stays in view beside it.
  useEffect(() => {
    if (!open || !window.matchMedia("(min-width: 640px)").matches) return;
    const previous = document.body.style.paddingRight;
    document.body.style.paddingRight = "26rem";
    return () => {
      document.body.style.paddingRight = previous;
    };
  }, [open]);

  const hasMedicines = context.currentMedicines.trim() !== "";

  const apply = (index: number, p: Provisional) => {
    onApply(p);
    setAppliedTurns((prev) => new Set(prev).add(index));
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = MAX_IMAGES - images.length;
    if (files.length > room) setError(`Up to ${MAX_IMAGES} photos per message.`);
    try {
      const added = await Promise.all([...files].slice(0, room).map((f) => compressImage(f)));
      setImages((prev) => [...prev, ...added]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the photo.");
    }
  };

  const send = async (opts: { text?: string; wantProvisional?: boolean } = {}) => {
    if (busy) return;
    const text = (opts.text ?? draft).trim();
    const answered: CaseQA[] = questions.map((q, i) => ({ question: q, answer: (answers[i] ?? "").trim() }));
    const wantProvisional = !!opts.wantProvisional;
    if (!text && !answered.some((a) => a.answer) && !images.length && !wantProvisional) return;

    const message = [text, wantProvisional && "Give the provisional diagnosis and treatment now."].filter(Boolean).join("\n");
    const doctorText = [
      answered.length ? `Answers:\n${answered.map((a, i) => `${i + 1}. ${a.question} — ${a.answer || "(not answered)"}`).join("\n")}` : "",
      message,
      images.length ? `[${images.length} photo(s) attached]` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const nextLog = [...caseLog, ...answered];
    const sentImages = images;

    // Show the doctor's message at once and clear the inputs; put them back if sending fails.
    const restore = { draft, answers, images, questions };
    setEntries((prev) => [
      ...prev,
      { kind: "doctor", text: message, answers: answered, images: sentImages.map((i) => i.preview) },
    ]);
    setDraft("");
    setAnswers([]);
    setImages([]);
    setQuestions([]);
    setBusy(true);
    setError(null);
    try {
      const turn = await consult({
        context,
        caseSummary,
        caseLog: nextLog,
        history,
        message,
        images: sentImages.map(({ mediaType, data }) => ({ mediaType, data })),
        wantProvisional,
      });
      const aiIndex = entries.length + 1;
      setEntries((prev) => [...prev, { kind: "ai", turn }]);
      setHistory((prev) => [...prev, { role: "user", text: doctorText }, { role: "assistant", text: turnText(turn) }]);
      setCaseLog(nextLog);
      setCaseSummary(turn.caseSummary);
      setQuestions(turn.questions);
      // An empty prescription is filled straight away; otherwise the doctor taps "Put in prescription".
      if (turn.provisional && !hasMedicines) apply(aiIndex, turn.provisional);
    } catch (err) {
      // Take the message back out of the chat and restore what was typed, so "Send" just works again.
      setEntries((prev) => prev.slice(0, -1));
      setDraft(restore.draft);
      setAnswers(restore.answers);
      setImages(restore.images);
      setQuestions(restore.questions);
      setError(err instanceof Error ? err.message : "AI could not answer.");
    } finally {
      setBusy(false);
    }
  };

  const newCase = () => {
    setEntries([]);
    setHistory([]);
    setCaseLog([]);
    setCaseSummary("");
    setQuestions([]);
    setAnswers([]);
    setImages([]);
    setDraft("");
    setError(null);
    setAppliedTurns(new Set());
  };

  return (
    <aside
      aria-label="AI assistant"
      className={`${open ? "flex" : "hidden"} fixed inset-y-0 right-0 z-40 w-full sm:w-[26rem] bg-background border-l shadow-xl flex-col print:hidden`}
    >
      <div className="flex items-start justify-between gap-2 border-b p-3">
        <div>
          <p className="font-semibold flex items-center gap-1">
            <Sparkles className="h-4 w-4" /> AI consultation
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {context.age}, {context.weightKg} kg{context.vitals ? `, ${context.vitals}` : ""}. Name and address are not
            sent. AI suggests; the doctor decides.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close AI help"
          onClick={() => onOpenChange(false)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b p-2">
        {QUICK_CHECKS.map((q) => (
          <Button
            key={q.label}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy || !hasMedicines}
            title={hasMedicines ? q.prompt : "Write medicines on the prescription first"}
            onClick={() => send({ text: q.prompt })}
          >
            {q.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={busy || entries.length === 0}
          onClick={() => send({ wantProvisional: true })}
        >
          Provisional diagnosis now
        </Button>
      </div>

      <div className="border-b px-3 py-2 text-xs flex items-center justify-between gap-2">
        <button type="button" className="flex items-center gap-1 font-medium" onClick={() => setShowCase((v) => !v)}>
          <ClipboardList className="h-4 w-4" />
          Case sheet: {caseLog.length} questions asked
          {showCase ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {entries.length > 0 && (
          <button type="button" className="text-muted-foreground underline" onClick={newCase}>
            New case
          </button>
        )}
      </div>
      {showCase && (
        <div className="max-h-56 overflow-y-auto border-b px-3 py-2 text-xs flex flex-col gap-2 bg-muted/20">
          {caseSummary ? <p className="whitespace-pre-wrap">{caseSummary}</p> : <p className="text-muted-foreground">No summary yet.</p>}
          {caseLog.length > 0 && (
            <ol className="list-decimal pl-4 flex flex-col gap-1">
              {caseLog.map((qa, i) => (
                <li key={i}>
                  {qa.question} <span className="text-muted-foreground">— {qa.answer || "not answered"}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 p-3 bg-muted/30">
        {entries.length === 0 && (
          <div className="text-sm text-muted-foreground flex flex-col gap-2">
            <p>Start with the main complaint, e.g. "Fever 3 days, cough, not feeding well".</p>
            <p>The AI will ask history questions a few at a time, read photos of reports and films, and give a
              provisional diagnosis and treatment that goes into the prescription for you to edit.</p>
          </div>
        )}

        {entries.map((e, i) =>
          e.kind === "doctor" ? (
            <div key={i} className="self-end max-w-[90%] rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm flex flex-col gap-1">
              {e.answers.length > 0 && (
                <ol className="list-decimal pl-4">
                  {e.answers.map((a, j) => (
                    <li key={j}>
                      <span className="opacity-80">{a.question}</span> — {a.answer || "not answered"}
                    </li>
                  ))}
                </ol>
              )}
              {e.text && <p className="whitespace-pre-wrap">{e.text}</p>}
              {e.images.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {e.images.map((src, j) => (
                    <img key={j} src={src} alt="Attached report" className="h-16 w-16 object-cover rounded" />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div key={i} className="self-start max-w-[95%] rounded-lg bg-background border px-3 py-2 text-sm">
              <p className="whitespace-pre-wrap">{e.turn.message}</p>
              {e.turn.provisional && (
                <ProvisionalCard p={e.turn.provisional} applied={appliedTurns.has(i)} onApply={() => apply(i, e.turn.provisional!)} />
              )}
            </div>
          ),
        )}

        {questions.length > 0 && !busy && (
          <div className="self-start w-full rounded-lg border bg-background p-3 flex flex-col gap-2">
            <p className="text-sm font-medium">Answer what you know (leave blank to skip):</p>
            {questions.map((q, i) => (
              <label key={i} className="flex flex-col gap-1 text-sm">
                <span>
                  {caseLog.length + i + 1}. {q}
                </span>
                <Input
                  value={answers[i] ?? ""}
                  onChange={(ev) => setAnswers((prev) => Object.assign([...prev], { [i]: ev.target.value }))}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      send();
                    }
                  }}
                />
              </label>
            ))}
            <Button type="button" size="sm" className="self-end" onClick={() => send()}>
              Send answers
            </Button>
          </div>
        )}

        {busy && (
          <p className="text-sm text-muted-foreground">
            AI is thinking... {waited}s{waited >= 20 && " (free models can take up to a minute)"}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 flex flex-col gap-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {images.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {images.map((img, i) => (
              <div key={i} className="relative">
                <img src={img.preview} alt={img.name} className="h-14 w-14 object-cover rounded border" />
                <button
                  type="button"
                  aria-label={`Remove ${img.name}`}
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-2 -right-2 rounded-full bg-background border p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <Textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Complaint, findings or a question (Enter to send)"
        />
        <div className="flex items-center justify-between gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || images.length >= MAX_IMAGES}
            onClick={() => fileRef.current?.click()}
            title="X-ray, ECG, CT, MRI, USG, lab report or a clinical photo"
          >
            <Camera className="h-4 w-4 mr-1" /> Add report photo
          </Button>
          <Button type="button" onClick={() => send()} disabled={busy}>
            Send
          </Button>
        </div>
      </div>
    </aside>
  );
}
