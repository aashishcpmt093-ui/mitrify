import { Check } from "lucide-react";
import type { SubscriptionPlan } from "@shared/schema";

interface PlanTickProps {
  plan?: SubscriptionPlan | null;
  size?: number;
  className?: string;
}

const PLAN_STYLES: Record<Exclude<SubscriptionPlan, "none">, { bg: string; ring: string; label: string }> = {
  boost: {
    bg: "bg-white",
    ring: "ring-1 ring-slate-300 dark:ring-slate-500",
    label: "Boost member",
  },
  pro: {
    bg: "bg-yellow-400",
    ring: "ring-1 ring-yellow-500",
    label: "Pro member",
  },
  premium: {
    bg: "bg-emerald-500",
    ring: "ring-1 ring-emerald-600",
    label: "Premium member",
  },
};

export function PlanTick({ plan, size = 14, className = "" }: PlanTickProps) {
  if (!plan || plan === "none") return null;
  const style = PLAN_STYLES[plan];
  const tickColor = plan === "boost" ? "text-slate-700" : "text-white";
  return (
    <span
      title={style.label}
      aria-label={style.label}
      className={`inline-flex items-center justify-center rounded-full ${style.bg} ${style.ring} ${className}`}
      style={{ width: size, height: size }}
      data-testid={`badge-plan-${plan}`}
    >
      <Check className={`${tickColor}`} style={{ width: size - 4, height: size - 4 }} strokeWidth={3} />
    </span>
  );
}

export default PlanTick;
