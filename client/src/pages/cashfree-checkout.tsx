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

    let cancelled = false;

    const startCheckout = () => {
      if (cancelled) return;
      try {
        const cashfree = window.Cashfree({
          mode: cfMode as "sandbox" | "production",
        });

        const successQuery = kind === "subscription"
          ? `kind=subscription&plan=${encodeURIComponent(plan)}&cycle=${encodeURIComponent(cycle)}&order_id=${orderId}`
          : `kind=credits&role=${role}&credits=${credits}&order_id=${orderId}`;

        // redirectTarget "_self" = same tab full-page redirect to Cashfree
        // hosted checkout. This avoids popup blockers and the
        // overlay/iframe modes that some browsers (esp. installed PWAs)
        // fail to render, leaving the user staring at our spinner forever.
        cashfree.checkout({
          paymentSessionId: paymentSessionId,
          returnUrl: `${window.location.origin}/payment/success?${successQuery}`,
          redirectTarget: "_self",
        });
        setLoading(false);
      } catch (err: any) {
        console.error("Cashfree checkout error:", err);
        setError("Failed to load payment page. Please try again.");
        setLoading(false);
      }
    };

    // Ensure the SDK <script> tag exists. It is also preloaded in
    // index.html, but if that ever gets stripped (cached old build, CSP,
    // adblocker) we re-inject here so the checkout can still proceed.
    const SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";
    const SCRIPT_ID = "cashfree-sdk-v3";
    if (
      typeof window.Cashfree !== "function" &&
      !document.querySelector(`script[src="${SDK_URL}"]`)
    ) {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src = SDK_URL;
      s.async = true;
      document.head.appendChild(s);
    }

    // Poll for window.Cashfree instead of relying on script load events,
    // which can be missed when the script is already cached or when the
    // tag was injected by index.html before this component mounted.
    const startedAt = Date.now();
    const TIMEOUT_MS = 15000;
    const pollId = window.setInterval(() => {
      if (cancelled) return;
      if (typeof window.Cashfree === "function") {
        window.clearInterval(pollId);
        startCheckout();
      } else if (Date.now() - startedAt > TIMEOUT_MS) {
        window.clearInterval(pollId);
        setError(
          "Payment service load nahi ho saka. Internet check karke dobara try karein. (Adblocker / VPN band rakhein)"
        );
        setLoading(false);
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
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
