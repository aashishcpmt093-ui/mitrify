import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { Zap } from "lucide-react";

export default function SelectRolePage() {
  const [, setLocation] = useLocation();
  const { isLoading, user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) { setLocation("/login"); return; }
    const role = (user as any)?.role || (user as any)?.authType;
    if (role === "admin") { setLocation("/admin/dashboard"); return; }
    if (role === "coadmin") { setLocation("/coadmin/dashboard"); return; }

    const autoRedirect = async () => {
      try {
        // Customer home is the default landing page for all users
        const customerRes = await fetch("/api/profiles/me?role=customer", { credentials: "include" });
        if (customerRes.ok) {
          const data = await customerRes.json();
          if (data && data.id) { setLocation("/customer/home"); return; }
        }
        // If no customer profile, check provider (existing provider-only users)
        const providerRes = await fetch("/api/providers/me", { credentials: "include" });
        if (providerRes.ok) {
          const data = await providerRes.json();
          if (data && data.id) { setLocation("/customer/home"); return; }
        }
        // No customer or provider profile exists for this account — this is a
        // fresh signup (or a previously deleted user re-registering). Send
        // them to the customer setup screen so a profile actually gets
        // created instead of skipping straight to the home page.
        setLocation("/customer/setup");
      } catch {
        setLocation("/customer/setup");
      }
    };

    autoRedirect();
  }, [isLoading, isAuthenticated, user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background" data-testid="page-select-role">
      <div className="flex flex-col items-center gap-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary">
          <Zap className="w-8 h-8 text-primary-foreground" />
        </div>
        <p className="text-muted-foreground animate-pulse text-sm">Setting up your account...</p>
      </div>
    </div>
  );
}
