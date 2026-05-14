import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Home, Coins, Plus, Minus, Tag, TrendingDown, Phone, Briefcase, X, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { BackButton } from "@/components/BackButton";

export default function CustomerBalancePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [buyAmount, setBuyAmount] = useState(10);
  const [promoInput, setPromoInput] = useState("");
  const [selectedCaller, setSelectedCaller] = useState<any | null>(null);
  const [callingBack, setCallingBack] = useState(false);

  const { data: credits } = useQuery<{ freeCredits: number; purchasedCredits: number; totalCredits: number }>({
    queryKey: ["/api/credits/me"],
    queryFn: async () => {
      const res = await fetch("/api/credits/me", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const { data: callHistory } = useQuery({
    queryKey: ["/api/calls/customer"],
    queryFn: async () => {
      const res = await fetch("/api/calls/customer", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: myJobs } = useQuery({
    queryKey: ["/api/jobs/my"],
    queryFn: async () => {
      const res = await fetch("/api/jobs/my", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: providerCallsData } = useQuery({
    queryKey: ["/api/calls/provider"],
    queryFn: async () => {
      const res = await fetch("/api/calls/provider", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const purchaseCredits = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cashfree/create-order", { credits: buyAmount });
      return res.json();
    },
    onSuccess: (data: { paymentSessionId: string; orderId: string; cfMode?: string }) => {
      window.location.href = `/payment/checkout?session_id=${encodeURIComponent(data.paymentSessionId)}&order_id=${encodeURIComponent(data.orderId)}&credits=${buyAmount}&mode=${data.cfMode || "sandbox"}`;
    },
    onError: () => {
      toast({ title: "Purchase failed", description: "Could not start payment. Please try again.", variant: "destructive" });
    },
  });

  const applyPromo = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/promo-codes/apply", { code: promoInput.trim() });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Promo code apply ho gaya!", description: data.message });
      setPromoInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/credits/me"] });
    },
    onError: (err: any) => {
      toast({ title: "Promo code galat hai", description: err.message || "Invalid promo code", variant: "destructive" });
    },
  });

  const makeCallBack = async () => {
    if (!selectedCaller) return;
    setCallingBack(true);
    try {
      const cleanNumber = selectedCaller.callerPhone?.replace(/[^0-9+]/g, "");
      if (!cleanNumber) {
        toast({ title: "Number not available", variant: "destructive" });
        return;
      }
      window.location.href = `tel:${cleanNumber}`;
      queryClient.invalidateQueries({ queryKey: ["/api/credits/me"] });
    } catch (e: any) {
      toast({ title: "Call failed", description: e.message || "Try again", variant: "destructive" });
    } finally {
      setCallingBack(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/customer/home")} data-testid="button-home">
          <Home className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">My Credits</h1>
      </header>

      <main className="p-4 max-w-md mx-auto space-y-4">
        <Card>
          <CardContent className="p-6 text-center">
            <Coins className="w-10 h-10 mx-auto mb-2 text-primary" />
            <p className="text-4xl font-bold" data-testid="text-total-credits">{credits?.totalCredits ?? 0}</p>
            <p className="text-sm text-muted-foreground mt-1">Total Credits Available</p>
            <p className="text-xs text-muted-foreground mt-1">1 credit = Rs.1 • Credits kabhi expire nahi hote</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Coins className="w-4 h-4" /> Credits Khareedo
            </h3>
            <p className="text-sm text-muted-foreground mb-3">1 credit = Rs.1. Har call mein 1 credit lagta hai.</p>
            <div className="flex items-center gap-3 mb-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setBuyAmount(Math.max(1, buyAmount - 1))}
                data-testid="button-decrease-amount"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                min={1}
                max={10000}
                value={buyAmount}
                onChange={(e) => setBuyAmount(Math.max(1, Math.min(10000, parseInt(e.target.value) || 1)))}
                className="text-center text-lg font-bold w-24"
                data-testid="input-buy-amount"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setBuyAmount(Math.min(10000, buyAmount + 1))}
                data-testid="button-increase-amount"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-2 mb-3">
              {[10, 50, 100, 500].map((amt) => (
                <Button
                  key={amt}
                  variant={buyAmount === amt ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBuyAmount(amt)}
                  className="flex-1"
                  data-testid={`button-preset-${amt}`}
                >
                  {amt}
                </Button>
              ))}
            </div>
            <div className="text-center mb-3 p-2 bg-muted rounded-md">
              <p className="text-lg font-bold">Rs.{buyAmount}</p>
              <p className="text-xs text-muted-foreground">for {buyAmount} credits</p>
            </div>
            <Button
              className="w-full"
              onClick={() => purchaseCredits.mutate()}
              disabled={purchaseCredits.isPending}
              data-testid="button-buy-credits"
            >
              {buyAmount} Credits Khareedo (Rs.{buyAmount})
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4" /> Promo Code Lagao
            </h3>
            <div className="flex gap-2">
              <Input
                value={promoInput}
                onChange={e => setPromoInput(e.target.value)}
                placeholder="Promo code enter karo"
                className="flex-1"
                data-testid="input-promo-code"
              />
              <Button
                onClick={() => applyPromo.mutate()}
                disabled={!promoInput.trim() || applyPromo.isPending}
                data-testid="button-apply-promo"
              >
                Apply
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Valid promo code se free credits milte hain</p>
          </CardContent>
        </Card>

        <Card className="border-blue-100 dark:border-blue-900">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-blue-600" /> Credits Ka Istemal
            </h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium">Calls Made</p>
                    <p className="text-xs text-muted-foreground">1 credit per call</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{callHistory?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">{(callHistory?.length || 0) * 1} used</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">Calls Received</p>
                    <p className="text-xs text-muted-foreground">1 credit per call</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{providerCallsData?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">{(providerCallsData?.length || 0) * 1} used</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium">Jobs Posted</p>
                    <p className="text-xs text-muted-foreground">25 credits per job</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{myJobs?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">{((myJobs?.length || 0) * 25)} used</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900">
                <p className="text-sm font-semibold">Total Credits Used</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">
                  {((callHistory?.length || 0) * 1) + ((providerCallsData?.length || 0) * 1) + ((myJobs?.length || 0) * 25)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Activity History</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {!callHistory?.length && !myJobs?.length && !providerCallsData?.length ? (
                <p className="text-xs text-muted-foreground text-center py-4">Koi activity abhi tak nahi</p>
              ) : (
                <>
                  {callHistory?.map((call: any) => (
                    <div key={`call-${call.id}`} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/30 border-l-2 border-blue-400">
                      <Phone className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">Aapne {call.providerName} ko call kiya</p>
                        <p className="text-xs text-muted-foreground">{call.serviceName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{call.timestamp ? new Date(call.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p>
                      </div>
                      <span className="text-xs font-bold text-blue-600 shrink-0">-1</span>
                    </div>
                  ))}
                  {providerCallsData?.map((call: any) => (
                    <button
                      key={`received-${call.id}`}
                      onClick={() => setSelectedCaller(call)}
                      className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/50 border-l-2 border-green-400 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground hover:underline">{call.customerName} ne aapko call kiya</p>
                        <p className="text-xs text-muted-foreground">Call received</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{call.timestamp ? new Date(call.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p>
                      </div>
                      <span className="text-xs font-bold text-green-600 shrink-0">-1</span>
                    </button>
                  ))}
                  {myJobs?.map((job: any) => (
                    <div key={`job-${job.id}`} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/30 border-l-2 border-amber-400">
                      <Briefcase className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{job.jobName}</p>
                        <p className="text-xs text-muted-foreground">Job posted</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{job.createdAt ? new Date(job.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p>
                      </div>
                      <span className="text-xs font-bold text-amber-600 shrink-0">-25</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2 text-sm">Credits ke baare mein</h3>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Signup par 25 free credits milte hain</li>
              <li>• Har call mein 1 credit lagta hai (aap + provider dono se)</li>
              <li>• 1 credit = Rs.1</li>
              <li>• Credits kabhi expire nahi hote</li>
              <li>• Promo code se extra credits mil sakte hain</li>
            </ul>
          </CardContent>
        </Card>
      </main>

      {/* ── CALLER PROFILE MODAL ─────────────────── */}
      {selectedCaller && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" data-testid="caller-modal">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedCaller(null)} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl pb-8 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="px-5 pb-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">{selectedCaller.customerName}</h3>
                <p className="text-sm text-muted-foreground">Call back karein</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedCaller(null)} data-testid="button-close-caller">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="px-5 pt-4 space-y-4">
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4">
                <p className="text-xs text-muted-foreground mb-1">Call Details</p>
                <p className="text-sm font-medium mb-2">{selectedCaller.customerName}</p>
                <p className="text-xs text-muted-foreground mb-3">Timestamp: {selectedCaller.timestamp ? new Date(selectedCaller.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p>
                <Button
                  className="w-full bg-green-500 hover:bg-green-600 text-white h-11 rounded-lg font-semibold gap-2"
                  onClick={makeCallBack}
                  disabled={callingBack || !selectedCaller.callerPhone}
                  data-testid="button-call-back"
                >
                  {callingBack ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                  {!selectedCaller.callerPhone ? "Number N/A" : callingBack ? "Calling..." : "Call Back Karein"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">1 credit deduct hoga call se</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
