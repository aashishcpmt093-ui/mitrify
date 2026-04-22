import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";

export default function PaymentSuccessPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(true);

  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order_id");
  const creditsParam = params.get("credits") || "0";

  const verifyPayment = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cashfree/verify-payment", { orderId });
      return res.json();
    },
    onSuccess: () => {
      setVerified(true);
      setVerifying(false);
      queryClient.invalidateQueries({ queryKey: ["/api/credits/me"] });
      toast({ title: "Payment Successful!", description: `${creditsParam} credits aapke account mein add ho gaye.` });
    },
    onError: () => {
      setVerifying(false);
      toast({ title: "Verification Failed", description: "Please contact support.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (orderId) {
      verifyPayment.mutate();
    } else {
      setVerifying(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 text-center space-y-4">
          {verifying ? (
            <>
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
              <h2 className="text-xl font-semibold" data-testid="text-verifying">Verifying Payment...</h2>
              <p className="text-sm text-muted-foreground">Please wait while we confirm your payment.</p>
            </>
          ) : verified ? (
            <>
              <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
              <h2 className="text-xl font-semibold" data-testid="text-success">Payment Successful!</h2>
              <p className="text-sm text-muted-foreground">
                {creditsParam} credits aapke account mein add ho gaye. Yeh credits kabhi expire nahi hote.
              </p>
              <Button className="w-full" onClick={() => setLocation("/customer/home")} data-testid="button-go-home">
                Home Par Jao
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold" data-testid="text-error">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">We couldn't verify your payment. Please try again or contact support.</p>
              <Button className="w-full" onClick={() => setLocation("/customer/home")} data-testid="button-go-home">
                Go Back
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
