import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { XCircle } from "lucide-react";

export default function PaymentCancelPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 text-center space-y-4">
          <XCircle className="w-16 h-16 mx-auto text-red-500" />
          <h2 className="text-xl font-semibold">Payment Cancelled</h2>
          <p className="text-sm text-muted-foreground">
            Your payment was cancelled. No charges were made.
          </p>
          <div className="space-y-2">
            <Button className="w-full" onClick={() => setLocation("/customer/home")} data-testid="button-customer-home">
              Go to Customer Home
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setLocation("/provider/dashboard")} data-testid="button-provider-home">
              Go to Provider Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
