import { db } from "./db";
import {
  profiles, providers, calls, promoCodes, localUsers, credits, subscriptions,
  coAdmins, pendingProviders, visitorStats, jobs, promoUsageLog, employees, searchLog,
  salaryPayments, creditPayments, appNotifications,
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
  type SalaryPayment,
} from "@shared/schema";
import { eq, and, gte, sql, like, or, ilike, count, desc, isNull, lt, inArray, ne } from "drizzle-orm";

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
  approvePendingProvider(id: number, approvedBy?: string): Promise<void>;

  trackVisit(date: string): Promise<void>;
  getVisitorStats(): Promise<{ total: number; today: number; last7Days: { date: string; count: number }[] }>;
  deductMultipleCredits(userId: string, role: string, amount: number): Promise<boolean>;

  createJob(data: { userId: string; jobName: string; description: string; location: string; state?: string; district?: string; salary?: string; workHours?: string; numEmployees?: string; contactPhone: string }): Promise<Job>;
  listActiveJobs(): Promise<Job[]>;
  getJobsByUser(userId: string): Promise<Job[]>;
  getJob(jobId: number): Promise<Job | undefined>;
  updateJobLowCredit(userId: string, lowCredit: boolean): Promise<void>;
  deleteJob(jobId: number, userId: string): Promise<void>;
  adminUpdateJob(jobId: number, updates: { jobName?: string; description?: string; location?: string; salary?: string; workHours?: string; contactPhone?: string; isActive?: boolean }): Promise<Job | undefined>;

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
  getDuplicateProfiles(): Promise<Array<{ mobile: string; count: number; profiles: Array<{ userId: string; role: string; name: string; mobile: string; isBlocked: boolean; totalCredits: number; completenessScore: number; serviceName: string; description: string; address: string; hasLocation: boolean; hashtags: string[]; approxCharge: string; }>; }>>;
  updatePendingProviderFields(id: number, fields: { serviceName?: string; address?: string; district?: string; state?: string; approxCharge?: string }): Promise<PendingProvider>;
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
    const [allProviders, allProfiles, allCredits] = await Promise.all([
      db.select().from(providers).where(eq(providers.isActive, true)),
      db.select().from(profiles).where(eq(profiles.role, "provider")),
      db.select().from(credits).where(eq(credits.role, "user")),
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
      const prof = profileMap.get(p.userId);
      const district = normalizePlace(prof?.district);
      const addressCity = extractCityFromAddress(prof?.address);
      if (district) addAnchor(district, p.latitude, p.longitude);
      if (addressCity) addAnchor(addressCity, p.latitude, p.longitude);
    }
    const cityAnchors = new Map<string, { lat: number; lng: number }>();
    for (const [key, v] of anchorAcc) {
      cityAnchors.set(key, { lat: v.sumLat / v.n, lng: v.sumLng / v.n });
    }

    const data: SearchDataset = { providers: allProviders, profileMap, creditMap, lowBalanceMap, cityAnchors };
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

    const scoredResults: Array<{ provider: Provider; profile: Profile; distanceKm: number | null; distanceApprox: boolean; city: string | null; score: number }> = [];

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

      // Pull a best-effort city out of the address so the UI can show it
      // even when GPS coordinates are missing.
      const cityRaw = (profile.address || "").split(",")[0]?.trim() || null;
      const city = cityRaw || profile.district || null;

      // Distance: prefer real GPS, fall back to estimate from city/district.
      let distanceKm: number | null = null;
      let distanceApprox = false;
      if (lat != null && lng != null && provider.latitude != null && provider.longitude != null) {
        distanceKm = calculateDistance(lat, lng, provider.latitude, provider.longitude);
        if (radius && distanceKm > radius) continue;
        if (provider.radiusKm && distanceKm > provider.radiusKm) continue;
      } else if (lat != null && lng != null) {
        // No GPS on this provider → try to anchor by city or district
        const keys = [extractCityFromAddress(profile.address), normalizePlace(profile.district)];
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

      scoredResults.push({ provider, profile, distanceKm, distanceApprox, city, score });
    }

    // Sort: first by match score (desc), then by distance (asc). Real and
    // approximate distances sort together by value; providers with no
    // distance at all sink to the bottom.
    scoredResults.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      // Tiny tiebreaker so an exact distance wins over an approximate one
      // when the numeric values are equal.
      if (a.distanceKm === b.distanceKm) {
        return Number(a.distanceApprox) - Number(b.distanceApprox);
      }
      return a.distanceKm - b.distanceKm;
    });

    // Use cached credit map; cap to top 200 results to keep payload light
    const creditMap = ds.creditMap;
    const top = scoredResults.slice(0, 200);

    const lowBalanceMap = ds.lowBalanceMap;
    return top.map(({ provider, profile, distanceKm, distanceApprox, city }) => {
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
        results.push({ provider, profile, distanceKm: null, canCall: !contactHidden, contactHidden, providerLowBalance: false });
      }
    }

    // Batch credit check for phone search results — used to flag low balance
    if (results.length > 0) {
      const providerCredits = await db.select().from(credits).where(eq(credits.role, "user"));
      const lowMap = new Map<string, boolean>();
      for (const c of providerCredits) {
        lowMap.set(c.userId, (c.freeCredits ?? 0) + (c.purchasedCredits ?? 0) <= 0);
      }
      return results.map(r => ({ ...r, providerLowBalance: lowMap.get(r.provider.userId) ?? false }));
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
      const decrement = async (userId: string, amount: number) => {
        // Lock the credits row, validate balance, then decrement free
        // first then purchased.
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
        return free + purchased + amount; // pre-deduction total
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

      if (customerTotal <= 0 && providerTotal <= 0) {
        throw new Error("both_no_balance");
      }
      if (customerTotal <= 0) {
        if (!providerAcceptsDouble) throw new Error("customer_no_balance_blocked");
        if (providerTotal < 2) throw new Error("provider_cannot_absorb");
        // Daily cap (calendar-day reset) inside the same tx.
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
        paymentStatus: "credit",
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
    const [pp] = await db.insert(pendingProviders).values({ ...data, status: "pending" }).returning();
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
      orderByClause = pendingProviders.name;
    } else if (sortBy === "name-desc") {
      orderByClause = desc(pendingProviders.name);
    } else if (sortBy === "date-newest") {
      orderByClause = desc(pendingProviders.createdAt);
    } else if (sortBy === "date-oldest") {
      orderByClause = pendingProviders.createdAt;
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

  async approvePendingProvider(id: number, approvedBy?: string): Promise<void> {
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
      await this.createProvider({
        userId,
        serviceName: pp.serviceName,
        description: pp.description || null,
        hashtags: (pp.hashtags as string[]) || [],
        radiusKm: pp.radiusKm || 10,
        approxCharge: pp.approxCharge || null,
        mobileNumbers: (pp.mobileNumbers as string[]) || [],
        latitude: pp.latitude || null,
        longitude: pp.longitude || null,
        address: pp.address || null,
        isActive: true,
        isHidden: pp.isHidden || false,
        name: pp.name,
        mobile: phone || null,
        profilePhoto: pp.profilePhoto || null,
        addedBy: pp.addedBy || "coadmin",
        approvedBy: approvedBy || null,
      });
    }

    await this.updatePendingProviderStatus(id, "approved");
    // Track approve in salary cycle
    if (approvedBy) await this.incrementCycleStat(approvedBy, "approve");
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

  async createJob(data: { userId: string; jobName: string; description: string; location: string; state?: string; district?: string; salary?: string; workHours?: string; numEmployees?: string; contactPhone: string }): Promise<Job> {
    const [job] = await db.insert(jobs).values(data).returning();
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

  async deleteJob(jobId: number, userId: string): Promise<void> {
    await db.update(jobs).set({ isActive: false }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  }

  async adminUpdateJob(jobId: number, updates: { jobName?: string; description?: string; location?: string; salary?: string; workHours?: string; contactPhone?: string; isActive?: boolean }): Promise<Job | undefined> {
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
      pendingMobiles = new Set(existingPending.map(r => r.mobile).filter(Boolean));

      // 2. Fetch all registered user phones (one query)
      const existingUsers = await db.select({ phone: localUsers.phone }).from(localUsers);
      userPhones = new Set(existingUsers.map(r => r.phone).filter(Boolean));
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
        serviceName: "",
        addedBy: rec.addedBy,
        status: "pending" as const,
      }));
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

  async bulkCreateMetaLeads(records: Array<{ name: string; mobile: string; serviceName?: string; address?: string; description?: string }>, assignedTo: string, allowDuplicate = false): Promise<{ imported: number; skipped: number; total: number }> {
    const total = records.length;

    let pendingMobiles = new Set<string>();
    let userPhones = new Set<string>();
    if (!allowDuplicate) {
      const existingPending = await db.select({ mobile: pendingProviders.mobile }).from(pendingProviders);
      pendingMobiles = new Set(existingPending.map(r => r.mobile).filter(Boolean));

      const existingUsers = await db.select({ phone: localUsers.phone }).from(localUsers);
      userPhones = new Set(existingUsers.map(r => r.phone).filter(Boolean));
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
    const duplicateEntries = [...byMobile.entries()].filter(([_, profs]) => {
      const uniqueUserIds = new Set(profs.map(p => p.userId));
      return uniqueUserIds.size > 1;
    });
    if (duplicateEntries.length === 0) return [];

    // 2. Gather all userIds involved
    const allUserIds = [...new Set(duplicateEntries.flatMap(([_, profs]) => profs.map(p => p.userId)))];

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
      const uniqueProfiles = profs.filter(p => { if (seenIds.has(p.userId)) return false; seenIds.add(p.userId); return true; });
      const enriched = uniqueProfiles.map(p => {
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
      enriched.sort((a, b) => b.completenessScore - a.completenessScore);
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
}

export const storage = new DatabaseStorage();
