import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

/**
 * Smart back button — never logs user out, never goes to "/"
 *
 * Priority:
 * 1. If browser history has in-app pages → window.history.back()
 * 2. If route is in FALLBACK_MAP → go to that parent route
 * 3. Auth-aware default: provider → /provider/dashboard, else /customer/home
 */

const FALLBACK_MAP: Record<string, string> = {
  "/provider/balance":      "/provider/dashboard",
  "/provider/edit-profile": "/provider/dashboard",
  "/provider/dashboard":    "/customer/home",
  "/customer/balance":      "/customer/home",
  "/customer/history":      "/customer/home",
  "/customer/edit-profile": "/customer/home",
  "/notifications":         "/customer/home",
  "/my-profile":            "/customer/home",
  "/subscriptions":         "/provider/dashboard",
  "/complete-profile":      "/provider/dashboard",
  "/forgot-password":       "/login",
  "/login":                 "/welcome",
  "/signup":                "/welcome",
  "/about":                 "/customer/home",
  "/terms":                 "/customer/home",
  "/investment":            "/customer/home",
  "/our-team":              "/customer/home",
  "/admin/login":           "/welcome",
};

export function BackButton({ className }: { className?: string }) {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();

  const handleBack = () => {
    const route = location.split("?")[0];

    if (FALLBACK_MAP[route]) {
      setLocation(FALLBACK_MAP[route]);
      return;
    }

    if (route.startsWith("/job/")) {
      setLocation("/customer/home");
      return;
    }

    if (route.startsWith("/employee/")) {
      setLocation("/coadmin/dashboard");
      return;
    }

    if (isAuthenticated) {
      const role = (user as any)?.role ?? (user as any)?.authType;
      if (role === "admin") { setLocation("/admin/dashboard"); return; }
      if (role === "coadmin") { setLocation("/coadmin/dashboard"); return; }
      setLocation("/provider/dashboard");
    } else {
      setLocation("/customer/home");
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleBack}
      className={className ?? "fixed top-4 left-4 z-50 hover:bg-muted/50 rounded-full"}
      title="Back"
      data-testid="button-back-universal"
    >
      <ArrowLeft className="w-5 h-5" />
    </Button>
  );
}
