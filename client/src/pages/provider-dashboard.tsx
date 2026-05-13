import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Phone, BarChart3, Coins, LogOut, Zap, AlertCircle,
  Share2, Copy, Clock, Wrench, Search, User, Plus, Minus,
  Menu, X, Home, Settings, Moon, Sun, History, Info, ScrollText, Camera, Briefcase, Bell, Mail, ChevronRight, Sparkles, Trash2, Loader2
} from "lucide-react";
import { PlanTick } from "@/components/PlanTick";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useTheme } from "@/lib/theme";
import { useLanguage, LANGUAGE_NAMES, Language } from "@/lib/language";
import { BackButton } from "@/components/BackButton";
import logoImg from "@assets/772B17C5-7738-43B8-B5C0-04A7F2A6561B_1773842365564.png";
import type { CallLog, SubscriptionResponse, SubscriptionPlan, Provider } from "@shared/schema";

export default function ProviderDashboardPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { t, lang, setLang } = useLanguage();
  const [, setLocation] = useLocation();
  const { canInstall, install: installPwa } = usePwaInstall();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  const { data: contactEmailsData } = useQuery<{ label: string; email: string }[] | null>({
    queryKey: ["/api/content", "contact_emails"],
    queryFn: async () => {
      const res = await fetch("/api/content/contact_emails");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const validFetchedContactEmails = Array.isArray(contactEmailsData)
    ? contactEmailsData.filter(x => x && typeof x.email === "string" && x.email.trim().length > 0)
    : [];
  const contactEmailsList = validFetchedContactEmails.length > 0
    ? validFetchedContactEmails
    : [
        { label: t("mailHelp"), email: "help@mitrify.com" },
        { label: t("mailContact"), email: "contact@mitrify.in" },
      ];
  const [buyAmount, setBuyAmount] = useState(10);
  const [forceCallConfirmOpen, setForceCallConfirmOpen] = useState(false);

  const { data: profile } = useQuery({ queryKey: ["/api/profiles/me", "provider"], queryFn: async () => {
    const res = await fetch("/api/profiles/me?role=provider", { credentials: "include" });
    if (!res.ok) throw new Error("Not found");
    return res.json();
  }});
  const { data: provider } = useQuery<Provider>({ queryKey: ["/api/providers/me"] });
  const { data: mySub } = useQuery<{ active: SubscriptionResponse | null; history: SubscriptionResponse[] }>({
    queryKey: ["/api/subscriptions/me"],
  });
  const activeSubPlan: SubscriptionPlan = (mySub?.active?.plan as SubscriptionPlan) || "none";
  const subDays = mySub?.active?.endDate
    ? Math.max(0, Math.ceil((new Date(mySub.active.endDate).getTime() - Date.now()) / 86400000))
    : 0;

  const { data: credits } = useQuery<{ freeCredits: number; purchasedCredits: number; totalCredits: number }>({
    queryKey: ["/api/credits/me"],
    queryFn: async () => {
      const res = await fetch("/api/credits/me", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const { data: callHistory } = useQuery<CallLog[]>({ queryKey: ["/api/calls/provider"] });
  // Notification badge count for the menu — polled every 60s so newly-
  // received calls reflect in the menu badge without a manual refresh.
  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 60000,
  });
  const { data: myPromo } = useQuery<{ code: string; usageCount: number } | null>({ queryKey: ["/api/promo-codes/mine"] });
  const { data: recruitmentLink } = useQuery<string>({
    queryKey: ["/api/content", "recruitment_link"],
    queryFn: async () => { const res = await fetch("/api/content/recruitment_link"); if (!res.ok) return "https://forms.gle/C54uAz7pkupe6g136"; return res.json(); },
  });

  const purchaseCredits = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cashfree/create-order", { credits: buyAmount });
      return res.json();
    },
    onSuccess: (data: { paymentSessionId: string; orderId: string; cfMode?: string }) => {
      window.location.href = `/payment/checkout?session_id=${encodeURIComponent(data.paymentSessionId)}&order_id=${encodeURIComponent(data.orderId)}&credits=${buyAmount}&mode=${data.cfMode || "sandbox"}`;
    },
    onError: () => {
      toast({ title: "Purchase failed", description: "Could not start payment. Please try again.", variant: "destructive" });
    },
  });

  const setForceCalling = useMutation({
    mutationFn: async (value: boolean) => {
      const res = await apiRequest("PATCH", "/api/profile/preferences", {
        role: "provider",
        acceptDoubleCharge: value,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me", "provider"] });
      toast({ title: t("save") });
    },
    onError: (err: any) => {
      toast({ title: t("callFailed"), description: err.message, variant: "destructive" });
    },
  });

  const copyPromo = () => {
    if (myPromo?.code) {
      navigator.clipboard.writeText(myPromo.code);
      toast({ title: "Copied!" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-72 bg-card border-r shadow-xl h-full flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => { setMenuOpen(false); setLocation("/provider/dashboard"); }}
                data-testid="link-logo"
              >
                <img src={logoImg} alt="Mitrify" className="w-7 h-7 rounded-md" />
                <span className="font-bold text-lg">Mitrify</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMenuOpen(false)} data-testid="button-close-menu">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-1 p-4 space-y-2">
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); setLocation("/customer/home"); }} data-testid="link-home">
                <Home className="w-4 h-4" /> {t("home")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3 relative" onClick={() => { setMenuOpen(false); setLocation("/notifications"); }} data-testid="link-notifications">
                <Bell className="w-4 h-4" /> {t("notifications")}
                {(unreadCount?.count ?? 0) > 0 && (
                  <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5" data-testid="badge-unread-count">
                    {unreadCount!.count > 99 ? "99+" : unreadCount!.count}
                  </span>
                )}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); setLocation("/my-profile"); }} data-testid="button-my-profile">
                <User className="w-4 h-4" /> {t("myProfile")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); setLocation("/customer/home"); }} data-testid="button-search-providers">
                <Search className="w-4 h-4" /> {t("searchProviders")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); window.open(recruitmentLink || "https://forms.gle/C54uAz7pkupe6g136", "_blank"); }} data-testid="button-recruitment">
                <Briefcase className="w-4 h-4" /> {t("recruitment")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); setLocation("/subscriptions"); }} data-testid="button-subscriptions-menu">
                <Sparkles className="w-4 h-4 text-amber-500" /> {t("subscriptions")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={toggleTheme} data-testid="button-theme-toggle">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {theme === "dark" ? t("lightMode") : t("darkMode")}
              </Button>

              {/* Language Switcher */}
              <div className="pt-1">
                <p className="text-xs text-muted-foreground px-3 pb-1 font-medium">{t("language")}</p>
                <div className="flex gap-1 px-1">
                  {(["en", "hi", "hl"] as Language[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${lang === l ? "bg-primary text-primary-foreground shadow" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                      data-testid={`button-lang-${l}`}
                    >
                      {l === "en" ? "EN" : l === "hi" ? "हिं" : "HL"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t space-y-2">
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); setLocation("/about"); }} data-testid="link-about">
                <Info className="w-4 h-4" /> {t("aboutUs")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); setLocation("/terms"); }} data-testid="link-terms">
                <ScrollText className="w-4 h-4" /> {t("terms")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); setContactSheetOpen(true); }} data-testid="link-contact">
                <Mail className="w-4 h-4" /> {t("contactUs")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3 text-destructive" onClick={() => logout()} data-testid="button-logout">
                <LogOut className="w-4 h-4" /> {t("logout")}
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => { setMenuOpen(false); setDeleteConfirmText(""); setShowDeleteDialog(true); }}
                data-testid="button-delete-profile"
              >
                <Trash2 className="w-4 h-4" /> Delete Profile
              </Button>
            </div>
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pointer-events-auto px-4" data-testid="dialog-delete-profile">
          <div className="w-full max-w-md bg-card border rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0 mt-0.5">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground">Delete Your Profile</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  This will <span className="font-semibold text-red-600 dark:text-red-500">permanently delete</span> your account and all associated data — including call history, credits, subscriptions, and provider profile. This action <span className="font-semibold">cannot be undone, ever.</span>
                </p>
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-3 text-sm text-red-700 dark:text-red-400">
              ⚠️ Once deleted, your account will be gone forever with no way to recover it.
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Type <span className="font-mono font-bold tracking-widest text-red-600 dark:text-red-500">DELETE</span> to confirm:</p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE here"
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-red-500"
                data-testid="input-delete-confirm"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(""); }}
                disabled={isDeletingProfile}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                disabled={deleteConfirmText !== "DELETE" || isDeletingProfile}
                data-testid="button-confirm-delete"
                onClick={async () => {
                  setIsDeletingProfile(true);
                  try {
                    const res = await fetch("/api/profile/me", { method: "DELETE", credentials: "include" });
                    if (res.ok) {
                      toast({ title: "Account deleted", description: "Your profile has been permanently deleted." });
                      setTimeout(() => { window.location.href = "/"; }, 1000);
                    } else {
                      const data = await res.json().catch(() => ({}));
                      toast({ title: "Delete failed", description: data.message || "Something went wrong. Please try again.", variant: "destructive" });
                      setIsDeletingProfile(false);
                    }
                  } catch {
                    toast({ title: "Delete failed", description: "Network error. Please try again.", variant: "destructive" });
                    setIsDeletingProfile(false);
                  }
                }}
              >
                {isDeletingProfile ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Deleting…</> : "Yes, Delete Forever"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {contactSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setContactSheetOpen(false)} data-testid="sheet-contact-us">
          <div className="w-full sm:max-w-md bg-card border-t sm:border sm:rounded-2xl rounded-t-2xl shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg" data-testid="text-contact-title">{t("contactUsTitle")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t("contactUsSubtitle")}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setContactSheetOpen(false)} data-testid="button-close-contact-sheet">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="space-y-2">
              {contactEmailsList.map((entry, i) => (
                <a
                  key={`${entry.email}-${i}`}
                  href={`mailto:${entry.email}`}
                  className="flex items-center gap-3 p-3 rounded-xl border bg-background hover:bg-muted active:scale-[0.98] transition"
                  data-testid={`link-email-${i}`}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {entry.label ? (
                      <p className="text-xs font-medium text-muted-foreground">{entry.label}</p>
                    ) : null}
                    <p className="font-mono text-sm break-all">{entry.email}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </a>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setContactSheetOpen(false)} data-testid="button-cancel-contact-sheet">
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-card border-b px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="icon" onClick={() => setMenuOpen(true)} data-testid="button-menu">
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setLocation("/provider/dashboard")} data-testid="link-header-logo">
            <img src={logoImg} alt="Mitrify" className="w-6 h-6 rounded-md" />
            <span className="font-bold">Mitrify</span>
            <Badge variant="secondary" className="text-[10px]">Provider</Badge>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {profile && (
          <div className="flex items-center gap-3 mb-2 p-3 bg-card rounded-xl border">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-primary/10 border-2 border-border flex items-center justify-center shrink-0">
              {provider?.profilePhoto ? (
                <img src={provider.profilePhoto} alt={profile.name} className="w-full h-full object-cover" data-testid="img-provider-photo" />
              ) : (
                <User className="w-7 h-7 text-primary/60" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">Hi, {profile.name}!</h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Wrench className="w-3 h-3" /> {provider?.serviceName || "Service Provider"}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setLocation("/provider/edit-profile")} data-testid="button-edit-photo">
              <Camera className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <Coins className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold" data-testid="text-total-credits">{credits?.totalCredits ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">{t("totalCredits")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Phone className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{callHistory?.length || 0}</p>
              <p className="text-[10px] text-muted-foreground">{t("totalCalls")}</p>
            </CardContent>
          </Card>
        </div>

        {/* My Subscription card */}
        <Card data-testid="card-my-subscription-provider">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm">My Subscription</p>
                  {activeSubPlan !== "none" ? (
                    <div className="mt-0.5">
                      <div className="flex items-center gap-1.5">
                        <PlanTick plan={activeSubPlan} size={14} />
                        <span className="text-[11px] text-muted-foreground capitalize" data-testid="text-provider-active-plan">
                          {activeSubPlan} · {subDays} day{subDays === 1 ? "" : "s"} left
                        </span>
                      </div>
                      {mySub?.active?.endDate && (
                        <p className="text-[11px] text-muted-foreground" data-testid="text-provider-active-plan-expiry">
                          Expires {new Date(mySub.active.endDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">No active plan</p>
                  )}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setLocation("/subscriptions")} data-testid="button-provider-subscriptions">
                {activeSubPlan === "none" ? "Upgrade" : "Manage"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {credits && credits.totalCredits <= 0 && (
          <Card className="border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-800 dark:text-red-200 leading-snug">
                  {t("lowBalanceBannerProvider")}
                </p>
                {profile?.acceptDoubleCharge && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("forceCallingHint")}
                  </p>
                )}
                <Button
                  size="sm"
                  className="mt-2 bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => setLocation("/provider/balance")}
                  data-testid="button-recharge-banner"
                >
                  {t("rechargeNow")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Force Calling toggle — provider opts in to receive calls from
            zero-balance customers (provider pays 2 credits per such call). */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <Label htmlFor="force-calling-toggle" className="font-semibold cursor-pointer">
                    {t("forceCallingTitle")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {t("forceCallingHint")}
                </p>
              </div>
              <Switch
                id="force-calling-toggle"
                checked={!!profile?.acceptDoubleCharge}
                onCheckedChange={(next) => {
                  if (next) {
                    setForceCallConfirmOpen(true);
                  } else {
                    setForceCalling.mutate(false);
                  }
                }}
                disabled={setForceCalling.isPending}
                data-testid="switch-force-calling"
              />
            </div>
          </CardContent>
        </Card>

        <Dialog open={forceCallConfirmOpen} onOpenChange={setForceCallConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("forceCallingConfirmTitle")}</DialogTitle>
              <DialogDescription>{t("forceCallingConfirmBody")}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => setForceCallConfirmOpen(false)} data-testid="button-force-call-cancel">
                {t("cancel")}
              </Button>
              <Button
                onClick={() => { setForceCallConfirmOpen(false); setForceCalling.mutate(true); }}
                data-testid="button-force-call-confirm"
              >
                {t("confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {credits && credits.totalCredits <= 2 && (
          <Card className="border-orange-200 dark:border-orange-800">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Coins className="w-4 h-4" /> Buy Provider Credits
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Each call received uses 1 credit (Rs.1/credit). Buy credits to keep receiving calls.
              </p>
              <div className="flex items-center gap-3 mb-3">
                <Button variant="outline" size="icon" onClick={() => setBuyAmount(Math.max(1, buyAmount - 1))} data-testid="button-decrease-amount">
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(Math.max(1, Math.min(10000, parseInt(e.target.value) || 1)))}
                  className="text-center text-lg font-bold w-24"
                  data-testid="input-buy-amount"
                />
                <Button variant="outline" size="icon" onClick={() => setBuyAmount(Math.min(10000, buyAmount + 1))} data-testid="button-increase-amount">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <Button className="w-full" onClick={() => purchaseCredits.mutate()} disabled={purchaseCredits.isPending} data-testid="button-buy-credits">
                Buy {buyAmount} Credits (Rs.{buyAmount})
              </Button>
            </CardContent>
          </Card>
        )}

        {myPromo && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Share2 className="w-4 h-4" /> Your Referral Code
              </h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono" data-testid="text-promo-code">
                  {myPromo.code}
                </code>
                <Button size="icon" variant="outline" onClick={copyPromo} data-testid="button-copy-promo">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Used {myPromo.usageCount} times</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <h3 id="provider-call-history" className="font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Recent Calls
            </h3>
            {(!callHistory || callHistory.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-4">No calls yet</p>
            ) : (
              <div className="space-y-2">
                {callHistory.slice(0, 10).map((call) => (
                  <div key={call.id} className="flex items-center justify-between py-2 border-b last:border-0" data-testid={`call-log-${call.id}`}>
                    <div>
                      <p className="text-sm font-medium">{call.customerName}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {call.timestamp ? new Date(call.timestamp).toLocaleString() : "Unknown"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <Badge variant="secondary" className="text-xs">{call.paymentStatus}</Badge>
                      <span className="text-[10px] font-semibold" data-testid={`text-credits-${call.id}`}>
                        {t("creditsCharged").replace("{n}", String(call.creditsCharged ?? 1))}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {(() => {
                          const r = call.chargeReason || "normal";
                          if (r === "customer_no_balance") return t("callReasonCustomerNoBalance");
                          if (r === "provider_no_balance") return t("callReasonProviderNoBalance");
                          return t("callReasonNormal");
                        })()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
