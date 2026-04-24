import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  Copy, MapPin, Star, Database, Cloud, CloudUpload, Bell
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useTheme } from "@/lib/theme";
import type { AdminStats, Profile, CallLog, PromoCode } from "@shared/schema";

interface EditProviderState { open: boolean; profile: any | null; providerData: any | null; }

function getInitials(name: string) {
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
function avatarColor(name: string) {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

interface BackupStatusResponse {
  lastSuccessAt: string | null;
  lastSuccess: { filename: string; size: number; emailed: boolean; emailError?: string; gcsUploaded?: boolean; gcsName?: string; alertSent: boolean; alertError?: string } | null;
  lastError: { at: string; message: string } | null;
  history: Array<{ filename: string; size: number; generatedAt: string; emailed: boolean; emailError?: string; durationMs: number; gcsUploaded?: boolean; alertSent: boolean; alertError?: string }>;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

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
    mutationFn: () => apiRequest("POST", "/api/admin/backup/run-now"),
    onSuccess: () => {
      toast({ title: "Backup complete", description: "Backup ran successfully." });
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

export default function AdminDashboardPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
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
  const [activeTab, setActiveTab] = useState("providers");
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [gcsMode, setGcsMode] = useState<"overwrite" | "new">("new");
  const [gcsUploadResult, setGcsUploadResult] = useState<{ gcsName: string; url: string; size: number } | null>(null);
  const [testAlertPending, setTestAlertPending] = useState(false);
  const [restoreMode, setRestoreMode] = useState<"upload" | "stored" | "gcs">("upload");
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
    tables: Array<{ table: string; rowsBefore: number; rowsAfter: number; delta: number }>;
    allowList: string[] | null;
  } | null>(null);
  const [parsedTables, setParsedTables] = useState<Array<{ name: string; rowCount: number }> | null>(null);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [downloadInProgress, setDownloadInProgress] = useState(false);
  const [dryRunInProgress, setDryRunInProgress] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{
    tableCount: number;
    tables: Array<{ name: string; rowsInDump: number }>;
    unknownStatements: string[];
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
          }),
        });
      } else {
        const fd = new FormData();
        fd.append("file", restoreFile!);
        if (parsedTables !== null && parsedTables.length > 0) {
          fd.append("tables", JSON.stringify(Array.from(selectedTables)));
        }
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

  async function handleRestoreSubmit() {
    if (!restoreReady || !restoreConfirmed || restoreInProgress) return;
    if (parsedTables && parsedTables.length > 0 && selectedTables.size === 0) {
      toast({ title: "No tables selected", description: "Tick at least one table to restore.", variant: "destructive" });
      return;
    }
    setRestoreInProgress(true);
    setRestoreSummary(null);
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
          }),
        });
      } else {
        const fd = new FormData();
        fd.append("file", restoreFile!);
        if (parsedTables !== null && parsedTables.length > 0) {
          fd.append("tables", JSON.stringify(Array.from(selectedTables)));
        }
        res = await fetch("/api/admin/restore", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      setRestoreSummary({
        totalRowsBefore: data.totalRowsBefore ?? 0,
        totalRowsAfter: data.totalRowsAfter ?? 0,
        durationMs: data.durationMs ?? 0,
        tables: Array.isArray(data.tables) ? data.tables : [],
        allowList: Array.isArray(data.allowList) ? data.allowList : null,
      });
      toast({
        title: "Restore complete",
        description: `${data.totalRowsAfter ?? 0} rows restored across ${data.tables?.length ?? 0} tables.`,
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
  const [editJobForm, setEditJobForm] = useState({ jobName: "", description: "", location: "", salary: "", workHours: "", contactPhone: "", isActive: true });
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
  const [metaBulkResult, setMetaBulkResult] = useState<{ approved: number; total: number; errors: string[] } | null>(null);
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

  const { data: isAdmin } = useQuery({
    queryKey: ["/api/admin/check"],
    queryFn: async () => {
      const res = await fetch("/api/admin/check", { credentials: "include" });
      const data = await res.json();
      return data.isAdmin;
    },
  });

  useEffect(() => { if (isAdmin === false) setLocation("/admin/login"); }, [isAdmin]);

  const { data: backupStatus } = useQuery<BackupStatusResponse>({
    queryKey: ["/api/admin/backup/status"],
    refetchInterval: 5 * 60 * 1000,
    enabled: !!isAdmin,
  });

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

  useEffect(() => { if (aboutContent) { setAboutForm(aboutContent); } }, [aboutContent]);
  useEffect(() => { if (termsContent) { setTermsForm(termsContent); } }, [termsContent]);
  useEffect(() => { if (recruitmentContent) { setRecruitmentLink(recruitmentContent); } }, [recruitmentContent]);

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

  const gcsListQuery = useQuery<{ files: Array<{ name: string; size: number; updated: string }> }>({
    queryKey: ["/api/admin/backup/gcs-list"],
    enabled: !!isAdmin && backupDialogOpen && restoreMode === "gcs" && gcsStatus?.configured === true,
    staleTime: 30 * 1000,
  });

  const gcsUploadMutation = useMutation({
    mutationFn: (mode: "overwrite" | "new") =>
      apiRequest("POST", "/api/admin/backup/gcs-upload", { mode }),
    onSuccess: (data: any) => {
      setGcsUploadResult({ gcsName: data.gcsName, url: data.url, size: data.size });
      toast({
        title: "Google Cloud Upload Complete",
        description: `Saved as ${data.gcsName} (${formatBytes(data.size)})`,
      });
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
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.mobile || "").includes(q) || (p.providerData?.serviceName || "").toLowerCase().includes(q));
    if (provFilter === "blocked") list = list.filter((p) => p.isBlocked);
    else if (provFilter === "frozen") list = list.filter((p) => p._credit?.creditsFrozen);
    else if (provFilter === "suspicious") list = list.filter((p) => (p._credit?.purchasedCredits ?? 0) > 500);
    else if (provFilter === "active") list = list.filter((p) => !p.isBlocked);
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
    if (provSort === "name_asc") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (provSort === "name_desc") list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    else if (provSort === "credits_high") list = [...list].sort((a, b) => ((b._credit?.freeCredits ?? 0) + (b._credit?.purchasedCredits ?? 0)) - ((a._credit?.freeCredits ?? 0) + (a._credit?.purchasedCredits ?? 0)));
    else if (provSort === "credits_low") list = [...list].sort((a, b) => ((a._credit?.freeCredits ?? 0) + (a._credit?.purchasedCredits ?? 0)) - ((b._credit?.freeCredits ?? 0) + (b._credit?.purchasedCredits ?? 0)));
    else if (provSort === "newest") list = [...list].sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    else if (provSort === "oldest") list = [...list].sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
    return list;
  }, [providersList, allCredits, provSearch, provFilter, provAddedByFilter, provApprovedByFilter, provSort]);

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

  const openEditProvider = (p: any) => {
    setEditName(p.name); setEditMobile(p.mobile || ""); setEditServiceName(p.providerData?.serviceName || "");
    setEditDescription(p.providerData?.description || ""); setEditHashtags(p.providerData?.hashtags?.join(", ") || "");
    setEditApproxCharge(p.providerData?.approxCharge || ""); setEditMobileNumbers(p.providerData?.mobileNumbers?.join(", ") || "");
    setEditRadiusKm(String(p.providerData?.radiusKm || 10)); setEditAddress(p.providerData?.address || "");
    setEditHidden(p.providerData?.isHidden || false);
    setEditProvider({ open: true, profile: p, providerData: p.providerData });
  };
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

  const handleMetaBulkApprove = async () => {
    if (!confirm("Kya aap confirm karte hain? Saare pending Meta leads approve ho jayenge aur providers ban jayenge.")) return;
    setMetaBulkApproving(true);
    setMetaBulkResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/approve-meta-bulk");
      const data = await res.json();
      setMetaBulkResult(data);
      toast({ title: `✅ ${data.approved} Meta leads approve ho gaye!` });
    } catch (err: any) {
      toast({ title: err.message || "Bulk approve failed", variant: "destructive" });
    } finally {
      setMetaBulkApproving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

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
              <div className="space-y-2"><Label>Mobile Numbers (comma separated)</Label><Input value={editMobileNumbers} onChange={e => setEditMobileNumbers(e.target.value)} data-testid="input-edit-mobiles" /></div>
              <div className="space-y-2"><Label>Address / Service Area</Label><Input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="e.g. MG Road, Bangalore" data-testid="input-edit-address" /></div>
              <Button className="w-full" onClick={() => updateProviderProfile.mutate()} disabled={updateProviderProfile.isPending || !editName.trim()} data-testid="button-save-provider">
                <Save className="w-4 h-4 mr-2" />{updateProviderProfile.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
            { value: "backup",    icon: Database,   label: "Backup",     count: undefined,             iconBg: "bg-amber-100 dark:bg-amber-900/60",     iconColor: "text-amber-600 dark:text-amber-400",    activeBg: "bg-amber-600",   border: "border-amber-200 dark:border-amber-800",
              onClick: () => {
                setRestoreFile(null);
                setRestoreConfirmed(false);
                setRestoreSummary(null);
                setParsedTables(null);
                setSelectedTables(new Set());
                setRestoreMode("upload");
                setSelectedGcsName("");
                setSelectedStoredFilename(null);
                setDryRunResult(null);
                setBackupDialogOpen(true);
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
                      if (value === "duplicateentry") setSelectedDeleteIds(new Set());
                      if (onClick) onClick();
                      if (value !== "backup") setActiveTab(value);
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
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{filteredProviders.length}</span> of <span className="font-semibold text-foreground">{providersList?.length ?? 0}</span> providers
                </p>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-lg" onClick={() => handleExport("providers")} data-testid="button-export-providers">
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
                          <Input value={editJobForm.jobName} onChange={e => setEditJobForm(f => ({ ...f, jobName: e.target.value }))} placeholder="Job Title" className="h-8 text-xs" data-testid={`input-edit-job-name-${job.id}`} />
                          <Textarea value={editJobForm.description} onChange={e => setEditJobForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" rows={2} className="text-xs" data-testid={`input-edit-job-desc-${job.id}`} />
                          <div className="grid grid-cols-2 gap-2">
                            <Input value={editJobForm.location} onChange={e => setEditJobForm(f => ({ ...f, location: e.target.value }))} placeholder="Location" className="h-8 text-xs" />
                            <Input value={editJobForm.contactPhone} onChange={e => setEditJobForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="Contact Phone" className="h-8 text-xs" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Input value={editJobForm.salary || ""} onChange={e => setEditJobForm(f => ({ ...f, salary: e.target.value }))} placeholder="Salary (optional)" className="h-8 text-xs" />
                            <Input value={editJobForm.workHours || ""} onChange={e => setEditJobForm(f => ({ ...f, workHours: e.target.value }))} placeholder="Work Hours (optional)" className="h-8 text-xs" />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input type="checkbox" checked={editJobForm.isActive} onChange={e => setEditJobForm(f => ({ ...f, isActive: e.target.checked }))} className="accent-primary" />
                              Active
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => updateAdminJob.mutate({ id: job.id, ...editJobForm })} disabled={updateAdminJob.isPending} data-testid={`button-save-job-${job.id}`}>Save</Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditJobId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-sm">{job.jobName}</p>
                                {!job.isActive && <Badge variant="secondary" className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Inactive</Badge>}
                                {job.lowCredit && <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">Low Credit</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{job.description}</p>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                <span className="text-xs text-muted-foreground">📍 {job.location}</span>
                                <span className="text-xs text-muted-foreground">📞 {job.contactPhone}</span>
                                {job.salary && <span className="text-xs text-green-600">💰 {job.salary}</span>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">Posted by: <span className="font-mono text-[10px]">{job.userId?.slice(0, 12)}...</span></p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs shrink-0"
                              onClick={() => { setEditJobId(job.id); setEditJobForm({ jobName: job.jobName, description: job.description, location: job.location, salary: job.salary || "", workHours: job.workHours || "", contactPhone: job.contactPhone, isActive: job.isActive }); }}
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

            {/* ── BULK APPROVE META LEADS ── */}
            <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <span className="text-lg">✅</span>
                </div>
                <div>
                  <h3 className="font-semibold text-base text-slate-900 dark:text-white">Meta Leads — Bulk Approve</h3>
                  <p className="text-xs text-muted-foreground">Saare pending Meta leads ek saath approve karein — ye OTP-verified leads hain, directly provider ban jayenge</p>
                </div>
              </div>

              <Button
                className="w-full h-11 text-sm font-semibold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleMetaBulkApprove}
                disabled={metaBulkApproving}
                data-testid="button-meta-bulk-approve"
              >
                {metaBulkApproving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Approve ho rahe hain...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" />Saare Meta Leads Approve Karein</>
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
        </Tabs>
      </main>

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
                    {coAdminStats.coAdmin.username[0]?.toUpperCase()}
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
                            {pp.name[0]?.toUpperCase()}
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

      {/* ── BACKUP / RESTORE DIALOG ── */}
      <Dialog open={backupDialogOpen} onOpenChange={(open) => {
        if (restoreInProgress) return;
        setBackupDialogOpen(open);
        if (!open) {
          setRestoreFile(null);
          setRestoreConfirmed(false);
          setRestoreSummary(null);
          setParsedTables(null);
          setSelectedTables(new Set());
          setSelectedGcsName("");
          setRestoreSource("local");
          setGcsUploadResult(null);
          setGcsMode("new");
          setRestoreMode("upload");
          setSelectedStoredFilename(null);
          setDryRunResult(null);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-backup">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-amber-600" />
              Database Backup
            </DialogTitle>
            <DialogDescription>
              Download a full snapshot or restore the database from a previously-downloaded .sql file.
            </DialogDescription>
          </DialogHeader>

          {/* Download section */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20 p-4 space-y-2">
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
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/20 p-4 space-y-3 mt-3">
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
          <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/20 p-4 space-y-2 mt-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-violet-700 dark:text-violet-300" />
              <h3 className="font-semibold text-sm">Alert webhook</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Send a test notification to the configured <code className="font-mono">BACKUP_ALERT_WEBHOOK</code> to verify it works correctly.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={testAlertPending}
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
                }
              }}
            >
              {testAlertPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
              ) : (
                <><Bell className="w-4 h-4 mr-2" />Send test alert</>
              )}
            </Button>
          </div>

          {/* Backup history */}
          {backupStatus && backupStatus.history.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-4 space-y-2 mt-3" data-testid="backup-history-section">
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
                      <th className="text-center px-2 py-1.5 font-semibold">Email</th>
                      <th className="text-center px-2 py-1.5 font-semibold">Alert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupStatus.history.map((entry, idx) => (
                      <tr key={entry.filename} className="border-t border-slate-100 dark:border-slate-800" data-testid={`row-backup-history-${idx}`}>
                        <td className="px-2 py-1.5">
                          <span className="font-mono truncate block max-w-[140px]" title={entry.filename}>
                            {entry.filename.replace("mitrify-backup-", "")}
                          </span>
                          <span className="text-muted-foreground">{formatRelative(entry.generatedAt)}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{formatBytes(entry.size)}</td>
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
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/20 p-4 space-y-3 mt-3">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-red-700 dark:text-red-300" />
              <h3 className="font-semibold text-sm">Restore from backup</h3>
              {backupStatus?.history && backupStatus.history.length > 0 && (
                <button
                  type="button"
                  className="ml-auto flex items-center gap-1 text-[11px] font-medium text-red-700 dark:text-red-300 hover:underline disabled:opacity-40"
                  disabled={restoreInProgress || dryRunInProgress || storedFileFetching}
                  data-testid="button-use-latest-backup"
                  onClick={async () => {
                    const latest = backupStatus.history[0];
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
                </button>
              )}
            </div>
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
                    {parsedTables && selectedTables.size < (parsedTables?.length ?? 0) && selectedTables.size > 0
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
            </div>

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
                        <th className="text-right px-2 py-1 font-semibold">Rows in dump</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dryRunResult.tables.map((t) => (
                        <tr key={t.name} className="border-t border-blue-100 dark:border-blue-900/40" data-testid={`row-preview-${t.name}`}>
                          <td className="px-2 py-1 font-mono">{t.name}</td>
                          <td className="px-2 py-1 text-right">{t.rowsInDump.toLocaleString("en-IN")}</td>
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
                  No data was written. Click <strong>Restore database</strong> to apply these changes.
                </p>
              </div>
            )}

            {/* Per-table summary after restore */}
            {restoreSummary && (() => {
              const isSelective = Array.isArray(restoreSummary.allowList) && restoreSummary.allowList.length > 0;
              const allowSet = isSelective ? new Set(restoreSummary.allowList!) : null;
              const restoredCount = isSelective ? allowSet!.size : restoreSummary.tables.length;
              const totalCount = restoreSummary.tables.length;
              return (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 p-3 space-y-2 mt-2" data-testid="restore-summary">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                      Restore complete —{" "}
                      {restoreSummary.totalRowsAfter.toLocaleString("en-IN")} rows in{" "}
                      {isSelective
                        ? <>{restoredCount} of {totalCount} tables restored</>
                        : <>{totalCount} tables</>
                      }{" "}
                      ({(restoreSummary.durationMs / 1000).toFixed(1)}s)
                    </p>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900">
                    <table className="w-full text-[11px]">
                      <thead className="bg-emerald-100/60 dark:bg-emerald-900/30 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1 font-semibold">Table</th>
                          <th className="text-right px-2 py-1 font-semibold">Before</th>
                          <th className="text-right px-2 py-1 font-semibold">After</th>
                          <th className="text-right px-2 py-1 font-semibold">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {restoreSummary.tables.map((t) => {
                          const skipped = isSelective && !allowSet!.has(t.table);
                          return (
                            <tr
                              key={t.table}
                              className={`border-t border-emerald-100 dark:border-emerald-900/40${skipped ? " opacity-40" : ""}`}
                              data-testid={skipped ? `row-restore-skipped-${t.table}` : `row-restore-${t.table}`}
                            >
                              <td className={`px-2 py-1 font-mono${skipped ? " italic text-muted-foreground" : ""}`}>{t.table}</td>
                              <td className="px-2 py-1 text-right text-muted-foreground">{t.rowsBefore.toLocaleString("en-IN")}</td>
                              <td className="px-2 py-1 text-right font-semibold">{t.rowsAfter.toLocaleString("en-IN")}</td>
                              <td className={`px-2 py-1 text-right font-semibold ${skipped ? "" : t.delta > 0 ? "text-emerald-700 dark:text-emerald-300" : t.delta < 0 ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>
                                {skipped
                                  ? <span className="text-[10px] font-medium text-muted-foreground bg-slate-100 dark:bg-slate-800 rounded px-1 py-0.5">skipped</span>
                                  : <>{t.delta > 0 ? "+" : ""}{t.delta.toLocaleString("en-IN")}</>
                                }
                              </td>
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

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setBackupDialogOpen(false)}
              disabled={restoreInProgress}
              data-testid="button-backup-close"
            >
              Close
            </Button>
            {restoreMode === "upload" && (
              <Button
                variant="secondary"
                onClick={() => {
                  const input = document.getElementById("restore-file") as HTMLInputElement | null;
                  input?.click();
                }}
                disabled={restoreInProgress}
                data-testid="button-backup-restore"
              >
                Upload backup file
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
