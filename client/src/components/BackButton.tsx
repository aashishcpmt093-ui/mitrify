import { useLocation } from "wouter";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  to?: string;
}

export function BackButton({ to = "/" }: BackButtonProps) {
  const [, setLocation] = useLocation();
  const fallback = useMemo(() => to, [to]);

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    setLocation(fallback);
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
