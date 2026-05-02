import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Coins, Phone, Settings, Plus, History, ChevronRight } from "lucide-react";
import { useLanguage } from "@/lib/language";

export default function MyProfilePage() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();

  const { data: credits } = useQuery<{ freeCredits: number; purchasedCredits: number; totalCredits: number }>({
    queryKey: ["/api/credits/me"],
    queryFn: async () => {
      const res = await fetch("/api/credits/me", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: providerProfile } = useQuery({
    queryKey: ["/api/profiles/me", "provider"],
    queryFn: async () => {
      const res = await fetch("/api/profiles/me?role=provider", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: callsMade } = useQuery({
    queryKey: ["/api/calls/customer"],
    queryFn: async () => {
      const res = await fetch("/api/calls/customer", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: callsReceived } = useQuery({
    queryKey: ["/api/calls/provider"],
    queryFn: async () => {
      const res = await fetch("/api/calls/provider", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!providerProfile,
  });

  const editProfileRoute = providerProfile ? "/provider/edit-profile" : "/customer/edit-profile";

  const allCalls: Array<{
    id: string;
    type: "made" | "received";
    title: string;
    subtitle: string;
    timestamp: string | null;
    credits: number;
  }> = [
    ...(callsMade || []).map((c: any) => ({
      id: `made-${c.id}`,
      type: "made" as const,
      title: `Aapne ${c.providerName || "Provider"} ko call kiya`,
      subtitle: c.serviceName || "",
      timestamp: c.timestamp,
      credits: typeof c.creditsCharged === "number" ? c.creditsCharged : 1,
    })),
    ...(callsReceived || []).map((c: any) => ({
      id: `received-${c.id}`,
      type: "received" as const,
      title: `${c.customerName || "Customer"} ne aapko call kiya`,
      subtitle: "Call received",
      timestamp: c.timestamp,
      credits: typeof c.creditsCharged === "number" ? c.creditsCharged : 1,
    })),
  ].sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tB - tA;
  });

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/customer/home");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">{t("myProfile")}</h1>
      </header>

      <main className="p-4 max-w-md mx-auto space-y-4 pb-12">
        {/* Credit Information */}
        <Card data-testid="card-credit-info">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Coins className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">Credit Information</h2>
            </div>
            <div className="text-center mb-4">
              <p className="text-4xl font-bold" data-testid="text-total-credits">{credits?.totalCredits ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Credits Available</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="rounded-lg p-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-center">
                <p className="text-xs text-muted-foreground">Free</p>
                <p className="font-bold text-emerald-600 dark:text-emerald-400" data-testid="text-free-credits">{credits?.freeCredits ?? 0}</p>
              </div>
              <div className="rounded-lg p-2.5 bg-blue-50 dark:bg-blue-900/20 text-center">
                <p className="text-xs text-muted-foreground">Purchased</p>
                <p className="font-bold text-blue-600 dark:text-blue-400" data-testid="text-purchased-credits">{credits?.purchasedCredits ?? 0}</p>
              </div>
            </div>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => setLocation("/customer/balance")}
              data-testid="button-buy-credits"
            >
              <Plus className="w-4 h-4 mr-2" /> Buy More Credits
            </Button>
          </CardContent>
        </Card>

        {/* Edit Profile — highlighted */}
        <button
          type="button"
          onClick={() => setLocation(editProfileRoute)}
          className="w-full text-left rounded-xl border-2 border-primary/40 bg-gradient-to-r from-primary/15 to-primary/5 dark:from-primary/25 dark:to-primary/10 p-4 hover:from-primary/25 hover:to-primary/10 transition-all shadow-sm"
          data-testid="button-edit-profile"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-primary">{t("editProfile")}</p>
                <p className="text-xs text-muted-foreground">Naam, mobile, photo aur login details badlein</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-primary shrink-0" />
          </div>
        </button>

        {/* Call History */}
        <Card data-testid="card-call-history">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold">{t("callHistory")}</h3>
            </div>
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {allCalls.length === 0 ? (
                <div className="text-center py-8" data-testid="empty-call-history">
                  <Phone className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Koi call history abhi tak nahi</p>
                </div>
              ) : (
                allCalls.map(call => (
                  <div
                    key={call.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border-l-2 ${call.type === "made" ? "border-blue-400 bg-blue-50/40 dark:bg-blue-900/10" : "border-green-400 bg-green-50/40 dark:bg-green-900/10"}`}
                    data-testid={`row-call-${call.id}`}
                  >
                    <Phone className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${call.type === "made" ? "text-blue-600" : "text-green-600"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{call.title}</p>
                      {call.subtitle && <p className="text-[11px] text-muted-foreground truncate">{call.subtitle}</p>}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {call.timestamp ? new Date(call.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                      </p>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${call.type === "made" ? "text-blue-600" : "text-green-600"}`}>-{call.credits}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
