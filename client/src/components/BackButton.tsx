import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { useLocation } from "wouter";

export function BackButton() {
  const [, setLocation] = useLocation();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setLocation("/customer/home")}
      className="fixed top-4 left-4 z-50 hover:bg-muted/50 rounded-full"
      title="Home"
      data-testid="button-home-universal"
    >
      <Home className="w-5 h-5" />
    </Button>
  );
}
