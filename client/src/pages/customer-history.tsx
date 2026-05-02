import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Phone, Clock, Sparkles, CreditCard } from "lucide-react";
import { useLocation } from "wouter";
import type { CallLog, SubscriptionPlan } from "@shared/schema";
import { useLanguage } from "@/lib/language";
import { PlanTick } from "@/components/PlanTick";

type PaymentItem = {
  kind: "credits" | "subscription";
  id: string;
  amount: number;
  createdAt: string;
  label: string;
  meta: {
    plan?: SubscriptionPlan;
    billingCycle?: "monthly" | "yearly";
    status?: string;
    endDate?: string | null;
    grantedBy?: string | null;
    paymentId?: string | null;
    orderId?: string;
    credits?: number;
  };
};

export default function CustomerHistoryPage() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const { data: history, isLoading } = useQuery<CallLog[]>({ queryKey: ["/api/calls/customer"] });
  const { data: payments } = useQuery<{ items: PaymentItem[] }>({
    queryKey: ["/api/payments/me"],
  });
  const items = payments?.items || [];

  // Reason label map: includes new subscription-driven reasons.
  const reasonLabel = (r: string | null | undefined) => {
    switch (r || "normal") {
      case "customer_no_balance": return t("callReasonCustomerNoBalance");
      case "provider_no_balance": return t("callReasonProviderNoBalance");
      case "subscription_free_both": return "Free call · Premium provider";
      case "subscription_free_outgoing": return "Free call · your Premium plan";
      case "subscription_free_incoming": return "Free call · provider Pro";
      default: return t("callReasonNormal");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/customer/home")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Activity History</h1>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-3">
        {/* Unified payment timeline: credit purchases + subscription purchases */}
        {items.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Payments</h2>
            {items.map((it) => (
              <Card
                key={it.id}
                data-testid={`card-payment-${it.id}`}
                className={
                  it.kind === "subscription"
                    ? "border-amber-200 dark:border-amber-800"
                    : "border-emerald-200 dark:border-emerald-800"
                }
              >
                <CardContent className="p-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    {it.kind === "subscription" ? (
                      <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    ) : (
                      <CreditCard className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {it.kind === "subscription" && it.meta.plan && (
                          <PlanTick plan={it.meta.plan} size={14} />
                        )}
                        <p className="font-medium text-sm capitalize truncate" data-testid={`text-payment-label-${it.id}`}>
                          {it.kind === "subscription" ? `Subscription · ${it.label}` : `Credits · ${it.label}`}
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(it.createdAt).toLocaleDateString()}
                        {it.kind === "subscription" && it.meta.endDate && (
                          <> · ends {new Date(it.meta.endDate).toLocaleDateString()}</>
                        )}
                        {it.kind === "subscription" && it.meta.status && (
                          <> · {it.meta.status}</>
                        )}
                        {it.kind === "subscription" && it.meta.grantedBy && (
                          <> · admin granted</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm" data-testid={`text-payment-amount-${it.id}`}>₹{it.amount}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Calls */}
        {(history?.length || items.length > 0) ? (
          <h2 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide pt-2">Calls</h2>
        ) : null}
        {isLoading && <p className="text-center text-muted-foreground py-8">Loading...</p>}
        {history && history.length === 0 && items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No activity yet</p>
          </div>
        )}
        {history?.map((call) => (
          <Card key={call.id} data-testid={`card-call-${call.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{call.providerName}</p>
                  <p className="text-sm text-primary">{call.serviceName}</p>
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {call.timestamp ? new Date(call.timestamp).toLocaleString() : "Unknown"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs px-2 py-1 rounded-md bg-muted">{call.paymentStatus}</span>
                  <span className="text-xs font-semibold text-foreground" data-testid={`text-credits-${call.id}`}>
                    {t("creditsCharged").replace("{n}", String(call.creditsCharged ?? 1))}
                  </span>
                  <span className="text-[10px] text-muted-foreground" data-testid={`text-reason-${call.id}`}>
                    {reasonLabel(call.chargeReason)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </main>
    </div>
  );
}
