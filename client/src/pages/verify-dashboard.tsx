import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Phone, CheckCircle, XCircle, LogOut, Search, User, Pencil, Save, X, ChevronLeft, ChevronRight, Filter } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  fake: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  fake: "Rejected",
  rejected: "Rejected",
};

interface EditState {
  serviceName: string;
  address: string;
  district: string;
  approxCharge: string;
}

const LIMIT = 50;

export default function VerifyDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [sortBy, setSortBy] = useState<string>("");
  const [selectedCoAdmins, setSelectedCoAdmins] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("verify_coAdmins") || "[]"); } catch { return []; }
  });
  const [selectedGroups, setSelectedGroups] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("verify_groups") || "[]"); } catch { return []; }
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [me, setMe] = useState<{ username: string; role: string } | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [editOpen, setEditOpen] = useState<Record<number, boolean>>({});
  const [editData, setEditData] = useState<Record<number, EditState>>({});

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filter changes
  const setFilter2 = useCallback((f: typeof filter) => {
    setFilter(f);
    setPage(1);
  }, []);

  useEffect(() => {
    fetch("/api/coadmin/me", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.message) {
          fetch("/api/admin/status", { credentials: "include" })
            .then(r => r.json())
            .then(ad => {
              setAuthChecking(false);
              if (!ad.isAdmin) setLocation("/coadmin/login");
              else setMe({ username: "Main Admin", role: "mainadmin" });
            });
        } else if (d.role !== "testadmin" && d.role !== "mainadmin") {
          setAuthChecking(false);
          setLocation("/coadmin/dashboard");
        } else {
          setMe(d);
          setAuthChecking(false);
        }
      })
      .catch(() => {
        setAuthChecking(false);
        setLocation("/coadmin/login");
      });
  }, []);

  const coAdminsKey = selectedCoAdmins.join(",");
  const groupsKey = selectedGroups.join(",");
  const queryKey = ["/api/coadmin/pending-providers", filter, debouncedSearch, sortBy, coAdminsKey, groupsKey, page];

  const { data: pageResult, isLoading } = useQuery<{ data: any[]; total: number; page: number; totalPages: number; coAdmins?: string[] }>({
    queryKey,
    staleTime: 0,
    queryFn: () => {
      const params = new URLSearchParams({
        status: filter,
        search: debouncedSearch,
        page: String(page),
        limit: String(LIMIT),
      });
      if (sortBy) params.append("sortBy", sortBy);
      if (selectedCoAdmins.length > 0) params.append("coAdmins", selectedCoAdmins.join(","));
      if (selectedGroups.length > 0) params.append("groups", selectedGroups.join(","));
      return fetch(`/api/coadmin/pending-providers?${params}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const { data: groupStats = [] } = useQuery<{ groupLabel: string | null; count: number }[]>({
    queryKey: ["/api/admin/group-stats"],
    staleTime: 0,
    queryFn: () => fetch("/api/admin/group-stats", { credentials: "include" }).then(r => r.ok ? r.json() : []),
  });

  // Task #74: counter for auto-saved Google fallback leads. The
  // customer search bar silently saves Google Places hits into
  // pending_providers under addedBy="system_google_fallback" — this
  // gives admins a one-glance view of "how many leads came in this
  // way today / this week" so they can decide whether to focus on
  // verifying them.
  type GFallbackStats = { today: number; week: number; total: number; pending: number; systemUser: string };
  const { data: gFallback } = useQuery<GFallbackStats | null>({
    queryKey: ["/api/admin/google-fallback-stats"],
    staleTime: 30_000,
    queryFn: async () => {
      const r = await fetch("/api/admin/google-fallback-stats", { credentials: "include" });
      if (!r.ok) return null;
      return (await r.json()) as GFallbackStats;
    },
  });
  const GOOGLE_FALLBACK_USER = gFallback?.systemUser || "system_google_fallback";
  const isGoogleFallbackFilterOn =
    selectedCoAdmins.length === 1 && selectedCoAdmins[0] === GOOGLE_FALLBACK_USER;
  const toggleGoogleFallbackOnly = () => {
    if (isGoogleFallbackFilterOn) {
      setSelectedCoAdmins([]);
      localStorage.removeItem("verify_coAdmins");
    } else {
      setSelectedCoAdmins([GOOGLE_FALLBACK_USER]);
      localStorage.setItem("verify_coAdmins", JSON.stringify([GOOGLE_FALLBACK_USER]));
    }
    setPage(1);
  };
  const labelForCoAdmin = (name: string) =>
    name === "bulk-import"
      ? "📋 Bulk Import"
      : name === GOOGLE_FALLBACK_USER
        ? "🌐 Google Auto-Lead"
        : name;

  // Helper: toggle item in array and persist
  const toggleCoAdmin = (name: string) => {
    setSelectedCoAdmins(prev => {
      const next = prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name];
      localStorage.setItem("verify_coAdmins", JSON.stringify(next));
      return next;
    });
    setPage(1);
  };
  const toggleGroup = (g: string) => {
    setSelectedGroups(prev => {
      const next = prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g];
      localStorage.setItem("verify_groups", JSON.stringify(next));
      return next;
    });
    setPage(1);
  };
  const clearAllFilters = () => {
    setSelectedCoAdmins([]);
    setSelectedGroups([]);
    localStorage.removeItem("verify_coAdmins");
    localStorage.removeItem("verify_groups");
    setPage(1);
  };

  const activeFilterCount = selectedCoAdmins.length + selectedGroups.length;
  const availableCoAdmins = [
    "bulk-import",
    ...(pageResult?.coAdmins || []).filter((ca: string) => typeof ca === "string" && ca.trim()),
  ];
  // Always show A/B/C/D options; merge counts from DB if groups have been assigned
  const FIXED_GROUPS = ["A", "B", "C", "D"];
  const groupCountMap: Record<string, number> = {};
  groupStats.filter(g => g.groupLabel).forEach(g => { groupCountMap[g.groupLabel!] = Number(g.count); });
  // Include any extra labels that came back from DB (E, F, etc.) beyond the fixed 4
  const extraGroups = groupStats
    .filter(g => g.groupLabel && !FIXED_GROUPS.includes(g.groupLabel))
    .map(g => g.groupLabel!)
    .sort();
  const availableGroupLabels = [...FIXED_GROUPS, ...extraGroups];

  const list = pageResult?.data || [];
  const total = pageResult?.total || 0;
  const totalPages = pageResult?.totalPages || 1;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/coadmin/pending-providers"] });

  const updateStatus = useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: string; notes?: string }) =>
      apiRequest("PATCH", `/api/admin/pending-providers/${id}/status`, { status, notes }),
    onSuccess: invalidate,
    onError: (err: any) => {
      toast({ title: err.message || "Update failed", variant: "destructive" });
    },
  });

  const saveFields = useMutation({
    mutationFn: ({ id, data }: { id: number; data: EditState }) =>
      apiRequest("PATCH", `/api/coadmin/pending-providers/${id}`, data),
    onSuccess: (_, vars) => {
      invalidate();
      setEditOpen(prev => ({ ...prev, [vars.id]: false }));
      toast({ title: "Details saved!" });
    },
    onError: (err: any) => {
      toast({ title: err.message || "Save failed", variant: "destructive" });
    },
  });

  const openEdit = (pp: any) => {
    setEditData(prev => ({
      ...prev,
      [pp.id]: {
        serviceName: pp.serviceName || "",
        address: pp.address || "",
        district: pp.district || "",
        approxCharge: pp.approxCharge || "",
      },
    }));
    setEditOpen(prev => ({ ...prev, [pp.id]: true }));
  };

  const handleApprove = (pp: any) => {
    if (!pp.serviceName || pp.serviceName.trim() === "") {
      toast({ title: "Pehle Service Name fill karein!", description: "Edit button se service name add karein, phir approve karein.", variant: "destructive" });
      openEdit(pp);
      return;
    }
    if (window.confirm(`"${pp.name}" (${pp.serviceName}) ko approve karke LIVE karna chahte hain?`)) {
      updateStatus.mutate({ id: pp.id, status: "approved" }, {
        onSuccess: () => toast({ title: `${pp.name} ab live hai!` }),
      });
    }
  };

  const handleReject = (pp: any) => {
    const notes = window.prompt(`"${pp.name}" ko reject karo. Reason (optional):`);
    if (notes === null) return;
    updateStatus.mutate({ id: pp.id, status: "rejected", notes: notes || undefined }, {
      onSuccess: () => toast({ title: `${pp.name} reject ho gaya` }),
    });
  };

  const logout = async () => {
    await apiRequest("POST", "/api/coadmin/logout", {});
    setLocation("/coadmin/login");
  };

  const filterLabels: Record<string, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    all: "All",
  };

  if (authChecking || !me) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div>
            <p className="font-semibold text-sm">Verification Dashboard</p>
            <p className="text-xs text-muted-foreground">{me?.username} • {me?.role}</p>
          </div>
          <div className="flex items-center gap-2">
            {filter === "pending" && total > 0 && (
              <Badge className="bg-yellow-500 text-white text-xs">{total.toLocaleString("en-IN")} pending</Badge>
            )}
            <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Name, mobile, service, co-admin..."
            className="pl-9"
            data-testid="input-verify-search"
          />
        </div>

        {/* Task #74: Google fallback counter card — quick filter + at-a-glance counts */}
        {gFallback && gFallback.total > 0 && (
          <button
            type="button"
            onClick={toggleGoogleFallbackOnly}
            data-testid="card-google-fallback-stats"
            className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all active:scale-[0.99] ${
              isGoogleFallbackFilterOn
                ? "bg-blue-600 text-white border-blue-700 shadow"
                : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60 hover:border-blue-400"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={`text-xs font-semibold flex items-center gap-1 ${isGoogleFallbackFilterOn ? "text-white" : "text-blue-700 dark:text-blue-300"}`}>
                  🌐 Google Auto-Leads
                  {isGoogleFallbackFilterOn && <span className="text-[10px] font-normal opacity-80">(filter active — tap to clear)</span>}
                </p>
                <p className={`text-[11px] mt-0.5 ${isGoogleFallbackFilterOn ? "text-white/80" : "text-blue-600/80 dark:text-blue-400/80"}`}>
                  Customer search se auto-saved leads — verify karke live karein
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-center">
                  <p className={`text-lg font-extrabold leading-none ${isGoogleFallbackFilterOn ? "text-white" : "text-blue-700 dark:text-blue-300"}`} data-testid="text-gfallback-today">
                    {gFallback.today.toLocaleString("en-IN")}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${isGoogleFallbackFilterOn ? "text-white/80" : "text-blue-600/70 dark:text-blue-400/70"}`}>Today</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-extrabold leading-none ${isGoogleFallbackFilterOn ? "text-white" : "text-blue-700 dark:text-blue-300"}`} data-testid="text-gfallback-week">
                    {gFallback.week.toLocaleString("en-IN")}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${isGoogleFallbackFilterOn ? "text-white/80" : "text-blue-600/70 dark:text-blue-400/70"}`}>7 days</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-extrabold leading-none ${isGoogleFallbackFilterOn ? "text-white" : "text-blue-700 dark:text-blue-300"}`} data-testid="text-gfallback-pending">
                    {gFallback.pending.toLocaleString("en-IN")}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${isGoogleFallbackFilterOn ? "text-white/80" : "text-blue-600/70 dark:text-blue-400/70"}`}>Pending</p>
                </div>
              </div>
            </div>
          </button>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["pending", "approved", "rejected", "all"] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className="shrink-0 text-xs h-7"
              onClick={() => setFilter2(f)}
              data-testid={`filter-${f}`}
            >
              {filterLabels[f]}
              {filter === f && total > 0 && ` (${total.toLocaleString("en-IN")})`}
            </Button>
          ))}
        </div>

        {/* Sort By + Filter Button row */}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Sort By</Label>
            <Select value={sortBy || "_default"} onValueChange={(val) => { setSortBy(val === "_default" ? "" : val); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-sort">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_default">Default (Latest)</SelectItem>
                <SelectItem value="name-asc">Name A→Z</SelectItem>
                <SelectItem value="name-desc">Name Z→A</SelectItem>
                <SelectItem value="date-newest">Date (Newest)</SelectItem>
                <SelectItem value="date-oldest">Date (Oldest)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant={filterOpen || activeFilterCount > 0 ? "default" : "outline"}
            className="h-8 gap-1.5 px-3 text-xs shrink-0"
            onClick={() => setFilterOpen(o => !o)}
            data-testid="button-toggle-filter"
          >
            <Filter className="w-3.5 h-3.5" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-0.5 bg-white/30 rounded-full px-1.5 py-0 text-[10px] font-bold">{activeFilterCount}</span>
            )}
          </Button>
        </div>

        {/* Unified Filter Panel */}
        {filterOpen && (
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-3">
            {/* Co-Admin section */}
            {availableCoAdmins.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Added By (Co-Admin)</p>
                <div className="flex flex-wrap gap-2">
                  {availableCoAdmins.map(ca => {
                    const checked = selectedCoAdmins.includes(ca);
                    return (
                      <button
                        key={ca}
                        onClick={() => toggleCoAdmin(ca)}
                        data-testid={`filter-coadmin-${ca}`}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                          checked
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-white dark:bg-slate-800 text-foreground border-slate-300 dark:border-slate-600"
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                          checked ? "bg-white/30 border-white/50" : "border-slate-400 dark:border-slate-500"
                        }`}>
                          {checked && <span className="text-[8px] font-bold">✓</span>}
                        </span>
                        {labelForCoAdmin(ca)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Group section — always show A/B/C/D */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Group (A/B/C/D)</p>
              <div className="flex flex-wrap gap-2">
                {availableGroupLabels.map(label => {
                  const checked = selectedGroups.includes(label);
                  const cnt = groupCountMap[label];
                  return (
                    <button
                      key={label}
                      onClick={() => toggleGroup(label)}
                      data-testid={`filter-group-${label}`}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                        checked
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-white dark:bg-slate-800 text-foreground border-slate-300 dark:border-slate-600"
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                        checked ? "bg-white/30 border-white/50" : "border-slate-400 dark:border-slate-500"
                      }`}>
                        {checked && <span className="text-[8px] font-bold">✓</span>}
                      </span>
                      Group {label}
                      {cnt !== undefined && <span className="opacity-60 font-normal">({cnt.toLocaleString()})</span>}
                    </button>
                  );
                })}
              </div>
              {Object.keys(groupCountMap).length === 0 && (
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Groups abhi assign nahi hue — Admin se Import tab mein "A/B/C/D Groups Assign Karein" click karwayein
                </p>
              )}
            </div>

            {/* Clear button */}
            {activeFilterCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive hover:text-destructive w-full"
                onClick={clearAllFilters}
                data-testid="button-clear-filters"
              >
                <X className="w-3 h-3 mr-1" /> Sab filters hatao
              </Button>
            )}
          </div>
        )}

        {/* Active filter chips */}
        {activeFilterCount > 0 && !filterOpen && (
          <div className="flex flex-wrap gap-1.5">
            {selectedCoAdmins.map(ca => (
              <span
                key={ca}
                className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 text-xs font-medium"
              >
                {labelForCoAdmin(ca)}
                <button onClick={() => toggleCoAdmin(ca)} className="ml-0.5 opacity-70 hover:opacity-100" data-testid={`chip-remove-coadmin-${ca}`}>
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            {selectedGroups.map(g => (
              <span
                key={g}
                className="inline-flex items-center gap-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-full px-2.5 py-0.5 text-xs font-bold"
              >
                Group {g}
                <button onClick={() => toggleGroup(g)} className="ml-0.5 opacity-70 hover:opacity-100" data-testid={`chip-remove-group-${g}`}>
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            <button onClick={clearAllFilters} className="text-xs text-muted-foreground underline" data-testid="chip-clear-all">
              Clear all
            </button>
          </div>
        )}

        {/* Pagination info */}
        {total > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page} of {totalPages} • {total.toLocaleString("en-IN")} total
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                data-testid="button-next-page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : list.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Koi entry nahi mili</p>
            {debouncedSearch && <p className="text-xs mt-1">"{debouncedSearch}" ke liye koi result nahi</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((pp: any) => {
              const isEditing = editOpen[pp.id] || false;
              const ed = editData[pp.id] || { serviceName: pp.serviceName || "", address: pp.address || "", district: pp.district || "", approxCharge: pp.approxCharge || "" };
              const noService = !pp.serviceName || pp.serviceName.trim() === "";
              return (
                <Card key={pp.id} className={pp.status === "pending" ? "border-yellow-300 dark:border-yellow-700" : ""}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex gap-3">
                      {pp.profilePhoto ? (
                        <img src={pp.profilePhoto} className="w-12 h-12 rounded-full object-cover shrink-0" alt={pp.name} />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="w-6 h-6 text-primary/60" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="font-semibold text-sm">{pp.name}</p>
                            {noService ? (
                              <p className="text-xs text-orange-500 font-medium">⚠ Service name missing</p>
                            ) : (
                              <p className="text-xs text-muted-foreground">{pp.serviceName}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {pp.source === "meta" && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-semibold border border-orange-200 dark:border-orange-700/40">
                                📣 Meta
                              </span>
                            )}
                            {!pp.mobile && !(pp.mobileNumbers?.length > 0) && pp.status === "pending" && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-semibold border border-red-200 dark:border-red-700/40" title="No mobile number — call won't work after approval">
                                📵 No Mobile
                              </span>
                            )}
                            {pp.groupLabel && (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                                {pp.groupLabel}
                              </span>
                            )}
                            <Badge className={`text-xs ${STATUS_COLORS[pp.status] || ""}`}>
                              {STATUS_LABELS[pp.status] || pp.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                          <p><span className="font-medium text-foreground">Mobile:</span> {pp.mobile || (pp.mobileNumbers?.[0]) || "—"}</p>
                          {pp.mobileNumbers?.length > 1 && <p>+{pp.mobileNumbers.length - 1} more numbers</p>}
                          {pp.address && <p><span className="font-medium text-foreground">Area:</span> {pp.address}</p>}
                          {pp.district && <p><span className="font-medium text-foreground">District:</span> {pp.district}</p>}
                          {pp.approxCharge && <p><span className="font-medium text-foreground">Charge:</span> {pp.approxCharge}</p>}
                          <p className="text-xs pt-0.5 border-t mt-1">
                            Added by: <span className="font-medium text-foreground">{pp.addedBy}</span> • {new Date(pp.createdAt).toLocaleDateString("en-IN")}
                          </p>
                          {pp.notes && <p className="text-xs text-destructive">Note: {pp.notes}</p>}
                        </div>
                      </div>
                    </div>

                    {/* Inline Edit Form */}
                    {isEditing && pp.status === "pending" && (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        <p className="text-xs font-semibold text-foreground">Details Fill Karein:</p>
                        <div className="space-y-1.5">
                          <div>
                            <Label className="text-xs">Service / Kaam <span className="text-destructive">*</span></Label>
                            <Input
                              value={ed.serviceName}
                              onChange={e => setEditData(prev => ({ ...prev, [pp.id]: { ...ed, serviceName: e.target.value } }))}
                              placeholder="e.g. Electrician, Plumber, Carpenter..."
                              className="h-8 text-xs mt-0.5"
                              data-testid={`input-service-${pp.id}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Address / Area</Label>
                            <Input
                              value={ed.address}
                              onChange={e => setEditData(prev => ({ ...prev, [pp.id]: { ...ed, address: e.target.value } }))}
                              placeholder="e.g. MG Road, Budaun..."
                              className="h-8 text-xs mt-0.5"
                              data-testid={`input-address-${pp.id}`}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">District</Label>
                              <Input
                                value={ed.district}
                                onChange={e => setEditData(prev => ({ ...prev, [pp.id]: { ...ed, district: e.target.value } }))}
                                placeholder="e.g. Budaun"
                                className="h-8 text-xs mt-0.5"
                                data-testid={`input-district-${pp.id}`}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Charge (approx)</Label>
                              <Input
                                value={ed.approxCharge}
                                onChange={e => setEditData(prev => ({ ...prev, [pp.id]: { ...ed, approxCharge: e.target.value } }))}
                                placeholder="e.g. ₹200-500"
                                className="h-8 text-xs mt-0.5"
                                data-testid={`input-charge-${pp.id}`}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-8 text-xs gap-1"
                            onClick={() => setEditOpen(prev => ({ ...prev, [pp.id]: false }))}
                            data-testid={`button-cancel-edit-${pp.id}`}
                          >
                            <X className="w-3 h-3" /> Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-xs gap-1"
                            onClick={() => saveFields.mutate({ id: pp.id, data: ed })}
                            disabled={saveFields.isPending}
                            data-testid={`button-save-edit-${pp.id}`}
                          >
                            {saveFields.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {pp.status === "pending" && (
                      <div className="space-y-2 mt-3 pt-3 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-8 text-xs gap-1.5 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"
                          onClick={() => {
                            const num = pp.mobile || pp.mobileNumbers?.[0];
                            if (num) {
                              window.open(`tel:${num}`, "_self");
                              fetch("/api/coadmin/log-call", { method: "POST", credentials: "include" }).catch(() => {});
                            }
                          }}
                          data-testid={`button-call-${pp.id}`}
                        >
                          <Phone className="w-3.5 h-3.5" /> Call
                        </Button>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-8 text-xs gap-1 ${isEditing ? "border-primary text-primary" : "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400"}`}
                            onClick={() => isEditing ? setEditOpen(prev => ({ ...prev, [pp.id]: false })) : openEdit(pp)}
                            data-testid={`button-edit-${pp.id}`}
                          >
                            <Pencil className="w-3 h-3" /> {isEditing ? "Close" : "Edit"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1 border-green-300 text-green-600 dark:border-green-700 dark:text-green-400"
                            onClick={() => {
                              const num = pp.mobile || pp.mobileNumbers?.[0];
                              if (num) window.location.href = `https://api.whatsapp.com/send?phone=${num.replace(/\D/g, '')}`;
                            }}
                            data-testid={`button-whatsapp-${pp.id}`}
                          >
                            💬 WhatsApp
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1 border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
                            onClick={() => handleReject(pp)}
                            disabled={updateStatus.isPending}
                            data-testid={`button-reject-${pp.id}`}
                          >
                            <XCircle className="w-3 h-3" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleApprove(pp)}
                            disabled={updateStatus.isPending}
                            data-testid={`button-approve-${pp.id}`}
                          >
                            {updateStatus.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Approve
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Bottom pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2 pb-6">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              data-testid="button-prev-page-bottom"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              data-testid="button-next-page-bottom"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
