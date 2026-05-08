import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";
import { useRef, useState, useEffect, useMemo } from "react";
import {
  Users, Wrench, Phone, IndianRupee, Shield, LogOut,
  Ban, Trash2, Download, TicketPlus, ToggleLeft, ToggleRight,
  Moon, Sun, Pencil, X, Save, FileText, Plus, Minus,
  Snowflake, RotateCcw, AlertTriangle, Coins, Search,
  SortAsc, Filter, TrendingUp, Activity, Briefcase, Link, Eye, EyeOff,
  UserCog, ExternalLink, Key, CheckCircle, Loader2,
  Calendar, Award, Clock, XCircle, ChevronRight, Upload, FileSpreadsheet,
  Copy, MapPin, Star, Database, Cloud, CloudUpload, Bell, Sparkles, Tag, Mail, UserRoundSearch
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SubscriptionsAdminPanel } from "@/components/SubscriptionsAdminPanel";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/hooks/use-auth";
import AIChat from "@/components/ai-chat";
import { BulkDeletePanel } from "@/components/BulkDeletePanel";
import type { AdminStats, Profile, CallLog, PromoCode } from "@shared/schema";
import { NO_ALERT_NEEDED_MESSAGE } from "@shared/schema";

// ── Google Places API cost estimate constants ──
// Source: Google Places API (New) "Text Search Pro" SKU pricing.
// Update these two values if Google changes pricing or our server changes
// how many pages it merges per fetch.
const GOOGLE_PLACES_USD_PER_CALL = 0.032;       // $0.032 per Text Search call
const GOOGLE_PLACES_CALLS_PER_FETCH = 2;        // server merges anchor + page-2

interface EditProviderState { open: boolean; profile: any | null; providerData: any | null; }

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-red-500", "bg-indigo-500",
];
function avatarColor(name: string | null | undefined) {
  if (!name) return AVATAR_COLORS[0];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

interface BackupStatusResponse {
  lastSuccessAt: string | null;
  lastSuccess: { filename: string; size: number; emailed: boolean; emailError?: string; gcsUploaded?: boolean; gcsName?: string; alertSent: boolean; alertError?: string; warnings?: string[] } | null;
  lastError: { at: string; message: string } | null;
  history: Array<{ filename: string; size: number; generatedAt: string; emailed: boolean; emailError?: string; durationMs: number; gcsUploaded?: boolean; alertSent: boolean; alertError?: string; totalRows?: number; tableCount?: number; warnings?: string[] }>;
}

function formatRows(n: number) {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// localStorage key for remembering the admin's last-selected stored backup
// filename across Backup-tab re-opens. Survives full page reloads.
const LAST_STORED_BACKUP_KEY = "mitrify.admin.lastStoredBackup";

function formatRelative(iso: string) {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} d ago`;
}

const BACKUP_COOLDOWN_MS = 5 * 60 * 1000;

function formatCountdown(ms: number) {
  const totalSecs = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function BackupStatusLine() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<BackupStatusResponse>({
    queryKey: ["/api/admin/backup/status"],
    refetchInterval: 5 * 60 * 1000,
  });

  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);

  useEffect(() => {
    if (lastRunAt === null) return;
    let id: ReturnType<typeof setInterval>;
    const tick = () => {
      const elapsed = Date.now() - lastRunAt;
      const left = BACKUP_COOLDOWN_MS - elapsed;
      if (left <= 0) {
        setRemainingMs(0);
        clearInterval(id);
        return;
      }
      setRemainingMs(left);
    };
    tick();
    id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastRunAt]);

  const runNowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/backup/run-now");
      return res.json();
    },
    onSuccess: (entry: any) => {
      const warnings: string[] = Array.isArray(entry?.warnings) ? entry.warnings : [];
      if (warnings.length > 0) {
        toast({
          title: `⚠️ Backup OK but ${warnings.length} table(s) shrank`,
          description: warnings.slice(0, 3).join(" • ") + (warnings.length > 3 ? ` • +${warnings.length - 3} more` : ""),
          variant: "destructive",
        });
      } else {
        toast({ title: "Backup complete", description: "Backup ran successfully." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/status"] });
      refetch();
      setLastRunAt(Date.now());
    },
    onError: (err: any) => {
      const msg = err?.message || "Backup failed";
      toast({ title: "Backup failed", description: msg, variant: "destructive" });
    },
  });

  if (isLoading) return null;

  const last = data?.lastSuccess ?? null;
  const lastAt = data?.lastSuccessAt ?? null;
  const err = data?.lastError ?? null;
  const isCoolingDown = remainingMs > 0;

  return (
    <div
      className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20"
      data-testid="status-auto-backup"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Database className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 truncate">
          Auto-backup:{" "}
          {lastAt && last ? (
            <span data-testid="text-last-backup-time">
              {formatRelative(lastAt)} · {formatBytes(last.size)}
              {last.emailed ? " · emailed" : " · email pending"}
              {last.gcsUploaded ? " · ☁ cloud" : ""}
              {last.alertSent ? (
                <span data-testid="text-backup-alert-status"> · alert ✓</span>
              ) : last.alertError === NO_ALERT_NEEDED_MESSAGE ? (
                <span
                  className="text-amber-700/80 dark:text-amber-300/80"
                  title={last.alertError}
                  data-testid="text-backup-alert-status"
                >
                  {" "}· alert n/a
                </span>
              ) : last.alertError ? (
                <span
                  className="text-red-700 dark:text-red-300"
                  title={last.alertError}
                  data-testid="text-backup-alert-status"
                >
                  {" "}· alert ✗
                </span>
              ) : null}
            </span>
          ) : (
            <span data-testid="text-last-backup-time">never run yet — first run scheduled at 2 AM IST</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {err && (
          <span
            className="text-[10px] font-semibold text-red-700 dark:text-red-300 truncate"
            data-testid="text-backup-error"
            title={err.message}
          >
            last error: {err.message.slice(0, 40)}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[11px] border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
          onClick={() => runNowMutation.mutate()}
          disabled={runNowMutation.isPending || isCoolingDown}
          data-testid="button-run-backup-now"
        >
          {runNowMutation.isPending ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
              Running…
            </>
          ) : isCoolingDown ? (
            <>
              <Clock className="w-3 h-3 mr-1" />
              <span data-testid="text-backup-cooldown">available in {formatCountdown(remainingMs)}</span>
            </>
          ) : (
            <>
              <Database className="w-3 h-3 mr-1" />
              Run now
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface TagJobStatus {
  jobId: string;
  total: number;
  processed: number;
  fromDict: number;
  fromAi: number;
  fromHybrid: number;
  skipped: number;
  failed: number;
  aiErrors: number;
  done: boolean;
  geminiAvailable: boolean;
  dryRun: boolean;
  errorSample: string[];
  aiErrorSample: string[];
  aiErrorBreakdown?: {
    rateLimited: number;
    maxTokens: number;
    parseFail: number;
    httpError: number;
    networkError: number;
    other: number;
  };
  aiFailedUserIds?: string[];
  workerFailedUserIds?: string[];
}

function AutoGenerateTagsCard() {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<TagJobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [resumed, setResumed] = useState(false);
  const finalToastFired = useRef(false);

  const { data: providerList } = useQuery<any[]>({ queryKey: ["/api/admin/providers"] });
  const providerCount = (providerList || []).filter((p: any) => p?.isActive !== false).length;
  const estSeconds = Math.max(2, Math.ceil(providerCount / 5));
  const estMinutes = Math.floor(estSeconds / 60);
  const estLabel = estMinutes >= 1
    ? `~${estMinutes} min ${estSeconds % 60}s`
    : `~${estSeconds}s`;

  // On mount, ask the backend for the most recent job (active OR a recently
  // finished one — including jobs the server marked failed on boot after a
  // restart). If it's still running, resume polling; if it's already
  // terminal, just show the final state without re-firing the success toast.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/auto-generate-tags/active", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.jobId || !data?.status) return;
        const s = data.status as TagJobStatus;
        setStatus(s);
        setResumed(true);
        if (s.done) {
          // Terminal state — don't start polling and don't fire the success
          // toast (the run already finished, possibly in a previous process).
          finalToastFired.current = true;
        } else {
          finalToastFired.current = false;
          setJobId(data.jobId as string);
        }
      } catch {
        // Silent — admin can still start a fresh job.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let consecutiveErrors = 0;
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/auto-generate-tags/status/${jobId}`, { credentials: "include" });
        if (res.status === 404) {
          if (intervalId) { clearInterval(intervalId); intervalId = null; }
          if (!cancelled) {
            toast({
              title: "Job khatam ho gaya",
              description: "Job status server par nahi mila (shayad server restart ya 30-min auto-cleanup). Dobara try karein.",
              variant: "destructive",
            });
            setJobId(null);
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: TagJobStatus = await res.json();
        if (cancelled) return;
        consecutiveErrors = 0;
        setStatus(data);
        if (data.done) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          if (!finalToastFired.current) {
            finalToastFired.current = true;
            const updated = data.fromDict + data.fromAi + data.fromHybrid;
            toast({
              title: data.dryRun ? "Dry run complete" : "Tags update ho gaye",
              description: `${updated} providers ko nayi tags mili (${data.fromDict} dictionary + ${data.fromAi} AI + ${data.fromHybrid} hybrid). ${data.skipped} skipped, ${data.failed} failed.`,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
            queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
          }
        }
      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          if (intervalId) { clearInterval(intervalId); intervalId = null; }
          if (!cancelled) {
            toast({
              title: "Status fetch fail ho raha hai",
              description: "Server reachable nahi hai. Page refresh karke dobara try karein.",
              variant: "destructive",
            });
            setJobId(null);
          }
        }
      }
    };
    tick();
    intervalId = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId]);

  const startJob = async () => {
    setStarting(true);
    finalToastFired.current = false;
    setStatus(null);
    setResumed(false); // a fresh user-initiated start is never a resume
    try {
      const res = await fetch("/api/admin/auto-generate-tags", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      if (!data.geminiAvailable) {
        toast({
          title: "Gemini key nahi mili",
          description: "Sirf dictionary se tags fill hongi. AI fallback ke liye GOOGLE_API_KEY (ya GEMINI_API_KEY) secret add karein.",
        });
      }
      setJobId(data.jobId);
      setConfirmOpen(false);
    } catch (err: any) {
      setJobId(null);
      setStatus(null);
      toast({ title: "Start failed", description: err?.message || "Could not start tag generation", variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const [retrying, setRetrying] = useState(false);
  const retryFailed = async (sourceJobId: string) => {
    setRetrying(true);
    finalToastFired.current = false;
    setResumed(false);
    try {
      const res = await fetch("/api/admin/auto-generate-tags/retry-failed", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceJobId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      setStatus(null);
      setJobId(data.jobId);
      toast({
        title: "Retry shuru ho gaya",
        description: `${data.retriedCount} failed providers ko dobara try kar rahe hain.`,
      });
    } catch (err: any) {
      toast({ title: "Retry failed", description: err?.message || "Could not start retry", variant: "destructive" });
    } finally {
      setRetrying(false);
    }
  };

  const running = !!jobId && !status?.done;
  const failedRetryCount =
    (status?.aiFailedUserIds?.length || 0) + (status?.workerFailedUserIds?.length || 0);
  const canRetryFailed = !!status?.done && !running && !starting && !retrying && failedRetryCount > 0;
  const pct = status && status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-fuchsia-200 dark:border-fuchsia-800/40 rounded-2xl p-5 space-y-4 shadow-sm" data-testid="card-auto-generate-tags">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-fuchsia-100 dark:bg-fuchsia-900/40 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-fuchsia-600 dark:text-fuchsia-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-slate-900 dark:text-white">Auto-Generate Provider Tags</h3>
          <p className="text-xs text-muted-foreground">Saare providers ke liye 5–10 Hinglish + English hashtags auto-fill karein. Existing tags safe rahengi (sirf naye merge honge).</p>
        </div>
      </div>

      <div className="bg-fuchsia-50 dark:bg-fuchsia-950/20 rounded-xl p-3 border border-fuchsia-100 dark:border-fuchsia-900/40 text-xs text-fuchsia-800 dark:text-fuchsia-300 space-y-1">
        <p><strong>Kaise kaam karta hai:</strong></p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Pehle local dictionary check (~30 common professions, instant + free)</li>
          <li>Agar dictionary se &lt; 5 tags milein → Gemini AI fallback (smart guess)</li>
          <li>Existing tags merge honge (case-insensitive dedupe), max 10 per provider</li>
        </ul>
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700/40">
        <div className="flex items-center gap-2 min-w-0">
          <Tag className="w-4 h-4 text-slate-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold">Dry Run (preview only)</p>
            <p className="text-[11px] text-muted-foreground truncate">DB ko touch nahi karega — sirf count batayega</p>
          </div>
        </div>
        <Switch checked={dryRun} onCheckedChange={setDryRun} disabled={running} data-testid="switch-tag-dry-run" />
      </div>

      <Button
        className="w-full h-11 text-sm font-semibold gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
        onClick={() => setConfirmOpen(true)}
        disabled={running || starting}
        data-testid="button-auto-generate-tags"
      >
        {running ? (
          <><Loader2 className="w-4 h-4 animate-spin" />Tags generate ho rahi hain… ({status?.processed ?? 0}/{status?.total ?? 0})</>
        ) : (
          <><Sparkles className="w-4 h-4" />{dryRun ? "Dry Run Karein" : "Auto-Generate Tags for All Providers"}</>
        )}
      </Button>

      {status && (
        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-slate-700/40" data-testid="status-tag-job">
          {resumed && (
            <p className="text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 rounded-md px-2 py-1.5" data-testid="text-tag-resumed">
              ⟳ Pehle se chal raha job resume kiya gaya — page refresh ya server restart ke baad bhi progress safe hai.
            </p>
          )}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">{status.done ? (status.dryRun ? "Dry run complete" : "Done") : "Processing…"}</span>
              <span className="text-muted-foreground" data-testid="text-tag-progress">{status.processed} / {status.total} ({pct}%)</span>
            </div>
            <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${status.done ? "bg-emerald-500" : "bg-fuchsia-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            <div className="bg-white dark:bg-slate-900 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">Dictionary</p>
              <p className="text-base font-bold text-blue-600 dark:text-blue-400" data-testid="text-tag-dict">{status.fromDict}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">AI</p>
              <p className="text-base font-bold text-fuchsia-600 dark:text-fuchsia-400" data-testid="text-tag-ai">{status.fromAi}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">Hybrid</p>
              <p className="text-base font-bold text-violet-600 dark:text-violet-400" data-testid="text-tag-hybrid">{status.fromHybrid}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">Skipped</p>
              <p className="text-base font-bold text-slate-600 dark:text-slate-400" data-testid="text-tag-skipped">{status.skipped}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">Failed</p>
              <p className="text-base font-bold text-red-600 dark:text-red-400" data-testid="text-tag-failed">{status.failed}</p>
            </div>
          </div>
          {!status.geminiAvailable && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              ⚠ GOOGLE_API_KEY (ya GEMINI_API_KEY) missing — sirf dictionary use ho rahi hai. AI fallback ke liye secret add karein.
            </p>
          )}
          {status.geminiAvailable && status.aiErrors > 0 && (
            <div
              className="text-[11px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-md px-2 py-2 text-amber-800 dark:text-amber-300 space-y-2"
              data-testid="warning-tag-ai-errors"
            >
              <p className="font-semibold">
                ⚠ AI ne {status.aiErrors} provider{status.aiErrors === 1 ? "" : "s"} par fail kiya — dictionary fallback chal raha hai, lekin Gemini side check karein.
              </p>
              {status.aiErrorBreakdown && (() => {
                const b = status.aiErrorBreakdown!;
                const rows: Array<{ key: string; label: string; count: number; testid: string }> = [
                  { key: "rateLimited", label: "Rate limit (429)", count: b.rateLimited || 0, testid: "text-ai-error-rate-limited" },
                  { key: "maxTokens", label: "Empty / MAX_TOKENS", count: b.maxTokens || 0, testid: "text-ai-error-max-tokens" },
                  { key: "parseFail", label: "Parse failed", count: b.parseFail || 0, testid: "text-ai-error-parse-fail" },
                  { key: "httpError", label: "HTTP error", count: b.httpError || 0, testid: "text-ai-error-http" },
                  { key: "networkError", label: "Network", count: b.networkError || 0, testid: "text-ai-error-network" },
                  { key: "other", label: "Other", count: b.other || 0, testid: "text-ai-error-other" },
                ].filter(r => r.count > 0);
                if (rows.length === 0) return null;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5" data-testid="grid-ai-error-breakdown">
                    {rows.map(r => (
                      <div
                        key={r.key}
                        className="bg-white/60 dark:bg-slate-900/40 rounded px-2 py-1 flex items-center justify-between gap-2"
                        data-testid={r.testid}
                      >
                        <span className="truncate">{r.label}</span>
                        <span className="font-bold tabular-nums">{r.count}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {status.aiErrorSample.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">AI errors (sample {status.aiErrorSample.length})</summary>
                  <ul className="list-disc list-inside mt-1 space-y-0.5" data-testid="list-ai-error-sample">
                    {status.aiErrorSample.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
          {(status.failed > 0 || status.errorSample.length > 0) && (
            <details className="text-[11px] text-red-700 dark:text-red-400" data-testid="details-worker-errors">
              <summary className="cursor-pointer">
                Worker / DB errors ({status.failed}){status.errorSample.length > 0 ? ` — sample ${status.errorSample.length}` : ""}
              </summary>
              {status.errorSample.length > 0 && (
                <ul className="list-disc list-inside mt-1 space-y-0.5" data-testid="list-worker-error-sample">
                  {status.errorSample.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </details>
          )}
          {canRetryFailed && (
            <Button
              variant="outline"
              className="w-full h-10 text-sm font-semibold gap-2 border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              onClick={() => retryFailed(status.jobId)}
              disabled={retrying}
              data-testid="button-retry-failed-tags"
            >
              {retrying ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Retry shuru kar rahe hain…</>
              ) : (
                <><Sparkles className="w-4 h-4" />Retry failed only ({failedRetryCount} provider{failedRetryCount === 1 ? "" : "s"})</>
              )}
            </Button>
          )}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="dialog-confirm-tags">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-fuchsia-600" />
              Confirm Tag Generation
            </DialogTitle>
            <DialogDescription>
              {dryRun
                ? "Yeh dry run hai — koi DB change nahi hoga, sirf preview."
                : "Yeh action saare providers ke hashtags update karega. Existing tags safe rahengi (sirf naye merge honge), lekin yeh action undo nahi ho sakta."}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 border border-slate-200 dark:border-slate-700/40 text-xs space-y-1.5" data-testid="text-tag-estimate">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total providers:</span>
              <span className="font-bold text-slate-900 dark:text-white" data-testid="text-tag-provider-count">{providerCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Estimated time:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{estLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Estimated cost:</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">≈ ₹0 (Gemini free tier)</span>
            </div>
          </div>
          <div className="bg-fuchsia-50 dark:bg-fuchsia-950/20 rounded-lg p-3 text-xs text-fuchsia-800 dark:text-fuchsia-300 space-y-1">
            <p>• Dictionary first (instant, free)</p>
            <p>• Gemini AI fallback when dictionary &lt; 5 tags</p>
            <p>• Maximum 10 tags per provider, dedupe case-insensitive</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={starting} data-testid="button-cancel-tag-gen">Cancel</Button>
            <Button
              className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
              onClick={startJob}
              disabled={starting}
              data-testid="button-confirm-tag-gen"
            >
              {starting ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Starting…</>) : (dryRun ? "Run Dry Preview" : "Yes, Generate Tags")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── AI Token Usage Chart ─────────────────────────────────────────────────────
function AiTokenUsageChart() {
  const [hours, setHours] = useState<24 | 48 | 168>(24);

  const { data, isLoading, isError } = useQuery<{
    rows: { hour: string; tokens: number }[];
    threshold: number;
    hours: number;
  }>({
    queryKey: ["/api/admin/ai/token-usage", hours],
    queryFn: async () => {
      const res = await fetch(`/api/admin/ai/token-usage?hours=${hours}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load token usage (${res.status})`);
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const chartData = useMemo(() => {
    if (!data?.rows) return [];
    const now = new Date();
    const multiDay = hours > 24;
    const buckets: { label: string; tooltipLabel: string; isoHour: string; tokens: number }[] = [];
    for (let i = hours - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() - i);
      const isoHour = d.toISOString().slice(0, 13);
      const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      const dateStr = d.toLocaleDateString([], { month: "short", day: "numeric" });
      const label = multiDay ? `${dateStr} ${timeStr}` : timeStr;
      const tooltipLabel = `${dateStr}, ${timeStr}`;
      buckets.push({ label, tooltipLabel, isoHour, tokens: 0 });
    }
    for (const row of data.rows) {
      const rowHour = new Date(row.hour).toISOString().slice(0, 13);
      const bucket = buckets.find(b => b.isoHour === rowHour);
      if (bucket) bucket.tokens = row.tokens;
    }
    return buckets;
  }, [data, hours]);

  const threshold = data?.threshold ?? 0;
  const totalTokens = chartData.reduce((s, r) => s + r.tokens, 0);
  const maxTokens = Math.max(...chartData.map(r => r.tokens), threshold, 1);

  function downloadCsv() {
    const dateTag = new Date().toISOString().slice(0, 10);
    const filename = `ai-token-usage-${hours}h-${dateTag}.csv`;
    const url = `/api/admin/ai/token-usage?hours=${hours}&format=csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }

  return (
    <div
      className="bg-white dark:bg-slate-900 border border-fuchsia-200 dark:border-fuchsia-800/40 rounded-2xl p-5 space-y-4 shadow-sm"
      data-testid="section-ai-token-chart"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-base flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-fuchsia-100 dark:bg-fuchsia-900/40 flex items-center justify-center">
            <Activity className="w-4 h-4 text-fuchsia-600 dark:text-fuchsia-400" />
          </div>
          Token Usage History
        </h3>
        <div className="flex items-center gap-2">
          {totalTokens > 0 && (
            <span className="text-xs text-muted-foreground" data-testid="text-ai-total-tokens">
              Total: <span className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">{totalTokens.toLocaleString()}</span>
            </span>
          )}
          <Select value={String(hours)} onValueChange={v => setHours(Number(v) as 24 | 48 | 168)}>
            <SelectTrigger className="h-8 rounded-xl text-xs w-28" data-testid="select-ai-chart-hours">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24">Last 24 hrs</SelectItem>
              <SelectItem value="48">Last 48 hrs</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={downloadCsv}
            disabled={!data || isLoading || isError}
            title="Download CSV"
            data-testid="button-ai-chart-download-csv"
            className="h-8 w-8 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-muted-foreground hover:text-fuchsia-600 dark:hover:text-fuchsia-400 hover:border-fuchsia-300 dark:hover:border-fuchsia-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-fuchsia-400" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2" data-testid="text-ai-chart-error">
          <AlertTriangle className="w-8 h-8 opacity-40 text-red-400" />
          <p className="text-sm">Could not load token usage data. Please try again.</p>
        </div>
      ) : chartData.every(r => r.tokens === 0) ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2" data-testid="text-ai-chart-empty">
          <Sparkles className="w-8 h-8 opacity-30" />
          <p className="text-sm">No token usage recorded in this period</p>
        </div>
      ) : (
        <div className="h-52" data-testid="chart-ai-token-usage">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "currentColor" }}
                tickLine={false}
                axisLine={false}
                interval={hours <= 24 ? 3 : hours <= 48 ? 5 : 23}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "currentColor" }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                domain={[0, Math.ceil(maxTokens * 1.1)]}
              />
              <Tooltip
                formatter={(value: number) => [value.toLocaleString(), "Tokens"]}
                labelFormatter={(_label, payload) => {
                  const entry = payload?.[0]?.payload;
                  return entry?.tooltipLabel ? `Hour: ${entry.tooltipLabel}` : `Hour: ${_label}`;
                }}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid rgba(192,132,252,0.4)",
                  fontSize: "12px",
                }}
              />
              {threshold > 0 && (
                <ReferenceLine
                  y={threshold}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: "Threshold", position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }}
                />
              )}
              <Bar dataKey="tokens" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {chartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.tokens >= threshold && threshold > 0 ? "#f87171" : "#c084fc"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {threshold > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block bg-[#c084fc]" />
            Normal
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block bg-[#f87171]" />
            Exceeded threshold ({threshold.toLocaleString()} tokens/hr)
          </span>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [newPromoCode, setNewPromoCode] = useState("");
  const [newPromoCredits, setNewPromoCredits] = useState("25");
  const [editPromoId, setEditPromoId] = useState<number | null>(null);
  const [editPromoCode, setEditPromoCode] = useState("");
  const [editPromoCredits, setEditPromoCredits] = useState("");
  const [editProvider, setEditProvider] = useState<EditProviderState>({ open: false, profile: null, providerData: null });
  const [editName, setEditName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editServiceName, setEditServiceName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editHashtags, setEditHashtags] = useState("");
  const [editApproxCharge, setEditApproxCharge] = useState("");
  const [editMobileNumbers, setEditMobileNumbers] = useState("");
  const [editRadiusKm, setEditRadiusKm] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editHidden, setEditHidden] = useState(false);
  const [focusMobileOnOpen, setFocusMobileOnOpen] = useState(false);
  const [showNoMobileWarning, setShowNoMobileWarning] = useState(false);
  const mobileNumbersInputRef = useRef<HTMLInputElement>(null);

  const [provSearch, setProvSearch] = useState("");
  const [provFilter, setProvFilter] = useState("all");
  const [provAddedByFilter, setProvAddedByFilter] = useState("all");
  const [provApprovedByFilter, setProvApprovedByFilter] = useState("all");
  const [provSort, setProvSort] = useState("newest");

  const [aboutForm, setAboutForm] = useState({
    founderName: "Dr. Asheesh",
    founderTitle: "Founder & Developer",
    location: "District Budaun, Uttar Pradesh, India",
    education: "MBBS, Government Medical College (GMC), Kota, Rajasthan",
    missionTitle: "Our Mission",
    missionText: "Mitrify ka mission hai ki har vyakti ko apne aas-paas ke service providers se turant jodna. Chahe aapko plumber chahiye, electrician, ya koi bhi service — Mitrify aapko sabse nazdeeki aur bharosemand service provider se connect karta hai, bas ek click mein.",
    whatIsTitle: "Mitrify Kya Hai?",
    whatIsText: "Mitrify ek service marketplace platform hai jo customers aur service providers ke beech ka bridge ka kaam karta hai. Hum sirf ek information provider hain — hum aapko service providers ki contact details aur jankari provide karte hain.",
    feature1: "Customers ko nearby service providers milte hain",
    feature2: "Ek click mein direct call karo",
    feature3: "Location-based search se sabse paas wale providers dikhte hain",
  });

  const [termsForm, setTermsForm] = useState({
    intro: "Mitrify.com का उपयोग करने से पहले कृपया निम्नलिखित नियमों और शर्तों को ध्यान से पढ़ें। इस वेबसाइट का उपयोग करके, आप इन शर्तों से सहमत होते हैं:",
    sections: [
      { title: "1. हमारी भूमिका (Our Role)", content: "Mitrify.com एक सूचना प्रदाता (Information Provider) मंच है।" },
    ] as { title: string; content: string }[],
    footer: "Mitrify.com का उपयोग करने का अर्थ है कि आपने उपरोक्त सभी शर्तों को समझ लिया है और आप इनसे पूरी तरह सहमत हैं।",
  });

  const [recruitmentLink, setRecruitmentLink] = useState("https://forms.gle/C54uAz7pkupe6g136");
  const [contactEmails, setContactEmails] = useState<{ label: string; email: string }[]>([
    { label: "Help & Support", email: "help@mitrify.com" },
    { label: "General Inquiries", email: "contact@mitrify.in" },
  ]);
  const [activeTab, setActiveTab] = useState("providers");
  const [gcsMode, setGcsMode] = useState<"overwrite" | "new">("new");
  const [gcsUploadResult, setGcsUploadResult] = useState<{ gcsName: string; url: string; size: number } | null>(null);
  const [testAlertPending, setTestAlertPending] = useState(false);
  const [restoreMode, setRestoreMode] = useState<"upload" | "stored" | "gcs">("upload");
  const [restoreStrategy, setRestoreStrategy] = useState<"merge" | "overwrite" | "lenient">("merge");
  const [selectedGcsName, setSelectedGcsName] = useState<string>("");
  const [gcsListLoading, setGcsListLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [selectedStoredFilename, setSelectedStoredFilename] = useState<string | null>(null);
  const [storedFileFetching, setStoredFileFetching] = useState(false);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<{
    totalRowsBefore: number;
    totalRowsAfter: number;
    durationMs: number;
    tables: Array<{ table: string; rowsBefore: number; rowsAfter: number; delta: number; rowsAdded?: number; rowsSkipped?: number }>;
    allowList: string[] | null;
    mode: "merge" | "overwrite" | "lenient";
    skippedCount?: number;
    skippedSamples?: string[];
  } | null>(null);
  const [parsedTables, setParsedTables] = useState<Array<{ name: string; rowCount: number }> | null>(null);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [downloadInProgress, setDownloadInProgress] = useState(false);
  const [dryRunInProgress, setDryRunInProgress] = useState(false);
  const [restoreCancelled, setRestoreCancelled] = useState(false);
  const [restoreCancelling, setRestoreCancelling] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{
    tableCount: number;
    tables: Array<{ name: string; rowsInDump: number; existingRowCount?: number }>;
    unknownStatements: string[];
    mode?: "merge" | "overwrite";
  } | null>(null);

  async function handleBackupDownload() {
    setDownloadInProgress(true);
    toast({
      title: "Backup download started",
      description: "Sab data download ho raha hai. Bada file hai, thoda time lag sakta hai.",
    });
    try {
      const res = await fetch("/api/admin/backup", { credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const disposition = res.headers.get("content-disposition") || "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match?.[1] || "mitrify-backup.sql";
      // Surface row-drop warnings as a destructive toast BEFORE the blob
      // is consumed — the server set these headers up-front (see
      // streamBackupSql onMetricsReady).
      const warnCount = parseInt(res.headers.get("X-Backup-Warnings") || "0", 10);
      if (warnCount > 0) {
        const detailRaw = res.headers.get("X-Backup-Warning-Detail") || "";
        let detail = "";
        try { detail = decodeURIComponent(detailRaw); } catch { detail = detailRaw; }
        toast({
          title: `⚠️ Backup OK but ${warnCount} table(s) shrank`,
          description: detail.slice(0, 240) || "Check dump header for details.",
          variant: "destructive",
        });
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download shuru nahi ho saki";
      toast({ title: "Backup failed", description: msg, variant: "destructive" });
    } finally {
      setDownloadInProgress(false);
    }
  }

  function parseSqlTables(text: string): Array<{ name: string; rowCount: number }> {
    const re = /-- Table: (\S+)\s+\|\s+rows in dump: (\d+)/g;
    const results: Array<{ name: string; rowCount: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      results.push({ name: m[1], rowCount: parseInt(m[2], 10) });
    }
    return results;
  }

  const restoreReady =
    restoreMode === "upload" ? !!restoreFile : restoreMode === "stored" ? !!selectedStoredFilename : !!selectedGcsName;
  const restoreLabel =
    restoreMode === "upload" ? (restoreFile?.name || "the uploaded file") : restoreMode === "stored" ? (selectedStoredFilename || "the selected file") : (selectedGcsName || "the selected GCS file");

  async function handleDryRun() {
    if (!restoreReady || dryRunInProgress || restoreInProgress) return;
    if (parsedTables && parsedTables.length > 0 && selectedTables.size === 0) {
      toast({ title: "No tables selected", description: "Tick at least one table to preview.", variant: "destructive" });
      return;
    }
    setDryRunInProgress(true);
    setDryRunResult(null);
    try {
      let res: Response;
      if (restoreMode === "stored") {
        res = await fetch("/api/admin/restore/stored/preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: selectedStoredFilename,
            tables: parsedTables !== null && parsedTables.length > 0 ? Array.from(selectedTables) : undefined,
            mode: restoreStrategy,
          }),
        });
      } else if (restoreMode === "gcs") {
        res = await fetch("/api/admin/restore/gcs-preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gcsName: selectedGcsName,
            ...(parsedTables !== null && parsedTables.length > 0 ? { tables: Array.from(selectedTables) } : {}),
            mode: restoreStrategy,
          }),
        });
      } else {
        const fd = new FormData();
        fd.append("file", restoreFile!);
        if (parsedTables !== null && parsedTables.length > 0) {
          fd.append("tables", JSON.stringify(Array.from(selectedTables)));
        }
        fd.append("mode", restoreStrategy);
        res = await fetch("/api/admin/restore/preview", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      setDryRunResult({
        tableCount: data.tableCount ?? 0,
        tables: Array.isArray(data.tables) ? data.tables : [],
        unknownStatements: Array.isArray(data.unknownStatements) ? data.unknownStatements : [],
        mode: data.mode ?? restoreStrategy,
      });
      // For GCS: also use the preview response to populate the table checklist
      // on first preview (when we don't yet know what tables exist).
      if (restoreMode === "gcs" && parsedTables === null && Array.isArray(data.tables)) {
        const list = data.tables.map((t: any) => ({ name: String(t.name), rowCount: Number(t.rowsInDump || 0) }));
        setParsedTables(list);
        setSelectedTables(new Set(list.map((t: { name: string }) => t.name)));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Preview failed";
      toast({ title: "Preview failed", description: msg, variant: "destructive" });
    } finally {
      setDryRunInProgress(false);
    }
  }

  async function handleRestoreCancel() {
    setRestoreCancelling(true);
    try {
      await fetch("/api/admin/restore/cancel", {
        method: "POST",
        credentials: "include",
      });
    } catch {} finally {
      setRestoreCancelling(false);
    }
  }

  async function handleRestoreSubmit() {
    if (!restoreReady || !restoreConfirmed || restoreInProgress) return;
    if (parsedTables && parsedTables.length > 0 && selectedTables.size === 0) {
      toast({ title: "No tables selected", description: "Tick at least one table to restore.", variant: "destructive" });
      return;
    }
    setRestoreInProgress(true);
    setRestoreSummary(null);
    setRestoreCancelled(false);
    setRestoreCancelling(false);
    try {
      let res: Response;
      if (restoreMode === "stored") {
        res = await fetch("/api/admin/restore/stored", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: selectedStoredFilename,
            tables: parsedTables !== null && parsedTables.length > 0 ? Array.from(selectedTables) : undefined,
            mode: restoreStrategy,
          }),
        });
      } else if (restoreMode === "gcs") {
        res = await fetch("/api/admin/restore/gcs", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gcsName: selectedGcsName,
            ...(parsedTables !== null && parsedTables.length > 0 ? { tables: Array.from(selectedTables) } : {}),
            mode: restoreStrategy,
          }),
        });
      } else {
        const fd = new FormData();
        fd.append("file", restoreFile!);
        if (parsedTables !== null && parsedTables.length > 0) {
          fd.append("tables", JSON.stringify(Array.from(selectedTables)));
        }
        fd.append("mode", restoreStrategy);
        res = await fetch("/api/admin/restore", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data?.cancelled) {
        setRestoreCancelled(true);
        return;
      }
      if (!res.ok) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      const resultMode: "merge" | "overwrite" | "lenient" = data.mode === "overwrite" ? "overwrite" : data.mode === "lenient" ? "lenient" : "merge";
      setRestoreSummary({
        totalRowsBefore: data.totalRowsBefore ?? 0,
        totalRowsAfter: data.totalRowsAfter ?? 0,
        durationMs: data.durationMs ?? 0,
        tables: Array.isArray(data.tables)
          ? data.tables.map((t: any) => ({
              table: t.table,
              rowsBefore: t.rowsBefore ?? 0,
              rowsAfter: t.rowsAfter ?? 0,
              delta: t.delta ?? 0,
              rowsAdded: t.rowsAdded,
              rowsSkipped: t.rowsSkipped,
            }))
          : [],
        allowList: Array.isArray(data.allowList) ? data.allowList : null,
        mode: resultMode,
        skippedCount: data.skippedCount,
        skippedSamples: data.skippedSamples,
      });
      const totalAdded = resultMode === "merge"
        ? (data.tables ?? []).reduce((s: number, t: any) => s + (t.rowsAdded ?? Math.max(0, t.delta ?? 0)), 0)
        : data.totalRowsAfter ?? 0;
      toast({
        title: resultMode === "lenient" ? "Best-effort restore complete" : resultMode === "merge" ? "Merge restore complete" : "Restore complete",
        description: resultMode === "lenient"
          ? `${data.totalRowsAfter ?? 0} rows restored. ${data.skippedCount ?? 0} statement${(data.skippedCount ?? 0) !== 1 ? "s" : ""} skipped.`
          : resultMode === "merge"
          ? `${totalAdded} new rows added across ${data.tables?.length ?? 0} tables.`
          : `${data.totalRowsAfter ?? 0} rows restored across ${data.tables?.length ?? 0} tables.`,
      });
      queryClient.invalidateQueries();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      toast({ title: "Restore failed", description: msg, variant: "destructive" });
    } finally {
      setRestoreInProgress(false);
    }
  }

  async function handleStoredFileSelect(filename: string) {
    setSelectedStoredFilename(filename);
    // Persist last selection so re-opening the Backup tab can restore it.
    // Best-effort — quota/private-mode failures must not break selection.
    try {
      if (filename) localStorage.setItem(LAST_STORED_BACKUP_KEY, filename);
    } catch {}
    setRestoreConfirmed(false);
    setRestoreSummary(null);
    setDryRunResult(null);
    setParsedTables(null);
    setSelectedTables(new Set());
    if (!filename) return;
    setStoredFileFetching(true);
    try {
      const res = await fetch("/api/admin/restore/stored/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      const tables: Array<{ name: string; rowCount: number }> = (data.tables ?? []).map((t: any) => ({
        name: t.name,
        rowCount: t.rowsInDump ?? 0,
      }));
      setParsedTables(tables);
      setSelectedTables(new Set(tables.map((t) => t.name)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to read backup file";
      toast({ title: "Could not read stored backup", description: msg, variant: "destructive" });
      setParsedTables([]);
    } finally {
      setStoredFileFetching(false);
    }
  }
  const [newCoAdminUser, setNewCoAdminUser] = useState("");
  const [newCoAdminPass, setNewCoAdminPass] = useState("");
  const [newCoAdminRole, setNewCoAdminRole] = useState("coadmin");
  const [changePwdId, setChangePwdId] = useState<number | null>(null);
  const [changePwdVal, setChangePwdVal] = useState("");
  const [editJobId, setEditJobId] = useState<number | null>(null);
  const [editJobForm, setEditJobForm] = useState({ jobName: "", description: "", location: "", salary: "", workHours: "", contactPhone: "", isActive: true, postType: "mitrify", googleFormUrl: "" });
  const GOOGLE_FORM_URL_RE = /^https?:\/\/(forms\.gle\/[^\s]+|docs\.google\.com\/forms\/[^\s]+)$/i;
  const [selectedProviderDetail, setSelectedProviderDetail] = useState<any | null>(null);
  const [selectedCoAdminId, setSelectedCoAdminId] = useState<number | null>(null);
  const [showSalaryHistory, setShowSalaryHistory] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [verifiedListStatus, setVerifiedListStatus] = useState<"approved" | "rejected" | null>(null);
  const [giftCreditsAmount, setGiftCreditsAmount] = useState("");
  const [showCreditPurchasers, setShowCreditPurchasers] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);
  const [importAllowDuplicate, setImportAllowDuplicate] = useState(false);
  const [metaAllowDuplicate, setMetaAllowDuplicate] = useState(false);
  const [metaBulkApproving, setMetaBulkApproving] = useState(false);
  const [metaBulkResult, setMetaBulkResult] = useState<{ approved: number; total: number; noMobileApproved: number; noMobileApprovedIds: string[]; errors: string[] } | null>(null);
  const [recentNoMobileIds, setRecentNoMobileIds] = useState<Set<string>>(new Set());
  const [bulkApproveConfirmOpen, setBulkApproveConfirmOpen] = useState(false);
  const [bulkPreflightData, setBulkPreflightData] = useState<{ total: number; noMobile: number } | null>(null);
  const [bulkPreflightLoading, setBulkPreflightLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importNameCol, setImportNameCol] = useState("Name");
  const [importMobileCol, setImportMobileCol] = useState("Mobile number");
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; total: number; skippedNoMobile?: number } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<string[]>([]);
  const [numGroups, setNumGroups] = useState(5);
  const [groupAssignMode, setGroupAssignMode] = useState<"fixed" | "equal">("fixed");
  const [groupSize, setGroupSize] = useState(10000);
  const [assignGroupsLoading, setAssignGroupsLoading] = useState(false);
  const [assignGroupsResult, setAssignGroupsResult] = useState<{ assigned: number; groups: Record<string, number> } | null>(null);

  // Google Places fetch state
  const [gpCity, setGpCity] = useState("");
  const [gpService, setGpService] = useState("");
  const [gpAssignTo, setGpAssignTo] = useState("_default");
  const [gpAllowDuplicate, setGpAllowDuplicate] = useState(false);
  const [gpAutoApprove, setGpAutoApprove] = useState(true);
  const [gpSearching, setGpSearching] = useState(false);
  const [gpImporting, setGpImporting] = useState(false);
  const [gpResults, setGpResults] = useState<Array<{ placeId: string; name: string; address: string; latitude: number | null; longitude: number | null; phone: string; website: string; rating: number | null; ratingCount: number | null }>>([]);
  const [gpSelected, setGpSelected] = useState<Set<string>>(new Set());
  const [gpImportResult, setGpImportResult] = useState<{ imported: number; skipped: number; total: number; skippedNoMobile: number; approved?: number } | null>(null);
  // Initial fetch returns ~40 businesses (server merges 2 Google pages per
  // call). The admin can then click "Add More" repeatedly to append another
  // ~40 each time, up to the daily run quota.
  const GP_PAGE_SIZE = 40;
  const [gpProgress, setGpProgress] = useState<{
    target: number; fetched: number; unique: number; duplicates: number;
    apiCalls: number; done: boolean; cancelled: boolean; error?: string;
    startedAt: number; finishedAt?: number;
  } | null>(null);
  const [gpDisplayLimit, setGpDisplayLimit] = useState(200);
  const [gpRateInfo, setGpRateInfo] = useState<{ runsToday: number; max: number } | null>(null);
  const gpAutoSeenRef = useRef<Set<string>>(new Set());
  const gpCancelRef = useRef<boolean>(false);
  // Saved continuation token from the last fetch — lets the admin click
  // "Add 20 More" to append the next Google page to existing results
  // without resetting the list or current selection.
  const [gpNextPageToken, setGpNextPageToken] = useState<string | null>(null);
  const [gpFetchingMore, setGpFetchingMore] = useState(false);
  // Tracks every placeId already in `gpResults` across the original fetch
  // and any subsequent "Add More" clicks, so we never insert duplicates.
  const gpSeenIdsRef = useRef<Set<string>>(new Set());
  // Mirrors `gpCancelRef` so the Stop button can re-render immediately
  // into a "Stopping…" state — refs alone don't trigger re-renders.
  const [gpCancelRequested, setGpCancelRequested] = useState(false);

  // Meta import state
  const [metaFile, setMetaFile] = useState<File | null>(null);
  const [metaPreview, setMetaPreview] = useState<string[]>([]);
  const [metaNameCol, setMetaNameCol] = useState("Name");
  const [metaMobileCol, setMetaMobileCol] = useState("Mobile number");
  const [metaServiceCol, setMetaServiceCol] = useState("");
  const [metaAddressCol, setMetaAddressCol] = useState("");
  const [metaDescriptionCol, setMetaDescriptionCol] = useState("");
  const [metaAssignTo, setMetaAssignTo] = useState("_default");
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaResult, setMetaResult] = useState<{ imported: number; skipped: number; total: number; skippedNoMobile?: number } | null>(null);

  const { data: isAdmin, isLoading: isAdminLoading, isFetching: isAdminFetching } = useQuery({
    queryKey: ["/api/admin/check"],
    queryFn: async () => {
      const res = await fetch("/api/admin/check", { credentials: "include" });
      const data = await res.json();
      return data.isAdmin as boolean;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (isAdmin === false && !isAdminFetching) setLocation("/admin/login");
  }, [isAdmin, isAdminFetching]);

  // One-shot ref: ensures the last-selected stored backup is auto-restored
  // exactly once per Backup-tab visit, not on every render. Resets when the
  // admin leaves the Backup tab so the next visit can restore again.
  const restoredLastSelectionRef = useRef(false);
  useEffect(() => {
    if (activeTab !== "backup") {
      restoredLastSelectionRef.current = false;
    }
  }, [activeTab]);

  const { data: backupStatus } = useQuery<BackupStatusResponse>({
    queryKey: ["/api/admin/backup/status"],
    refetchInterval: 5 * 60 * 1000,
    enabled: !!isAdmin,
  });

  // Auto-restore the admin's last-selected stored backup whenever the Backup
  // tab opens (or on first load if it's already the active tab). Saves the
  // admin from re-clicking after switching tabs or refreshing.
  // Guards: only fires once per tab visit, only if no current selection,
  // and only if the saved file still exists in the latest history.
  useEffect(() => {
    if (activeTab !== "backup") return;
    if (restoredLastSelectionRef.current) return;
    if (!backupStatus?.history?.length) return;
    if (selectedStoredFilename || restoreFile || selectedGcsName) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(LAST_STORED_BACKUP_KEY); } catch {}
    if (!saved) return;
    if (!backupStatus.history.some((e) => e.filename === saved)) {
      // Stale entry (e.g. file was rotated out) — purge so we don't keep retrying.
      try { localStorage.removeItem(LAST_STORED_BACKUP_KEY); } catch {}
      return;
    }
    restoredLastSelectionRef.current = true;
    setRestoreMode("stored");
    void handleStoredFileSelect(saved);
  }, [activeTab, backupStatus, selectedStoredFilename, restoreFile, selectedGcsName]);

  const { data: stats } = useQuery<AdminStats>({ queryKey: ["/api/admin/stats"], enabled: !!isAdmin });
  const { data: providersList } = useQuery<any[]>({ queryKey: ["/api/admin/providers"], enabled: !!isAdmin });
  const { data: callLogs } = useQuery<CallLog[]>({ queryKey: ["/api/admin/call-logs"], enabled: !!isAdmin });
  const { data: allCredits } = useQuery<any[]>({ queryKey: ["/api/admin/all-credits"], enabled: !!isAdmin });
  const { data: duplicateData, isLoading: duplicatesLoading, refetch: refetchDuplicates } = useQuery<any[]>({
    queryKey: ["/api/admin/duplicate-profiles"],
    enabled: !!isAdmin,
    staleTime: 0,
  });
  const { data: promoCodesData } = useQuery<PromoCode[]>({ queryKey: ["/api/admin/promo-codes"], enabled: !!isAdmin });

  // Last-10 completed Google Places bulk-fetch runs (audit + replay).
  // Server records counts only — no places — so this is safe to keep loaded.
  const { data: gpRuns } = useQuery<Array<{
    id: number; city: string; service: string; target: number;
    uniqueCount: number; dupSkipped: number; apiCalls: number;
    durationMs: number; startedAt: string; finishedAt: string;
    cancelled: boolean; error: string | null; stoppedBy: string | null;
  }>>({
    queryKey: ["/api/admin/google-places-runs"],
    enabled: !!isAdmin,
  });

  const { data: aboutContent } = useQuery({
    queryKey: ["/api/content", "about"],
    queryFn: async () => { const res = await fetch("/api/content/about"); if (!res.ok) return null; return res.json(); },
    enabled: !!isAdmin,
    staleTime: 0,
  });
  const { data: termsContent } = useQuery({
    queryKey: ["/api/content", "terms"],
    queryFn: async () => { const res = await fetch("/api/content/terms"); if (!res.ok) return null; return res.json(); },
    enabled: !!isAdmin,
    staleTime: 0,
  });
  const { data: recruitmentContent } = useQuery({
    queryKey: ["/api/content", "recruitment_link"],
    queryFn: async () => { const res = await fetch("/api/content/recruitment_link"); if (!res.ok) return null; return res.json(); },
    enabled: !!isAdmin,
    staleTime: 0,
  });
  const { data: contactEmailsContent } = useQuery({
    queryKey: ["/api/content", "contact_emails"],
    queryFn: async () => { const res = await fetch("/api/content/contact_emails"); if (!res.ok) return null; return res.json(); },
    enabled: !!isAdmin,
    staleTime: 0,
  });

  useEffect(() => { if (aboutContent) { setAboutForm(aboutContent); } }, [aboutContent]);
  useEffect(() => { if (termsContent) { setTermsForm(termsContent); } }, [termsContent]);
  useEffect(() => { if (recruitmentContent) { setRecruitmentLink(recruitmentContent); } }, [recruitmentContent]);
  useEffect(() => {
    if (Array.isArray(contactEmailsContent) && contactEmailsContent.length > 0) {
      setContactEmails(
        contactEmailsContent
          .filter((x: any) => x && typeof x.email === "string")
          .slice(0, 5)
          .map((x: any) => ({ label: String(x.label || ""), email: String(x.email) })),
      );
    }
  }, [contactEmailsContent]);

  // Note: paginated fetch loop lives inside `handleGooglePlacesSearch`
  // (Task #67). Cancellation is signalled via `gpCancelRef`.

  const { data: visitorData } = useQuery<{ total: number; today: number; last7Days: { date: string; count: number }[] }>({
    queryKey: ["/api/visitor/stats"],
    enabled: !!isAdmin,
  });

  const { data: coAdminsList = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/co-admins"],
    enabled: !!isAdmin,
  });

  const { data: coAdminStats, isLoading: coAdminStatsLoading } = useQuery<any>({
    queryKey: ["/api/admin/co-admins", selectedCoAdminId, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/co-admins/${selectedCoAdminId}/stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedCoAdminId && !!isAdmin,
    staleTime: 0,
  });

  const { data: salaryHistory = [], refetch: refetchSalaryHistory } = useQuery<any[]>({
    queryKey: ["/api/admin/co-admins", selectedCoAdminId, "salary-history"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/co-admins/${selectedCoAdminId}/salary-history`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCoAdminId && !!isAdmin && showSalaryHistory,
    staleTime: 0,
  });

  const { data: verifiedProvidersList = [], isLoading: verifiedListLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/co-admins", selectedCoAdminId, "verified-providers", verifiedListStatus],
    queryFn: async () => {
      const res = await fetch(`/api/admin/co-admins/${selectedCoAdminId}/verified-providers?status=${verifiedListStatus}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCoAdminId && !!isAdmin && !!verifiedListStatus,
    staleTime: 0,
  });

  const searchStatsQuery = useQuery<{ query: string; count: number; lastSearched: string | null }[]>({
    queryKey: ["/api/admin/search-stats"],
    enabled: !!isAdmin,
    staleTime: 0,
  });
  const [searchSort, setSearchSort] = useState<"count" | "az" | "za" | "newest" | "oldest">("count");

  const { data: gcsStatus } = useQuery<{ configured: boolean; bucket: string | null }>({
    queryKey: ["/api/admin/backup/gcs-status"],
    enabled: !!isAdmin,
    staleTime: 60 * 1000,
  });

  type SystemHealthService = { ok: boolean; label: string; missing: string[] };
  type SystemHealthResponse = {
    nodeEnv: string;
    cashfreeMode: string;
    services: Record<string, SystemHealthService>;
  };
  const { data: systemHealth, isLoading: systemHealthLoading, refetch: refetchSystemHealth } = useQuery<SystemHealthResponse>({
    queryKey: ["/api/admin/system-health"],
    enabled: !!isAdmin && activeTab === "system",
    staleTime: 30 * 1000,
  });

  const { data: alertStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/admin/backup/alert-status"],
    enabled: !!isAdmin,
    staleTime: 60 * 1000,
  });

  const { data: testAlertHistory } = useQuery<{ entries: Array<{ at: string; sent: boolean; message: string; triggeredBy?: string }> }>({
    queryKey: ["/api/admin/backup/test-alert-history"],
    enabled: !!isAdmin,
    staleTime: 30 * 1000,
  });

  const gcsListQuery = useQuery<{ files: Array<{ name: string; size: number; updated: string }> }>({
    queryKey: ["/api/admin/backup/gcs-list"],
    enabled: !!isAdmin && activeTab === "backup" && restoreMode === "gcs" && gcsStatus?.configured === true,
    staleTime: 30 * 1000,
  });

  const gcsUploadMutation = useMutation({
    mutationFn: async (mode: "overwrite" | "new") => {
      const res = await apiRequest("POST", "/api/admin/backup/gcs-upload", { mode });
      return res.json();
    },
    onSuccess: (data: any) => {
      setGcsUploadResult({ gcsName: data.gcsName, url: data.url, size: data.size });
      const warnings: string[] = Array.isArray(data?.warnings) ? data.warnings : [];
      if (warnings.length > 0) {
        toast({
          title: `⚠️ Uploaded, but ${warnings.length} table(s) shrank`,
          description: warnings.slice(0, 3).join(" • ") + (warnings.length > 3 ? ` • +${warnings.length - 3} more` : ""),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Google Cloud Upload Complete",
          description: `Saved as ${data.gcsName} (${formatBytes(data.size)})`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Cloud upload failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const { data: adminJobs = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/jobs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!isAdmin && activeTab === "jobs",
  });

  const updateAdminJob = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/admin/jobs/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] }); setEditJobId(null); toast({ title: "Job updated!" }); },
    onError: (e: any) => toast({ title: e.message || "Failed", variant: "destructive" }),
  });
  const createCoAdmin = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/co-admins", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/co-admins"] }); setNewCoAdminUser(""); setNewCoAdminPass(""); toast({ title: "Co-admin created!" }); },
    onError: (e: any) => toast({ title: e.message || "Failed", variant: "destructive" }),
  });
  const deleteCoAdmin = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/co-admins/${id}`, undefined),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/co-admins"] }); toast({ title: "Co-admin deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });
  const changeCoAdminPwd = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => apiRequest("PATCH", `/api/admin/co-admins/${id}/password`, { password }),
    onSuccess: () => { setChangePwdId(null); setChangePwdVal(""); toast({ title: "Password updated!" }); },
    onError: () => toast({ title: "Password update failed", variant: "destructive" }),
  });

  const filteredProviders = useMemo(() => {
    if (!providersList || !allCredits) return providersList ?? [];
    let list = providersList.map((p) => {
      const cr = allCredits.find((x) => x.userId === p.userId && x.role === "user");
      return { ...p, _credit: cr };
    });
    const q = provSearch.toLowerCase();
    if (q) list = list.filter((p) => (p.name || "").toLowerCase().includes(q) || (p.mobile || "").includes(q) || (p.providerData?.serviceName || "").toLowerCase().includes(q));
    if (provFilter === "blocked") list = list.filter((p) => p.isBlocked);
    else if (provFilter === "frozen") list = list.filter((p) => p._credit?.creditsFrozen);
    else if (provFilter === "suspicious") list = list.filter((p) => (p._credit?.purchasedCredits ?? 0) > 500);
    else if (provFilter === "active") list = list.filter((p) => !p.isBlocked);
    else if (provFilter === "no_mobile") list = list.filter((p) => !p.providerData?.mobileNumbers?.length);
    else if (provFilter === "recent_no_mobile") list = list.filter((p) => recentNoMobileIds.has(p.userId) && !p.providerData?.mobileNumbers?.length);
    const normalizeAddedBy = (value: any) => {
      const v = String(value || "self").toLowerCase();
      if (v === "bulk-import" || v === "meta" || v === "self" || v === "mainadmin") return v;
      if (v === "coadmin" || v === "co-admin" || v === "co admin") return "coadmin";
      return v;
    };
    const normalizeApprovedBy = (value: any) => {
      const v = String(value || "none").toLowerCase();
      if (v === "admin" || v === "mainadmin") return "admin";
      if (v === "coadmin" || v === "co-admin" || v === "co admin") return "coadmin";
      if (v === "none" || v === "null" || v === "") return "none";
      return v;
    };
    if (provAddedByFilter !== "all") list = list.filter((p) => normalizeAddedBy(p.providerData?.addedBy) === provAddedByFilter);
    if (provApprovedByFilter !== "all") list = list.filter((p) => normalizeApprovedBy(p.providerData?.approvedBy) === provApprovedByFilter);
    if (provSort === "name_asc") list = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    else if (provSort === "name_desc") list = [...list].sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    else if (provSort === "credits_high") list = [...list].sort((a, b) => ((b._credit?.freeCredits ?? 0) + (b._credit?.purchasedCredits ?? 0)) - ((a._credit?.freeCredits ?? 0) + (a._credit?.purchasedCredits ?? 0)));
    else if (provSort === "credits_low") list = [...list].sort((a, b) => ((a._credit?.freeCredits ?? 0) + (a._credit?.purchasedCredits ?? 0)) - ((b._credit?.freeCredits ?? 0) + (b._credit?.purchasedCredits ?? 0)));
    else if (provSort === "newest") list = [...list].sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    else if (provSort === "oldest") list = [...list].sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
    return list;
  }, [providersList, allCredits, provSearch, provFilter, provAddedByFilter, provApprovedByFilter, provSort, recentNoMobileIds]);

  const noMobileCount = useMemo(
    () => (providersList ?? []).filter((p: any) => !p.providerData?.mobileNumbers?.length).length,
    [providersList],
  );

  const saveAbout = useMutation({
    mutationFn: async () => await apiRequest("PUT", "/api/admin/content/about", { value: aboutForm }).then(r => r.json()),
    onSuccess: () => { 
      toast({ title: "✅ About Us saved!" }); 
      queryClient.invalidateQueries({ queryKey: ["/api/content", "about"] });
      queryClient.refetchQueries({ queryKey: ["/api/content", "about"] });
    },
    onError: (err: any) => toast({ title: `❌ ${err.message || "Failed to save"}`, variant: "destructive" }),
  });
  const saveTerms = useMutation({
    mutationFn: async () => await apiRequest("PUT", "/api/admin/content/terms", { value: termsForm }).then(r => r.json()),
    onSuccess: () => { 
      toast({ title: "✅ Terms & Conditions saved!" }); 
      queryClient.invalidateQueries({ queryKey: ["/api/content", "terms"] });
      queryClient.refetchQueries({ queryKey: ["/api/content", "terms"] });
    },
    onError: (err: any) => toast({ title: `❌ ${err.message || "Failed to save"}`, variant: "destructive" }),
  });
  const saveRecruitment = useMutation({
    mutationFn: async () => await apiRequest("PUT", "/api/admin/content/recruitment_link", { value: recruitmentLink }).then(r => r.json()),
    onSuccess: () => { 
      toast({ title: "✅ Recruitment link saved!" }); 
      queryClient.invalidateQueries({ queryKey: ["/api/content", "recruitment_link"] });
      queryClient.refetchQueries({ queryKey: ["/api/content", "recruitment_link"] });
    },
    onError: (err: any) => toast({ title: `❌ ${err.message || "Failed to save"}`, variant: "destructive" }),
  });
  const saveContactEmails = useMutation({
    mutationFn: async () => {
      const cleaned = contactEmails
        .map(e => ({ label: (e.label || "").trim(), email: (e.email || "").trim() }))
        .filter(e => e.email.length > 0);
      if (cleaned.length === 0) throw new Error("Kam se kam ek email zaroori hai");
      if (cleaned.length > 5) throw new Error("Max 5 emails allowed");
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const e of cleaned) {
        if (!emailRe.test(e.email)) throw new Error(`Invalid email: ${e.email}`);
      }
      return await apiRequest("PUT", "/api/admin/content/contact_emails", { value: cleaned }).then(r => r.json());
    },
    onSuccess: () => {
      toast({ title: "✅ Contact emails saved!" });
      queryClient.invalidateQueries({ queryKey: ["/api/content", "contact_emails"] });
      queryClient.refetchQueries({ queryKey: ["/api/content", "contact_emails"] });
    },
    onError: (err: any) => toast({ title: `❌ ${err.message || "Failed to save"}`, variant: "destructive" }),
  });
  const [aiThresholdInput, setAiThresholdInput] = useState<string>("");
  const { data: aiConfigData } = useQuery<{ threshold: number }>({
    queryKey: ["/api/admin/ai-config"],
    enabled: !!isAdmin,
  });
  useEffect(() => {
    if (aiConfigData?.threshold !== undefined && aiThresholdInput === "") {
      setAiThresholdInput(String(aiConfigData.threshold));
    }
  }, [aiConfigData]);
  const saveAiConfig = useMutation({
    mutationFn: async () => {
      const threshold = Number(aiThresholdInput);
      if (!Number.isFinite(threshold) || threshold < 1000 || threshold > 10_000_000) {
        throw new Error("Threshold 1,000 se 10,000,000 ke beech honi chahiye");
      }
      return await apiRequest("PUT", "/api/admin/ai-config", { threshold }).then(r => r.json());
    },
    onSuccess: (data) => {
      toast({ title: "✅ AI threshold saved!", description: `Naya threshold: ${Number(data.threshold).toLocaleString()} tokens/hr` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
    },
    onError: (err: any) => toast({ title: `❌ ${err.message || "Failed to save"}`, variant: "destructive" }),
  });

  const [weeklyReportEmail, setWeeklyReportEmail] = useState<string>("");
  const [weeklyReportEnabled, setWeeklyReportEnabled] = useState<boolean>(false);
  const [weeklyReportDay, setWeeklyReportDay] = useState<number>(1);
  const [weeklyReportHour, setWeeklyReportHour] = useState<number>(9);
  const { data: weeklyReportCfg } = useQuery<{ email: string; enabled: boolean; sendDay: number; sendHour: number }>({
    queryKey: ["/api/admin/ai-weekly-report-config"],
    enabled: !!isAdmin,
  });
  useEffect(() => {
    if (weeklyReportCfg) {
      setWeeklyReportEmail(weeklyReportCfg.email ?? "");
      setWeeklyReportEnabled(weeklyReportCfg.enabled ?? false);
      setWeeklyReportDay(weeklyReportCfg.sendDay ?? 1);
      setWeeklyReportHour(weeklyReportCfg.sendHour ?? 9);
    }
  }, [weeklyReportCfg]);
  const saveWeeklyReport = useMutation({
    mutationFn: async () => {
      if (weeklyReportEnabled && (!weeklyReportEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(weeklyReportEmail))) {
        throw new Error("Valid email address required");
      }
      return await apiRequest("PUT", "/api/admin/ai-weekly-report-config", { email: weeklyReportEmail, enabled: weeklyReportEnabled, sendDay: weeklyReportDay, sendHour: weeklyReportHour }).then(r => r.json());
    },
    onSuccess: () => {
      toast({ title: "✅ Weekly report settings saved!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-weekly-report-config"] });
    },
    onError: (err: any) => toast({ title: `❌ ${err.message || "Failed to save"}`, variant: "destructive" }),
  });
  const [reportLogLimit, setReportLogLimit] = useState<number>(20);
  const [reportLogStatus, setReportLogStatus] = useState<"all" | "sent" | "failed">("all");
  const [reportLogSince, setReportLogSince] = useState<"all" | "today" | "week" | "month">("all");

  const { data: aiReportLogData } = useQuery<{ id: number; sentAt: string; recipient: string; success: boolean; totalTokens: number; estimatedCost: string; peakTokens: number; exceededHours: number; errorMsg: string | null }[]>({
    queryKey: ["/api/admin/ai-report-log", reportLogLimit, reportLogStatus, reportLogSince],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(reportLogLimit) });
      if (reportLogStatus !== "all") params.set("status", reportLogStatus);
      if (reportLogSince !== "all") {
        const now = Date.now();
        const sinceMs = reportLogSince === "today"
          ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
          : reportLogSince === "week" ? now - 7 * 24 * 60 * 60 * 1000
          : now - 30 * 24 * 60 * 60 * 1000;
        params.set("since", new Date(sinceMs).toISOString());
      }
      const res = await fetch(`/api/admin/ai-report-log?${params}`, { credentials: "include" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.message || "Failed to fetch report log"); }
      return res.json();
    },
    enabled: !!isAdmin,
  });

  const sendReportNow = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/ai-weekly-report/send-now", {});
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to send");
      return data;
    },
    onSuccess: () => {
      toast({ title: "✅ Report email sent!", description: "Check your inbox." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-report-log"] });
    },
    onError: (err: any) => {
      toast({ title: `❌ ${err.message || "Failed to send"}`, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-report-log"] });
    },
  });

  const [clearLogConfirm, setClearLogConfirm] = useState(false);
  const [pruneLogConfirm, setPruneLogConfirm] = useState(false);
  const [deleteLogConfirmId, setDeleteLogConfirmId] = useState<number | null>(null);

  type ReportLogEntry = { id: number; sentAt: string; recipient: string; success: boolean; totalTokens: number; estimatedCost: string; peakTokens: number; exceededHours: number; errorMsg: string | null };

  const [pendingClearedLogEntries, setPendingClearedLogEntries] = useState<ReportLogEntry[]>([]);
  const [pendingPrunedLogEntries, setPendingPrunedLogEntries] = useState<ReportLogEntry[]>([]);

  const restoreReportLogEntry = useMutation({
    mutationFn: async (entry: ReportLogEntry) => {
      const res = await apiRequest("POST", "/api/admin/ai-report-log/restore", entry);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to restore");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-report-log"] });
      toast({ title: "↩ Entry restored." });
    },
    onError: (err: any) => toast({ title: `❌ ${err.message || "Failed to restore"}`, variant: "destructive" }),
  });

  const deleteReportLogEntry = useMutation({
    mutationFn: async (entry: ReportLogEntry) => {
      const res = await apiRequest("DELETE", `/api/admin/ai-report-log/${entry.id}`, {});
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to delete");
      return data;
    },
    onSuccess: (_, deletedEntry) => {
      setDeleteLogConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-report-log"] });
      toast({
        title: "Entry deleted",
        description: "Tap Undo within 5 seconds to restore it.",
        duration: 5000,
        action: (
          <ToastAction
            altText="Undo delete"
            data-testid="button-undo-delete-log"
            disabled={restoreReportLogEntry.isPending}
            onClick={() => {
              if (!restoreReportLogEntry.isPending) {
                restoreReportLogEntry.mutate(deletedEntry);
              }
            }}
          >
            {restoreReportLogEntry.isPending ? "…" : "Undo"}
          </ToastAction>
        ),
      });
    },
    onError: (err: any) => {
      toast({ title: `❌ ${err.message || "Failed to delete"}`, variant: "destructive" });
      setDeleteLogConfirmId(null);
    },
  });

  const restoreBulkReportLog = useMutation({
    mutationFn: async (entries: ReportLogEntry[]) => {
      const res = await apiRequest("POST", "/api/admin/ai-report-log/restore-bulk", { entries });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to restore");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-report-log"] });
      const { restored = 0, skipped = 0 } = data;
      toast({
        title: "↩ History restored.",
        description: skipped > 0 ? `${restored} restored, ${skipped} skipped.` : `${restored} entr${restored === 1 ? "y" : "ies"} restored.`,
      });
    },
    onError: (err: any) => toast({ title: `❌ ${err.message || "Failed to restore"}`, variant: "destructive" }),
  });

  const clearReportLog = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/admin/ai-report-log", {});
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to clear");
      return data;
    },
    onSuccess: (data) => {
      setClearLogConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-report-log"] });
      const cleared: ReportLogEntry[] = data.cleared ?? [];
      setPendingClearedLogEntries(cleared);
      if (cleared.length > 0) {
        setTimeout(() => setPendingClearedLogEntries([]), 5000);
      }
      toast({
        title: "✅ Report history cleared.",
        description: cleared.length > 0 ? "Tap Undo within 5 seconds to restore all entries." : undefined,
        duration: 5000,
        action: cleared.length > 0 ? (
          <ToastAction
            altText="Undo clear history"
            data-testid="button-undo-clear-report-log"
            disabled={restoreBulkReportLog.isPending}
            onClick={() => {
              if (!restoreBulkReportLog.isPending && pendingClearedLogEntries.length > 0) {
                restoreBulkReportLog.mutate(pendingClearedLogEntries);
                setPendingClearedLogEntries([]);
              }
            }}
          >
            {restoreBulkReportLog.isPending ? "…" : "Undo"}
          </ToastAction>
        ) : undefined,
      });
    },
    onError: (err: any) => {
      toast({ title: `❌ ${err.message || "Failed to clear"}`, variant: "destructive" });
      setClearLogConfirm(false);
    },
  });

  const pruneReportLog = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/admin/ai-report-log/prune?days=90", {});
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to prune");
      return data;
    },
    onSuccess: (data) => {
      setPruneLogConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-report-log"] });
      const pruned: ReportLogEntry[] = data.pruned ?? [];
      setPendingPrunedLogEntries(pruned);
      if (pruned.length > 0) {
        setTimeout(() => setPendingPrunedLogEntries([]), 5000);
      }
      toast({
        title: pruned.length > 0 ? `✅ ${pruned.length} old entr${pruned.length === 1 ? "y" : "ies"} pruned.` : "✅ Nothing to prune.",
        description: pruned.length > 0 ? "Tap Undo within 5 seconds to restore." : undefined,
        duration: 5000,
        action: pruned.length > 0 ? (
          <ToastAction
            altText="Undo prune old logs"
            data-testid="button-undo-prune-report-log"
            disabled={restoreBulkReportLog.isPending}
            onClick={() => {
              if (!restoreBulkReportLog.isPending && pendingPrunedLogEntries.length > 0) {
                restoreBulkReportLog.mutate(pendingPrunedLogEntries);
                setPendingPrunedLogEntries([]);
              }
            }}
          >
            {restoreBulkReportLog.isPending ? "…" : "Undo"}
          </ToastAction>
        ) : undefined,
      });
    },
    onError: (err: any) => {
      toast({ title: `❌ ${err.message || "Failed to prune"}`, variant: "destructive" });
      setPruneLogConfirm(false);
    },
  });

  const freezeCredits = useMutation({
    mutationFn: async ({ userId, role, freeze }: { userId: string; role: string; freeze: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/freeze-credits/${userId}/${role}`, { freeze }); return res.json();
    },
    onSuccess: (_, vars) => { toast({ title: vars.freeze ? "Credits frozen" : "Credits unfrozen" }); queryClient.invalidateQueries({ queryKey: ["/api/admin/all-credits"] }); },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });
  const resetCredits = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("POST", `/api/admin/reset-credits/${userId}/${role}`, {}); return res.json();
    },
    onSuccess: () => { toast({ title: "Credits reset to 0" }); queryClient.invalidateQueries({ queryKey: ["/api/admin/all-credits"] }); },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => { const res = await apiRequest("DELETE", `/api/admin/users/${userId}`); return res.json(); },
    onSuccess: () => {
      toast({ title: "User deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
  });
  const giftCredits = useMutation({
    mutationFn: async ({ userId, amount }: { userId: string; amount: number }) => {
      const res = await apiRequest("POST", `/api/admin/gift-credits/${userId}`, { amount });
      return res.json();
    },
    onSuccess: (data, vars) => {
      toast({ title: `🎁 ${vars.amount} credits gifted!`, description: "User ke purchased credits mein add ho gaye." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
    },
    onError: (e: any) => { toast({ title: e.message || "Gift failed", variant: "destructive" }); },
  });

  const togglePromo = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/admin/promo-codes/${id}/toggle`); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] }); },
  });
  const deletePromo = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("DELETE", `/api/admin/promo-codes/${id}`); return res.json(); },
    onSuccess: () => { toast({ title: "Promo code deleted" }); queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] }); },
    onError: () => { toast({ title: "Failed to delete", variant: "destructive" }); },
  });
  const createPromo = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/admin/promo-codes", { code: newPromoCode, creditAmount: parseInt(newPromoCredits) || 25 }); return res.json(); },
    onSuccess: () => { toast({ title: "Promo code created" }); setNewPromoCode(""); setNewPromoCredits("25"); queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] }); },
    onError: (e: any) => { toast({ title: e.message || "Failed to create", variant: "destructive" }); },
  });

  const updatePromo = useMutation({
    mutationFn: async ({ id, code, creditAmount }: { id: number; code: string; creditAmount: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/promo-codes/${id}`, { code, creditAmount: parseInt(creditAmount) || 25 });
      return res.json();
    },
    onSuccess: () => { toast({ title: "Promo code updated" }); setEditPromoId(null); queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] }); },
    onError: (e: any) => { toast({ title: e.message || "Failed", variant: "destructive" }); },
  });
  const updateProviderProfile = useMutation({
    mutationFn: async () => {
      if (!editProvider.profile) return;
      await apiRequest("PUT", `/api/admin/profiles/${editProvider.profile.id}`, { name: editName, mobile: editMobile || null, isHidden: editHidden });
      if (editProvider.providerData) {
        await apiRequest("PUT", `/api/admin/providers/${editProvider.profile.userId}`, {
          serviceName: editServiceName, description: editDescription || null,
          hashtags: editHashtags.split(",").map((h: string) => h.trim()).filter(Boolean),
          approxCharge: editApproxCharge || null,
          mobileNumbers: editMobileNumbers.split(",").map((m: string) => m.trim()).filter(Boolean),
          radiusKm: parseInt(editRadiusKm) || 10, address: editAddress || null,
          isHidden: editHidden,
        });
      }
    },
    onSuccess: () => { toast({ title: "Provider updated" }); setEditProvider({ open: false, profile: null, providerData: null }); queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] }); },
    onError: () => { toast({ title: "Update failed", variant: "destructive" }); },
  });

  const openEditProvider = (p: any, focusMobile = false) => {
    setEditName(p.name); setEditMobile(p.mobile || ""); setEditServiceName(p.providerData?.serviceName || "");
    setEditDescription(p.providerData?.description || ""); setEditHashtags(p.providerData?.hashtags?.join(", ") || "");
    setEditApproxCharge(p.providerData?.approxCharge || ""); setEditMobileNumbers(p.providerData?.mobileNumbers?.join(", ") || "");
    setEditRadiusKm(String(p.providerData?.radiusKm || 10)); setEditAddress(p.providerData?.address || "");
    setEditHidden(p.providerData?.isHidden || false);
    setFocusMobileOnOpen(focusMobile);
    setEditProvider({ open: true, profile: p, providerData: p.providerData });
  };

  useEffect(() => {
    if (editProvider.open && focusMobileOnOpen && mobileNumbersInputRef.current) {
      const timer = setTimeout(() => {
        mobileNumbersInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        mobileNumbersInputRef.current?.focus();
        setFocusMobileOnOpen(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [editProvider.open, focusMobileOnOpen]);
  const handleExport = (type: string) => { window.open(`/api/admin/export/${type}`, "_blank"); };
  const handleLogout = async () => { await apiRequest("POST", "/api/admin/logout"); setLocation("/"); };

  const handleFileChange = async (e: { target: HTMLInputElement }) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportResult(null);
    try {
      const { read, utils } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = utils.sheet_to_json(ws, { header: 1 });
      if (rows.length > 0) {
        const headers = rows[0].map((h: any) => String(h || "")).filter(Boolean);
        setImportPreview(headers);
        const nameGuess = headers.find((h: string) => h.toLowerCase().includes("name")) || headers[1] || "";
        const mobileGuess = headers.find((h: string) => h.toLowerCase().includes("mobile") || h.toLowerCase().includes("phone") || h.toLowerCase().includes("number")) || headers[4] || "";
        setImportNameCol(nameGuess);
        setImportMobileCol(mobileGuess);
      }
    } catch {
      setImportPreview([]);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("nameCol", importNameCol);
      formData.append("mobileCol", importMobileCol);
      formData.append("allowDuplicate", String(importAllowDuplicate));
      const res = await fetch("/api/admin/bulk-import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      setImportResult(data);
      toast({ title: `Import complete! ${data.imported.toLocaleString("en-IN")} records imported.` });
    } catch (err: any) {
      toast({ title: err.message || "Import failed", variant: "destructive" });
    } finally {
      setImportLoading(false);
    }
  };

  const handleMetaFileChange = async (e: { target: HTMLInputElement }) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMetaFile(file);
    setMetaResult(null);
    try {
      const { read, utils } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = utils.sheet_to_json(ws, { header: 1 });
      if (rows.length > 0) {
        const headers = rows[0].map((h: any) => String(h || "")).filter(Boolean);
        setMetaPreview(headers);
        const nameGuess = headers.find((h: string) => h.toLowerCase().includes("name") || h.toLowerCase().includes("naam")) || headers[0] || "";
        const mobileGuess = headers.find((h: string) => h.toLowerCase().includes("mobile") || h.toLowerCase().includes("phone") || h.toLowerCase().includes("number")) || headers[3] || "";
        const serviceGuess = headers.find((h: string) => h.toLowerCase().includes("work") || h.toLowerCase().includes("service") || h.toLowerCase().includes("kaam") || h.toLowerCase().includes("profession")) || "";
        const addressGuess = headers.find((h: string) => h.toLowerCase().includes("address") || h.toLowerCase().includes("area") || h.toLowerCase().includes("city") || h.toLowerCase().includes("location")) || "";
        setMetaNameCol(nameGuess);
        setMetaMobileCol(mobileGuess);
        setMetaServiceCol(serviceGuess);
        setMetaAddressCol(addressGuess);
      }
    } catch {
      setMetaPreview([]);
    }
  };

  // Paginated fetch (Task #67). Loops over Google Places `searchText` with
  // server endpoint once (which itself merges ~40 results). Auto-selects each
  // newly-seen place that has a phone (additive only — won't re-tick a
  // place the admin manually unticked). Cancellation via `gpCancelRef`.
  const handleGooglePlacesSearch = async () => {
    if (!gpCity.trim() || !gpService.trim()) {
      toast({ title: "City aur Service / Work dono fill karein", variant: "destructive" });
      return;
    }
    if (gpSearching) {
      toast({ title: "Pehle wala fetch chal raha hai — pehle Stop karein", variant: "destructive" });
      return;
    }
    setGpSearching(true);
    setGpResults([]);
    setGpSelected(new Set());
    setGpImportResult(null);
    setGpDisplayLimit(200);
    gpAutoSeenRef.current = new Set();
    gpCancelRef.current = false;
    setGpCancelRequested(false);
    setGpNextPageToken(null);
    gpSeenIdsRef.current = new Set();

    const target = GP_PAGE_SIZE;
    const startedAt = Date.now();
    setGpProgress({ target, fetched: 0, unique: 0, duplicates: 0, apiCalls: 0, done: false, cancelled: false, startedAt });

    const seen = gpSeenIdsRef.current;
    const accumulated: typeof gpResults = [];
    let pageToken: string | undefined;
    let fetched = 0, unique = 0, duplicates = 0, apiCalls = 0;
    let errorMsg: string | undefined;

    try {
      while (true) {
        if (gpCancelRef.current) break;
        if (unique >= target) break;
        // `apiRequest` already throws on non-2xx, so no need to re-check res.ok here.
        const res = await apiRequest("POST", "/api/admin/google-places-search", {
          city: gpCity.trim(),
          service: gpService.trim(),
          pageToken,
        });
        const data = await res.json();
        apiCalls++;
        if (typeof data.runsToday === "number") {
          setGpRateInfo({ runsToday: data.runsToday, max: data.max });
        }
        const places: any[] = data.places || [];
        const freshAutoSelect: string[] = [];
        let appendedThisPage = false;
        for (const p of places) {
          fetched++;
          if (!p.placeId) continue;
          if (seen.has(p.placeId)) { duplicates++; continue; }
          if (unique >= target) break;
          seen.add(p.placeId);
          accumulated.push(p);
          unique++;
          appendedThisPage = true;
          if (!gpAutoSeenRef.current.has(p.placeId)) {
            gpAutoSeenRef.current.add(p.placeId);
            if (p.phone) freshAutoSelect.push(p.placeId);
          }
        }
        if (appendedThisPage) {
          setGpResults([...accumulated]);
          if (freshAutoSelect.length > 0) {
            setGpSelected(prev => {
              const next = new Set(prev);
              for (const id of freshAutoSelect) next.add(id);
              return next;
            });
          }
        }
        setGpProgress({ target, fetched, unique, duplicates, apiCalls, done: false, cancelled: false, startedAt });

        pageToken = data.nextPageToken || undefined;
        if (!pageToken) break;
        if (unique >= target) break;
        // Google's nextPageToken needs ~2s warm-up before it becomes valid.
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err: any) {
      errorMsg = err?.message || "Fetch failed";
    }

    const cancelled = gpCancelRef.current;
    const finishedAt = Date.now();
    setGpProgress({ target, fetched, unique, duplicates, apiCalls, done: true, cancelled, error: errorMsg, startedAt, finishedAt });
    setGpSearching(false);

    // Persist completed run for audit/replay (counts only — no places).
    // Fire-and-forget; UI must not block on this. We invalidate the history
    // query on success so the panel reflects the new row immediately.
    apiRequest("POST", "/api/admin/google-places-runs", {
      city: gpCity.trim(),
      service: gpService.trim(),
      target,
      uniqueCount: unique,
      dupSkipped: duplicates,
      apiCalls,
      durationMs: finishedAt - startedAt,
      startedAt,
      finishedAt,
      cancelled,
      error: errorMsg ?? null,
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/google-places-runs"] });
    }).catch(() => { /* non-fatal — history is best-effort */ });
    // Save the continuation token (if Google still has more pages) so the
    // admin can press "Add 20 More" later without re-running the whole fetch.
    setGpNextPageToken(pageToken || null);
    const elapsed = Math.round((finishedAt - startedAt) / 1000);
    if (errorMsg) {
      toast({
        title: `Fetch failed (${unique} mile partial)`,
        description: `${errorMsg}${unique > 0 ? " — partial results import kar sakte hain" : ""}`,
        variant: "destructive",
      });
    } else {
      toast({
        title: cancelled
          ? `Stopped — ${unique} unique businesses mile`
          : `Done! ${unique} unique businesses mile (${elapsed}s)`,
        description: `${apiCalls} API calls • ${duplicates} duplicates skip kiye`,
      });
    }
  };

  // Append the next Google page (~20 more businesses) to the existing
  // results without resetting the list, selection, or progress card.
  const handleGoogleAddMore = async () => {
    if (gpFetchingMore || gpSearching) return;
    if (!gpCity.trim() || !gpService.trim()) return;
    setGpFetchingMore(true);
    try {
      const res = await apiRequest("POST", "/api/admin/google-places-search", {
        city: gpCity.trim(),
        service: gpService.trim(),
        pageToken: gpNextPageToken || undefined,
      });
      const data = await res.json();
      if (typeof data.runsToday === "number") {
        setGpRateInfo({ runsToday: data.runsToday, max: data.max });
      }
      const places: any[] = data.places || [];
      const fresh: typeof gpResults = [];
      const freshAutoSelect: string[] = [];
      let dup = 0;
      for (const p of places) {
        if (!p.placeId) continue;
        if (gpSeenIdsRef.current.has(p.placeId)) { dup++; continue; }
        gpSeenIdsRef.current.add(p.placeId);
        fresh.push(p);
        if (!gpAutoSeenRef.current.has(p.placeId)) {
          gpAutoSeenRef.current.add(p.placeId);
          if (p.phone) freshAutoSelect.push(p.placeId);
        }
      }
      if (fresh.length > 0) {
        setGpResults(prev => [...prev, ...fresh]);
        if (freshAutoSelect.length > 0) {
          setGpSelected(prev => {
            const next = new Set(prev);
            for (const id of freshAutoSelect) next.add(id);
            return next;
          });
        }
      }
      // Update progress counters so the summary card stays accurate.
      setGpProgress(prev => prev ? {
        ...prev,
        fetched: prev.fetched + places.length,
        unique: prev.unique + fresh.length,
        duplicates: prev.duplicates + dup,
        apiCalls: prev.apiCalls + 1,
        target: Math.max(prev.target, prev.unique + fresh.length),
        finishedAt: Date.now(),
      } : prev);
      setGpNextPageToken(data.nextPageToken || null);
      toast({
        title: fresh.length > 0
          ? `+${fresh.length} aur businesses add ho gaye`
          : "Koi naya business nahi mila (sab duplicate the)",
        description: data.nextPageToken ? "Aur ke liye dobara dabayein" : "Google ke paas aur results nahi hain",
      });
    } catch (err: any) {
      toast({ title: err?.message || "Add More failed", variant: "destructive" });
    } finally {
      setGpFetchingMore(false);
    }
  };

  const handleGooglePlacesCancel = () => {
    if (!gpSearching) return;
    gpCancelRef.current = true;
    setGpCancelRequested(true);
    toast({ title: "Stop request — current page khatam hone ka wait karein" });
  };

  const handleGooglePlacesImport = async () => {
    if (gpSelected.size === 0) {
      toast({ title: "Pehle businesses select karein", variant: "destructive" });
      return;
    }
    if (!gpAssignTo || gpAssignTo === "_default") {
      toast({ title: "Co-admin select karein", variant: "destructive" });
      return;
    }
    setGpImporting(true);
    setGpImportResult(null);
    try {
      const selectedPlaces = gpResults.filter(p => gpSelected.has(p.placeId));
      const res = await apiRequest("POST", "/api/admin/google-places-import", {
        places: selectedPlaces,
        assignTo: gpAssignTo,
        serviceName: gpService.trim(),
        allowDuplicate: gpAllowDuplicate,
        autoApprove: gpAutoApprove,
      });
      const data = await res.json();
      setGpImportResult(data);
      const liveMsg = gpAutoApprove && data.approved > 0 ? ` — ${data.approved} live ho gaye!` : "";
      toast({ title: `Import complete! ${data.imported} businesses added${liveMsg}` });
    } catch (err: any) {
      toast({ title: err.message || "Import failed", variant: "destructive" });
    } finally {
      setGpImporting(false);
    }
  };

  const toggleGpPlace = (placeId: string) => {
    setGpSelected(prev => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  const handleMetaImport = async () => {
    if (!metaFile) return;
    if (!metaAssignTo || metaAssignTo === "_default") {
      toast({ title: "Co-admin select karo pehle", variant: "destructive" });
      return;
    }
    setMetaLoading(true);
    setMetaResult(null);
    try {
      const formData = new FormData();
      formData.append("file", metaFile);
      formData.append("nameCol", metaNameCol);
      formData.append("mobileCol", metaMobileCol);
      formData.append("serviceCol", metaServiceCol);
      formData.append("addressCol", metaAddressCol);
      formData.append("descriptionCol", metaDescriptionCol);
      formData.append("assignTo", metaAssignTo);
      formData.append("allowDuplicate", String(metaAllowDuplicate));
      const res = await fetch("/api/admin/meta-import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Meta import failed");
      setMetaResult(data);
      toast({ title: `Meta import complete! ${data.imported.toLocaleString("en-IN")} leads imported.` });
    } catch (err: any) {
      toast({ title: err.message || "Meta import failed", variant: "destructive" });
    } finally {
      setMetaLoading(false);
    }
  };

  const handleBulkDeleteDuplicates = async () => {
    if (selectedDeleteIds.size === 0) return;
    if (!confirm(`Kya aap ${selectedDeleteIds.size} profiles delete karna chahte hain? Yeh action reverse nahi ho sakta.`)) return;
    setDeletingDuplicates(true);
    try {
      const res = await apiRequest("DELETE", "/api/admin/bulk-delete-profiles", { userIds: Array.from(selectedDeleteIds) });
      const data = await res.json();
      toast({ title: `✅ ${data.deleted} profiles delete ho gaye!` });
      setSelectedDeleteIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/duplicate-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      refetchDuplicates();
    } catch (err: any) {
      toast({ title: err.message || "Delete failed", variant: "destructive" });
    } finally {
      setDeletingDuplicates(false);
    }
  };

  const handleDeleteAllDuplicates = async () => {
    const groups = duplicateData || [];
    const idsToDelete: string[] = [];
    for (const g of groups) {
      // Skip first profile (idx 0 = best, "sabse zyada details") and delete the rest
      g.profiles.slice(1).forEach((p: any) => idsToDelete.push(p.userId));
    }
    if (idsToDelete.length === 0) {
      toast({ title: "Koi duplicate delete karne ke liye nahi hai" });
      return;
    }
    if (!confirm(`⚠️ Sabhi ${idsToDelete.length} duplicate profiles delete honge.\n\nHar mobile par sirf "Sabse zyada details" wala (★) profile bachega.\n\nYeh action reverse nahi ho sakta. Continue?`)) return;
    setDeletingDuplicates(true);
    try {
      const res = await apiRequest("DELETE", "/api/admin/bulk-delete-profiles", { userIds: idsToDelete });
      const data = await res.json();
      toast({ title: `✅ ${data.deleted} duplicate profiles delete ho gaye!` });
      setSelectedDeleteIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/duplicate-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      refetchDuplicates();
    } catch (err: any) {
      toast({ title: err.message || "Delete failed", variant: "destructive" });
    } finally {
      setDeletingDuplicates(false);
    }
  };

  const handleAllBulkApprove = async () => {
    setBulkPreflightLoading(true);
    setBulkPreflightData(null);
    try {
      const res = await apiRequest("GET", "/api/admin/approve-all-bulk/preflight");
      const data = await res.json();
      setBulkPreflightData(data);
      setBulkApproveConfirmOpen(true);
    } catch (err: any) {
      toast({ title: err.message || "Preflight check failed", variant: "destructive" });
    } finally {
      setBulkPreflightLoading(false);
    }
  };

  const proceedBulkApprove = async () => {
    setBulkApproveConfirmOpen(false);
    setMetaBulkApproving(true);
    setMetaBulkResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/approve-all-bulk");
      const data = await res.json();
      const ids: string[] = data.noMobileApprovedUserIds ?? [];
      setMetaBulkResult({ approved: data.approved, total: data.total, noMobileApproved: data.noMobileApproved ?? 0, noMobileApprovedIds: ids, errors: data.errors });
      setRecentNoMobileIds(new Set(ids));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      toast({ title: `✅ ${data.approved} leads live hue (Meta: ${data.metaApproved}, Google: ${data.googleApproved})` });
    } catch (err: any) {
      toast({ title: err.message || "Bulk approve failed", variant: "destructive" });
    } finally {
      setMetaBulkApproving(false);
    }
  };

  if (isAdminLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="sticky top-0 z-[60] flex items-center justify-between gap-2 px-4 py-3 border-b bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur">
        <Button
          variant="outline"
          onClick={() => setLocation("/customer/home")}
          data-testid="button-switch-to-user"
        >
          Switch to User
        </Button>
      </div>

      {/* Edit Provider Modal */}
      {editProvider.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="modal-edit-provider">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditProvider({ open: false, profile: null, providerData: null })} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 z-10">
              <h3 className="font-semibold text-lg">Edit Provider</h3>
              <Button variant="ghost" size="icon" onClick={() => setEditProvider({ open: false, profile: null, providerData: null })} data-testid="button-close-edit-provider"><X className="w-4 h-4" /></Button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-2"><Label>Name</Label><Input value={editName} onChange={e => setEditName(e.target.value)} data-testid="input-edit-provider-name" /></div>
              <div className="space-y-2"><Label>Mobile</Label><Input value={editMobile} onChange={e => setEditMobile(e.target.value)} data-testid="input-edit-provider-mobile" /></div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div>
                  <Label>Profile Visibility</Label>
                  <p className="text-xs text-muted-foreground">{editHidden ? "Hidden from public search" : "Visible in public search"}</p>
                </div>
                <Switch checked={editHidden} onCheckedChange={setEditHidden} data-testid="switch-edit-provider-hidden" />
              </div>
              <div className="space-y-2"><Label>Service Name</Label><Input value={editServiceName} onChange={e => setEditServiceName(e.target.value)} data-testid="input-edit-service-name" /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} data-testid="input-edit-description" /></div>
              <div className="space-y-2"><Label>Hashtags (comma separated)</Label><Input value={editHashtags} onChange={e => setEditHashtags(e.target.value)} placeholder="plumbing, repair, kitchen" data-testid="input-edit-hashtags" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Radius (KM)</Label><Input type="number" value={editRadiusKm} onChange={e => setEditRadiusKm(e.target.value)} data-testid="input-edit-radius" /></div>
                <div className="space-y-2"><Label>Approx Charge</Label><Input value={editApproxCharge} onChange={e => setEditApproxCharge(e.target.value)} data-testid="input-edit-charge" /></div>
              </div>
              <div className="space-y-2">
                <Label>Mobile Numbers (comma separated)</Label>
                {(!editMobileNumbers.trim()) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />No mobile numbers yet — add at least one below</p>
                )}
                <Input ref={mobileNumbersInputRef} value={editMobileNumbers} onChange={e => setEditMobileNumbers(e.target.value)} placeholder="e.g. 9876543210, 9123456789" data-testid="input-edit-mobiles" className={!editMobileNumbers.trim() ? "border-amber-400 dark:border-amber-500 focus-visible:ring-amber-400" : ""} />
              </div>
              <div className="space-y-2"><Label>Address / Service Area</Label><Input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="e.g. MG Road, Bangalore" data-testid="input-edit-address" /></div>
              <Button
                className="w-full"
                onClick={() => {
                  const hasMobile = editMobileNumbers.split(",").map((m: string) => m.trim()).filter(Boolean).length > 0;
                  if (!hasMobile) { setShowNoMobileWarning(true); return; }
                  updateProviderProfile.mutate();
                }}
                disabled={updateProviderProfile.isPending || !editName.trim()}
                data-testid="button-save-provider"
              >
                <Save className="w-4 h-4 mr-2" />{updateProviderProfile.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── NO-MOBILE SAVE WARNING DIALOG ── */}
      <Dialog open={showNoMobileWarning} onOpenChange={setShowNoMobileWarning}>
        <DialogContent className="max-w-sm" data-testid="dialog-no-mobile-warning">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              No call numbers
            </DialogTitle>
            <DialogDescription>
              This provider still has no call numbers. Customers won't be able to call them. Save anyway?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:flex-row flex-col-reverse">
            <Button variant="outline" className="flex-1" onClick={() => setShowNoMobileWarning(false)} data-testid="button-no-mobile-go-back">
              Go back &amp; add number
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => { setShowNoMobileWarning(false); updateProviderProfile.mutate(); }}
              data-testid="button-no-mobile-save-anyway"
            >
              Save anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── BULK APPROVE CONFIRM DIALOG ── */}
      <Dialog open={bulkApproveConfirmOpen} onOpenChange={setBulkApproveConfirmOpen}>
        <DialogContent className="max-w-sm" data-testid="dialog-bulk-approve-confirm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              Bulk Approve Confirm
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p>
                  <span className="font-semibold text-foreground">{bulkPreflightData?.total ?? 0} pending leads</span> approve honge aur live providers ban jayenge.
                </p>
                {(bulkPreflightData?.noMobile ?? 0) > 0 && (
                  <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-semibold">{bulkPreflightData!.noMobile} of these providers</span> ke paas koi call number nahi hai. Customers unhe reach nahi kar paayenge. Phir bhi approve karein?
                    </p>
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:flex-row flex-col-reverse">
            <Button variant="outline" className="flex-1" onClick={() => setBulkApproveConfirmOpen(false)} data-testid="button-bulk-approve-cancel">
              Cancel
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={proceedBulkApprove}
              data-testid="button-bulk-approve-proceed"
            >
              Approve Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-primary via-primary to-primary/85 text-primary-foreground shadow-xl" data-testid="admin-header">
        <div className="flex items-center justify-between px-4 py-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab("content")} data-testid="link-logo">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-inner">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-base leading-tight tracking-tight">Mitrify Admin</p>
              <p className="text-[11px] text-primary-foreground/65 font-medium">Control Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-primary-foreground hover:bg-white/20 rounded-xl" data-testid="button-theme">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-primary-foreground hover:bg-white/20 rounded-xl" data-testid="button-admin-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto pb-12">

        {/* ── TOP STAT CARDS ── */}
        <div className="grid grid-cols-2 gap-3 mb-3 mt-4">
          {/* Total Visitors — display only, no click */}
          {visitorData && (
            <div
              className="rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/40 p-4 flex items-center gap-3"
              data-testid="stat-total-visitors"
            >
              <div className="w-11 h-11 rounded-xl bg-sky-100 dark:bg-sky-900/60 flex items-center justify-center flex-shrink-0">
                <EyeOff className="w-5 h-5 text-sky-600 dark:text-sky-400" style={{ transform: "scaleX(-1)" }} />
              </div>
              <div>
                <p className="text-2xl font-extrabold leading-none">{visitorData.total.toLocaleString("en-IN")}</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">Total Visitors</p>
              </div>
            </div>
          )}

          {/* Today's Visitors — display only, no click */}
          {visitorData && (
            <div
              className="rounded-2xl bg-pink-50 dark:bg-pink-950/40 border border-pink-100 dark:border-pink-900/40 p-4 flex items-center gap-3"
              data-testid="stat-today-visitors"
            >
              <div className="w-11 h-11 rounded-xl bg-pink-100 dark:bg-pink-900/60 flex items-center justify-center flex-shrink-0">
                <Activity className="w-5 h-5 text-pink-600 dark:text-pink-400" />
              </div>
              <div>
                <p className="text-2xl font-extrabold leading-none">{visitorData.today.toLocaleString("en-IN")}</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">Today's Visitors</p>
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION CARDS ── */}
        {(() => {
          const purchaseCount = (allCredits || []).filter((c: any) => (c.purchasedCredits ?? 0) > 0).length;
          const sections: Array<{
            value: string;
            icon: any;
            label: string;
            count?: number;
            iconBg: string;
            iconColor: string;
            activeBg: string;
            border: string;
            onClick?: () => void;
          }> = [
            { value: "providers", icon: Wrench,     label: "Providers",  count: stats?.totalProviders, iconBg: "bg-blue-100 dark:bg-blue-900/60",    iconColor: "text-blue-600 dark:text-blue-400",    activeBg: "bg-blue-600",    border: "border-blue-200 dark:border-blue-800" },
            { value: "calls",     icon: Phone,      label: "Calls",      count: stats?.totalCalls,     iconBg: "bg-emerald-100 dark:bg-emerald-900/60", iconColor: "text-emerald-600 dark:text-emerald-400", activeBg: "bg-emerald-600", border: "border-emerald-200 dark:border-emerald-800" },
            { value: "promos",    icon: TicketPlus, label: "Promos",     count: undefined,             iconBg: "bg-orange-100 dark:bg-orange-900/60",  iconColor: "text-orange-600 dark:text-orange-400",  activeBg: "bg-orange-600",  border: "border-orange-200 dark:border-orange-800" },
            { value: "coadmins",  icon: UserCog,    label: "Co-Admins",  count: undefined,             iconBg: "bg-violet-100 dark:bg-violet-900/60",  iconColor: "text-violet-600 dark:text-violet-400",  activeBg: "bg-violet-600",  border: "border-violet-200 dark:border-violet-800" },
            { value: "jobs",      icon: Briefcase,  label: "Jobs",       count: undefined,             iconBg: "bg-teal-100 dark:bg-teal-900/60",      iconColor: "text-teal-600 dark:text-teal-400",      activeBg: "bg-teal-600",    border: "border-teal-200 dark:border-teal-800" },
            { value: "search",    icon: Search,     label: "Search",     count: undefined,             iconBg: "bg-slate-100 dark:bg-slate-700",        iconColor: "text-slate-600 dark:text-slate-300",    activeBg: "bg-slate-600",   border: "border-slate-200 dark:border-slate-700" },
            { value: "import",    icon: Upload,     label: "Import",     count: undefined,             iconBg: "bg-rose-100 dark:bg-rose-900/60",       iconColor: "text-rose-600 dark:text-rose-400",      activeBg: "bg-rose-600",    border: "border-rose-200 dark:border-rose-800" },
            { value: "creditpurchase", icon: Coins, label: "Credit Buy", count: purchaseCount,         iconBg: "bg-purple-100 dark:bg-purple-900/60",  iconColor: "text-purple-600 dark:text-purple-400",  activeBg: "bg-purple-600",  border: "border-purple-200 dark:border-purple-800" },
            { value: "duplicateentry", icon: Copy,  label: "Duplicate",  count: duplicateData?.length, iconBg: "bg-red-100 dark:bg-red-900/60",         iconColor: "text-red-600 dark:text-red-400",        activeBg: "bg-red-600",     border: "border-red-200 dark:border-red-800" },
            { value: "subscriptions", icon: Sparkles, label: "Plans",   count: undefined,             iconBg: "bg-amber-100 dark:bg-amber-900/60",     iconColor: "text-amber-600 dark:text-amber-400",    activeBg: "bg-amber-600",   border: "border-amber-200 dark:border-amber-800" },
            { value: "ai",        icon: Sparkles,   label: "AI",         count: undefined,             iconBg: "bg-fuchsia-100 dark:bg-fuchsia-900/60",  iconColor: "text-fuchsia-600 dark:text-fuchsia-400", activeBg: "bg-fuchsia-600", border: "border-fuchsia-200 dark:border-fuchsia-800" },
            { value: "system",    icon: Shield,     label: "System",     count: undefined,             iconBg: "bg-sky-100 dark:bg-sky-900/60",          iconColor: "text-sky-600 dark:text-sky-400",         activeBg: "bg-sky-600",     border: "border-sky-200 dark:border-sky-800" },
            { value: "bulkdelete", icon: Trash2,   label: "Bulk Del",   count: undefined,             iconBg: "bg-rose-100 dark:bg-rose-900/60",        iconColor: "text-rose-600 dark:text-rose-400",       activeBg: "bg-rose-600",    border: "border-rose-200 dark:border-rose-800" },
            { value: "backup",    icon: Database,   label: "Backup",     count: undefined,             iconBg: "bg-amber-100 dark:bg-amber-900/60",     iconColor: "text-amber-600 dark:text-amber-400",    activeBg: "bg-amber-600",   border: "border-amber-200 dark:border-amber-800",
              onClick: () => {
                setRestoreFile(null);
                setRestoreConfirmed(false);
                setRestoreSummary(null);
                setParsedTables(null);
                setSelectedTables(new Set());
                setSelectedGcsName("");
                setGcsUploadResult(null);
                setGcsMode("new");
                setRestoreMode("upload");
                setRestoreStrategy("merge");
                setSelectedStoredFilename(null);
                setDryRunResult(null);
              } },
          ];
          return (
            <div id="section-cards" className="grid grid-cols-4 gap-2.5 mb-5">
              {sections.map(({ value, icon: Icon, label, count, iconBg, iconColor, activeBg, border, onClick }) => {
                const isActive = activeTab === value;
                return (
                  <button
                    key={value}
                    onClick={() => {
                      if (activeTab === "backup" && restoreInProgress) {
                        toast({ title: "Restore in progress", description: "Restore complete hone tak wait karo, phir tab switch karo.", variant: "destructive" });
                        return;
                      }
                      if (value === "duplicateentry") setSelectedDeleteIds(new Set());
                      if (onClick) onClick();
                      setActiveTab(value);
                    }}
                    data-testid={`card-tab-${value}`}
                    className={`flex flex-col items-center gap-1 py-3 px-1 rounded-2xl border transition-all active:scale-95 ${
                      isActive
                        ? `${activeBg} border-transparent shadow-md`
                        : `bg-white dark:bg-slate-900 ${border} hover:shadow-sm`
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? "bg-white/20" : iconBg}`}>
                      <Icon className={`w-4 h-4 ${isActive ? "text-white" : iconColor}`} />
                    </div>
                    {count !== undefined && (
                      <span className={`text-sm font-extrabold leading-none ${isActive ? "text-white" : "text-foreground"}`}>
                        {count.toLocaleString("en-IN")}
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold leading-tight text-center ${isActive ? "text-white" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* ── Auto-backup status line ── */}
        <BackupStatusLine />

        {/* ── TABS (content only) ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>

          {/* ── PROVIDERS TAB ── */}
          <TabsContent value="providers" className="space-y-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 space-y-2.5 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9 pr-10 rounded-xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600"
                  placeholder="Search by name, mobile or service..."
                  value={provSearch}
                  onChange={e => setProvSearch(e.target.value)}
                  data-testid="input-provider-search"
                />
                {provSearch && (
                  <button
                    type="button"
                    onClick={() => setProvSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-foreground transition"
                    aria-label="Clear provider search"
                    data-testid="button-clear-provider-search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Select value={provFilter} onValueChange={setProvFilter}>
                  <SelectTrigger className="flex-1 h-8 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600" data-testid="select-provider-filter">
                    <Filter className="w-3 h-3 mr-1" /><SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Providers</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="frozen">Frozen Credits</SelectItem>
                    <SelectItem value="suspicious">Suspicious</SelectItem>
                    <SelectItem value="no_mobile" data-testid="filter-option-no-mobile">
                      No call numbers{noMobileCount > 0 ? ` (${noMobileCount})` : ""}
                    </SelectItem>
                    {recentNoMobileIds.size > 0 && (
                      <SelectItem value="recent_no_mobile" data-testid="filter-option-recent-no-mobile">
                        Recent bulk — no call# ({recentNoMobileIds.size})
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Select value={provSort} onValueChange={setProvSort}>
                  <SelectTrigger className="flex-1 h-8 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600" data-testid="select-provider-sort">
                    <SortAsc className="w-3 h-3 mr-1" /><SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="name_asc">Name A → Z</SelectItem>
                    <SelectItem value="name_desc">Name Z → A</SelectItem>
                    <SelectItem value="credits_high">Credits High → Low</SelectItem>
                    <SelectItem value="credits_low">Credits Low → High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Select value={provAddedByFilter} onValueChange={setProvAddedByFilter}>
                  <SelectTrigger className="flex-1 h-8 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600" data-testid="select-provider-added-by">
                    <SelectValue placeholder="Added by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Added By</SelectItem>
                    <SelectItem value="self">Self Registered</SelectItem>
                    <SelectItem value="bulk-import">Bulk Import</SelectItem>
                    <SelectItem value="meta">Meta Import</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={provApprovedByFilter} onValueChange={setProvApprovedByFilter}>
                  <SelectTrigger className="flex-1 h-8 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600" data-testid="select-provider-approved-by">
                    <SelectValue placeholder="Approved by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Approved By</SelectItem>
                    <SelectItem value="none">Not Approved Yet</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="coadmin">Co-Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Showing <span className="font-semibold text-foreground">{filteredProviders.length}</span> of <span className="font-semibold text-foreground">{providersList?.length ?? 0}</span> providers
                  </p>
                  {noMobileCount > 0 && provFilter !== "no_mobile" && (
                    <button
                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors flex-shrink-0"
                      onClick={() => setProvFilter("no_mobile")}
                      data-testid="badge-no-mobile-count"
                      title="Click to filter providers missing call numbers"
                    >
                      ⚠ {noMobileCount} no call#
                    </button>
                  )}
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-lg flex-shrink-0" onClick={() => handleExport("providers")} data-testid="button-export-providers">
                  <Download className="w-3 h-3 mr-1" /> Export CSV
                </Button>
              </div>
            </div>

            {/* Provider Detail Modal */}
            {selectedProviderDetail && (() => {
              const p = selectedProviderDetail;
              const cr = p._credit;
              const totalCredits = (cr?.freeCredits ?? 0) + (cr?.purchasedCredits ?? 0);
              const isSuspicious = (cr?.purchasedCredits ?? 0) > 500;
              const addedBy = p.providerData?.addedBy;
              const approvedBy = p.providerData?.approvedBy;
              const isSelfRegistered = !addedBy || addedBy === "self";
              return (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" data-testid="modal-provider-detail">
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedProviderDetail(null)} />
                  <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="sticky top-0 bg-white dark:bg-slate-900 px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 z-10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-sm ${avatarColor(p.name)}`}>
                            {getInitials(p.name)}
                          </div>
                          <div>
                            <p className="font-bold text-base leading-tight">{p.name}</p>
                            <p className="text-xs text-primary font-semibold">{p.providerData?.serviceName || "No service"}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setSelectedProviderDetail(null)} data-testid="button-close-provider-detail"><X className="w-4 h-4" /></Button>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {isSuspicious && <Badge className="text-orange-600 bg-orange-100 dark:bg-orange-900/30 border-orange-200 text-xs px-1.5 py-0 h-5 rounded-md"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Suspicious</Badge>}
                        {cr?.creditsFrozen && <Badge className="text-blue-600 bg-blue-100 dark:bg-blue-900/30 border-blue-200 text-xs px-1.5 py-0 h-5 rounded-md"><Snowflake className="w-2.5 h-2.5 mr-0.5" />Frozen</Badge>}
                        {p.providerData?.isHidden && <Badge className="text-purple-600 bg-purple-100 dark:bg-purple-900/30 border-purple-200 text-xs px-1.5 py-0 h-5 rounded-md"><EyeOff className="w-2.5 h-2.5 mr-0.5" />Hidden</Badge>}
                        {p.isBlocked && <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5 rounded-md">Blocked</Badge>}
                        {(!p.providerData?.mobileNumbers || p.providerData.mobileNumbers.length === 0) && (
                          <button
                            data-testid={`badge-no-mobile-${p.id}`}
                            onClick={() => { openEditProvider(p, true); setSelectedProviderDetail(null); }}
                            className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0 h-5 rounded-md font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors"
                          >
                            <Phone className="w-2.5 h-2.5 mr-0.5" />No mobile — add number
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="p-5 space-y-4">
                      {/* Service (Kaam) + Description */}
                      {(p.providerData?.serviceName || p.providerData?.description) && (
                        <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl px-3 py-2.5 space-y-1.5">
                          {p.providerData?.serviceName && (
                            <div>
                              <p className="text-[11px] font-semibold text-primary/80 uppercase tracking-wide flex items-center gap-1">🛠️ Kaam / Service</p>
                              <p className="text-sm font-semibold text-foreground mt-0.5" data-testid={`text-service-${p.id}`}>{p.providerData.serviceName}</p>
                            </div>
                          )}
                          {p.providerData?.description && (
                            <div>
                              <p className="text-[11px] font-semibold text-primary/80 uppercase tracking-wide mt-1">📝 Description</p>
                              <p className="text-xs text-foreground/80 mt-0.5 whitespace-pre-wrap leading-relaxed" data-testid={`text-description-${p.id}`}>{p.providerData.description}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Basic Info */}
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="w-3 h-3" />{p.mobile || "No mobile"}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">🗓️ Joined: {new Date(p.createdAt).toLocaleDateString("en-IN")} {new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        {p.providerData?.address && <p className="text-xs text-muted-foreground flex items-start gap-1.5">📍 {p.providerData.address}</p>}
                        {(p.providerData?.latitude && p.providerData?.longitude) ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            🧭 Location: {Number(p.providerData.latitude).toFixed(5)}, {Number(p.providerData.longitude).toFixed(5)}
                          </p>
                        ) : (
                          <div className="rounded-xl border border-red-300/70 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 px-3 py-2">
                            <p className="text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                              <AlertTriangle className="w-3 h-3" />
                              No live location uploaded
                            </p>
                            <p className="text-[11px] text-red-600/90 dark:text-red-300/80 mt-1">
                              Is profile ko live location ke bina bana diya gaya hai. Distance calculate nahi hoga.
                            </p>
                          </div>
                        )}
                        {p.providerData?.approxCharge && <p className="text-xs text-muted-foreground flex items-center gap-1.5">💰 Charge: {p.providerData.approxCharge}</p>}
                        {p.providerData?.radiusKm && <p className="text-xs text-muted-foreground flex items-center gap-1.5">📡 Radius: {p.providerData.radiusKm} km</p>}
                      </div>

                      {/* Credits */}
                      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/30 rounded-xl px-3 py-2.5">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1"><Coins className="w-3 h-3" />Credits</p>
                        <div className="flex gap-4">
                          <div><p className="text-xs text-muted-foreground">Free</p><p className="font-bold text-sm">{cr?.freeCredits ?? 0}</p></div>
                          <div><p className="text-xs text-muted-foreground">Bought</p><p className="font-bold text-sm">{cr?.purchasedCredits ?? 0}</p></div>
                          <div><p className="text-xs text-muted-foreground">Total</p><p className="font-bold text-sm text-primary">{totalCredits}</p></div>
                        </div>
                      </div>

                      {/* Added By / Approved By */}
                      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 space-y-1.5">
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Registration Info</p>
                        {isSelfRegistered ? (
                          <p className="text-xs flex items-center gap-1.5"><span className="text-emerald-600">✅</span> Self-registered</p>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground">Added by: <span className="font-semibold text-foreground">{addedBy}</span></p>
                            {approvedBy && <p className="text-xs text-muted-foreground">Approved by: <span className="font-semibold text-foreground">{approvedBy}</span></p>}
                          </>
                        )}
                      </div>

                      {/* Hashtags */}
                      {p.providerData?.hashtags?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {p.providerData.hashtags.map((tag: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs px-1.5 py-0 h-5 rounded-md">{tag}</Badge>
                          ))}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="space-y-2 pt-1">
                        <Button className="w-full h-9 text-sm gap-2 rounded-xl" variant="outline" onClick={() => { openEditProvider(p); setSelectedProviderDetail(null); }} data-testid={`button-edit-provider-${p.id}`}>
                          <Pencil className="w-3.5 h-3.5" />Edit Profile
                        </Button>

                        <div className="grid grid-cols-2 gap-2">
                          <Button size="sm" variant="outline" className={`h-9 text-xs gap-1.5 rounded-xl ${cr?.creditsFrozen ? "border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700" : ""}`}
                            onClick={() => { freezeCredits.mutate({ userId: p.userId, role: "provider", freeze: !cr?.creditsFrozen }); setSelectedProviderDetail(null); }}
                            data-testid={`button-freeze-${p.userId}`}>
                            <Snowflake className="w-3.5 h-3.5" />{cr?.creditsFrozen ? "Unfreeze" : "Freeze"}
                          </Button>
                          <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 rounded-xl"
                            onClick={() => { if (window.confirm(`Reset ALL credits of "${p.name}" to 0?`)) { resetCredits.mutate({ userId: p.userId, role: "provider" }); setSelectedProviderDetail(null); } }}
                            data-testid={`button-reset-${p.userId}`}>
                            <RotateCcw className="w-3.5 h-3.5" />Reset Credits
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 rounded-xl"
                            onClick={() => setActiveTab("calls")} data-testid={`button-call-history-${p.userId}`}>
                            <Phone className="w-3.5 h-3.5" />Call History
                          </Button>
                          <Button size="sm" variant="destructive" className="h-9 text-xs gap-1.5 rounded-xl"
                            onClick={() => { if (window.confirm(`"${p.name}" ko PERMANENTLY delete karna chahte hain?\n\nYeh action undo nahi ho sakta.`)) { deleteUser.mutate(p.userId); setSelectedProviderDetail(null); } }}
                            data-testid={`button-delete-${p.userId}`}>
                            <Trash2 className="w-3.5 h-3.5" />Delete
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 text-xs gap-1.5 rounded-xl border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
                            onClick={() => {
                              const amt = prompt("Gift credits amount (1-500):", "");
                              if (!amt) return;
                              const parsed = parseInt(amt, 10);
                              if (isNaN(parsed) || parsed < 1 || parsed > 500) return;
                              giftCredits.mutate({ userId: p.userId, amount: parsed });
                            }}
                            data-testid={`button-gift-${p.userId}`}
                          >
                            <Coins className="w-3.5 h-3.5" />Gift
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Compact Provider List */}
            {filteredProviders.map((p: any) => {
              const cr = p._credit;
              const totalCredits = (cr?.freeCredits ?? 0) + (cr?.purchasedCredits ?? 0);
              const statusBorderColor = p.isBlocked
                ? "border-l-red-400"
                : cr?.creditsFrozen
                  ? "border-l-blue-400"
                  : "border-l-transparent";
              return (
                <button
                  key={p.id}
                  data-testid={`card-provider-${p.id}`}
                  onClick={() => setSelectedProviderDetail(p)}
                  className={`w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 border-l-4 ${statusBorderColor} rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition-all hover:shadow-md`}
                >
                  <div className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-sm ${avatarColor(p.name)}`}>
                    {getInitials(p.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="font-bold text-sm leading-tight truncate">{p.name}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {p.isBlocked && <Badge variant="destructive" className="text-xs px-1 py-0 h-4 rounded-md">Blocked</Badge>}
                        {cr?.creditsFrozen && <Badge className="text-blue-600 bg-blue-100 dark:bg-blue-900/30 border-blue-200 text-xs px-1 py-0 h-4 rounded-md">Frozen</Badge>}
                        {p.providerData?.isHidden && <Badge className="text-purple-600 bg-purple-100 dark:bg-purple-900/30 border-purple-200 text-xs px-1 py-0 h-4 rounded-md">Hidden</Badge>}
                      </div>
                    </div>
                    <p className="text-xs text-primary font-medium truncate">{p.providerData?.serviceName || "No service"}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">{p.mobile || "No mobile"}</p>
                      <span className="text-slate-300 dark:text-slate-600 text-xs flex-shrink-0">·</span>
                      <span className="text-xs text-amber-600 font-semibold flex-shrink-0 flex items-center gap-0.5"><Coins className="w-2.5 h-2.5" />{totalCredits}</span>
                      {(!p.providerData?.mobileNumbers || p.providerData.mobileNumbers.length === 0) && (
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded px-1 flex-shrink-0" data-testid={`badge-list-no-mobile-${p.id}`}>No call#</span>
                      )}
                    </div>
                  </div>
                  <div className="text-slate-300 dark:text-slate-600 flex-shrink-0">›</div>
                </button>
              );
            })}
            {filteredProviders.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                  <Wrench className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="font-semibold text-slate-600 dark:text-slate-400">{provSearch || provFilter !== "all" ? "No results found" : "No providers yet"}</p>
                <p className="text-xs text-muted-foreground mt-1">{provSearch || provFilter !== "all" ? "Try a different search or filter" : "Providers will appear here once they register"}</p>
              </div>
            )}
          </TabsContent>

          {/* ── CALLS TAB ── */}
          <TabsContent value="calls" className="space-y-3">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => handleExport("calls")} data-testid="button-export-calls">
                <Download className="w-4 h-4 mr-1" /> Export CSV
              </Button>
            </div>
            {callLogs?.map((call) => (
              <div key={call.id} data-testid={`card-call-${call.id}`} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 items-start">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{call.customerName} <span className="text-muted-foreground font-normal">→</span> {call.providerName}</p>
                      <p className="text-xs text-primary font-medium">{call.serviceName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{call.timestamp ? new Date(call.timestamp).toLocaleString() : "Unknown"}</p>
                    </div>
                  </div>
                  <Badge variant={call.paymentStatus === "paid" ? "default" : "secondary"} className="text-xs shrink-0 rounded-md">{call.paymentStatus}</Badge>
                </div>
              </div>
            ))}
            {(!callLogs || callLogs.length === 0) && (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                  <Phone className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="font-semibold text-slate-600 dark:text-slate-400">No calls yet</p>
                <p className="text-xs text-muted-foreground mt-1">Call logs will appear here once customers start calling</p>
              </div>
            )}
          </TabsContent>

          {/* ── PROMOS TAB ── */}
          <TabsContent value="promos" className="space-y-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4">
              <p className="text-sm font-semibold mb-3">Naya Promo Code Banao</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Input value={newPromoCode} onChange={e => setNewPromoCode(e.target.value)} placeholder="Code (e.g. Asheesh%77420)" className="rounded-xl" data-testid="input-new-promo" />
                <Input type="number" min={1} value={newPromoCredits} onChange={e => setNewPromoCredits(e.target.value)} placeholder="Credits (default 25)" className="rounded-xl" data-testid="input-new-promo-credits" />
              </div>
              <Button onClick={() => createPromo.mutate()} disabled={!newPromoCode.trim() || createPromo.isPending} className="w-full rounded-xl" data-testid="button-create-promo">
                <TicketPlus className="w-4 h-4 mr-1" /> Promo Code Add Karo
              </Button>
            </div>
            {promoCodesData?.map((promo) => (
              <div key={promo.id} data-testid={`card-promo-${promo.id}`} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4">
                {editPromoId === promo.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={editPromoCode} onChange={e => setEditPromoCode(e.target.value)} placeholder="Code" className="h-8 text-xs rounded-lg" />
                      <Input type="number" value={editPromoCredits} onChange={e => setEditPromoCredits(e.target.value)} placeholder="Credits" className="h-8 text-xs rounded-lg" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => updatePromo.mutate({ id: promo.id, code: editPromoCode, creditAmount: editPromoCredits })} disabled={updatePromo.isPending}>Save</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditPromoId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <code className="font-mono text-sm font-bold tracking-wider bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg">{promo.code}</code>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant={promo.isActive ? "default" : "secondary"} className="text-xs rounded-md">{promo.isActive ? "Active" : "Inactive"}</Badge>
                        <span className="text-xs text-muted-foreground">Used {promo.usageCount}×</span>
                        <span className="text-xs font-medium text-green-600 dark:text-green-400">{(promo as any).creditAmount ?? 25} credits</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="icon" variant="outline" className="w-8 h-8 rounded-xl border-slate-200 dark:border-slate-600"
                        onClick={() => { setEditPromoId(promo.id); setEditPromoCode(promo.code); setEditPromoCredits(String((promo as any).creditAmount ?? 25)); }}
                        data-testid={`button-edit-promo-${promo.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="outline" className="w-8 h-8 rounded-xl border-slate-200 dark:border-slate-600" onClick={() => togglePromo.mutate(promo.id)} data-testid={`button-toggle-promo-${promo.id}`}>
                        {promo.isActive ? <ToggleRight className="w-4 h-4 text-primary" /> : <ToggleLeft className="w-4 h-4" />}
                      </Button>
                      <Button size="icon" variant="outline" className="w-8 h-8 rounded-xl border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => { if (window.confirm(`Delete promo code "${promo.code}"?`)) deletePromo.mutate(promo.id); }}
                        disabled={deletePromo.isPending}
                        data-testid={`button-delete-promo-${promo.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {(!promoCodesData || promoCodesData.length === 0) && (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                  <TicketPlus className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="font-semibold text-slate-600 dark:text-slate-400">No promo codes</p>
                <p className="text-xs text-muted-foreground mt-1">Upar se promo code create karo</p>
              </div>
            )}
          </TabsContent>

          {/* ── CONTENT TAB ── */}
          <TabsContent value="content" className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-base mb-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                Edit About Us
              </h3>
              <div className="space-y-3">
                <div><Label>Founder Name</Label><Input className="mt-1 rounded-xl" value={aboutForm.founderName} onChange={e => setAboutForm({...aboutForm, founderName: e.target.value})} data-testid="input-about-founder-name" /></div>
                <div><Label>Founder Title</Label><Input className="mt-1 rounded-xl" value={aboutForm.founderTitle} onChange={e => setAboutForm({...aboutForm, founderTitle: e.target.value})} data-testid="input-about-founder-title" /></div>
                <div><Label>Location</Label><Input className="mt-1 rounded-xl" value={aboutForm.location} onChange={e => setAboutForm({...aboutForm, location: e.target.value})} data-testid="input-about-location" /></div>
                <div><Label>Education</Label><Input className="mt-1 rounded-xl" value={aboutForm.education} onChange={e => setAboutForm({...aboutForm, education: e.target.value})} data-testid="input-about-education" /></div>
                <div><Label>Mission Title</Label><Input className="mt-1 rounded-xl" value={aboutForm.missionTitle} onChange={e => setAboutForm({...aboutForm, missionTitle: e.target.value})} data-testid="input-about-mission-title" /></div>
                <div><Label>Mission Text</Label><Textarea className="mt-1 rounded-xl" value={aboutForm.missionText} onChange={e => setAboutForm({...aboutForm, missionText: e.target.value})} rows={3} data-testid="input-about-mission-text" /></div>
                <div><Label>What Is Mitrify - Title</Label><Input className="mt-1 rounded-xl" value={aboutForm.whatIsTitle} onChange={e => setAboutForm({...aboutForm, whatIsTitle: e.target.value})} data-testid="input-about-whatis-title" /></div>
                <div><Label>What Is Mitrify - Text</Label><Textarea className="mt-1 rounded-xl" value={aboutForm.whatIsText} onChange={e => setAboutForm({...aboutForm, whatIsText: e.target.value})} rows={3} data-testid="input-about-whatis-text" /></div>
                <div><Label>Feature 1</Label><Input className="mt-1 rounded-xl" value={aboutForm.feature1} onChange={e => setAboutForm({...aboutForm, feature1: e.target.value})} data-testid="input-about-feature1" /></div>
                <div><Label>Feature 2</Label><Input className="mt-1 rounded-xl" value={aboutForm.feature2} onChange={e => setAboutForm({...aboutForm, feature2: e.target.value})} data-testid="input-about-feature2" /></div>
                <div><Label>Feature 3</Label><Input className="mt-1 rounded-xl" value={aboutForm.feature3} onChange={e => setAboutForm({...aboutForm, feature3: e.target.value})} data-testid="input-about-feature3" /></div>
                <Button onClick={() => saveAbout.mutate()} disabled={saveAbout.isPending} className="w-full rounded-xl" data-testid="button-save-about">
                  <Save className="w-4 h-4 mr-2" />{saveAbout.isPending ? "Saving..." : "Save About Us"}
                </Button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-base mb-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                Edit Terms &amp; Conditions
              </h3>
              <div className="space-y-3">
                <div><Label>Introduction</Label><Textarea className="mt-1 rounded-xl" value={termsForm.intro} onChange={e => setTermsForm({...termsForm, intro: e.target.value})} rows={2} data-testid="input-terms-intro" /></div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold">Sections</Label>
                    <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setTermsForm({...termsForm, sections: [...termsForm.sections, {title: `${termsForm.sections.length + 1}. New Section`, content: ""}]})} data-testid="button-add-section">
                      <Plus className="w-4 h-4 mr-1" /> Add Section
                    </Button>
                  </div>
                  {termsForm.sections.map((section, i) => (
                    <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-2xl p-3 space-y-2 bg-slate-50/60 dark:bg-slate-800/30">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground font-medium">Section {i + 1}</Label>
                        {termsForm.sections.length > 1 && (
                          <Button size="sm" variant="ghost" className="h-6 text-destructive px-2 rounded-lg"
                            onClick={() => setTermsForm({...termsForm, sections: termsForm.sections.filter((_, idx) => idx !== i)})}
                            data-testid={`button-remove-section-${i}`}>
                            <Minus className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                      <Input value={section.title} placeholder="Section Title" className="rounded-xl" onChange={e => {
                        const s = [...termsForm.sections]; s[i] = {...s[i], title: e.target.value}; setTermsForm({...termsForm, sections: s});
                      }} data-testid={`input-terms-section-title-${i}`} />
                      <Textarea value={section.content} placeholder="Section Content" rows={3} className="rounded-xl" onChange={e => {
                        const s = [...termsForm.sections]; s[i] = {...s[i], content: e.target.value}; setTermsForm({...termsForm, sections: s});
                      }} data-testid={`input-terms-section-content-${i}`} />
                    </div>
                  ))}
                </div>
                <div><Label>Footer</Label><Textarea className="mt-1 rounded-xl" value={termsForm.footer} onChange={e => setTermsForm({...termsForm, footer: e.target.value})} rows={2} data-testid="input-terms-footer" /></div>
                <Button onClick={() => saveTerms.mutate()} disabled={saveTerms.isPending} className="w-full rounded-xl" data-testid="button-save-terms">
                  <Save className="w-4 h-4 mr-2" />{saveTerms.isPending ? "Saving..." : "Save Terms & Conditions"}
                </Button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-base mb-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Briefcase className="w-4 h-4 text-primary" />
                </div>
                Recruitment Form Link
              </h3>
              <div className="space-y-3">
                <div>
                  <Label>Google Form URL</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      className="rounded-xl flex-1"
                      value={recruitmentLink}
                      onChange={e => setRecruitmentLink(e.target.value)}
                      placeholder="https://forms.gle/..."
                      data-testid="input-recruitment-link"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-xl shrink-0"
                      onClick={() => window.open(recruitmentLink, "_blank")}
                      data-testid="button-preview-recruitment"
                    >
                      <Link className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Yeh link menu mein "Recruitment" button par click karne par open hoga.</p>
                </div>
                <Button onClick={() => saveRecruitment.mutate()} disabled={saveRecruitment.isPending} className="w-full rounded-xl" data-testid="button-save-recruitment">
                  <Save className="w-4 h-4 mr-2" />{saveRecruitment.isPending ? "Saving..." : "Save Recruitment Link"}
                </Button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5" data-testid="card-contact-emails">
              <h3 className="font-bold text-base mb-1 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-primary" />
                </div>
                Contact Emails
              </h3>
              <p className="text-xs text-muted-foreground mb-3">Yeh emails users ko Contact Us sheet mein dikhte hain. Min 1, max 5.</p>
              <div className="space-y-2">
                {contactEmails.map((entry, i) => (
                  <div key={i} className="flex gap-2" data-testid={`row-contact-email-${i}`}>
                    <Input
                      className="rounded-xl flex-1"
                      placeholder="Label (e.g. Help & Support)"
                      value={entry.label}
                      onChange={e => {
                        const next = [...contactEmails];
                        next[i] = { ...next[i], label: e.target.value };
                        setContactEmails(next);
                      }}
                      data-testid={`input-contact-label-${i}`}
                    />
                    <Input
                      className="rounded-xl flex-[2]"
                      placeholder="email@example.com"
                      type="email"
                      value={entry.email}
                      onChange={e => {
                        const next = [...contactEmails];
                        next[i] = { ...next[i], email: e.target.value };
                        setContactEmails(next);
                      }}
                      data-testid={`input-contact-email-${i}`}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-xl shrink-0"
                      disabled={contactEmails.length <= 1}
                      onClick={() => setContactEmails(contactEmails.filter((_, idx) => idx !== i))}
                      data-testid={`button-remove-contact-${i}`}
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={contactEmails.length >= 5}
                  onClick={() => setContactEmails([...contactEmails, { label: "", email: "" }])}
                  data-testid="button-add-contact-email"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Email
                </Button>
                <Button
                  onClick={() => saveContactEmails.mutate()}
                  disabled={saveContactEmails.isPending}
                  className="w-full rounded-xl"
                  data-testid="button-save-contact-emails"
                >
                  <Save className="w-4 h-4 mr-2" />{saveContactEmails.isPending ? "Saving..." : "Save Contact Emails"}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── CO-ADMINS TAB ── */}
          <TabsContent value="coadmins" className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm flex items-center gap-2"><UserCog className="w-4 h-4" /> Co-Admin Accounts</h3>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 rounded-xl" onClick={() => window.open("/verify/dashboard", "_blank")}>
                  <ExternalLink className="w-3.5 h-3.5" /> Verify Dashboard
                </Button>
              </div>

              <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl mb-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">New Co-Admin Add Karo</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={newCoAdminUser} onChange={e => setNewCoAdminUser(e.target.value)} placeholder="Username" className="h-8 text-xs rounded-lg" data-testid="input-new-coadmin-user" />
                  <Input value={newCoAdminPass} onChange={e => setNewCoAdminPass(e.target.value)} placeholder="Password" type="password" className="h-8 text-xs rounded-lg" data-testid="input-new-coadmin-pass" />
                </div>
                <div className="flex gap-2">
                  <select value={newCoAdminRole} onChange={e => setNewCoAdminRole(e.target.value)} className="flex-1 h-8 text-xs rounded-lg border bg-background px-2">
                    <option value="coadmin">Co-Admin (Data Entry)</option>
                    <option value="testadmin">Test Admin (Verify)</option>
                  </select>
                  <Button size="sm" className="h-8 text-xs rounded-lg gap-1"
                    disabled={createCoAdmin.isPending || !newCoAdminUser || !newCoAdminPass}
                    onClick={() => createCoAdmin.mutate({ username: newCoAdminUser, password: newCoAdminPass, role: newCoAdminRole })}
                    data-testid="button-create-coadmin">
                    {createCoAdmin.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Create
                  </Button>
                </div>
              </div>

              {coAdminsList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <UserCog className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Koi co-admin nahi hai abhi</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {coAdminsList.map((ca: any) => (
                    <div key={ca.id} className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900">
                      <div
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        onClick={() => setSelectedCoAdminId(ca.id)}
                        data-testid={`card-coadmin-${ca.id}`}
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm ${avatarColor(ca.username)}`}>
                          {ca.username[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{ca.username}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge className={`text-xs ${ca.role === "testadmin" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                              {ca.role === "testadmin" ? "Verifier" : "Data Entry"}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">tap for details →</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {changePwdId === ca.id ? (
                          <div className="flex gap-1.5 items-center">
                            <Input value={changePwdVal} onChange={e => setChangePwdVal(e.target.value)} placeholder="New password" type="password" className="h-7 text-xs rounded-lg w-28" />
                            <Button size="sm" className="h-7 text-xs rounded-lg px-2" disabled={!changePwdVal || changeCoAdminPwd.isPending} onClick={() => changeCoAdminPwd.mutate({ id: ca.id, password: changePwdVal })}>
                              {changeCoAdminPwd.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg px-2" onClick={() => { setChangePwdId(null); setChangePwdVal(""); }}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg gap-1 border-slate-300" onClick={() => { setChangePwdId(ca.id); setChangePwdVal(""); }}>
                            <Key className="w-3 h-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg gap-1 border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
                          disabled={deleteCoAdmin.isPending}
                          onClick={() => { if (window.confirm(`"${ca.username}" ko delete karna chahte hain?`)) deleteCoAdmin.mutate(ca.id); }}
                          data-testid={`button-delete-coadmin-${ca.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── JOBS TAB ── */}
          <TabsContent value="jobs" className="space-y-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Briefcase className="w-4 h-4 text-amber-500" /> All Job Posts ({adminJobs.length})</h3>
              {adminJobs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Briefcase className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Koi job post nahi hai</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {adminJobs.map((job: any) => (
                    <div key={job.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3" data-testid={`card-admin-job-${job.id}`}>
                      {editJobId === job.id ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-muted-foreground">Post type:</span>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="radio" name={`pt-${job.id}`} checked={editJobForm.postType === "mitrify"} onChange={() => setEditJobForm(f => ({ ...f, postType: "mitrify" }))} data-testid={`radio-edit-job-mitrify-${job.id}`} />
                              Mitrify
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="radio" name={`pt-${job.id}`} checked={editJobForm.postType === "google_form"} onChange={() => setEditJobForm(f => ({ ...f, postType: "google_form" }))} data-testid={`radio-edit-job-google-${job.id}`} />
                              Google Form
                            </label>
                          </div>
                          <Input value={editJobForm.jobName} onChange={e => setEditJobForm(f => ({ ...f, jobName: e.target.value }))} placeholder="Job Title" className="h-8 text-xs" data-testid={`input-edit-job-name-${job.id}`} />
                          <Textarea value={editJobForm.description} onChange={e => setEditJobForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" rows={2} className="text-xs" data-testid={`input-edit-job-desc-${job.id}`} />
                          <div className="grid grid-cols-2 gap-2">
                            <Input value={editJobForm.location} onChange={e => setEditJobForm(f => ({ ...f, location: e.target.value }))} placeholder="Location" className="h-8 text-xs" />
                            <Input value={editJobForm.contactPhone} onChange={e => setEditJobForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder={editJobForm.postType === "google_form" ? "Contact Phone (optional)" : "Contact Phone"} className="h-8 text-xs" />
                          </div>
                          {editJobForm.postType === "mitrify" && (
                            <div className="grid grid-cols-2 gap-2">
                              <Input value={editJobForm.salary || ""} onChange={e => setEditJobForm(f => ({ ...f, salary: e.target.value }))} placeholder="Salary (optional)" className="h-8 text-xs" />
                              <Input value={editJobForm.workHours || ""} onChange={e => setEditJobForm(f => ({ ...f, workHours: e.target.value }))} placeholder="Work Hours (optional)" className="h-8 text-xs" />
                            </div>
                          )}
                          {editJobForm.postType === "google_form" && (
                            <div className="space-y-1">
                              <Input
                                value={editJobForm.googleFormUrl || ""}
                                onChange={e => setEditJobForm(f => ({ ...f, googleFormUrl: e.target.value }))}
                                placeholder="https://forms.gle/... or https://docs.google.com/forms/..."
                                className="h-8 text-xs"
                                data-testid={`input-edit-job-form-url-${job.id}`}
                              />
                              {editJobForm.googleFormUrl && !GOOGLE_FORM_URL_RE.test(editJobForm.googleFormUrl.trim()) && (
                                <p className="text-[10px] text-red-600" data-testid={`text-edit-job-form-url-error-${job.id}`}>
                                  Sirf forms.gle ya docs.google.com/forms link allowed hai
                                </p>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input type="checkbox" checked={editJobForm.isActive} onChange={e => setEditJobForm(f => ({ ...f, isActive: e.target.checked }))} className="accent-primary" />
                              Active
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 h-7 text-xs"
                              onClick={() => {
                                const isForm = editJobForm.postType === "google_form";
                                updateAdminJob.mutate({
                                  id: job.id,
                                  ...editJobForm,
                                  // Clear Mitrify-only fields when switching to google_form
                                  // so legacy values don't linger on the row.
                                  salary: isForm ? "" : editJobForm.salary,
                                  workHours: isForm ? "" : editJobForm.workHours,
                                  googleFormUrl: isForm ? editJobForm.googleFormUrl.trim() : "",
                                });
                              }}
                              disabled={
                                updateAdminJob.isPending ||
                                (editJobForm.postType === "google_form" && !GOOGLE_FORM_URL_RE.test((editJobForm.googleFormUrl || "").trim()))
                              }
                              data-testid={`button-save-job-${job.id}`}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditJobId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-sm">{job.jobName}</p>
                                {job.postType === "google_form" ? (
                                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" data-testid={`badge-job-type-google-${job.id}`}>Google Form</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" data-testid={`badge-job-type-mitrify-${job.id}`}>Mitrify</Badge>
                                )}
                                {!job.isActive && <Badge variant="secondary" className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Inactive</Badge>}
                                {job.lowCredit && <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">Low Credit</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{job.description}</p>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                <span className="text-xs text-muted-foreground">📍 {job.location}</span>
                                {job.contactPhone && <span className="text-xs text-muted-foreground">📞 {job.contactPhone}</span>}
                                {job.postType !== "google_form" && job.salary && <span className="text-xs text-green-600">💰 {job.salary}</span>}
                                {job.postType !== "google_form" && job.workHours && <span className="text-xs text-muted-foreground">🕒 {job.workHours}</span>}
                              </div>
                              {job.postType === "google_form" && job.googleFormUrl && (
                                <a
                                  href={job.googleFormUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline mt-0.5 inline-block break-all"
                                  data-testid={`link-job-form-url-${job.id}`}
                                >
                                  🔗 {job.googleFormUrl}
                                </a>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5">Posted by: <span className="font-mono text-[10px]">{job.userId?.slice(0, 12)}...</span></p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs shrink-0"
                              onClick={() => { setEditJobId(job.id); setEditJobForm({ jobName: job.jobName, description: job.description, location: job.location, salary: job.salary || "", workHours: job.workHours || "", contactPhone: job.contactPhone || "", isActive: job.isActive, postType: job.postType || "mitrify", googleFormUrl: job.googleFormUrl || "" }); }}
                              data-testid={`button-edit-job-${job.id}`}
                            >
                              Edit
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── SEARCH STATS TAB ── */}
          <TabsContent value="search" className="space-y-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-4 shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white">सर्च रिपोर्ट</h3>
                  {searchStatsQuery.data && (
                    <p className="text-xs text-muted-foreground mt-0.5">{searchStatsQuery.data.length} unique searches</p>
                  )}
                </div>
                <SortAsc className="w-4 h-4 text-muted-foreground" />
              </div>

              {/* Sort Pills */}
              <div className="flex flex-wrap gap-1.5">
                {([
                  { key: "count", label: "सबसे ज़्यादा", icon: "🔢" },
                  { key: "az",    label: "A → Z",        icon: "🔤" },
                  { key: "za",    label: "Z → A",        icon: "🔤" },
                  { key: "newest",label: "नया पहले",     icon: "🕐" },
                  { key: "oldest",label: "पुराना पहले",  icon: "🕐" },
                ] as { key: typeof searchSort; label: string; icon: string }[]).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setSearchSort(opt.key)}
                    data-testid={`button-sort-${opt.key}`}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      searchSort === opt.key
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800 text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <span>{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Table */}
              {searchStatsQuery.isLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">लोड हो रहा है...</div>
              ) : searchStatsQuery.data && searchStatsQuery.data.length > 0 ? (() => {
                const sorted = [...searchStatsQuery.data].sort((a, b) => {
                  if (searchSort === "count")  return Number(b.count) - Number(a.count);
                  if (searchSort === "az")     return a.query.localeCompare(b.query);
                  if (searchSort === "za")     return b.query.localeCompare(a.query);
                  if (searchSort === "newest") return new Date(b.lastSearched ?? 0).getTime() - new Date(a.lastSearched ?? 0).getTime();
                  if (searchSort === "oldest") return new Date(a.lastSearched ?? 0).getTime() - new Date(b.lastSearched ?? 0).getTime();
                  return 0;
                });
                return (
                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    {/* Table Header */}
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <div>Search Term</div>
                      <div className="text-right">Last Seen</div>
                      <div className="text-right">Count</div>
                    </div>
                    {/* Rows */}
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sorted.map((item, idx) => (
                        <div
                          key={`${item.query}-${idx}`}
                          className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 items-center bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                          data-testid={`row-search-${idx}`}
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                              {idx + 1}
                            </span>
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate" data-testid={`text-search-query-${idx}`}>{item.query}</p>
                          </div>
                          <p className="text-xs text-muted-foreground text-right whitespace-nowrap" data-testid={`text-search-time-${idx}`}>
                            {item.lastSearched
                              ? new Date(item.lastSearched).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                              : "—"}
                          </p>
                          <div className="flex items-center justify-end">
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold font-mono"
                              data-testid={`badge-search-count-${idx}`}
                            >
                              👁 {Number(item.count).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })() : (
                <div className="text-center py-8 text-muted-foreground text-sm">अभी कोई सर्च डेटा नहीं है।</div>
              )}
            </div>
          </TabsContent>

          {/* ── IMPORT TAB ── */}
          <TabsContent value="import" className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-slate-900 dark:text-white">Bulk Contact Import</h3>
                  <p className="text-xs text-muted-foreground">Excel / CSV file se contacts import karein → Co-admin verify karega</p>
                </div>
              </div>

              {/* Step 1: File Upload */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Step 1: Excel / CSV File Select Karein</Label>
                <div
                  className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => document.getElementById("import-file-input")?.click()}
                  data-testid="drop-zone-import"
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">{importFile ? importFile.name : "Click to select file"}</p>
                  <p className="text-xs text-muted-foreground mt-1">.xlsx ya .csv — max 50MB</p>
                  {importFile && (
                    <p className="text-xs text-emerald-600 mt-1 font-medium">✓ {(importFile.size / 1024 / 1024).toFixed(1)} MB selected</p>
                  )}
                </div>
                <input
                  id="import-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                  data-testid="input-import-file"
                />
              </div>

              {/* Column Preview */}
              {importPreview.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Detected Columns:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {importPreview.map((col, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md font-mono">{col}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Column Mapping */}
              {importFile && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Step 2: Column Select Karein</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Name Column</Label>
                      {importPreview.length > 0 ? (
                        <Select value={importNameCol} onValueChange={setImportNameCol}>
                          <SelectTrigger className="h-9 text-sm" data-testid="select-import-name-col">
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent>
                            {importPreview.map(col => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={importNameCol} onChange={e => setImportNameCol(e.target.value)} placeholder="e.g. Name" className="h-9 text-sm" data-testid="input-import-name-col" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Mobile Column</Label>
                      {importPreview.length > 0 ? (
                        <Select value={importMobileCol} onValueChange={setImportMobileCol}>
                          <SelectTrigger className="h-9 text-sm" data-testid="select-import-mobile-col">
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent>
                            {importPreview.map(col => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={importMobileCol} onChange={e => setImportMobileCol(e.target.value)} placeholder="e.g. Mobile number" className="h-9 text-sm" data-testid="input-import-mobile-col" />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Allow Duplicate Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">Duplicate Entry Allow Karein</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">ON hone par already existing mobile numbers bhi import ho jayenge</p>
                </div>
                <button
                  type="button"
                  onClick={() => setImportAllowDuplicate(v => !v)}
                  data-testid="toggle-import-allow-duplicate"
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${importAllowDuplicate ? "bg-orange-500" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${importAllowDuplicate ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>

              {/* Import Button */}
              <Button
                className="w-full h-11 text-sm font-semibold gap-2"
                onClick={handleImport}
                disabled={!importFile || importLoading}
                data-testid="button-start-import"
              >
                {importLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Import ho raha hai... (2 lakh records mein ~2-3 min lag sakte hain)
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Import Start Karein
                  </>
                )}
              </Button>

              {/* Results */}
              {importResult && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-3">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">Import Complete!</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                      <p className="text-xl font-extrabold text-foreground">{importResult.total.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Total Rows</p>
                    </div>
                    <div className="text-center p-3 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl">
                      <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">{importResult.imported.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Imported ✓</p>
                    </div>
                    <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/30 rounded-xl">
                      <p className="text-xl font-extrabold text-orange-700 dark:text-orange-300">{importResult.skipped.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">Duplicates Skip</p>
                    </div>
                    <div className="text-center p-3 bg-red-50 dark:bg-red-950/30 rounded-xl">
                      <p className="text-xl font-extrabold text-red-700 dark:text-red-300">{(importResult.skippedNoMobile || 0).toLocaleString("en-IN")}</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">No Mobile Skip</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Ab Co-admin Verify Dashboard pe jaake <strong>Call → Fill Service+Address → Approve</strong> kare
                  </p>
                </div>
              )}

              {/* Backfill existing providers missing mobileNumbers */}
              <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-2">
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Fix: Purane Providers ka Mobile Number Restore Karein</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Jo providers pehle import/approve hue aur unka call number missing tha — unhe profile mobile se automatically fix karo.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300"
                  data-testid="button-backfill-mobile-numbers"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/admin/backfill-provider-mobile-numbers", { method: "POST", credentials: "include" });
                      const d = await res.json();
                      if (!res.ok) throw new Error(d.message || "Backfill failed");
                      toast({ title: `✅ ${d.updated} providers ke mobile numbers fix ho gaye` });
                    } catch (err: any) {
                      toast({ title: err.message || "Backfill failed", variant: "destructive" });
                    }
                  }}
                >
                  Fix Missing Mobile Numbers
                </Button>
              </div>

              {/* Cleanup */}
              <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-3 space-y-2">
                <p className="text-xs font-semibold text-red-800 dark:text-red-300">Cleanup: Delete No-Mobile Records</p>
                <p className="text-xs text-red-600 dark:text-red-400">Jo records mein mobile number nahi hai, unhe delete karo (kisi kaam ke nahi).</p>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full h-8 text-xs"
                  disabled={cleanupLoading}
                  data-testid="button-cleanup-no-mobile"
                  onClick={async () => {
                    if (!window.confirm("No-mobile records delete karoge? Yeh action undo nahi hogi.")) return;
                    setCleanupLoading(true);
                    try {
                      const res = await fetch("/api/admin/cleanup-no-mobile", { method: "DELETE", credentials: "include" });
                      const d = await res.json();
                      toast({ title: `${d.deleted} records delete ho gaye (no mobile)` });
                    } catch {
                      toast({ title: "Cleanup failed", variant: "destructive" });
                    } finally {
                      setCleanupLoading(false);
                    }
                  }}
                >
                  {cleanupLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Delete No-Mobile Records
                </Button>
              </div>

              {/* Assign Groups Section */}
              <div className="bg-purple-50 dark:bg-purple-950/30 rounded-xl p-4 space-y-3 border border-purple-200 dark:border-purple-900/50">
                <div>
                  <p className="font-semibold text-sm text-purple-900 dark:text-purple-200">🔀 Co-Admin Groups Assign Karein</p>
                  <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">
                    Pending providers ko groups mein divide karo — har co-admin apna group filter karke kaam kare.
                  </p>
                </div>

                {/* Mode Toggle */}
                <div className="flex gap-1 bg-purple-100 dark:bg-purple-900/50 rounded-lg p-1">
                  <button
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${groupAssignMode === "fixed" ? "bg-purple-600 text-white shadow-sm" : "text-purple-700 dark:text-purple-300"}`}
                    onClick={() => setGroupAssignMode("fixed")}
                    data-testid="group-mode-fixed"
                  >
                    📦 Fixed Size (10k + 10k + 10k + Rest)
                  </button>
                  <button
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${groupAssignMode === "equal" ? "bg-purple-600 text-white shadow-sm" : "text-purple-700 dark:text-purple-300"}`}
                    onClick={() => setGroupAssignMode("equal")}
                    data-testid="group-mode-equal"
                  >
                    🔀 Equal Groups (A/B/C...)
                  </button>
                </div>

                {/* Fixed Size Mode */}
                {groupAssignMode === "fixed" && (
                  <div className="space-y-2">
                    <p className="text-xs text-purple-600 dark:text-purple-400">
                      Pehle <strong>{groupSize.toLocaleString()}</strong> → Group A, agli <strong>{groupSize.toLocaleString()}</strong> → Group B,
                      agli <strong>{groupSize.toLocaleString()}</strong> → Group C, baaki sab → Group D
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-purple-800 dark:text-purple-300 shrink-0">Har group mein:</label>
                      <input
                        type="number"
                        min={1}
                        max={1000000}
                        step={1000}
                        value={groupSize}
                        onChange={e => setGroupSize(Math.max(1, Math.min(1000000, parseInt(e.target.value) || 10000)))}
                        className="w-28 h-8 px-2 text-sm border border-purple-300 dark:border-purple-700 rounded-md bg-white dark:bg-purple-950 text-purple-900 dark:text-purple-100 font-mono"
                        data-testid="input-group-size"
                      />
                      <span className="text-xs text-purple-600 dark:text-purple-400">providers</span>
                    </div>
                  </div>
                )}

                {/* Equal Groups Mode */}
                {groupAssignMode === "equal" && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-purple-800 dark:text-purple-300 shrink-0">Groups ki Sankhya:</label>
                    <div className="flex items-center gap-2">
                      <button
                        className="w-7 h-7 rounded-full bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100 font-bold text-sm flex items-center justify-center"
                        onClick={() => setNumGroups(n => Math.max(2, n - 1))}
                      >−</button>
                      <span className="text-xl font-bold text-purple-900 dark:text-purple-100 w-8 text-center">{numGroups}</span>
                      <button
                        className="w-7 h-7 rounded-full bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100 font-bold text-sm flex items-center justify-center"
                        onClick={() => setNumGroups(n => Math.min(26, n + 1))}
                      >+</button>
                      <span className="text-xs text-purple-600 dark:text-purple-400">(Group {['A','B','C','D','E','F','G','H'].slice(0,numGroups).join(', ')}...)</span>
                    </div>
                  </div>
                )}

                <Button
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-2 w-full"
                  disabled={assignGroupsLoading}
                  data-testid="button-assign-groups"
                  onClick={async () => {
                    const msg = groupAssignMode === "fixed"
                      ? `Pending providers ko fixed size groups mein divide karein? (A=${groupSize.toLocaleString()}, B=${groupSize.toLocaleString()}, C=${groupSize.toLocaleString()}, D=rest) — Purane groups overwrite honge.`
                      : `Sabhi pending providers ko ${numGroups} equal groups mein randomly divide karein? Purane groups overwrite honge.`;
                    if (!confirm(msg)) return;
                    setAssignGroupsLoading(true);
                    setAssignGroupsResult(null);
                    try {
                      const body = groupAssignMode === "fixed"
                        ? { groupSize }
                        : { numGroups };
                      const res = await fetch("/api/admin/assign-groups", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(body),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.message || "Failed");
                      setAssignGroupsResult(data);
                      toast({ title: `✓ ${data.assigned} providers groups mein divide kiye!` });
                    } catch (err: any) {
                      toast({ title: err.message || "Failed to assign groups", variant: "destructive" });
                    } finally {
                      setAssignGroupsLoading(false);
                    }
                  }}
                >
                  {assignGroupsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (groupAssignMode === "fixed" ? "📦" : "🔀")}
                  {assignGroupsLoading ? "Groups assign ho raha hai..." : (groupAssignMode === "fixed" ? "A/B/C/D Groups Assign Karein" : `${numGroups} Equal Groups Assign Karein`)}
                </Button>
                {assignGroupsResult && (
                  <div className="bg-white dark:bg-purple-950 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-purple-800 dark:text-purple-300">✓ {assignGroupsResult.assigned} providers assign kiye</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(assignGroupsResult.groups).map(([label, cnt]) => (
                        <div key={label} className="flex items-center gap-1 bg-purple-100 dark:bg-purple-900/50 rounded-full px-3 py-1">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">{label}</span>
                          <span className="text-xs font-medium text-purple-800 dark:text-purple-300">{cnt.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-purple-600 dark:text-purple-400">Ab co-admin verify dashboard pe jaake apna group (A/B/C/D) filter karke kaam kare</p>
                  </div>
                )}
              </div>

              {/* Workflow Explanation */}
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 space-y-2 border border-blue-100 dark:border-blue-900/50">
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Import ke baad ka workflow:</p>
                <ol className="text-xs text-blue-700 dark:text-blue-400 space-y-1.5 list-decimal list-inside">
                  <li>Import hone ke baad sab contacts <strong>Pending</strong> status mein aate hain</li>
                  <li>Co-admin (<strong>/verify/dashboard</strong>) pe jaata hai</li>
                  <li>Contact ko <strong>Call karta hai</strong> — Mitrify ke baare mein batata hai</li>
                  <li>Agar ready hai → <strong>Edit button</strong> se Service Name + Address fill karta hai</li>
                  <li><strong>Approve</strong> click karte hi provider <strong>LIVE</strong> ho jaata hai</li>
                  <li>Interested nahi → <strong>Reject</strong></li>
                </ol>
              </div>
            </div>

            {/* ── FETCH FROM GOOGLE PLACES ── */}
            <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800/40 rounded-2xl p-5 space-y-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <span className="text-lg">🌐</span>
                </div>
                <div>
                  <h3 className="font-semibold text-base text-slate-900 dark:text-white">Fetch from Google Places</h3>
                  <p className="text-xs text-muted-foreground">City + Work daalo → Google se businesses fetch hokar pending providers mein add ho jayenge</p>
                </div>
              </div>

              {/* Step 1: Co-admin */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Step 1: Co-Admin Choose Karein</Label>
                <Select value={gpAssignTo} onValueChange={setGpAssignTo}>
                  <SelectTrigger className="h-9 text-sm" data-testid="select-gp-assign-to">
                    <SelectValue placeholder="Co-admin select karein..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_default">— Co-admin select karein —</SelectItem>
                    {coAdminsList.map(ca => (
                      <SelectItem key={ca.id} value={ca.username}>{ca.username} ({ca.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Step 2: City + Service */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Step 2: City <span className="text-destructive">*</span></Label>
                  <Input
                    value={gpCity}
                    onChange={e => setGpCity(e.target.value)}
                    placeholder="e.g. Jaipur, Mumbai, Delhi"
                    className="h-9 text-sm"
                    data-testid="input-gp-city"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Step 3: Work / Service <span className="text-destructive">*</span></Label>
                  <Input
                    value={gpService}
                    onChange={e => setGpService(e.target.value)}
                    placeholder="e.g. plumber, electrician, AC repair"
                    className="h-9 text-sm"
                    data-testid="input-gp-service"
                  />
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Har click pe ~40 businesses milte hain • Daily limit: 2000 runs/admin
                {gpRateInfo && ` • Aaj: ${gpRateInfo.runsToday}/${gpRateInfo.max} use ho chuke`}
              </p>

              {/* Cost preview — helps prevent accidental Google Places API spend */}
              {(() => {
                const perFetchCost = GOOGLE_PLACES_CALLS_PER_FETCH * GOOGLE_PLACES_USD_PER_CALL;
                const todayCalls = (gpRateInfo?.runsToday ?? 0) * GOOGLE_PLACES_CALLS_PER_FETCH;
                const todayCost = todayCalls * GOOGLE_PLACES_USD_PER_CALL;
                return (
                  <div
                    className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-900/20 px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]"
                    data-testid="panel-gp-cost-estimate"
                  >
                    <span className="text-amber-800 dark:text-amber-200">
                      Is fetch ka estimate: <strong data-testid="text-gp-cost-per-fetch">~{GOOGLE_PLACES_CALLS_PER_FETCH} API calls · ${perFetchCost.toFixed(3)}</strong>
                    </span>
                    {gpRateInfo && gpRateInfo.runsToday > 0 && (
                      <span
                        className="text-amber-700 dark:text-amber-300 font-mono shrink-0"
                        data-testid="text-gp-cost-today"
                      >
                        Aaj total: {todayCalls} calls · ${todayCost.toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Search / Stop Buttons */}
              {!gpSearching ? (
                <Button
                  className="w-full h-11 text-sm font-semibold gap-2 bg-blue-500 hover:bg-blue-600 text-white"
                  onClick={handleGooglePlacesSearch}
                  disabled={!gpCity.trim() || !gpService.trim()}
                  data-testid="button-gp-search"
                >
                  <Search className="w-4 h-4" />Google se 40 businesses fetch karein
                </Button>
              ) : (
                <Button
                  className="w-full h-11 text-sm font-semibold gap-2 bg-red-500 hover:bg-red-600 text-white"
                  onClick={handleGooglePlacesCancel}
                  disabled={gpCancelRequested}
                  data-testid="button-gp-stop"
                >
                  {gpCancelRequested ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Stopping…</>
                  ) : (
                    <>⏹ Stop fetch ({gpProgress?.unique ?? 0} so far)</>
                  )}
                </Button>
              )}

              {/* Live progress bar */}
              {gpProgress && (
                <div className="rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/30 p-3 space-y-2" data-testid="panel-gp-progress">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-blue-800 dark:text-blue-200">
                      {gpProgress.done ? (gpProgress.cancelled ? "🛑 Stopped" : gpProgress.error ? "❌ Failed" : "✓ Complete") : "🔄 Fetching…"}
                    </span>
                    <span className="font-mono text-blue-700 dark:text-blue-300" data-testid="text-gp-progress">
                      {gpProgress.unique.toLocaleString("en-IN")} / {gpProgress.target.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-blue-100 dark:bg-blue-900/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, (gpProgress.unique / Math.max(1, gpProgress.target)) * 100)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-blue-700 dark:text-blue-300">
                    <div><span className="text-muted-foreground">Total fetched:</span> <span className="font-mono">{gpProgress.fetched.toLocaleString("en-IN")}</span></div>
                    <div><span className="text-muted-foreground">Unique:</span> <span className="font-mono">{gpProgress.unique.toLocaleString("en-IN")}</span></div>
                    <div><span className="text-muted-foreground">Duplicates:</span> <span className="font-mono">{gpProgress.duplicates.toLocaleString("en-IN")}</span></div>
                    <div><span className="text-muted-foreground">API calls:</span> <span className="font-mono">{gpProgress.apiCalls}</span></div>
                  </div>
                  {gpProgress.error && (
                    <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">⚠ {gpProgress.error}</p>
                  )}
                </div>
              )}

              {/* Post-run summary card — separate from the live progress
                  panel so the admin gets a final, scannable breakdown. */}
              {gpProgress && gpProgress.done && (
                <div className={`rounded-xl p-4 border ${
                  gpProgress.error
                    ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40"
                    : gpProgress.cancelled
                      ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40"
                      : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40"
                }`} data-testid="card-gp-summary">
                  <p className="text-xs font-semibold mb-3">
                    {gpProgress.error
                      ? "❌ Fetch summary (failed — partial results)"
                      : gpProgress.cancelled
                        ? "🛑 Fetch summary (stopped)"
                        : "✓ Fetch summary"}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-2 text-center">
                      <p className="text-muted-foreground text-[10px]">Total fetched</p>
                      <p className="text-lg font-bold font-mono">{gpProgress.fetched.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-2 text-center">
                      <p className="text-muted-foreground text-[10px]">Unique kept</p>
                      <p className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-300">{gpProgress.unique.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-2 text-center">
                      <p className="text-muted-foreground text-[10px]">Duplicates</p>
                      <p className="text-lg font-bold font-mono text-orange-700 dark:text-orange-300">{gpProgress.duplicates.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-2 text-center">
                      <p className="text-muted-foreground text-[10px]">API calls</p>
                      <p className="text-lg font-bold font-mono">{gpProgress.apiCalls}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-2 text-center">
                      <p className="text-muted-foreground text-[10px]">Time</p>
                      <p className="text-lg font-bold font-mono">{Math.round(((gpProgress.finishedAt || Date.now()) - gpProgress.startedAt) / 1000)}s</p>
                    </div>
                  </div>
                  {gpProgress.error && gpProgress.unique > 0 && (
                    <p className="text-[11px] text-red-700 dark:text-red-300 mt-3 font-medium">
                      ⚠ Partial results import ho sakte hain — neeche se select karke "Import" press karein
                    </p>
                  )}
                </div>
              )}

              {/* ── Run history (last 10) — click to copy city + service back
                  into the inputs for instant replay. Counts-only, no places. */}
              {gpRuns && gpRuns.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-3 space-y-2" data-testid="panel-gp-history">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">📜 Last {gpRuns.length} runs (click to re-fill)</p>
                    <span className="text-[10px] text-muted-foreground">Audit log — counts only</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                    {gpRuns.map(r => {
                      const dt = new Date(r.startedAt);
                      const when = dt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
                      const status = r.error ? "❌" : r.cancelled ? "🛑" : "✓";
                      return (
                        <button
                          type="button"
                          key={r.id}
                          onClick={() => {
                            setGpCity(r.city);
                            setGpService(r.service);
                            toast({ title: `Filled: ${r.city} • ${r.service}`, description: "Search dabakar dobara run karein" });
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors flex items-start justify-between gap-2"
                          data-testid={`button-gp-run-${r.id}`}
                          title={r.error || (r.cancelled ? `Stopped${r.stoppedBy ? ` by ${r.stoppedBy}` : ""}` : "Completed")}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900 dark:text-white truncate">
                              <span className="mr-1">{status}</span>{r.city} • {r.service}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                              {when} • {r.uniqueCount}/{r.target} unique • {r.dupSkipped} dup • {r.apiCalls} API • {Math.round(r.durationMs / 1000)}s
                              {r.cancelled && r.stoppedBy ? ` • by ${r.stoppedBy}` : ""}
                            </p>
                            {r.error && (
                              <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5 truncate">⚠ {r.error}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!gpSearching && gpResults.length === 0 && (gpCity || gpService) && gpImportResult === null && !gpProgress && (
                <p className="text-xs text-center text-muted-foreground py-4" data-testid="text-gp-empty-hint">
                  Search dabakar businesses fetch karein
                </p>
              )}

              {/* Results */}
              {gpResults.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      {gpResults.length} businesses mile — {gpSelected.size} selected
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setGpSelected(new Set(gpResults.map(p => p.placeId)))}
                        className="text-xs text-blue-600 hover:underline"
                        data-testid="button-gp-select-all"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setGpSelected(new Set())}
                        className="text-xs text-slate-600 hover:underline"
                        data-testid="button-gp-deselect-all"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Add 20 More — appends the next Google page to the
                      existing list without losing current selection. */}
                  {!gpSearching && (
                    <Button
                      variant="outline"
                      className="w-full h-10 text-sm gap-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                      onClick={handleGoogleAddMore}
                      disabled={gpFetchingMore || !gpNextPageToken}
                      data-testid="button-gp-add-more"
                    >
                      {gpFetchingMore ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Aur 40 fetch ho rahe hain…</>
                      ) : gpNextPageToken ? (
                        <>+ Google se aur 40 add karein</>
                      ) : (
                        <>Google ke paas aur results nahi hain</>
                      )}
                    </Button>
                  )}

                  {/*
                    Lazy render: 6000 DOM rows with hover transitions would
                    hang the UI on initial mount. Slice to gpDisplayLimit and
                    let the admin reveal more in chunks of 500.
                  */}
                  <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                    {gpResults.slice(0, gpDisplayLimit).map(p => (
                      <label
                        key={p.placeId}
                        className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${gpSelected.has(p.placeId) ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                        data-testid={`row-gp-place-${p.placeId}`}
                      >
                        <input
                          type="checkbox"
                          checked={gpSelected.has(p.placeId)}
                          onChange={() => toggleGpPlace(p.placeId)}
                          className="mt-1 w-4 h-4 accent-blue-500"
                          data-testid={`checkbox-gp-place-${p.placeId}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
                            {p.rating !== null && (
                              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0">
                                ⭐ {p.rating.toFixed(1)} {p.ratingCount ? `(${p.ratingCount})` : ""}
                              </span>
                            )}
                          </div>
                          {p.phone ? (
                            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">📞 {p.phone}</p>
                          ) : (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">⚠ No phone number</p>
                          )}
                          {p.address && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">📍 {p.address}</p>
                          )}
                          {p.latitude !== null && p.longitude !== null && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                              {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>

                  {gpResults.length > gpDisplayLimit && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 h-9 text-sm"
                        onClick={() => setGpDisplayLimit(n => n + 500)}
                        data-testid="button-gp-show-more"
                      >
                        + Aur 500 dikhayein ({(gpResults.length - gpDisplayLimit).toLocaleString("en-IN")} hidden)
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 h-9 text-sm"
                        onClick={() => setGpDisplayLimit(gpResults.length)}
                        data-testid="button-gp-show-all"
                      >
                        Saare {gpResults.length.toLocaleString("en-IN")} dikhayein
                      </Button>
                    </div>
                  )}

                  {/* Allow Duplicate */}
                  <div className="flex items-center justify-between rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Duplicate Allow Karein</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">ON hone par already existing mobile numbers bhi import ho jayenge</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGpAllowDuplicate(v => !v)}
                      data-testid="toggle-gp-allow-duplicate"
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${gpAllowDuplicate ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${gpAllowDuplicate ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>

                  {/* Auto-Approve (Direct Live) */}
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Direct Live Karein ⚡</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">ON hone par import ke saath hi providers live ho jayenge — verify dashboard skip</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGpAutoApprove(v => !v)}
                      data-testid="toggle-gp-auto-approve"
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${gpAutoApprove ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${gpAutoApprove ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>

                  {/* Import Button */}
                  <Button
                    className="w-full h-11 text-sm font-semibold gap-2 bg-emerald-500 hover:bg-emerald-600 text-white"
                    onClick={handleGooglePlacesImport}
                    disabled={gpImporting || gpSelected.size === 0 || !gpAssignTo || gpAssignTo === "_default"}
                    data-testid="button-gp-import"
                  >
                    {gpImporting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Import ho raha hai...</>
                    ) : (
                      <><Upload className="w-4 h-4" />{gpSelected.size} Businesses Import Karein</>
                    )}
                  </Button>
                </div>
              )}

              {/* Import Result */}
              {gpImportResult && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 border border-emerald-100 dark:border-emerald-900/50">
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-3">🌐 Google Places Import Result:</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-xl font-extrabold text-foreground">{gpImportResult.total}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">Imported</p>
                      <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">{gpImportResult.imported}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">Skipped (dup)</p>
                      <p className="text-xl font-extrabold text-orange-700 dark:text-orange-300">{gpImportResult.skipped}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">No Phone</p>
                      <p className="text-xl font-extrabold text-red-700 dark:text-red-300">{gpImportResult.skippedNoMobile}</p>
                    </div>
                  </div>
                  {gpImportResult.approved !== undefined && gpImportResult.approved > 0 && (
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mt-2.5">⚡ {gpImportResult.approved} providers directly LIVE ho gaye!</p>
                  )}
                  {gpAssignTo !== "_default" && gpImportResult.approved === 0 && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2.5">Assigned to: <strong>{gpAssignTo}</strong> — verify dashboard mein "Google" badge ke saath dikhenge</p>
                  )}
                </div>
              )}
            </div>

            {/* ── META ADS LEAD IMPORT ── */}
            <div className="bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-800/40 rounded-2xl p-5 space-y-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                  <span className="text-lg">📣</span>
                </div>
                <div>
                  <h3 className="font-semibold text-base text-slate-900 dark:text-white">Meta Ads Lead Import</h3>
                  <p className="text-xs text-muted-foreground">Meta Ads Manager CSV/Excel leads → specific co-admin ko assign karein (no A/B/C/D group)</p>
                </div>
              </div>

              {/* Step 1: Co-admin Select */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Step 1: Co-Admin Choose Karein</Label>
                <Select value={metaAssignTo} onValueChange={setMetaAssignTo}>
                  <SelectTrigger className="h-9 text-sm" data-testid="select-meta-assign-to">
                    <SelectValue placeholder="Co-admin select karein..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_default">— Co-admin select karein —</SelectItem>
                    {coAdminsList.map(ca => (
                      <SelectItem key={ca.id} value={ca.username}>{ca.username} ({ca.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Step 2: File Upload */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Step 2: Meta Leads CSV / Excel File Select Karein</Label>
                <div
                  className="border-2 border-dashed border-orange-200 dark:border-orange-800/40 rounded-xl p-6 text-center cursor-pointer hover:border-orange-400/60 transition-colors"
                  onClick={() => document.getElementById("meta-import-file-input")?.click()}
                  data-testid="drop-zone-meta-import"
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-orange-400" />
                  <p className="text-sm font-medium text-foreground">{metaFile ? metaFile.name : "Click to select file"}</p>
                  <p className="text-xs text-muted-foreground mt-1">.xlsx ya .csv — max 50MB</p>
                  {metaFile && (
                    <p className="text-xs text-orange-600 mt-1 font-medium">✓ {(metaFile.size / 1024 / 1024).toFixed(1)} MB selected</p>
                  )}
                </div>
                <input
                  id="meta-import-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleMetaFileChange}
                  data-testid="input-meta-import-file"
                />
              </div>

              {/* Column Preview */}
              {metaPreview.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Detected Columns:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {metaPreview.map((col, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md font-mono">{col}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Column Mapping */}
              {metaFile && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Step 3: Columns Map Karein</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Name Column <span className="text-destructive">*</span></Label>
                      {metaPreview.length > 0 ? (
                        <Select value={metaNameCol} onValueChange={setMetaNameCol}>
                          <SelectTrigger className="h-9 text-sm" data-testid="select-meta-name-col">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {metaPreview.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={metaNameCol} onChange={e => setMetaNameCol(e.target.value)} placeholder="e.g. Name" className="h-9 text-sm" data-testid="input-meta-name-col" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Mobile Column <span className="text-destructive">*</span></Label>
                      {metaPreview.length > 0 ? (
                        <Select value={metaMobileCol} onValueChange={setMetaMobileCol}>
                          <SelectTrigger className="h-9 text-sm" data-testid="select-meta-mobile-col">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {metaPreview.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={metaMobileCol} onChange={e => setMetaMobileCol(e.target.value)} placeholder="e.g. Mobile number" className="h-9 text-sm" data-testid="input-meta-mobile-col" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Service / Kaam Column <span className="text-muted-foreground">(optional)</span></Label>
                      {metaPreview.length > 0 ? (
                        <Select value={metaServiceCol || "_none"} onValueChange={v => setMetaServiceCol(v === "_none" ? "" : v)}>
                          <SelectTrigger className="h-9 text-sm" data-testid="select-meta-service-col">
                            <SelectValue placeholder="— None —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">— None —</SelectItem>
                            {metaPreview.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={metaServiceCol} onChange={e => setMetaServiceCol(e.target.value)} placeholder="e.g. Work" className="h-9 text-sm" data-testid="input-meta-service-col" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Address Column <span className="text-muted-foreground">(optional)</span></Label>
                      {metaPreview.length > 0 ? (
                        <Select value={metaAddressCol || "_none"} onValueChange={v => setMetaAddressCol(v === "_none" ? "" : v)}>
                          <SelectTrigger className="h-9 text-sm" data-testid="select-meta-address-col">
                            <SelectValue placeholder="— None —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">— None —</SelectItem>
                            {metaPreview.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={metaAddressCol} onChange={e => setMetaAddressCol(e.target.value)} placeholder="e.g. Address" className="h-9 text-sm" data-testid="input-meta-address-col" />
                      )}
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Description Column <span className="text-muted-foreground">(optional)</span></Label>
                      {metaPreview.length > 0 ? (
                        <Select value={metaDescriptionCol || "_none"} onValueChange={v => setMetaDescriptionCol(v === "_none" ? "" : v)}>
                          <SelectTrigger className="h-9 text-sm" data-testid="select-meta-description-col">
                            <SelectValue placeholder="— None —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">— None —</SelectItem>
                            {metaPreview.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={metaDescriptionCol} onChange={e => setMetaDescriptionCol(e.target.value)} placeholder="e.g. discription" className="h-9 text-sm" data-testid="input-meta-description-col" />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Allow Duplicate Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">Duplicate Entry Allow Karein</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">ON hone par already existing mobile numbers bhi import ho jayenge</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMetaAllowDuplicate(v => !v)}
                  data-testid="toggle-meta-allow-duplicate"
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${metaAllowDuplicate ? "bg-orange-500" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${metaAllowDuplicate ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>

              {/* Import Button */}
              <Button
                className="w-full h-11 text-sm font-semibold gap-2 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleMetaImport}
                disabled={!metaFile || metaLoading || !metaAssignTo || metaAssignTo === "_default"}
                data-testid="button-meta-import"
              >
                {metaLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Meta Leads Import ho rahe hain...</>
                ) : (
                  <><Upload className="w-4 h-4" />Meta Leads Import Karein</>
                )}
              </Button>

              {/* Import Result */}
              {metaResult && (
                <div className="bg-orange-50 dark:bg-orange-950/30 rounded-xl p-4 border border-orange-100 dark:border-orange-900/50">
                  <p className="text-xs font-semibold text-orange-800 dark:text-orange-300 mb-3">📣 Meta Import Result:</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-xl font-extrabold text-foreground">{metaResult.total.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">Imported</p>
                      <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">{metaResult.imported.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">Skipped (dup)</p>
                      <p className="text-xl font-extrabold text-orange-700 dark:text-orange-300">{metaResult.skipped.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">No Mobile</p>
                      <p className="text-xl font-extrabold text-red-700 dark:text-red-300">{(metaResult.skippedNoMobile || 0).toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                  {metaAssignTo && metaAssignTo !== "_default" && (
                    <p className="text-xs text-orange-700 dark:text-orange-400 mt-2.5">Assigned to: <strong>{metaAssignTo}</strong> — verify dashboard mein "Meta" badge ke saath dikhenge</p>
                  )}
                </div>
              )}
            </div>

            {/* ── AUTO-GENERATE PROVIDER TAGS (Dictionary + Gemini AI) ── */}
            <AutoGenerateTagsCard />

            {/* ── BULK APPROVE META + GOOGLE LEADS (COMBINED) ── */}
            <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <span className="text-lg">✅</span>
                </div>
                <div>
                  <h3 className="font-semibold text-base text-slate-900 dark:text-white">Meta + Google Leads — Bulk Approve</h3>
                  <p className="text-xs text-muted-foreground">Saare pending Meta aur Google Places leads ek saath approve karein — verified leads directly live providers ban jayenge</p>
                </div>
              </div>

              <Button
                className="w-full h-11 text-sm font-semibold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleAllBulkApprove}
                disabled={metaBulkApproving || bulkPreflightLoading}
                data-testid="button-all-bulk-approve"
              >
                {metaBulkApproving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Approve ho rahe hain...</>
                ) : bulkPreflightLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Checking leads...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" />Saare Meta + Google Leads Approve Karein</>
                )}
              </Button>

              {metaBulkResult && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 border border-emerald-100 dark:border-emerald-900/50 space-y-2">
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">✅ Bulk Approve Result:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">Total Found</p>
                      <p className="text-xl font-extrabold text-foreground">{metaBulkResult.total}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">Approved</p>
                      <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">{metaBulkResult.approved}</p>
                    </div>
                  </div>
                  {metaBulkResult.noMobileApproved > 0 && (
                    <div className="flex flex-col gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-2.5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 dark:text-amber-300">
                          <span className="font-semibold">{metaBulkResult.noMobileApproved} approved providers</span> ke paas koi call number nahi hai — customers unhe reach nahi kar paayenge. Follow up karein.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
                        data-testid="button-view-no-mobile-providers"
                        onClick={() => { setProvFilter("recent_no_mobile"); setActiveTab("providers"); }}
                      >
                        <UserRoundSearch className="w-3.5 h-3.5" />
                        View These Providers
                      </Button>
                    </div>
                  )}
                  {metaBulkResult.errors.length > 0 && (
                    <p className="text-xs text-red-600 dark:text-red-400">{metaBulkResult.errors.length} errors huye — baaki approve ho gaye</p>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── CREDIT PURCHASE TAB ── */}
          <TabsContent value="creditpurchase" className="space-y-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/60 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">Credit Purchasers</h3>
                  <p className="text-xs text-muted-foreground">
                    {(allCredits || []).filter((c: any) => (c.purchasedCredits ?? 0) > 0).length} users ne credit kharida
                  </p>
                </div>
              </div>
              {(allCredits || []).filter((c: any) => (c.purchasedCredits ?? 0) > 0).length > 0 && (
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Total Revenue</p>
                  <p className="text-lg font-extrabold text-purple-700 dark:text-purple-300">
                    ₹{(allCredits || []).reduce((sum: number, c: any) => sum + (c.purchasedCredits ?? 0), 0)}
                  </p>
                </div>
              )}
            </div>
            {(allCredits || [])
              .filter((c: any) => (c.purchasedCredits ?? 0) > 0)
              .sort((a: any, b: any) => (b.purchasedCredits ?? 0) - (a.purchasedCredits ?? 0))
              .map((c: any, idx: number) => (
                <div
                  key={c.userId || idx}
                  className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm px-4 py-3"
                  data-testid={`credit-purchaser-${idx}`}
                >
                  <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/60 flex items-center justify-center flex-shrink-0 text-sm font-bold text-purple-700 dark:text-purple-300">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{c.profileName || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{c.mobile || "—"}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-purple-600 dark:text-purple-400 text-sm">₹{c.purchasedCredits}</p>
                    <p className="text-[10px] text-muted-foreground">Purchased</p>
                  </div>
                </div>
              ))}
            {(allCredits || []).filter((c: any) => (c.purchasedCredits ?? 0) > 0).length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                  <Coins className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="font-semibold text-slate-600 dark:text-slate-400">Abhi kisi ne credit purchase nahi kiya</p>
              </div>
            )}
          </TabsContent>

          {/* ── DUPLICATE ENTRY TAB ── */}
          <TabsContent value="duplicateentry" className="space-y-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/60 flex items-center justify-center">
                  <Copy className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">Duplicate Profiles</h3>
                  <p className="text-xs text-muted-foreground">
                    {duplicatesLoading ? "Load ho raha hai..." : `${(duplicateData || []).length} mobile numbers par duplicate accounts`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedDeleteIds.size > 0 && (
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white gap-1.5"
                    onClick={handleBulkDeleteDuplicates}
                    disabled={deletingDuplicates}
                    data-testid="button-delete-selected"
                  >
                    {deletingDuplicates ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete {selectedDeleteIds.size}
                  </Button>
                )}
                {(duplicateData || []).length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40 gap-1.5"
                    onClick={handleDeleteAllDuplicates}
                    disabled={deletingDuplicates}
                    data-testid="button-delete-all-duplicates"
                  >
                    {deletingDuplicates ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
                    All Duplicate Delete
                  </Button>
                )}
              </div>
            </div>
            {duplicatesLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!duplicatesLoading && (duplicateData || []).length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="font-semibold text-slate-600 dark:text-slate-400">Koi duplicate profile nahi mila!</p>
              </div>
            )}
            {(duplicateData || []).map((group: any) => (
              <div key={group.mobile} className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-bold text-sm tracking-wide">{group.mobile}</span>
                  </div>
                  <span className="text-xs bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 font-semibold px-2 py-0.5 rounded-full">
                    {group.count} profiles
                  </span>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                  {group.profiles.map((prof: any, idx: number) => {
                    const isChecked = selectedDeleteIds.has(prof.userId);
                    const isBest = idx === 0;
                    return (
                      <div
                        key={prof.userId}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${isChecked ? "bg-red-50 dark:bg-red-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
                        onClick={() => {
                          setSelectedDeleteIds(prev => {
                            const next = new Set(prev);
                            if (next.has(prof.userId)) next.delete(prof.userId);
                            else next.add(prof.userId);
                            return next;
                          });
                        }}
                        data-testid={`duplicate-profile-${prof.userId}`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${isBest ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300" : "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"}`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm">{prof.name || "—"}</span>
                            {isBest && (
                              <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <Star className="w-2.5 h-2.5" />Sabse zyada details
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${prof.role === "provider" ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"}`}>
                              {prof.role}
                            </span>
                            <span className="text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <Coins className="w-2.5 h-2.5" />{prof.totalCredits} cr
                            </span>
                            {prof.hasLocation && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5" />Location
                              </span>
                            )}
                          </div>
                          {prof.serviceName && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">🔧 {prof.serviceName}</p>}
                          {prof.address && <p className="text-[10px] text-muted-foreground truncate">📍 {prof.address}</p>}
                          {prof.description && <p className="text-[10px] text-muted-foreground truncate">📝 {prof.description}</p>}
                        </div>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-colors ${isChecked ? "bg-red-500 border-red-500" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"}`}>
                          {isChecked && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* ── SUBSCRIPTIONS / PLANS TAB ── */}
          <TabsContent value="subscriptions" className="space-y-3">
            <SubscriptionsAdminPanel />
          </TabsContent>

          {/* ── AI TAB ── */}
          <TabsContent value="ai" className="space-y-4">

            {/* ── Token Usage Chart ── */}
            <AiTokenUsageChart />

            <div className="bg-white dark:bg-slate-900 border border-fuchsia-200 dark:border-fuchsia-800/40 rounded-2xl p-5 space-y-4 shadow-sm">
              <h3 className="font-bold text-base flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-fuchsia-100 dark:bg-fuchsia-900/40 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-fuchsia-600 dark:text-fuchsia-400" />
                </div>
                AI Token Alert Threshold
              </h3>
              <p className="text-sm text-muted-foreground">
                Agar kisi ek ghante mein AI token usage is limit se zyada ho jaye, toh server console par warning log hogi.
                AI chat band nahi hoga — sirf alert milega.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="input-ai-threshold">Threshold (tokens per hour)</Label>
                <div className="flex gap-2">
                  <Input
                    id="input-ai-threshold"
                    type="number"
                    min={1000}
                    max={10000000}
                    step={1000}
                    value={aiThresholdInput}
                    onChange={e => setAiThresholdInput(e.target.value)}
                    className="rounded-xl flex-1"
                    placeholder="100000"
                    data-testid="input-ai-threshold"
                  />
                  <Button
                    onClick={() => saveAiConfig.mutate()}
                    disabled={saveAiConfig.isPending}
                    className="rounded-xl shrink-0"
                    data-testid="button-save-ai-threshold"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saveAiConfig.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
                {aiConfigData?.threshold !== undefined && (
                  <p className="text-xs text-muted-foreground" data-testid="text-ai-threshold-current">
                    Current: <span className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">{aiConfigData.threshold.toLocaleString()}</span> tokens/hr
                    {Number(process.env.AI_TOKEN_HOUR_THRESHOLD) > 0
                      ? ` (env default overridden)`
                      : ""}
                  </p>
                )}
              </div>
            </div>

            {/* ── Weekly AI Cost Report ── */}
            <div className="bg-white dark:bg-slate-900 border border-fuchsia-200 dark:border-fuchsia-800/40 rounded-2xl p-5 space-y-4 shadow-sm">
              <h3 className="font-bold text-base flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-fuchsia-100 dark:bg-fuchsia-900/40 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-fuchsia-600 dark:text-fuchsia-400" />
                </div>
                Weekly AI Cost Report
              </h3>
              <p className="text-sm text-muted-foreground">
                Ek email aayegi jisme 7 din ka token usage summary hoga — total tokens, peak hour, aur kitne ghante threshold cross ki. Neeche din aur time choose karo.
              </p>

              <div className="flex items-center gap-3">
                <Switch
                  id="switch-weekly-report-enabled"
                  checked={weeklyReportEnabled}
                  onCheckedChange={setWeeklyReportEnabled}
                  data-testid="switch-weekly-report-enabled"
                />
                <Label htmlFor="switch-weekly-report-enabled" className="cursor-pointer">
                  {weeklyReportEnabled ? "Weekly report enabled" : "Weekly report disabled"}
                </Label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="select-weekly-report-day">Send Day (IST)</Label>
                  <Select
                    value={String(weeklyReportDay)}
                    onValueChange={v => setWeeklyReportDay(Number(v))}
                  >
                    <SelectTrigger id="select-weekly-report-day" className="rounded-xl" data-testid="select-weekly-report-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sunday</SelectItem>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="select-weekly-report-hour">Send Time (IST)</Label>
                  <Select
                    value={String(weeklyReportHour)}
                    onValueChange={v => setWeeklyReportHour(Number(v))}
                  >
                    <SelectTrigger id="select-weekly-report-hour" className="rounded-xl" data-testid="select-weekly-report-hour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="input-weekly-report-email">Report recipient email</Label>
                <div className="flex gap-2">
                  <Input
                    id="input-weekly-report-email"
                    type="email"
                    value={weeklyReportEmail}
                    onChange={e => setWeeklyReportEmail(e.target.value)}
                    className="rounded-xl flex-1"
                    placeholder="admin@example.com"
                    data-testid="input-weekly-report-email"
                  />
                  <Button
                    onClick={() => saveWeeklyReport.mutate()}
                    disabled={saveWeeklyReport.isPending}
                    className="rounded-xl shrink-0"
                    data-testid="button-save-weekly-report"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saveWeeklyReport.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
                {weeklyReportCfg?.email && (
                  <p className="text-xs text-muted-foreground" data-testid="text-weekly-report-current">
                    Current:{" "}
                    <span className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">{weeklyReportCfg.email}</span>
                    {" · "}
                    <span className={weeklyReportCfg.enabled ? "text-green-600 dark:text-green-400" : "text-slate-500"}>
                      {weeklyReportCfg.enabled ? "Enabled" : "Disabled"}
                    </span>
                    {weeklyReportCfg.sendDay !== undefined && weeklyReportCfg.sendHour !== undefined && (
                      <>
                        {" · "}
                        <span className="text-slate-500">
                          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][weeklyReportCfg.sendDay]}{" "}
                          {weeklyReportCfg.sendHour === 0 ? "12:00 AM" : weeklyReportCfg.sendHour < 12 ? `${weeklyReportCfg.sendHour}:00 AM` : weeklyReportCfg.sendHour === 12 ? "12:00 PM" : `${weeklyReportCfg.sendHour - 12}:00 PM`} IST
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => sendReportNow.mutate()}
                disabled={sendReportNow.isPending || !weeklyReportCfg?.email}
                className="rounded-xl"
                data-testid="button-send-report-now"
              >
                <Mail className="w-4 h-4 mr-2" />
                {sendReportNow.isPending ? "Sending…" : "Send Report Now"}
              </Button>
            </div>

            {/* ── Report History ── */}
            <div className="bg-white dark:bg-slate-900 border border-fuchsia-200 dark:border-fuchsia-800/40 rounded-2xl p-5 space-y-3 shadow-sm" data-testid="card-ai-report-log">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Report Send History</p>
                  {/* Status filter */}
                  <div className="flex items-center gap-1" data-testid="report-log-status-filter">
                    {(["all", "sent", "failed"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setReportLogStatus(s)}
                        data-testid={`button-report-log-status-${s}`}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors capitalize ${reportLogStatus === s ? "bg-fuchsia-600 border-fuchsia-600 text-white" : "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-fuchsia-400 hover:text-fuchsia-600 dark:hover:text-fuchsia-400"}`}
                      >
                        {s === "all" ? "All" : s === "sent" ? "✓ Sent" : "✗ Failed"}
                      </button>
                    ))}
                  </div>
                  {/* Date range */}
                  <div className="flex items-center gap-1" data-testid="report-log-date-filter">
                    {(["all", "today", "week", "month"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setReportLogSince(d)}
                        data-testid={`button-report-log-since-${d}`}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${reportLogSince === d ? "bg-slate-700 dark:bg-slate-300 border-slate-700 dark:border-slate-300 text-white dark:text-slate-900" : "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                      >
                        {d === "all" ? "All time" : d === "today" ? "Today" : d === "week" ? "7 days" : "30 days"}
                      </button>
                    ))}
                  </div>
                  {/* Limit selector */}
                  <div className="flex items-center gap-1" data-testid="report-log-limit-selector">
                    {([20, 50, 100] as const).map((n) => (
                      <button
                        key={n}
                        onClick={() => setReportLogLimit(n)}
                        data-testid={`button-report-log-limit-${n}`}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${reportLogLimit === n ? "bg-fuchsia-600 border-fuchsia-600 text-white" : "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-fuchsia-400 hover:text-fuchsia-600 dark:hover:text-fuchsia-400"}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pruneLogConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-orange-600 dark:text-orange-400">Remove logs older than 90 days?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 text-xs px-2"
                        disabled={pruneReportLog.isPending}
                        onClick={() => pruneReportLog.mutate()}
                        data-testid="button-confirm-prune-report-log"
                      >
                        {pruneReportLog.isPending ? "Pruning…" : "Yes, prune"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        onClick={() => setPruneLogConfirm(false)}
                        data-testid="button-cancel-prune-report-log"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs px-2 text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                      onClick={() => { setPruneLogConfirm(true); setClearLogConfirm(false); }}
                      data-testid="button-prune-report-log"
                    >
                      Prune Old Logs
                    </Button>
                  )}
                  {aiReportLogData && aiReportLogData.length > 0 && !pruneLogConfirm && (
                    clearLogConfirm ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-600 dark:text-red-400">Clear all history?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 text-xs px-2"
                          disabled={clearReportLog.isPending}
                          onClick={() => clearReportLog.mutate()}
                          data-testid="button-confirm-clear-report-log"
                        >
                          {clearReportLog.isPending ? "Clearing…" : "Yes, clear"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs px-2"
                          onClick={() => setClearLogConfirm(false)}
                          data-testid="button-cancel-clear-report-log"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => setClearLogConfirm(true)}
                        data-testid="button-clear-report-log"
                      >
                        Clear History
                      </Button>
                    )
                  )}
                </div>
              </div>
              {!aiReportLogData || aiReportLogData.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2" data-testid="text-ai-report-log-empty">No reports sent yet.</p>
              ) : (
                <div className="space-y-2" data-testid="list-ai-report-log">
                  {aiReportLogData.map((entry) => (
                    <div
                      key={entry.id}
                      className={`rounded-xl border px-4 py-3 flex flex-col gap-1 ${entry.success ? "border-green-200 dark:border-green-800/40 bg-green-50/60 dark:bg-green-900/10" : "border-red-200 dark:border-red-800/40 bg-red-50/60 dark:bg-red-900/10"}`}
                      data-testid={`row-ai-report-log-${entry.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold ${entry.success ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {entry.success ? "✓ Sent" : "✗ Failed"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground" data-testid={`text-report-log-time-${entry.id}`}>
                            {new Date(entry.sentAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                          </span>
                          {deleteLogConfirmId === entry.id ? (
                            <span className="flex items-center gap-1">
                              <button
                                className="text-xs px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                                disabled={deleteReportLogEntry.isPending}
                                onClick={() => deleteReportLogEntry.mutate(entry)}
                                data-testid={`button-confirm-delete-log-${entry.id}`}
                              >
                                {deleteReportLogEntry.isPending ? "…" : "Delete"}
                              </button>
                              <button
                                className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                                onClick={() => setDeleteLogConfirmId(null)}
                                data-testid={`button-cancel-delete-log-${entry.id}`}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              className="text-muted-foreground hover:text-red-500 transition-colors p-0.5 rounded"
                              onClick={() => setDeleteLogConfirmId(entry.id)}
                              title="Delete this entry"
                              data-testid={`button-delete-log-${entry.id}`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                        <span data-testid={`text-report-log-recipient-${entry.id}`}>To: <span className="font-medium">{entry.recipient}</span></span>
                        {entry.success && (
                          <>
                            <span data-testid={`text-report-log-tokens-${entry.id}`}>{entry.totalTokens.toLocaleString()} tokens</span>
                            <span data-testid={`text-report-log-cost-${entry.id}`}>{entry.estimatedCost} est.</span>
                            {entry.exceededHours > 0 && (
                              <span className="text-amber-600 dark:text-amber-400" data-testid={`text-report-log-exceeded-${entry.id}`}>{entry.exceededHours}h exceeded threshold</span>
                            )}
                          </>
                        )}
                        {!entry.success && entry.errorMsg && (
                          <span className="text-red-600 dark:text-red-400 break-all" data-testid={`text-report-log-error-${entry.id}`}>{entry.errorMsg}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="bulkdelete" className="space-y-3">
            <BulkDeletePanel />
          </TabsContent>

          <TabsContent value="system" className="space-y-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-4 shadow-sm" data-testid="section-system-health">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Shield className="w-5 h-5 text-sky-600" />
                    System Health
                  </h2>
                  <p className="text-xs text-muted-foreground">Production env vars aur services ka status. Jo red hai, wo Railway mein set karo.</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => refetchSystemHealth()} data-testid="button-refresh-health">
                  <RotateCcw className="w-3 h-3 mr-1" /> Refresh
                </Button>
              </div>

              {systemHealthLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
              ) : systemHealth ? (
                <>
                  {/* Environment info */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-medium">
                      NODE_ENV: <code className="font-mono text-sky-700 dark:text-sky-300">{systemHealth.nodeEnv}</code>
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${systemHealth.cashfreeMode === "production" ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" : "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300"}`}>
                      Cashfree: <code className="font-mono">{systemHealth.cashfreeMode}</code>
                    </span>
                  </div>

                  {/* Services grid */}
                  <div className="space-y-2">
                    {Object.entries(systemHealth.services).map(([key, svc]) => (
                      <div key={key} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 border ${svc.ok ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"}`} data-testid={`status-service-${key}`}>
                        <span className="mt-0.5 flex-shrink-0">
                          {svc.ok ? <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" /> : <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold ${svc.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>{svc.label}</p>
                          {!svc.ok && svc.missing.length > 0 && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                              Missing: <code className="font-mono">{svc.missing.join(", ")}</code>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Google Console reminder */}
                  {systemHealth.services.google_oauth?.ok && (
                    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5 text-xs text-blue-800 dark:text-blue-200 space-y-1">
                      <p className="font-semibold flex items-center gap-1"><Key className="w-3.5 h-3.5" /> Google Console — Authorized Redirect URIs</p>
                      <p>Make sure these are added in <strong>Google Cloud Console → APIs → Credentials → OAuth Client → Authorized redirect URIs</strong>:</p>
                      <ul className="list-disc list-inside font-mono text-[10px] space-y-0.5 mt-1">
                        <li>https://mitrify.com/api/auth/google/callback</li>
                        <li>https://www.mitrify.com/api/auth/google/callback</li>
                        <li>https://mitrify-production.up.railway.app/api/auth/google/callback</li>
                      </ul>
                    </div>
                  )}

                  {/* GCS reminder */}
                  {!systemHealth.services.gcs_backup?.ok && (
                    <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 px-3 py-2.5 text-xs text-orange-800 dark:text-orange-200 space-y-1">
                      <p className="font-semibold flex items-center gap-1"><Cloud className="w-3.5 h-3.5" /> GCS Backup — Service Account Deleted</p>
                      <p>Google Cloud Console mein jaake naya service account banao:</p>
                      <ol className="list-decimal list-inside space-y-0.5 mt-1">
                        <li>IAM &amp; Admin → Service Accounts → Create</li>
                        <li>Storage Object Admin role do</li>
                        <li>JSON key download karo</li>
                        <li>Railway mein <code className="font-mono">GCS_SERVICE_ACCOUNT_KEY</code> mein paste karo</li>
                      </ol>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Health data load nahi hua. Refresh karo.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <AIChat isAdmin={true} />

      {/* ── CO-ADMIN PROFILE MODAL ── */}
      {selectedCoAdminId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => { setSelectedCoAdminId(null); setShowSalaryHistory(false); setVerifiedListStatus(null); }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* close button */}
            <button
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              onClick={() => { setSelectedCoAdminId(null); setShowSalaryHistory(false); setVerifiedListStatus(null); }}
              data-testid="button-close-coadmin-modal"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>

            {coAdminStatsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : coAdminStats ? (
              <div className="overflow-y-auto flex-1 px-5 pb-8">
                {/* Profile Header */}
                <div className="flex items-center gap-4 py-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shrink-0 ${avatarColor(coAdminStats.coAdmin.username)}`}>
                    {(coAdminStats.coAdmin.username || "?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold truncate">{coAdminStats.coAdmin.username}</h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={`text-xs px-2 py-0.5 ${coAdminStats.coAdmin.role === "testadmin" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                        <Award className="w-3 h-3 mr-1" />
                        {coAdminStats.coAdmin.role === "testadmin" ? "Verifier (Test Admin)" : "Data Entry (Co-Admin)"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>Joined: {coAdminStats.coAdmin.createdAt ? new Date(coAdminStats.coAdmin.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-slate-100 dark:bg-slate-800 mb-4" />

                {/* Stats Grid */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Performance Stats</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 text-center">
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{coAdminStats.stats.total}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">📋 Total Added</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-3 text-center">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{coAdminStats.stats.verifiedTotal ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">🔍 Total Verified</p>
                  </div>
                  <div
                    className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-3 text-center cursor-pointer ring-1 ring-transparent hover:ring-emerald-400 transition-all active:scale-95"
                    data-testid="card-approved-count"
                    onClick={() => setVerifiedListStatus("approved")}
                  >
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{coAdminStats.stats.approved}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">✅ Approved</p>
                    <p className="text-[10px] text-emerald-500 mt-0.5">Tap to see list →</p>
                  </div>
                  <div
                    className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-3 text-center cursor-pointer ring-1 ring-transparent hover:ring-red-400 transition-all active:scale-95"
                    data-testid="card-rejected-count"
                    onClick={() => setVerifiedListStatus("rejected")}
                  >
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{coAdminStats.stats.fake + coAdminStats.stats.rejected}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">❌ Rejected</p>
                    <p className="text-[10px] text-red-500 mt-0.5">Tap to see list →</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{coAdminStats.stats.pending}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">⏳ Pending</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{coAdminStats.stats.callCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">📞 Calls Made</p>
                  </div>
                </div>

                {/* ── SALARY SECTION ── */}
                {(() => {
                  const role = coAdminStats.coAdmin.role;
                  const cycleStart = coAdminStats.stats.cycleStartAt || coAdminStats.coAdmin.cycleStartAt;

                  // VERIFIER (testadmin): salary = only approved count × ₹3
                  // DATA ENTRY (coadmin): salary = entries they added that got approved × ₹3
                  const isVerifier = role === "testadmin";
                  const salaryCount = isVerifier
                    ? (coAdminStats.stats.cycleApproveCount ?? 0)
                    : (coAdminStats.stats.cycleApprovedEntries ?? 0);
                  const amount = salaryCount * 3;

                  return (
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <IndianRupee className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-sm font-bold text-amber-800 dark:text-amber-300">Current Salary Cycle</span>
                        </div>
                        {cycleStart && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            Since {new Date(cycleStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>

                      {/* Role-specific explanation */}
                      <div className="bg-white/60 dark:bg-white/5 rounded-xl px-3 py-2 mb-3 text-[11px] text-muted-foreground">
                        {isVerifier
                          ? "💡 Verifier salary: Sirf jinhe approve kiya × ₹3"
                          : "💡 Data Entry salary: Apne add kiye, jo approve hue × ₹3"}
                      </div>

                      {/* Single salary metric card */}
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-4 mb-3 text-center">
                        <p className="text-4xl font-black text-emerald-600 dark:text-emerald-400">{salaryCount}</p>
                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mt-1">
                          {isVerifier ? "✅ Approved (this cycle)" : "✅ Entries Approved (this cycle)"}
                        </p>
                      </div>

                      <div className="flex items-center justify-between bg-amber-600 dark:bg-amber-700 rounded-xl px-4 py-2.5 mb-3">
                        <span className="text-white text-sm font-medium">{salaryCount} × ₹3 =</span>
                        <span className="text-white text-xl font-bold">₹{amount}</span>
                      </div>

                      {/* Cross-check strip */}
                      <div className="bg-slate-100/80 dark:bg-slate-800/50 rounded-xl px-3 py-2 mb-3">
                        <p className="text-[10px] text-muted-foreground font-medium mb-1">📊 Cross-check (All-time DB):</p>
                        {isVerifier ? (
                          <p className="text-[10px] text-muted-foreground">
                            Total Approved (all-time): <span className="font-bold text-emerald-600">{coAdminStats.stats.approved}</span>
                            {" "}• Total Verified: <span className="font-bold text-purple-600">{coAdminStats.stats.verifiedTotal}</span>
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">
                            Total Added: <span className="font-bold">{coAdminStats.stats.total}</span>
                            {" "}• Approved (all-time): <span className="font-bold text-emerald-600">{coAdminStats.stats.approved}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                          disabled={markingPaid || amount === 0}
                          data-testid="button-mark-salary-paid"
                          onClick={async () => {
                            if (!confirm(`${coAdminStats.coAdmin.username} ko ₹${amount} salary paid mark karna chahte hain?\n(${salaryCount} × ₹3)\nCounter reset ho jayega.`)) return;
                            setMarkingPaid(true);
                            try {
                              const res = await fetch(`/api/admin/co-admins/${selectedCoAdminId}/mark-paid`, { method: "POST", credentials: "include" });
                              if (!res.ok) throw new Error("Failed");
                              await queryClient.invalidateQueries({ queryKey: ["/api/admin/co-admins", selectedCoAdminId, "stats"] });
                              await queryClient.invalidateQueries({ queryKey: ["/api/admin/co-admins", selectedCoAdminId, "salary-history"] });
                              toast({ title: `✅ ₹${amount} salary paid mark ho gayi! Counter reset.` });
                            } catch {
                              toast({ title: "Failed to mark paid", variant: "destructive" });
                            } finally {
                              setMarkingPaid(false);
                            }
                          }}
                        >
                          {markingPaid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          {amount > 0 ? `Paid ₹${amount}` : "Paid (₹0)"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-amber-300 text-amber-700 dark:text-amber-300 dark:border-amber-700 gap-1.5"
                          data-testid="button-salary-history"
                          onClick={() => { setShowSalaryHistory(true); refetchSalaryHistory(); }}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          History
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {/* Accuracy badge */}
                {coAdminStats.stats.total > 0 && (
                  <div className="flex items-center justify-between bg-gradient-to-r from-primary/10 to-primary/5 rounded-2xl px-4 py-3 mb-5">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Approval Rate</span>
                    </div>
                    <span className="text-sm font-bold text-primary">
                      {Math.round((coAdminStats.stats.approved / coAdminStats.stats.total) * 100)}%
                    </span>
                  </div>
                )}

                {/* Recent Providers List */}
                {coAdminStats.recentProviders.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      Recent Providers Added ({coAdminStats.recentProviders.length})
                    </p>
                    <div className="space-y-2">
                      {coAdminStats.recentProviders.map((pp: any) => (
                        <div key={pp.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white font-semibold text-sm shrink-0 ${avatarColor(pp.name)}`}>
                            {(pp.name || "?")[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{pp.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{pp.serviceName} • {pp.district || pp.address || "—"}</p>
                          </div>
                          <Badge className={`text-[10px] shrink-0 ${
                            pp.status === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" :
                            pp.status === "pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                            pp.status === "fake" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" :
                            "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          }`}>
                            {pp.status === "approved" ? "✓ Approved" : pp.status === "pending" ? "⏳ Pending" : pp.status === "fake" ? "Fake" : "Rejected"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {coAdminStats.recentProviders.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserCog className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Is admin ne abhi koi provider add nahi kiya</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── VERIFIED PROVIDERS LIST MODAL ── */}
      {verifiedListStatus && selectedCoAdminId && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={() => setVerifiedListStatus(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>
            <button
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              onClick={() => setVerifiedListStatus(null)}
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
            <div className="px-5 py-3 border-b border-border">
              <h3 className="font-bold text-base flex items-center gap-2">
                {verifiedListStatus === "approved" ? (
                  <><CheckCircle className="w-4 h-4 text-emerald-600" /> Approved Providers</>
                ) : (
                  <><X className="w-4 h-4 text-red-600" /> Rejected Providers</>
                )}
                {coAdminStats && <span className="text-muted-foreground font-normal text-sm">— {coAdminStats.coAdmin.username}</span>}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Total: {verifiedProvidersList.length} providers {verifiedListStatus === "approved" ? "approved" : "rejected"} by this admin
              </p>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {verifiedListLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : verifiedProvidersList.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Koi provider {verifiedListStatus === "approved" ? "approve" : "reject"} nahi kiya</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {verifiedProvidersList.map((pp: any, idx: number) => (
                    <div key={pp.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl" data-testid={`verified-provider-${pp.id}`}>
                      <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{pp.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {pp.serviceName || "—"} • {pp.mobile || "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {pp.district || pp.address || "—"}
                          {pp.groupLabel && <span className="ml-1 text-purple-500 font-semibold">Group {pp.groupLabel}</span>}
                        </p>
                      </div>
                      <Badge className={`text-[10px] shrink-0 ${
                        pp.status === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" :
                        pp.status === "fake" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" :
                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      }`}>
                        {pp.status === "approved" ? "✓" : pp.status === "fake" ? "Fake" : "✗"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SALARY HISTORY MODAL ── */}
      {showSalaryHistory && selectedCoAdminId && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={() => setShowSalaryHistory(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>
            <button
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              onClick={() => setShowSalaryHistory(false)}
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
            <div className="px-5 py-3 border-b border-border">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                Salary Payment History
                {coAdminStats && <span className="text-muted-foreground font-normal text-sm">— {coAdminStats.coAdmin.username}</span>}
              </h3>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {salaryHistory.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <IndianRupee className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Abhi tak koi payment nahi hui</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {salaryHistory.map((p: any, i: number) => (
                    <div key={p.id} className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">₹{p.totalAmount}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                        <div className="bg-white dark:bg-slate-700 rounded-lg py-1.5">
                          <p className="font-semibold">{p.entryCount}</p>
                          <p className="text-muted-foreground text-[10px]">Entries</p>
                        </div>
                        <div className="bg-white dark:bg-slate-700 rounded-lg py-1.5">
                          <p className="font-semibold text-emerald-600">{p.approveCount}</p>
                          <p className="text-muted-foreground text-[10px]">Approved</p>
                        </div>
                        <div className="bg-white dark:bg-slate-700 rounded-lg py-1.5">
                          <p className="font-semibold text-red-500">{p.rejectCount}</p>
                          <p className="text-muted-foreground text-[10px]">Rejected</p>
                        </div>
                        <div className="bg-white dark:bg-slate-700 rounded-lg py-1.5">
                          <p className="font-semibold text-blue-600">{p.callCount}</p>
                          <p className="text-muted-foreground text-[10px]">Calls</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2">
                        {p.totalActions} actions × ₹{p.ratePerAction}
                        {p.cycleStart && ` • Cycle: ${new Date(p.cycleStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(p.cycleEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DUPLICATE PROFILES MODAL (deprecated — now inline tab) ── */}
      {false && showDuplicates && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowDuplicates(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-slate-900 rounded-t-3xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b dark:border-slate-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/60 flex items-center justify-center">
                  <Copy className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="font-bold text-base">Duplicate Profiles</h2>
                  <p className="text-xs text-muted-foreground">
                    {duplicatesLoading ? "Load ho raha hai..." : `${(duplicateData || []).length} mobile numbers par duplicate accounts`}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowDuplicates(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-muted-foreground">✕</button>
            </div>

            {/* Delete bar — sticky */}
            {selectedDeleteIds.size > 0 && (
              <div className="px-5 py-2.5 bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-900/40 flex items-center justify-between gap-3 flex-shrink-0">
                <span className="text-sm font-semibold text-red-700 dark:text-red-300">{selectedDeleteIds.size} selected</span>
                <Button
                  size="sm"
                  className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white gap-1.5"
                  onClick={handleBulkDeleteDuplicates}
                  disabled={deletingDuplicates}
                  data-testid="button-delete-selected"
                >
                  {deletingDuplicates ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete {selectedDeleteIds.size} profiles
                </Button>
              </div>
            )}

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {duplicatesLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!duplicatesLoading && (duplicateData || []).length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
                  Koi duplicate profile nahi mila!
                </div>
              )}
              {(duplicateData || []).map((group: any) => (
                <div key={group.mobile} className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  {/* Group header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-bold text-sm tracking-wide">{group.mobile}</span>
                    </div>
                    <span className="text-xs bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 font-semibold px-2 py-0.5 rounded-full">
                      {group.count} profiles
                    </span>
                  </div>

                  {/* Profiles list */}
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {group.profiles.map((prof: any, idx: number) => {
                      const isChecked = selectedDeleteIds.has(prof.userId);
                      const isBest = idx === 0;
                      return (
                        <div
                          key={prof.userId}
                          className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${isChecked ? "bg-red-50 dark:bg-red-950/30" : "hover:bg-white dark:hover:bg-slate-700/50"}`}
                          onClick={() => {
                            setSelectedDeleteIds(prev => {
                              const next = new Set(prev);
                              if (next.has(prof.userId)) next.delete(prof.userId);
                              else next.add(prof.userId);
                              return next;
                            });
                          }}
                        >
                          {/* Rank */}
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${isBest ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300" : "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"}`}>
                            {idx + 1}
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-sm">{prof.name || "—"}</span>
                              {isBest && (
                                <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                  <Star className="w-2.5 h-2.5" />Sabse zyada details
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${prof.role === "provider" ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"}`}>
                                {prof.role}
                              </span>
                              <span className="text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <Coins className="w-2.5 h-2.5" />{prof.totalCredits} cr
                              </span>
                              {prof.hasLocation && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                  <MapPin className="w-2.5 h-2.5" />Location
                                </span>
                              )}
                            </div>
                            {prof.serviceName && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">🔧 {prof.serviceName}</p>}
                            {prof.address && <p className="text-[10px] text-muted-foreground truncate">📍 {prof.address}</p>}
                            {prof.description && <p className="text-[10px] text-muted-foreground truncate">📝 {prof.description}</p>}
                          </div>

                          {/* Checkbox */}
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-colors ${isChecked ? "bg-red-500 border-red-500" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"}`}>
                            {isChecked && <span className="text-white text-xs font-bold">✓</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CREDIT PURCHASERS MODAL (deprecated — now inline tab) ── */}
      {false && showCreditPurchasers && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowCreditPurchasers(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-slate-900 rounded-t-3xl w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/60 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h2 className="font-bold text-base">Credit Purchasers</h2>
                  <p className="text-xs text-muted-foreground">
                    {(allCredits || []).filter((c: any) => (c.purchasedCredits ?? 0) > 0).length} users ne credit kharida
                  </p>
                </div>
              </div>
              <button onClick={() => setShowCreditPurchasers(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 p-4 space-y-2.5">
              {(allCredits || [])
                .filter((c: any) => (c.purchasedCredits ?? 0) > 0)
                .sort((a: any, b: any) => (b.purchasedCredits ?? 0) - (a.purchasedCredits ?? 0))
                .map((c: any, idx: number) => (
                  <div
                    key={c.userId || idx}
                    className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3"
                    data-testid={`credit-purchaser-${idx}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/60 flex items-center justify-center flex-shrink-0 text-sm font-bold text-purple-700 dark:text-purple-300">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{c.profileName || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{c.mobile || "—"}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-purple-600 dark:text-purple-400 text-sm">₹{c.purchasedCredits}</p>
                      <p className="text-[10px] text-muted-foreground">Purchased</p>
                    </div>
                  </div>
                ))}
              {(allCredits || []).filter((c: any) => (c.purchasedCredits ?? 0) > 0).length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Abhi kisi ne credit purchase nahi kiya
                </div>
              )}
            </div>

            {/* Total footer */}
            {(allCredits || []).filter((c: any) => (c.purchasedCredits ?? 0) > 0).length > 0 && (
              <div className="px-5 py-3 border-t dark:border-slate-700 bg-purple-50 dark:bg-purple-950/30 rounded-b-none flex items-center justify-between">
                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Total Revenue</span>
                <span className="text-lg font-extrabold text-purple-700 dark:text-purple-300">
                  ₹{(allCredits || []).reduce((sum: number, c: any) => sum + (c.purchasedCredits ?? 0), 0)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── BACKUP / RESTORE INLINE CARD ── */}
      {activeTab === "backup" && (
        <div data-testid="section-backup">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 space-y-3 shadow-sm">
              <div className="space-y-1">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Database className="w-5 h-5 text-amber-600" />
                  Database Backup
                </h2>
                <p className="text-xs text-muted-foreground">
                  Download a full snapshot or restore the database from a previously-downloaded .sql file.
                </p>
              </div>

          {/* Download section */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-amber-700 dark:text-amber-300" />
              <h3 className="font-semibold text-sm">Download backup</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Saves a complete .sql snapshot of every table and row to your computer.
            </p>
            <Button
              size="sm"
              onClick={handleBackupDownload}
              disabled={downloadInProgress}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-backup-download"
            >
              {downloadInProgress ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Preparing…</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Download .sql</>
              )}
            </Button>
          </div>

          {/* Google Cloud Storage section */}
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <CloudUpload className="w-4 h-4 text-blue-700 dark:text-blue-300" />
              <h3 className="font-semibold text-sm">Google Cloud Backup</h3>
              {gcsStatus?.bucket && (
                <span className="ml-auto text-[10px] text-blue-600 dark:text-blue-400 font-mono truncate max-w-[140px]" title={gcsStatus.bucket}>
                  {gcsStatus.bucket}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Backup database ko Google Cloud Storage mein save karo. Do options hain:
            </p>
            {gcsStatus?.configured === false ? (
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 p-3 text-xs text-yellow-800 dark:text-yellow-200">
                GCS configured nahi hai. Replit Secrets mein <strong>GCS_SERVICE_ACCOUNT_KEY</strong> aur <strong>GCS_BUCKET_NAME</strong> add karo.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setGcsMode("overwrite"); setGcsUploadResult(null); }}
                    data-testid="button-gcs-mode-overwrite"
                    className={`rounded-lg border-2 p-3 text-left transition-colors ${gcsMode === "overwrite"
                      ? "border-blue-500 bg-blue-100 dark:bg-blue-900/50"
                      : "border-transparent bg-white dark:bg-zinc-800/50 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">Overwrite</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">Purana backup replace karo — sirf ek file rahegi cloud mein</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setGcsMode("new"); setGcsUploadResult(null); }}
                    data-testid="button-gcs-mode-new"
                    className={`rounded-lg border-2 p-3 text-left transition-colors ${gcsMode === "new"
                      ? "border-blue-500 bg-blue-100 dark:bg-blue-900/50"
                      : "border-transparent bg-white dark:bg-zinc-800/50 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <CloudUpload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">Nayi File</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">Naya backup add karo — purani files bhi cloud mein rahegi</p>
                  </button>
                </div>
                <Button
                  size="sm"
                  onClick={() => gcsUploadMutation.mutate(gcsMode)}
                  disabled={gcsUploadMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-gcs-upload"
                >
                  {gcsUploadMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cloud mein upload ho raha hai…</>
                  ) : (
                    <><CloudUpload className="w-4 h-4 mr-2" />
                    {gcsMode === "overwrite" ? "Overwrite karke upload karo" : "Nayi file ke roop mein upload karo"}
                    </>
                  )}
                </Button>
                {gcsUploadResult && (
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 p-3 text-xs text-green-800 dark:text-green-200 space-y-0.5">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Upload successful!
                    </div>
                    <p className="font-mono text-[10px] break-all">{gcsUploadResult.url}</p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(gcsUploadResult.size)}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Alert webhook test */}
          <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-violet-700 dark:text-violet-300" />
              <h3 className="font-semibold text-sm">Alert webhook</h3>
              {alertStatus && (
                alertStatus.configured ? (
                  <Badge
                    className="ml-auto text-[10px] px-1.5 py-0 h-5 rounded-md bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
                    data-testid="badge-alert-webhook-status"
                  >
                    <CheckCircle className="w-2.5 h-2.5 mr-0.5" />Configured
                  </Badge>
                ) : (
                  <Badge
                    className="ml-auto text-[10px] px-1.5 py-0 h-5 rounded-md bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700"
                    data-testid="badge-alert-webhook-status"
                  >
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Not configured
                  </Badge>
                )
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Send a test notification to the configured <code className="font-mono">BACKUP_ALERT_WEBHOOK</code> to verify it works correctly.
            </p>
            {alertStatus?.configured === false && (
              <div
                className="rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 p-3 text-xs text-yellow-800 dark:text-yellow-200"
                data-testid="text-alert-webhook-warning"
              >
                <strong>BACKUP_ALERT_WEBHOOK</strong> set nahi hai. Replit Secrets mein webhook URL (Slack/Discord/generic) add karo, phir test alert bhej sakte ho.
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={testAlertPending || alertStatus?.configured === false}
              className="w-full border-violet-400 dark:border-violet-600 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40"
              data-testid="button-test-alert"
              onClick={async () => {
                setTestAlertPending(true);
                try {
                  const res = await apiRequest("POST", "/api/admin/backup/test-alert");
                  const data = await res.json();
                  if (data.ok) {
                    toast({ title: "Test alert sent", description: data.message });
                  } else {
                    toast({ title: "Alert failed", description: data.message, variant: "destructive" });
                  }
                } catch (err: any) {
                  toast({ title: "Alert failed", description: err?.message || "Unexpected error", variant: "destructive" });
                } finally {
                  setTestAlertPending(false);
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/test-alert-history"] });
                }
              }}
            >
              {testAlertPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
              ) : (
                <><Bell className="w-4 h-4 mr-2" />Send test alert</>
              )}
            </Button>

            {/* Test alert history */}
            {testAlertHistory && testAlertHistory.entries.length > 0 && (
              <div
                className="rounded-lg border border-violet-200 dark:border-violet-700 bg-white dark:bg-slate-900 p-2 space-y-1"
                data-testid="test-alert-history-section"
              >
                <div className="flex items-center gap-1.5 px-1">
                  <Clock className="w-3 h-3 text-violet-700 dark:text-violet-300" />
                  <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                    Recent test alerts
                  </span>
                </div>
                <div className="overflow-x-auto rounded border border-violet-100 dark:border-violet-800">
                  <table className="w-full text-[11px]">
                    <thead className="bg-violet-50/80 dark:bg-violet-900/30">
                      <tr>
                        <th className="text-left px-2 py-1 font-semibold">When</th>
                        <th className="text-center px-2 py-1 font-semibold">Result</th>
                        <th className="text-left px-2 py-1 font-semibold">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testAlertHistory.entries.map((entry, idx) => (
                        <tr
                          key={`${entry.at}-${idx}`}
                          className="border-t border-violet-100 dark:border-violet-800"
                          data-testid={`row-test-alert-history-${idx}`}
                        >
                          <td className="px-2 py-1 align-top">
                            <span className="block" data-testid={`text-test-alert-time-${idx}`}>
                              {formatRelative(entry.at)}
                            </span>
                            <span
                              className="block text-[10px] text-muted-foreground"
                              title={new Date(entry.at).toLocaleString()}
                            >
                              {new Date(entry.at).toLocaleString()}
                            </span>
                          </td>
                          <td
                            className="px-2 py-1 text-center align-top"
                            data-testid={`status-test-alert-${idx}`}
                          >
                            {entry.sent ? (
                              <span
                                className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400 font-semibold"
                                title="Test alert delivered"
                              >
                                <CheckCircle className="w-3 h-3" /> sent
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 font-semibold"
                                title={entry.message}
                              >
                                <XCircle className="w-3 h-3" /> failed
                              </span>
                            )}
                          </td>
                          <td
                            className="px-2 py-1 align-top text-muted-foreground"
                            data-testid={`text-test-alert-message-${idx}`}
                          >
                            <span
                              className="block truncate max-w-[260px]"
                              title={entry.message}
                            >
                              {entry.message}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Backup history */}
          {backupStatus && backupStatus.history.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-3 space-y-2" data-testid="backup-history-section">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <h3 className="font-semibold text-sm">Recent backup history</h3>
              </div>
              <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-100/80 dark:bg-slate-800/80 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-semibold">File</th>
                      <th className="text-right px-2 py-1.5 font-semibold">Size</th>
                      <th className="text-right px-2 py-1.5 font-semibold">Rows</th>
                      <th className="text-center px-2 py-1.5 font-semibold">Email</th>
                      <th className="text-center px-2 py-1.5 font-semibold">Alert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupStatus.history.slice(0, 5).map((entry, idx) => (
                      <tr key={entry.filename} className="border-t border-slate-100 dark:border-slate-800" data-testid={`row-backup-history-${idx}`}>
                        <td className="px-2 py-1.5">
                          <span className="font-mono truncate block max-w-[140px]" title={entry.filename}>
                            {entry.filename.replace("mitrify-backup-", "")}
                          </span>
                          <span className="text-muted-foreground">{formatRelative(entry.generatedAt)}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{formatBytes(entry.size)}</td>
                        <td
                          className="px-2 py-1.5 text-right text-muted-foreground tabular-nums"
                          data-testid={`text-rows-${idx}`}
                          title={
                            typeof entry.totalRows === "number"
                              ? `${entry.totalRows.toLocaleString()} rows${
                                  entry.tableCount ? ` across ${entry.tableCount} tables` : ""
                                }`
                              : "Row count not recorded for this backup"
                          }
                        >
                          {typeof entry.totalRows === "number" ? formatRows(entry.totalRows) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-center" data-testid={`status-email-${idx}`}>
                          {entry.emailed ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400 font-semibold" title="Email sent">
                              <CheckCircle className="w-3 h-3" /> sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 font-semibold" title={entry.emailError ?? "Email not sent"}>
                              <XCircle className="w-3 h-3" /> failed
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center" data-testid={`status-alert-${idx}`}>
                          {entry.alertSent ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400 font-semibold" title="Alert webhook delivered">
                              <CheckCircle className="w-3 h-3" /> sent
                            </span>
                          ) : entry.alertError === NO_ALERT_NEEDED_MESSAGE ? (
                            <span className="text-muted-foreground" title={entry.alertError}>
                              not needed
                            </span>
                          ) : entry.alertError ? (
                            <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 font-semibold" title={entry.alertError}>
                              <XCircle className="w-3 h-3" /> failed
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Restore section */}
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-red-700 dark:text-red-300" />
              <h3 className="font-semibold text-sm">Restore from backup</h3>
              {backupStatus?.history && backupStatus.history.length > 0 && (() => {
                const latest = backupStatus.history[0];
                return (
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-1 text-[11px] font-medium text-red-700 dark:text-red-300 hover:underline disabled:opacity-40"
                    disabled={restoreInProgress || dryRunInProgress || storedFileFetching}
                    data-testid="button-use-latest-backup"
                    title={`${latest.filename} · ${formatBytes(latest.size)}`}
                    onClick={async () => {
                      setRestoreFile(null);
                      setSelectedGcsName("");
                      setRestoreConfirmed(false);
                      setRestoreSummary(null);
                      setDryRunResult(null);
                      setParsedTables(null);
                      setSelectedTables(new Set());
                      setRestoreMode("stored");
                      await handleStoredFileSelect(latest.filename);
                    }}
                  >
                    <Database className="w-3 h-3" />
                    Use latest backup
                    <span
                      className="text-red-600/80 dark:text-red-400/80 font-normal"
                      data-testid="text-latest-backup-age"
                    >
                      · {formatRelative(latest.generatedAt)}
                    </span>
                  </button>
                );
              })()}
            </div>
            {/* Restore strategy toggle */}
            <div className="grid grid-cols-3 gap-2" data-testid="restore-strategy-toggle">
              <button
                type="button"
                onClick={() => { if (!restoreInProgress && !dryRunInProgress) { setRestoreStrategy("merge"); setRestoreConfirmed(false); setDryRunResult(null); } }}
                disabled={restoreInProgress || dryRunInProgress}
                data-testid="button-strategy-merge"
                className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors disabled:opacity-50 ${restoreStrategy === "merge" ? "border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 ring-1 ring-emerald-400 dark:ring-emerald-600" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-300 dark:hover:border-emerald-700"}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${restoreStrategy === "merge" ? "border-emerald-500 bg-emerald-500" : "border-slate-300 dark:border-slate-600"}`} />
                  <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-200">Merge (default)</span>
                </span>
                <span className="text-[10px] text-muted-foreground leading-snug pl-4.5">Existing data safe — sirf naye rows add honge, duplicates skip</span>
              </button>
              <button
                type="button"
                onClick={() => { if (!restoreInProgress && !dryRunInProgress) { setRestoreStrategy("lenient"); setRestoreConfirmed(false); setDryRunResult(null); } }}
                disabled={restoreInProgress || dryRunInProgress}
                data-testid="button-strategy-lenient"
                className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors disabled:opacity-50 ${restoreStrategy === "lenient" ? "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 ring-1 ring-amber-400 dark:ring-amber-600" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-amber-300 dark:hover:border-amber-700"}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${restoreStrategy === "lenient" ? "border-amber-500 bg-amber-500" : "border-slate-300 dark:border-slate-600"}`} />
                  <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">Best-effort</span>
                </span>
                <span className="text-[10px] text-muted-foreground leading-snug pl-4.5">Broken rows skip — purane backups ke liye useful</span>
              </button>
              <button
                type="button"
                onClick={() => { if (!restoreInProgress && !dryRunInProgress) { setRestoreStrategy("overwrite"); setRestoreConfirmed(false); setDryRunResult(null); } }}
                disabled={restoreInProgress || dryRunInProgress}
                data-testid="button-strategy-overwrite"
                className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors disabled:opacity-50 ${restoreStrategy === "overwrite" ? "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/30 ring-1 ring-red-400 dark:ring-red-600" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-red-300 dark:hover:border-red-700"}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${restoreStrategy === "overwrite" ? "border-red-500 bg-red-500" : "border-slate-300 dark:border-slate-600"}`} />
                  <span className="text-[11px] font-semibold text-red-800 dark:text-red-200">Overwrite</span>
                </span>
                <span className="text-[10px] text-muted-foreground leading-snug pl-4.5">Existing data delete ho jaayega — full replacement (dangerous)</span>
              </button>
            </div>

            {/* Mode-aware warning */}
            {restoreStrategy === "merge" ? (
              <div className="flex items-start gap-2 rounded-lg bg-emerald-50/80 dark:bg-emerald-900/30 p-2.5 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] leading-snug text-emerald-800 dark:text-emerald-200">
                  <strong>Safe restore:</strong> Existing data untouched rahega. Backup ki sirf woh rows DB mein add hongi jinke IDs abhi exist nahi karte. Duplicate rows skip ho jaayengi.
                </p>
              </div>
            ) : restoreStrategy === "lenient" ? (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50/80 dark:bg-amber-900/30 p-2.5 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-200">
                  <strong>Best-effort mode:</strong> Har row independently insert hogi. Jo rows schema mismatch ya error ki wajah se fail hongi woh skip ho jaayengi — baaki data import hota rahega. Purane ya partially-compatible backups ke liye useful hai.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-red-100/70 dark:bg-red-900/40 p-2.5 border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-4 h-4 text-red-700 dark:text-red-300 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] leading-snug text-red-800 dark:text-red-200">
                  {parsedTables !== null && parsedTables.length > 0 && selectedTables.size < parsedTables.length && selectedTables.size > 0 ? (
                    <><strong>Warning:</strong> Only the <strong>{selectedTables.size} ticked table{selectedTables.size !== 1 ? "s" : ""}</strong> will be cleared and re-populated from the backup. All other tables are left untouched. This cannot be undone.</>
                  ) : (
                    <><strong>Warning:</strong> Restoring will <strong>overwrite all selected tables</strong> with the
                    contents of the backup file. Each selected table is cleared first, then re-populated from the backup.
                    This cannot be undone — download a fresh backup first if you might need to roll back.</>
                  )}
                </p>
              </div>
            )}

            <Tabs
              value={restoreMode}
              onValueChange={(v) => {
                if (restoreInProgress || dryRunInProgress) return;
                setRestoreMode(v as "upload" | "stored" | "gcs");
                setRestoreFile(null);
                setSelectedStoredFilename(null);
                setSelectedGcsName("");
                setRestoreConfirmed(false);
                setRestoreSummary(null);
                setDryRunResult(null);
                setParsedTables(null);
                setSelectedTables(new Set());
                setRestoreStrategy("merge");
              }}
            >
              <TabsList className="grid grid-cols-3 w-full h-9">
                <TabsTrigger value="upload" data-testid="tab-restore-upload" className="text-xs">
                  <Upload className="w-3.5 h-3.5 mr-1.5" />Local file
                </TabsTrigger>
                <TabsTrigger value="stored" data-testid="tab-restore-stored" className="text-xs">
                  <Database className="w-3.5 h-3.5 mr-1.5" />Stored backup
                </TabsTrigger>
                <TabsTrigger value="gcs" data-testid="tab-restore-gcs" className="text-xs">
                  <Cloud className="w-3.5 h-3.5 mr-1.5" />Google Cloud
                </TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="mt-3">
                <Label htmlFor="restore-file" className="text-xs font-semibold mb-1 block">
                  Select .sql backup file
                </Label>
                <Input
                  id="restore-file"
                  type="file"
                  accept=".sql,application/sql,text/plain"
                  onChange={async (e) => {
                    const f = e.target.files?.[0] || null;
                    setRestoreFile(f);
                    setRestoreConfirmed(false);
                    setRestoreSummary(null);
                    setDryRunResult(null);
                    setParsedTables(null);
                    setSelectedTables(new Set());
                    if (f) {
                      try {
                        const text = await f.text();
                        const tables = parseSqlTables(text);
                        setParsedTables(tables);
                        setSelectedTables(new Set(tables.map((t) => t.name)));
                      } catch {
                        setParsedTables([]);
                      }
                    }
                  }}
                  disabled={restoreInProgress}
                  data-testid="input-restore-file"
                  className="text-xs"
                />
                {restoreFile && (
                  <p className="text-[11px] text-muted-foreground mt-1" data-testid="text-restore-filename">
                    {restoreFile.name} · {formatBytes(restoreFile.size)}
                  </p>
                )}
              </TabsContent>
              <TabsContent value="stored" className="mt-3">
                <Label className="text-xs font-semibold mb-1 block">
                  Choose a stored backup
                </Label>
                {backupStatus?.history && backupStatus.history.length > 0 ? (
                  <div className="max-h-44 overflow-y-auto rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800" data-testid="stored-backup-list">
                    {backupStatus.history.map((entry) => (
                      <button
                        key={entry.filename}
                        type="button"
                        onClick={() => handleStoredFileSelect(entry.filename)}
                        disabled={restoreInProgress || storedFileFetching}
                        className={`w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors disabled:opacity-50 ${selectedStoredFilename === entry.filename ? "bg-slate-100 dark:bg-slate-800" : ""}`}
                        data-testid={`button-stored-backup-${entry.filename}`}
                      >
                        <Database className={`w-3.5 h-3.5 flex-shrink-0 ${selectedStoredFilename === entry.filename ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
                        <span className="font-mono text-[11px] flex-1 truncate">{entry.filename}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-1">{formatBytes(entry.size)}</span>
                        {selectedStoredFilename === entry.filename && (
                          <CheckCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground" data-testid="text-no-stored-backups">
                    No stored backups found. Run a backup first to create one.
                  </p>
                )}
                {storedFileFetching && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1" data-testid="text-stored-file-fetching">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Reading backup file…
                  </p>
                )}
              </TabsContent>
              <TabsContent value="gcs" className="mt-3 space-y-2">
                {gcsStatus?.configured === false ? (
                  <p className="text-[11px] text-muted-foreground p-2 rounded border border-dashed border-slate-300 dark:border-slate-700">
                    Google Cloud Storage configured nahi hai. <code className="font-mono">GCS_SERVICE_ACCOUNT_KEY</code> aur <code className="font-mono">GCS_BUCKET_NAME</code> add karo.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Cloud backup file chuno</Label>
                      <button
                        type="button"
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 flex items-center gap-1"
                        disabled={gcsListQuery.isFetching || restoreInProgress}
                        onClick={() => gcsListQuery.refetch()}
                        data-testid="button-gcs-refresh"
                      >
                        {gcsListQuery.isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
                      </button>
                    </div>
                    {gcsListQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground p-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading cloud backups…
                      </div>
                    ) : gcsListQuery.error ? (
                      <p className="text-[11px] text-red-600 dark:text-red-400 p-2 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                        {(gcsListQuery.error as Error).message}
                      </p>
                    ) : (gcsListQuery.data?.files?.length ?? 0) === 0 ? (
                      <p className="text-[11px] text-muted-foreground p-2 rounded border border-dashed border-slate-300 dark:border-slate-700">
                        Bucket mein koi backup file nahi hai. Pehle "Run now" se ek backup banao ya cloud upload karo.
                      </p>
                    ) : (
                      <div className="max-h-44 overflow-y-auto rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800" data-testid="list-gcs-backups">
                        {gcsListQuery.data!.files.map((f) => (
                          <label
                            key={f.name}
                            className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 select-none ${selectedGcsName === f.name ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                            data-testid={`label-gcs-file-${f.name}`}
                          >
                            <input
                              type="radio"
                              name="gcs-file"
                              checked={selectedGcsName === f.name}
                              onChange={() => {
                                setSelectedGcsName(f.name);
                                setRestoreConfirmed(false);
                                setRestoreSummary(null);
                                setDryRunResult(null);
                                setParsedTables(null);
                                setSelectedTables(new Set());
                              }}
                              disabled={restoreInProgress}
                              className="flex-shrink-0"
                              data-testid={`radio-gcs-file-${f.name}`}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-[11px] truncate">{f.name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {formatBytes(f.size)}
                                {f.updated ? ` · ${new Date(f.updated).toLocaleString("en-IN")}` : ""}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Tip: Pehle "Preview" dabao — table list aur row counts dikhenge, phir confirm karke restore kar sakte ho.
                    </p>
                  </>
                )}
              </TabsContent>
            </Tabs>

            {/* Table selection checklist */}
            {parsedTables !== null && parsedTables.length > 0 && (
              <div className="space-y-1.5" data-testid="restore-table-selector">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Tables in this backup ({parsedTables.length})</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40"
                      disabled={restoreInProgress}
                      onClick={() => { setDryRunResult(null); setSelectedTables(new Set(parsedTables.map((t) => t.name))); }}
                      data-testid="button-select-all-tables"
                    >
                      Select all
                    </button>
                    <span className="text-[11px] text-muted-foreground">·</span>
                    <button
                      type="button"
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40"
                      disabled={restoreInProgress}
                      onClick={() => { setDryRunResult(null); setSelectedTables(new Set()); }}
                      data-testid="button-deselect-all-tables"
                    >
                      Deselect all
                    </button>
                  </div>
                </div>
                <div className="max-h-44 overflow-y-auto rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                  {parsedTables.map((t) => (
                    <label
                      key={t.name}
                      className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 select-none"
                      data-testid={`label-restore-table-${t.name}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTables.has(t.name)}
                        onChange={(e) => {
                          const next = new Set(selectedTables);
                          e.target.checked ? next.add(t.name) : next.delete(t.name);
                          setDryRunResult(null);
                          setSelectedTables(next);
                        }}
                        disabled={restoreInProgress}
                        className="flex-shrink-0"
                        data-testid={`checkbox-restore-table-${t.name}`}
                      />
                      <span className="font-mono text-[11px] flex-1 truncate">{t.name}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {t.rowCount.toLocaleString("en-IN")} rows
                      </span>
                    </label>
                  ))}
                </div>
                {selectedTables.size > 0 && selectedTables.size < parsedTables.length && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1" data-testid="text-selective-restore-note">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    Only {selectedTables.size} of {parsedTables.length} tables will be restored — unticked tables are untouched.
                  </p>
                )}
              </div>
            )}

            {(() => {
              const hasSource = restoreMode === "upload" ? !!restoreFile : restoreMode === "stored" ? !!selectedStoredFilename : !!selectedGcsName;
              const sourceName = restoreMode === "upload"
                ? (restoreFile?.name || "the uploaded file")
                : restoreMode === "stored"
                  ? (selectedStoredFilename || "the selected file")
                  : (selectedGcsName || "the selected GCS file");
              return (
                <label className="flex items-start gap-2 text-[11px] leading-snug cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={restoreConfirmed}
                    onChange={(e) => setRestoreConfirmed(e.target.checked)}
                    disabled={!hasSource || restoreInProgress}
                    className="mt-0.5"
                    data-testid="checkbox-restore-confirm"
                  />
                  <span>
                    {restoreStrategy === "merge"
                      ? <>I understand this will add new rows from <strong>{sourceName}</strong>, keeping all existing rows untouched.</>
                      : parsedTables && selectedTables.size < (parsedTables?.length ?? 0) && selectedTables.size > 0
                        ? <>I understand this will permanently overwrite the <strong>{selectedTables.size} selected table{selectedTables.size !== 1 ? "s" : ""}</strong> with data from <strong>{sourceName}</strong>. Unselected tables are left unchanged.</>
                        : <>I understand this will permanently overwrite all existing data with the contents of <strong>{sourceName}</strong>.</>
                    }
                  </span>
                </label>
              );
            })()}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDryRun}
                disabled={
                  !restoreReady ||
                  dryRunInProgress ||
                  restoreInProgress ||
                  storedFileFetching ||
                  (parsedTables !== null && parsedTables.length > 0 && selectedTables.size === 0)
                }
                className="flex-1"
                data-testid="button-restore-preview"
              >
                {dryRunInProgress ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Previewing…</>
                ) : (
                  <><Eye className="w-4 h-4 mr-2" />Preview</>
                )}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleRestoreSubmit}
                disabled={
                  !restoreReady ||
                  !restoreConfirmed ||
                  restoreInProgress ||
                  dryRunInProgress ||
                  storedFileFetching ||
                  !dryRunResult ||
                  (parsedTables !== null && parsedTables.length > 0 && selectedTables.size === 0)
                }
                className="flex-1"
                data-testid="button-restore-submit"
              >
                {restoreInProgress ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Restoring…</>
                ) : (
                  <><RotateCcw className="w-4 h-4 mr-2" />Restore database</>
                )}
              </Button>
              {restoreInProgress && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRestoreCancel}
                  disabled={restoreCancelling}
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  data-testid="button-restore-cancel"
                >
                  {restoreCancelling ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Cancelling…</>
                  ) : (
                    <><XCircle className="w-4 h-4 mr-1" />Cancel</>
                  )}
                </Button>
              )}
            </div>

            {restoreCancelled && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/20 p-3 flex items-center gap-2 mt-1" data-testid="restore-cancelled-banner">
                <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  Restore cancelled — database unchanged
                </p>
              </div>
            )}

            {/* Dry-run preview result */}
            {dryRunResult && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/20 p-3 space-y-2" data-testid="dry-run-result">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-700 dark:text-blue-300 flex-shrink-0" />
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
                    Preview — {dryRunResult.tableCount} table{dryRunResult.tableCount !== 1 ? "s" : ""} would be restored
                  </p>
                </div>
                <div className="max-h-44 overflow-y-auto rounded border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900">
                  <table className="w-full text-[11px]">
                    <thead className="bg-blue-100/60 dark:bg-blue-900/30 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1 font-semibold">Table</th>
                        <th className="text-right px-2 py-1 font-semibold">In dump</th>
                        {dryRunResult.mode === "merge" && (
                          <th className="text-right px-2 py-1 font-semibold">In DB now</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {dryRunResult.tables.map((t) => (
                        <tr key={t.name} className="border-t border-blue-100 dark:border-blue-900/40" data-testid={`row-preview-${t.name}`}>
                          <td className="px-2 py-1 font-mono">{t.name}</td>
                          <td className="px-2 py-1 text-right">{t.rowsInDump.toLocaleString("en-IN")}</td>
                          {dryRunResult.mode === "merge" && (
                            <td className="px-2 py-1 text-right text-muted-foreground">{(t.existingRowCount ?? 0).toLocaleString("en-IN")}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dryRunResult.unknownStatements.length > 0 && (
                  <div className="space-y-1" data-testid="dry-run-unknown-statements">
                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      {dryRunResult.unknownStatements.length} unrecognised statement type{dryRunResult.unknownStatements.length !== 1 ? "s" : ""} found:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {dryRunResult.unknownStatements.map((stmt, i) => (
                        <li key={i} className="font-mono text-[10px] text-muted-foreground truncate" data-testid={`dry-run-unknown-${i}`}>{stmt}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] text-blue-700 dark:text-blue-300">
                  No data was written. Click <strong>Restore database</strong> to apply these changes
                  {dryRunResult.mode === "merge" ? " (merge — existing rows will be kept)" : dryRunResult.mode === "lenient" ? " (best-effort — broken rows will be skipped)" : " (overwrite — existing rows will be replaced)"}.
                </p>
              </div>
            )}

            {/* Per-table summary after restore */}
            {restoreSummary && (() => {
              const isSelective = Array.isArray(restoreSummary.allowList) && restoreSummary.allowList.length > 0;
              const allowSet = isSelective ? new Set(restoreSummary.allowList!) : null;
              const restoredCount = isSelective ? allowSet!.size : restoreSummary.tables.length;
              const totalCount = restoreSummary.tables.length;
              const isMerge = restoreSummary.mode === "merge" || restoreSummary.mode === "lenient";
              const isLenient = restoreSummary.mode === "lenient";
              const totalAdded = isMerge
                ? restoreSummary.tables.reduce((s, t) => s + (t.rowsAdded ?? Math.max(0, t.delta)), 0)
                : restoreSummary.totalRowsAfter;
              return (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 p-3 space-y-2 mt-2" data-testid="restore-summary">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                      {isLenient ? (
                        <>Best-effort complete — {restoreSummary.totalRowsAfter.toLocaleString("en-IN")} rows in{" "}
                        {isSelective ? <>{restoredCount} of {totalCount} tables</> : <>{totalCount} tables</>}
                        {typeof restoreSummary.skippedCount === "number" && restoreSummary.skippedCount > 0
                          ? <>, <span className="text-amber-700 dark:text-amber-300">{restoreSummary.skippedCount} statement{restoreSummary.skippedCount !== 1 ? "s" : ""} skipped</span></>
                          : null
                        }
                        {" "}({(restoreSummary.durationMs / 1000).toFixed(1)}s)</>
                      ) : isMerge ? (
                        <>Merge complete — {totalAdded.toLocaleString("en-IN")} new rows added in{" "}
                        {isSelective ? <>{restoredCount} of {totalCount} tables</> : <>{totalCount} tables</>}
                        {" "}({(restoreSummary.durationMs / 1000).toFixed(1)}s)</>
                      ) : (
                        <>Restore complete —{" "}
                        {restoreSummary.totalRowsAfter.toLocaleString("en-IN")} rows in{" "}
                        {isSelective
                          ? <>{restoredCount} of {totalCount} tables restored</>
                          : <>{totalCount} tables</>
                        }{" "}
                        ({(restoreSummary.durationMs / 1000).toFixed(1)}s)</>
                      )}
                    </p>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900">
                    <table className="w-full text-[11px]">
                      <thead className="bg-emerald-100/60 dark:bg-emerald-900/30 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1 font-semibold">Table</th>
                          {isMerge ? (
                            <>
                              <th className="text-right px-2 py-1 font-semibold">Added</th>
                              <th className="text-right px-2 py-1 font-semibold">Skipped</th>
                            </>
                          ) : (
                            <>
                              <th className="text-right px-2 py-1 font-semibold">Before</th>
                              <th className="text-right px-2 py-1 font-semibold">After</th>
                              <th className="text-right px-2 py-1 font-semibold">Δ</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {restoreSummary.tables.map((t) => {
                          const tableSkipped = isSelective && !allowSet!.has(t.table);
                          const rowsAdded = t.rowsAdded ?? Math.max(0, t.delta);
                          const rowsSkipped = t.rowsSkipped;
                          return (
                            <tr
                              key={t.table}
                              className={`border-t border-emerald-100 dark:border-emerald-900/40${tableSkipped ? " opacity-40" : ""}`}
                              data-testid={tableSkipped ? `row-restore-skipped-${t.table}` : `row-restore-${t.table}`}
                            >
                              <td className={`px-2 py-1 font-mono${tableSkipped ? " italic text-muted-foreground" : ""}`}>{t.table}</td>
                              {isMerge ? (
                                <>
                                  <td className="px-2 py-1 text-right font-semibold text-emerald-700 dark:text-emerald-300">
                                    {tableSkipped
                                      ? <span className="text-[10px] font-medium text-muted-foreground bg-slate-100 dark:bg-slate-800 rounded px-1 py-0.5">skipped</span>
                                      : <>{rowsAdded > 0 ? `+${rowsAdded.toLocaleString("en-IN")}` : "0"}</>
                                    }
                                  </td>
                                  <td className="px-2 py-1 text-right text-muted-foreground">
                                    {!tableSkipped && rowsSkipped != null ? rowsSkipped.toLocaleString("en-IN") : "—"}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-2 py-1 text-right text-muted-foreground">{t.rowsBefore.toLocaleString("en-IN")}</td>
                                  <td className="px-2 py-1 text-right font-semibold">{t.rowsAfter.toLocaleString("en-IN")}</td>
                                  <td className={`px-2 py-1 text-right font-semibold ${tableSkipped ? "" : t.delta > 0 ? "text-emerald-700 dark:text-emerald-300" : t.delta < 0 ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>
                                    {tableSkipped
                                      ? <span className="text-[10px] font-medium text-muted-foreground bg-slate-100 dark:bg-slate-800 rounded px-1 py-0.5">skipped</span>
                                      : <>{t.delta > 0 ? "+" : ""}{t.delta.toLocaleString("en-IN")}</>
                                    }
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
          </div>
        </div>
      )}

    </div>
  );
}
