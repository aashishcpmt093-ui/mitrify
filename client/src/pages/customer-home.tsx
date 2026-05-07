import { setScrollToTopVisible } from "@/lib/scroll-to-top-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PlanTick } from "@/components/PlanTick";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_STATES, getDistricts, DEFAULT_STATE, DEFAULT_DISTRICT } from "@/lib/india-locations";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import {
  Search, Phone, MapPin, Menu, X, History, Coins,
  LogOut, Zap, Loader2, ChevronRight, Tag, ArrowLeftRight, Wrench,
  Droplets, Plug, Paintbrush, Car, Home, Scissors, Hammer, Laptop,
  UtensilsCrossed, Shirt, Clock, Navigation, MapPinned, Check, Settings, GraduationCap,
  Info, ScrollText, Briefcase, Plus, AlertCircle, Trash2, LogIn, UserX, Bell, User, Mail, Sparkles, Lock, Shield
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useTheme } from "@/lib/theme";
import { useLanguage, LANGUAGE_NAMES, Language } from "@/lib/language";
import { Moon, Sun } from "lucide-react";
import logoImg from "@assets/772B17C5-7738-43B8-B5C0-04A7F2A6561B_1773842365564.png";
import WelcomePopup from "@/components/welcome-popup";
import AIChat from "@/components/ai-chat";
import type { ProviderSearchResult, InsertJob } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const SERVICE_CATEGORIES = [
  { label: "Berozgar", icon: UserX, query: "berozgar", bg: "bg-rose-100 dark:bg-rose-900/30", color: "text-rose-600 dark:text-rose-400" },
  { label: "Job Seekers", icon: Briefcase, query: "job", bg: "bg-violet-100 dark:bg-violet-900/30", color: "text-violet-600 dark:text-violet-400" },
  { label: "Home Tuition/Tutor", icon: GraduationCap, query: "home tuition", bg: "bg-teal-100 dark:bg-teal-900/30", color: "text-teal-600 dark:text-teal-400" },
  { label: "Plumber", icon: Droplets, query: "plumber", bg: "bg-blue-100 dark:bg-blue-900/30", color: "text-blue-600 dark:text-blue-400" },
  { label: "Electrician", icon: Plug, query: "electrician", bg: "bg-yellow-100 dark:bg-yellow-900/30", color: "text-yellow-600 dark:text-yellow-400" },
  { label: "Painter", icon: Paintbrush, query: "painter", bg: "bg-pink-100 dark:bg-pink-900/30", color: "text-pink-600 dark:text-pink-400" },
  { label: "Mechanic", icon: Car, query: "mechanic", bg: "bg-red-100 dark:bg-red-900/30", color: "text-red-600 dark:text-red-400" },
  { label: "Carpenter", icon: Hammer, query: "carpenter", bg: "bg-amber-100 dark:bg-amber-900/30", color: "text-amber-600 dark:text-amber-400" },
  { label: "Cleaning", icon: Home, query: "cleaning", bg: "bg-green-100 dark:bg-green-900/30", color: "text-green-600 dark:text-green-400" },
  { label: "Salon", icon: Scissors, query: "salon", bg: "bg-purple-100 dark:bg-purple-900/30", color: "text-purple-600 dark:text-purple-400" },
  { label: "IT / Tech", icon: Laptop, query: "computer", bg: "bg-cyan-100 dark:bg-cyan-900/30", color: "text-cyan-600 dark:text-cyan-400" },
  { label: "Catering", icon: UtensilsCrossed, query: "catering", bg: "bg-orange-100 dark:bg-orange-900/30", color: "text-orange-600 dark:text-orange-400" },
  { label: "Tailor", icon: Shirt, query: "tailor", bg: "bg-indigo-100 dark:bg-indigo-900/30", color: "text-indigo-600 dark:text-indigo-400" },
];

type LocationMode = "current" | "custom";

type GoogleFallbackResult = {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  ratingCount: number | null;
  distanceKm: number | null;
};

function JobList({ jobList, jobListLoading, jobFilterText, jobFilterState, onSelect }: {
  jobList: any[] | undefined;
  jobListLoading: boolean;
  jobFilterText: string;
  jobFilterState: string;
  onSelect: (job: any) => void;
}) {
  if (jobListLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!jobList || jobList.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Abhi koi job nahi hai</p>
        <p className="text-sm mt-1">Baad mein dobara check karein</p>
      </div>
    );
  }
  const text = jobFilterText.toLowerCase();
  const filtered = jobList.filter((job: any) => {
    const matchText = !text || job.jobName?.toLowerCase().includes(text) || job.description?.toLowerCase().includes(text) || job.location?.toLowerCase().includes(text) || job.district?.toLowerCase().includes(text);
    const matchState = !jobFilterState || job.state === jobFilterState;
    return matchText && matchState;
  });
  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Koi job nahi mili</p>
        <p className="text-sm mt-1">Filter change karein</p>
      </div>
    );
  }
  return (
    <div className="px-5 pt-3 overflow-y-auto flex-1 space-y-3">
      {filtered.map((job: any) => (
        <button
          key={job.id}
          className="w-full border rounded-xl p-4 bg-card hover:shadow-md hover:bg-muted/30 transition-all text-left"
          onClick={() => onSelect(job)}
          data-testid={`card-job-${job.id}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold">{job.jobName}</h4>
                {job.postType === "google_form" && (
                  <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" data-testid={`badge-job-list-type-${job.id}`}>Google Form</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{job.district ? `${job.district}, ${job.state}` : job.location}</span>
                {job.salary && <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><Coins className="w-3 h-3" />{job.salary}</span>}
                {job.workHours && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" />{job.workHours}</span>}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </button>
      ))}
    </div>
  );
}

export default function CustomerHomePage() {
  const { user, logout, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { t, lang, setLang } = useLanguage();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [, setLocation] = useLocation();
  const { canInstall, install: installPwa } = usePwaInstall();
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const isAdmin = user?.role === "admin" || user?.role === "mainadmin";
  const isAdminSession = user?.authType === "admin" || user?.authType === "coadmin" || isAdmin;
  // Filter UI state — sits between search bar and results.
  // `maxDistanceKm` caps how far a provider can be (default 50 km, the
  // value most providers actually serve in our data). `sameCityOnly`
  // is a strict city-name match against the user's resolved city.
  const [maxDistanceKm, setMaxDistanceKm] = useState<number>(50);
  const [sameCityOnly, setSameCityOnly] = useState<boolean>(false);
  // User's city derived from active lat/lng via Nominatim reverse geocode.
  // Used by the "Same city only" filter. null until resolved.
  const [userCity, setUserCity] = useState<string | null>(null);
  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);
  const [customLat, setCustomLat] = useState<number | null>(null);
  const [customLng, setCustomLng] = useState<number | null>(null);
  const [locationMode, setLocationMode] = useState<LocationMode>("current");
  const [customAddress, setCustomAddress] = useState("");
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [locationLabel, setLocationLabel] = useState("Current Location");
  const [menuOpen, setMenuOpen] = useState(false);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
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
  const [searching, setSearching] = useState(false);
  const [phoneQuery, setPhoneQuery] = useState("");
  const [phoneSearching, setPhoneSearching] = useState(false);
  const [jobMenuOpen, setJobMenuOpen] = useState(false);
  const [showPostJob, setShowPostJob] = useState(false);
  const [postJobMethod, setPostJobMethod] = useState<"choice" | "mitrify" | "google_form">("choice");
  const [showFindJob, setShowFindJob] = useState(false);
  const [showMyPosts, setShowMyPosts] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [jobForm, setJobForm] = useState({ jobName: "", description: "", location: "", state: DEFAULT_STATE, district: DEFAULT_DISTRICT, workType: "field", salary: "", workHours: "", numEmployees: "", contactPhone: "", googleFormUrl: "" });
  const [jobFilterText, setJobFilterText] = useState("");
  const [jobFilterState, setJobFilterState] = useState("");
  const [jobPosting, setJobPosting] = useState(false);
  const [jobDialing, setJobDialing] = useState<number | null>(null);
  const [jobConfirmChecked, setJobConfirmChecked] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState<number | null>(null);
  const [phoneSheet, setPhoneSheet] = useState<{
    open: boolean;
    providerId: string;
    providerName: string;
    numbers: string[];
    confirmDoubleCharge?: boolean;
  }>({ open: false, providerId: "", providerName: "", numbers: [], confirmDoubleCharge: false });
  const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  // Notification badge count — only fetched when logged in. Polled every
  // 60s so freshly-received calls show a badge without a manual refresh.
  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: isAuthenticated,
    refetchInterval: 60000,
  });

  // Caller's own subscription. Used to render Free Call labels when the
  // caller is Premium (free outgoing) and to surface the active plan in
  // the menu. Skipped for guests.
  const { data: mySubscription } = useQuery<{ active: { plan: string; endDate: string } | null }>({
    queryKey: ["/api/subscriptions/me"],
    enabled: isAuthenticated,
  });
  const callerPlan = (mySubscription?.active?.plan as "boost" | "pro" | "premium" | undefined) || "none";
  // Customer pays 0 only when their own plan is Premium, OR when the provider
  // is Premium. Pro on the provider side means the provider's incoming side
  // is free but the customer is still billed 1 credit, so it is NOT free.
  const isFreeCall = (providerPlan: string | undefined | null) =>
    callerPlan === "premium" || providerPlan === "premium";

  const handleGoToLogin = async () => {
    try { await fetch("/api/guest-mode", { method: "POST", credentials: "include" }); } catch {}
    setLocation("/welcome");
  };

  const resetToHome = () => {
    setSearching(false);
    setSearchQuery("");
    setPhoneSearching(false);
    setPhoneQuery("");
    setMenuOpen(false);
    setJobMenuOpen(false);
    setShowPostJob(false);
    setShowFindJob(false);
    setShowMyPosts(false);
    setSelectedJob(null);
    setShowScrollToTop(false);
    setScrollToTopVisible(false);
    if (contentRef.current) {
      contentRef.current.scrollTo(0, 0);
    }
  };

  useEffect(() => {
    return () => {
      setScrollToTopVisible(false);
    };
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("mitrify_new_customer_welcome") === "1") {
        sessionStorage.removeItem("mitrify_new_customer_welcome");
        setTimeout(() => {
          toast({
            title: "Mitrify mein aapka swagat hai! 🎉",
            description: "Niche search karein aur apne kaam ka maahir dhundhein.",
            duration: 6000,
          });
        }, 800);
      }
    } catch {}
  }, []);

  const handleScroll = () => {
    if (contentRef.current) {
      const shouldShow = contentRef.current.scrollTop > 300;
      setShowScrollToTop(shouldShow);
      setScrollToTopVisible(shouldShow);
    }
  };

  const scrollToTop = () => {
    setShowScrollToTop(false);
    setScrollToTopVisible(false);
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const activeLat = locationMode === "current" ? currentLat : customLat;
  const activeLng = locationMode === "current" ? currentLng : customLng;

  // Reverse-geocode the active location to a city name so the
  // "Same city only" filter has something to compare against. Debounced
  // and cached per-coord (3-decimal precision ~111 m) to avoid hammering
  // Nominatim — they have a 1 req/sec public limit.
  useEffect(() => {
    if (activeLat == null || activeLng == null) { setUserCity(null); return; }
    const key = `${activeLat.toFixed(3)},${activeLng.toFixed(3)}`;
    const cached = sessionStorage.getItem(`rev:${key}`);
    if (cached !== null) { setUserCity(cached || null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${activeLat}&lon=${activeLng}&zoom=10&addressdetails=1`,
        );
        const j = await r.json();
        const a = j?.address || {};
        const city = a.city || a.town || a.village || a.municipality || a.county || a.state_district || "";
        sessionStorage.setItem(`rev:${key}`, city);
        setUserCity(city || null);
      } catch {
        // Silent — sameCity filter just won't constrain anything.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [activeLat, activeLng]);

  const normalizeCity = (s: string | null | undefined): string =>
    (s || "").toLowerCase().trim().replace(/\s+/g, " ");

  useEffect(() => {
    if (!navigator.geolocation) return;
    const tryGps = (highAccuracy: boolean, timeout: number) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setCurrentLat(lat);
          setCurrentLng(lng);
          if (typeof lat === "number" && typeof lng === "number") {
            fetch("/api/profiles/location", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ latitude: lat, longitude: lng, role: "customer" }),
            }).catch(() => {});
          }
        },
        (error) => {
          if (!highAccuracy) {
            tryGps(true, 15000);
          }
        },
        { enableHighAccuracy: highAccuracy, timeout, maximumAge: highAccuracy ? 0 : 60000 }
      );
    };
    tryGps(false, 5000);
  }, []);

  const { data: profile } = useQuery({ queryKey: ["/api/profiles/me", "customer"], queryFn: async () => {
    const res = await fetch("/api/profiles/me?role=customer", { credentials: "include" });
    if (!res.ok) throw new Error("Not found");
    return res.json();
  }});
  const { data: credits } = useQuery<{ freeCredits: number; purchasedCredits: number; totalCredits: number }>({
    queryKey: ["/api/credits/me"],
    queryFn: async () => {
      const res = await fetch("/api/credits/me", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const { data: recruitmentLink } = useQuery<string>({
    queryKey: ["/api/content", "recruitment_link"],
    queryFn: async () => { const res = await fetch("/api/content/recruitment_link"); if (!res.ok) return "https://forms.gle/C54uAz7pkupe6g136"; return res.json(); },
  });

  const { data: searchData, refetch, isLoading } = useQuery<{ results: ProviderSearchResult[], suggestion?: string | null }>({
    queryKey: ["/api/providers/search", searchQuery, activeLat, activeLng],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("query", searchQuery);
      if (activeLat) params.set("lat", String(activeLat));
      if (activeLng) params.set("lng", String(activeLng));
      const res = await fetch(`/api/providers/search?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: searching || searchQuery.length === 0,
  });

  const rawResults = searchData?.results || [];
  const suggestion = searchData?.suggestion;

  // Apply UI filters (distance cap + same-city) on the verified provider
  // list. Phone-search and Google fallback sections are intentionally
  // not filtered — phone search is an exact lookup and Google fallback
  // is already capped at 25 km server-side.
  const userCityNorm = normalizeCity(userCity);
  const results = rawResults.filter((r) => {
    if (typeof r.distanceKm === "number" && r.distanceKm > maxDistanceKm) return false;
    if (sameCityOnly && userCityNorm) {
      const rc = normalizeCity((r as any).city);
      if (!rc || rc !== userCityNorm) return false;
    }
    return true;
  });
  const hiddenByFilter = rawResults.length - results.length;

  // ── Google fallback (Task #72) ──────────────────────────────────
  // Runs in parallel with our own search and surfaces nearby
  // businesses we don't have yet. Disabled for pure-numeric queries
  // (those use the dedicated phone-lookup endpoint).
  const isPureNumericQuery = (() => {
    const d = searchQuery.trim().replace(/\D/g, "");
    return d.length >= 6 && d === searchQuery.trim().replace(/[\s\-\+]/g, "");
  })();
  const { data: googleData, isLoading: googleLoading } = useQuery<{ results: GoogleFallbackResult[] }>({
    queryKey: ["/api/providers/search-google", searchQuery, activeLat, activeLng],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("query", searchQuery);
      if (activeLat) params.set("lat", String(activeLat));
      if (activeLng) params.set("lng", String(activeLng));
      const res = await fetch(`/api/providers/search-google?${params}`);
      if (!res.ok) return { results: [] };
      return res.json();
    },
    enabled: searching && searchQuery.trim().length > 0 && !isPureNumericQuery,
    staleTime: 60_000,
  });
  const googleResults: GoogleFallbackResult[] = googleData?.results || [];

  // Saved Google leads — pending_providers added via system_google_fallback.
  // These are previously-seen Google businesses we've already auto-saved.
  // Surface them in the MAIN results region (not the bottom Google section)
  // so a 2nd search for the same service feels instant + DB-native.
  const { data: savedGoogleData } = useQuery<{ results: GoogleFallbackResult[] }>({
    queryKey: ["/api/providers/search-saved-google", searchQuery, activeLat, activeLng],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("query", searchQuery);
      if (activeLat) params.set("lat", String(activeLat));
      if (activeLng) params.set("lng", String(activeLng));
      const res = await fetch(`/api/providers/search-saved-google?${params}`);
      if (!res.ok) return { results: [] };
      return res.json();
    },
    enabled: searching && searchQuery.trim().length > 0 && !isPureNumericQuery && activeLat != null && activeLng != null,
    staleTime: 30_000,
  });
  const savedGoogleResults: GoogleFallbackResult[] = savedGoogleData?.results || [];
  // Apply the same client-side distance / same-city filter the verified
  // results use so the chips on top behave consistently across sections.
  const filteredSavedGoogleResults = savedGoogleResults.filter((g) => {
    if (g.distanceKm != null && maxDistanceKm > 0 && g.distanceKm > maxDistanceKm) return false;
    if (sameCityOnly && userCity) {
      const inCity = (g.address || "").toLowerCase().includes(userCity.toLowerCase());
      if (!inCity) return false;
    }
    return true;
  });

  const [isDialing, setIsDialing] = useState(false);

  const { data: phoneResults, isLoading: phoneLoading } = useQuery<ProviderSearchResult[]>({
    queryKey: ["/api/providers/by-phone", phoneQuery],
    queryFn: async () => {
      const res = await fetch(`/api/providers/by-phone?phone=${encodeURIComponent(phoneQuery)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Phone search failed");
      return res.json();
    },
    enabled: phoneSearching && phoneQuery.length >= 6,
    staleTime: 0,
  });

  const handleUnifiedSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    const digits = q.replace(/\D/g, "");
    const isPureNumeric = digits.length >= 6 && digits === q.replace(/[\s\-\+]/g, "");
    if (isPureNumeric) {
      setPhoneQuery(digits);
      setPhoneSearching(true);
      setSearching(false);
    } else {
      try { await apiRequest("POST", "/api/search/track", { query: q }); } catch {}
      setSearching(true);
      setPhoneSearching(false);
      refetch();
    }
  };

  const { data: jobList, refetch: refetchJobs, isLoading: jobListLoading } = useQuery<any[]>({
    queryKey: ["/api/jobs"],
    queryFn: async () => {
      const res = await fetch("/api/jobs", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showFindJob,
  });

  const { data: myJobs, refetch: refetchMyJobs } = useQuery<any[]>({
    queryKey: ["/api/jobs/my"],
    queryFn: async () => {
      const res = await fetch("/api/jobs/my", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showFindJob,
  });

  const handleSearch = handleUnifiedSearch;

  const handleCategorySearch = async (query: string) => {
    if (query.trim()) {
      // Track the search
      try {
        await apiRequest("POST", "/api/search/track", { query: query.trim() });
      } catch (err) {
        // Silently fail
      }
    }
    setSearchQuery(query);
    setSearching(true);
  };

  const GOOGLE_FORM_URL_RE = /^https?:\/\/(forms\.gle\/[^\s]+|docs\.google\.com\/forms\/[^\s]+)$/i;

  const resetJobForm = () => {
    setJobForm({ jobName: "", description: "", location: "", state: DEFAULT_STATE, district: DEFAULT_DISTRICT, workType: "field", salary: "", workHours: "", numEmployees: "", contactPhone: "", googleFormUrl: "" });
  };

  const openPostJobChoice = () => {
    setShowPostJob(true);
    setPostJobMethod("choice");
    setJobConfirmChecked(false);
    resetJobForm();
  };

  const handlePostJob = async () => {
    if (!isAuthenticated) { setShowLoginPrompt(true); return; }
    const isGoogleForm = postJobMethod === "google_form";
    if (!jobForm.jobName.trim() || !jobForm.description.trim() || !jobForm.state || !jobForm.district) {
      toast({ title: "Sabhi required fields fill karein", variant: "destructive" });
      return;
    }
    if (isGoogleForm) {
      if (!jobForm.googleFormUrl.trim() || !GOOGLE_FORM_URL_RE.test(jobForm.googleFormUrl.trim())) {
        toast({ title: "Sirf Google Form ka link allowed hai", description: "e.g. forms.gle/... ya docs.google.com/forms/...", variant: "destructive" });
        return;
      }
    } else {
      if (!jobForm.contactPhone.trim()) {
        toast({ title: "Contact number required", variant: "destructive" });
        return;
      }
      if (!jobForm.numEmployees.trim()) {
        toast({ title: "Kitne log chahiye field required hai", variant: "destructive" });
        return;
      }
    }
    setJobPosting(true);
    try {
      const location = jobForm.location.trim() || `${jobForm.district}, ${jobForm.state}`;
      const payload: InsertJob = isGoogleForm
        ? {
            postType: "google_form",
            jobName: jobForm.jobName,
            description: jobForm.description,
            state: jobForm.state,
            district: jobForm.district,
            location,
            contactPhone: jobForm.contactPhone,
            googleFormUrl: jobForm.googleFormUrl.trim(),
          }
        : {
            postType: "mitrify",
            jobName: jobForm.jobName,
            description: jobForm.description,
            state: jobForm.state,
            district: jobForm.district,
            location,
            workType: jobForm.workType,
            salary: jobForm.salary,
            workHours: jobForm.workHours,
            numEmployees: jobForm.numEmployees,
            contactPhone: jobForm.contactPhone,
          };
      const res = await apiRequest("POST", "/api/jobs", payload);
      await res.json();
      toast({ title: "Job post ho gayi!", description: "25 credits deduct hue" });
      setShowPostJob(false);
      setPostJobMethod("choice");
      setJobMenuOpen(false);
      resetJobForm();
      queryClient.invalidateQueries({ queryKey: ["/api/credits/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/my"] });
    } catch (e: any) {
      toast({ title: "Job post failed", description: e.message || "Try again", variant: "destructive" });
    } finally {
      setJobPosting(false);
    }
  };

  const handleDeleteJob = async (jobId: number) => {
    setDeletingJobId(jobId);
    try {
      await apiRequest("DELETE", `/api/jobs/${jobId}`, undefined);
      toast({ title: "Job delete ho gayi" });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      refetchMyJobs();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message || "Try again", variant: "destructive" });
    } finally {
      setDeletingJobId(null);
    }
  };

  const handleApplyClick = (job: any) => {
    const url = job.googleFormUrl;
    let beaconSent = false;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        beaconSent = navigator.sendBeacon(
          `/api/jobs/${job.id}/apply-click`,
          new Blob(["{}"], { type: "application/json" })
        );
      }
    } catch {}
    const openForm = () => {
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) window.location.href = url;
    };
    queryClient.invalidateQueries({ queryKey: ["/api/jobs/my"] });
    if (beaconSent) {
      openForm();
    } else {
      apiRequest("POST", `/api/jobs/${job.id}/apply-click`, {})
        .catch(() => {})
        .finally(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/jobs/my"] });
          openForm();
        });
    }
  };

  const handleJobCall = async (job: any) => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }
    setJobDialing(job.id);
    try {
      const res = await apiRequest("POST", `/api/jobs/${job.id}/call`, {});
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/credits/me"] });
      const cleanNumber = data.phone.replace(/[^0-9+]/g, "");
      window.location.href = `tel:${cleanNumber}`;
    } catch (e: any) {
      toast({ title: "Call failed", description: e.message || "Try again", variant: "destructive" });
    } finally {
      setJobDialing(null);
    }
  };

  const handleGeocodeAddress = async () => {
    if (!customAddress.trim()) {
      toast({ title: "Please enter an address", variant: "destructive" });
      return;
    }
    setGeocoding(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(customAddress)}&limit=1`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const result = data[0];
        setCustomLat(parseFloat(result.lat));
        setCustomLng(parseFloat(result.lon));
        setLocationMode("custom");
        setLocationLabel(customAddress.length > 30 ? customAddress.substring(0, 30) + "..." : customAddress);
        setLocationPickerOpen(false);
        toast({ title: "Location set", description: `Searching near: ${result.display_name?.split(",").slice(0, 3).join(",")}` });
        if (searching) refetch();
      } else {
        toast({ title: "Location not found", description: "Try a more specific address", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to find location", variant: "destructive" });
    } finally {
      setGeocoding(false);
    }
  };

  const switchToCurrentLocation = () => {
    setLocationMode("current");
    setLocationLabel("Current Location");
    setCustomLat(null);
    setCustomLng(null);
    setCustomAddress("");
    setLocationPickerOpen(false);
    if (searching) refetch();
  };

  const dialPhone = async (phoneNumber: string, providerId: string, opts?: { confirmDoubleCharge?: boolean }) => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }
    setIsDialing(true);
    try {
      const body: { providerId: string; confirmDoubleCharge?: boolean } = { providerId };
      if (opts?.confirmDoubleCharge) body.confirmDoubleCharge = true;
      const res = await apiRequest("POST", "/api/calls", body);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/credits/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calls/customer"] });
      const charged = data?.creditsCharged ?? 1;
      toast({ title: t("creditsCharged").replace("{n}", String(charged)) });
      const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");
      window.location.href = `tel:${cleanNumber}`;
      setPhoneSheet({ open: false, providerId: "", providerName: "", numbers: [] });
    } catch (error: any) {
      // Server returns body { reason: "..."} for known cases; surface a
      // localized toast for each. provider_no_balance means the
      // provider's balance went to zero between search and dial — reopen
      // the confirmation dialog so the customer can opt-in.
      const msg: string = error?.message || "";
      if (msg.includes("provider_no_balance") && !opts?.confirmDoubleCharge) {
        // Fabricate a minimal result for the dialog using sheet context
        // since we only have the providerId here.
        toast({
          title: t("lowBalanceWarningTitle"),
          description: t("lowBalanceWarningBody").replace("{name}", phoneSheet.providerName || ""),
          variant: "destructive",
        });
        setPhoneSheet({ open: false, providerId: "", providerName: "", numbers: [] });
        return;
      }
      let title = t("callFailed");
      let description = msg;
      if (msg.includes("both_no_balance")) { title = t("bothNoBalance"); description = ""; }
      else if (msg.includes("customer_no_balance_blocked")) { title = t("customerNoBalanceBlocked"); description = ""; }
      else if (msg.includes("cap_reached")) { title = t("capReached"); description = ""; }
      else if (msg.includes("need_two_credits") || msg.includes("provider_cannot_absorb")) { title = t("needTwoCredits"); description = ""; }
      else if (msg.includes("402")) { title = t("noCreditMsg"); description = ""; }
      toast({ title, description, variant: "destructive" });
      setPhoneSheet({ open: false, providerId: "", providerName: "", numbers: [] });
    } finally {
      setIsDialing(false);
    }
  };

  // When the provider has zero balance the customer must confirm the
  // 2-credit double-charge before we actually dial. We stash the pending
  // call here while the dialog is open.
  const [doubleChargeConfirm, setDoubleChargeConfirm] = useState<{ result: ProviderSearchResult; numbers: string[] } | null>(null);

  const proceedToDial = (result: ProviderSearchResult, numbers: string[], opts?: { confirmDoubleCharge?: boolean }) => {
    if (numbers.length === 1) {
      dialPhone(numbers[0], result.provider.userId, opts);
    } else {
      setPhoneSheet({
        open: true,
        providerId: result.provider.userId,
        providerName: result.profile.name,
        numbers,
        confirmDoubleCharge: !!opts?.confirmDoubleCharge,
      });
    }
  };

  const handleCall = (result: ProviderSearchResult) => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }

    const mobileNums = result.provider.mobileNumbers || [];
    const profileMobile = (result.profile as any)?.mobile;
    const numbers = mobileNums.length > 0
      ? mobileNums
      : profileMobile ? [profileMobile] : [];
    if (numbers.length === 0) {
      toast({ title: t("noNumber"), description: "", variant: "destructive" });
      return;
    }

    // Free-call cases (caller Premium OR provider Premium) bypass every
    // double-charge / low-balance dialog: the customer is never charged so
    // those warnings are irrelevant.
    if (isFreeCall(result.plan)) {
      proceedToDial(result, numbers);
      return;
    }

    // Provider has 0 balance → require explicit confirmation up-front.
    // Customer 0-balance is NOT pre-blocked: the server may still allow
    // the call when the provider has acceptDoubleCharge=true (Force
    // Calling), so we let /api/calls decide and surface its reason.
    if (result.providerLowBalance) {
      setDoubleChargeConfirm({ result, numbers });
      return;
    }

    proceedToDial(result, numbers);
  };

  return (
    <div className="min-h-screen bg-background relative isolate" ref={contentRef} onScroll={handleScroll}>
      <WelcomePopup />
      {phoneSheet.open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none" data-testid="phone-sheet">
          <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={() => setPhoneSheet({ open: false, providerId: "", providerName: "", numbers: [] })} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl pb-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="px-5 pb-3 border-b">
              <h3 className="font-semibold text-lg" data-testid="text-phone-sheet-title">Call {phoneSheet.providerName}</h3>
              <p className="text-sm text-muted-foreground">Choose a number to call</p>
            </div>
            <div className="px-5 pt-3 space-y-2">
              {phoneSheet.numbers.map((num, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  onClick={() => dialPhone(num, phoneSheet.providerId, { confirmDoubleCharge: !!phoneSheet.confirmDoubleCharge })}
                  className="w-full flex items-center gap-4 p-4 h-auto justify-start rounded-xl text-left"
                  data-testid={`button-dial-${i}`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-base">{num}</p>
                    <p className="text-xs text-muted-foreground">Number {i + 1}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Button>
              ))}
            </div>
            <div className="px-5 pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setPhoneSheet({ open: false, providerId: "", providerName: "", numbers: [] })}
                data-testid="button-close-phone-sheet"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── JOB MENU ─────────────────────────────── */}
      {jobMenuOpen && !showPostJob && !showFindJob && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none" data-testid="job-menu">
          <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={() => setJobMenuOpen(false)} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl pb-8 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="px-5 pb-4 border-b">
              <h3 className="font-bold text-lg flex items-center gap-2"><Briefcase className="w-5 h-5 text-amber-500" /> {t("jobs")}</h3>
              <p className="text-sm text-muted-foreground">{t("jobMenuSubtitle")}</p>
            </div>
            <div className="px-5 pt-4 space-y-3">
              <button
                onClick={openPostJobChoice}
                className="w-full flex items-center gap-4 p-4 rounded-xl border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 hover:shadow-md transition-all text-left"
                data-testid="button-post-job"
              >
                <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <Plus className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-700 dark:text-amber-300">{t("postJob")}</p>
                  <p className="text-xs text-muted-foreground">{t("jobPostDesc")}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => { setShowFindJob(true); refetchJobs(); }}
                className="w-full flex items-center gap-4 p-4 rounded-xl border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:shadow-md transition-all text-left"
                data-testid="button-find-job"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <Search className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-blue-700 dark:text-blue-300">{t("findJob")}</p>
                  <p className="text-xs text-muted-foreground">{t("jobFindDesc")}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => { setShowMyPosts(true); refetchMyJobs(); }}
                className="w-full flex items-center gap-4 p-4 rounded-xl border bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 hover:shadow-md transition-all text-left"
                data-testid="button-my-posts"
              >
                <div className="w-11 h-11 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
                  <Briefcase className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-purple-700 dark:text-purple-300">{t("myPosts")}</p>
                  <p className="text-xs text-muted-foreground">{t("jobMyPostsDesc")}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── POST JOB FORM ────────────────────────── */}
      {jobMenuOpen && showPostJob && postJobMethod === "choice" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none" data-testid="post-job-choice-modal">
          <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={() => setShowPostJob(false)} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl pb-8 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="px-5 pb-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2"><Plus className="w-5 h-5 text-amber-500" /> {t("postJob")}</h3>
                <p className="text-sm text-muted-foreground">Kis tarike se job post karna chahte ho?</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowPostJob(false)} data-testid="button-close-post-choice"><X className="w-5 h-5" /></Button>
            </div>
            <div className="px-5 pt-4 space-y-3">
              <button
                onClick={() => setPostJobMethod("google_form")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:shadow-md transition-all text-left"
                data-testid="button-method-google-form"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <ScrollText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-blue-700 dark:text-blue-300">By Google Form</p>
                  <p className="text-xs text-muted-foreground">Apna Google Form link paste karein</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => setPostJobMethod("mitrify")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 hover:shadow-md transition-all text-left"
                data-testid="button-method-mitrify"
              >
                <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <Briefcase className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-700 dark:text-amber-300">By Mitrify</p>
                  <p className="text-xs text-muted-foreground">Mitrify ka detailed job form bharein</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── POST JOB: GOOGLE FORM VARIANT ────────── */}
      {jobMenuOpen && showPostJob && postJobMethod === "google_form" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none" data-testid="post-job-google-form-modal">
          <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={() => { setShowPostJob(false); setJobMenuOpen(false); }} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl pb-8 max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="px-5 pb-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2"><ScrollText className="w-5 h-5 text-blue-500" /> Post via Google Form</h3>
                <p className="text-sm text-muted-foreground">Apna Google Form link paste karein</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPostJobMethod("choice")} data-testid="button-back-google-form"><X className="w-5 h-5" /></Button>
            </div>
            <div className="px-5 pt-4 space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Job Title / Naam <span className="text-destructive">*</span></label>
                <Input placeholder="e.g., Driver chahiye, Cook chahiye..." value={jobForm.jobName} onChange={e => setJobForm(f => ({ ...f, jobName: e.target.value }))} data-testid="input-gf-job-name" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description <span className="text-destructive">*</span></label>
                <Textarea placeholder="Kaam ki short detail" value={jobForm.description} onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))} rows={3} data-testid="input-gf-job-description" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">State <span className="text-destructive">*</span></label>
                  <Select value={jobForm.state} onValueChange={v => setJobForm(f => ({ ...f, state: v, district: getDistricts(v)[0] || "" }))}>
                    <SelectTrigger data-testid="select-gf-job-state"><SelectValue placeholder="State" /></SelectTrigger>
                    <SelectContent className="max-h-56 overflow-y-auto">
                      {ALL_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">District <span className="text-destructive">*</span></label>
                  <Select value={jobForm.district} onValueChange={v => setJobForm(f => ({ ...f, district: v }))}>
                    <SelectTrigger data-testid="select-gf-job-district"><SelectValue placeholder="District" /></SelectTrigger>
                    <SelectContent className="max-h-56 overflow-y-auto">
                      {getDistricts(jobForm.state).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Contact Number (Optional)</label>
                <Input type="tel" placeholder="Optional" value={jobForm.contactPhone} onChange={e => setJobForm(f => ({ ...f, contactPhone: e.target.value }))} data-testid="input-gf-job-phone" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Google Form Link <span className="text-destructive">*</span></label>
                <Input
                  placeholder="https://forms.gle/... ya https://docs.google.com/forms/..."
                  value={jobForm.googleFormUrl}
                  onChange={e => setJobForm(f => ({ ...f, googleFormUrl: e.target.value }))}
                  data-testid="input-gf-url"
                />
                {jobForm.googleFormUrl.trim() !== "" && !GOOGLE_FORM_URL_RE.test(jobForm.googleFormUrl.trim()) && (
                  <p className="text-xs text-destructive mt-1" data-testid="text-gf-url-error">Sirf Google Form ka link allowed hai (forms.gle / docs.google.com/forms)</p>
                )}
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">Job post karne ke liye 25 credits deduct honge. Apply button par tap karne se aapka Google Form khulega.</p>
              </div>
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors" data-testid="label-gf-job-confirm">
                <input
                  type="checkbox"
                  checked={jobConfirmChecked}
                  onChange={e => setJobConfirmChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-amber-500"
                  data-testid="checkbox-gf-job-confirm"
                />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  ☑️ Main samajhta/samajhti hoon ki <strong>job post mein 25 credits deduct honge</strong>. Job ko baad mein edit nahi kiya ja sakta, sirf delete kiya ja sakta hai.
                </span>
              </label>
              <Button
                className="w-full bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
                onClick={handlePostJob}
                disabled={jobPosting || !jobConfirmChecked}
                data-testid="button-submit-gf-job"
              >
                {jobPosting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                {jobPosting ? `${t("loading")}...` : "Post via Google Form"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {jobMenuOpen && showPostJob && postJobMethod === "mitrify" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none" data-testid="post-job-modal">
          <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={() => { setShowPostJob(false); setJobMenuOpen(false); }} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl pb-8 max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="px-5 pb-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2"><Plus className="w-5 h-5 text-amber-500" /> {t("postJob")}</h3>
                <p className="text-sm text-muted-foreground">{t("jobPostDesc")}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPostJobMethod("choice")} data-testid="button-back-mitrify"><X className="w-5 h-5" /></Button>
            </div>
            <div className="px-5 pt-4 space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Job Title / Naam <span className="text-destructive">*</span></label>
                <Input placeholder="e.g., Driver chahiye, Cook chahiye..." value={jobForm.jobName} onChange={e => setJobForm(f => ({ ...f, jobName: e.target.value }))} data-testid="input-job-name" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description <span className="text-destructive">*</span></label>
                <Textarea placeholder="Kaam ki detail, timing, requirements..." value={jobForm.description} onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))} rows={3} data-testid="input-job-description" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">State <span className="text-destructive">*</span></label>
                  <Select value={jobForm.state} onValueChange={v => setJobForm(f => ({ ...f, state: v, district: getDistricts(v)[0] || "" }))}>
                    <SelectTrigger data-testid="select-job-state"><SelectValue placeholder="State" /></SelectTrigger>
                    <SelectContent className="max-h-56 overflow-y-auto">
                      {ALL_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">District <span className="text-destructive">*</span></label>
                  <Select value={jobForm.district} onValueChange={v => setJobForm(f => ({ ...f, district: v }))}>
                    <SelectTrigger data-testid="select-job-district"><SelectValue placeholder="District" /></SelectTrigger>
                    <SelectContent className="max-h-56 overflow-y-auto">
                      {getDistricts(jobForm.state).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Work Type (Optional)</label>
                <Select value={jobForm.workType} onValueChange={v => setJobForm(f => ({ ...f, workType: v }))}>
                  <SelectTrigger data-testid="select-job-worktype"><SelectValue placeholder="Select work type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="field">Field Work</SelectItem>
                    <SelectItem value="office">Office Work</SelectItem>
                    <SelectItem value="remote">Work from Home</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">City / Area (Optional)</label>
                <Input placeholder="e.g., Budaun City, Near Bus Stand..." value={jobForm.location} onChange={e => setJobForm(f => ({ ...f, location: e.target.value }))} data-testid="input-job-location" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Salary (Optional)</label>
                  <Input placeholder="e.g., Rs.10000/month" value={jobForm.salary} onChange={e => setJobForm(f => ({ ...f, salary: e.target.value }))} data-testid="input-job-salary" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Work Hours (Optional)</label>
                  <Input placeholder="e.g., 9am–6pm" value={jobForm.workHours} onChange={e => setJobForm(f => ({ ...f, workHours: e.target.value }))} data-testid="input-job-workhours" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Kitne Log Chahiye? <span className="text-destructive">*</span></label>
                <Input placeholder="e.g., 1, 2-3, 5+" value={jobForm.numEmployees} onChange={e => setJobForm(f => ({ ...f, numEmployees: e.target.value }))} data-testid="input-job-employees" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Contact Number <span className="text-destructive">*</span></label>
                <Input type="tel" placeholder="Caller is number par call karega" value={jobForm.contactPhone} onChange={e => setJobForm(f => ({ ...f, contactPhone: e.target.value }))} data-testid="input-job-phone" />
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">Job post karne ke liye 25 credits deduct honge. Jab aapke credits khatam ho jayenge toh job chhup jayegi (call button hata diya jayega).</p>
              </div>
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors" data-testid="label-job-confirm">
                <input
                  type="checkbox"
                  checked={jobConfirmChecked}
                  onChange={e => setJobConfirmChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-amber-500"
                  data-testid="checkbox-job-confirm"
                />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  ☑️ Main samajhta/samajhti hoon ki <strong>job post mein 25 credits deduct honge</strong>, aur jab koi call karega toh 1 credit per call alag se deduct hoga. Job ko baad mein edit nahi kiya ja sakta, sirf delete kiya ja sakta hai. Mein detail dobara check kar chuka/chuki hoon.
                </span>
              </label>
              <Button
                className="w-full bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
                onClick={handlePostJob}
                disabled={jobPosting || !jobConfirmChecked || !jobForm.numEmployees.trim()}
                data-testid="button-submit-job"
              >
                {jobPosting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                {jobPosting ? `${t("loading")}...` : t("postJobBtn")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── FIND JOBS LIST ───────────────────────── */}
      {jobMenuOpen && showFindJob && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none" data-testid="find-jobs-modal">
          <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={() => { setShowFindJob(false); setJobMenuOpen(false); }} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl pb-8 max-h-[92vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-center pt-3 pb-2 shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="px-5 pb-3 border-b flex items-center justify-between shrink-0">
              <h3 className="font-bold text-lg flex items-center gap-2"><Search className="w-5 h-5 text-blue-500" /> Job Dhundein</h3>
              <Button variant="ghost" size="icon" onClick={() => { setShowFindJob(false); setJobMenuOpen(false); }}><X className="w-5 h-5" /></Button>
            </div>
            <div className="px-5 pt-3 pb-2 space-y-2 shrink-0 border-b">
              <Input
                placeholder="Job naam, description search..."
                value={jobFilterText}
                onChange={e => setJobFilterText(e.target.value)}
                className="text-sm"
                data-testid="input-job-filter-text"
              />
              <Select value={jobFilterState || "__all__"} onValueChange={v => setJobFilterState(v === "__all__" ? "" : v)}>
                <SelectTrigger className="text-sm" data-testid="select-job-filter-state">
                  <SelectValue placeholder="Sabhi States" />
                </SelectTrigger>
                <SelectContent className="max-h-56 overflow-y-auto">
                  <SelectItem value="__all__">Sabhi States</SelectItem>
                  {ALL_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <JobList
              jobList={jobList}
              jobListLoading={jobListLoading}
              jobFilterText={jobFilterText}
              jobFilterState={jobFilterState}
              onSelect={setSelectedJob}
            />
          </div>
        </div>
      )}

      {/* ── JOB DETAIL MODAL ─────────────────────── */}
      {selectedJob && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-none" data-testid="job-detail-modal">
          <div className="absolute inset-0 bg-black/50 pointer-events-auto" onClick={() => setSelectedJob(null)} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl pb-8 max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            {/* Header: Job name + Call button */}
            <div className="px-5 pt-5 pb-4 border-b flex items-center justify-between gap-3 shrink-0">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg leading-tight">{selectedJob.jobName}</h3>
                <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5"><MapPin className="w-3 h-3" />{selectedJob.location}</span>
                {selectedJob.postType === "google_form" && (
                  <Badge variant="secondary" className="mt-1 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" data-testid={`badge-job-type-detail-${selectedJob.id}`}>Google Form</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedJob.postType === "google_form" ? (
                  <Button
                    className="h-10 px-4 rounded-xl bg-blue-500 hover:bg-blue-600 text-white shadow-md gap-2"
                    onClick={() => handleApplyClick(selectedJob)}
                    data-testid="button-job-apply-gf-top"
                  >
                    <ScrollText className="w-4 h-4" /> Apply
                  </Button>
                ) : selectedJob.lowCredit ? (
                  <div className="px-3 py-2 rounded-xl bg-muted text-xs text-muted-foreground font-medium">Call N/A</div>
                ) : (
                  <Button
                    className="h-10 px-4 rounded-xl bg-green-500 hover:bg-green-600 text-white shadow-md gap-2"
                    onClick={() => handleJobCall(selectedJob)}
                    disabled={jobDialing === selectedJob.id}
                    data-testid="button-job-call-top"
                  >
                    {jobDialing === selectedJob.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                    Call
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setSelectedJob(null)}><X className="w-5 h-5" /></Button>
              </div>
            </div>
            {/* Body: Full details */}
            <div className="px-5 pt-4 overflow-y-auto flex-1 space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm leading-relaxed whitespace-pre-line">{selectedJob.description}</p>
              </div>
              {(selectedJob.salary || selectedJob.workHours) && (
                <div className="grid grid-cols-2 gap-3">
                  {selectedJob.salary && (
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-green-100 dark:border-green-900">
                      <p className="text-xs text-muted-foreground mb-0.5">Salary</p>
                      <p className="font-semibold text-green-700 dark:text-green-400 text-sm">{selectedJob.salary}</p>
                    </div>
                  )}
                  {selectedJob.workHours && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-100 dark:border-blue-900">
                      <p className="text-xs text-muted-foreground mb-0.5">Work Hours</p>
                      <p className="font-semibold text-blue-700 dark:text-blue-400 text-sm">{selectedJob.workHours}</p>
                    </div>
                  )}
                </div>
              )}
              {selectedJob.postType === "google_form" ? (
                <p className="text-xs text-muted-foreground text-center pt-2">Apply karne ke liye Google Form khulega</p>
              ) : (
                <p className="text-xs text-muted-foreground text-center pt-2">1 credit deduct hoga is call se</p>
              )}
            </div>
            {/* Footer: Call/Apply button at bottom */}
            <div className="px-5 pt-3 shrink-0">
              {selectedJob.postType === "google_form" ? (
                <Button
                  className="w-full h-12 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-base font-semibold gap-2"
                  onClick={() => handleApplyClick(selectedJob)}
                  data-testid="button-job-apply-gf-bottom"
                >
                  <ScrollText className="w-5 h-5" /> Apply (Google Form)
                </Button>
              ) : selectedJob.lowCredit ? (
                <div className="w-full py-3 rounded-xl bg-muted text-center text-sm text-muted-foreground">Is job poster ke credits khatam ho gaye hain</div>
              ) : (
                <Button
                  className="w-full h-12 rounded-xl bg-green-500 hover:bg-green-600 text-white text-base font-semibold gap-2"
                  onClick={() => handleJobCall(selectedJob)}
                  disabled={jobDialing === selectedJob.id}
                  data-testid="button-job-call-bottom"
                >
                  {jobDialing === selectedJob.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Phone className="w-5 h-5" />}
                  {jobDialing === selectedJob.id ? "Connecting..." : "Call Karein"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MERI POSTS MODAL ─────────────────────── */}
      {jobMenuOpen && showMyPosts && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none" data-testid="my-posts-modal">
          <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={() => { setShowMyPosts(false); setJobMenuOpen(false); }} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl pb-8 max-h-[92vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-center pt-3 pb-2 shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="px-5 pb-3 border-b flex items-center justify-between shrink-0">
              <h3 className="font-bold text-lg flex items-center gap-2"><Briefcase className="w-5 h-5 text-purple-500" /> Meri Posts</h3>
              <Button variant="ghost" size="icon" onClick={() => { setShowMyPosts(false); setJobMenuOpen(false); }}><X className="w-5 h-5" /></Button>
            </div>
            <div className="px-5 pt-3 overflow-y-auto flex-1 space-y-3">
              {!myJobs || myJobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Aapne koi job post nahi ki</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => { setShowMyPosts(false); openPostJobChoice(); }}>
                    <Plus className="w-4 h-4 mr-1" /> {t("postJob")}
                  </Button>
                </div>
              ) : (
                myJobs.map((job: any) => (
                  <div key={job.id} className="border rounded-xl p-4 bg-card" data-testid={`card-my-job-${job.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold">{job.jobName}</h4>
                          {job.postType === "google_form" ? (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" data-testid={`badge-my-job-type-${job.id}`}>Google Form</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" data-testid={`badge-my-job-type-${job.id}`}>Mitrify</Badge>
                          )}
                          {!job.isActive && <Badge variant="secondary" className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Inactive</Badge>}
                          {job.lowCredit && job.postType !== "google_form" && <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">Low Credit</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{job.description}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{job.location}</span>
                          {job.salary && <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><Coins className="w-3 h-3" />{job.salary}</span>}
                          {job.workHours && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" />{job.workHours}</span>}
                          {job.postType === "google_form" && (
                            <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium" data-testid={`text-apply-clicks-${job.id}`}>
                              <ScrollText className="w-3 h-3" />{job.applyClicks ?? 0} clicks
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="w-9 h-9 rounded-lg shrink-0"
                        onClick={() => { if (window.confirm(`"${job.jobName}" delete karein?`)) handleDeleteJob(job.id); }}
                        disabled={deletingJobId === job.id}
                        data-testid={`button-delete-job-${job.id}`}
                      >
                        {deletingJobId === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {locationPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none" data-testid="location-picker">
          <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={() => setLocationPickerOpen(false)} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl pb-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="px-5 pb-3 border-b">
              <h3 className="font-semibold text-lg" data-testid="text-location-title">Set Search Location</h3>
              <p className="text-sm text-muted-foreground">Search near your current location or any custom address</p>
            </div>
            <div className="px-5 pt-4 space-y-3">
              <Button
                variant={locationMode === "current" ? "default" : "outline"}
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={switchToCurrentLocation}
                data-testid="button-use-current-location"
              >
                <Navigation className="w-5 h-5" />
                <div className="text-left">
                  <p className="font-medium">Use Current Location</p>
                  <p className="text-xs opacity-70">
                    {currentLat && currentLng ? "GPS location detected" : "Waiting for GPS..."}
                  </p>
                </div>
                {locationMode === "current" && <Check className="w-4 h-4 ml-auto" />}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 text-xs text-muted-foreground">OR</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={customAddress}
                    onChange={e => setCustomAddress(e.target.value)}
                    placeholder="Enter address, area, city..."
                    onKeyDown={e => e.key === "Enter" && handleGeocodeAddress()}
                    data-testid="input-custom-address"
                  />
                  <Button
                    onClick={handleGeocodeAddress}
                    disabled={geocoding || !customAddress.trim()}
                    data-testid="button-set-custom-location"
                  >
                    {geocoding ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPinned className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Example: "Connaught Place, Delhi" or "MG Road, Bangalore"
                </p>
              </div>
            </div>
            <div className="px-5 pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLocationPickerOpen(false)}
                data-testid="button-close-location-picker"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-50 flex pointer-events-auto">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
            data-testid="menu-backdrop"
          />
          <div className="relative z-10 w-72 bg-card border-r shadow-xl h-full flex flex-col pointer-events-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => { setMenuOpen(false); setSearching(false); setSearchQuery(""); setLocation("/customer/home"); }}
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
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); setSearching(false); setSearchQuery(""); setLocation("/customer/home"); }} data-testid="link-home">
                <Home className="w-4 h-4" /> {t("home")}
              </Button>
              {isAuthenticated && (
                <Button variant="ghost" className="w-full justify-start gap-3 relative" onClick={() => { setMenuOpen(false); setLocation("/notifications"); }} data-testid="link-notifications">
                  <Bell className="w-4 h-4" /> {t("notifications")}
                  {(unreadCount?.count ?? 0) > 0 && (
                    <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5" data-testid="badge-unread-count">
                      {unreadCount!.count > 99 ? "99+" : unreadCount!.count}
                    </span>
                  )}
                </Button>
              )}
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); if (!isAuthenticated) { setShowLoginPrompt(true); return; } setLocation("/my-profile"); }} data-testid="button-my-profile">
                <User className="w-4 h-4" /> {t("myProfile")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); window.open(recruitmentLink || "https://forms.gle/C54uAz7pkupe6g136", "_blank"); }} data-testid="button-recruitment">
                <Briefcase className="w-4 h-4" /> {t("recruitment")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); if (!isAuthenticated) { setShowLoginPrompt(true); return; } setLocation("/subscriptions"); }} data-testid="button-subscriptions-menu">
                <Sparkles className="w-4 h-4 text-amber-500" /> {t("subscriptions")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setMenuOpen(false); window.open("https://mitrify.xyz", "_blank", "noopener,noreferrer"); }} data-testid="button-secret-chat">
                <Lock className="w-4 h-4 text-emerald-500" /> Secret Chat
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3" onClick={toggleTheme} data-testid="button-theme-toggle">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {theme === "dark" ? t("lightMode") : t("darkMode")}
              </Button>
              {isAdminSession && (
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-primary"
                  onClick={() => { setMenuOpen(false); setLocation("/admin/dashboard"); }}
                  data-testid="button-switch-to-admin"
                >
                  <Shield className="w-4 h-4" /> Switch to Admin
                </Button>
              )}

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
              {isAuthenticated ? (
                <Button variant="ghost" className="w-full justify-start gap-3 text-destructive" onClick={() => logout()} data-testid="button-logout">
                  <LogOut className="w-4 h-4" /> {t("logout")}
                </Button>
              ) : (
                <Button variant="ghost" className="w-full justify-start gap-3 text-primary" onClick={() => { setMenuOpen(false); setLocation("/welcome"); }} data-testid="button-login-menu">
                  <LogOut className="w-4 h-4" /> {t("loginSignup")}
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      {contactSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 pointer-events-auto" onClick={() => setContactSheetOpen(false)} data-testid="sheet-contact-us">
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

      <header className="sticky top-0 z-50 bg-card border-b px-4 py-2.5">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setMenuOpen(true)} data-testid="button-menu">
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 cursor-pointer" onClick={resetToHome} title="Reset to home">
            <img src={logoImg} alt="Mitrify" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-lg">Mitrify</span>
          </div>
          <div className="flex items-center gap-2">
            {!isAuthenticated ? (
              <Button size="sm" onClick={handleGoToLogin} data-testid="button-top-login-signup" className="h-8 text-xs px-3">
                {t("loginSignup")}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-1.5 px-3 h-8 text-xs font-semibold border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                  onClick={() => setJobMenuOpen(true)}
                  data-testid="button-jobs"
                >
                  <Briefcase className="w-3.5 h-3.5" /> Jobs
                </Button>
                <button
                  onClick={() => setLocationPickerOpen(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  data-testid="button-open-location-picker"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[80px]">{locationLabel}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        {!searching && (
          <div className="flex flex-col items-center pt-6 pb-4 animate-fade-in">
            {!isAuthenticated && (
              <div className="w-full max-w-md mb-4 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 border border-blue-200 dark:border-blue-800 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                    <LogIn className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-blue-900 dark:text-blue-100">{t("loginRequired")}</h3>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">Post jobs aur calls ke liye</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs bg-blue-500 hover:bg-blue-600"
                    onClick={() => setLocation("/welcome")}
                    data-testid="button-guest-login-banner"
                  >
                    <LogIn className="w-3 h-3 mr-1" /> Login
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
                    onClick={() => setLocation("/signup")}
                    data-testid="button-guest-signup-banner"
                  >
                    Sign Up
                  </Button>
                </div>
              </div>
            )}
            <img src={logoImg} alt="Mitrify" className="w-20 h-20 rounded-2xl mb-3" />
            {profile && (
              <h2 className="text-xl font-bold mb-1" data-testid="text-greeting">Hi, {profile.name}!</h2>
            )}
            {isAuthenticated ? (
              <p className="text-sm text-muted-foreground mb-5">Find service providers near you</p>
            ) : (
              <p className="text-sm text-muted-foreground mb-5">Search providers. Login to call & post jobs.</p>
            )}

            <div className="w-full max-w-md">
              <div className="flex items-center gap-2 px-4 py-3 rounded-full border-2 border-muted bg-card shadow-lg hover:shadow-xl transition-shadow focus-within:border-primary focus-within:shadow-xl">
                <Search className="w-5 h-5 text-muted-foreground shrink-0" />
                <Input
                  type="search"
                  placeholder="नाम / सेवा / मोबाइल नंबर"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleUnifiedSearch()}
                  className="flex-1 border-0 shadow-none p-0 h-auto text-base focus-visible:ring-0 bg-transparent"
                  data-testid="input-search"
                />
                <Button onClick={handleUnifiedSearch} size="sm" className="rounded-full px-4" disabled={phoneLoading} data-testid="button-search">
                  {phoneLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("searchBtn")}
                </Button>
              </div>
            </div>

            {credits && (
              <Badge className="mt-4 cursor-pointer" variant={credits.totalCredits > 0 ? "secondary" : "destructive"} onClick={() => setLocation("/customer/balance")} data-testid="badge-credits">
                <Coins className="w-3 h-3 mr-1" /> {credits.totalCredits} Credits
              </Badge>
            )}
          </div>
        )}

        {(searching || phoneSearching) && (
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full border bg-card shadow-md">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                type="search"
                placeholder="नाम / सेवा / मोबाइल नंबर"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleUnifiedSearch()}
                className="flex-1 border-0 shadow-none p-0 h-auto text-sm focus-visible:ring-0 bg-transparent"
                data-testid="input-search-active"
              />
              <Button
                onClick={() => { setSearching(false); setPhoneSearching(false); setSearchQuery(""); setPhoneQuery(""); }}
                size="sm" variant="ghost" className="rounded-full px-2 h-7"
                data-testid="button-clear-search"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Result filter box — sits between search and results.
                Distance cap (numeric input + quick chips) + a Same-city
                checkbox. Only shown for service search (not phone). */}
            {searching && !phoneSearching && (
              <div className="px-4 py-3 rounded-2xl border bg-card shadow-sm" data-testid="box-result-filters">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Max distance</span>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={maxDistanceKm}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v > 0 && v <= 500) setMaxDistanceKm(v);
                        else if (e.target.value === "") setMaxDistanceKm(1);
                      }}
                      className="w-20 h-8 text-sm"
                      data-testid="input-max-distance"
                    />
                    <span className="text-xs font-medium text-muted-foreground">km</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none" data-testid="label-same-city">
                    <Checkbox
                      checked={sameCityOnly}
                      onCheckedChange={(v) => setSameCityOnly(v === true)}
                      data-testid="checkbox-same-city"
                    />
                    <span className="text-xs font-medium">
                      Same city only
                      {userCity ? <span className="text-muted-foreground"> · {userCity}</span> : null}
                    </span>
                  </label>
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {[5, 10, 25, 50, 100].map((km) => (
                    <button
                      key={km}
                      onClick={() => setMaxDistanceKm(km)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                        maxDistanceKm === km
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                      data-testid={`chip-distance-${km}`}
                    >
                      {km} km
                    </button>
                  ))}
                  {hiddenByFilter > 0 && (
                    <span className="text-[11px] text-muted-foreground ml-auto" data-testid="text-hidden-count">
                      {hiddenByFilter} hidden by filter
                    </span>
                  )}
                </div>
                {sameCityOnly && !userCity && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2" data-testid="text-city-warning">
                    City detect nahi ho payi — filter tab tak nahi lagega jab tak location resolve na ho.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {(isLoading || phoneLoading) && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Phone search results */}
        {phoneSearching && !phoneLoading && phoneResults && (
          <div className="space-y-3 mb-4">
            {phoneResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No provider found with this number</p>
                <p className="text-sm mt-1">The number may not be registered as a service provider</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{phoneResults.length} provider{phoneResults.length > 1 ? "s" : ""} found</p>
              </>
            )}
          </div>
        )}

        {!searching && !phoneSearching && (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide" data-testid="text-categories-heading">{t("popularServices")}</h3>
              <div className="grid grid-cols-4 gap-3">
                {SERVICE_CATEGORIES.map((cat, i) => (
                  <button
                    key={cat.query}
                    onClick={() => handleCategorySearch(cat.query)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card hover:shadow-md hover:scale-105 transition-all duration-200 animate-slide-up"
                    style={{ animationDelay: `${i * 50}ms` }}
                    data-testid={`button-category-${cat.query}`}
                  >
                    <div className={`w-11 h-11 rounded-xl ${cat.bg} flex items-center justify-center`}>
                      <cat.icon className={`w-5 h-5 ${cat.color}`} />
                    </div>
                    <span className="text-xs font-medium text-center leading-tight">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        {searching && !isLoading && suggestion && results.length === 0 && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-muted-foreground mb-2">Did you mean:</p>
            <button
              onClick={() => setSearchQuery(suggestion)}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm"
              data-testid="button-suggestion"
            >
              {suggestion}
            </button>
          </div>
        )}

        {searching && !isLoading && results && results.length === 0 && !suggestion && googleResults.length === 0 && !googleLoading && filteredSavedGoogleResults.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No service providers found</p>
            <p className="text-sm mt-1">Try a different search term or change location</p>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {searching && searchQuery.trim().toLowerCase() === "job" && (
            <Card
              className="overflow-hidden hover:shadow-lg transition-shadow duration-200 animate-slide-up border-violet-200 dark:border-violet-800"
              data-testid="card-search-job"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 border border-border">
                      <Briefcase className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold truncate">Jobs</h3>
                        <Badge variant="secondary" className="text-[10px] bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">Matched</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">Job section kholne ke liye click karein</p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    className="shrink-0 w-11 h-11 rounded-xl bg-violet-500 text-white shadow-md"
                    onClick={() => { if (isAuthenticated) setJobMenuOpen(true); else setShowLoginPrompt(true); }}
                    data-testid="button-open-job-search"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Phone search results */}
          {phoneSearching && !phoneLoading && phoneResults?.map((result, i) => (
            <Card key={`phone-${result.provider.id}`} className="overflow-hidden hover:shadow-lg transition-shadow duration-200 animate-slide-up border-blue-200 dark:border-blue-800" style={{ animationDelay: `${i * 80}ms` }} data-testid={`card-phone-result-${result.provider.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 border border-border">
                      {(result.provider as any).profilePhoto ? (
                        <img src={(result.provider as any).profilePhoto} alt={result.profile.name} className="w-full h-full object-cover" />
                      ) : (
                        <Phone className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold truncate">{result.profile.name}</h3>
                        <PlanTick plan={result.plan} size={14} />
                        <Badge variant="secondary" className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Matched</Badge>
                      </div>
                      <p className="text-sm text-primary font-medium">{result.provider.serviceName}</p>
                      {result.provider.approxCharge && (
                        <p className="text-sm text-muted-foreground mt-0.5">Approx: Rs.{result.provider.approxCharge}</p>
                      )}
                      {(result.provider as any).address && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{(result.provider as any).address}</p>
                      )}
                      {result.provider.hashtags && result.provider.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {result.provider.hashtags.slice(0, 3).map((tag, ti) => (
                            <Badge key={ti} variant="secondary" className="text-xs">
                              <Tag className="w-3 h-3 mr-1" />{tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {isAuthenticated && result.canCall ? (
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        className={`w-11 h-11 rounded-xl text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${result.providerLowBalance ? "bg-red-500 hover:bg-red-600" : "bg-green-500"}`}
                        onClick={() => handleCall(result)}
                        disabled={isDialing || !isAuthenticated}
                        data-testid={`button-call-phone-${result.provider.id}`}
                      >
                        <Phone className="w-5 h-5" />
                      </Button>
                      {isFreeCall(result.plan) ? (
                        <Badge className="text-[8px] leading-none px-1 py-0.5 bg-emerald-500 hover:bg-emerald-500 text-white border-0" data-testid={`badge-free-call-phone-${result.provider.id}`}>
                          Free Call
                        </Badge>
                      ) : result.providerLowBalance && (
                        <Badge variant="destructive" className="text-[8px] leading-none px-1 py-0.5">
                          {t("doubleChargeBadge")}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <div className="shrink-0 w-11 h-11 rounded-xl bg-muted flex items-center justify-center" title={t("creditsFinished")} data-testid={`badge-no-credit-phone-${result.provider.id}`}>
                      <Phone className="w-5 h-5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Service search results */}
          {/* Verified providers (own DB) */}
          {results?.map((result, i) => (
            <Card key={result.provider.id} className="overflow-hidden hover:shadow-lg transition-shadow duration-200 animate-slide-up" style={{ animationDelay: `${i * 80}ms` }} data-testid={`card-provider-${result.provider.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <button className="flex gap-3 flex-1 min-w-0 text-left" onClick={() => setSelectedProvider(result)}>
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0 border border-border">
                      {(result.provider as any).profilePhoto ? (
                        <img src={(result.provider as any).profilePhoto} alt={result.profile.name} className="w-full h-full object-cover" data-testid={`img-provider-photo-${result.provider.id}`} />
                      ) : (
                        <Wrench className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold truncate hover:underline">{result.profile.name}</h3>
                        <PlanTick plan={result.plan} size={14} />
                      </div>
                      <p className="text-sm text-primary font-medium">{result.provider.serviceName}</p>
                      {result.provider.approxCharge && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Approx: Rs.{result.provider.approxCharge}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {result.distanceKm !== null && result.distanceKm !== undefined
                          ? `~${result.distanceKm.toFixed(1)} km ${t("away")}${result.distanceApprox ? " (approx)" : ""}${result.distanceApprox && (result as any).city ? ` · ${(result as any).city}` : ""}`
                          : `${t("distanceUnknown")}${(result as any).city ? ` · ${(result as any).city}` : ""}`}
                      </div>
                      {(result.provider as any).address && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {(result.provider as any).address}
                        </p>
                      )}
                      {result.provider.hashtags && result.provider.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {result.provider.hashtags.slice(0, 3).map((tag, ti) => (
                            <Badge key={ti} variant="secondary" className="text-xs">
                              <Tag className="w-3 h-3 mr-1" />{tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                  {isAuthenticated && result.canCall ? (
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        className={`w-11 h-11 rounded-xl text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${result.providerLowBalance ? "bg-red-500 hover:bg-red-600" : "bg-green-500"}`}
                        onClick={() => handleCall(result)}
                        disabled={isDialing || !isAuthenticated}
                        data-testid={`button-call-${result.provider.id}`}
                      >
                        <Phone className="w-5 h-5" />
                      </Button>
                      {isFreeCall(result.plan) ? (
                        <Badge className="text-[8px] leading-none px-1 py-0.5 bg-emerald-500 hover:bg-emerald-500 text-white border-0" data-testid={`badge-free-call-${result.provider.id}`}>
                          Free Call
                        </Badge>
                      ) : result.providerLowBalance && (
                        <Badge variant="destructive" className="text-[8px] leading-none px-1 py-0.5">
                          {t("doubleChargeBadge")}
                        </Badge>
                      )}
                    </div>
                  ) : !isAuthenticated ? (
                    <div className="shrink-0 w-11 h-11 rounded-xl bg-muted flex items-center justify-center opacity-50 cursor-not-allowed" title="Login required" data-testid={`badge-auth-required-${result.provider.id}`}>
                      <Phone className="w-5 h-5 text-muted-foreground/40" />
                    </div>
                  ) : result.contactHidden ? (
                    <div className="shrink-0 flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl bg-muted/60 border border-dashed border-muted-foreground/30" title={t("numberHidden")} data-testid={`badge-hidden-${result.provider.id}`}>
                      <Phone className="w-4 h-4 text-muted-foreground/40" />
                      <span className="text-[9px] text-muted-foreground/60 font-medium leading-none">{t("hidden")}</span>
                    </div>
                  ) : (
                    <div className="shrink-0 w-11 h-11 rounded-xl bg-muted flex items-center justify-center" title={t("creditsFinished")} data-testid={`badge-no-credit-${result.provider.id}`}>
                      <Phone className="w-5 h-5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* ── Saved Google leads (previously auto-saved) ──────────
              Render these BEFORE the "from Google" separator so they
              feel like a continuation of our own DB results. The bottom
              Google section already dedupes them by phone, so they
              won't appear twice. */}
          {filteredSavedGoogleResults.map((g, i) => (
            <Card
              key={`saved-google-${g.placeId || g.phone}-${i}`}
              className="overflow-hidden hover:shadow-lg transition-shadow duration-200 animate-slide-up"
              style={{ animationDelay: `${(results?.length || 0) * 80 + i * 60}ms` }}
              data-testid={`card-saved-google-${g.placeId || i}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-border">
                      <Wrench className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-semibold truncate" data-testid={`text-saved-google-name-${i}`}>{g.name}</h3>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 leading-tight text-muted-foreground border-muted-foreground/30" data-testid={`badge-saved-google-unverified-${i}`}>
                          Unverified
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {g.distanceKm != null
                          ? `~${g.distanceKm.toFixed(1)} km ${t("away")}`
                          : t("distanceUnknown")}
                      </div>
                      {g.address && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{g.address}</p>
                      )}
                    </div>
                  </div>
                  <a
                    href={`tel:${g.phone}`}
                    className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white shadow-md transition-colors"
                    data-testid={`button-call-saved-google-${g.placeId || i}`}
                    aria-label={`Call ${g.name}`}
                  >
                    <Phone className="w-5 h-5" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* ── Google fallback section (Task #72) ──────────────────
              Hamesha apne results ke neeche dikhao. Sirf woh Google
              businesses jinme phone + location dono hain. Direct call
              link — koi credit nahi katega, koi masking nahi. */}
          {searching && !isPureNumericQuery && googleLoading && googleResults.length === 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 py-2" data-testid="separator-google-loading">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">from Google</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {[0, 1, 2].map((i) => (
                <Card key={`google-skel-${i}`} className="overflow-hidden border-dashed border-muted-foreground/20">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 animate-pulse">
                      <div className="w-12 h-12 rounded-full bg-muted shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-1/2 bg-muted rounded" />
                        <div className="h-2 w-2/3 bg-muted rounded" />
                        <div className="h-2 w-1/3 bg-muted rounded" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {searching && !isPureNumericQuery && googleResults.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 py-2" data-testid="separator-google">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">—— from Google ——</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {googleResults.map((g, i) => (
                <Card
                  key={`google-${g.placeId || g.phone}-${i}`}
                  className="overflow-hidden border-dashed border-muted-foreground/30 bg-muted/20 animate-slide-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                  data-testid={`card-google-${g.placeId || i}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border">
                          <MapPinned className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-semibold truncate" data-testid={`text-google-name-${i}`}>{g.name}</h3>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 leading-tight text-muted-foreground border-muted-foreground/30" data-testid={`badge-google-unverified-${i}`}>
                              Unverified
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                            {g.distanceKm != null && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />~{g.distanceKm.toFixed(1)} km {t("away")}
                              </span>
                            )}
                            {g.rating != null && (
                              <span className="flex items-center gap-0.5">
                                <Sparkles className="w-3 h-3 text-amber-500" />
                                {g.rating.toFixed(1)}
                                {g.ratingCount != null && <span className="text-muted-foreground/60"> ({g.ratingCount})</span>}
                              </span>
                            )}
                          </div>
                          {g.address && (
                            <p className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-2">{g.address}</p>
                          )}
                        </div>
                      </div>
                      <a
                        href={`tel:${g.phone}`}
                        className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white shadow-md transition-colors"
                        data-testid={`button-call-google-${g.placeId || i}`}
                        aria-label={`Call ${g.name}`}
                      >
                        <Phone className="w-5 h-5" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── PROVIDER DETAIL MODAL ────────────────── */}
      {selectedProvider && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-none" data-testid="provider-detail-modal">
          <div className="absolute inset-0 bg-black/50 pointer-events-auto" onClick={() => setSelectedProvider(null)} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl pb-8 max-h-[90vh] flex flex-col">
            {/* Header: name + quick call */}
            <div className="px-5 pt-5 pb-4 border-b flex items-center justify-between gap-3 shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg leading-tight">{selectedProvider.profile.name}</h3>
                  <PlanTick plan={selectedProvider.plan} size={16} />
                </div>
                <p className="text-sm text-primary font-medium">{selectedProvider.provider.serviceName}</p>
                {selectedProvider.distanceKm !== null && selectedProvider.distanceKm !== undefined && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <MapPin className="w-3 h-3" />~{selectedProvider.distanceKm.toFixed(1)} km {t("away")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedProvider.canCall ? (
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      className={`h-9 px-4 rounded-xl text-white gap-2 ${
                        isFreeCall(selectedProvider.plan)
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : selectedProvider.providerLowBalance ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
                      }`}
                      onClick={() => { handleCall(selectedProvider); setSelectedProvider(null); }}
                      disabled={isDialing}
                      data-testid="button-provider-call-top"
                    >
                      {isDialing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                      {isFreeCall(selectedProvider.plan) ? "Free Call" : "Call"}
                    </Button>
                    {!isFreeCall(selectedProvider.plan) && selectedProvider.providerLowBalance && (
                      <Badge variant="destructive" className="text-[8px] leading-none px-1 py-0.5">{t("doubleChargeBadge")}</Badge>
                    )}
                  </div>
                ) : null}
                <Button variant="ghost" size="icon" onClick={() => setSelectedProvider(null)}><X className="w-5 h-5" /></Button>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 pt-4 overflow-y-auto flex-1 space-y-4">
              {(selectedProvider.provider as any).profilePhoto && (
                <div className="flex justify-center">
                  <img src={(selectedProvider.provider as any).profilePhoto} className="w-24 h-24 rounded-full object-cover border-4 border-border" alt={selectedProvider.profile.name} />
                </div>
              )}
              {(selectedProvider.provider as any).description && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t("aboutSection")}</p>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{(selectedProvider.provider as any).description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {selectedProvider.provider.approxCharge && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-green-100 dark:border-green-900">
                    <p className="text-xs text-muted-foreground mb-0.5">{t("chargeSection")}</p>
                    <p className="font-semibold text-green-700 dark:text-green-400 text-sm">Rs.{selectedProvider.provider.approxCharge}</p>
                  </div>
                )}
                {selectedProvider.distanceKm !== null && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-100 dark:border-blue-900">
                    <p className="text-xs text-muted-foreground mb-0.5">{t("distanceSection")}</p>
                    <p className="font-semibold text-blue-700 dark:text-blue-400 text-sm">~{selectedProvider.distanceKm?.toFixed(1)} km</p>
                  </div>
                )}
              </div>
              {selectedProvider.provider.hashtags && selectedProvider.provider.hashtags.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{t("servicesSection")}</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedProvider.provider.hashtags.map((tag: string, idx: number) => (
                      <Badge key={idx} variant="secondary" className="text-xs"><Tag className="w-3 h-3 mr-1" />{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {(selectedProvider.provider as any).address && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{(selectedProvider.provider as any).address}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center pt-1">{t("creditDeduct")}</p>
            </div>

            {/* Footer: main call button */}
            <div className="px-5 pt-3 shrink-0">
              {selectedProvider.canCall ? (
                <div className="space-y-2">
                  <Button
                    className={`w-full h-12 rounded-xl text-white text-base font-semibold gap-2 ${
                      isFreeCall(selectedProvider.plan)
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : selectedProvider.providerLowBalance ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
                    }`}
                    onClick={() => { handleCall(selectedProvider); setSelectedProvider(null); }}
                    disabled={isDialing}
                    data-testid="button-provider-call-bottom"
                  >
                    {isDialing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Phone className="w-5 h-5" />}
                    {isDialing
                      ? t("connectingCall")
                      : isFreeCall(selectedProvider.plan) ? "Free Call" : t("callBtn")}
                  </Button>
                  {!isFreeCall(selectedProvider.plan) && selectedProvider.providerLowBalance && (
                    <p className="text-xs text-red-600 dark:text-red-400 text-center font-medium">
                      {t("doubleChargeBadge")} · {t("lowBalanceWarningTitle")}
                    </p>
                  )}
                </div>
              ) : selectedProvider.contactHidden ? (
                <div className="w-full py-3 rounded-xl bg-muted text-center text-sm text-muted-foreground">
                  {t("numberHidden")}
                </div>
              ) : (
                <div className="w-full py-3 rounded-xl bg-muted text-center text-sm text-muted-foreground">
                  {t("creditsFinished")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── GUEST LOGIN PROMPT MODAL ─────────────── */}
      {showLoginPrompt && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 pointer-events-none" data-testid="login-prompt-modal">
          <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={() => setShowLoginPrompt(false)} />
          <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Phone className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-bold text-lg mb-1">{t("loginRequired")}</h3>
            <p className="text-sm text-muted-foreground mb-5">{t("loginRequiredDesc")}</p>
            <div className="space-y-2">
              <Button className="w-full" onClick={() => { setShowLoginPrompt(false); setLocation("/welcome"); }} data-testid="button-prompt-login">
                {t("loginBtn")}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => { setShowLoginPrompt(false); setLocation("/signup"); }} data-testid="button-prompt-signup">
                {t("createAccount")}
              </Button>
              <Button variant="ghost" className="w-full text-sm" onClick={() => setShowLoginPrompt(false)} data-testid="button-prompt-cancel">
                {t("later")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showScrollToTop && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-4 right-4 z-50 rounded-full p-3 shadow-lg hover:shadow-xl transition-all bg-primary hover:bg-primary/90"
          size="icon"
          title="Scroll to top"
          data-testid="button-scroll-to-top"
        >
          <ChevronRight className="w-5 h-5 rotate-[-90deg]" />
        </Button>
      )}

      <Dialog open={!!doubleChargeConfirm} onOpenChange={(o) => !o && setDoubleChargeConfirm(null)}>
        <DialogContent data-testid="dialog-double-charge-confirm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              {t("lowBalanceWarningTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("lowBalanceWarningBody").replace("{name}", doubleChargeConfirm?.result.profile.name || "")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-2 justify-end">
            <Button variant="outline" onClick={() => setDoubleChargeConfirm(null)} data-testid="button-double-charge-cancel">
              {t("cancel")}
            </Button>
            <Button
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => {
                if (!doubleChargeConfirm) return;
                const { result, numbers } = doubleChargeConfirm;
                setDoubleChargeConfirm(null);
                proceedToDial(result, numbers, { confirmDoubleCharge: true });
              }}
              data-testid="button-double-charge-confirm"
            >
              {t("callTwoCredits")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AIChat isAdmin={false} />
    </div>
  );
}
