import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { askAi, draftPrescription, type AiContext, type AiMessage, type AiPrescription } from "@/lib/clinic-ai";

type Props = {
  context: AiContext;
  onApply: (draft: AiPrescription) => void;
};

// Consultation chat with the AI; "Fill prescription" turns the chat into editable medicine rows.
export default function AiAssistant({ context, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"chat" | "fill" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next: AiMessage[] = [...messages, { role: "user", content: text }];
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
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI could not write the prescription.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4 mr-1" />
        Make diagnosis &amp; treatment by AI
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl h-[85vh] flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>AI diagnosis &amp; treatment</DialogTitle>
            <DialogDescription>
              Age {context.age}, {context.weightKg} kg{context.vitals ? `, ${context.vitals}` : ""}. Name and address
              are not sent. AI only suggests: check every diagnosis and dose before printing.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 rounded-md border p-3 bg-muted/30">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Write the complaints and findings, e.g. "Fever 3 days, cough, RR 48, chest crepts, feeding ok".
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-background border"
                }`}
              >
                {m.content}
              </div>
            ))}
            {busy === "chat" && <p className="text-sm text-muted-foreground">AI is thinking...</p>}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Describe the case or ask a question (Enter to send)"
          />
          <div className="flex flex-wrap gap-2 justify-end">
            <Button type="button" variant="outline" onClick={send} disabled={!draft.trim() || busy !== null}>
              Send
            </Button>
            <Button type="button" onClick={fill} disabled={messages.length === 0 || busy !== null}>
              {busy === "fill" ? "Writing..." : "Fill prescription"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
