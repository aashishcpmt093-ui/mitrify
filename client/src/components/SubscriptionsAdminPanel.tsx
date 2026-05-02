import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Plus, Save, X, Loader2 } from "lucide-react";
import { PlanTick } from "@/components/PlanTick";
import type { SubscriptionPlanConfig, SubscriptionResponse, SubscriptionPlan } from "@shared/schema";

type Plan = "boost" | "pro" | "premium";
type Cycle = "monthly" | "yearly";

export function SubscriptionsAdminPanel() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");

  // ── Editable plan config ─────────────────────────────────────────────
  const { data: cfg } = useQuery<SubscriptionPlanConfig>({
    queryKey: ["/api/subscriptions/config"],
    queryFn: async () => (await fetch("/api/subscriptions/config")).json(),
  });
  const [draft, setDraft] = useState<SubscriptionPlanConfig | null>(null);
  const effectiveCfg = draft || cfg || null;

  const saveCfg = useMutation({
    mutationFn: async (next: SubscriptionPlanConfig) => {
      const res = await apiRequest("PUT", "/api/admin/subscriptions/config", next);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Plan config saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions/config"] });
      setDraft(null);
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const updateDraft = (plan: Plan, field: "monthly" | "yearly", value: number) => {
    const base = effectiveCfg!;
    setDraft({
      ...base,
      [plan]: { ...base[plan], [field]: value },
    });
  };
  const updatePerks = (plan: Plan, perksText: string) => {
    const base = effectiveCfg!;
    const perks = perksText.split("\n").map((s) => s.trim()).filter(Boolean);
    setDraft({ ...base, [plan]: { ...base[plan], perks } });
  };

  // ── All subscriptions list ───────────────────────────────────────────
  const { data: rows, isLoading: rowsLoading } = useQuery<SubscriptionResponse[]>({
    queryKey: ["/api/admin/subscriptions", search, statusFilter, planFilter],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (search) q.set("search", search);
      if (statusFilter !== "all") q.set("status", statusFilter);
      if (planFilter !== "all") q.set("plan", planFilter);
      const res = await fetch(`/api/admin/subscriptions?${q.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/subscriptions/${id}/cancel`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
    },
  });

  const [extendId, setExtendId] = useState<number | null>(null);
  const [extendDays, setExtendDays] = useState(30);
  const extendMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/subscriptions/${extendId}/extend`, { days: extendDays });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Extended" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      setExtendId(null);
    },
    onError: () => toast({ title: "Extend failed", variant: "destructive" }),
  });

  // ── Grant dialog ─────────────────────────────────────────────────────
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantUserId, setGrantUserId] = useState("");
  const [grantPlan, setGrantPlan] = useState<Plan>("boost");
  const [grantCycle, setGrantCycle] = useState<Cycle>("monthly");
  const [grantDays, setGrantDays] = useState<number>(30);

  const grantMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/subscriptions/grant", {
        userId: grantUserId.trim(),
        plan: grantPlan,
        cycle: grantCycle,
        days: grantDays,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription granted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      setGrantOpen(false);
      setGrantUserId("");
    },
    onError: () => toast({ title: "Grant failed", description: "Check user id.", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Subscription Plans</h3>
            <p className="text-xs text-muted-foreground">Edit prices & perks, view all subscribers, grant/cancel/extend.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setGrantOpen(true)} data-testid="button-grant-subscription">
          <Plus className="w-4 h-4 mr-1" /> Grant
        </Button>
      </div>

      {/* Plan config editor */}
      {effectiveCfg && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">Prices & Perks</h4>
              {draft && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)} data-testid="button-cancel-config">
                    <X className="w-4 h-4 mr-1" /> Discard
                  </Button>
                  <Button size="sm" onClick={() => saveCfg.mutate(draft!)} disabled={saveCfg.isPending} data-testid="button-save-config">
                    {saveCfg.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                    Save
                  </Button>
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["boost", "pro", "premium"] as Plan[]).map((plan) => (
                <div key={plan} className="rounded-xl border border-border p-3 space-y-2" data-testid={`config-${plan}`}>
                  <div className="flex items-center gap-1.5">
                    <PlanTick plan={plan} size={16} />
                    <span className="font-semibold capitalize text-sm">{plan}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase">Monthly ₹</Label>
                      <Input
                        type="number"
                        value={effectiveCfg[plan].monthly}
                        onChange={(e) => updateDraft(plan, "monthly", parseInt(e.target.value) || 0)}
                        data-testid={`input-monthly-${plan}`}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase">Yearly ₹</Label>
                      <Input
                        type="number"
                        value={effectiveCfg[plan].yearly}
                        onChange={(e) => updateDraft(plan, "yearly", parseInt(e.target.value) || 0)}
                        data-testid={`input-yearly-${plan}`}
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase">Perks (one per line)</Label>
                    <textarea
                      className="w-full h-24 text-xs rounded-md border border-border bg-background p-2 resize-none"
                      value={effectiveCfg[plan].perks.join("\n")}
                      onChange={(e) => updatePerks(plan, e.target.value)}
                      data-testid={`textarea-perks-${plan}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-3 grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Search by user id or payment id"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-subs"
          />
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger data-testid="select-plan-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              <SelectItem value="boost">Boost</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="superseded">Superseded</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Rows */}
      <Card>
        <CardContent className="p-0">
          {rowsLoading && (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" />
            </div>
          )}
          {!rowsLoading && (rows || []).length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">No subscriptions found.</div>
          )}
          <div className="divide-y divide-border">
            {(rows || []).map((s) => {
              const days = s.endDate ? Math.ceil((new Date(s.endDate).getTime() - Date.now()) / 86400000) : 0;
              return (
                <div key={s.id} className="p-3 flex items-center justify-between gap-3" data-testid={`admin-sub-row-${s.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <PlanTick plan={(s.plan || "none") as SubscriptionPlan} size={14} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-sub-userid-${s.id}`}>{s.userId}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.plan} · {s.billingCycle} · {s.status} · ₹{s.amount}
                        {" · "}
                        {s.endDate
                          ? days >= 0
                            ? `${days}d left (${new Date(s.endDate).toLocaleDateString()})`
                            : `expired ${new Date(s.endDate).toLocaleDateString()}`
                          : ""}
                        {s.grantedBy ? ` · by ${s.grantedBy}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => { setExtendId(s.id); setExtendDays(30); }}
                      data-testid={`button-extend-${s.id}`}
                    >
                      Extend
                    </Button>
                    {s.status === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-600 hover:text-red-700"
                        onClick={() => cancelMut.mutate(s.id)}
                        disabled={cancelMut.isPending}
                        data-testid={`button-cancel-${s.id}`}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Grant dialog */}
      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>User ID</Label>
              <Input
                value={grantUserId}
                onChange={(e) => setGrantUserId(e.target.value)}
                placeholder="e.g. 123e4567-..."
                data-testid="input-grant-userid"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Plan</Label>
                <Select value={grantPlan} onValueChange={(v) => setGrantPlan(v as Plan)}>
                  <SelectTrigger data-testid="select-grant-plan"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boost">Boost</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cycle</Label>
                <Select value={grantCycle} onValueChange={(v) => setGrantCycle(v as Cycle)}>
                  <SelectTrigger data-testid="select-grant-cycle"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Days</Label>
              <Input
                type="number"
                value={grantDays}
                onChange={(e) => setGrantDays(parseInt(e.target.value) || 0)}
                data-testid="input-grant-days"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGrantOpen(false)}>Cancel</Button>
            <Button
              onClick={() => grantMut.mutate()}
              disabled={grantMut.isPending || !grantUserId.trim()}
              data-testid="button-confirm-grant"
            >
              {grantMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend dialog */}
      <Dialog open={!!extendId} onOpenChange={(o) => !o && setExtendId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Days to add</Label>
            <Input
              type="number"
              value={extendDays}
              onChange={(e) => setExtendDays(parseInt(e.target.value) || 0)}
              data-testid="input-extend-days"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExtendId(null)}>Cancel</Button>
            <Button
              onClick={() => extendMut.mutate()}
              disabled={extendMut.isPending || extendDays <= 0}
              data-testid="button-confirm-extend"
            >
              {extendMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Extend +{extendDays}d
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SubscriptionsAdminPanel;
