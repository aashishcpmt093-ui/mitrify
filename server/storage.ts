import { db } from "./db";
import { findKnownPhones } from "./phoneDedupe";
import {
  profiles, providers, calls, promoCodes, localUsers, credits, subscriptions, siteContent,
  coAdmins, pendingProviders, visitorStats, jobs, promoUsageLog, employees, searchLog,
  salaryPayments, creditPayments, appNotifications, tagJobs, googlePlacesRuns,
  DEFAULT_SUBSCRIPTION_PLAN_CONFIG,
  type TagJob, type GooglePlacesRun, type InsertGooglePlacesRun,
  type Job,
  type Profile, type InsertProfile,
  type Provider, type InsertProvider,
  type Call, type InsertCall,
  type Credit, type InsertCredit,
  type PromoCode, type InsertPromoCode,
  type LocalUser, type InsertLocalUser,
  type CoAdmin, type InsertCoAdmin,
  type PendingProvider, type InsertPendingProvider,
  type ProviderSearchResult, type AdminStats, type CallLog,
  type Employee, type InsertEmployee, type SearchLog,
  type SalaryPayment, type CreditPayment, type Subscription, type InsertSubscription,
  type SubscriptionPlan, type SubscriptionPlanConfig,
} from "@shared/schema";
import { eq, and, gte, sql, like, or, ilike, count, desc, asc, isNull, lt, inArray, ne } from "drizzle-orm";

// ── Subscription plan ranking ────────────────────────────────────────────────
// Search results sort by descending plan rank (Premium > Pro > Boost > none).
export const PLAN_RANK: Record<SubscriptionPlan, number> = {
  premium: 3,
  pro: 2,
  boost: 1,
  none: 0,
};

export interface IStorage {
  getLocalUserByPhone(phone: string): Promise<LocalUser | undefined>;
  getLocalUserByUsername(username: string): Promise<LocalUser | undefined>;
  getLocalUserByEmail(email: string): Promise<LocalUser | undefined>;
  getLocalUserByUserId(userId: string): Promise<LocalUser | undefined>;
  createLocalUser(data: InsertLocalUser): Promise<LocalUser>;
  updateLocalUserPassword(userId: string, hashedPassword: string): Promise<void>;
  updateLocalUserCredentials(userId: string, username: string, hashedPassword: string): Promise<void>;
  getProfile(userId: string): Promise<Profile | undefined>;
  getProfileByRole(userId: string, role: string): Promise<Profile | undefined>;
  getProfilesByUser(userId: string): Promise<Profile[]>;
  createProfile(data: InsertProfile): Promise<Profile>;
  updateProfile(userId: string, data: Partial<InsertProfile>, role?: string): Promise<Profile>;
  getProfilesByRole(role: string): Promise<Profile[]>;
  toggleBlock(userId: string): Promise<Profile>;
  deleteProfile(userId: string): Promise<void>;

  getProvider(userId: string): Promise<Provider | undefined>;
  getProviderById(id: number): Promise<Provider | undefined>;
  createProvider(data: InsertProvider): Promise<Provider>;
  updateProvider(userId: string, data: Partial<InsertProvider>): Promise<Provider>;
  searchProviders(query?: string, lat?: number, lng?: number, radius?: number): Promise<ProviderSearchResult[]>;
  searchProvidersByPhone(phone: string): Promise<ProviderSearchResult[]>;
  getAllProviders(): Promise<Provider[]>;

  createCall(data: InsertCall): Promise<Call>;
  getCallsByCustomer(customerId: string): Promise<CallLog[]>;
  getCallsByProvider(providerId: string): Promise<CallLog[]>;
  countDoubleChargeCallsToday(providerId: string): Promise<number>;
  getAllCallLogs(): Promise<CallLog[]>;
  createAppNotification(data: { userId: string; title: string; message: string; type?: string }): Promise<void>;
  listAppNotifications(userId: string): Promise<Array<{ id: number; userId: string; title: string; message: string; type: string; isRead: boolean; createdAt: Date | null }>>;
  markAppNotificationRead(id: number, userId: string): Promise<void>;
  countUnreadAppNotifications(userId: string): Promise<number>;
  markAllAppNotificationsRead(userId: string): Promise<void>;

  getOrCreateCredits(userId: string, role: string): Promise<Credit>;
  deductCredit(userId: string, role: string): Promise<boolean>;
  addPurchasedCredits(userId: string, role: string, amount: number): Promise<Credit>;
  getAllCreditsWithProfiles(): Promise<any[]>;
  freezeUserCredits(userId: string, role: string, freeze: boolean): Promise<Credit>;
  resetUserCredits(userId: string, role: string): Promise<Credit>;

  getPromoCode(code: string): Promise<PromoCode | undefined>;
  createPromoCode(data: InsertPromoCode): Promise<PromoCode>;
  incrementPromoUsage(code: string): Promise<void>;
  togglePromoCode(id: number): Promise<PromoCode>;
  updatePromoCode(id: number, updates: { code?: string; creditAmount?: number }): Promise<PromoCode>;
  deletePromoCode(id: number): Promise<void>;
  getAllPromoCodes(): Promise<PromoCode[]>;

  updateProfileById(id: number, data: Partial<InsertProfile>): Promise<Profile>;
  updateProviderByUserId(userId: string, data: Partial<InsertProvider>): Promise<Provider>;
  getAdminStats(): Promise<AdminStats>;

  getCoAdmin(username: string): Promise<CoAdmin | undefined>;
  getCoAdminById(id: number): Promise<CoAdmin | undefined>;
  createCoAdmin(data: InsertCoAdmin): Promise<CoAdmin>;
  listCoAdmins(): Promise<CoAdmin[]>;
  deleteCoAdmin(id: number): Promise<void>;
  updateCoAdminPassword(id: number, hashedPassword: string): Promise<void>;
  getCoAdminStats(username: string): Promise<{ stats: { total: number; approved: number; pending: number; fake: number; rejected: number; verifiedTotal: number; callCount: number; cycleEntryCount: number; cycleApproveCount: number; cycleRejectCount: number; cycleCallCount: number; cycleStartAt: Date | null; cycleApprovedEntries: number }; recentProviders: PendingProvider[] }>;
  getVerifiedProvidersByCoAdmin(username: string, status: string): Promise<PendingProvider[]>;
  incrementCoAdminCallCount(username: string): Promise<void>;
  markSalaryPaid(coAdminId: number, paidByAdmin: string): Promise<SalaryPayment>;
  getSalaryHistory(username: string): Promise<SalaryPayment[]>;

  createPendingProvider(data: InsertPendingProvider): Promise<PendingProvider>;
  listPendingProvidersPaginated(opts: { addedBy?: string; status?: string; search?: string; page: number; limit: number; filterByCoAdmins?: string[]; groups?: string[] }): Promise<{ data: PendingProvider[]; total: number; page: number; totalPages: number }>;
  assignGroups(numGroups: number): Promise<{ assigned: number; groups: Record<string, number> }>;
  assignGroupsBySize(groupSize: number): Promise<{ assigned: number; groups: Record<string, number> }>;
  deleteNoMobilePendingProviders(): Promise<number>;
  getPendingProvider(id: number): Promise<PendingProvider | undefined>;
  updatePendingProviderStatus(id: number, status: string, notes?: string, verifiedBy?: string): Promise<PendingProvider>;
  approvePendingProvider(id: number, approvedBy?: string, opts?: { skipAiTags?: boolean }): Promise<{ userId: string }>;

  trackVisit(date: string): Promise<void>;
  getVisitorStats(): Promise<{ total: number; today: number; last7Days: { date: string; count: number }[] }>;
  deductMultipleCredits(userId: string, role: string, amount: number): Promise<boolean>;

  createJob(data: { userId: string; jobName: string; description: string; location: string; state?: string; district?: string; workType?: string; salary?: string; workHours?: string; numEmployees?: string; contactPhone?: string; postType: "mitrify" | "google_form"; googleFormUrl?: string }): Promise<Job>;
  listActiveJobs(): Promise<Job[]>;
  getJobsByUser(userId: string): Promise<Job[]>;
  getJob(jobId: number): Promise<Job | undefined>;
  updateJobLowCredit(userId: string, lowCredit: boolean): Promise<void>;
  incrementJobApplyClicks(jobId: number): Promise<number>;
  deleteJob(jobId: number, userId: string): Promise<void>;
  adminUpdateJob(jobId: number, updates: { jobName?: string; description?: string; location?: string; salary?: string; workHours?: string; contactPhone?: string | null; isActive?: boolean; googleFormUrl?: string | null; postType?: string }): Promise<Job | undefined>;

  hasUsedPromo(phone: string, code: string): Promise<boolean>;
  recordPromoUsage(phone: string, code: string): Promise<void>;
  isMobileNumberTaken(phone: string, excludeUserId?: string): Promise<boolean>;

  getEmployeesByCoAdmin(coAdminId: number): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  getAllEmployees(): Promise<Employee[]>;
  createEmployee(data: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<Employee>;

  trackSearch(query: string): Promise<void>;
  getSearchStats(): Promise<{ query: string; count: number; lastSearched: Date | null }[]>;

  bulkCreatePendingProviders(records: Array<{ name: string; mobile: string; addedBy: string }>, allowDuplicate?: boolean): Promise<{ imported: number; skipped: number; total: number }>;
  bulkCreateMetaLeads(records: Array<{ name: string; mobile: string; serviceName?: string; address?: string; description?: string }>, assignedTo: string, allowDuplicate?: boolean): Promise<{ imported: number; skipped: number; total: number }>;
  bulkCreateGooglePlaces(records: Array<{ name: string; mobile?: string; serviceName: string; address?: string; latitude?: number; longitude?: number; description?: string }>, assignedTo: string, allowDuplicate?: boolean): Promise<{ imported: number; skipped: number; total: number; skippedNoMobile: number; insertedIds: number[] }>;
  getDuplicateProfiles(): Promise<Array<{ mobile: string; count: number; profiles: Array<{ userId: string; role: string; name: string; mobile: string; isBlocked: boolean; totalCredits: number; completenessScore: number; serviceName: string; description: string; address: string; hasLocation: boolean; hashtags: string[]; approxCharge: string; }>; }>>;
  updatePendingProviderFields(id: number, fields: { serviceName?: string; address?: string; district?: string; state?: string; approxCharge?: string }): Promise<PendingProvider>;

  // ── Subscriptions ────────────────────────────────────────────────────────
  /** Returns the user's currently active subscription plan ("none" if no
   *  active row, or all rows have expired). Lazily marks expired rows. */
  getActiveSubscriptionPlan(userId: string): Promise<SubscriptionPlan>;
  /** Returns the user's most recent active subscription row (or undefined). */
  getActiveSubscription(userId: string): Promise<Subscription | undefined>;
  /** Inserts a new subscription row OR extends the active one.
   *  endDate = max(now, currentActiveEndDate) + durationDays. */
  createOrExtendSubscription(opts: {
    userId: string;
    plan: "boost" | "pro" | "premium";
    billingCycle: "monthly" | "yearly" | "custom";
    durationDays: number;
    amount: number;
    paymentId?: string | null;
    grantedBy?: string | null;
  }): Promise<Subscription>;
  /** All subscriptions for a single user, newest first. */
  listUserSubscriptions(userId: string): Promise<Subscription[]>;
  /** Idempotently record a Cashfree credit purchase (unique on order_id). */
  recordCreditPayment(opts: {
    userId: string;
    orderId: string;
    credits: number;
    amount: number;
  }): Promise<{ payment: CreditPayment; firstTime: boolean }>;
  /** All credit purchases for a user, newest first. */
  listUserCreditPayments(userId: string): Promise<CreditPayment[]>;
  /** Admin-only: every subscription row, newest first, with profile name. */
  listAllSubscriptions(opts?: { search?: string; status?: string; plan?: string }): Promise<Array<Subscription & { name: string; mobile: string }>>;
  /** Admin-only: cancel a subscription (sets status="cancelled" + ends now). */
  cancelSubscription(id: number): Promise<Subscription>;
  /** Admin-only: extend a subscription's endDate by N days. */
  extendSubscription(id: number, extraDays: number): Promise<Subscription>;
  /** Admin-only: read the editable plan price/perks config. */
  getSubscriptionByPaymentId(paymentId: string): Promise<Subscription | undefined>;
  getSubscriptionPlanConfig(): Promise<SubscriptionPlanConfig>;
  /** Admin-only: write the editable plan price/perks config. */
  setSubscriptionPlanConfig(cfg: SubscriptionPlanConfig): Promise<SubscriptionPlanConfig>;

  createTagJob(data: { jobId: string; total: number; dryRun: boolean; geminiAvailable: boolean }): Promise<void>;
  updateTagJob(jobId: string, patch: Partial<Omit<TagJob, "jobId" | "startedAt">>): Promise<void>;
  getTagJob(jobId: string): Promise<TagJob | undefined>;
  getActiveTagJob(): Promise<TagJob | undefined>;
  /** Most-recently-started job (active OR terminal), constrained to the last
   *  `maxAgeSeconds` so the UI can surface the just-restored "you crashed
   *  mid-run" state when an admin refreshes after a restart. */
  getLatestTagJob(maxAgeSeconds: number): Promise<TagJob | undefined>;
  markStaleTagJobsFailed(staleSeconds: number): Promise<number>;

  // Google Places admin bulk-fetch run audit log (counts only, no places).
  createGooglePlacesRun(data: InsertGooglePlacesRun): Promise<GooglePlacesRun>;
  listRecentGooglePlacesRuns(limit: number): Promise<GooglePlacesRun[]>;

}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Levenshtein distance for fuzzy matching (handles typos & spelling mistakes)
function levenshteinDistance(s1: string, s2: string): number {
  const [a, b] = s1.length > s2.length ? [s2, s1] : [s1, s2];
  const aLen = a.length;
  const bLen = b.length;
  
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const prev = Array(bLen + 1).fill(0).map((_, i) => i);
  const curr = Array(bLen + 1).fill(0);

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bLen; j++) {
      prev[j] = curr[j];
    }
  }

  return curr[bLen];
}

// Calculate similarity score (0-100) based on Levenshtein distance
function similarityScore(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 100;
  const distance = levenshteinDistance(s1, s2);
  return Math.round(((maxLen - distance) / maxLen) * 100);
}

// ----- Search dataset cache -----
// The provider search loads all active providers + all provider-role profiles +
// all credit rows on every call. Cache the merged dataset for a few seconds so
// rapid successive searches (typing, filter changes, multiple users) reuse it.
type SearchDataset = {
  providers: Provider[];
  profileMap: Map<string, Profile>;
  // Map<userId, totalCredits>. Lets the search layer report both
  // "has credits at all" and "low balance" without re-querying.
  creditMap: Map<string, boolean>;
  lowBalanceMap: Map<string, boolean>;
  // City/district name (lowercased) → average lat/lng, derived from
  // providers who DO have GPS coordinates. Used to approximate distance for
  // providers whose lat/lng is missing.
  cityAnchors: Map<string, { lat: number; lng: number }>;
  // userId → highest-ranked currently active subscription plan (or "none").
  // Computed once per cache cycle so search ranking and call-charging can
  // both consult it without round-trips.
  planMap: Map<string, SubscriptionPlan>;
};

function normalizePlace(s: string | null | undefined): string {
  return (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

// Pull a "city" guess from a free-form address: take the first comma chunk
// (e.g. "Civil Lines, Budaun, UP" → "civil lines"). Falls back to the entire
// trimmed address if there is no comma.
function extractCityFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  const first = address.split(",")[0] || "";
  return normalizePlace(first);
}
let _searchDatasetCache: { data: SearchDataset; expiresAt: number } | null = null;
let _searchDatasetPromise: Promise<SearchDataset> | null = null;
const SEARCH_DATASET_TTL_MS = 30_000;

async function getSearchDataset(): Promise<SearchDataset> {
  const now = Date.now();
  if (_searchDatasetCache && _searchDatasetCache.expiresAt > now) {
    return _searchDatasetCache.data;
  }
  if (_searchDatasetPromise) return _searchDatasetPromise;

  _searchDatasetPromise = (async () => {
    const nowDate = new Date();
    const [allProviders, allProfiles, allCredits, activeSubs] = await Promise.all([
      db.select().from(providers).where(eq(providers.isActive, true)),
      db.select().from(profiles).where(eq(profiles.role, "provider")),
      db.select().from(credits).where(eq(credits.role, "user")),
      db.select().from(subscriptions).where(and(
        eq(subscriptions.status, "active"),
        gte(subscriptions.endDate, nowDate),
      )),
    ]);
    const profileMap = new Map<string, Profile>();
    for (const p of allProfiles) {
      if (!p.isBlocked) profileMap.set(p.userId, p);
    }
    const creditMap = new Map<string, boolean>();
    const lowBalanceMap = new Map<string, boolean>();
    for (const c of allCredits) {
      const total = (c.freeCredits ?? 0) + (c.purchasedCredits ?? 0);
      creditMap.set(c.userId, total > 0);
      lowBalanceMap.set(c.userId, total <= 0);
    }
    // Collapse a user's many subscription rows into the highest-rank one.
    const planMap = new Map<string, SubscriptionPlan>();
    for (const s of activeSubs) {
      const plan = (s.plan as SubscriptionPlan) || "none";
      if (!["boost", "pro", "premium"].includes(plan)) continue;
      const cur = planMap.get(s.userId) || "none";
      if (PLAN_RANK[plan] > PLAN_RANK[cur]) planMap.set(s.userId, plan);
    }

    // Build city/district → averaged coords map from providers that DO have
    // GPS coordinates. We use this to *estimate* the distance for providers
    // who never set their location, by matching their address city/district.
    const anchorAcc = new Map<string, { sumLat: number; sumLng: number; n: number }>();
    const addAnchor = (key: string, lat: number, lng: number) => {
      if (!key) return;
      const cur = anchorAcc.get(key);
      if (cur) { cur.sumLat += lat; cur.sumLng += lng; cur.n += 1; }
      else anchorAcc.set(key, { sumLat: lat, sumLng: lng, n: 1 });
    };
    for (const p of allProviders) {
      if (p.latitude == null || p.longitude == null) continue;
      const district = normalizePlace(p.district);
      const addressCity = extractCityFromAddress(p.address);
      if (district) addAnchor(district, p.latitude, p.longitude);
      if (addressCity) addAnchor(addressCity, p.latitude, p.longitude);
    }
    const cityAnchors = new Map<string, { lat: number; lng: number }>();
    for (const [key, v] of anchorAcc) {
      cityAnchors.set(key, { lat: v.sumLat / v.n, lng: v.sumLng / v.n });
    }

    const data: SearchDataset = { providers: allProviders, profileMap, creditMap, lowBalanceMap, cityAnchors, planMap };
    _searchDatasetCache = { data, expiresAt: Date.now() + SEARCH_DATASET_TTL_MS };
    return data;
  })();

  try {
    return await _searchDatasetPromise;
  } finally {
    _searchDatasetPromise = null;
  }
}

export function invalidateSearchDataset() {
  _searchDatasetCache = null;
}

function smartMatchScore(query: string, name: string, serviceName: string, description: string, tags: string[]): number {
  const q = query.toLowerCase().trim();
  if (!q) return 100;

  const nm = name.toLowerCase();
  const svc = serviceName.toLowerCase();
  const desc = (description || "").toLowerCase();
  const tagStr = tags.map(t => t.toLowerCase()).join(" ");
  const allText = `${nm} ${svc} ${desc} ${tagStr}`;

  // Exact full phrase match anywhere → highest priority
  if (allText.includes(q)) return 100;

  const qWords = q.split(/\s+/).filter(w => w.length >= 2);
  if (qWords.length === 0) return 0;

  let totalScore = 0;
  for (const w of qWords) {
    let wordScore = 0;
    
    // Service name match (highest value field)
    if (svc.includes(w)) {
      wordScore = Math.max(wordScore, 80);
    }
    // Provider name match
    else if (nm.includes(w)) {
      wordScore = Math.max(wordScore, 70);
    }
    // Tag match
    else if (tagStr.includes(w)) {
      wordScore = Math.max(wordScore, 60);
    }
    // Description match
    else if (desc.includes(w)) {
      wordScore = Math.max(wordScore, 40);
    }
    // Prefix match in service or name (for partial typing)
    else {
      const svcWords = svc.split(/\s+/);
      const nmWords = nm.split(/\s+/);
      const tagWords = tagStr.split(/\s+/);
      if (svcWords.some(sw => sw.startsWith(w))) wordScore = Math.max(wordScore, 65);
      else if (nmWords.some(nw => nw.startsWith(w))) wordScore = Math.max(wordScore, 55);
      else if (tagWords.some(tw => tw.startsWith(w))) wordScore = Math.max(wordScore, 45);
      // Fuzzy matching for typos (e.g., "plumber" vs "plubmer")
      else {
        const allWords = [...svcWords, ...nmWords, ...tagWords];
        for (const word of allWords) {
          if (word.length >= 2) {
            const similarity = similarityScore(w, word);
            // Only consider if 70%+ similar (allows 1-2 typos for 5-7 char words)
            if (similarity >= 70) {
              const field = svcWords.includes(word) ? 75 : nmWords.includes(word) ? 65 : 50;
              wordScore = Math.max(wordScore, Math.round((similarity / 100) * field));
            }
          }
        }
      }
    }
    
    totalScore += wordScore;
  }

  return totalScore / qWords.length;
}

// Generate "Did you mean" suggestions like Google
async function getSuggestion(query: string): Promise<string | null> {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  
  const qWords = q.split(/\s+/).filter(w => w.length >= 2);
  if (qWords.length === 0) return null;
  
  // Get all active providers with their service names
  const allProviders = await db.select().from(providers).where(eq(providers.isActive, true));
  const allProfiles = await db.select().from(profiles).where(eq(profiles.role, "provider"));
  const profileMap = new Map(allProfiles.filter(p => !p.isBlocked).map(p => [p.userId, p]));

  // Collect all searchable words (service names, provider names)
  const wordToScore = new Map<string, number>();
  
  for (const provider of allProviders) {
    const profile = profileMap.get(provider.userId);
    if (!profile || profile.isBlocked) continue;
    
    const serviceWords = provider.serviceName.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    const nameWords = profile.name.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    
    for (const word of [...serviceWords, ...nameWords]) {
      // Check if this is a possible suggestion for the first query word
      const firstQueryWord = qWords[0];
      const similarity = similarityScore(firstQueryWord, word);
      
      // Only consider words that are 60%+ similar to the query word
      if (similarity >= 60) {
        const currentScore = wordToScore.get(word) || 0;
        wordToScore.set(word, Math.max(currentScore, similarity));
      }
    }
  }

  // If no fuzzy match found, return null
  if (wordToScore.size === 0) return null;

  // Find the best suggestion (highest similarity score)
  let bestSuggestion = "";
  let bestScore = 0;
  
  for (const [word, score] of wordToScore.entries()) {
    if (score > bestScore && word !== qWords[0]) {
      bestScore = score;
      bestSuggestion = word;
    }
  }

  // Only return if similarity is good but not exact (to avoid showing when already correct)
  if (bestScore >= 75 && bestScore < 100) {
    return bestSuggestion;
  }
  
  return null;
}

export class DatabaseStorage implements IStorage {
  async getLocalUserByPhone(phone: string): Promise<LocalUser | undefined> {
    const [user] = await db.select().from(localUsers).where(eq(localUsers.phone, phone));
    return user;
  }

  async getLocalUserByUsername(username: string): Promise<LocalUser | undefined> {
    const [user] = await db.select().from(localUsers).where(eq(localUsers.username, username));
    return user;
  }

  async getLocalUserByEmail(email: string): Promise<LocalUser | undefined> {
    const [user] = await db.select().from(localUsers).where(eq(localUsers.email, email));
    return user;
  }

  async getLocalUserByUserId(userId: string): Promise<LocalUser | undefined> {
    const [user] = await db.select().from(localUsers).where(eq(localUsers.userId, userId));
    return user;
  }

  async createLocalUser(data: InsertLocalUser): Promise<LocalUser> {
    const [user] = await db.insert(localUsers).values(data).returning();
    return user;
  }

  async updateLocalUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(localUsers).set({ password: hashedPassword }).where(eq(localUsers.userId, userId));
  }

  async updateLocalUserCredentials(userId: string, username: string, hashedPassword: string): Promise<void> {
    await db.update(localUsers).set({ username, password: hashedPassword, authMethod: "password" }).where(eq(localUsers.userId, userId));
  }

  async getProfile(userId: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
    return profile;
  }

  async getProfileByRole(userId: string, role: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles)
      .where(and(eq(profiles.userId, userId), eq(profiles.role, role)));
    return profile;
  }

  async getProfilesByUser(userId: string): Promise<Profile[]> {
    return await db.select().from(profiles).where(eq(profiles.userId, userId));
  }

  async createProfile(data: InsertProfile): Promise<Profile> {
    const [profile] = await db.insert(profiles).values(data).returning();
    return profile;
  }

  async updateProfile(userId: string, data: Partial<InsertProfile>, role?: string): Promise<Profile> {
    const condition = role
      ? and(eq(profiles.userId, userId), eq(profiles.role, role))
      : eq(profiles.userId, userId);
    const [profile] = await db.update(profiles).set(data).where(condition).returning();
    return profile;
  }

  async getProfilesByRole(role: string): Promise<Profile[]> {
    return await db.select().from(profiles).where(eq(profiles.role, role));
  }

  async toggleBlock(userId: string): Promise<Profile> {
    const userProfiles = await this.getProfilesByUser(userId);
    if (userProfiles.length === 0) throw new Error("Profile not found");
    const newBlocked = !userProfiles[0].isBlocked;
    const results = await db.update(profiles)
      .set({ isBlocked: newBlocked })
      .where(eq(profiles.userId, userId))
      .returning();
    await db.update(localUsers)
      .set({ isBlocked: newBlocked })
      .where(eq(localUsers.userId, userId));
    return results[0];
  }

  async deleteProfile(userId: string): Promise<void> {
    // Look up the local user first to capture phone/email so we can also
    // remove related records keyed by phone (e.g. promo usage log) and any
    // active sessions.
    const [lu] = await db.select().from(localUsers).where(eq(localUsers.userId, userId));
    const phone = lu?.phone || null;

    await db.delete(calls).where(or(eq(calls.customerId, userId), eq(calls.providerId, userId)));
    await db.delete(credits).where(eq(credits.userId, userId));
    await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
    await db.delete(creditPayments).where(eq(creditPayments.userId, userId));
    await db.delete(jobs).where(eq(jobs.userId, userId));
    await db.delete(providers).where(eq(providers.userId, userId));
    await db.delete(profiles).where(eq(profiles.userId, userId));
    await db.delete(localUsers).where(eq(localUsers.userId, userId));

    if (phone) {
      try { await db.delete(promoUsageLog).where(eq(promoUsageLog.phone, phone)); } catch {}
    }

    // Invalidate any active server sessions belonging to this user so the
    // deleted user is forced to re-authenticate fresh and cannot continue
    // navigating with a stale session cookie.
    try {
      await db.execute(sql`
        DELETE FROM "session"
        WHERE sess::jsonb->>'localUserId' = ${userId}
      `);
    } catch {}

    // Refresh the cached search dataset so the deleted provider disappears
    // immediately from public search.
    try { invalidateSearchDataset(); } catch {}
  }

  async getProvider(userId: string): Promise<Provider | undefined> {
    const [provider] = await db.select().from(providers).where(eq(providers.userId, userId));
    return provider;
  }

  async getProviderById(id: number): Promise<Provider | undefined> {
    const [provider] = await db.select().from(providers).where(eq(providers.id, id));
    return provider;
  }

  async createProvider(data: InsertProvider): Promise<Provider> {
    const [provider] = await db.insert(providers).values(data).returning();
    return provider;
  }

  async updateProvider(userId: string, data: Partial<InsertProvider>): Promise<Provider> {
    const [provider] = await db.update(providers).set(data).where(eq(providers.userId, userId)).returning();
    return provider;
  }

  async searchProviders(query?: string, lat?: number, lng?: number, radius?: number): Promise<ProviderSearchResult[]> {
    // Use a short-lived in-memory cache for the heavy "load all providers + profiles + credits"
    // dataset. Repeated searches within the TTL are near-instant (avoids 3 full table scans).
    const ds = await getSearchDataset();
    const providerList = ds.providers;
    const profileMap = ds.profileMap;

    const cityAnchors = ds.cityAnchors;

    const planMap = ds.planMap;
    const scoredResults: Array<{ provider: Provider; profile: Profile; distanceKm: number | null; distanceApprox: boolean; city: string | null; score: number; plan: SubscriptionPlan }> = [];

    for (const provider of providerList) {
      const profile = profileMap.get(provider.userId);
      if (!profile || profile.isBlocked) continue;

      // Score the provider against the query
      let score = 100;
      if (query && query.trim()) {
        score = smartMatchScore(
          query,
          profile.name,
          provider.serviceName,
          provider.description || "",
          provider.hashtags || []
        );
        if (score === 0) continue; // No match at all → skip
      }

      const plan = planMap.get(provider.userId) || "none";

      // Pull a best-effort city out of the address so the UI can show it
      // even when GPS coordinates are missing.
      const cityRaw = (provider.address || "").split(",")[0]?.trim() || null;
      const city = cityRaw || provider.district || null;

      // Distance: prefer real GPS, fall back to estimate from city/district.
      let distanceKm: number | null = null;
      let distanceApprox = false;
      if (lat != null && lng != null && provider.latitude != null && provider.longitude != null) {
        distanceKm = calculateDistance(lat, lng, provider.latitude, provider.longitude);
        if (radius && distanceKm > radius) continue;
        if (provider.radiusKm && distanceKm > provider.radiusKm) continue;
      } else if (lat != null && lng != null) {
        // No GPS on this provider → try to anchor by city or district
        const keys = [extractCityFromAddress(provider.address), normalizePlace(provider.district)];
        for (const k of keys) {
          const anchor = k ? cityAnchors.get(k) : undefined;
          if (anchor) {
            distanceKm = calculateDistance(lat, lng, anchor.lat, anchor.lng);
            distanceApprox = true;
            break;
          }
        }
        // Honor radius even for approximate matches so distant cities don't
        // pollute a "near me" search. Allow a 25% slack since the estimate
        // is by definition imprecise.
        if (radius && distanceKm != null && distanceKm > radius * 1.25) continue;
      }

      scoredResults.push({ provider, profile, distanceKm, distanceApprox, city, score, plan });
    }

    // Sort by: subscription plan rank desc → match score desc → distance asc.
    // Real distances win ties over approximate. Providers with no distance
    // sink to the bottom of their (plan,score) bucket.
    scoredResults.sort((a, b) => {
      const planDiff = PLAN_RANK[b.plan] - PLAN_RANK[a.plan];
      if (planDiff !== 0) return planDiff;
      if (b.score !== a.score) return b.score - a.score;
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      if (a.distanceKm === b.distanceKm) {
        return Number(a.distanceApprox) - Number(b.distanceApprox);
      }
      return a.distanceKm - b.distanceKm;
    });

    // Use cached credit map; cap to top 200 results to keep payload light
    const creditMap = ds.creditMap;
    const top = scoredResults.slice(0, 200);

    const lowBalanceMap = ds.lowBalanceMap;
    return top.map(({ provider, profile, distanceKm, distanceApprox, city, plan }) => {
      const contactHidden = provider.isHidden ?? false;
      // We no longer block calls just because the provider has 0 credits —
      // the customer can opt into a double-charge. canCall stays gated on
      // the contactHidden flag only; credits are evaluated client-side.
      const providerLowBalance = lowBalanceMap.get(provider.userId) ?? false;
      return {
        provider,
        profile,
        distanceKm,
        distanceApprox,
        city,
        canCall: !contactHidden,
        contactHidden,
        providerLowBalance,
        plan,
      };
    });
  }

  async searchProvidersByPhone(phone: string): Promise<ProviderSearchResult[]> {
    const q = phone.trim().replace(/\D/g, ""); // digits only for comparison
    if (q.length < 6) return [];

    const allActiveProviders = await db.select().from(providers).where(eq(providers.isActive, true));
    // All providers visible; isHidden only hides contact info
    const allProviders = allActiveProviders;
    const allProfiles = await db.select().from(profiles).where(and(eq(profiles.role, "provider"), eq(profiles.isBlocked, false)));
    const profileMap = new Map(allProfiles.map(p => [p.userId, p]));

    const results: ProviderSearchResult[] = [];

    for (const provider of allProviders) {
      const profile = profileMap.get(provider.userId);
      if (!profile || profile.isBlocked) continue;

      // Check mobileNumbers array (the call numbers)
      const numbersToCheck = [...(provider.mobileNumbers || [])];
      if (profile.mobile) numbersToCheck.push(profile.mobile);

      const matched = numbersToCheck.some(num => {
        const digits = num.replace(/\D/g, "");
        return digits.includes(q) || q.includes(digits.slice(-10));
      });

      if (matched) {
        const contactHidden = provider.isHidden ?? false;
        results.push({ provider, profile, distanceKm: null, canCall: !contactHidden, contactHidden, providerLowBalance: false, plan: "none" });
      }
    }

    // Batch credit + subscription check for phone search results — used
    // to flag low balance and to render the tick badge / Free Call label.
    if (results.length > 0) {
      const ds = await getSearchDataset();
      return results.map(r => ({
        ...r,
        providerLowBalance: ds.lowBalanceMap.get(r.provider.userId) ?? false,
        plan: ds.planMap.get(r.provider.userId) || "none",
      }));
    }

    return results;
  }

  async getAllProviders(): Promise<Provider[]> {
    return await db.select().from(providers);
  }

  async createCall(data: InsertCall): Promise<Call> {
    const [call] = await db.insert(calls).values(data).returning();
    return call;
  }

  // Atomic charge + call insert. Performs all balance reads, deductions
  // and the call-row insert inside a single DB transaction so partial
  // state can never persist (no half-charge, no charge-without-call).
  // Throws an Error whose `.message` matches one of the well-known
  // reason codes ("both_no_balance", "customer_no_balance_blocked",
  // "provider_cannot_absorb", "cap_reached", "need_two_credits",
  // "provider_no_balance") so the route can map to HTTP 402 responses.
  async chargeAndCreateCall(opts: {
    customerId: string;
    providerId: string;
    providerAcceptsDouble: boolean;
    confirmDoubleCharge: boolean;
    duration: number;
  }): Promise<Call & { chargeReason: string; creditsCharged: number }> {
    const { customerId, providerId, providerAcceptsDouble, confirmDoubleCharge, duration } = opts;

    return await db.transaction(async (tx) => {
      // Resolve subscription plans INSIDE the tx (no cache TTL stale window):
      // a sub that just expired or just got purchased takes effect on the
      // very next call. Caller side becomes 0 when the customer is Premium;
      // provider side becomes 0 when the provider is Pro or Premium. Customer
      // also goes 0 when the provider is Premium ("Free Call").
      const now = new Date();
      const planFor = async (userId: string): Promise<SubscriptionPlan> => {
        const [row] = await tx.select().from(subscriptions).where(and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, "active"),
          gte(subscriptions.endDate, now),
        )).orderBy(desc(subscriptions.endDate)).limit(1);
        return (row?.plan as SubscriptionPlan) || "none";
      };
      const callerPlan = await planFor(customerId);
      const providerPlan = await planFor(providerId);
      const customerFree = callerPlan === "premium" || providerPlan === "premium";
      const providerFree = providerPlan === "pro" || providerPlan === "premium";

      const decrement = async (userId: string, amount: number) => {
        const [row] = await tx.select().from(credits)
          .where(and(eq(credits.userId, userId), eq(credits.role, "user")))
          .for("update");
        if (!row) throw new Error("credits_row_missing");
        let free = row.freeCredits ?? 0;
        let purchased = row.purchasedCredits ?? 0;
        if (free + purchased < amount) throw new Error("insufficient_balance");
        let remaining = amount;
        const fromFree = Math.min(free, remaining);
        free -= fromFree; remaining -= fromFree;
        const fromPurch = Math.min(purchased, remaining);
        purchased -= fromPurch; remaining -= fromPurch;
        await tx.update(credits)
          .set({ freeCredits: free, purchasedCredits: purchased })
          .where(eq(credits.id, row.id));
        return free + purchased + amount;
      };

      // Read & lock both rows up-front so balance + cap checks are
      // consistent for the full transaction.
      const [custRow] = await tx.select().from(credits)
        .where(and(eq(credits.userId, customerId), eq(credits.role, "user")))
        .for("update");
      const [provRow] = await tx.select().from(credits)
        .where(and(eq(credits.userId, providerId), eq(credits.role, "user")))
        .for("update");
      const customerTotal = (custRow?.freeCredits ?? 0) + (custRow?.purchasedCredits ?? 0);
      const providerTotal = (provRow?.freeCredits ?? 0) + (provRow?.purchasedCredits ?? 0);

      let chargeReason: string;
      let creditsCharged: number;

      // ── Subscription-driven free-call shortcuts ────────────────────────
      // These bypass the 5/day cap and the provider-acceptsDouble dance
      // entirely — neither side actually loses credits.
      if (customerFree && providerFree) {
        chargeReason = "subscription_free_both";
        creditsCharged = 0;
      } else if (customerFree) {
        // Caller is Premium → caller side is free regardless of provider.
        // The provider, however, is NOT Pro/Premium here (providerFree is
        // false), so they must still be charged 1 credit for receiving the
        // call. If they cannot pay, the call is blocked the same way as
        // an ordinary `provider_no_balance` situation — Premium does not
        // entitle the caller to a free incoming side from the provider.
        if (providerTotal <= 0) throw new Error("provider_no_balance");
        await decrement(providerId, 1);
        chargeReason = "subscription_free_outgoing";
        creditsCharged = 0;
      } else if (providerFree) {
        // Provider is Pro/Premium → provider side is free, customer side
        // pays normally (1 credit). Pro/Premium providers can receive
        // calls even at 0 balance — no cap_reached.
        if (customerTotal <= 0) {
          // Customer has 0 credits AND provider is Pro/Premium AND not
          // Premium (because customerFree is false): block since the
          // customer literally cannot pay. The "double charge" cap is
          // bypassed though — provider absorbs nothing.
          throw new Error("customer_no_balance_blocked");
        }
        await decrement(customerId, 1);
        chargeReason = "subscription_free_incoming";
        creditsCharged = 1;
      } else if (customerTotal <= 0 && providerTotal <= 0) {
        throw new Error("both_no_balance");
      } else if (customerTotal <= 0) {
        if (!providerAcceptsDouble) throw new Error("customer_no_balance_blocked");
        if (providerTotal < 2) throw new Error("provider_cannot_absorb");
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const capRows = await tx.select().from(calls).where(and(
          eq(calls.providerId, providerId),
          eq(calls.chargeReason, "customer_no_balance"),
          sql`${calls.timestamp} >= ${start}`,
        ));
        if (capRows.length >= 5) throw new Error("cap_reached");
        await decrement(providerId, 2);
        chargeReason = "customer_no_balance";
        creditsCharged = 2;
      } else if (providerTotal <= 0) {
        if (!confirmDoubleCharge) throw new Error("provider_no_balance");
        if (customerTotal < 2) throw new Error("need_two_credits");
        await decrement(customerId, 2);
        chargeReason = "provider_no_balance";
        creditsCharged = 2;
      } else {
        await decrement(customerId, 1);
        await decrement(providerId, 1);
        chargeReason = "normal";
        creditsCharged = 1;
      }

      const [call] = await tx.insert(calls).values({
        customerId,
        providerId,
        duration,
        paymentStatus: creditsCharged === 0 ? "free" : "credit",
        chargeReason,
        creditsCharged,
      }).returning();
      return { ...call, chargeReason, creditsCharged };
    });
  }

  async getCallsByCustomer(customerId: string): Promise<CallLog[]> {
    const result = await db.select().from(calls).where(eq(calls.customerId, customerId)).orderBy(sql`${calls.timestamp} DESC`);
    const logs: CallLog[] = [];
    for (const call of result) {
      const [customerProfile] = await db.select().from(profiles).where(eq(profiles.userId, call.customerId));
      const [providerProfile] = await db.select().from(profiles).where(eq(profiles.userId, call.providerId));
      const [providerData] = await db.select().from(providers).where(eq(providers.userId, call.providerId));
      logs.push({
        id: call.id,
        customerName: customerProfile?.name || 'Unknown',
        providerName: providerProfile?.name || 'Unknown',
        serviceName: providerData?.serviceName || 'Unknown',
        timestamp: call.timestamp,
        duration: call.duration,
        paymentStatus: call.paymentStatus,
        chargeReason: call.chargeReason ?? "normal",
        creditsCharged: call.creditsCharged ?? 1,
      });
    }
    return logs;
  }

  async getCallsByProvider(providerId: string): Promise<CallLog[]> {
    const result = await db.select().from(calls).where(eq(calls.providerId, providerId)).orderBy(sql`${calls.timestamp} DESC`);
    const logs: CallLog[] = [];
    for (const call of result) {
      const [customerProfile] = await db.select().from(profiles).where(eq(profiles.userId, call.customerId));
      const [providerProfile] = await db.select().from(profiles).where(eq(profiles.userId, call.providerId));
      const [providerData] = await db.select().from(providers).where(eq(providers.userId, call.providerId));
      logs.push({
        id: call.id,
        customerName: customerProfile?.name || 'Unknown',
        providerName: providerProfile?.name || 'Unknown',
        serviceName: providerData?.serviceName || 'Unknown',
        timestamp: call.timestamp,
        duration: call.duration,
        paymentStatus: call.paymentStatus,
        chargeReason: call.chargeReason ?? "normal",
        creditsCharged: call.creditsCharged ?? 1,
      });
    }
    return logs;
  }

  async countDoubleChargeCallsToday(providerId: string): Promise<number> {
    // Calendar-day reset (server local midnight) — provider gets a fresh
    // 5-call quota at the start of each day rather than rolling 24h.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const rows = await db.select().from(calls).where(and(
      eq(calls.providerId, providerId),
      eq(calls.chargeReason, "customer_no_balance"),
      sql`${calls.timestamp} >= ${start}`,
    ));
    return rows.length;
  }

  async getOrCreateCredits(userId: string, role: string = "user"): Promise<Credit> {
    const [existing] = await db.select().from(credits)
      .where(and(eq(credits.userId, userId), eq(credits.role, "user")));

    if (existing) {
      return existing;
    }

    // First time: give 25 credits, no monthly reset ever
    const [created] = await db.insert(credits)
      .values({ userId, role: "user", freeCredits: 25, purchasedCredits: 0 })
      .returning();
    return created;
  }

  async deductCredit(userId: string, role: string = "user"): Promise<boolean> {
    const credit = await this.getOrCreateCredits(userId);
    const free = credit.freeCredits ?? 0;
    const purchased = credit.purchasedCredits ?? 0;

    if (free + purchased <= 0) return false;

    if (free > 0) {
      await db.update(credits)
        .set({ freeCredits: free - 1 })
        .where(eq(credits.id, credit.id));
    } else {
      await db.update(credits)
        .set({ purchasedCredits: purchased - 1 })
        .where(eq(credits.id, credit.id));
    }
    return true;
  }

  async addPurchasedCredits(userId: string, role: string = "user", amount: number): Promise<Credit> {
    const credit = await this.getOrCreateCredits(userId);
    if (credit.creditsFrozen) {
      throw new Error("Credits are frozen for this account");
    }
    const [updated] = await db.update(credits)
      .set({ purchasedCredits: (credit.purchasedCredits ?? 0) + amount })
      .where(eq(credits.id, credit.id))
      .returning();
    return updated;
  }

  async getAllCreditsWithProfiles(): Promise<any[]> {
    const allCredits = await db.select().from(credits).where(eq(credits.role, "user"));
    const result = [];
    for (const credit of allCredits) {
      const [profile] = await db.select().from(profiles)
        .where(eq(profiles.userId, credit.userId));
      result.push({ ...credit, profileName: profile?.name || "Unknown", mobile: profile?.mobile || "" });
    }
    return result;
  }

  async freezeUserCredits(userId: string, role: string = "user", freeze: boolean): Promise<Credit> {
    const credit = await this.getOrCreateCredits(userId);
    const [updated] = await db.update(credits)
      .set({ creditsFrozen: freeze })
      .where(eq(credits.id, credit.id))
      .returning();
    return updated;
  }

  async resetUserCredits(userId: string, role: string = "user"): Promise<Credit> {
    const credit = await this.getOrCreateCredits(userId);
    const [updated] = await db.update(credits)
      .set({ purchasedCredits: 0, freeCredits: 0 })
      .where(eq(credits.id, credit.id))
      .returning();
    return updated;
  }

  async getAllCallLogs(): Promise<CallLog[]> {
    const result = await db.select().from(calls).orderBy(sql`${calls.timestamp} DESC`);
    const logs: CallLog[] = [];
    for (const call of result) {
      const [customerProfile] = await db.select().from(profiles).where(eq(profiles.userId, call.customerId));
      const [providerProfile] = await db.select().from(profiles).where(eq(profiles.userId, call.providerId));
      const [providerData] = await db.select().from(providers).where(eq(providers.userId, call.providerId));
      logs.push({
        id: call.id,
        customerName: customerProfile?.name || 'Unknown',
        providerName: providerProfile?.name || 'Unknown',
        serviceName: providerData?.serviceName || 'Unknown',
        timestamp: call.timestamp,
        duration: call.duration,
        paymentStatus: call.paymentStatus,
      });
    }
    return logs;
  }

  async createAppNotification(data: { userId: string; title: string; message: string; type?: string }): Promise<void> {
    await db.insert(appNotifications).values({
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type || "info",
    });
  }

  async listAppNotifications(userId: string) {
    return await db.select().from(appNotifications).where(eq(appNotifications.userId, userId)).orderBy(desc(appNotifications.createdAt));
  }

  async markAppNotificationRead(id: number, userId: string): Promise<void> {
    await db.update(appNotifications).set({ isRead: true }).where(and(eq(appNotifications.id, id), eq(appNotifications.userId, userId)));
  }

  async countUnreadAppNotifications(userId: string): Promise<number> {
    const [row] = await db.select({ c: count() }).from(appNotifications)
      .where(and(eq(appNotifications.userId, userId), eq(appNotifications.isRead, false)));
    return Number(row?.c ?? 0);
  }

  async markAllAppNotificationsRead(userId: string): Promise<void> {
    await db.update(appNotifications).set({ isRead: true })
      .where(and(eq(appNotifications.userId, userId), eq(appNotifications.isRead, false)));
  }


  async getPromoCode(code: string): Promise<PromoCode | undefined> {
    const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, code));
    return promo;
  }

  async createPromoCode(data: InsertPromoCode): Promise<PromoCode> {
    const [promo] = await db.insert(promoCodes).values(data).returning();
    return promo;
  }

  async incrementPromoUsage(code: string): Promise<void> {
    await db.update(promoCodes)
      .set({ usageCount: sql`${promoCodes.usageCount} + 1` })
      .where(eq(promoCodes.code, code));
  }

  async togglePromoCode(id: number): Promise<PromoCode> {
    const [existing] = await db.select().from(promoCodes).where(eq(promoCodes.id, id));
    if (!existing) throw new Error("Promo code not found");
    const [promo] = await db.update(promoCodes)
      .set({ isActive: !existing.isActive })
      .where(eq(promoCodes.id, id))
      .returning();
    return promo;
  }

  async updatePromoCode(id: number, updates: { code?: string; creditAmount?: number }): Promise<PromoCode> {
    const [promo] = await db.update(promoCodes)
      .set(updates)
      .where(eq(promoCodes.id, id))
      .returning();
    return promo;
  }

  async deletePromoCode(id: number): Promise<void> {
    await db.delete(promoCodes).where(eq(promoCodes.id, id));
  }

  async getAllPromoCodes(): Promise<PromoCode[]> {
    return await db.select().from(promoCodes);
  }

  async updateProfileById(id: number, data: Partial<InsertProfile>): Promise<Profile> {
    const [profile] = await db.update(profiles).set(data).where(eq(profiles.id, id)).returning();
    return profile;
  }

  async updateProviderByUserId(userId: string, data: Partial<InsertProvider>): Promise<Provider> {
    const [provider] = await db.update(providers).set(data).where(eq(providers.userId, userId)).returning();
    return provider;
  }

  async getAdminStats(): Promise<AdminStats> {
    const [customerCount] = await db.select({ count: count() }).from(profiles).where(eq(profiles.role, 'customer'));
    const [providerCount] = await db.select({ count: count() }).from(profiles).where(eq(profiles.role, 'provider'));
    const [callCount] = await db.select({ count: count() }).from(calls);

    const allCredits = await db.select().from(credits);
    const totalPurchased = allCredits.reduce((sum, c) => sum + (c.purchasedCredits ?? 0), 0);

    return {
      totalCustomers: customerCount?.count || 0,
      totalProviders: providerCount?.count || 0,
      totalCalls: callCount?.count || 0,
      dailyRevenue: 0,
      monthlyRevenue: 0,
      subscriptionRevenue: totalPurchased,
    };
  }

  async getCoAdmin(username: string): Promise<CoAdmin | undefined> {
    const [ca] = await db.select().from(coAdmins).where(eq(coAdmins.username, username));
    return ca;
  }

  async createCoAdmin(data: InsertCoAdmin): Promise<CoAdmin> {
    const [ca] = await db.insert(coAdmins).values(data).returning();
    return ca;
  }

  async listCoAdmins(): Promise<CoAdmin[]> {
    return await db.select().from(coAdmins).orderBy(coAdmins.createdAt);
  }

  async deleteCoAdmin(id: number): Promise<void> {
    await db.delete(coAdmins).where(eq(coAdmins.id, id));
  }

  async updateCoAdminPassword(id: number, hashedPassword: string): Promise<void> {
    await db.update(coAdmins).set({ password: hashedPassword }).where(eq(coAdmins.id, id));
  }

  async getCoAdminById(id: number): Promise<CoAdmin | undefined> {
    const [ca] = await db.select().from(coAdmins).where(eq(coAdmins.id, id));
    return ca;
  }

  async getCoAdminStats(username: string): Promise<{ stats: { total: number; approved: number; pending: number; fake: number; rejected: number; verifiedTotal: number; callCount: number; cycleEntryCount: number; cycleApproveCount: number; cycleRejectCount: number; cycleCallCount: number; cycleStartAt: Date | null; cycleApprovedEntries: number }; recentProviders: PendingProvider[] }> {
    const allProviders = await db.select().from(pendingProviders)
      .where(eq(pendingProviders.addedBy, username))
      .orderBy(desc(pendingProviders.createdAt));

    const verifiedProviders = await db.select().from(pendingProviders)
      .where(eq(pendingProviders.verifiedBy, username))
      .orderBy(desc(pendingProviders.createdAt));

    const [coAdminRow] = await db.select({
      callCount: coAdmins.callCount,
      cycleEntryCount: coAdmins.cycleEntryCount,
      cycleApproveCount: coAdmins.cycleApproveCount,
      cycleRejectCount: coAdmins.cycleRejectCount,
      cycleCallCount: coAdmins.cycleCallCount,
      cycleStartAt: coAdmins.cycleStartAt,
    }).from(coAdmins).where(eq(coAdmins.username, username));

    // cycleApprovedEntries: entries THIS co-admin added (addedBy) that got approved, since cycle start
    const cycleStart = coAdminRow?.cycleStartAt ?? null;
    const cycleApprovedEntries = allProviders.filter(p =>
      p.status === "approved" &&
      (!cycleStart || (p.createdAt && new Date(p.createdAt) >= new Date(cycleStart)))
    ).length;

    const stats = {
      total: allProviders.length,
      approved: verifiedProviders.filter(p => p.status === "approved").length,
      pending: verifiedProviders.filter(p => p.status === "pending").length,
      fake: verifiedProviders.filter(p => p.status === "fake").length,
      rejected: verifiedProviders.filter(p => p.status === "rejected" || p.status === "fake").length,
      verifiedTotal: verifiedProviders.length,
      callCount: coAdminRow?.callCount ?? 0,
      cycleEntryCount: coAdminRow?.cycleEntryCount ?? 0,
      cycleApproveCount: coAdminRow?.cycleApproveCount ?? 0,
      cycleRejectCount: coAdminRow?.cycleRejectCount ?? 0,
      cycleCallCount: coAdminRow?.cycleCallCount ?? 0,
      cycleStartAt: cycleStart,
      cycleApprovedEntries,
    };

    const recentVerified = verifiedProviders.slice(0, 15);
    const recentAdded = allProviders.slice(0, 15);
    const combined = [...recentVerified, ...recentAdded.filter(p => !recentVerified.find(v => v.id === p.id))].slice(0, 30);

    return { stats, recentProviders: combined };
  }

  async getVerifiedProvidersByCoAdmin(username: string, status: string): Promise<PendingProvider[]> {
    if (status === "rejected") {
      return db.select().from(pendingProviders)
        .where(and(
          eq(pendingProviders.verifiedBy, username),
          or(eq(pendingProviders.status, "rejected"), eq(pendingProviders.status, "fake"))
        ))
        .orderBy(desc(pendingProviders.createdAt));
    }
    return db.select().from(pendingProviders)
      .where(and(
        eq(pendingProviders.verifiedBy, username),
        eq(pendingProviders.status, status)
      ))
      .orderBy(desc(pendingProviders.createdAt));
  }

  async incrementCoAdminCallCount(username: string): Promise<void> {
    await db.update(coAdmins)
      .set({
        callCount: sql`${coAdmins.callCount} + 1`,
        cycleCallCount: sql`${coAdmins.cycleCallCount} + 1`,
      })
      .where(eq(coAdmins.username, username));
  }

  private async incrementCycleStat(username: string | undefined | null, stat: "entry" | "approve" | "reject"): Promise<void> {
    if (!username || username === "admin") return;
    try {
      const updates: any =
        stat === "entry" ? { cycleEntryCount: sql`${coAdmins.cycleEntryCount} + 1` }
        : stat === "approve" ? { cycleApproveCount: sql`${coAdmins.cycleApproveCount} + 1` }
        : { cycleRejectCount: sql`${coAdmins.cycleRejectCount} + 1` };
      await db.update(coAdmins).set(updates).where(eq(coAdmins.username, username));
    } catch { /* co-admin might not exist */ }
  }

  async markSalaryPaid(coAdminId: number, paidByAdmin: string): Promise<SalaryPayment> {
    const ca = await this.getCoAdminById(coAdminId);
    if (!ca) throw new Error("Co-admin not found");

    const entryCount = ca.cycleEntryCount ?? 0;
    const approveCount = ca.cycleApproveCount ?? 0;
    const rejectCount = ca.cycleRejectCount ?? 0;
    const callCount = ca.cycleCallCount ?? 0;
    const ratePerAction = 3;

    let totalActions: number;
    let totalAmount: number;

    if (ca.role === "coadmin") {
      // Data Entry: only count entries they added that got approved in this cycle
      const cycleStart = ca.cycleStartAt;
      const myEntries = await db.select().from(pendingProviders)
        .where(eq(pendingProviders.addedBy, ca.username));
      const approvedEntries = myEntries.filter(p =>
        p.status === "approved" &&
        (!cycleStart || (p.createdAt && new Date(p.createdAt) >= new Date(cycleStart)))
      ).length;
      totalActions = approvedEntries;
      totalAmount = approvedEntries * ratePerAction;
    } else {
      // Verifier: only approved count × ₹3
      totalActions = approveCount;
      totalAmount = approveCount * ratePerAction;
    }

    const [payment] = await db.insert(salaryPayments).values({
      username: ca.username,
      entryCount,
      approveCount,
      rejectCount,
      callCount,
      totalActions,
      ratePerAction,
      totalAmount,
      cycleStart: ca.cycleStartAt,
      cycleEnd: new Date(),
      paidByAdmin,
    }).returning();

    await db.update(coAdmins).set({
      cycleEntryCount: 0,
      cycleApproveCount: 0,
      cycleRejectCount: 0,
      cycleCallCount: 0,
      cycleStartAt: new Date(),
    }).where(eq(coAdmins.id, coAdminId));

    return payment;
  }

  async getSalaryHistory(username: string): Promise<SalaryPayment[]> {
    return await db.select().from(salaryPayments)
      .where(eq(salaryPayments.username, username))
      .orderBy(desc(salaryPayments.createdAt));
  }

  async createPendingProvider(data: InsertPendingProvider): Promise<PendingProvider> {
    const [pp] = await db.insert(pendingProviders).values({ ...data, status: "pending" } as any).returning();
    // Track entry in salary cycle (exclude bulk imports)
    if (data.addedBy && data.addedBy !== "bulk-import") {
      await this.incrementCycleStat(data.addedBy, "entry");
    }
    return pp;
  }

  async assignGroups(numGroups: number): Promise<{ assigned: number; groups: Record<string, number> }> {
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").slice(0, Math.max(2, Math.min(26, numGroups)));
    // Get all pending providers (unverified only), exclude Meta Ads leads
    const all = await db.select({ id: pendingProviders.id })
      .from(pendingProviders)
      .where(and(eq(pendingProviders.status, "pending"), or(isNull(pendingProviders.source), ne(pendingProviders.source, "meta"))))
      .orderBy(sql`RANDOM()`);

    const groupCounts: Record<string, number> = {};
    labels.forEach(l => { groupCounts[l] = 0; });

    // Assign groups in round-robin order (already randomly ordered)
    for (let i = 0; i < all.length; i++) {
      const label = labels[i % labels.length];
      await db.update(pendingProviders)
        .set({ groupLabel: label })
        .where(eq(pendingProviders.id, all[i].id));
      groupCounts[label]++;
    }
    return { assigned: all.length, groups: groupCounts };
  }

  async assignGroupsBySize(groupSize: number): Promise<{ assigned: number; groups: Record<string, number> }> {
    const size = Math.max(1, groupSize);
    // Get all pending providers ordered by id ASC, exclude Meta Ads leads
    const all = await db.select({ id: pendingProviders.id })
      .from(pendingProviders)
      .where(and(eq(pendingProviders.status, "pending"), or(isNull(pendingProviders.source), ne(pendingProviders.source, "meta"))))
      .orderBy(pendingProviders.id);

    const groupCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };

    const getLabel = (i: number) => {
      if (i < size) return "A";
      if (i < size * 2) return "B";
      if (i < size * 3) return "C";
      return "D";
    };

    // Compute per-label id buckets, then batch-update 500 at a time using inArray
    const buckets: Record<string, number[]> = { A: [], B: [], C: [], D: [] };
    for (let i = 0; i < all.length; i++) {
      const label = getLabel(i);
      buckets[label].push(all[i].id);
      groupCounts[label]++;
    }

    const BATCH = 500;
    for (const label of ["A", "B", "C", "D"] as const) {
      const ids = buckets[label];
      for (let start = 0; start < ids.length; start += BATCH) {
        const chunk = ids.slice(start, start + BATCH);
        if (chunk.length === 0) continue;
        await db.update(pendingProviders)
          .set({ groupLabel: label })
          .where(inArray(pendingProviders.id, chunk));
      }
    }

    return { assigned: all.length, groups: groupCounts };
  }

  async listPendingProvidersPaginated(opts: { addedBy?: string; status?: string; search?: string; filterByCoAdmins?: string[]; sortBy?: string; page: number; limit: number; groups?: string[] }): Promise<{ data: PendingProvider[]; total: number; page: number; totalPages: number; coAdmins?: string[] }> {
    const { addedBy, status, search, filterByCoAdmins, sortBy, page, limit, groups } = opts;
    const conditions: any[] = [];

    // Visibility: regular co-admin sees own + bulk-import; admin/testadmin sees all
    if (addedBy) {
      conditions.push(or(eq(pendingProviders.addedBy, addedBy), eq(pendingProviders.addedBy, "bulk-import")));
    }

    // Status filter
    if (status && status !== "all") {
      if (status === "rejected") {
        conditions.push(or(eq(pendingProviders.status, "rejected"), eq(pendingProviders.status, "fake")));
      } else {
        conditions.push(eq(pendingProviders.status, status));
      }
    }

    // Filter by co-admin(s) who added (multi-select: array of names)
    if (filterByCoAdmins && filterByCoAdmins.length > 0) {
      // Expand "bulk-import" sentinel to real value
      const names = filterByCoAdmins.map(n => n === "bulk-import" ? "bulk-import" : n);
      if (names.length === 1) {
        conditions.push(eq(pendingProviders.addedBy, names[0]));
      } else {
        conditions.push(inArray(pendingProviders.addedBy, names));
      }
    }

    // Group filter — multi-select (A/B/C/D/E)
    if (groups && groups.length > 0) {
      const upper = groups.map(g => g.toUpperCase());
      if (upper.length === 1) {
        conditions.push(eq(pendingProviders.groupLabel, upper[0]));
      } else {
        conditions.push(inArray(pendingProviders.groupLabel, upper));
      }
    }

    // Search
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(or(
        ilike(pendingProviders.name, q),
        ilike(pendingProviders.mobile, q),
        ilike(pendingProviders.serviceName, q),
        ilike(pendingProviders.addedBy, q),
      ));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * limit;

    // Determine sort order
    let orderByClause = desc(pendingProviders.id);
    if (sortBy === "name-asc") {
      orderByClause = asc(pendingProviders.name);
    } else if (sortBy === "name-desc") {
      orderByClause = desc(pendingProviders.name);
    } else if (sortBy === "date-newest") {
      orderByClause = desc(pendingProviders.createdAt);
    } else if (sortBy === "date-oldest") {
      orderByClause = asc(pendingProviders.createdAt);
    }

    // Get all unique co-admins for filter dropdown (always pending status)
    const coAdminsResult = await db.selectDistinct({ addedBy: pendingProviders.addedBy })
      .from(pendingProviders)
      .where(eq(pendingProviders.status, "pending"));
    const coAdmins = coAdminsResult.map(r => r.addedBy).filter(a => a && a !== "bulk-import" && typeof a === "string").sort();

    const [totalResult, data] = await Promise.all([
      db.select({ c: count() }).from(pendingProviders).where(whereClause),
      db.select().from(pendingProviders).where(whereClause)
        .orderBy(orderByClause)
        .limit(limit).offset(offset),
    ]);

    const total = Number(totalResult[0]?.c ?? 0);
    return { data, total, page, totalPages: Math.ceil(total / limit), coAdmins };
  }

  async deleteNoMobilePendingProviders(): Promise<number> {
    const result = await db.delete(pendingProviders)
      .where(or(
        isNull(pendingProviders.mobile),
        eq(pendingProviders.mobile, ""),
        lt(sql`length(${pendingProviders.mobile})`, 7),
      ))
      .returning({ id: pendingProviders.id });
    return result.length;
  }

  async getPendingProvider(id: number): Promise<PendingProvider | undefined> {
    const [pp] = await db.select().from(pendingProviders).where(eq(pendingProviders.id, id));
    return pp;
  }

  async updatePendingProviderStatus(id: number, status: string, notes?: string, verifiedBy?: string): Promise<PendingProvider> {
    const [pp] = await db.update(pendingProviders)
      .set({
        status,
        ...(notes !== undefined ? { notes } : {}),
        ...(verifiedBy ? { verifiedBy } : {}),
      })
      .where(eq(pendingProviders.id, id))
      .returning();
    // Track reject/fake in salary cycle
    if (verifiedBy && (status === "rejected" || status === "fake")) {
      await this.incrementCycleStat(verifiedBy, "reject");
    }
    return pp;
  }

  async approvePendingProvider(id: number, approvedBy?: string, opts?: { skipAiTags?: boolean }): Promise<{ userId: string }> {
    const pp = await this.getPendingProvider(id);
    if (!pp) throw new Error("Pending provider not found");

    const phone = pp.mobile || (pp.mobileNumbers as string[])?.[0] || null;

    // For meta-sourced leads, always create a fresh user so duplicate imports
    // result in independent live providers (admin can later delete extras).
    const forceFresh = pp.source === "meta";

    let existingUser = (!forceFresh && phone) ? await this.getLocalUserByPhone(phone) : null;
    let userId: string;

    if (existingUser) {
      userId = existingUser.userId;
    } else {
      // phone has a UNIQUE constraint on local_users — for fresh/duplicate
      // meta leads we store phone=null on the user row and keep the phone on
      // the profile/provider records only.
      const newUser = await this.createLocalUser({
        phone: forceFresh ? null : phone,
        email: null,
        username: null,
        password: null,
        role: "customer",
        authMethod: "coadmin" as any,
      });
      userId = newUser.userId;
    }

    await this.getOrCreateCredits(userId);

    const existingProfile = forceFresh ? null : await this.getProfileByRole(userId, "provider");
    if (!existingProfile) {
      await this.createProfile({
        userId,
        role: "provider",
        name: pp.name,
        mobile: phone || "",
        isBlocked: false,
      });
    }

    const existingCustomer = forceFresh ? null : await this.getProfileByRole(userId, "customer");
    if (!existingCustomer) {
      await this.createProfile({
        userId,
        role: "customer",
        name: pp.name,
        mobile: phone || "",
        isBlocked: false,
      });
    }

    const existingProvider = forceFresh ? null : await this.getProvider(userId);
    if (!existingProvider) {
      // Auto-suggest hashtags when the source row is sparse (< 5 tags). The
      // dictionary + Gemini hybrid in `generateTagsForProvider` merges with
      // existing tags (never overwrites) and falls back to dictionary-only
      // when Gemini errors / isn't configured. Wrapped in try/catch so any
      // unexpected failure (network, etc.) cannot block the approval.
      // Dynamic import avoids the circular dep between storage.ts and
      // server/lib/auto-tags.ts (which already imports `storage`).
      let hashtags: string[] = (pp.hashtags as string[]) || [];
      // Skip the (slow) AI enrichment when bulk-importing — the caller can
      // run the existing background "auto-generate tags" job afterwards to
      // backfill in parallel without blocking each row's HTTP response.
      if (hashtags.length < 5 && !opts?.skipAiTags) {
        try {
          const { generateTagsForProvider } = await import("./lib/auto-tags");
          const result = await generateTagsForProvider(
            pp.serviceName,
            pp.description || null,
            hashtags,
          );
          hashtags = result.finalTags;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[auto-tags] approval-time enrichment failed for pending #${id}: ${msg}`);
        }
      }

      // Build mobileNumbers: merge pp.mobileNumbers (verified array from UI)
      // with pp.mobile (populated by every import path but never put in the
      // array). Without this merge, Google Places / Excel imports always
      // produce providers with mobileNumbers=[] even though pp.mobile is set.
      const ppNums = ((pp.mobileNumbers as string[]) || []).filter(Boolean);
      if (phone && !ppNums.includes(phone)) ppNums.unshift(phone);

      await this.createProvider({
        userId,
        serviceName: pp.serviceName,
        description: pp.description || null,
        hashtags,
        radiusKm: pp.radiusKm || 10,
        approxCharge: pp.approxCharge || null,
        mobileNumbers: ppNums,
        latitude: pp.latitude || null,
        longitude: pp.longitude || null,
        address: pp.address || null,
        isActive: true,
        isHidden: pp.isHidden || false,
        profilePhoto: pp.profilePhoto || null,
        addedBy: pp.addedBy || "coadmin",
        approvedBy: approvedBy || null,
      });
    }

    await this.updatePendingProviderStatus(id, "approved");
    // Track approve in salary cycle
    if (approvedBy) await this.incrementCycleStat(approvedBy, "approve");
    return { userId };
  }

  async trackVisit(date: string): Promise<void> {
    await db
      .insert(visitorStats)
      .values({ date, count: 1 })
      .onConflictDoUpdate({
        target: visitorStats.date,
        set: { count: sql`${visitorStats.count} + 1` },
      });
  }

  async deductMultipleCredits(userId: string, role: string = "user", amount: number): Promise<boolean> {
    const credit = await this.getOrCreateCredits(userId);
    const free = credit.freeCredits ?? 0;
    const purchased = credit.purchasedCredits ?? 0;
    if (free + purchased < amount) return false;
    let newFree = free;
    let newPurchased = purchased;
    let remaining = amount;
    if (newFree >= remaining) { newFree -= remaining; remaining = 0; }
    else { remaining -= newFree; newFree = 0; newPurchased -= remaining; }
    await db.update(credits).set({ freeCredits: newFree, purchasedCredits: newPurchased }).where(eq(credits.id, credit.id));
    return true;
  }

  async createJob(data: { userId: string; jobName: string; description: string; location: string; state?: string; district?: string; workType?: string; salary?: string; workHours?: string; numEmployees?: string; contactPhone?: string; postType: "mitrify" | "google_form"; googleFormUrl?: string }): Promise<Job> {
    const [job] = await db.insert(jobs).values({
      userId: data.userId,
      jobName: data.jobName,
      description: data.description,
      location: data.location,
      state: data.state,
      district: data.district,
      workType: data.workType,
      salary: data.salary,
      workHours: data.workHours,
      numEmployees: data.numEmployees,
      contactPhone: data.contactPhone,
      postType: data.postType,
      googleFormUrl: data.googleFormUrl,
    }).returning();
    return job;
  }

  async listActiveJobs(): Promise<Job[]> {
    return await db.select().from(jobs)
      .where(eq(jobs.isActive, true))
      .orderBy(jobs.createdAt);
  }

  async getJobsByUser(userId: string): Promise<Job[]> {
    return await db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(jobs.createdAt);
  }

  async getJob(jobId: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    return job;
  }

  async updateJobLowCredit(userId: string, lowCredit: boolean): Promise<void> {
    await db.update(jobs).set({ lowCredit }).where(eq(jobs.userId, userId));
  }

  async incrementJobApplyClicks(jobId: number): Promise<number> {
    const [updated] = await db.update(jobs)
      .set({ applyClicks: sql`${jobs.applyClicks} + 1` })
      .where(eq(jobs.id, jobId))
      .returning({ applyClicks: jobs.applyClicks });
    return updated?.applyClicks ?? 0;
  }

  async deleteJob(jobId: number, userId: string): Promise<void> {
    await db.update(jobs).set({ isActive: false }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  }

  async adminUpdateJob(jobId: number, updates: { jobName?: string; description?: string; location?: string; salary?: string; workHours?: string; contactPhone?: string | null; isActive?: boolean; googleFormUrl?: string | null; postType?: string }): Promise<Job | undefined> {
    const [updated] = await db.update(jobs).set(updates).where(eq(jobs.id, jobId)).returning();
    return updated;
  }

  async getVisitorStats(): Promise<{ total: number; today: number; last7Days: { date: string; count: number }[] }> {
    const rows = await db.select().from(visitorStats).orderBy(visitorStats.date);
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = rows.find(r => r.date === today);
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const row = rows.find(r => r.date === dateStr);
      last7.push({ date: dateStr, count: row?.count || 0 });
    }
    return { total, today: todayRow?.count || 0, last7Days: last7 };
  }

  async hasUsedPromo(phone: string, code: string): Promise<boolean> {
    const [row] = await db.select().from(promoUsageLog)
      .where(and(eq(promoUsageLog.phone, phone), eq(promoUsageLog.promoCode, code)));
    return !!row;
  }

  async recordPromoUsage(phone: string, code: string): Promise<void> {
    await db.insert(promoUsageLog).values({ phone, promoCode: code });
  }

  async isMobileNumberTaken(phone: string, excludeUserId?: string): Promise<boolean> {
    const normalised = phone.trim();
    const [inLocalUsers] = await db.select().from(localUsers)
      .where(eq(localUsers.phone, normalised));
    if (inLocalUsers && inLocalUsers.userId !== excludeUserId) return true;

    const [inProfiles] = await db.select().from(profiles)
      .where(eq(profiles.mobile, normalised));
    if (inProfiles && inProfiles.userId !== excludeUserId) return true;

    const allProviders = await db.select().from(providers);
    for (const p of allProviders) {
      if (excludeUserId && p.userId === excludeUserId) continue;
      if ((p.mobileNumbers || []).some((n: string) => n.trim() === normalised)) return true;
    }
    return false;
  }

  async getProviderByMobile(phone: string): Promise<Provider | undefined> {
    const normalised = phone.trim();
    const allProviders = await db.select().from(providers);
    return allProviders.find(p => (p.mobileNumbers || []).some((n: string) => n.trim() === normalised));
  }

  async getEmployeesByCoAdmin(coAdminId: number): Promise<Employee[]> {
    return await db.select().from(employees).where(eq(employees.coAdminId, coAdminId));
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const [employee] = await db.select().from(employees).where(eq(employees.id, id));
    return employee;
  }

  async getAllEmployees(): Promise<Employee[]> {
    return await db.select().from(employees);
  }

  async createEmployee(data: InsertEmployee): Promise<Employee> {
    const [employee] = await db.insert(employees).values(data).returning();
    return employee;
  }

  async updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<Employee> {
    const [updated] = await db.update(employees).set({ ...data, updatedAt: new Date() }).where(eq(employees.id, id)).returning();
    return updated;
  }

  async trackSearch(query: string): Promise<void> {
    const normalizedQuery = query.toLowerCase().trim();
    // Defense-in-depth: never log very short queries (single keystrokes).
    // The client only calls /api/search/track on Enter / button / category
    // click, but this guard keeps the search history clean even if some
    // future caller forgets and fires off partials.
    if (normalizedQuery.length < 2) return;

    const [existing] = await db.select().from(searchLog)
      .where(eq(searchLog.query, normalizedQuery));

    if (existing) {
      await db.update(searchLog)
        .set({ count: existing.count + 1, lastSearched: new Date() })
        .where(eq(searchLog.query, normalizedQuery));
    } else {
      await db.insert(searchLog).values({ query: normalizedQuery, count: 1 });
    }
  }

  async getSearchStats(): Promise<{ query: string; count: number; lastSearched: Date | null }[]> {
    const stats = await db.select({ query: searchLog.query, count: searchLog.count, lastSearched: searchLog.lastSearched })
      .from(searchLog)
      .orderBy(desc(searchLog.count));
    return stats;
  }

  async bulkCreatePendingProviders(records: Array<{ name: string; mobile: string; addedBy: string }>, allowDuplicate = false): Promise<{ imported: number; skipped: number; total: number }> {
    const total = records.length;

    let pendingMobiles = new Set<string>();
    let userPhones = new Set<string>();
    if (!allowDuplicate) {
      // 1. Fetch all existing mobiles in pending_providers (one query)
      const existingPending = await db.select({ mobile: pendingProviders.mobile }).from(pendingProviders);
      pendingMobiles = new Set(existingPending.map(r => r.mobile).filter((m): m is string => !!m));

      // 2. Fetch all registered user phones (one query)
      const existingUsers = await db.select({ phone: localUsers.phone }).from(localUsers);
      userPhones = new Set(existingUsers.map(r => r.phone).filter((p): p is string => !!p));
    }

    // 3. Filter out duplicates in memory
    const seen = new Set<string>();
    const toInsert = records.filter(rec => {
      if (!rec.mobile) return false;
      if (!allowDuplicate) {
        if (seen.has(rec.mobile)) return false;
        if (pendingMobiles.has(rec.mobile) || userPhones.has(rec.mobile)) return false;
        seen.add(rec.mobile);
      }
      return true;
    });

    const skipped = total - toInsert.length;
    let imported = 0;

    // 4. Batch insert in chunks of 500
    const BATCH = 500;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const chunk = toInsert.slice(i, i + BATCH).map(rec => ({
        name: rec.name,
        mobile: rec.mobile,
        // Pre-populate mobileNumbers array so approval always has a number.
        mobileNumbers: rec.mobile ? [rec.mobile] : [],
        serviceName: "",
        addedBy: rec.addedBy,
        status: "pending" as const,
      } as any));
      try {
        await db.insert(pendingProviders).values(chunk);
        imported += chunk.length;
      } catch {
        // If batch fails, try individually
        for (const row of chunk) {
          try {
            await db.insert(pendingProviders).values(row);
            imported++;
          } catch {
            // skip failed row
          }
        }
      }
    }
    return { imported, skipped, total };
  }

  async bulkCreateGooglePlaces(records: Array<{ name: string; mobile?: string; serviceName: string; address?: string; latitude?: number; longitude?: number; description?: string }>, assignedTo: string, allowDuplicate = false): Promise<{ imported: number; skipped: number; total: number; skippedNoMobile: number; insertedIds: number[] }> {
    const total = records.length;
    let skippedNoMobile = 0;

    // Normalize incoming Google numbers to last-10-digits up front so we
    // can do a single targeted DB lookup over only the phones we're
    // about to insert (instead of streaming every existing phone in
    // pending_providers / local_users / providers into Node memory just
    // to throw most of them away). Memory stays flat as the table grows.
    const normalize = (raw: string | null | undefined) => {
      const d = (raw || "").replace(/\D/g, "");
      return d.length >= 10 ? d.slice(-10) : d;
    };

    type Norm = { rec: typeof records[number]; cleanMob: string };
    const normalised: Norm[] = [];
    for (const rec of records) {
      const cleanMob = normalize(rec.mobile);
      if (!cleanMob) {
        skippedNoMobile++;
        if (allowDuplicate) normalised.push({ rec, cleanMob: "" });
        continue;
      }
      normalised.push({ rec, cleanMob });
    }

    let known = new Set<string>();
    if (!allowDuplicate) {
      const candidatePhones = normalised
        .map(n => n.cleanMob)
        .filter(p => p.length === 10);
      // Targeted lookup over only the candidate phones — see
      // server/phoneDedupe.ts for why this is safe and scalable.
      known = await findKnownPhones(candidatePhones);
    }

    const seen = new Set<string>();
    const toInsert: typeof records = [];
    for (const { rec, cleanMob } of normalised) {
      if (!cleanMob) {
        toInsert.push({ ...rec, mobile: "" });
        continue;
      }
      if (!allowDuplicate) {
        if (seen.has(cleanMob)) continue;
        if (known.has(cleanMob)) continue;
        seen.add(cleanMob);
      }
      toInsert.push({ ...rec, mobile: cleanMob });
    }

    const skipped = total - toInsert.length - skippedNoMobile;
    let imported = 0;
    const insertedIds: number[] = [];
    const BATCH = 500;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const chunk = toInsert.slice(i, i + BATCH).map(rec => ({
        name: rec.name,
        mobile: rec.mobile || "",
        // Also pre-populate mobileNumbers so approvePendingProvider has a
        // consistent array even if the co-admin skips adding numbers manually.
        mobileNumbers: rec.mobile ? [rec.mobile] : [],
        serviceName: rec.serviceName || "",
        address: rec.address || "",
        description: rec.description || null,
        latitude: rec.latitude ?? null,
        longitude: rec.longitude ?? null,
        addedBy: assignedTo,
        source: "google" as const,
        status: "pending" as const,
      }));
      try {
        const rows = await db.insert(pendingProviders).values(chunk).returning({ id: pendingProviders.id });
        imported += rows.length;
        for (const r of rows) insertedIds.push(r.id);
      } catch {
        for (const row of chunk) {
          try {
            const rows = await db.insert(pendingProviders).values(row).returning({ id: pendingProviders.id });
            if (rows[0]) { insertedIds.push(rows[0].id); imported++; }
          } catch {}
        }
      }
    }
    return { imported, skipped, total, skippedNoMobile, insertedIds };
  }

  async bulkCreateMetaLeads(records: Array<{ name: string; mobile: string; serviceName?: string; address?: string; description?: string }>, assignedTo: string, allowDuplicate = false): Promise<{ imported: number; skipped: number; total: number }> {
    const total = records.length;

    let pendingMobiles = new Set<string>();
    let userPhones = new Set<string>();
    if (!allowDuplicate) {
      const existingPending = await db.select({ mobile: pendingProviders.mobile }).from(pendingProviders);
      pendingMobiles = new Set(existingPending.map(r => r.mobile).filter((m): m is string => !!m));

      const existingUsers = await db.select({ phone: localUsers.phone }).from(localUsers);
      userPhones = new Set(existingUsers.map(r => r.phone).filter((p): p is string => !!p));
    }

    const seen = new Set<string>();
    const toInsert = records.filter(rec => {
      if (!rec.mobile) return false;
      if (!allowDuplicate) {
        if (seen.has(rec.mobile)) return false;
        if (pendingMobiles.has(rec.mobile) || userPhones.has(rec.mobile)) return false;
        seen.add(rec.mobile);
      }
      return true;
    });

    const skipped = total - toInsert.length;
    let imported = 0;

    const BATCH = 500;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const chunk = toInsert.slice(i, i + BATCH).map(rec => ({
        name: rec.name,
        mobile: rec.mobile,
        serviceName: rec.serviceName || "",
        address: rec.address || "",
        description: rec.description || null,
        addedBy: assignedTo,
        source: "meta" as const,
        status: "pending" as const,
      }));
      try {
        await db.insert(pendingProviders).values(chunk);
        imported += chunk.length;
      } catch {
        for (const row of chunk) {
          try {
            await db.insert(pendingProviders).values(row);
            imported++;
          } catch {
            // skip failed row
          }
        }
      }
    }
    return { imported, skipped, total };
  }

  async getDuplicateProfiles(): Promise<Array<{ mobile: string; count: number; profiles: Array<{ userId: string; role: string; name: string; mobile: string; isBlocked: boolean; totalCredits: number; completenessScore: number; serviceName: string; description: string; address: string; hasLocation: boolean; hashtags: string[]; approxCharge: string; }>; }>> {
    // 1. Get all profiles with a mobile number
    const allProfiles = await db.select().from(profiles);
    // Group by mobile, collect unique userIds per mobile
    const byMobile = new Map<string, Profile[]>();
    for (const p of allProfiles) {
      if (!p.mobile) continue;
      if (!byMobile.has(p.mobile)) byMobile.set(p.mobile, []);
      byMobile.get(p.mobile)!.push(p);
    }
    // Filter to mobiles with more than 1 distinct userId
    const duplicateEntries = [...byMobile.entries()].filter(([_, profs]: [string, Profile[]]) => {
      const uniqueUserIds = new Set(profs.map((p: Profile) => p.userId));
      return uniqueUserIds.size > 1;
    });
    if (duplicateEntries.length === 0) return [];

    // 2. Gather all userIds involved
    const allUserIds = [...new Set(duplicateEntries.flatMap(([_, profs]: [string, Profile[]]) => profs.map((p: Profile) => p.userId)))];

    // 3. Fetch credits and providers in bulk
    const allCredits = await db.select().from(credits).where(inArray(credits.userId, allUserIds));
    const creditsByUserId = new Map<string, number>();
    for (const c of allCredits) {
      creditsByUserId.set(c.userId, (creditsByUserId.get(c.userId) ?? 0) + (c.freeCredits ?? 0) + (c.purchasedCredits ?? 0));
    }
    const allProviders = await db.select().from(providers).where(inArray(providers.userId, allUserIds));
    const provByUserId = new Map<string, any>();
    for (const pv of allProviders) provByUserId.set(pv.userId, pv);

    // 4. Build result
    const result = [];
    for (const [mobile, profs] of duplicateEntries) {
      const seenIds = new Set<string>();
      const uniqueProfiles = profs.filter((p: Profile) => { if (seenIds.has(p.userId)) return false; seenIds.add(p.userId); return true; });
      const enriched = uniqueProfiles.map((p: Profile) => {
        const pv = provByUserId.get(p.userId);
        let score = 0;
        if (p.name) score += 1;
        if (p.mobile) score += 1;
        if (p.latitude && p.longitude) score += 4;
        if (pv) {
          if (pv.serviceName) score += 2;
          if (pv.description) score += 2;
          if (pv.address) score += 2;
          if (pv.hashtags && (pv.hashtags as string[]).length > 0) score += 1;
          if (pv.approxCharge) score += 1;
          if (pv.latitude && pv.longitude) score += 2;
        }
        return {
          userId: p.userId,
          role: p.role || "customer",
          name: p.name || "",
          mobile: p.mobile || "",
          isBlocked: p.isBlocked ?? false,
          totalCredits: creditsByUserId.get(p.userId) ?? 0,
          completenessScore: score,
          serviceName: pv?.serviceName || "",
          description: pv?.description || "",
          address: pv?.address || "",
          hasLocation: !!(p.latitude && p.longitude) || !!(pv?.latitude && pv?.longitude),
          hashtags: (pv?.hashtags as string[]) || [],
          approxCharge: pv?.approxCharge || "",
        };
      });
      enriched.sort((a: { completenessScore: number }, b: { completenessScore: number }) => b.completenessScore - a.completenessScore);
      result.push({ mobile, count: enriched.length, profiles: enriched });
    }
    result.sort((a, b) => b.count - a.count);
    return result;
  }

  async updatePendingProviderFields(id: number, fields: { serviceName?: string; address?: string; district?: string; state?: string; approxCharge?: string }): Promise<PendingProvider> {
    const updateData: Record<string, any> = {};
    if (fields.serviceName !== undefined) updateData.serviceName = fields.serviceName;
    if (fields.address !== undefined) updateData.address = fields.address;
    if (fields.district !== undefined) updateData.district = fields.district;
    if (fields.state !== undefined) updateData.state = fields.state;
    if (fields.approxCharge !== undefined) updateData.approxCharge = fields.approxCharge;
    const [pp] = await db.update(pendingProviders).set(updateData).where(eq(pendingProviders.id, id)).returning();
    return pp;
  }

  async createTagJob(data: { jobId: string; total: number; dryRun: boolean; geminiAvailable: boolean }): Promise<void> {
    await db.insert(tagJobs).values({
      jobId: data.jobId,
      total: data.total,
      dryRun: data.dryRun,
      geminiAvailable: data.geminiAvailable,
      startedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateTagJob(jobId: string, patch: Partial<Omit<TagJob, "jobId" | "startedAt">>): Promise<void> {
    await db.update(tagJobs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tagJobs.jobId, jobId));
  }

  async getTagJob(jobId: string): Promise<TagJob | undefined> {
    const [row] = await db.select().from(tagJobs).where(eq(tagJobs.jobId, jobId)).limit(1);
    return row;
  }

  async getActiveTagJob(): Promise<TagJob | undefined> {
    const [row] = await db.select().from(tagJobs)
      .where(eq(tagJobs.done, false))
      .orderBy(desc(tagJobs.startedAt))
      .limit(1);
    return row;
  }

  async getLatestTagJob(maxAgeSeconds: number): Promise<TagJob | undefined> {
    const cutoff = new Date(Date.now() - maxAgeSeconds * 1000);
    const [row] = await db.select().from(tagJobs)
      .where(gte(tagJobs.startedAt, cutoff))
      .orderBy(desc(tagJobs.startedAt))
      .limit(1);
    return row;
  }

  // ── Subscriptions ──────────────────────────────────────────────────────
  async getActiveSubscriptionPlan(userId: string): Promise<SubscriptionPlan> {
    await this.reconcileExpiredSubscriptions(userId);
    const now = new Date();
    const rows = await db.select().from(subscriptions).where(and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.status, "active"),
      gte(subscriptions.endDate, now),
    ));
    let best: SubscriptionPlan = "none";
    for (const r of rows) {
      const p = (r.plan as SubscriptionPlan) || "none";
      if (PLAN_RANK[p] > PLAN_RANK[best]) best = p;
    }
    return best;
  }

  async getActiveSubscription(userId: string): Promise<Subscription | undefined> {
    await this.reconcileExpiredSubscriptions(userId);
    const now = new Date();
    // Single-active invariant: createOrExtendSubscription ensures only one
    // status='active' row exists per user at a time (prior actives are
    // 'superseded' or 'cancelled'), so the row with the latest endDate is
    // unambiguously the entitlement period. Order by endDate desc and take
    // the first.
    const [row] = await db.select().from(subscriptions).where(and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.status, "active"),
      gte(subscriptions.endDate, now),
    )).orderBy(desc(subscriptions.endDate)).limit(1);
    return row;
  }

  async createOrExtendSubscription(opts: {
    userId: string;
    plan: "boost" | "pro" | "premium";
    billingCycle: "monthly" | "yearly" | "custom";
    durationDays: number;
    amount: number;
    paymentId?: string | null;
    grantedBy?: string | null;
  }): Promise<Subscription> {
    const now = new Date();

    // Storage-level idempotency: if this paymentId was already converted into
    // a subscription row, return that row instead of creating/extending again.
    // Routes also short-circuits on this, but defending here makes the
    // operation safe to call from any future code path.
    if (opts.paymentId) {
      const [existingPayment] = await db.select().from(subscriptions)
        .where(eq(subscriptions.paymentId, opts.paymentId)).limit(1);
      if (existingPayment) return existingPayment;
    }

    const [existingSame] = await db.select().from(subscriptions).where(and(
      eq(subscriptions.userId, opts.userId),
      eq(subscriptions.status, "active"),
      gte(subscriptions.endDate, now),
      eq(subscriptions.plan, opts.plan),
    )).orderBy(desc(subscriptions.endDate)).limit(1);

    let result: Subscription;

    // EVERY mutation path runs inside a per-user advisory-locked transaction
    // so concurrent paid-creates and concurrent admin grants for the same
    // user cannot interleave to violate the single-active invariant that
    // getActiveSubscription depends on.
    result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"sub:" + opts.userId}))`);

      // Re-read same-tier active inside the lock (state may have changed
      // between the pre-check above and entering the transaction).
      const [sameInTx] = await tx.select().from(subscriptions).where(and(
        eq(subscriptions.userId, opts.userId),
        eq(subscriptions.status, "active"),
        gte(subscriptions.endDate, now),
        eq(subscriptions.plan, opts.plan),
      )).orderBy(desc(subscriptions.endDate)).limit(1);

      if (opts.paymentId) {
        // Paid event → always insert a NEW row so each payment is its own
        // immutable history entry. The partial unique index on payment_id
        // (DB-enforced) makes duplicate order_ids replay-safe.
        const paymentId = opts.paymentId;
        const baseStart = sameInTx && sameInTx.endDate > now ? sameInTx.endDate : now;
        const newEnd = new Date(baseStart.getTime() + opts.durationDays * 86400_000);

        const inserted = await tx.insert(subscriptions).values({
          userId: opts.userId,
          plan: opts.plan,
          billingCycle: opts.billingCycle,
          endDate: newEnd,
          paymentId,
          amount: opts.amount,
          status: "active",
          grantedBy: opts.grantedBy ?? null,
        }).onConflictDoNothing({ target: subscriptions.paymentId }).returning();

        if (inserted.length === 0) {
          const [existingPayment] = await tx.select().from(subscriptions)
            .where(eq(subscriptions.paymentId, paymentId)).limit(1);
          if (existingPayment) return existingPayment;
          throw new Error("subscription_insert_conflict");
        }

        if (sameInTx) {
          await tx.update(subscriptions)
            .set({ status: "superseded" })
            .where(eq(subscriptions.id, sameInTx.id));
        }
        // Demote ANY other still-active rows for this user (cross-tier
        // legacy rows or duplicates from pre-invariant data). The insert
        // we just won is excluded; any same-tier `sameInTx` was already
        // marked 'superseded' above and so will not match here.
        await tx.update(subscriptions).set({ status: "cancelled" })
          .where(and(
            eq(subscriptions.userId, opts.userId),
            eq(subscriptions.status, "active"),
            ne(subscriptions.id, inserted[0].id),
          ));
        return inserted[0];
      }

      if (sameInTx) {
        // Admin grant on the same tier → extend the existing row in place
        // and demote any cross-tier active rows that may have appeared.
        await tx.update(subscriptions).set({ status: "cancelled" })
          .where(and(
            eq(subscriptions.userId, opts.userId),
            eq(subscriptions.status, "active"),
            gte(subscriptions.endDate, now),
            ne(subscriptions.id, sameInTx.id),
          ));
        const baseEnd = sameInTx.endDate > now ? sameInTx.endDate : now;
        const newEnd = new Date(baseEnd.getTime() + opts.durationDays * 86400_000);
        const [updated] = await tx.update(subscriptions).set({
          endDate: newEnd,
          billingCycle: opts.billingCycle,
          amount: sameInTx.amount + opts.amount,
          grantedBy: opts.grantedBy ?? sameInTx.grantedBy,
        }).where(eq(subscriptions.id, sameInTx.id)).returning();
        return updated;
      }

      // Admin grant on a different tier → cancel old, start fresh from now.
      await tx.update(subscriptions).set({ status: "cancelled" })
        .where(and(
          eq(subscriptions.userId, opts.userId),
          eq(subscriptions.status, "active"),
          gte(subscriptions.endDate, now),
        ));
      const newEnd = new Date(now.getTime() + opts.durationDays * 86400_000);
      const [created] = await tx.insert(subscriptions).values({
        userId: opts.userId,
        plan: opts.plan,
        billingCycle: opts.billingCycle,
        endDate: newEnd,
        paymentId: null,
        amount: opts.amount,
        status: "active",
        grantedBy: opts.grantedBy ?? null,
      }).returning();
      return created;
    });
    invalidateSearchDataset();
    return result;
  }

  /**
   * Lazy expiry: any row still flagged "active" but past its endDate is
   * transitioned to "expired" so admin filtering and reporting reflect
   * reality without needing a cron.
   */
  private async reconcileExpiredSubscriptions(userId?: string): Promise<void> {
    const now = new Date();
    const conds = [eq(subscriptions.status, "active"), lt(subscriptions.endDate, now)];
    if (userId) conds.push(eq(subscriptions.userId, userId));
    await db.update(subscriptions).set({ status: "expired" }).where(and(...conds));
  }

  async getSubscriptionByPaymentId(paymentId: string): Promise<Subscription | undefined> {
    const [row] = await db.select().from(subscriptions)
      .where(eq(subscriptions.paymentId, paymentId)).limit(1);
    return row;
  }

  async recordCreditPayment(opts: {
    userId: string;
    orderId: string;
    credits: number;
    amount: number;
  }): Promise<{ payment: CreditPayment; firstTime: boolean }> {
    const inserted = await db.insert(creditPayments).values({
      userId: opts.userId,
      orderId: opts.orderId,
      credits: opts.credits,
      amount: opts.amount,
      status: "paid",
      paidAt: new Date(),
    }).onConflictDoNothing({ target: creditPayments.orderId }).returning();
    if (inserted.length > 0) return { payment: inserted[0], firstTime: true };
    const [existing] = await db.select().from(creditPayments)
      .where(eq(creditPayments.orderId, opts.orderId)).limit(1);
    return { payment: existing, firstTime: false };
  }

  async listUserCreditPayments(userId: string): Promise<CreditPayment[]> {
    return await db.select().from(creditPayments)
      .where(and(eq(creditPayments.userId, userId), eq(creditPayments.status, "paid")))
      .orderBy(desc(creditPayments.createdAt));
  }

  async listUserSubscriptions(userId: string): Promise<Subscription[]> {
    await this.reconcileExpiredSubscriptions(userId);
    return await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt));
  }

  async listAllSubscriptions(opts?: { search?: string; status?: string; plan?: string }): Promise<Array<Subscription & { name: string; mobile: string }>> {
    await this.reconcileExpiredSubscriptions();
    const rows = await db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt));
    const profileRows = await db.select().from(profiles);
    const luRows = await db.select().from(localUsers);
    const profileMap = new Map<string, Profile>();
    for (const p of profileRows) {
      // Prefer customer profile for the display name; fall back to provider.
      if (!profileMap.has(p.userId) || p.role === "customer") profileMap.set(p.userId, p);
    }
    const phoneMap = new Map<string, string>();
    for (const u of luRows) if (u.phone) phoneMap.set(u.userId, u.phone);

    const search = (opts?.search || "").trim().toLowerCase();
    const status = opts?.status || "";
    const plan = opts?.plan || "";

    return rows
      .map(r => {
        const p = profileMap.get(r.userId);
        const mobile = p?.mobile || phoneMap.get(r.userId) || "";
        return { ...r, name: p?.name || "Unknown", mobile };
      })
      .filter(r => {
        if (status && r.status !== status) return false;
        if (plan && r.plan !== plan) return false;
        if (search) {
          const hay = `${r.name} ${r.mobile} ${r.userId} ${r.paymentId || ""}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });
  }

  async cancelSubscription(id: number): Promise<Subscription> {
    const [updated] = await db.update(subscriptions)
      .set({ status: "cancelled", endDate: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    invalidateSearchDataset();
    return updated;
  }

  async extendSubscription(id: number, extraDays: number): Promise<Subscription> {
    // Wrapped in a per-user advisory-lock transaction so that activating a
    // historical row + demoting any other currently-active rows for the
    // same user happens atomically — preserves the single-active invariant
    // that getActiveSubscription depends on.
    const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    if (!existing) throw new Error("Subscription not found");
    const now = new Date();
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"sub:" + existing.userId}))`);
      const baseEnd = existing.endDate > now ? existing.endDate : now;
      const newEnd = new Date(baseEnd.getTime() + extraDays * 86400_000);
      // Demote every other active row for this user so only the extended
      // row remains active (cross-tier rows are cancelled per task spec).
      await tx.update(subscriptions).set({ status: "cancelled" })
        .where(and(
          eq(subscriptions.userId, existing.userId),
          eq(subscriptions.status, "active"),
          ne(subscriptions.id, id),
        ));
      const [updated] = await tx.update(subscriptions)
        .set({ endDate: newEnd, status: "active" })
        .where(eq(subscriptions.id, id))
        .returning();
      invalidateSearchDataset();
      return updated;
    });
  }

  async getSubscriptionPlanConfig(): Promise<SubscriptionPlanConfig> {
    const [row] = await db.select().from(siteContent).where(eq(siteContent.key, "subscription_plans"));
    if (!row) return DEFAULT_SUBSCRIPTION_PLAN_CONFIG;
    try {
      const cfg = row.value as SubscriptionPlanConfig;
      // Backfill any missing tier from defaults so partial admin saves are
      // always safe on read.
      return {
        boost: { ...DEFAULT_SUBSCRIPTION_PLAN_CONFIG.boost, ...(cfg?.boost || {}) },
        pro: { ...DEFAULT_SUBSCRIPTION_PLAN_CONFIG.pro, ...(cfg?.pro || {}) },
        premium: { ...DEFAULT_SUBSCRIPTION_PLAN_CONFIG.premium, ...(cfg?.premium || {}) },
      };
    } catch {
      return DEFAULT_SUBSCRIPTION_PLAN_CONFIG;
    }
  }

  async setSubscriptionPlanConfig(cfg: SubscriptionPlanConfig): Promise<SubscriptionPlanConfig> {
    const [existing] = await db.select().from(siteContent).where(eq(siteContent.key, "subscription_plans"));
    if (existing) {
      await db.update(siteContent)
        .set({ value: cfg, updatedAt: new Date() })
        .where(eq(siteContent.key, "subscription_plans"));
    } else {
      await db.insert(siteContent).values({ key: "subscription_plans", value: cfg, updatedAt: new Date() });
    }
    return cfg;
  }

  async markStaleTagJobsFailed(staleSeconds: number): Promise<number> {
    const cutoff = new Date(Date.now() - staleSeconds * 1000);
    // Bumps `failed += 1` and appends a marker to errorSample so the UI shows
    // a final state. `staleSeconds = 0` effectively matches every not-done row
    // (used at boot — any not-done row from a previous process is orphaned).
    const result = await db.update(tagJobs)
      .set({
        done: true,
        failed: sql`${tagJobs.failed} + 1`,
        finishedAt: new Date(),
        updatedAt: new Date(),
        errorSample: sql`COALESCE(${tagJobs.errorSample}, '[]'::jsonb) || '["job marked failed: server restart or stalled before completion"]'::jsonb`,
      })
      .where(and(eq(tagJobs.done, false), lt(tagJobs.updatedAt, cutoff)))
      .returning({ jobId: tagJobs.jobId });
    return result.length;
  }

  async createGooglePlacesRun(data: InsertGooglePlacesRun): Promise<GooglePlacesRun> {
    const [row] = await db.insert(googlePlacesRuns).values(data).returning();
    return row;
  }

  async listRecentGooglePlacesRuns(limit: number): Promise<GooglePlacesRun[]> {
    return db.select().from(googlePlacesRuns)
      .orderBy(desc(googlePlacesRuns.startedAt))
      .limit(limit);
  }

}

export const storage = new DatabaseStorage();
