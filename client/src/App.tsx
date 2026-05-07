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
import { useEffect, useState, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

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
      else setLocation("/customer/home");
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
      setLocation("/customer/home");
    })();
  }, [isLoading, isAuthenticated, user, setLocation]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

// ── Auth-guarded route wrappers ───────────────────────────────────────────────

// Requires login + provider profile
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

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/welcome");
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (!profileLoading && isAuthenticated && roleProfile === undefined) return;
    if (!profileLoading && isAuthenticated && !roleProfile) {
      setLocation("/provider/setup");
    }
  }, [profileLoading, isAuthenticated, roleProfile]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!isAuthenticated) return null;
  if (profileLoading && roleProfile === undefined) return <>{children}</>;
  return <>{children}</>;
}

// Requires login only (no profile check)
function LoggedInRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/welcome");
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
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

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/welcome");
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!isAuthenticated) return null;
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
      else setLocation("/customer/home");
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
        <SetupRoute role="customer"><CustomerSetupPage /></SetupRoute>
      </Route>
      <Route path="/provider/setup">
        <SetupRoute role="provider"><ProviderSetupPage /></SetupRoute>
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

      {/* Provider pages — login + provider profile required */}
      <Route path="/provider/dashboard">
        <AuthenticatedRoute><ProviderDashboardPage /></AuthenticatedRoute>
      </Route>
      <Route path="/provider/balance">
        <AuthenticatedRoute><ProviderBalancePage /></AuthenticatedRoute>
      </Route>
      <Route path="/provider/edit-profile">
        <AuthenticatedRoute><ProviderEditProfilePage /></AuthenticatedRoute>
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
            <Router />
            <VisitorCounter />
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
