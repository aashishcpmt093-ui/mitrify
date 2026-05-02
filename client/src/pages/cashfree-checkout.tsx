import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

declare global {
  interface Window {
    Cashfree: any;
  }
}

export default function CashfreeCheckoutPage() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const paymentSessionId = params.get("session_id");
  const orderId = params.get("order_id");
  const role = params.get("role") || "customer";
  const credits = params.get("credits") || "0";
  const cfMode = params.get("mode") || "sandbox";
  const kind = params.get("kind") || "credits";
  const plan = params.get("plan") || "";
  const cycle = params.get("cycle") || "";

  useEffect(() => {
    if (!paymentSessionId) {
      setError("Payment session not found");
      setLoading(false);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.onload = () => {
      try {
        const cashfree = window.Cashfree({
          mode: cfMode as "sandbox" | "production",
        });

        const successQuery = kind === "subscription"
          ? `kind=subscription&plan=${encodeURIComponent(plan)}&cycle=${encodeURIComponent(cycle)}&order_id=${orderId}`
          : `kind=credits&role=${role}&credits=${credits}&order_id=${orderId}`;
        cashfree.checkout({
          paymentSessionId: paymentSessionId,
          returnUrl: `${window.location.origin}/payment/success?${successQuery}`,
        });
        setLoading(false);
      } catch (err: any) {
        console.error("Cashfree checkout error:", err);
        setError("Failed to load payment page");
        setLoading(false);
      }
    };
    script.onerror = () => {
      setError("Failed to load payment SDK");
      setLoading(false);
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [paymentSessionId]);

  const goBack = () => {
    if (kind === "subscription") {
      setLocation("/subscriptions");
    } else if (role === "provider") {
      setLocation("/provider/balance");
    } else {
      setLocation("/customer/balance");
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-4">
            <h2 className="text-xl font-semibold">Payment Error</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button className="w-full" onClick={goBack} data-testid="button-go-back">
              <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {loading && (
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
            <h2 className="text-xl font-semibold" data-testid="text-loading">Loading Payment...</h2>
            <p className="text-sm text-muted-foreground">Please wait while we set up your payment.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
