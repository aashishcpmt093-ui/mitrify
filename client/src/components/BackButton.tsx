import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function BackButton() {
  const [, setLocation] = useLocation();

  const handleBack = () => {
    window.history.back();
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleBack}
      className="fixed top-4 left-4 z-50 hover:bg-muted/50 rounded-full"
      title="Go back"
      data-testid="button-back-universal"
    >
      <ArrowLeft className="w-5 h-5" />
    </Button>
  );
}
