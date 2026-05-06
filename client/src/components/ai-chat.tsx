import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bot, X, Send, Loader2, ChevronDown, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIChatProps {
  isAdmin?: boolean;
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
            ? "Namaste Admin! Main Mitrify AI hun. Aap mujhse kuch bhi puch sakte ho — users dhundhna, suspicious activity, stats, ya koi bhi kaam. Batao kya chahiye?"
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
      setMessages(prev => [...prev, { role: "assistant", content: data.reply || "Kuch problem aa gayi. Dobara try karo." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Server se baat nahi ho payi. Thodi der baad try karo." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
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
          style={{ height: "480px" }}
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
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
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
