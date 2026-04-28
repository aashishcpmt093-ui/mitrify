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
import { useEffect, useState } from "react";

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
import CustomerBalancePage from "@/pages/customer-balance";
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
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (!profileLoading && isAuthenticated && roleProfile === undefined) return;
    if (!profileLoading && isAuthenticated && !roleProfile) {
      setLocation("/provider/setup");
    }
  }, [profileLoading, isAuthenticated, roleProfile]);

  if (isLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!isAuthenticated) return null;
  return <>{children}</>;
}

// Requires login only (no profile check)
function LoggedInRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
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
      setLocation("/login");
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
    if (!user) {
      if (window.location.pathname === "/") {
        setLocation("/customer/home");
      }
      return;
    }
    const role = (user as any).role || (user as any).authType;
    const current = window.location.pathname;
    if (current === "/" || current === "/login" || current === "/select-role") {
      if (role === "admin") setLocation("/admin/dashboard");
      else if (role === "coadmin") setLocation("/coadmin/dashboard");
      else setLocation("/customer/home");
    }
  }, [isLoading, user, setLocation]);

  return (
    <Switch>
      <Route path="/" component={WelcomePage} />
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

      <Route path="/payment/checkout" component={CashfreeCheckoutPage} />
      <Route path="/payment/success" component={PaymentSuccessPage} />
      <Route path="/payment/cancel" component={PaymentCancelPage} />

      <Route path="/admin/dashboard" component={AdminDashboardPage} />
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
