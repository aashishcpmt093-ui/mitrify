import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askAi, draftPrescription, type AiContext, type AiMessage, type AiPrescription } from "@/lib/clinic-ai";

type Props = {
  context: AiContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (draft: AiPrescription) => void;
};

// One-tap questions about what is on the prescription right now.
const QUICK_CHECKS = [
  { label: "Check interactions", prompt: "Check the medicines on the prescription for drug interactions." },
  { label: "Contraindications", prompt: "Any contraindications or cautions for these medicines in this child?" },
  { label: "Check doses for weight", prompt: "Check each dose against the child's weight. Flag any that look high or low." },
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

// Side panel (not a modal) so the prescription stays visible and editable while the doctor asks.
export default function AiAssistant({ context, open, onOpenChange, onApply }: Props) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"chat" | "fill" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  // On wider screens make room for the panel so the whole prescription stays in view beside it.
  useEffect(() => {
    if (!open || !window.matchMedia("(min-width: 640px)").matches) return;
    const previous = document.body.style.paddingRight;
    document.body.style.paddingRight = "26rem";
    return () => {
      document.body.style.paddingRight = previous;
    };
  }, [open]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const next: AiMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setDraft("");
    setBusy("chat");
    setError(null);
    try {
      const reply = await askAi(context, next);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI could not answer.");
    } finally {
      setBusy(null);
    }
  };

  const fill = async () => {
    setBusy("fill");
    setError(null);
    try {
      onApply(await draftPrescription(context, messages));
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI could not write the prescription.");
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  const hasMedicines = context.currentMedicines.trim() !== "";

  return (
    <aside
      aria-label="AI assistant"
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-[26rem] bg-background border-l shadow-xl flex flex-col print:hidden"
    >
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div>
          <p className="font-semibold flex items-center gap-1">
            <Sparkles className="h-4 w-4" /> AI help
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {context.age}, {context.weightKg} kg{context.vitals ? `, ${context.vitals}` : ""}. Name and address are not
            sent. AI only suggests; the final decision is the doctor's.
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

      <div className="flex flex-wrap gap-2 border-b p-3">
        {QUICK_CHECKS.map((q) => (
          <Button
            key={q.label}
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null || !hasMedicines}
            onClick={() => ask(q.prompt)}
          >
            {q.label}
          </Button>
        ))}
        {!hasMedicines && (
          <p className="w-full text-xs text-muted-foreground">Write medicines on the prescription to use these checks.</p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 p-3 bg-muted/30">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Describe the case ("Fever 3 days, cough, RR 48, chest crepts") or ask about a drug. The AI sees the current
            prescription each time you ask.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-background border"
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy === "chat" && <p className="text-sm text-muted-foreground">AI is thinking...</p>}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 flex flex-col gap-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(draft);
            }
          }}
          placeholder="Ask the AI (Enter to send)"
        />
        <div className="flex flex-wrap gap-2 justify-end">
          <Button type="button" variant="outline" onClick={fill} disabled={messages.length === 0 || busy !== null}>
            {busy === "fill" ? "Writing..." : "Fill prescription (draft)"}
          </Button>
          <Button type="button" onClick={() => ask(draft)} disabled={!draft.trim() || busy !== null}>
            Send
          </Button>
        </div>
      </div>
    </aside>
  );
}
