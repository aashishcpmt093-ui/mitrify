import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Phone, Clock } from "lucide-react";
import { useLocation } from "wouter";
import type { CallLog } from "@shared/schema";
import { useLanguage } from "@/lib/language";

export default function CustomerHistoryPage() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const { data: history, isLoading } = useQuery<CallLog[]>({ queryKey: ["/api/calls/customer"] });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/customer/home")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Call History</h1>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-3">
        {isLoading && <p className="text-center text-muted-foreground py-8">Loading...</p>}
        {history && history.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No call history yet</p>
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
                    {(() => {
                      const r = call.chargeReason || "normal";
                      if (r === "customer_no_balance") return t("callReasonCustomerNoBalance");
                      if (r === "provider_no_balance") return t("callReasonProviderNoBalance");
                      return t("callReasonNormal");
                    })()}
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
