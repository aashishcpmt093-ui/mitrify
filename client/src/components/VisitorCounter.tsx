import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { useScrollToTopVisible } from "@/lib/scroll-to-top-store";

function formatNumber(n: number): string {
  if (n >= 10000000) return (n / 10000000).toFixed(1) + "Cr";
  if (n >= 100000) return (n / 100000).toFixed(1) + "L";
  return n.toLocaleString("en-IN");
}

export default function VisitorCounter() {
  const [total, setTotal] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);
  const showScrollToTop = useScrollToTopVisible();

  useEffect(() => {
    fetch("/api/visitor/track", { method: "POST", credentials: "include" }).catch(() => {});

    fetch("/api/visitor/count", { credentials: "include" })
      .then(r => r.json())
      .then(d => setTotal(d.total ?? 0))
      .catch(() => setTotal(null));
  }, []);

  if (!visible || total === null || showScrollToTop) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 group"
      data-testid="visitor-counter"
    >
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
          bg-white/90 dark:bg-slate-900/90 backdrop-blur-md
          border border-slate-200/60 dark:border-slate-700/60
          shadow-lg shadow-black/10
          text-slate-600 dark:text-slate-300
          cursor-default select-none
          transition-all duration-300 hover:scale-105 hover:shadow-xl"
      >
        <Eye className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium tracking-tight whitespace-nowrap">
          {formatNumber(total)} visitors
        </span>
        <button
          onClick={() => setVisible(false)}
          className="ml-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 leading-none"
          data-testid="button-hide-counter"
          aria-label="Hide counter"
        >
          ×
        </button>
      </div>
    </div>
  );
}
