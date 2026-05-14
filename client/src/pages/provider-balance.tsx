import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Home, Coins, Plus, Minus, Tag } from "lucide-react";
import { useLocation } from "wouter";
import { BackButton } from "@/components/BackButton";

export default function ProviderBalancePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [buyAmount, setBuyAmount] = useState(10);
  const [promoInput, setPromoInput] = useState("");

  const { data: credits } = useQuery<{ freeCredits: number; purchasedCredits: number; totalCredits: number }>({
    queryKey: ["/api/credits/me"],
    queryFn: async () => {
      const res = await fetch("/api/credits/me", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/customer/home")} data-testid="button-home">
          <Home className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Provider Credits</h1>
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
            <p className="text-sm text-muted-foreground mb-3">1 credit = Rs.1. Har call receive karne par 1 credit lagta hai.</p>
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

        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2 text-sm">Credits ke baare mein</h3>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Signup par 25 free credits milte hain</li>
              <li>• Har call receive karne par 1 credit lagta hai</li>
              <li>• 1 credit = Rs.1</li>
              <li>• Credits kabhi expire nahi hote</li>
              <li>• Promo code se extra credits mil sakte hain</li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
