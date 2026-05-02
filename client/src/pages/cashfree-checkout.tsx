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

    const startCheckout = () => {
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

    // SDK is preloaded in index.html; if it's already there, use it directly.
    if (typeof window.Cashfree === "function") {
      startCheckout();
      return;
    }

    // Fallback: SDK not loaded yet (e.g. preload still in flight or
    // blocked). Try to load it on demand. We do NOT remove the script on
    // cleanup because removing a still-loading <script> can fire onerror
    // in some browsers and breaks the second mount in StrictMode.
    const SCRIPT_ID = "cashfree-sdk-v3";
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    let cancelled = false;

    const onReady = () => {
      if (cancelled) return;
      if (typeof window.Cashfree === "function") startCheckout();
      else {
        setError("Failed to load payment SDK");
        setLoading(false);
      }
    };
    const onFail = () => {
      if (cancelled) return;
      setError("Failed to load payment SDK");
      setLoading(false);
    };

    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      script.async = true;
      script.addEventListener("load", onReady);
      script.addEventListener("error", onFail);
      document.body.appendChild(script);
    } else {
      script.addEventListener("load", onReady);
      script.addEventListener("error", onFail);
      // If script already finished loading, fire immediately.
      if (typeof window.Cashfree === "function") onReady();
    }

    return () => {
      cancelled = true;
      script?.removeEventListener("load", onReady);
      script?.removeEventListener("error", onFail);
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
