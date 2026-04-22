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
import { useEffect, useState, useCallback } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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

// ── Location Gate ─────────────────────────────────────────────────────────────
const LOC_OK_KEY = "mitrify_loc_ok";

// These paths skip the location gate (admin/coadmin/static pages)
const EXEMPT_PREFIXES = [
  "/admin",
  "/coadmin",
  "/verify",
  "/payment",
  "/about",
  "/terms",
  "/our-team",
  "/investment",
  "/employee",
  "/job/",
];

type LocStatus = "checking" | "requesting" | "granted" | "denied";

function LocationGate({ children }: { children: React.ReactNode }) {
  const [currentPath] = useLocation();
  const isExempt = EXEMPT_PREFIXES.some((p) => currentPath.startsWith(p));
  const { toast } = useToast();

  const [status, setStatus] = useState<LocStatus>(() =>
    localStorage.getItem(LOC_OK_KEY) ? "granted" : "checking"
  );

  // Show toast when user denies
  useEffect(() => {
    if (status === "denied") {
      toast({
        title: "📍 आपके नज़दीकी ग्राहक आपके लोकेशन के बिना ढूंढना मुश्किल है!",
        description: "नीचे दिए गए steps से location enable करें और दोबारा try करें।",
        variant: "destructive",
        duration: 6000,
      });
    }
  }, [status]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      localStorage.setItem(LOC_OK_KEY, "1");
      setStatus("granted");
      return;
    }
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        localStorage.setItem(LOC_OK_KEY, "1");
        localStorage.setItem("mitrify_gps_lat", String(pos.coords.latitude));
        localStorage.setItem("mitrify_gps_lng", String(pos.coords.longitude));
        setStatus("granted");
      },
      () => {
        setStatus("denied");
      },
      { timeout: 15000, maximumAge: 300000, enableHighAccuracy: false }
    );
  }, []);

  useEffect(() => {
    if (isExempt || status === "granted") return;
    if (status === "checking") requestLocation();
  }, [isExempt, status, requestLocation]);

  if (isExempt || status === "granted") return <>{children}</>;

  // Loading / requesting
  if (status === "checking" || status === "requesting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 px-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <MapPin className="w-10 h-10 text-primary animate-bounce" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold hindi-text">आपकी location ढूंढ रहे हैं...</h2>
          <p className="text-sm text-muted-foreground hindi-text">
            कृपया browser का location popup आने पर <strong>"Allow"</strong> दबाएं
          </p>
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Denied — hard block
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center gap-5">
      <div className="w-24 h-24 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
        <MapPin className="w-12 h-12 text-red-500" />
      </div>

      <div>
        <h2 className="text-xl font-bold hindi-text mb-2">
          📍 Location Permission ज़रूरी है!
        </h2>
        <p className="text-muted-foreground text-sm hindi-text leading-relaxed">
          Mitrify use करने के लिए आपको location की permission देनी होगी।<br />
          बिना location के आप नज़दीकी service providers नहीं ढूंढ सकते।
        </p>
      </div>

      <div className="bg-muted rounded-2xl p-4 text-left text-sm space-y-2 w-full max-w-sm">
        <p className="font-semibold hindi-text">📱 Location enable करने का तरीका:</p>
        <p className="text-muted-foreground hindi-text">
          1. Browser के address bar में <strong>🔒</strong> या <strong>ℹ️</strong> icon दबाएं
        </p>
        <p className="text-muted-foreground hindi-text">
          2. <strong>"Location"</strong> permission को <strong>"Allow"</strong> करें
        </p>
        <p className="text-muted-foreground hindi-text">
          3. नीचे <strong>"दोबारा Try करें"</strong> दबाएं
        </p>
      </div>

      <Button
        className="w-full max-w-sm h-12 text-base gap-2"
        onClick={requestLocation}
      >
        <MapPin className="w-5 h-5" />
        दोबारा Try करें
      </Button>

      <p className="text-xs text-muted-foreground hindi-text max-w-xs">
        आपकी location सिर्फ नज़दीकी service providers दिखाने के लिए use होती है।
        किसी और के साथ share नहीं की जाती।
      </p>
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
    if (isLoading || !user) return;
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
            <LocationGate>
              <Router />
            </LocationGate>
            <VisitorCounter />
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
