import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bot, X, Send, Loader2, ChevronDown, Trash2, Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface ActionUser {
  userId: string;
  name: string | null;
  mobile: string | null;
  role: string;
}

interface ActionData {
  type: "user_list";
  filter: "noMobile" | "noLocation" | "suspiciousName";
  previewUsers: ActionUser[];
  total: number;
  snapshotToken: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  action?: ActionData;
}

interface AIChatProps {
  isAdmin?: boolean;
}

const FILTER_LABELS: Record<string, string> = {
  noMobile: "Mobile Number Nahi",
  noLocation: "Location Nahi",
  suspiciousName: "Suspicious Name",
};

interface ActionCardProps {
  action: ActionData;
  onConfirmDelete: (snapshotToken: string) => Promise<{ reply: string; deletedCount: number }>;
}

function ActionCard({ action, onConfirmDelete }: ActionCardProps) {
  const { toast } = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const displayUsers = showAll ? action.previewUsers : action.previewUsers.slice(0, 5);

  async function handleDelete() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setDeleting(true);
    try {
      const { reply, deletedCount: count } = await onConfirmDelete(action.snapshotToken);
      setDeletedCount(count);
      toast({ title: `✅ ${count} users delete ho gaye!` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bulk-filter-users"] });
    } catch {
      toast({ title: "Delete fail ho gaya. Dobara try karo.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  if (deletedCount !== null) {
    return (
      <div className="mt-2 flex items-center gap-2 text-green-600 text-xs font-medium bg-green-50 dark:bg-green-950 rounded-xl px-3 py-2">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        <span>{deletedCount} users delete ho gaye!</span>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden text-xs">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <Users className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
        <span className="font-semibold text-foreground">{FILTER_LABELS[action.filter] || action.filter}</span>
        <span className="ml-auto bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full font-bold">
          {action.total} users
        </span>
      </div>

      {action.total === 0 ? (
        <div className="px-3 py-2 text-muted-foreground italic">Koi user nahi mila is filter se.</div>
      ) : (
        <>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {displayUsers.map((u, i) => (
              <div key={u.userId} className="flex items-center gap-2 px-3 py-1.5" data-testid={`ai-action-user-${i}`}>
                <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-muted-foreground">
                  {(u.name || "?")[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground truncate">{u.name || <span className="italic text-muted-foreground">No name</span>}</div>
                  <div className="text-muted-foreground">{u.mobile || "No mobile"} · {u.role}</div>
                </div>
              </div>
            ))}
          </div>

          {action.previewUsers.length > 5 && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="w-full text-center text-violet-600 dark:text-violet-400 py-1.5 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 transition font-medium"
              data-testid="button-ai-action-show-more"
            >
              {showAll ? "Less dikhao ▲" : `+${action.previewUsers.length - 5} aur dekho ▼`}
            </button>
          )}

          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-700 flex gap-2">
            {confirmed ? (
              <>
                <div className="flex items-center gap-1.5 text-amber-600 text-[11px] font-medium flex-1">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Confirm: {action.total} users permanently delete honge!</span>
                </div>
                <button
                  onClick={() => setConfirmed(false)}
                  className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  data-testid="button-ai-action-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[11px] px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition flex items-center gap-1 disabled:opacity-60"
                  data-testid="button-ai-action-confirm-delete"
                >
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Haan, Delete Karo
                </button>
              </>
            ) : (
              <button
                onClick={handleDelete}
                disabled={!action.snapshotToken}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-lg bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400 font-semibold transition border border-red-200 dark:border-red-800 ml-auto disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="button-ai-action-delete"
              >
                <Trash2 className="w-3 h-3" />
                {action.total} users Delete Karo
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function AIChat({ isAdmin = false }: AIChatProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const adminMode = isAdmin || user?.role === "admin" || user?.role === "mainadmin";

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: adminMode
            ? "Namaste Admin! Main Mitrify AI hun. Aap mujhse kuch bhi puch sakte ho — users dhundhna, suspicious activity, stats, ya koi bhi kaam.\n\n💡 Try karo: \"No mobile users list karo\" ya \"Suspicious name wale users delete karo\""
            : "Namaste! Main Mitrify AI hun. Aap mujhse website ke baare mein kuch bhi puch sakte ho — services, providers, account se judi koi bhi cheez. Batao kya help chahiye?",
        },
      ]);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/ai/chat", {
        message: text,
        history: newMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        isAdmin: adminMode,
      });
      const data = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: data.reply || "Kuch problem aa gayi. Dobara try karo.",
        action: data.action,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Server se baat nahi ho payi. Thodi der baad try karo." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function confirmDelete(snapshotToken: string): Promise<{ reply: string; deletedCount: number }> {
    const res = await apiRequest("POST", "/api/ai/chat", {
      message: "Admin has confirmed. Please proceed with deletion.",
      snapshotToken,
      isAdmin: true,
    });
    const data = await res.json();
    const reply = data.reply || "Delete complete.";
    const deletedCount: number = typeof data.deletedCount === "number" ? data.deletedCount : 0;
    setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    return { reply, deletedCount };
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        data-testid="button-ai-chat-open"
        className="fixed bottom-20 right-4 z-[80] w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all active:scale-95 bg-gradient-to-br from-violet-600 to-indigo-600 text-white hover:shadow-violet-400/40 hover:shadow-2xl"
        title="Mitrify AI"
      >
        {open ? <ChevronDown className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {open && (
        <div
          className="fixed bottom-36 right-4 z-[80] w-[340px] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col"
          style={{ height: "500px" }}
          data-testid="panel-ai-chat"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 rounded-t-2xl bg-gradient-to-r from-violet-600 to-indigo-600">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-white" />
              <span className="font-bold text-white text-sm">Mitrify AI</span>
              {adminMode && (
                <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-semibold">Admin</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([])}
                data-testid="button-ai-chat-clear"
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition"
                title="Clear chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                data-testid="button-ai-chat-close"
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                data-testid={`msg-${m.role}-${i}`}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} w-full`}>
                  {m.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                      m.role === "user"
                        ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-br-sm"
                        : "bg-slate-100 dark:bg-slate-800 text-foreground rounded-bl-sm"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>

                {m.role === "assistant" && m.action && (
                  <div className="ml-8 w-[calc(100%-2rem)]">
                    <ActionCard
                      action={m.action}
                      onConfirmDelete={confirmDelete}
                    />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-2xl rounded-bl-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={adminMode ? "Admin ko kya karna hai?" : "Kuch bhi puch sakte ho..."}
                rows={1}
                className="flex-1 bg-transparent text-sm resize-none outline-none text-foreground placeholder:text-muted-foreground max-h-24"
                data-testid="input-ai-chat"
                style={{ minHeight: "24px" }}
              />
              <Button
                size="icon"
                className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 flex-shrink-0"
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                data-testid="button-ai-chat-send"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
