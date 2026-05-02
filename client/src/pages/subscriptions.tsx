import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import { PlanTick } from "@/components/PlanTick";
import type { SubscriptionPlanConfig, SubscriptionResponse, SubscriptionPlan } from "@shared/schema";
import { useHomeRoute } from "@/hooks/use-auth";
import { useLanguage } from "@/lib/language";

type Plan = "boost" | "pro" | "premium";
type Cycle = "monthly" | "yearly";

const PLAN_ORDER: Plan[] = ["boost", "pro", "premium"];

const PLAN_STYLE: Record<Plan, { accent: string; tickColor: string }> = {
  boost: {
    accent: "border-slate-300 dark:border-slate-600",
    tickColor: "text-slate-500",
  },
  pro: {
    accent: "border-yellow-300 dark:border-yellow-600",
    tickColor: "text-yellow-500",
  },
  premium: {
    accent: "border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-100 dark:ring-emerald-900/40",
    tickColor: "text-emerald-500",
  },
};

export default function SubscriptionsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const homeRoute = useHomeRoute();

  const planTitle = (p: Plan): string => p === "boost" ? t("subBoost") : p === "pro" ? t("subPro") : t("subPremium");
  const planTagline = (p: Plan): string => p === "boost" ? t("subBoostTagline") : p === "pro" ? t("subProTagline") : t("subPremiumTagline");

  const { data: cfg } = useQuery<SubscriptionPlanConfig>({
    queryKey: ["/api/subscriptions/config"],
    queryFn: async () => (await fetch("/api/subscriptions/config")).json(),
  });

  const { data: mine } = useQuery<{ active: SubscriptionResponse | null; history: SubscriptionResponse[] }>({
    queryKey: ["/api/subscriptions/me"],
  });

  const subscribe = useMutation<
    { paymentSessionId: string; orderId: string; cfMode?: string; plan: Plan; cycle: Cycle },
    Error,
    { plan: Plan }
  >({
    mutationFn: async (vars) => {
      const res = await apiRequest("POST", "/api/cashfree/create-order", {
        kind: "subscription",
        plan: vars.plan,
        cycle,
      });
      const data = (await res.json()) as { paymentSessionId: string; orderId: string; cfMode?: string };
      return { ...data, plan: vars.plan, cycle };
    },
    onSuccess: (data) => {
      const q = new URLSearchParams({
        session_id: data.paymentSessionId,
        order_id: data.orderId,
        kind: "subscription",
        plan: data.plan,
        cycle: data.cycle,
        mode: data.cfMode || "sandbox",
      });
      window.location.href = `/payment/checkout?${q.toString()}`;
    },
    onError: () => {
      toast({ title: t("subPaymentError"), description: t("subPaymentErrorDesc"), variant: "destructive" });
    },
  });

  const activePlan: SubscriptionPlan = (mine?.active?.plan as SubscriptionPlan) || "none";
  const activeEnd = mine?.active?.endDate ? new Date(mine.active.endDate) : null;
  const daysRemaining = activeEnd ? Math.max(0, Math.ceil((activeEnd.getTime() - Date.now()) / 86400000)) : 0;

  const buttonLabel = (plan: Plan) => {
    if (activePlan === "none") return t("subSubscribe");
    if (activePlan === plan) return t("subRenew");
    const rank: Record<SubscriptionPlan, number> = { none: 0, boost: 1, pro: 2, premium: 3 };
    return rank[plan] > rank[activePlan] ? t("subUpgrade") : t("subSwitch");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation(homeRoute)} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" /> {t("subTitle")}
        </h1>
      </header>

      <main className="p-4 max-w-md mx-auto space-y-4">
        {/* Current plan banner */}
        {activePlan !== "none" && mine?.active && (
          <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <PlanTick plan={activePlan} size={22} />
              <div className="flex-1">
                <p className="font-semibold text-sm" data-testid="text-active-plan">
                  {planTitle(activePlan as Plan)} {t("subActiveLabel")}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="text-active-days">
                  {daysRemaining} {daysRemaining === 1 ? t("subDayRemaining") : t("subDaysRemaining")}
                  {activeEnd ? ` · ${t("subEnds")} ${activeEnd.toLocaleDateString()}` : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cycle toggle */}
        <div className="flex gap-2 bg-muted p-1 rounded-lg">
          {(["monthly", "yearly"] as Cycle[]).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${cycle === c ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              data-testid={`button-cycle-${c}`}
            >
              {c === "monthly" ? t("subMonthly") : t("subYearly")}
              {c === "yearly" && <span className="ml-1 text-[10px] text-emerald-600 font-bold">{t("subSave")}</span>}
            </button>
          ))}
        </div>

        {/* Plan cards */}
        {!cfg && <div className="text-center text-muted-foreground py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>}
        {cfg && PLAN_ORDER.map((p) => {
          const style = PLAN_STYLE[p];
          const price = cfg[p][cycle];
          const monthlyEquiv = cycle === "yearly" ? Math.round(price / 12) : price;
          const isCurrent = activePlan === p;
          return (
            <Card key={p} className={`${style.accent}`} data-testid={`card-plan-${p}`}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <PlanTick plan={p as SubscriptionPlan} size={18} />
                      <h3 className="font-bold text-lg">{planTitle(p)}</h3>
                      {isCurrent && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-white font-semibold">{t("subActiveBadge")}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{planTagline(p)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold" data-testid={`text-price-${p}`}>₹{price}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {cycle === "yearly" ? `≈ ₹${monthlyEquiv}${t("subPerYearMo")}` : t("subPerMonth")}
                    </p>
                  </div>
                </div>

                <ul className="space-y-1.5">
                  {cfg[p].perks.map((perk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <Check className={`w-4 h-4 ${style.tickColor} mt-0.5 shrink-0`} />
                      <span className="text-foreground/80">{perk}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  onClick={() => subscribe.mutate({ plan: p })}
                  disabled={subscribe.isPending}
                  data-testid={`button-subscribe-${p}`}
                >
                  {subscribe.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {buttonLabel(p)} · ₹{price}
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {/* History */}
        {(mine?.history?.length ?? 0) > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">{t("subHistory")}</h3>
              <div className="space-y-2">
                {mine!.history.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 text-xs border-b border-border last:border-0 pb-2 last:pb-0" data-testid={`row-sub-${s.id}`}>
                    <div className="flex items-center gap-2">
                      <PlanTick plan={s.plan as SubscriptionPlan} size={14} />
                      <div>
                        <p className="font-medium">{(s.plan as string).toUpperCase()} · {s.billingCycle}</p>
                        <p className="text-muted-foreground">
                          {t("subEnds")} {s.endDate ? new Date(s.endDate).toLocaleDateString() : "?"} · {s.status}
                          {s.grantedBy ? ` · ${t("subAdminGranted")}` : ""}
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold">₹{s.amount}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-[11px] text-muted-foreground text-center pt-2">
          {t("subFooter")}
        </p>
      </main>
    </div>
  );
}
