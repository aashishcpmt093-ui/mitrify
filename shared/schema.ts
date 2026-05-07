import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, serial, real, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const localUsers = pgTable("local_users", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique().default(sql`gen_random_uuid()`),
  phone: varchar("phone", { length: 20 }).unique(),
  email: varchar("email", { length: 255 }).unique(),
  username: varchar("username", { length: 100 }).unique(),
  password: varchar("password", { length: 255 }),
  role: varchar("role", { length: 20 }).notNull().default("customer"),
  authMethod: varchar("auth_method", { length: 20 }).notNull().default("password"),
  isBlocked: boolean("is_blocked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLocalUserSchema = createInsertSchema(localUsers).omit({ id: true, createdAt: true, userId: true });
export type LocalUser = typeof localUsers.$inferSelect;
export type InsertLocalUser = z.infer<typeof insertLocalUserSchema>;

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("customer"),
  name: varchar("name", { length: 255 }).notNull(),
  mobile: varchar("mobile", { length: 20 }),
  isBlocked: boolean("is_blocked").default(false),
  promoCode: varchar("promo_code", { length: 20 }).unique(),
  referredBy: varchar("referred_by", { length: 20 }),
  latitude: real("latitude"),
  longitude: real("longitude"),
  acceptDoubleCharge: boolean("accept_double_charge").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("profiles_user_role_idx").on(table.userId, table.role),
]);

export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  description: text("description"),
  hashtags: text("hashtags").array(),
  radiusKm: integer("radius_km").default(10),
  approxCharge: varchar("approx_charge", { length: 100 }),
  mobileNumbers: text("mobile_numbers").array().notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  address: text("address"),
  state: varchar("state", { length: 100 }),
  district: varchar("district", { length: 100 }),
  pinCode: varchar("pin_code", { length: 10 }),
  profilePhoto: text("profile_photo"),
  isActive: boolean("is_active").default(true),
  isHidden: boolean("is_hidden").default(false),
  profileVisibility: varchar("profile_visibility", { length: 20 }).default("public"),
  addedBy: varchar("added_by", { length: 100 }).default("self"),
  approvedBy: varchar("approved_by", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const calls = pgTable("calls", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull(),
  providerId: varchar("provider_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  duration: integer("duration").default(0),
  paymentStatus: varchar("payment_status", { length: 20 }).default("free"),
  chargeReason: varchar("charge_reason", { length: 30 }).default("normal"),
  creditsCharged: integer("credits_charged").default(1),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  // "boost" | "pro" | "premium"
  plan: varchar("plan", { length: 20 }).notNull(),
  // "monthly" | "yearly" | "custom" (admin-granted custom durations)
  billingCycle: varchar("billing_cycle", { length: 20 }).notNull().default("monthly"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date").notNull(),
  // null when admin-granted (no payment), otherwise Cashfree order_id
  paymentId: varchar("payment_id", { length: 255 }),
  // Amount in INR (integer rupees) actually paid; 0 for admin grants.
  amount: integer("amount").notNull().default(0),
  // "active" | "expired" | "cancelled"
  status: varchar("status", { length: 20 }).notNull().default("active"),
  // userId of the admin who granted this subscription (or null for paid)
  grantedBy: varchar("granted_by", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("subs_user_idx").on(table.userId),
  index("subs_active_idx").on(table.userId, table.status, table.endDate),
  // Partial unique index on payment_id (NULLs excluded) makes Cashfree
  // order_id idempotency race-safe at the DB level: two concurrent
  // verify-payment calls cannot both insert a row for the same order.
  uniqueIndex("subs_payment_id_unique").on(table.paymentId).where(sql`${table.paymentId} IS NOT NULL`),
]);

export const credits = pgTable("credits", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  freeCredits: integer("free_credits").default(5),
  purchasedCredits: integer("purchased_credits").default(0),
  lastFreeReset: timestamp("last_free_reset").defaultNow(),
  creditsFrozen: boolean("credits_frozen").default(false),
}, (table) => [
  uniqueIndex("credits_user_role_idx").on(table.userId, table.role),
]);

export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  ownerId: varchar("owner_id"),
  usageCount: integer("usage_count").default(0),
  isActive: boolean("is_active").default(true),
  type: varchar("type", { length: 20 }).default("admin"),
  creditAmount: integer("credit_amount").default(25),
  createdAt: timestamp("created_at").defaultNow(),
});

export const siteContent = pgTable("site_content", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 50 }).notNull().unique(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SiteContent = typeof siteContent.$inferSelect;

export const appNotifications = pgTable("app_notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).notNull().default("info"),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAppNotificationSchema = createInsertSchema(appNotifications).omit({ id: true, createdAt: true });
export type AppNotification = typeof appNotifications.$inferSelect;
export type InsertAppNotification = z.infer<typeof insertAppNotificationSchema>;

export const coAdmins = pgTable("co_admins", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("coadmin"),
  isActive: boolean("is_active").default(true),
  callCount: integer("call_count").default(0).notNull(),
  cycleEntryCount: integer("cycle_entry_count").default(0).notNull(),
  cycleApproveCount: integer("cycle_approve_count").default(0).notNull(),
  cycleRejectCount: integer("cycle_reject_count").default(0).notNull(),
  cycleCallCount: integer("cycle_call_count").default(0).notNull(),
  cycleStartAt: timestamp("cycle_start_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const salaryPayments = pgTable("salary_payments", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull(),
  entryCount: integer("entry_count").default(0).notNull(),
  approveCount: integer("approve_count").default(0).notNull(),
  rejectCount: integer("reject_count").default(0).notNull(),
  callCount: integer("call_count").default(0).notNull(),
  totalActions: integer("total_actions").default(0).notNull(),
  ratePerAction: integer("rate_per_action").default(3).notNull(),
  totalAmount: integer("total_amount").default(0).notNull(),
  cycleStart: timestamp("cycle_start"),
  cycleEnd: timestamp("cycle_end").defaultNow(),
  paidByAdmin: varchar("paid_by_admin", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SalaryPayment = typeof salaryPayments.$inferSelect;

export const creditPayments = pgTable("credit_payments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  orderId: varchar("order_id", { length: 255 }).notNull().unique(),
  credits: integer("credits").notNull(),
  amount: integer("amount").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CreditPayment = typeof creditPayments.$inferSelect;

export const insertCoAdminSchema = createInsertSchema(coAdmins).omit({ id: true, createdAt: true });
export type CoAdmin = typeof coAdmins.$inferSelect;
export type InsertCoAdmin = z.infer<typeof insertCoAdminSchema>;

export const pendingProviders = pgTable("pending_providers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  description: text("description"),
  mobile: varchar("mobile", { length: 20 }),
  mobileNumbers: jsonb("mobile_numbers").$type<string[]>().default([]),
  hashtags: jsonb("hashtags").$type<string[]>().default([]),
  address: text("address"),
  state: varchar("state", { length: 100 }),
  district: varchar("district", { length: 100 }),
  latitude: real("latitude"),
  longitude: real("longitude"),
  radiusKm: integer("radius_km").default(10),
  approxCharge: varchar("approx_charge", { length: 100 }),
  profilePhoto: text("profile_photo"),
  isHidden: boolean("is_hidden").default(false),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  addedBy: varchar("added_by", { length: 100 }).notNull(),
  verifiedBy: varchar("verified_by", { length: 100 }),
  groupLabel: varchar("group_label", { length: 5 }),
  source: varchar("source", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPendingProviderSchema = createInsertSchema(pendingProviders).omit({ id: true, createdAt: true, status: true });
export type PendingProvider = typeof pendingProviders.$inferSelect;
export type InsertPendingProvider = z.infer<typeof insertPendingProviderSchema>;

export const profilesRelations = relations(profiles, ({ one }) => ({}));
export const providersRelations = relations(providers, ({ one }) => ({}));

export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true, createdAt: true });
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true, createdAt: true });
export const insertCallSchema = createInsertSchema(calls).omit({ id: true, timestamp: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, startDate: true, createdAt: true });
export const insertCreditSchema = createInsertSchema(credits).omit({ id: true, lastFreeReset: true });
export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({ id: true, createdAt: true, usageCount: true });
export const insertCreditPaymentSchema = createInsertSchema(creditPayments).omit({ id: true, createdAt: true });

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Provider = typeof providers.$inferSelect;
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Call = typeof calls.$inferSelect;
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Credit = typeof credits.$inferSelect;
export type InsertCredit = z.infer<typeof insertCreditSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type InsertCreditPayment = z.infer<typeof insertCreditPaymentSchema>;

export type CreateProfileRequest = InsertProfile;
export type UpdateProfileRequest = Partial<InsertProfile>;
export type CreateProviderRequest = InsertProvider;
export type UpdateProviderRequest = Partial<InsertProvider>;
export type CreateCallRequest = InsertCall;
export type CreateSubscriptionRequest = InsertSubscription;

export type ProfileResponse = Profile;
export type ProviderResponse = Provider;
export type CallResponse = Call;
export type SubscriptionResponse = Subscription;
export type PromoCodeResponse = PromoCode;

// Subscription plan tier — also used to rank search results.
// "none" means the provider has no active paid plan.
export type SubscriptionPlan = "none" | "boost" | "pro" | "premium";

export interface ProviderSearchResult {
  provider: Provider;
  profile: Profile;
  distanceKm: number | null;
  // True when distanceKm was estimated from the provider's city/district
  // (because the provider has no exact GPS coordinates) instead of measured
  // from real lat/lng. Lets the UI label the value as approximate.
  distanceApprox?: boolean;
  // Best-effort city extracted from the provider's address (first chunk
  // before a comma). Shown in results for providers without exact location.
  city?: string | null;
  canCall: boolean;
  contactHidden: boolean;
  // True when this provider has zero credits left. Customer UI uses this to
  // show a red "double charge" call button + warning dialog before dialing.
  providerLowBalance?: boolean;
  // Active subscription plan of this provider (for tick badges + ranking).
  plan?: SubscriptionPlan;
}

// Config row stored in `site_content` under key "subscription_plans".
// All amounts are integer rupees (₹).
export interface SubscriptionPlanConfig {
  boost: { monthly: number; yearly: number; perks: string[] };
  pro: { monthly: number; yearly: number; perks: string[] };
  premium: { monthly: number; yearly: number; perks: string[] };
}

export const DEFAULT_SUBSCRIPTION_PLAN_CONFIG: SubscriptionPlanConfig = {
  boost: {
    monthly: 99,
    yearly: 999,
    perks: [
      "Listing pinned above non-subscribers in search",
      "White verified-style tick badge next to your name",
    ],
  },
  pro: {
    monthly: 199,
    yearly: 1999,
    perks: [
      "All Boost perks",
      "0 credits charged when receiving calls",
      "Yellow verified-style tick badge",
      "Always reachable, no daily call cap",
    ],
  },
  premium: {
    monthly: 499,
    yearly: 4999,
    perks: [
      "All Pro perks",
      "Free Call: customers pay 0 credits to call you",
      "Free outgoing calls — your side is always 0",
      "Top of search results, green tick badge",
    ],
  },
};

export interface AdminStats {
  totalCustomers: number;
  totalProviders: number;
  totalCalls: number;
  dailyRevenue: number;
  monthlyRevenue: number;
  subscriptionRevenue: number;
}

export interface CallLog {
  id: number;
  customerName: string;
  providerName: string;
  serviceName: string;
  timestamp: Date | null;
  duration: number | null;
  paymentStatus: string | null;
  chargeReason?: string | null;
  creditsCharged?: number | null;
}

export const promoUsageLog = pgTable("promo_usage_log", {
  id: serial("id").primaryKey(),
  promoCode: varchar("promo_code", { length: 50 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  usedAt: timestamp("used_at").defaultNow(),
});

export const visitorStats = pgTable("visitor_stats", {
  id: serial("id").primaryKey(),
  date: varchar("date", { length: 10 }).notNull().unique(),
  count: integer("count").default(0).notNull(),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  jobName: varchar("job_name", { length: 200 }).notNull(),
  description: text("description").notNull(),
  location: varchar("location", { length: 300 }).notNull(),
  state: varchar("state", { length: 100 }),
  district: varchar("district", { length: 100 }),
  workType: varchar("work_type", { length: 50 }).default("field"),
  salary: varchar("salary", { length: 100 }),
  workHours: varchar("work_hours", { length: 100 }),
  numEmployees: varchar("num_employees", { length: 50 }),
  contactPhone: varchar("contact_phone", { length: 20 }),
  postType: varchar("post_type", { length: 20 }).default("mitrify").notNull(),
  googleFormUrl: text("google_form_url"),
  isActive: boolean("is_active").default(true).notNull(),
  lowCredit: boolean("low_credit").default(false).notNull(),
  applyClicks: integer("apply_clicks").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Job = typeof jobs.$inferSelect;

// Google Form URL: only forms.gle/* or docs.google.com/forms/* are allowed.
export const GOOGLE_FORM_URL_REGEX = /^https?:\/\/(forms\.gle\/[^\s]+|docs\.google\.com\/forms\/[^\s]+)$/i;

const baseJobFields = {
  jobName: z.string().trim().min(1, "Job name required"),
  description: z.string().trim().min(1, "Description required"),
  state: z.string().trim().min(1, "State required"),
  district: z.string().trim().min(1, "District required"),
  location: z.string().trim().optional().default(""),
  contactPhone: z.string().trim().optional().default(""),
};

export const insertJobSchema = z.discriminatedUnion("postType", [
  z.object({
    postType: z.literal("mitrify"),
    ...baseJobFields,
    workType: z.string().optional().default("field"),
    salary: z.string().optional().default(""),
    workHours: z.string().optional().default(""),
    numEmployees: z.string().trim().min(1, "Kitne log chahiye field required hai"),
    contactPhone: z.string().trim().min(1, "Contact number required"),
  }),
  z.object({
    postType: z.literal("google_form"),
    ...baseJobFields,
    googleFormUrl: z.string().trim().regex(GOOGLE_FORM_URL_REGEX, "Sirf Google Form ka link allowed hai"),
  }),
]);

export type InsertJob = z.infer<typeof insertJobSchema>;

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  coAdminId: integer("co_admin_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  post: varchar("post", { length: 255 }).notNull(),
  education: varchar("education", { length: 255 }),
  description: text("description"),
  profilePhoto: text("profile_photo"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, createdAt: true, updatedAt: true });
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;

export const searchLog = pgTable("search_log", {
  id: serial("id").primaryKey(),
  query: varchar("query", { length: 255 }).notNull(),
  count: integer("count").notNull().default(1),
  lastSearched: timestamp("last_searched").defaultNow(),
});

export type SearchLog = typeof searchLog.$inferSelect;
export const insertSearchLogSchema = createInsertSchema(searchLog).omit({ id: true, lastSearched: true });
export type InsertSearchLog = z.infer<typeof insertSearchLogSchema>;

export interface AiErrorBreakdown {
  rateLimited: number;
  maxTokens: number;
  parseFail: number;
  httpError: number;
  networkError: number;
  other: number;
}

export const EMPTY_AI_ERROR_BREAKDOWN: AiErrorBreakdown = {
  rateLimited: 0,
  maxTokens: 0,
  parseFail: 0,
  httpError: 0,
  networkError: 0,
  other: 0,
};

export const tagJobs = pgTable("tag_jobs", {
  jobId: varchar("job_id", { length: 32 }).primaryKey(),
  total: integer("total").notNull().default(0),
  processed: integer("processed").notNull().default(0),
  fromDict: integer("from_dict").notNull().default(0),
  fromAi: integer("from_ai").notNull().default(0),
  fromHybrid: integer("from_hybrid").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  aiErrors: integer("ai_errors").notNull().default(0),
  done: boolean("done").notNull().default(false),
  dryRun: boolean("dry_run").notNull().default(false),
  geminiAvailable: boolean("gemini_available").notNull().default(false),
  errorSample: jsonb("error_sample").$type<string[]>().default([]),
  aiErrorSample: jsonb("ai_error_sample").$type<string[]>().default([]),
  aiErrorBreakdown: jsonb("ai_error_breakdown").$type<AiErrorBreakdown>().default({
    rateLimited: 0,
    maxTokens: 0,
    parseFail: 0,
    httpError: 0,
    networkError: 0,
    other: 0,
  }),
  // Provider userIds that failed during the run, split by failure source so
  // a "retry failed only" pass can re-run just the AI-error and
  // worker-error buckets without re-hitting Gemini for the providers that
  // already succeeded. Both default to [] for backward-compat with rows
  // written before this column existed.
  aiFailedUserIds: jsonb("ai_failed_user_ids").$type<string[]>().default([]),
  workerFailedUserIds: jsonb("worker_failed_user_ids").$type<string[]>().default([]),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type TagJob = typeof tagJobs.$inferSelect;

// Audit/replay log of completed Google Places admin bulk-fetch runs.
// Counts only — full `places` arrays are never persisted (privacy + size).
// Used by the admin Google Places card to show last-10 history with
// click-to-replay (copies city + service back into the inputs).
export const googlePlacesRuns = pgTable("google_places_runs", {
  id: serial("id").primaryKey(),
  city: text("city").notNull(),
  service: text("service").notNull(),
  target: integer("target").notNull().default(0),
  uniqueCount: integer("unique_count").notNull().default(0),
  dupSkipped: integer("dup_skipped").notNull().default(0),
  apiCalls: integer("api_calls").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at").notNull(),
  cancelled: boolean("cancelled").notNull().default(false),
  error: text("error"),
  stoppedBy: text("stopped_by"),
}, (t) => ({
  startedAtIdx: index("gp_runs_started_at_idx").on(t.startedAt),
}));

export type GooglePlacesRun = typeof googlePlacesRuns.$inferSelect;
export const insertGooglePlacesRunSchema = createInsertSchema(googlePlacesRuns).omit({ id: true });
export type InsertGooglePlacesRun = z.infer<typeof insertGooglePlacesRunSchema>;

export const NO_ALERT_NEEDED_MESSAGE = "No alert needed (backup succeeded)";

// Persisted AI token usage — one row per Gemini call, used to survive restarts.
export const aiTokenUsage = pgTable("ai_token_usage", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts").notNull().defaultNow(),
  tokens: integer("tokens").notNull(),
}, (t) => ({
  tsIdx: index("ai_token_usage_ts_idx").on(t.ts),
}));

export type AiTokenUsage = typeof aiTokenUsage.$inferSelect;

// Log of each weekly AI cost report email attempt (sent or failed).
export const aiReportLog = pgTable("ai_report_log", {
  id: serial("id").primaryKey(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  recipient: text("recipient").notNull(),
  success: boolean("success").notNull(),
  totalTokens: integer("total_tokens").notNull().default(0),
  estimatedCost: text("estimated_cost").notNull().default(""),
  peakTokens: integer("peak_tokens").notNull().default(0),
  exceededHours: integer("exceeded_hours").notNull().default(0),
  errorMsg: text("error_msg"),
}, (t) => ({
  sentAtIdx: index("ai_report_log_sent_at_idx").on(t.sentAt),
}));

export type AiReportLog = typeof aiReportLog.$inferSelect;
export const insertAiReportLogSchema = createInsertSchema(aiReportLog).omit({ id: true });
export type InsertAiReportLog = z.infer<typeof insertAiReportLogSchema>;
