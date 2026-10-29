import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// The same "← Back" at the top of every screen that opens inside a portal page.
export default function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" className="self-start print:hidden" onClick={onClick}>
      <ArrowLeft className="mr-1.5 h-4 w-4" /> {label}
    </Button>
  );
}
