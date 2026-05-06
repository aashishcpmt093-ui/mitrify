import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Trash2, Search, X, Loader2, CheckCircle, Phone, MapPin,
  User, AlertTriangle, RefreshCw, ShieldAlert,
} from "lucide-react";

type FilterType = "all" | "noMobile" | "noLocation" | "suspiciousName";

const FILTERS: { value: FilterType; label: string; desc: string; color: string }[] = [
  { value: "all",           label: "All Users",       desc: "Sare users",                         color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { value: "noMobile",      label: "No Mobile",       desc: "Mobile number nahi hai",              color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { value: "noLocation",    label: "No Location",     desc: "Location nahi diya",                  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "suspiciousName",label: "Suspicious Name", desc: "Naam theek nahi ya khaali hai",       color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
];

const COUNTDOWN_SECS = 5;

export function BulkDeletePanel() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: users = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/bulk-filter-users", filter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ filter });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/bulk-filter-users?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  function toggleSelect(userId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(users.map((u: any) => u.userId)));
  }

  function clearSelect() {
    setSelected(new Set());
  }

  function openConfirm() {
    if (selected.size === 0) return;
    setCountdown(COUNTDOWN_SECS);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    setConfirmOpen(false);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }

  useEffect(() => {
    if (!confirmOpen) return;
    setCountdown(COUNTDOWN_SECS);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [confirmOpen]);

  async function executeDelete() {
    if (countdown > 0 || selected.size === 0) return;
    closeConfirm();
    setDeleting(true);
    try {
      const res = await apiRequest("DELETE", "/api/admin/bulk-delete-profiles", {
        userIds: Array.from(selected),
      });
      const data = await res.json();
      toast({ title: `${data.deleted} users delete ho gaye` });
      setSelected(new Set());
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    } catch {
      toast({ title: "Delete fail ho gaya", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  const allSelected = users.length > 0 && selected.size === users.length;

  return (
    <>
      {/* Countdown Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) closeConfirm(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <ShieldAlert className="w-5 h-5" />
              Delete Confirm Karo
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-1">
              <span className="block text-sm text-foreground font-medium">
                <span className="text-rose-600 font-bold">{selected.size} users</span> permanently delete ho jayenge.
                Ye action undo nahi ho sakta.
              </span>
              <span className="block text-xs text-muted-foreground">
                Pehle Backup lena recommended hai.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center py-4">
            <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center text-3xl font-bold transition-all ${
              countdown === 0
                ? "border-rose-500 text-rose-600"
                : "border-slate-300 dark:border-slate-600 text-slate-500"
            }`}>
              {countdown === 0 ? <Trash2 className="w-8 h-8" /> : countdown}
            </div>
          </div>

          {countdown > 0 && (
            <p className="text-center text-xs text-muted-foreground -mt-2 mb-2">
              {countdown} second baad confirm button active hoga...
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeConfirm} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 gap-1.5"
              disabled={countdown > 0 || deleting}
              onClick={executeDelete}
              data-testid="button-confirm-delete"
            >
              {deleting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Trash2 className="w-4 h-4" />
              }
              {countdown > 0 ? `Wait... (${countdown}s)` : `Delete ${selected.size} Users`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/60 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Bulk Delete Users</h3>
                <p className="text-xs text-muted-foreground">
                  {isLoading ? "Load ho raha hai..." : `${users.length} users mile`}
                  {selected.size > 0 && ` · ${selected.size} selected`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => refetch()}
                disabled={isLoading}
                data-testid="button-bulk-refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
              {selected.size > 0 && (
                <Button
                  size="sm"
                  className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
                  onClick={openConfirm}
                  disabled={deleting}
                  data-testid="button-bulk-delete-selected"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete {selected.size}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => { setFilter(f.value); setSelected(new Set()); }}
                data-testid={`button-bulk-filter-${f.value}`}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filter === f.value
                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                    : `${f.color} border-transparent hover:opacity-80`
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 pr-8 rounded-xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600"
              placeholder="Naam, mobile ya userId se search karo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-bulk-search"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {users.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={allSelected ? clearSelect : selectAll}
                className="text-xs text-primary font-semibold hover:underline"
                data-testid="button-bulk-select-all"
              >
                {allSelected ? "Deselect All" : `Select All (${users.length})`}
              </button>
              {selected.size > 0 && (
                <span className="text-xs text-muted-foreground">· {selected.size} selected</span>
              )}
            </div>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && users.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="font-semibold text-slate-600 dark:text-slate-400">Is filter mein koi user nahi mila</p>
          </div>
        )}

        <div className="space-y-2">
          {users.map((u: any) => {
            const isChecked = selected.has(u.userId);
            const suspicious = !u.name || u.name.trim().length < 2;
            return (
              <div
                key={u.userId}
                onClick={() => toggleSelect(u.userId)}
                data-testid={`bulk-user-${u.userId}`}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  isChecked
                    ? "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                  isChecked ? "bg-rose-500 border-rose-500" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                }`}>
                  {isChecked && <span className="text-white text-xs font-bold">✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm truncate">{u.name || <span className="text-muted-foreground italic">No name</span>}</span>
                    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${u.role === "provider" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"}`}>
                      {u.role}
                    </Badge>
                    {suspicious && (
                      <span className="text-[9px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" />suspicious
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                    <span className="text-[10px] text-muted-foreground font-mono truncate">{u.userId}</span>
                    {(u.mobile || u.mobileNumber) ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                        <Phone className="w-2.5 h-2.5" />{u.mobile || u.mobileNumber}
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[10px] text-orange-600 dark:text-orange-400">
                        <Phone className="w-2.5 h-2.5" />No mobile
                      </span>
                    )}
                    {u.address && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground truncate max-w-[120px]">
                        <MapPin className="w-2.5 h-2.5" />{u.address}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
