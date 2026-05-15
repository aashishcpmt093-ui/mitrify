import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { LanguageProvider } from "@/lib/language";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useState, useRef, useCallback, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 60000;

const SLOW_POLL_INTERVAL_MS = 8000;

function useServerReady() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/health", { credentials: "include" });
      if (res.ok) {
        setReady(true);
        return;
      }
    } catch {}
    const elapsed = Date.now() - startRef.current;
    if (elapsed >= MAX_WAIT_MS && !timedOut) {
      setTimedOut(true);
    }
    // After timeout, keep polling slowly so the banner auto-dismisses if
    // the server eventually recovers (e.g. Railway dyno woke up late).
    const nextInterval = elapsed >= MAX_WAIT_MS ? SLOW_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
    timerRef.current = setTimeout(check, nextInterval);
  }, [timedOut]);

  useEffect(() => {
    check();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [check]);

  return { ready, timedOut };
}

function ServerWakingBanner() {
  const { ready, timedOut } = useServerReady();
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (ready === null) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
    if (ready === true) {
      setVisible(false);
      const t = setTimeout(() => setDismissed(true), 400);
      return () => clearTimeout(t);
    }
  }, [ready]);

  if (dismissed) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] transition-transform duration-300 ease-out"
      style={{ transform: visible ? "translateY(0)" : "translateY(-110%)" }}
      data-testid="banner-server-waking"
    >
      {timedOut ? (
        <div className="flex items-center justify-between gap-3 bg-destructive text-destructive-foreground px-4 py-2.5 text-sm font-medium shadow-md">
          <span>सर्वर से जुड़ नहीं पाए — Server unreachable</span>
          <button
            className="shrink-0 px-3 py-1 rounded bg-white/20 hover:bg-white/30 text-xs font-semibold transition-colors"
            onClick={() => window.location.reload()}
            data-testid="button-banner-refresh"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-amber-500 text-white px-4 py-2 text-sm font-medium shadow-md">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin shrink-0" />
          <span>सर्वर शुरू हो रहा है… Connecting</span>
        </div>
      )}
    </div>
  );
}

class AdminErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AdminDashboard crash]", error.message, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-8 gap-4">
          <div className="text-red-500 font-bold text-lg">Dashboard Crash</div>
          <pre className="bg-red-50 dark:bg-red-950 border border-red-200 rounded-lg p-4 text-xs text-red-800 dark:text-red-300 max-w-2xl w-full overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm"
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import WelcomePage from "@/pages/welcome";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import ForgotPasswordPage from "@/pages/forgot-password";
import SelectRolePage from "@/pages/select-role";
import AdminLoginPage from "@/pages/admin-login";
import CustomerSetupPage from "@/pages/customer-setup";
import ProviderSetupPage from "@/pages/provider-setup";
import ProviderGuidedSetupPage from "@/pages/provider-guided-setup";
import CustomerHomePage from "@/pages/customer-home";
import CustomerHistoryPage from "@/pages/customer-history";
import NotificationsPage from "@/pages/notifications";
import MyProfilePage from "@/pages/my-profile";
import CustomerBalancePage from "@/pages/customer-balance";
import SubscriptionsPage from "@/pages/subscriptions";
import ProviderDashboardPage from "@/pages/provider-dashboard";
import ProviderBalancePage from "@/pages/provider-balance";
import AdminDashboardPage from "@/pages/admin-dashboard";
import EditProfilePage from "@/pages/edit-profile";
import ProviderEditProfilePage from "@/pages/provider-edit-profile";
import PaymentSuccessPage from "@/pages/payment-success";
import PaymentCancelPage from "@/pages/payment-cancel";
import CashfreeCheckoutPage from "@/pages/cashfree-checkout";
import AboutPage from "@/pages/about";
import TermsPage from "@/pages/terms";
import CoAdminLoginPage from "@/pages/coadmin-login";
import CoAdminDashboard from "@/pages/coadmin-dashboard";
import VerifyDashboard from "@/pages/verify-dashboard";
import OurTeamPage from "@/pages/our-team";
import EmployeeEditPage from "@/pages/employee-edit";
import JobDetailPage from "@/pages/job-detail";
import InvestmentPage from "@/pages/investment";
import CompleteProfilePage from "@/pages/complete-profile";
import ProviderCompleteProfilePage from "@/pages/provider-complete-profile";
import NotFound from "@/pages/not-found";
import VisitorCounter from "@/components/VisitorCounter";

// Root "/" handler.
// First visit in a session → silently enters guest mode and redirects to /customer/home
//   (so users start browsing immediately, no welcome flash).
// Subsequent visits to "/" (e.g., browser Back from /customer/home) → redirect to /welcome
//   so the user sees the proper Welcome screen (Login / Sign Up / Skip).
// Authenticated users → routed to their role dashboard, session never cleared.
const ROOT_VISITED_FLAG = "mitrify_root_autoskipped";
function AutoSkipToHome() {
  const [, setLocation] = useLocation();
  const { user, isLoading, isAuthenticated } = useAuth();
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && user) {
      const role = (user as { role?: string; authType?: string }).role
        ?? (user as { role?: string; authType?: string }).authType;
      if (role === "admin") setLocation("/admin/dashboard");
      else if (role === "coadmin") setLocation("/coadmin/dashboard");
      else setLocation("/provider/guided-setup");
      return;
    }
    let alreadySkipped = false;
    try { alreadySkipped = sessionStorage.getItem(ROOT_VISITED_FLAG) === "1"; } catch {}
    if (alreadySkipped) {
      setLocation("/welcome");
      return;
    }
    (async () => {
      try { sessionStorage.setItem(ROOT_VISITED_FLAG, "1"); } catch {}
      try {
        localStorage.removeItem("mitrify_auth_v1");
        queryClient.setQueryData(["/api/auth/user"], null);
        await fetch("/api/guest-mode", { method: "POST", credentials: "include" });
      } catch {}
      setLocation("/welcome");
    })();
  }, [isLoading, isAuthenticated, user, setLocation]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

// ── Auth-guarded route wrappers ───────────────────────────────────────────────

// Requires login + provider profile + profile completeness
function AuthenticatedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();

  const { data: roleProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/profiles/me", "provider"],
    queryFn: async () => {
      const res = await fetch(`/api/profiles/me?role=provider`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const { data: providerStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/providers/profile-status"],
    queryFn: async () => {
      const res = await fetch("/api/providers/profile-status", { credentials: "include" });
      if (!res.ok) throw new Error("status fetch failed");
      return res.json();
    },
    enabled: isAuthenticated && !!roleProfile,
    staleTime: 30 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/welcome");
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (!profileLoading && isAuthenticated && roleProfile === undefined) return;
    if (!profileLoading && isAuthenticated && !roleProfile) {
      setLocation("/provider/guided-setup");
    }
  }, [profileLoading, isAuthenticated, roleProfile]);

  useEffect(() => {
    if (statusLoading || !roleProfile) return;
    // Fail closed: if status fetch errored (providerStatus is undefined after error), block
    if (providerStatus === undefined) {
      if (location !== "/provider/complete-profile") setLocation("/provider/complete-profile");
      return;
    }
    // No provider data row yet OR incomplete → gate to completion page
    if (!providerStatus.exists || !providerStatus.profileComplete) {
      if (location !== "/provider/complete-profile") setLocation("/provider/complete-profile");
    }
  }, [statusLoading, providerStatus, roleProfile, location]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!isAuthenticated) return null;
  // Hold render while profile row or status is loading to prevent flash of content
  if (profileLoading || (!!roleProfile && statusLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  // Block render if gate conditions not satisfied
  if (roleProfile && providerStatus && (!providerStatus.exists || !providerStatus.profileComplete)) {
    return null;
  }
  return <>{children}</>;
}

// Paths exempt from the provider-completion gate
const PROVIDER_GATE_ALLOWLIST = new Set([
  "/provider/complete-profile",
  "/provider/guided-setup",
  "/provider/setup",
  "/customer/setup",
]);

// Requires login; also blocks incomplete providers from all pages except allowlist
function LoggedInRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  const { data: providerStatus, isLoading: statusLoading, isError: statusError } = useQuery({
    queryKey: ["/api/providers/profile-status"],
    queryFn: async () => {
      const res = await fetch("/api/providers/profile-status", { credentials: "include" });
      if (!res.ok) throw new Error("profile-status fetch failed");
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/welcome");
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (statusLoading || !isAuthenticated) return;
    if (PROVIDER_GATE_ALLOWLIST.has(location)) return;

    // Gate applies when user has a provider role OR provider data row exists
    // (covers inconsistent state: data row exists but profile row deleted)
    const isProviderUser = providerStatus?.hasProviderRole || providerStatus?.exists;

    // Fail closed only for confirmed provider users — avoids locking out customers on transient errors
    if (statusError && isProviderUser) {
      setLocation("/provider/complete-profile");
      return;
    }

    if (!isProviderUser) return; // pure customer-only user — no gate

    // Incomplete or missing provider data → completion gate
    if (!providerStatus.exists || !providerStatus.profileComplete) {
      setLocation("/provider/complete-profile");
    }
  }, [statusLoading, statusError, providerStatus, isAuthenticated, location]);

  if (isLoading || (isAuthenticated && statusLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!isAuthenticated) return null;
  return <>{children}</>;
}


function SetupRoute({ role, children }: { role: "customer" | "provider"; children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: providerStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/providers/profile-status"],
    queryFn: async () => {
      const res = await fetch("/api/providers/profile-status", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated && role === "provider",
    staleTime: 30 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/welcome");
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (role !== "provider" || statusLoading) return;
    // Incomplete profile: provider row exists but required fields missing → gate
    if (providerStatus?.exists && !providerStatus?.profileComplete) {
      setLocation("/provider/complete-profile");
    }
  }, [role, statusLoading, providerStatus, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!isAuthenticated) return null;
  if (role === "provider" && statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  return <>{children}</>;
}

function Router() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    const role = (user as any).role || (user as any).authType;
    const current = window.location.pathname;
    if (current === "/" || current === "/welcome" || current === "/login") {
      if (role === "admin") setLocation("/admin/dashboard");
      else if (role === "coadmin") setLocation("/coadmin/dashboard");
      else setLocation("/provider/guided-setup");
    }
  }, [isLoading, user, setLocation]);

  return (
    <Switch>
      <Route path="/" component={AutoSkipToHome} />
      <Route path="/welcome" component={WelcomePage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/select-role" component={SelectRolePage} />
      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/investment" component={InvestmentPage} />
      <Route path="/our-team" component={OurTeamPage} />
      <Route path="/employee/edit" component={EmployeeEditPage} />

      <Route path="/customer/setup">
        <SetupRoute role="provider"><ProviderGuidedSetupPage /></SetupRoute>
      </Route>
      <Route path="/provider/setup">
        <SetupRoute role="provider"><ProviderGuidedSetupPage /></SetupRoute>
      </Route>
      <Route path="/provider/guided-setup">
        <SetupRoute role="provider"><ProviderGuidedSetupPage /></SetupRoute>
      </Route>

      {/* Search page — open to all including guests */}
      <Route path="/customer/home" component={CustomerHomePage} />

      {/* Protected customer pages — login required */}
      <Route path="/customer/history">
        <LoggedInRoute><CustomerHistoryPage /></LoggedInRoute>
      </Route>
      <Route path="/notifications">
        <LoggedInRoute><NotificationsPage /></LoggedInRoute>
      </Route>
      <Route path="/my-profile">
        <LoggedInRoute><MyProfilePage /></LoggedInRoute>
      </Route>
      <Route path="/customer/balance">
        <LoggedInRoute><CustomerBalancePage /></LoggedInRoute>
      </Route>
      <Route path="/customer/edit-profile">
        <LoggedInRoute><EditProfilePage /></LoggedInRoute>
      </Route>
      <Route path="/provider/edit-profile">
        <AuthenticatedRoute><EditProfilePage /></AuthenticatedRoute>
      </Route>
      <Route path="/complete-profile">
        <LoggedInRoute><EditProfilePage /></LoggedInRoute>
      </Route>
      {/* Provider complete-profile — LoggedInRoute only (not AuthenticatedRoute) to avoid redirect loop */}
      <Route path="/provider/complete-profile">
        <LoggedInRoute><ProviderCompleteProfilePage /></LoggedInRoute>
      </Route>

      {/* Provider pages — login + provider profile required */}
      <Route path="/provider/dashboard">
        <AuthenticatedRoute><ProviderDashboardPage /></AuthenticatedRoute>
      </Route>
      <Route path="/provider/balance">
        <AuthenticatedRoute><ProviderBalancePage /></AuthenticatedRoute>
      </Route>
      <Route path="/subscriptions">
        <LoggedInRoute><SubscriptionsPage /></LoggedInRoute>
      </Route>
      <Route path="/payment/checkout" component={CashfreeCheckoutPage} />
      <Route path="/payment/success" component={PaymentSuccessPage} />
      <Route path="/payment/cancel" component={PaymentCancelPage} />

      <Route path="/admin/dashboard">
        <AdminErrorBoundary><AdminDashboardPage /></AdminErrorBoundary>
      </Route>
      <Route path="/coadmin/login" component={CoAdminLoginPage} />
      <Route path="/coadmin/dashboard" component={CoAdminDashboard} />
      <Route path="/verify/dashboard" component={VerifyDashboard} />
      <Route path="/job/:id" component={JobDetailPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <ServerWakingBanner />
            <Router />
            <VisitorCounter />
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
