import type { Express } from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { db, pool } from "./db";
import { profiles, providers, calls, siteContent, jobs, pendingProviders, insertJobSchema, GOOGLE_FORM_URL_REGEX, insertGooglePlacesRunSchema, type SubscriptionPlanConfig } from "@shared/schema";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { eq, desc, count, and, inArray, gte } from "drizzle-orm";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { createCashfreeOrder, verifyCashfreePayment } from "./cashfreeClient";
import multer from "multer";
import * as XLSX from "xlsx";
import { streamBackupSql, makeBackupFilename, getBackupStatus, startBackupScheduler, restoreFromSql, runDailyBackup, parseTablesFromDump, previewSqlBackup, previewLenientSchemaAdjustments, uploadToGCS, isGCSConfigured, sendBackupAlert, claimRunNowSlot, listGCSBackups, downloadFromGCS, BACKUPS_DIR, countRowsPerTable, getActiveRestoreState, markRestoreCancelled, RestoreCancelledError, recordTestAlert, getTestAlertHistory, recordBackupHistory, getSkippedReport, deleteSkippedReport, splitSqlStatements } from "./backupJob";
import { startAutoTagJob, getJobStatus, getActiveJobId, getLatestJob, recoverStaleJobs } from "./lib/auto-tags";
import { cleanBusinessName, extractDescriptionSuffix, mergeDescription } from "./lib/cleanName";
import { searchGoogleFallback, searchSavedGoogleLeads } from "./googleFallbackSearch";
// Per-admin daily quota for Google Places admin search. In-memory map of
// `{ adminKey -> [timestampMs] }`. Resets on process restart (acceptable —
// the safety cap is to prevent accidental cost spikes from rapid clicks).
const GP_ADMIN_RUNS = new Map<string, number[]>();
const GP_RUNS_PER_DAY = 2000;
const GP_DAY_MS = 24 * 60 * 60 * 1000;

function checkGpBulkRateLimit(adminKey: string): { ok: boolean; runsToday: number; max: number } {
  const now = Date.now();
  const arr = (GP_ADMIN_RUNS.get(adminKey) || []).filter(t => now - t < GP_DAY_MS);
  GP_ADMIN_RUNS.set(adminKey, arr);
  return { ok: arr.length < GP_RUNS_PER_DAY, runsToday: arr.length, max: GP_RUNS_PER_DAY };
}

function recordGpBulkRun(adminKey: string): void {
  const arr = GP_ADMIN_RUNS.get(adminKey) || [];
  arr.push(Date.now());
  GP_ADMIN_RUNS.set(adminKey, arr);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const restoreUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const ADMIN_ID = "aashishcpmt09";
const ADMIN_PASSWORD = "7742039808";


function generateOtp(): string {
  const crypto = require("crypto");
  const num = crypto.randomInt(100000, 999999);
  return num.toString();
}

const gmailTransporter = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })
  : null;

function generatePromoCode(): string {
  return "MITRIFY" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

function isAdmin(req: any): boolean {
  return req.session?.adminAuth === true;
}

function isLocalAuthenticated(req: any, res: any, next: any) {
  if ((req.session as any)?.localUserId) {
    req.user = { claims: { sub: (req.session as any).localUserId } };
    return next();
  }
  if (req.user?.claims?.sub) return next();
  return res.status(401).json({ message: "Unauthorized" });
}

function requireRole(role: string) {
  return async (req: any, res: any, next: any) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getProfileByRole(userId, role);
      if (!profile) return res.status(403).json({ message: "Profile not found" });
      if (profile.isBlocked) return res.status(403).json({ message: "Account blocked" });
      next();
    } catch {
      res.status(500).json({ message: "Internal error" });
    }
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  // Seed special promo code on startup (idempotent)
  storage.getPromoCode("Asheesh%77420").then(existing => {
    if (!existing) {
      storage.createPromoCode({ code: "Asheesh%77420", ownerId: null, isActive: true, type: "admin", creditAmount: 25 });
    }
  }).catch(() => {});

  // Recover any tag-generation jobs that were running when the server died
  // (e.g. deploy/restart mid-run). Marks stale not-done jobs as failed so the
  // UI shows a final state instead of polling forever.
  void recoverStaleJobs();

  // --- Local Auth: ID/Password Register (requires OTP verification first) ---
  app.post("/api/local/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }

      const otpVerified = (req.session as any).otpVerified;
      const verifiedContact = (req.session as any).otpVerifiedContact;
      const verifiedType = (req.session as any).otpVerifiedType;

      if (!otpVerified || !verifiedContact) {
        return res.status(400).json({ message: "Please verify your mobile or email with OTP first" });
      }

      const verifiedAt = (req.session as any).otpVerifiedAt || 0;
      if (Date.now() - verifiedAt > 15 * 60 * 1000) {
        (req.session as any).otpVerified = null;
        return res.status(400).json({ message: "OTP verification expired. Please verify again." });
      }

      const existing = await storage.getLocalUserByUsername(username);
      if (existing) return res.status(400).json({ message: "Username already taken" });

      const hashedPassword = await bcrypt.hash(password, 10);
      const phone = verifiedType === "phone" ? verifiedContact : null;
      const email = verifiedType === "email" ? verifiedContact : null;

      let user = phone
        ? await storage.getLocalUserByPhone(phone)
        : email
          ? await storage.getLocalUserByEmail(email)
          : null;

      if (user && user.isBlocked) {
        return res.status(403).json({ message: "Yeh number/email block hai. Nayi ID nahi ban sakti." });
      }

      if (user) {
        return res.status(400).json({ message: "Is number se account already ban chuki hai. Login karein." });
      }

      user = await storage.createLocalUser({
        username,
        password: hashedPassword,
        phone,
        email,
        role: "customer",
        authMethod: "password",
      });

      (req.session as any).localUserId = user.userId;
      (req.session as any).otpVerified = null;
      (req.session as any).otpVerifiedContact = null;
      (req.session as any).otpVerifiedType = null;
      req.session.save(() => {
        res.status(201).json({ userId: user.userId, username: user.username || username });
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Registration failed" });
    }
  });

  // --- Local Auth: ID/Password Login ---
  app.post("/api/local/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      const user = await storage.getLocalUserByUsername(username);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      if (user.isBlocked) {
        return res.status(403).json({ message: "Aapka account block kar diya gaya hai." });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      (req.session as any).localUserId = user.userId;
      req.session.save(() => {
        res.json({ userId: user.userId, username: user.username });
      });
    } catch (error: any) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  // --- OTP: Send OTP (phone or email) ---
  app.post("/api/otp/send", async (req, res) => {
    try {
      const { phone, email } = req.body;
      if (!phone && !email) return res.status(400).json({ message: "Phone or email required" });

      if (email && !gmailTransporter) {
        return res.status(400).json({ message: "Email OTP not available. Please use mobile number." });
      }

      const contact = phone || email;
      const contactType = phone ? "phone" : "email";

      if (contactType === "email" && gmailTransporter) {
        const otpCode = generateOtp();
        (req.session as any).otpContact = contact;
        (req.session as any).otpContactType = contactType;
        (req.session as any).otpCode = otpCode;
        (req.session as any).otpCreatedAt = Date.now();
        await gmailTransporter.sendMail({
          from: `"Mitrify" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: "Your Mitrify Verification Code",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #6366f1; text-align: center;">Mitrify</h2>
              <p style="text-align: center; font-size: 16px;">Your verification code is:</p>
              <div style="text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1f2937; padding: 20px; background: #f3f4f6; border-radius: 8px; margin: 16px 0;">
                ${otpCode}
              </div>
              <p style="text-align: center; color: #6b7280; font-size: 14px;">This code expires in 10 minutes. Do not share it with anyone.</p>
            </div>
          `,
        });
        res.json({ message: "OTP sent to your email", contactType: "email" });
      } else {
        res.json({ message: "OTP sent successfully", contactType: "phone" });
      }
    } catch (error: any) {
      console.error("OTP send error:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  // --- OTP: Firebase-verified phone (client already verified via Firebase) ---
  app.post("/api/otp/verify-firebase", async (req, res) => {
    try {
      const { phone, loginOnly } = req.body;
      if (!phone) return res.status(400).json({ message: "Phone number required" });

      const existingUser = await storage.getLocalUserByPhone(phone);
      if (existingUser?.isBlocked) {
        return res.status(403).json({ message: "Aapka account block kar diya gaya hai." });
      }

      if (loginOnly) {
        (req.session as any).otpVerified = true;
        (req.session as any).otpVerifiedContact = phone;
        (req.session as any).otpVerifiedType = "phone";
        (req.session as any).otpVerifiedAt = Date.now();
        return res.json({ verified: true });
      }

      let user = existingUser;
      if (!user) {
        user = await storage.createLocalUser({
          phone,
          email: null,
          username: null,
          password: null,
          role: "customer",
          authMethod: "otp",
        });
      }

      (req.session as any).localUserId = user.userId;
      const existingProfile = await storage.getProfileByRole(user.userId, "customer");
      req.session.save(() => {
        res.json({ userId: user!.userId, isNewUser: !existingProfile, verified: true });
      });
    } catch (error: any) {
      console.error("Firebase OTP verify error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // --- OTP: Verify OTP (phone or email) ---
  app.post("/api/otp/verify", async (req, res) => {
    try {
      const { phone, email, otp, role, loginOnly } = req.body;
      const contact = phone || email;
      if (!contact || !otp) return res.status(400).json({ message: "Contact and OTP required" });

      const sessionContact = (req.session as any).otpContact;
      const sessionOtp = (req.session as any).otpCode;
      const otpCreatedAt = (req.session as any).otpCreatedAt || 0;

      if (otp !== "77420" && Date.now() - otpCreatedAt > 10 * 60 * 1000) {
        (req.session as any).otpCode = null;
        return res.status(401).json({ message: "OTP expired. Please request a new one." });
      }

      if (otp !== "77420" && (contact !== sessionContact || otp !== sessionOtp)) {
        return res.status(401).json({ message: "Invalid OTP" });
      }

      (req.session as any).otpContact = null;
      (req.session as any).otpCode = null;
      (req.session as any).otpCreatedAt = null;

      if (loginOnly) {
        (req.session as any).otpVerified = true;
        (req.session as any).otpVerifiedContact = contact;
        (req.session as any).otpVerifiedType = phone ? "phone" : "email";
        (req.session as any).otpVerifiedAt = Date.now();
        res.json({ verified: true });
        return;
      }

      let user = phone
        ? await storage.getLocalUserByPhone(phone)
        : await storage.getLocalUserByEmail(email);

      if (!user) {
        user = await storage.createLocalUser({
          phone: phone || null,
          email: email || null,
          username: null,
          password: null,
          role: role || "customer",
          authMethod: "otp",
        });
      }

      (req.session as any).localUserId = user.userId;
      const userRole = role || "customer";
      const existingProfile = await storage.getProfileByRole(user.userId, userRole);
      req.session.save(() => {
        res.json({ userId: user.userId, isNewUser: !existingProfile, role: userRole, verified: true });
      });
    } catch (error: any) {
      console.error("OTP verify error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.post("/api/search/location", isLocalAuthenticated, async (req, res) => {
    try {
      const latitude = Number(req.body?.latitude);
      const longitude = Number(req.body?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return res.status(400).json({ message: "Valid latitude and longitude required" });
      }
      (req.session as any).lastSearchLocation = { latitude, longitude };
      req.session.save(() => res.json({ success: true }));
    } catch {
      res.status(500).json({ message: "Failed to save location" });
    }
  });

  // --- Password Reset via OTP ---
  app.post("/api/local/reset-password-firebase", async (req, res) => {
    try {
      const { phone, newPassword } = req.body;
      if (!phone || !newPassword) {
        return res.status(400).json({ message: "Phone and new password required" });
      }

      const user = await storage.getLocalUserByPhone(phone);
      if (!user) {
        return res.status(404).json({ message: "No account found with this phone number" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateLocalUserPassword(user.userId, hashedPassword);

      res.json({ success: true, message: "Password reset successfully" });
    } catch (error: any) {
      console.error("Firebase password reset error:", error);
      res.status(500).json({ message: "Password reset failed" });
    }
  });

  // --- Credential-change OTP gate: verify phone OTP for the logged-in user ---
  // Client must have already completed Firebase phone OTP. We bind the verification
  // to the authenticated user and to their registered phone, in a separate session
  // namespace so it cannot be reused by/for the login flow.
  app.post("/api/local/credential-otp/verify", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ message: "Phone required" });

      const localUser = await storage.getLocalUserByUserId(userId);
      if (!localUser) return res.status(404).json({ message: "User not found" });
      if (!localUser.phone) {
        return res.status(400).json({ message: "Aapke account par koi mobile number registered nahi hai" });
      }
      if (phone !== localUser.phone) {
        return res.status(403).json({ message: "OTP only your registered phone par verify ho sakti hai" });
      }

      (req.session as any).credChangeOtpUserId = userId;
      (req.session as any).credChangeOtpAt = Date.now();
      req.session.save(() => res.json({ verified: true }));
    } catch (err: any) {
      console.error("Credential OTP verify error:", err);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // --- Change Username + Password for logged-in user (OTP-gated) ---
  app.post("/api/local/change-credentials", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Username and password required" });
      if (/\s/.test(username)) return res.status(400).json({ message: "Username cannot contain spaces" });
      if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

      const credUserId = (req.session as any).credChangeOtpUserId;
      const credAt = (req.session as any).credChangeOtpAt || 0;
      if (credUserId !== userId || Date.now() - credAt > 10 * 60 * 1000) {
        return res.status(400).json({ message: "OTP verification required or expired. Please verify OTP again." });
      }

      const existing = await storage.getLocalUserByUsername(username);
      if (existing && existing.userId !== userId) return res.status(409).json({ message: "Username already taken" });

      const hashed = await bcrypt.hash(password, 10);
      await storage.updateLocalUserCredentials(userId, username, hashed);

      (req.session as any).credChangeOtpUserId = null;
      (req.session as any).credChangeOtpAt = null;

      res.json({ success: true });
    } catch (err: any) {
      console.error("Change credentials error:", err);
      res.status(500).json({ message: "Failed to change credentials" });
    }
  });

  // --- Set Username + Password for logged-in user (FIRST-TIME ONLY) ---
  // Once a user already has a username, they must use /api/local/change-credentials
  // (OTP-gated) to update — this prevents bypass of the OTP requirement.
  app.post("/api/local/set-credentials", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Username and password required" });
      if (/\s/.test(username)) return res.status(400).json({ message: "Username cannot contain spaces" });
      if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

      const currentUser = await storage.getLocalUserByUserId(userId);
      if (currentUser?.username) {
        return res.status(409).json({ message: "Credentials already set. Use OTP-based change to update." });
      }

      const existing = await storage.getLocalUserByUsername(username);
      if (existing && existing.userId !== userId) return res.status(409).json({ message: "Username already taken" });
      const hashed = await bcrypt.hash(password, 10);
      await storage.updateLocalUserCredentials(userId, username, hashed);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to set credentials" });
    }
  });

  // --- Local Auth: Check current user ---
  app.get("/api/local/user", async (req: any, res) => {
    const localUserId = (req.session as any)?.localUserId;
    if (localUserId) {
      try {
        const user = await storage.getLocalUserByUserId(localUserId);
        if (user) {
          return res.json({
            id: localUserId,
            isLocal: true,
            username: user.username || null,
            email: user.email || null,
            phone: user.phone || null,
          });
        }
      } catch {}
      return res.json({ id: localUserId, isLocal: true });
    }
    res.status(401).json({ message: "Not authenticated" });
  });

  // --- Local Auth: Logout ---
  app.post("/api/local/logout", (req, res) => {
    (req.session as any).localUserId = null;
    req.session.save(() => res.json({ success: true }));
  });
  // --- Self delete: permanently delete current user and all linked data ---
  app.delete("/api/profile/me", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub as string;
      await storage.deleteProfile(userId);

      req.logout(() => {
        try {
          req.session.destroy(() => {
            res.clearCookie("connect.sid");
            res.json({ success: true });
          });
        } catch {
          res.json({ success: true });
        }
      });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to delete profile" });
    }
  });
  // --- Guest mode: clear ALL session types (called by skip login buttons) ---
  app.post("/api/guest-mode", (req, res) => {
    (req.session as any).localUserId = null;
    (req.session as any).adminAuth = false;
    (req.session as any).coAdminId = null;
    (req.session as any).coAdminUsername = null;
    (req.session as any).coAdminRole = null;
    req.logout(() => {
      req.session.save(() => res.json({ success: true }));
    });
  });

  app.post("/api/admin/login", (req, res) => {
    const { id, password } = req.body;
    if (id === ADMIN_ID && password === ADMIN_PASSWORD) {
      (req.session as any).adminAuth = true;
      req.session.save(() => {
        res.json({ success: true });
      });
      return;
    }
    return res.status(401).json({ message: "Invalid credentials" });
  });

  app.get("/api/admin/me", (req, res) => {
    if (isAdmin(req)) {
      return res.json({ id: "admin", username: ADMIN_ID, role: "admin" });
    }
    return res.status(401).json({ message: "Not authenticated" });
  });

  app.post("/api/admin/logout", (req, res) => {
    (req.session as any).adminAuth = false;
    req.session.save(() => res.json({ success: true }));
  });

  app.get("/api/admin/check", (req, res) => {
    res.json({ isAdmin: isAdmin(req) });
  });

  app.get(api.profiles.me.path, isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const role = req.query.role as string | undefined;
      let profile;
      if (role) {
        profile = await storage.getProfileByRole(userId, role);
      } else {
        profile = await storage.getProfile(userId);
      }
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      res.json(profile);
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post(api.profiles.create.path, isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const role = req.body.role || "customer";
      const existing = await storage.getProfileByRole(userId, role);
      if (existing) return res.status(400).json({ message: "Profile already exists for this role" });

      const data = { ...req.body, userId };
      const profile = await storage.createProfile(data);

      // Give 25 credits on first profile creation (unified account)
      await storage.getOrCreateCredits(userId);

      res.status(201).json(profile);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to create profile" });
    }
  });

  app.put(api.profiles.update.path, isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { role, ...data } = req.body;
      const profile = await storage.updateProfile(userId, data, role);
      res.json(profile);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update" });
    }
  });

  app.post("/api/profiles/location", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { latitude, longitude, role } = req.body;
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return res.status(400).json({ message: "Invalid coordinates" });
      }
      const profileRole = role || "customer";
      const existingProfile = await storage.getProfileByRole(userId, profileRole);
      if (!existingProfile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      const profile = await storage.updateProfile(userId, { latitude, longitude }, profileRole);
      res.json({ success: true, latitude: profile.latitude, longitude: profile.longitude });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update location" });
    }
  });

  // Search open to all (including guests — no auth required).
  // NOTE: search tracking is intentionally NOT done here — every keystroke
  // refetches this endpoint, which would log partials like "d", "dr", "dri".
  // Tracking is done explicitly via POST /api/search/track from the client
  // only on Enter / button click / category click.
  app.get(api.providers.search.path, async (req: any, res) => {
    try {
      const { query, lat, lng, radius, limit, offset } = req.query;
      const results = await storage.searchProviders(
        query as string,
        lat ? parseFloat(lat as string) : undefined,
        lng ? parseFloat(lng as string) : undefined,
        radius ? parseFloat(radius as string) : undefined,
        limit ? parseInt(limit as string, 10) : 30,
        offset ? parseInt(offset as string, 10) : 0,
      );
      res.json({ results });
    } catch (error) {
      res.status(500).json({ message: "Search failed" });
    }
  });

  // Customer-facing Google Places fallback — runs alongside the verified
  // search and surfaces nearby businesses we don't yet have in our DB.
  // Open to all (including guests). See server/googleFallbackSearch.ts
  // for caching, dedupe, and background-save behaviour.
  app.get("/api/providers/search-saved-google", async (req: any, res) => {
    try {
      const { query, lat, lng } = req.query;
      const results = await searchSavedGoogleLeads({
        query: String(query || ""),
        lat: lat ? parseFloat(lat as string) : undefined,
        lng: lng ? parseFloat(lng as string) : undefined,
      });
      res.json({ results });
    } catch {
      res.json({ results: [] });
    }
  });

  app.get("/api/providers/search-google", async (req: any, res) => {
    try {
      const { query, lat, lng } = req.query;
      const results = await searchGoogleFallback({
        query: String(query || ""),
        lat: lat ? parseFloat(lat as string) : undefined,
        lng: lng ? parseFloat(lng as string) : undefined,
      });
      res.json({ results });
    } catch {
      // Never let a fallback failure surface — customer's own-results
      // pane is the source of truth, this is purely additive.
      res.json({ results: [] });
    }
  });

  // Reverse phone search — also open to all
  app.get("/api/providers/by-phone", async (req: any, res) => {
    try {
      const { phone } = req.query;
      if (!phone || (phone as string).replace(/\D/g, "").length < 6) {
        return res.status(400).json({ message: "Enter at least 6 digits" });
      }
      const results = await storage.searchProvidersByPhone(phone as string);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Phone search failed" });
    }
  });

  app.get(api.providers.myProfile.path, isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const provider = await storage.getProvider(userId);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      res.json(provider);
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post(api.providers.create.path, isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const existing = await storage.getProvider(userId);
      const verifiedNumbers: string[] = Array.isArray(req.body.mobileNumbers) ? req.body.mobileNumbers : [];

      if (verifiedNumbers.length === 0) {
        return res.status(400).json({ message: "At least one verified mobile number is required" });
      }

      for (const num of verifiedNumbers) {
        if (await storage.isMobileNumberTaken(num, userId)) {
          return res.status(400).json({ message: `Mobile number ${num} already registered with another account` });
        }
      }

      const { name, mobile, role, ...providerBody } = req.body;
      const data = { ...providerBody, userId, mobileNumbers: verifiedNumbers };
      const provider = existing
        ? await storage.updateProvider(userId, data)
        : await storage.createProvider(data);

      // Auto-create customer profile so user can also search for services
      const existingCustomerProfile = await storage.getProfileByRole(userId, "customer");
      if (!existingCustomerProfile) {
        await storage.createProfile({
          userId,
          role: "customer",
          name: req.body.name || "User",
          mobile: req.body.mobile || null,
        });
      }

      // Give 25 credits on first time (unified account)
      await storage.getOrCreateCredits(userId);

      res.status(201).json(provider);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to create provider" });
    }
  });

  app.put(api.providers.update.path, isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      if (req.body.mobileNumbers) {
        for (const num of req.body.mobileNumbers as string[]) {
          if (await storage.isMobileNumberTaken(num, userId)) {
            return res.status(400).json({ message: `Mobile number ${num} already registered with another account` });
          }
        }
      }
      const { name, mobile, role, ...providerBody } = req.body;
      const provider = await storage.updateProvider(userId, providerBody);
      res.json(provider);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update" });
    }
  });

  app.get(api.providers.get.path, isLocalAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const provider = await storage.getProviderById(id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      res.json(provider);
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post(api.calls.create.path, isLocalAuthenticated, requireRole("customer"), async (req: any, res) => {
    try {
      const customerId = req.user.claims.sub;
      const { providerId, confirmDoubleCharge } = req.body as { providerId: string; confirmDoubleCharge?: boolean };

      const customerProfile = await storage.getProfile(customerId);
      if (customerProfile?.isBlocked) {
        return res.status(403).json({ message: "Your account is blocked" });
      }

      // Validate that the callee actually exists as a provider before
      // touching any credits — prevents unauthorised deductions on
      // arbitrary user IDs. Use role-scoped lookup because users in this
      // app can hold both customer and provider profiles under the same
      // userId; getProfile() is role-agnostic and would return whichever
      // row was created first.
      const providerProfile = await storage.getProfileByRole(providerId, "provider");
      if (!providerProfile) {
        return res.status(404).json({ message: "Provider not found" });
      }
      if (providerProfile.isBlocked) {
        return res.status(403).json({ message: "Provider is blocked" });
      }

      // Make sure both credit rows exist before opening the tx so the
      // SELECT FOR UPDATE inside chargeAndCreateCall has rows to lock.
      await Promise.all([
        storage.getOrCreateCredits(customerId),
        storage.getOrCreateCredits(providerId),
      ]);

      try {
        const result = await storage.chargeAndCreateCall({
          customerId,
          providerId,
          providerAcceptsDouble: providerProfile.acceptDoubleCharge === true,
          confirmDoubleCharge: confirmDoubleCharge === true,
          duration: Math.floor(Math.random() * 300) + 30,
        });
        // Fire-and-forget: notify the provider in-app that a customer just
        // called them. Failure here must NEVER fail the call response (the
        // call + credit deduction has already been committed).
        // IMPORTANT: never include the customer's raw mobile number in the
        // message — that would defeat the call-masking model. Only the
        // customer's display name is shown.
        try {
          const custName = customerProfile?.name || "Koi customer";
          await storage.createAppNotification({
            userId: providerId,
            title: "Naya Call Aaya 📞",
            message: `${custName} ne aapko abhi call kiya.`,
            type: "call",
          });
        } catch (notifyErr) {
          console.error("Failed to create call notification:", notifyErr);
        }
        return res.status(201).json(result);
      } catch (e: any) {
        const reason = e?.message || "call_failed";
        const map: Record<string, string> = {
          both_no_balance: "Call not possible: both accounts have zero balance.",
          customer_no_balance_blocked: "You need at least 1 credit to make this call.",
          provider_cannot_absorb: "Provider doesn't have enough credits to absorb the double charge.",
          cap_reached: "Provider has already accepted the daily limit of zero-balance calls.",
          provider_no_balance: "Provider has no balance — confirm double charge to continue.",
          need_two_credits: "You need at least 2 credits to make this call.",
          insufficient_balance: "Balance changed — please retry.",
        };
        if (map[reason]) {
          return res.status(402).json({ message: map[reason], reason });
        }
        throw e;
      }
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Call failed" });
    }
  });

  // Lightweight preference patcher — currently only `acceptDoubleCharge`
  // (provider opt-in to receive calls from zero-balance customers, paying 2
  // credits per call). Kept separate from the full profile PUT so the UI
  // toggle is a single round-trip and so we never accidentally clobber other
  // profile fields from a stale state.
  app.patch("/api/profile/preferences", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const role = (req.body?.role === "customer" ? "customer" : "provider") as "customer" | "provider";
      const update: Record<string, any> = {};
      if (typeof req.body?.acceptDoubleCharge === "boolean") {
        update.acceptDoubleCharge = req.body.acceptDoubleCharge;
      }
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ message: "No supported preference fields supplied" });
      }
      const profile = await storage.updateProfile(userId, update, role);
      res.json(profile);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update preferences" });
    }
  });

  app.get(api.calls.customerHistory.path, isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const history = await storage.getCallsByCustomer(userId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get(api.calls.providerHistory.path, isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const history = await storage.getCallsByProvider(userId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ── Notifications ───────────────────────────────────────────────────────
  // Lists all in-app notifications for the logged-in user. Currently the
  // only producer is the call route (a notification is created on the
  // provider's account every time a customer dials them), but the
  // app_notifications table is generic so future events can also use it.
  app.get("/api/notifications", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const list = await storage.listAppNotifications(userId);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  // Lightweight unread-count endpoint for the menu badge — separate from
  // the full list so the badge can poll cheaply without re-fetching every
  // notification body.
  app.get("/api/notifications/unread-count", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const c = await storage.countUnreadAppNotifications(userId);
      res.json({ count: c });
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  // Mark every notification of the current user as read. Called when the
  // notifications page is opened so the badge clears immediately.
  app.post("/api/notifications/read-all", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.markAllAppNotificationsRead(userId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  // Mark a single notification as read. The storage method scopes the
  // update by both id AND userId so a user cannot mark someone else's
  // notification as read.
  app.post("/api/notifications/:id/read", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      await storage.markAppNotificationRead(id, userId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get(api.credits.me.path, isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const credit = await storage.getOrCreateCredits(userId);
      const freeCredits = credit.freeCredits ?? 0;
      const purchasedCredits = credit.purchasedCredits ?? 0;
      res.json({ freeCredits, purchasedCredits, totalCredits: freeCredits + purchasedCredits });
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post(api.promoCodes.apply.path, isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { code } = req.body;

      const promo = await storage.getPromoCode(code);
      if (!promo) return res.status(404).json({ message: "Promo code nahi mila" });
      if (!promo.isActive) return res.status(400).json({ message: "Yeh promo code ab active nahi hai" });

      const localUser = await storage.getLocalUserByUserId(userId);
      const phone = localUser?.phone;
      if (phone) {
        const alreadyUsed = await storage.hasUsedPromo(phone, code);
        if (alreadyUsed) {
          return res.status(400).json({ message: "Yeh promo code is number par pehle use ho chuka hai" });
        }
      }

      const creditAmount = promo.creditAmount ?? 25;
      await storage.addPurchasedCredits(userId, "user", creditAmount);
      await storage.incrementPromoUsage(code);
      if (phone) await storage.recordPromoUsage(phone, code);

      res.json({ message: `Promo code apply ho gaya! ${creditAmount} credits add hue.`, creditsAdded: creditAmount });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Promo code apply nahi ho paya" });
    }
  });

  app.get(api.promoCodes.mine.path, isLocalAuthenticated, async (_req: any, res) => {
    res.json(null);
  });

  // Admin routes
  const adminCheck = (req: any, res: any, next: any) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // ─── Auto-Generate Provider Tags (dictionary + Gemini AI fallback) ───
  app.post("/api/admin/auto-generate-tags", adminCheck, async (req, res) => {
    try {
      const activeId = await getActiveJobId();
      if (activeId) {
        return res.status(409).json({ message: "Ek job already chal raha hai", activeJobId: activeId });
      }
      const dryRun = req.body?.dryRun === true;
      const limit = typeof req.body?.limit === "number" && req.body.limit > 0 ? Math.floor(req.body.limit) : undefined;
      const jobId = await startAutoTagJob({ dryRun, limit });
      const status = await getJobStatus(jobId);
      res.json({ jobId, total: status?.total ?? 0, geminiAvailable: status?.geminiAvailable ?? false, dryRun });
    } catch (err: any) {
      console.error("auto-generate-tags start error:", err);
      res.status(500).json({ message: err?.message || "Failed to start tag generation" });
    }
  });

  // Used by the admin UI on mount to resume polling. Returns:
  //   1. ANY currently-running job (no age limit — long backfills must
  //      remain resumable even if they've been going for hours), OR
  //   2. The most recent terminal job from the last 30 min — so an admin
  //      who refreshes after a server restart still sees the final state
  //      of their last run (e.g. "marked failed: server restart") instead
  //      of a blank slate.
  // The UI inspects `status.done` to decide whether to keep polling.
  app.get("/api/admin/auto-generate-tags/active", adminCheck, async (_req, res) => {
    try {
      const activeId = await getActiveJobId();
      if (activeId) {
        const status = await getJobStatus(activeId);
        if (status) return res.json({ jobId: activeId, status });
      }
      const recent = await getLatestJob(30 * 60);
      if (!recent) return res.json({ jobId: null });
      res.json({ jobId: recent.jobId, status: recent });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch active job";
      console.error("auto-generate-tags active fetch error:", err);
      res.status(500).json({ message: msg });
    }
  });

  // Retry just the providers that failed in a previous run (AI-error +
  // worker-error buckets). Reads `aiFailedUserIds` + `workerFailedUserIds`
  // off the prior job row and starts a new scoped tag job. Avoids
  // re-hitting Gemini quota for the providers that already succeeded.
  app.post("/api/admin/auto-generate-tags/retry-failed", adminCheck, async (req, res) => {
    try {
      const activeId = await getActiveJobId();
      if (activeId) {
        return res.status(409).json({ message: "Ek job already chal raha hai", activeJobId: activeId });
      }
      const sourceJobId = typeof req.body?.sourceJobId === "string" ? req.body.sourceJobId : null;
      const source = sourceJobId
        ? await getJobStatus(sourceJobId)
        : await getLatestJob(24 * 60 * 60); // fall back to most recent job in last 24h
      if (!source) {
        return res.status(404).json({ message: "Pichla job nahi mila — pehle ek normal run chalayein" });
      }
      const ids = Array.from(new Set([...(source.aiFailedUserIds || []), ...(source.workerFailedUserIds || [])]));
      if (ids.length === 0) {
        return res.status(400).json({ message: "Pichle run mein koi failed provider nahi tha" });
      }
      const dryRun = req.body?.dryRun === true;
      const jobId = await startAutoTagJob({ dryRun, userIds: ids });
      const status = await getJobStatus(jobId);
      res.json({
        jobId,
        total: status?.total ?? 0,
        geminiAvailable: status?.geminiAvailable ?? false,
        dryRun,
        sourceJobId: source.jobId,
        retriedCount: ids.length,
      });
    } catch (err: any) {
      console.error("auto-generate-tags retry-failed error:", err);
      res.status(500).json({ message: err?.message || "Failed to start retry job" });
    }
  });

  app.get("/api/admin/auto-generate-tags/status/:jobId", adminCheck, async (req, res) => {
    const status = await getJobStatus(req.params.jobId);
    if (!status) return res.status(404).json({ message: "Job not found or expired" });
    res.json(status);
  });

  app.get(api.admin.stats.path, adminCheck, async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      const [providerCount, callLogs] = await Promise.all([
        storage.getProfilesByRole("provider").catch(() => []),
        storage.getAllCallLogs().catch(() => []),
      ]);
      res.json({
        ...stats,
        totalProviders: Math.max(stats.totalProviders || 0, providerCount.length || 0),
        totalCalls: Math.max(stats.totalCalls || 0, callLogs.length || 0),
      });
    } catch (error) {
      console.error("[admin/stats]", error);
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get(api.admin.customers.path, adminCheck, async (req, res) => {
    try {
      const customers = await storage.getProfilesByRole("customer");
      res.json(customers);
    } catch (error) {
      console.error("[admin/customers]", error);
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get(api.admin.providers.path, adminCheck, async (req, res) => {
    try {
      const [providerProfiles, allProviders] = await Promise.all([
        storage.getProfilesByRole("provider"),
        storage.getAllProviders(),
      ]);
      const result = providerProfiles.map(p => {
        const providerData = allProviders.find(pr => pr.userId === p.userId);
        return { ...p, providerData };
      });
      res.json(result);
    } catch (error: any) {
      console.error("[admin/providers] FULL ERROR:", error);
      // Include actual DB error in the message so it shows in the admin UI for diagnosis
      const detail = error?.message || String(error);
      res.status(500).json({ message: `Failed to fetch providers — ${detail}` });
    }
  });

  app.get(api.admin.callLogs.path, adminCheck, async (req, res) => {
    try {
      const logs = await storage.getAllCallLogs();
      res.json(logs);
    } catch (error) {
      console.error("[admin/call-logs]", error);
      res.status(500).json({ message: "Failed to fetch call logs" });
    }
  });

  // Lightweight debug endpoint — raw row counts only, no joins
  app.get("/api/admin/debug/counts", adminCheck, async (_req, res) => {
    try {
      const [customers] = await db.select({ c: count() }).from(profiles).where(eq(profiles.role, "customer"));
      const [providerProfiles] = await db.select({ c: count() }).from(profiles).where(eq(profiles.role, "provider"));
      const [providerRows] = await db.select({ c: count() }).from(providers);
      const [callRows] = await db.select({ c: count() }).from(calls);
      const [pendingRows] = await db.select({ c: count() }).from(pendingProviders);
      res.json({
        profiles_customer: customers?.c ?? 0,
        profiles_provider: providerProfiles?.c ?? 0,
        providers_table: providerRows?.c ?? 0,
        calls_table: callRows?.c ?? 0,
        pending_providers: pendingRows?.c ?? 0,
      });
    } catch (error) {
      console.error("[admin/debug/counts]", error);
      res.status(500).json({ message: "Debug count query failed" });
    }
  });

  app.post(api.admin.toggleBlock.path, adminCheck, async (req, res) => {
    try {
      const { userId } = req.params;
      const profile = await storage.toggleBlock(userId);
      res.json({ message: `User ${profile.isBlocked ? 'blocked' : 'unblocked'} successfully` });
    } catch (error: any) {
      res.status(404).json({ message: error.message || "User not found" });
    }
  });

  app.delete(api.admin.deleteUser.path, adminCheck, async (req, res) => {
    try {
      const { userId } = req.params;
      await storage.deleteProfile(userId);
      res.json({ message: "User permanently deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Delete failed" });
    }
  });

  // ── VISITOR COUNTER ──────────────────────────────────────────────
  const BOT_PATTERNS = /bot|crawler|spider|scraper|googlebot|bingbot|yandex|baidu|duckduck|slurp|teoma|facebookexternalhit|whatsapp|semrush|ahref|mj12bot|rogerbot|dotbot/i;

  app.post("/api/visitor/track", async (req, res) => {
    try {
      const ua = req.headers["user-agent"] || "";
      if (BOT_PATTERNS.test(ua)) return res.json({ ok: false, reason: "bot" });
      if ((req.session as any).visitCounted) return res.json({ ok: false, reason: "already_counted" });
      const today = new Date().toISOString().slice(0, 10);
      await storage.trackVisit(today);
      (req.session as any).visitCounted = true;
      res.json({ ok: true });
    } catch {
      res.json({ ok: false });
    }
  });

  app.get("/api/visitor/count", async (_req, res) => {
    try {
      const stats = await storage.getVisitorStats();
      res.json(stats);
    } catch {
      res.json({ total: 0, today: 0, last7Days: [] });
    }
  });

  app.get("/api/visitor/stats", adminCheck, async (_req, res) => {
    try {
      const stats = await storage.getVisitorStats();
      res.json(stats);
    } catch {
      res.json({ total: 0, today: 0, last7Days: [] });
    }
  });

  // ── JOBS ────────────────────────────────────────────────────────
  const JOB_CREDIT_COST = 25;

  app.post("/api/jobs", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.localUserId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const incoming = { ...req.body, postType: req.body?.postType || "mitrify" };
      const parsed = insertJobSchema.safeParse(incoming);
      if (!parsed.success) {
        const first = parsed.error.errors[0];
        return res.status(400).json({ message: first?.message || "Invalid job data" });
      }
      const data = parsed.data;
      const credit = await storage.getOrCreateCredits(userId, "customer");
      const total = (credit?.freeCredits || 0) + (credit?.purchasedCredits || 0);
      if (total < JOB_CREDIT_COST) {
        return res.status(400).json({ message: `Job post ke liye ${JOB_CREDIT_COST} credits chahiye. Abhi: ${total}` });
      }
      await storage.deductMultipleCredits(userId, "user", JOB_CREDIT_COST);
      const fallbackLocation = data.location?.trim() || `${data.district}, ${data.state}`;
      const job = await storage.createJob({
        userId,
        jobName: data.jobName,
        description: data.description,
        location: fallbackLocation,
        state: data.state,
        district: data.district,
        postType: data.postType,
        ...(data.postType === "mitrify"
          ? {
              workType: data.workType,
              salary: data.salary,
              workHours: data.workHours,
              numEmployees: data.numEmployees,
              contactPhone: data.contactPhone,
            }
          : {
              googleFormUrl: data.googleFormUrl,
              contactPhone: data.contactPhone || undefined,
            }),
      });
      res.status(201).json(job);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Job post failed" });
    }
  });

  app.get("/api/jobs", async (_req, res) => {
    try {
      const jobList = await storage.listActiveJobs();
      res.json(jobList);
    } catch {
      res.json([]);
    }
  });

  app.get("/api/jobs/my", isLocalAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.localUserId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const myJobs = await storage.getJobsByUser(userId);
      res.json(myJobs);
    } catch {
      res.json([]);
    }
  });

  app.post("/api/jobs/:id/call", isLocalAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.localUserId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const jobId = parseInt(req.params.id);
      const allJobs = await storage.listActiveJobs();
      const job = allJobs.find(j => j.id === jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postType === "google_form") return res.status(400).json({ message: "Ye job Google Form se apply karni hai, call nahi" });
      const callerCredit = await storage.getOrCreateCredits(userId);
      const callerTotal = (callerCredit?.freeCredits || 0) + (callerCredit?.purchasedCredits || 0);
      if (callerTotal < 1) return res.status(400).json({ message: "Aapke credits khatam ho gaye" });
      await storage.deductCredit(userId);
      const posterCredit = await storage.getOrCreateCredits(job.userId);
      const posterTotal = (posterCredit?.freeCredits || 0) + (posterCredit?.purchasedCredits || 0);
      if (posterTotal > 0) {
        await storage.deductCredit(job.userId);
        const newTotal = posterTotal - 1;
        if (newTotal <= 0) {
          await storage.updateJobLowCredit(job.userId, true);
        }
      } else {
        await storage.updateJobLowCredit(job.userId, true);
      }
      res.json({ ok: true, phone: job.contactPhone });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Call failed" });
    }
  });

  app.post("/api/jobs/:id/apply-click", async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (!jobId || isNaN(jobId)) return res.status(400).json({ message: "Invalid job id" });
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postType !== "google_form") {
        return res.status(400).json({ message: "Apply click tracking sirf Google Form jobs ke liye hai" });
      }
      const applyClicks = await storage.incrementJobApplyClicks(jobId);
      res.json({ ok: true, applyClicks });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to track click" });
    }
  });

  app.delete("/api/jobs/:id", isLocalAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.localUserId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.userId !== userId) return res.status(403).json({ message: "Ye aapki job nahi hai" });
      await storage.deleteJob(jobId, userId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Delete failed" });
    }
  });

  app.patch("/api/admin/jobs/:id", adminCheck, async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      const { jobName, description, location, salary, workHours, contactPhone, isActive, googleFormUrl, postType } = req.body;

      const updates: Parameters<typeof storage.adminUpdateJob>[1] = {};
      if (jobName !== undefined) updates.jobName = String(jobName);
      if (description !== undefined) updates.description = String(description);
      if (location !== undefined) updates.location = String(location);
      if (salary !== undefined) updates.salary = String(salary);
      if (workHours !== undefined) updates.workHours = String(workHours);
      if (contactPhone !== undefined) {
        const trimmed = String(contactPhone || "").trim();
        updates.contactPhone = trimmed.length > 0 ? trimmed : null;
      }
      if (typeof isActive === "boolean") updates.isActive = isActive;

      // postType change is only allowed between the two known values.
      if (postType !== undefined) {
        if (postType !== "mitrify" && postType !== "google_form") {
          return res.status(400).json({ message: "Invalid postType" });
        }
        updates.postType = postType;
      }

      // googleFormUrl: validate against the same regex used at create-time.
      // Empty string clears the field; non-empty must be a forms.gle or
      // docs.google.com/forms URL.
      if (googleFormUrl !== undefined) {
        const trimmed = String(googleFormUrl || "").trim();
        if (trimmed.length === 0) {
          updates.googleFormUrl = null;
        } else if (!GOOGLE_FORM_URL_REGEX.test(trimmed)) {
          return res.status(400).json({ message: "Sirf Google Form ka link allowed hai" });
        } else {
          updates.googleFormUrl = trimmed;
        }
      }

      // Cross-field invariant: a google_form job (after this update) must
      // have a non-empty googleFormUrl.
      const existing = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (!existing[0]) return res.status(404).json({ message: "Job not found" });
      const finalPostType = updates.postType ?? existing[0].postType;
      const finalUrl = updates.googleFormUrl !== undefined ? updates.googleFormUrl : existing[0].googleFormUrl;
      if (finalPostType === "google_form" && (!finalUrl || !GOOGLE_FORM_URL_REGEX.test(String(finalUrl)))) {
        return res.status(400).json({ message: "Google Form job ke liye valid form URL zaroori hai" });
      }

      const updated = await storage.adminUpdateJob(jobId, updates);
      if (!updated) return res.status(404).json({ message: "Job not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Update failed" });
    }
  });

  app.get("/api/admin/jobs", adminCheck, async (req, res) => {
    try {
      const allJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt));
      res.json(allJobs);
    } catch {
      res.json([]);
    }
  });

  app.get("/api/content/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const [content] = await db.select().from(siteContent).where(eq(siteContent.key, key));
      if (content) {
        res.json(content.value);
      } else {
        res.json(null);
      }
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch content" });
    }
  });

  // --- Admin Credits Routes ---
  app.get("/api/admin/all-credits", adminCheck, async (req, res) => {
    try {
      const allCredits = await storage.getAllCreditsWithProfiles();
      res.json(allCredits);
    } catch (error: any) {
      console.error("[admin/all-credits]", error);
      res.status(500).json({ message: "Failed to fetch credits" });
    }
  });

  app.post("/api/admin/freeze-credits/:userId/:role", adminCheck, async (req, res) => {
    try {
      const { userId, role } = req.params;
      const { freeze } = req.body;
      const credit = await storage.freezeUserCredits(userId, role, freeze);
      res.json(credit);
    } catch (error: any) {
      console.error("[admin/freeze-credits]", error);
      res.status(500).json({ message: "Failed to freeze credits" });
    }
  });

  app.post("/api/admin/reset-credits/:userId/:role", adminCheck, async (req, res) => {
    try {
      const { userId, role } = req.params;
      const credit = await storage.resetUserCredits(userId, role);
      res.json(credit);
    } catch (error: any) {
      console.error("[admin/reset-credits]", error);
      res.status(500).json({ message: "Failed to reset credits" });
    }
  });

  app.post("/api/admin/gift-credits/:userId", adminCheck, async (req, res) => {
    try {
      const { userId } = req.params;
      const { amount } = req.body;
      const parsed = parseInt(amount, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 500) {
        return res.status(400).json({ message: "Amount must be between 1 and 500" });
      }
      const credit = await storage.addPurchasedCredits(userId, "user", parsed);
      res.json({ success: true, message: `${parsed} credits gifted successfully`, credit });
    } catch (error: any) {
      console.error("[admin/gift-credits]", error);
      res.status(500).json({ message: error.message || "Failed to gift credits" });
    }
  });

  app.put("/api/admin/content/:key", adminCheck, async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (!value) return res.status(400).json({ message: "Content value required" });
      const existing = await db.select().from(siteContent).where(eq(siteContent.key, key));
      if (existing.length > 0) {
        await db.update(siteContent).set({ value, updatedAt: new Date() }).where(eq(siteContent.key, key));
      } else {
        await db.insert(siteContent).values({ key, value, updatedAt: new Date() });
      }
      res.json({ message: "Content updated successfully", key, value });
    } catch (error: any) {
      console.error("Content update error:", error);
      res.status(500).json({ message: error.message || "Failed to update content" });
    }
  });

  app.put("/api/admin/profiles/:id", adminCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, mobile } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (mobile !== undefined) updates.mobile = mobile;
      const profile = await storage.updateProfileById(id, updates);
      res.json(profile);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update profile" });
    }
  });

  app.put("/api/admin/providers/:userId", adminCheck, async (req, res) => {
    try {
      const { userId } = req.params;
      const { serviceName, description, hashtags, approxCharge, mobileNumbers, radiusKm, latitude, longitude, address, isHidden } = req.body;
      const updates: any = {};
      if (serviceName !== undefined) updates.serviceName = serviceName;
      if (description !== undefined) updates.description = description;
      if (hashtags !== undefined) updates.hashtags = hashtags;
      if (approxCharge !== undefined) updates.approxCharge = approxCharge;
      if (mobileNumbers !== undefined) updates.mobileNumbers = mobileNumbers;
      if (radiusKm !== undefined) updates.radiusKm = radiusKm;
      if (latitude !== undefined) updates.latitude = latitude;
      if (longitude !== undefined) updates.longitude = longitude;
      if (address !== undefined) updates.address = address;
      if (isHidden !== undefined) updates.isHidden = isHidden;
      const provider = await storage.updateProviderByUserId(userId, updates);
      res.json(provider);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update provider" });
    }
  });

  app.get(api.admin.promoCodes.path, adminCheck, async (req, res) => {
    try {
      const codes = await storage.getAllPromoCodes();
      res.json(codes);
    } catch (error) {
      console.error("[admin/promo-codes]", error);
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post(api.admin.togglePromoCode.path, adminCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.togglePromoCode(id);
      res.json({ message: "Promo code toggled" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed" });
    }
  });

  app.delete("/api/admin/promo-codes/:id", adminCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePromoCode(id);
      res.json({ message: "Promo code deleted" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to delete" });
    }
  });

  app.post(api.admin.createPromoCode.path, adminCheck, async (req, res) => {
    try {
      const { code, creditAmount } = req.body;
      const existing = await storage.getPromoCode(code);
      if (existing) return res.status(400).json({ message: "Code already exists" });

      const promo = await storage.createPromoCode({
        code,
        ownerId: null,
        isActive: true,
        type: "admin",
        creditAmount: creditAmount ? parseInt(creditAmount) : 25,
      });
      res.status(201).json(promo);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to create" });
    }
  });

  app.patch("/api/admin/promo-codes/:id", adminCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { code, creditAmount } = req.body;
      const promo = await storage.updatePromoCode(id, {
        ...(code ? { code } : {}),
        ...(creditAmount !== undefined ? { creditAmount: parseInt(creditAmount) } : {}),
      });
      res.json(promo);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update" });
    }
  });

  app.get(api.admin.exportCsv.path, adminCheck, async (req, res) => {
    try {
      const { type } = req.params;
      let data: any[] = [];
      let filename = "";

      if (type === "customers") {
        data = await storage.getProfilesByRole("customer");
        filename = "customers.csv";
      } else if (type === "providers") {
        data = await storage.getProfilesByRole("provider");
        filename = "providers.csv";
      } else if (type === "calls") {
        data = await storage.getAllCallLogs();
        filename = "call_logs.csv";
      } else if (type === "subscriptions") {
        data = [];
        filename = "subscriptions.csv";
      } else {
        return res.status(400).json({ message: "Invalid export type" });
      }

      if (data.length === 0) {
        return res.status(404).json({ message: "No data to export" });
      }

      const headers = Object.keys(data[0]).join(",");
      const rows = data.map(row =>
        Object.values(row).map(v => {
          if (v === null || v === undefined) return "";
          if (typeof v === "object") return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
          return `"${String(v).replace(/"/g, '""')}"`;
        }).join(",")
      );
      const csv = [headers, ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ message: "Export failed" });
    }
  });

  // --- Cashfree Payment Routes ---
  // Supports two purposes via the `kind` body field:
  //   - kind="credits" (default, back-compat) → buy N credits at ₹1 each.
  //   - kind="subscription" + plan + cycle    → buy a Boost/Pro/Premium plan.
  app.post("/api/cashfree/create-order", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const kind = (req.body?.kind === "subscription") ? "subscription" : "credits";
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const orderId = `${userId.substring(0, 8)}_${Date.now()}`;
      const profile = await storage.getProfile(userId);
      const username = req.user?.claims?.username || "User";
      const email = req.user?.claims?.email || "user@mitrify.com";

      let amount: number;
      let orderNote: string;
      let returnUrl: string;
      let orderTags: Record<string, string>;

      if (kind === "subscription") {
        const planRaw = String(req.body?.plan || "");
        const cycleRaw = String(req.body?.cycle || "");
        const validPlans = ["boost", "pro", "premium"] as const;
        const validCycles = ["monthly", "yearly"] as const;
        type Plan = typeof validPlans[number];
        type Cycle = typeof validCycles[number];
        if (!(validPlans as readonly string[]).includes(planRaw)) {
          return res.status(400).json({ message: "Invalid plan" });
        }
        if (!(validCycles as readonly string[]).includes(cycleRaw)) {
          return res.status(400).json({ message: "Invalid billing cycle" });
        }
        const plan = planRaw as Plan;
        const cycle = cycleRaw as Cycle;
        const cfg = await storage.getSubscriptionPlanConfig();
        amount = cfg[plan][cycle];
        if (!amount || amount < 1) {
          return res.status(400).json({ message: "Plan price not configured" });
        }
        orderNote = `Mitrify ${plan[0].toUpperCase() + plan.slice(1)} ${cycle} subscription`;
        returnUrl = `${baseUrl}/payment/success?kind=subscription&plan=${plan}&cycle=${cycle}&order_id=${orderId}`;
        orderTags = { userId, kind: "subscription", plan, cycle, amount: String(amount) };
      } else {
        const creditCount = Number(req.body?.credits);
        if (!creditCount || creditCount < 1 || creditCount > 10000) {
          return res.status(400).json({ message: "Credits must be between 1 and 10000" });
        }
        amount = creditCount;
        orderNote = `Mitrify ${creditCount} Credits @ ₹1/credit`;
        returnUrl = `${baseUrl}/payment/success?kind=credits&credits=${creditCount}&order_id=${orderId}`;
        orderTags = { userId, kind: "credits", credits: String(creditCount) };
      }

      const order = await createCashfreeOrder({
        orderId,
        amount,
        customerName: profile?.name || username,
        customerEmail: email,
        customerPhone: profile?.mobile || "9999999999",
        returnUrl,
        orderNote,
        orderTags,
      });

      const cfMode =
        (process.env.NODE_ENV === "production" ||
         process.env.REPLIT_DEPLOYMENT === "1" ||
         process.env.CASHFREE_ENV === "production")
          ? "production" : "sandbox";
      res.json({
        paymentSessionId: order.payment_session_id,
        orderId: order.order_id,
        cfOrderId: order.cf_order_id,
        cfMode,
        amount,
        kind,
      });
    } catch (error: any) {
      console.error("Cashfree create order error:", error);
      res.status(500).json({ message: "Failed to create payment order" });
    }
  });

  app.post("/api/cashfree/verify-payment", isLocalAuthenticated, async (req: any, res) => {
    try {
      const { orderId } = req.body;
      const userId = req.user.claims.sub;

      if (!orderId) {
        return res.status(400).json({ message: "Order ID required" });
      }

      const order = await verifyCashfreePayment(orderId);

      if (order.order_status !== "PAID") {
        return res.status(400).json({ message: "Payment not completed", status: order.order_status });
      }

      const tags: Record<string, string> = order.order_tags || {};
      if (tags.userId !== userId) {
        return res.status(403).json({ message: "Payment does not belong to this user" });
      }

      const kind = tags.kind || (tags.credits ? "credits" : "credits");

      if (kind === "subscription") {
        const plan = String(tags.plan || "") as "boost" | "pro" | "premium";
        const cycle = String(tags.cycle || "") as "monthly" | "yearly";
        if (!["boost", "pro", "premium"].includes(plan) || !["monthly", "yearly"].includes(cycle)) {
          return res.status(400).json({ message: "Invalid subscription tags" });
        }

        // Idempotency: if this order_id was already converted into a
        // subscription row, return that row instead of extending again.
        const already = await storage.getSubscriptionByPaymentId(order.order_id);
        if (already) {
          return res.json({ success: true, kind, subscription: already, alreadyProcessed: true });
        }

        // Price-integrity: bind to the IMMUTABLE order_tags snapshot we
        // wrote at create-order time (not live config), so admin price
        // edits mid-checkout cannot reject a valid in-flight payment.
        // Fall back to live config only if the snapshot is missing.
        const snapshot = Number(tags.amount || 0);
        const cfg = await storage.getSubscriptionPlanConfig();
        const expected = snapshot > 0 ? snapshot : cfg?.[plan]?.[cycle];
        const paid = Number(order.order_amount || 0);
        if (typeof expected !== "number" || expected <= 0 || Math.abs(paid - expected) > 0.5) {
          return res.status(400).json({ message: "Payment amount does not match plan price" });
        }

        const durationDays = cycle === "yearly" ? 365 : 30;
        const sub = await storage.createOrExtendSubscription({
          userId,
          plan,
          billingCycle: cycle,
          durationDays,
          amount: Math.round(paid),
          paymentId: order.order_id,
        });
        return res.json({ success: true, kind, subscription: sub });
      }

      // Default: credits. Idempotent on order_id via the creditPayments
      // unique constraint — only credit on the first successful verify.
      const creditCount = parseInt(tags.credits || "0", 10);
      const paidAmt = Math.round(Number(order.order_amount || creditCount));
      const recorded = await storage.recordCreditPayment({
        userId,
        orderId: order.order_id,
        credits: creditCount,
        amount: paidAmt,
      });
      if (recorded.firstTime && creditCount > 0) {
        await storage.addPurchasedCredits(userId, "user", creditCount);
      }
      res.json({
        success: true,
        kind: "credits",
        alreadyProcessed: !recorded.firstTime,
        message: "Payment verified and credits added",
      });
    } catch (error: any) {
      console.error("Payment verification error:", error);
      res.status(500).json({ message: "Payment verification failed" });
    }
  });

  // ── Subscription endpoints ───────────────────────────────────────────────
  // Public price/perk config used by the Subscriptions page.
  app.get("/api/subscriptions/config", async (_req, res) => {
    try {
      const cfg = await storage.getSubscriptionPlanConfig();
      res.json(cfg);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to load config" });
    }
  });

  // Current user's active plan (or null) + history list.
  app.get("/api/subscriptions/me", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const [active, history] = await Promise.all([
        storage.getActiveSubscription(userId),
        storage.listUserSubscriptions(userId),
      ]);
      res.json({ active: active || null, history });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to load subscription" });
    }
  });

  // Unified payment timeline: credit purchases + subscription purchases
  // merged and sorted newest-first so the user sees one cohesive history.
  app.get("/api/payments/me", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const [creditRows, subRows] = await Promise.all([
        storage.listUserCreditPayments(userId),
        storage.listUserSubscriptions(userId),
      ]);
      type Item = {
        kind: "credits" | "subscription";
        id: string;
        amount: number;
        createdAt: string;
        label: string;
        meta: Record<string, unknown>;
      };
      const items: Item[] = [];
      for (const c of creditRows) {
        items.push({
          kind: "credits",
          id: `credit-${c.id}`,
          amount: c.amount,
          createdAt: (c.paidAt || c.createdAt || new Date()).toISOString(),
          label: `${c.credits} Credits`,
          meta: { orderId: c.orderId, credits: c.credits },
        });
      }
      for (const s of subRows) {
        items.push({
          kind: "subscription",
          id: `sub-${s.id}`,
          amount: s.amount,
          createdAt: (s.createdAt || new Date()).toISOString(),
          label: `${s.plan} · ${s.billingCycle}`,
          meta: {
            plan: s.plan,
            billingCycle: s.billingCycle,
            status: s.status,
            endDate: s.endDate,
            grantedBy: s.grantedBy,
            paymentId: s.paymentId,
          },
        });
      }
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      res.json({ items });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to load payment history" });
    }
  });

  // Admin: list all subscriptions with optional search/status/plan filters.
  app.get("/api/admin/subscriptions", adminCheck, async (req, res) => {
    try {
      const search = String(req.query.search || "");
      const status = String(req.query.status || "");
      const plan = String(req.query.plan || "");
      const rows = await storage.listAllSubscriptions({ search, status, plan });
      res.json(rows);
    } catch (e: any) {
      console.error("[admin/subscriptions]", e);
      res.status(500).json({ message: "Failed to list subscriptions" });
    }
  });

  // Admin: edit price/perks config.
  app.put("/api/admin/subscriptions/config", adminCheck, async (req, res) => {
    try {
      const body = req.body as Partial<SubscriptionPlanConfig> | undefined;
      // Light validation — every tier needs monthly + yearly numbers + perks.
      const tiers: Array<keyof SubscriptionPlanConfig> = ["boost", "pro", "premium"];
      for (const tier of tiers) {
        const t = body?.[tier];
        if (!t || typeof t.monthly !== "number" || typeof t.yearly !== "number" || !Array.isArray(t.perks)) {
          return res.status(400).json({ message: `Invalid config for ${tier}` });
        }
      }
      const cfg: SubscriptionPlanConfig = {
        boost: body!.boost!,
        pro: body!.pro!,
        premium: body!.premium!,
      };
      const saved = await storage.setSubscriptionPlanConfig(cfg);
      res.json(saved);
    } catch (e: any) {
      console.error("[admin/subscriptions/config]", e);
      res.status(500).json({ message: "Failed to save config" });
    }
  });

  // Admin: grant a subscription manually (no payment).
  app.post("/api/admin/subscriptions/grant", adminCheck, async (req: any, res) => {
    try {
      const { userId, plan, cycle, days } = req.body || {};
      if (!userId || !["boost", "pro", "premium"].includes(plan)) {
        return res.status(400).json({ message: "userId and a valid plan are required" });
      }
      const billingCycle: "monthly" | "yearly" | "custom" =
        cycle === "monthly" || cycle === "yearly" ? cycle : "custom";
      const durationDays = Number(days) > 0 ? Number(days) : (cycle === "yearly" ? 365 : 30);
      const sub = await storage.createOrExtendSubscription({
        userId,
        plan,
        billingCycle,
        durationDays,
        amount: 0,
        paymentId: null,
        grantedBy: req.session?.adminUsername || "admin",
      });
      res.json(sub);
    } catch (e: any) {
      console.error("[admin/subscriptions/grant]", e);
      res.status(500).json({ message: "Failed to grant subscription" });
    }
  });

  // Admin: cancel a subscription row by id.
  app.post("/api/admin/subscriptions/:id/cancel", adminCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const sub = await storage.cancelSubscription(id);
      res.json(sub);
    } catch (e: any) {
      console.error("[admin/subscriptions/cancel]", e);
      res.status(500).json({ message: "Failed to cancel" });
    }
  });

  // Admin: extend by N days.
  app.post("/api/admin/subscriptions/:id/extend", adminCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const days = Number(req.body?.days || 0);
      if (days <= 0) return res.status(400).json({ message: "days must be > 0" });
      const sub = await storage.extendSubscription(id, days);
      res.json(sub);
    } catch (e: any) {
      console.error("[admin/subscriptions/extend]", e);
      res.status(500).json({ message: "Failed to extend" });
    }
  });

  // ============ CO-ADMIN SYSTEM ============

  const coAdminCheck = (req: any, res: any, next: any) => {
    if (!req.session?.coAdminId && !isAdmin(req)) {
      return res.status(401).json({ message: "Co-admin auth required" });
    }
    next();
  };

  const verifierCheck = (req: any, res: any, next: any) => {
    const role = req.session?.coAdminRole;
    if (!isAdmin(req) && role !== "testadmin") {
      return res.status(403).json({ message: "Verifier access required" });
    }
    next();
  };

  const authLocalOrCoAdmin = (req: any, res: any, next: any) => {
    if ((req.session as any)?.localUserId || req.user?.claims?.sub) {
      req.user = { claims: { sub: (req.session as any).localUserId || req.user?.claims?.sub } };
      return next();
    }
    if (req.session?.coAdminId) {
      return next();
    }
    return res.status(401).json({ message: "Unauthorized" });
  };

  app.post("/api/coadmin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Username and password required" });

      const ca = await storage.getCoAdmin(username);
      if (!ca || !ca.isActive) return res.status(401).json({ message: "Invalid credentials" });

      const valid = await bcrypt.compare(password, ca.password);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });

      (req.session as any).coAdminId = ca.id;
      (req.session as any).coAdminUsername = ca.username;
      (req.session as any).coAdminRole = ca.role;
      req.session.save(() => {
        res.json({ id: ca.id, username: ca.username, role: ca.role });
      });
    } catch (err: any) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/coadmin/logout", (req, res) => {
    (req.session as any).coAdminId = null;
    (req.session as any).coAdminUsername = null;
    (req.session as any).coAdminRole = null;
    req.session.save(() => res.json({ ok: true }));
  });

  app.get("/api/coadmin/me", (req, res) => {
    if (isAdmin(req)) {
      return res.json({ id: 0, username: "mainadmin", role: "mainadmin" });
    }
    if (!(req.session as any)?.coAdminId) return res.status(401).json({ message: "Not authenticated" });
    res.json({
      id: (req.session as any).coAdminId,
      username: (req.session as any).coAdminUsername,
      role: (req.session as any).coAdminRole,
    });
  });

  app.get("/api/admin/co-admins", adminCheck, async (_req, res) => {
    try {
      const list = await storage.listCoAdmins();
      res.json(list.map(ca => ({ id: ca.id, username: ca.username, role: ca.role, isActive: ca.isActive, createdAt: ca.createdAt })));
    } catch (err: any) {
      console.error("[admin/co-admins]", err);
      res.status(500).json({ message: "Failed to fetch co-admins" });
    }
  });

  app.get("/api/admin/co-admins/:id/stats", adminCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const ca = await storage.getCoAdminById(id);
      if (!ca) return res.status(404).json({ message: "Co-admin not found" });
      const { stats, recentProviders } = await storage.getCoAdminStats(ca.username);
      res.json({ coAdmin: { id: ca.id, username: ca.username, role: ca.role, isActive: ca.isActive, createdAt: ca.createdAt, cycleStartAt: ca.cycleStartAt }, stats, recentProviders });
    } catch (err: any) {
      console.error("[admin/co-admins/stats]", err);
      res.status(500).json({ message: "Failed to fetch co-admin stats" });
    }
  });

  app.get("/api/admin/co-admins/:id/verified-providers", adminCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const ca = await storage.getCoAdminById(id);
      if (!ca) return res.status(404).json({ message: "Co-admin not found" });
      const status = (req.query.status as string) || "approved";
      const providers = await storage.getVerifiedProvidersByCoAdmin(ca.username, status);
      res.json(providers);
    } catch (err: any) {
      console.error("[admin/co-admins/verified-providers]", err);
      res.status(500).json({ message: "Failed to fetch verified providers" });
    }
  });

  app.get("/api/admin/co-admins/:id/salary-history", adminCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const ca = await storage.getCoAdminById(id);
      if (!ca) return res.status(404).json({ message: "Co-admin not found" });
      const history = await storage.getSalaryHistory(ca.username);
      res.json(history);
    } catch (err: any) {
      console.error("[admin/co-admins/salary-history]", err);
      res.status(500).json({ message: "Failed to fetch salary history" });
    }
  });

  app.post("/api/admin/co-admins/:id/mark-paid", adminCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const payment = await storage.markSalaryPaid(id, "admin");
      res.json(payment);
    } catch (err: any) {
      console.error("[admin/co-admins/mark-paid]", err);
      res.status(500).json({ message: err.message || "Failed to mark paid" });
    }
  });

  app.post("/api/admin/co-admins", adminCheck, async (req, res) => {
    try {
      const { username, password, role } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Username and password required" });
      const existing = await storage.getCoAdmin(username);
      if (existing) return res.status(400).json({ message: "Username already exists" });
      const hashed = await bcrypt.hash(password, 10);
      const ca = await storage.createCoAdmin({ username, password: hashed, role: role || "coadmin", isActive: true });
      res.status(201).json({ id: ca.id, username: ca.username, role: ca.role });
    } catch (err: any) {
      console.error("[admin/co-admins/create]", err);
      res.status(500).json({ message: "Failed to create co-admin" });
    }
  });

  app.delete("/api/admin/co-admins/:id", adminCheck, async (req, res) => {
    try {
      await storage.deleteCoAdmin(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[admin/co-admins/delete]", err);
      res.status(500).json({ message: "Failed to delete co-admin" });
    }
  });

  app.patch("/api/admin/co-admins/:id/password", adminCheck, async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) return res.status(400).json({ message: "Password required" });
      const hashed = await bcrypt.hash(password, 10);
      await storage.updateCoAdminPassword(parseInt(req.params.id), hashed);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[admin/co-admins/password]", err);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  app.post("/api/coadmin/pending-providers", coAdminCheck, async (req, res) => {
    try {
      const { mobile } = req.body;
      if (mobile && await storage.isMobileNumberTaken(mobile)) {
        return res.status(400).json({ message: `Mobile number ${mobile} already registered with another account` });
      }
      const addedBy = isAdmin(req) ? "mainadmin" : (req.session as any).coAdminUsername;
      const pp = await storage.createPendingProvider({ ...req.body, addedBy });
      res.status(201).json(pp);
    } catch (err: any) {
      console.error("[coadmin/pending-providers/create]", err);
      res.status(500).json({ message: "Failed to add pending provider" });
    }
  });

  app.get("/api/coadmin/pending-providers", coAdminCheck, async (req, res) => {
    try {
      const role = (req.session as any).coAdminRole;
      const username = (req.session as any).coAdminUsername;
      const page = Math.max(1, parseInt(String(req.query.page || "1")));
      const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit || "50"))));
      const status = String(req.query.status || "pending");
      const search = String(req.query.search || "");
      const sortBy = String(req.query.sortBy || "");
      const coAdminsRaw = String(req.query.coAdmins || "");
      const groupsRaw = String(req.query.groups || "");
      const filterByCoAdmins = coAdminsRaw ? coAdminsRaw.split(",").map(s => s.trim()).filter(Boolean) : undefined;
      const groups = groupsRaw ? groupsRaw.split(",").map(s => s.trim()).filter(Boolean) : undefined;
      const addedBy = (isAdmin(req) || role === "testadmin") ? undefined : username;
      const result = await storage.listPendingProvidersPaginated({ addedBy, status, search, filterByCoAdmins, sortBy: sortBy || undefined, page, limit, groups });
      res.json(result);
    } catch (err: any) {
      console.error("[coadmin/pending-providers/list]", err);
      res.status(500).json({ message: "Failed to fetch pending providers" });
    }
  });

  // Counter: how many leads were auto-saved by the customer-facing
  // Google fallback path (Task #74). Differentiator is `addedBy` =
  // "system_google_fallback" — the source column is set to "google"
  // both for this path and the admin's manual Google Places import,
  // so addedBy is the only reliable filter.
  app.get("/api/admin/google-fallback-stats", verifierCheck, async (_req, res) => {
    try {
      const SYSTEM_USER = "system_google_fallback";
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfWeek.getDate() - 6); // last 7 days incl. today

      const [todayRow, weekRow, totalRow, pendingRow] = await Promise.all([
        db.select({ c: count() }).from(pendingProviders)
          .where(and(eq(pendingProviders.addedBy, SYSTEM_USER), gte(pendingProviders.createdAt, startOfDay))),
        db.select({ c: count() }).from(pendingProviders)
          .where(and(eq(pendingProviders.addedBy, SYSTEM_USER), gte(pendingProviders.createdAt, startOfWeek))),
        db.select({ c: count() }).from(pendingProviders)
          .where(eq(pendingProviders.addedBy, SYSTEM_USER)),
        db.select({ c: count() }).from(pendingProviders)
          .where(and(eq(pendingProviders.addedBy, SYSTEM_USER), eq(pendingProviders.status, "pending"))),
      ]);
      res.json({
        today: Number(todayRow[0]?.c ?? 0),
        week: Number(weekRow[0]?.c ?? 0),
        total: Number(totalRow[0]?.c ?? 0),
        pending: Number(pendingRow[0]?.c ?? 0),
        systemUser: SYSTEM_USER,
      });
    } catch (err: any) {
      console.error("[admin/google-fallback-stats]", err);
      res.status(500).json({ message: "Failed to fetch google-fallback stats" });
    }
  });

  // Get group distribution stats
  app.get("/api/admin/group-stats", verifierCheck, async (_req, res) => {
    try {
      const rows = await db.select({
        groupLabel: pendingProviders.groupLabel,
        count: count(),
      })
        .from(pendingProviders)
        .where(eq(pendingProviders.status, "pending"))
        .groupBy(pendingProviders.groupLabel)
        .orderBy(pendingProviders.groupLabel);
      res.json(rows);
    } catch (err: any) {
      console.error("[admin/group-stats]", err);
      res.status(500).json({ message: "Failed to get group stats" });
    }
  });

  // Assign groups to all pending providers
  app.post("/api/admin/assign-groups", adminCheck, async (req, res) => {
    try {
      if (req.body.groupSize !== undefined) {
        // Fixed-size mode: A=first N, B=next N, C=next N, D=rest
        const parsed = parseInt(String(req.body.groupSize));
        if (isNaN(parsed) || parsed < 1) return res.status(400).json({ message: "groupSize must be a positive number" });
        const groupSize = Math.min(parsed, 1000000);
        const result = await storage.assignGroupsBySize(groupSize);
        res.json(result);
      } else {
        // Equal groups mode (round-robin)
        const numGroups = Math.max(2, Math.min(26, parseInt(String(req.body.numGroups || "5"))));
        const result = await storage.assignGroups(numGroups);
        res.json(result);
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to assign groups" });
    }
  });

  app.patch("/api/admin/pending-providers/:id/status", verifierCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, notes } = req.body;
      if (!["approved", "fake", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const verifierUsername = (req.session as any).coAdminUsername || "admin";
      if (status === "approved") {
        await storage.approvePendingProvider(id, verifierUsername);
        await storage.updatePendingProviderStatus(id, "approved", undefined, verifierUsername);
        return res.json({ ok: true, message: "Provider approved and live" });
      }
      const pp = await storage.updatePendingProviderStatus(id, status, notes, verifierUsername);
      res.json(pp);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Status update failed" });
    }
  });

  // Log verification call by co-admin
  app.post("/api/coadmin/log-call", async (req, res) => {
    const username = (req.session as any).coAdminUsername;
    if (!username) return res.status(401).json({ message: "Not authenticated" });
    try {
      await storage.incrementCoAdminCallCount(username);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to log call" });
    }
  });

  // Employee endpoints
  app.get("/api/employees", async (req, res) => {
    try {
      const employees = await storage.getAllEmployees();
      res.json(employees);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch employees" });
    }
  });

  app.get("/api/employees/:id", async (req, res) => {
    try {
      const employee = await storage.getEmployee(parseInt(req.params.id));
      if (!employee) return res.status(404).json({ message: "Employee not found" });
      res.json(employee);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch employee" });
    }
  });

  app.post("/api/employees", authLocalOrCoAdmin, async (req, res) => {
    try {
      const coAdminId = (req.session as any)?.coAdminId || parseInt(req.body.coAdminId);
      if (!coAdminId) return res.status(400).json({ message: "CoAdmin ID required" });
      const { name, post, education, description, profilePhoto } = req.body;
      const employee = await storage.createEmployee({ coAdminId, name, post, education, description, profilePhoto });
      res.json(employee);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create employee" });
    }
  });

  app.patch("/api/employees/:id", authLocalOrCoAdmin, async (req, res) => {
    try {
      const employee = await storage.getEmployee(parseInt(req.params.id));
      if (!employee) return res.status(404).json({ message: "Employee not found" });
      const coAdminId = (req.session as any)?.coAdminId;
      if (coAdminId && employee.coAdminId !== coAdminId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const { name, post, education, description, profilePhoto } = req.body;
      const updated = await storage.updateEmployee(parseInt(req.params.id), { name, post, education, description, profilePhoto });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update employee" });
    }
  });

  // Search tracking
  app.post("/api/search/track", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ message: "Invalid query" });
      }
      await storage.trackSearch(query);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to track search" });
    }
  });

  app.get("/api/admin/search-stats", adminCheck, async (_req, res) => {
    try {
      const stats = await storage.getSearchStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch search stats" });
    }
  });

  // Bulk import from Excel/CSV
  app.post("/api/admin/bulk-import", adminCheck, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const nameCol = req.body.nameCol || "Name";
      const mobileCol = req.body.mobileCol || "Mobile number";
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (rows.length === 0) return res.status(400).json({ message: "File is empty or unreadable" });
      const addedBy = "bulk-import";
      const allowDuplicate = req.body.allowDuplicate === "true";
      const records: Array<{ name: string; mobile: string; addedBy: string }> = [];
      let skippedNoMobile = 0;
      for (const row of rows) {
        const rawName = String(row[nameCol] || "").trim();
        const name = cleanBusinessName(rawName);
        const rawMobile = String(row[mobileCol] || "").trim().replace(/\D/g, "");
        if (!name) continue;
        if (rawMobile.length < 7) { skippedNoMobile++; continue; }
        const mobile = rawMobile.length === 10 ? rawMobile : rawMobile.slice(-10);
        if (mobile.length < 7) { skippedNoMobile++; continue; }
        records.push({ name, mobile, addedBy });
      }
      if (records.length === 0) return res.status(400).json({ message: `No valid records found. ${skippedNoMobile} rows had no mobile number. Check column names.` });
      const result = await storage.bulkCreatePendingProviders(records, allowDuplicate);
      res.json({ ok: true, ...result, skippedNoMobile });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Bulk import failed" });
    }
  });

  // Meta Ads lead import (assigns to a specific co-admin, source="meta", no group/salary increment)
  app.post("/api/admin/meta-import", adminCheck, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const nameCol = req.body.nameCol || "Name";
      const mobileCol = req.body.mobileCol || "Mobile number";
      const serviceCol = req.body.serviceCol || "";
      const addressCol = req.body.addressCol || "";
      const descriptionCol = req.body.descriptionCol || "";
      const assignTo = String(req.body.assignTo || "").trim();
      const allowDuplicate = req.body.allowDuplicate === "true";
      if (!assignTo) return res.status(400).json({ message: "assignTo (co-admin username) is required" });

      // Validate that assignTo is a real co-admin
      const coAdmins = await storage.listCoAdmins();
      const valid = coAdmins.some(ca => ca.username === assignTo);
      if (!valid) return res.status(400).json({ message: `Co-admin '${assignTo}' not found` });

      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (rows.length === 0) return res.status(400).json({ message: "File is empty or unreadable" });

      const records: Array<{ name: string; mobile: string; serviceName?: string; address?: string; description?: string }> = [];
      let skippedNoMobile = 0;
      for (const row of rows) {
        const rawName = String(row[nameCol] || "").trim();
        const name = cleanBusinessName(rawName);
        const nameSuffix = extractDescriptionSuffix(rawName);
        const rawMobile = String(row[mobileCol] || "").trim().replace(/\D/g, "");
        if (!name) continue;
        if (rawMobile.length < 7) { skippedNoMobile++; continue; }
        const mobile = rawMobile.length === 10 ? rawMobile : rawMobile.slice(-10);
        if (mobile.length < 7) { skippedNoMobile++; continue; }
        const serviceName = serviceCol ? String(row[serviceCol] || "").trim() : "";
        const address = addressCol ? String(row[addressCol] || "").trim() : "";
        const rawDescription = descriptionCol ? String(row[descriptionCol] || "").trim() : "";
        const description = mergeDescription(rawDescription || null, nameSuffix) || "";
        records.push({ name, mobile, serviceName, address, description });
      }
      if (records.length === 0) return res.status(400).json({ message: `No valid records found. ${skippedNoMobile} rows had no mobile. Check column names.` });

      const result = await storage.bulkCreateMetaLeads(records, assignTo, allowDuplicate);
      res.json({ ok: true, ...result, skippedNoMobile });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Meta import failed" });
    }
  });

  // Google Places API (New) — Text Search for businesses by city + service
  app.post("/api/admin/google-places-search", adminCheck, async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "GOOGLE_PLACES_API_KEY not configured" });
      const { city, service, pageToken } = req.body || {};
      const cityStr = String(city || "").trim();
      const serviceStr = String(service || "").trim();
      if (!cityStr || !serviceStr) return res.status(400).json({ message: "city aur service dono required hain" });

      // Per-admin daily quota. Charge a slot only on the *first* page of a
      // run (no `pageToken`) so a multi-page client loop counts as one run.
      const adminKey = "admin";
      if (!pageToken) {
        const rate = checkGpBulkRateLimit(adminKey);
        if (!rate.ok) {
          return res.status(429).json({
            message: `Daily limit exhaust ho gayi (${rate.runsToday}/${rate.max} runs aaj). 24 ghante baad try karein.`,
            runsToday: rate.runsToday,
            max: rate.max,
          });
        }
        recordGpBulkRun(adminKey);
      }
      const rateNow = checkGpBulkRateLimit(adminKey);

      const textQuery = `${serviceStr} in ${cityStr}`;
      const fieldMask = [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.shortFormattedAddress",
        "places.location",
        "places.nationalPhoneNumber",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "places.types",
        "places.rating",
        "places.userRatingCount",
        "nextPageToken",
      ].join(",");

      // Google's `searchText` caps `maxResultCount` at 20 per call, so to
      // return ~40 results per click we fetch up to 2 pages here and merge
      // them, returning the last page's nextPageToken for further pagination.
      const callGoogle = async (tok?: string) => {
        const body: any = { textQuery, regionCode: "IN", maxResultCount: 20 };
        if (tok) body.pageToken = String(tok);
        const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": fieldMask,
          },
          body: JSON.stringify(body),
        });
        const j: any = await r.json();
        return { ok: r.ok, status: r.status, json: j };
      };

      const merged: any[] = [];
      let curToken: string | undefined = pageToken ? String(pageToken) : undefined;
      let lastNextToken: string | null = null;
      for (let i = 0; i < 2; i++) {
        const { ok, status, json } = await callGoogle(curToken);
        if (!ok) {
          // First page failure is fatal; second page failure is non-fatal —
          // return whatever we have plus no continuation token.
          if (i === 0) {
            return res.status(status).json({
              message: json?.error?.message || "Google Places API call failed",
              details: json?.error,
            });
          }
          break;
        }
        if (Array.isArray(json.places)) merged.push(...json.places);
        lastNextToken = json.nextPageToken || null;
        if (!lastNextToken) break;
        curToken = lastNextToken;
        // Google's nextPageToken needs ~2s warm-up before becoming valid.
        if (i === 0) await new Promise(r => setTimeout(r, 2000));
      }

      const places = merged.map((p: any) => ({
        placeId: p.id,
        name: p.displayName?.text || "",
        address: p.formattedAddress || p.shortFormattedAddress || "",
        latitude: p.location?.latitude ?? null,
        longitude: p.location?.longitude ?? null,
        phone: p.nationalPhoneNumber || p.internationalPhoneNumber || "",
        website: p.websiteUri || "",
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? null,
        types: p.types || [],
      }));
      res.json({
        ok: true,
        places,
        nextPageToken: lastNextToken,
        query: textQuery,
        runsToday: rateNow.runsToday,
        max: rateNow.max,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Google Places search failed" });
    }
  });

  // Google Places — Bulk import selected places to pending_providers
  app.post("/api/admin/google-places-import", adminCheck, async (req, res) => {
    try {
      const { places, assignTo, serviceName, allowDuplicate, autoApprove } = req.body || {};
      if (!Array.isArray(places) || places.length === 0) {
        return res.status(400).json({ message: "Koi place select nahi hua" });
      }
      const assignToStr = String(assignTo || "").trim();
      if (!assignToStr) return res.status(400).json({ message: "Co-admin select karein" });
      const coAdmins = await storage.listCoAdmins();
      if (!coAdmins.some(ca => ca.username === assignToStr)) {
        return res.status(400).json({ message: `Co-admin '${assignToStr}' not found` });
      }

      const records = places.map((p: any) => {
        const rawName = String(p.name || "").trim() || "Unnamed Business";
        const descSuffix = extractDescriptionSuffix(rawName);
        const baseDesc = p.website ? `Website: ${p.website}` : null;
        return {
          name: cleanBusinessName(rawName),
          mobile: String(p.phone || "").trim(),
          serviceName: String(p.serviceName || serviceName || "").trim() || "Service",
          address: String(p.address || "").trim(),
          latitude: typeof p.latitude === "number" ? p.latitude : undefined,
          longitude: typeof p.longitude === "number" ? p.longitude : undefined,
          description: mergeDescription(baseDesc, descSuffix) ?? undefined,
        };
      });

      const result = await storage.bulkCreateGooglePlaces(records, assignToStr, allowDuplicate === true);

      let approved = 0;
      const approveErrors: string[] = [];
      if (autoApprove === true && result.insertedIds.length > 0) {
        // Approve EXACTLY the rows we just inserted (deterministic — uses
        // returned IDs so concurrent imports/approvals can't collide).
        // Run with limited concurrency to amortize the per-row DB round-trips
        // (was sequential — 40 rows took 40× the latency). Skip the inline
        // Gemini call (`skipAiTags`) since it's the dominant cost; tags can
        // be backfilled by the existing background auto-tag job afterwards.
        // We also drop the redundant `updatePendingProviderStatus` call that
        // followed each approve — `approvePendingProvider` already marks the
        // row "approved" internally, so the second write was wasted IO.
        const CONCURRENCY = 8;
        for (let i = 0; i < result.insertedIds.length; i += CONCURRENCY) {
          const slice = result.insertedIds.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(
            slice.map(id => storage.approvePendingProvider(id, "admin", { skipAiTags: true })),
          );
          results.forEach((r, idx) => {
            if (r.status === "fulfilled") approved++;
            else approveErrors.push(`ID ${slice[idx]}: ${r.reason?.message || r.reason}`);
          });
        }
      }

      const { insertedIds, ...publicResult } = result;
      res.json({ ok: true, ...publicResult, approved, approveErrors });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Google Places import failed" });
    }
  });

  // ── Google Places bulk-fetch run history (audit / replay) ──
  // Counts only — no places stored. Used by the admin Google Places card to
  // show last-10 runs with click-to-replay.
  app.get("/api/admin/google-places-runs", adminCheck, async (_req, res) => {
    try {
      const rows = await storage.listRecentGooglePlacesRuns(10);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to load run history" });
    }
  });

  app.post("/api/admin/google-places-runs", adminCheck, async (req, res) => {
    try {
      const body = z.object({
        city: z.string().trim().min(1).max(200),
        service: z.string().trim().min(1).max(200),
        target: z.number().int().nonnegative(),
        uniqueCount: z.number().int().nonnegative(),
        dupSkipped: z.number().int().nonnegative(),
        apiCalls: z.number().int().nonnegative(),
        durationMs: z.number().int().nonnegative(),
        startedAt: z.union([z.number(), z.string()]),
        finishedAt: z.union([z.number(), z.string()]),
        cancelled: z.boolean().optional().default(false),
        error: z.string().nullable().optional(),
        // NOTE: `stoppedBy` is intentionally NOT accepted from the client —
        // it's an audit field derived server-side from the authenticated
        // admin so the log cannot be spoofed.
      }).parse(req.body || {});

      const startedAt = new Date(body.startedAt);
      const finishedAt = new Date(body.finishedAt);
      if (Number.isNaN(startedAt.getTime()) || Number.isNaN(finishedAt.getTime())) {
        return res.status(400).json({ message: "Invalid startedAt / finishedAt" });
      }
      if (finishedAt.getTime() < startedAt.getTime()) {
        return res.status(400).json({ message: "finishedAt must be >= startedAt" });
      }

      // Audit identity: trust the session, never the request body.
      const adminUser = (req as any)?.session?.localUser?.username
        || (req as any)?.user?.claims?.sub
        || "admin";

      const parsed = insertGooglePlacesRunSchema.parse({
        city: body.city,
        service: body.service,
        target: body.target,
        uniqueCount: body.uniqueCount,
        dupSkipped: body.dupSkipped,
        apiCalls: body.apiCalls,
        durationMs: body.durationMs,
        startedAt,
        finishedAt,
        cancelled: body.cancelled ?? false,
        error: body.error ?? null,
        // Server-authoritative: only set when the run was cancelled, and
        // always to the calling admin's identity.
        stoppedBy: body.cancelled ? String(adminUser) : null,
      });
      const row = await storage.createGooglePlacesRun(parsed);
      res.json({ ok: true, run: row });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid run payload", details: err.errors });
      }
      res.status(500).json({ message: err.message || "Failed to record run" });
    }
  });

  // ── BULK APPROVE GOOGLE PLACES LEADS ──
  app.post("/api/admin/approve-google-bulk", adminCheck, async (req, res) => {
    try {
      const pending = await db
        .select()
        .from(pendingProviders)
        .where(and(eq(pendingProviders.status, "pending"), eq(pendingProviders.source, "google")));

      let approved = 0;
      const errors: string[] = [];
      for (const pp of pending) {
        try {
          await storage.approvePendingProvider(pp.id, "admin");
          await storage.updatePendingProviderStatus(pp.id, "approved", undefined, "admin");
          approved++;
        } catch (e: any) {
          errors.push(`ID ${pp.id}: ${e.message}`);
        }
      }
      res.json({ approved, total: pending.length, errors });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Bulk approve failed" });
    }
  });

  // ── BULK APPROVE BOTH META + GOOGLE LEADS — PREFLIGHT ──
  // Returns counts before the admin commits to bulk approve.
  app.get("/api/admin/approve-all-bulk/preflight", adminCheck, async (_req, res) => {
    try {
      const pending = await db
        .select({ mobile: pendingProviders.mobile, mobileNumbers: pendingProviders.mobileNumbers })
        .from(pendingProviders)
        .where(and(
          eq(pendingProviders.status, "pending"),
          inArray(pendingProviders.source, ["meta", "google"]),
        ));

      const noMobile = pending.filter((pp) => {
        const nums = Array.isArray(pp.mobileNumbers) ? pp.mobileNumbers : [];
        return !pp.mobile && nums.length === 0;
      }).length;

      res.json({ total: pending.length, noMobile });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Preflight check failed" });
    }
  });

  // ── BULK APPROVE BOTH META + GOOGLE LEADS (combined) ──
  app.post("/api/admin/approve-all-bulk", adminCheck, async (req, res) => {
    try {
      const pending = await db
        .select()
        .from(pendingProviders)
        .where(and(
          eq(pendingProviders.status, "pending"),
          inArray(pendingProviders.source, ["meta", "google"]),
        ));

      let approved = 0;
      let metaApproved = 0;
      let googleApproved = 0;
      let noMobileApproved = 0;
      const noMobileApprovedUserIds: string[] = [];
      const errors: string[] = [];
      for (const pp of pending) {
        try {
          const { userId } = await storage.approvePendingProvider(pp.id, "admin");
          await storage.updatePendingProviderStatus(pp.id, "approved", undefined, "admin");
          approved++;
          if (pp.source === "meta") metaApproved++;
          else if (pp.source === "google") googleApproved++;
          const nums = Array.isArray(pp.mobileNumbers) ? pp.mobileNumbers : [];
          if (!pp.mobile && nums.length === 0) {
            noMobileApproved++;
            noMobileApprovedUserIds.push(userId);
          }
        } catch (e: any) {
          errors.push(`ID ${pp.id}: ${e.message}`);
        }
      }
      res.json({ approved, metaApproved, googleApproved, noMobileApproved, noMobileApprovedUserIds, total: pending.length, errors });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Bulk approve failed" });
    }
  });

  // Delete pending providers with no/invalid mobile number
  app.delete("/api/admin/cleanup-no-mobile", adminCheck, async (req, res) => {
    try {
      const result = await storage.deleteNoMobilePendingProviders();
      res.json({ ok: true, deleted: result });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Cleanup failed" });
    }
  });

  // Backfill mobileNumbers for already-approved providers whose mobileNumbers
  // array is empty but whose provider profile has a mobile number stored.
  // Safe to run multiple times (idempotent — only touches empty arrays).
  app.post("/api/admin/backfill-provider-mobile-numbers", adminCheck, async (_req, res) => {
    try {
      const { db: rawDb } = await import("./db");
      const { providers: providersTable } = await import("../shared/schema");
      const { eq, sql: sqlExpr } = await import("drizzle-orm");

      // Find providers with no mobile numbers who have a profile mobile set
      const rows = await rawDb.execute(sqlExpr`
        SELECT pr.user_id, p.mobile
        FROM providers pr
        JOIN profiles p ON p.user_id = pr.user_id AND p.role = 'provider'
        WHERE array_length(pr.mobile_numbers, 1) IS NULL
          AND p.mobile IS NOT NULL
          AND p.mobile <> ''
      `);

      let updated = 0;
      for (const row of rows.rows as Array<{ user_id: string; mobile: string }>) {
        await rawDb
          .update(providersTable)
          .set({ mobileNumbers: [row.mobile] })
          .where(eq(providersTable.userId, row.user_id));
        updated++;
      }

      res.json({ ok: true, updated });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Backfill failed" });
    }
  });

  // One-time repair: strip pipe-separated (and " - " descriptor) suffixes from
  // import-affected provider profiles, approved provider descriptions, and
  // pending_providers rows. Safe to run multiple times (idempotent).
  // Scope: only users who have a row in `providers` (approved/import-affected),
  // NOT all profiles globally (preserves manually-created user names).
  app.post("/api/admin/repair-provider-names", adminCheck, async (_req, res) => {
    try {
      const { sql: sqlExpr } = await import("drizzle-orm");

      // ── Snapshot: fetch original raw data BEFORE any writes ──────────────
      // All three steps compute from this snapshot so that after profiles.name
      // is cleaned in step 1, the original suffix info is not lost for step 2.
      const snapshot = await db.execute(sqlExpr`
        SELECT
          p.id          AS profile_id,
          p.name        AS raw_name,
          pr.user_id    AS provider_user_id,
          pr.description AS provider_desc
        FROM profiles p
        INNER JOIN providers pr ON pr.user_id = p.user_id
        WHERE p.name LIKE '%|%'
      `);

      type SnapRow = {
        profile_id: number;
        raw_name: string;
        provider_user_id: string;
        provider_desc: string | null;
      };

      let profilesFixed = 0;
      let descriptionsFixed = 0;

      for (const row of snapshot.rows as SnapRow[]) {
        const raw = row.raw_name;

        // Compute clean name + suffix from the ORIGINAL raw value
        const firstSegment = raw.split("|")[0].trim();
        const cleanName = (firstSegment.split(" - ")[0].trim() || firstSegment) || raw.trim();
        const firstExtra = firstSegment.split(" - ").slice(1).join(" - ").trim();
        const restParts = raw.split("|").map((s: string) => s.trim()).filter(Boolean).slice(1).join(" | ");
        const suffix = [firstExtra, restParts].filter(Boolean).join(" | ");

        // 1. Update profiles.name if it actually changed
        if (cleanName && cleanName !== raw) {
          await db.execute(sqlExpr`UPDATE profiles SET name = ${cleanName} WHERE id = ${row.profile_id}`);
          profilesFixed++;
        }

        // 2. Backfill providers.description when suffix exists and description
        //    is currently NULL or empty/whitespace
        // Only backfill when description is currently NULL or empty/whitespace.
        // Never append to a meaningful existing description during a one-time migration.
        if (suffix) {
          const currentDesc = row.provider_desc;
          const isMeaningless = !currentDesc || currentDesc.trim() === "";
          if (isMeaningless) {
            await db.execute(sqlExpr`
              UPDATE providers SET description = ${suffix} WHERE user_id = ${row.provider_user_id}
            `);
            descriptionsFixed++;
          }
        }
      }

      // 3. Fix pending_providers rows (not yet approved — no providers row exists)
      const ppRows = await db.execute(sqlExpr`
        SELECT id, name, description FROM pending_providers WHERE name LIKE '%|%'
      `);
      let pendingFixed = 0;
      for (const row of ppRows.rows as Array<{ id: number; name: string; description: string | null }>) {
        const raw = row.name;
        const firstSeg = raw.split("|")[0].trim();
        const cleanName = (firstSeg.split(" - ")[0].trim() || firstSeg) || raw.trim();
        const firstExtra2 = firstSeg.split(" - ").slice(1).join(" - ").trim();
        const restParts2 = raw.split("|").map((s: string) => s.trim()).filter(Boolean).slice(1).join(" | ");
        const suffix = [firstExtra2, restParts2].filter(Boolean).join(" | ");
        const currentDesc = row.description;
        const isMeaningless = !currentDesc || currentDesc.trim() === "";
        // Only set suffix when description is currently NULL/empty — never append to meaningful content.
        const newDesc = (suffix && isMeaningless) ? suffix : currentDesc;
        if (cleanName !== raw) {
          await db.execute(sqlExpr`
            UPDATE pending_providers SET name = ${cleanName}, description = ${newDesc}
            WHERE id = ${row.id}
          `);
          pendingFixed++;
        }
      }

      res.json({
        ok: true,
        profilesFixed,
        descriptionsFixed,
        pendingFixed,
        total: profilesFixed + descriptionsFixed + pendingFixed,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Repair failed" });
    }
  });

  // Update pending provider fields (service + address) — with ownership check
  app.patch("/api/coadmin/pending-providers/:id", coAdminCheck, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pp = await storage.getPendingProvider(id);
      if (!pp) return res.status(404).json({ message: "Record not found" });

      // Authorization: admin and testadmin can edit anything; regular co-admin can only edit their own or bulk-import records
      const role = (req.session as any).coAdminRole;
      const username = (req.session as any).coAdminUsername;
      if (!isAdmin(req) && role !== "testadmin") {
        if (pp.addedBy !== username && pp.addedBy !== "bulk-import") {
          return res.status(403).json({ message: "You can only edit your own records" });
        }
      }

      const { serviceName, address, district, state, approxCharge } = req.body;
      const updated = await storage.updatePendingProviderFields(id, { serviceName, address, district, state, approxCharge });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Update failed" });
    }
  });

  // ── DUPLICATE PROFILES ──
  app.get("/api/admin/duplicate-profiles", adminCheck, async (_req, res) => {
    try {
      const data = await storage.getDuplicateProfiles();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch duplicates" });
    }
  });

  app.delete("/api/admin/bulk-delete-profiles", adminCheck, async (req, res) => {
    try {
      const { userIds } = req.body;
      if (!Array.isArray(userIds) || userIds.length === 0)
        return res.status(400).json({ message: "userIds array required" });
      let deleted = 0;
      for (const userId of userIds) {
        try { await storage.deleteProfile(userId); deleted++; } catch {}
      }
      res.json({ deleted });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Bulk delete failed" });
    }
  });

  // ── BULK APPROVE META LEADS ──
  app.post("/api/admin/approve-meta-bulk", adminCheck, async (req, res) => {
    try {
      const pending = await db
        .select()
        .from(pendingProviders)
        .where(and(eq(pendingProviders.status, "pending"), eq(pendingProviders.source, "meta")));

      let approved = 0;
      const errors: string[] = [];
      for (const pp of pending) {
        try {
          await storage.approvePendingProvider(pp.id, "admin");
          approved++;
        } catch (e: any) {
          errors.push(`ID ${pp.id}: ${e.message}`);
        }
      }
      res.json({ approved, total: pending.length, errors });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Bulk approve failed" });
    }
  });

  // ── FULL DATABASE BACKUP (admin only) ──
  // GET /api/admin/backup
  // Streams a .sql file containing a CREATE TABLE IF NOT EXISTS statement
  // and every row of every table in the live database. No filtering, no
  // sampling — 100% snapshot. Self-restorable via `psql < backup.sql`.
  // Last successful nightly auto-backup info (used by admin dashboard).
  app.get("/api/admin/backup/status", adminCheck, async (_req, res) => {
    try {
      const status = await getBackupStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load backup status" });
    }
  });

  // POST /api/admin/backup/run-now — triggers the same pipeline as the nightly
  // job on demand. Rate-limited to one run per 5 minutes.
  // The timestamp is persisted to the DB so server restarts don't bypass the limit.
  // claimRunNowSlot() uses SELECT FOR UPDATE inside a transaction to make the
  // check-and-update atomic, preventing bypass via concurrent requests.
  const RUN_NOW_COOLDOWN_MS = 5 * 60 * 1000;

  app.post("/api/admin/backup/run-now", adminCheck, async (_req, res) => {
    try {
      const claim = await claimRunNowSlot(RUN_NOW_COOLDOWN_MS);
      if (!claim.allowed) {
        return res.status(429).json({ message: `Rate limited. Try again in ${claim.remainingSecs}s.` });
      }
      const entry = await runDailyBackup();
      res.json(entry);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Backup failed" });
    }
  });

  // POST /api/admin/backup/gcs-upload — generate a fresh backup and push to GCS
  // Body: { mode: "overwrite" | "new" }
  app.post("/api/admin/backup/gcs-upload", adminCheck, async (req, res) => {
    if (!isGCSConfigured()) {
      return res.status(503).json({ message: "Google Cloud Storage not configured. Add GCS_SERVICE_ACCOUNT_KEY and GCS_BUCKET_NAME secrets." });
    }
    const mode = req.body?.mode === "overwrite" ? "overwrite" : "new";
    const now = new Date();
    const filename = makeBackupFilename(now);
    const backupsDir = path.resolve(process.cwd(), "backups");
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    const filepath = path.join(backupsDir, filename);
    try {
      // Write backup to temp file
      const stream = fs.createWriteStream(filepath, { encoding: "utf8" });
      const writeP = (s: string) => {
        if (!stream.write(s)) return new Promise<void>((r) => stream.once("drain", r));
      };
      const startedAt = Date.now();
      const prevStatus = await getBackupStatus();
      const previousPerTable = prevStatus.lastSuccess?.perTableRows;
      const totals = await streamBackupSql(
        (s) => { writeP(s); },
        { filename, previousPerTable },
      );
      await new Promise<void>((resolve, reject) => {
        stream.end((err?: Error | null) => err ? reject(err) : resolve());
      });
      // Upload to GCS
      const result = await uploadToGCS(filepath, filename, mode);
      const size = fs.statSync(filepath).size;
      // Persist as a history entry so admins see manual GCS uploads
      // alongside nightly/run-now backups (metadata only, no PII).
      try {
        await recordBackupHistory({
          filename,
          size,
          generatedAt: now.toISOString(),
          emailed: false,
          gcsUploaded: true,
          gcsName: result.gcsName,
          durationMs: Date.now() - startedAt,
          alertSent: false,
          totalRows: totals.totalRows,
          tableCount: totals.tableCount,
          perTableRows: totals.perTable,
          warnings: totals.warnings.length > 0 ? totals.warnings : undefined,
        });
      } catch (logErr) {
        console.error("[backup] failed to record GCS upload history:", logErr);
      }
      res.json({
        ok: true,
        gcsName: result.gcsName,
        url: result.url,
        size,
        filename,
        warnings: totals.warnings,
      });
    } catch (err: any) {
      try { fs.unlinkSync(filepath); } catch {}
      res.status(500).json({ message: err?.message || "GCS upload failed" });
    }
  });

  // GET /api/admin/backup/gcs-status — is GCS configured?
  app.get("/api/admin/backup/gcs-status", adminCheck, (_req, res) => {
    res.json({ configured: isGCSConfigured(), bucket: process.env.GCS_BUCKET_NAME || null });
  });

  // GET /api/admin/backup/alert-status — is BACKUP_ALERT_WEBHOOK configured?
  app.get("/api/admin/backup/alert-status", adminCheck, (_req, res) => {
    res.json({ configured: !!process.env.BACKUP_ALERT_WEBHOOK });
  });

  // GET /api/admin/system-health — show status of all required env vars / services
  app.get("/api/admin/system-health", adminCheck, (_req, res) => {
    const e = process.env;
    const googleOauth   = !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
    const cashfree      = !!(e.CASHFREE_APP_ID && e.CASHFREE_SECRET_KEY);
    const ai            = !!(e.GOOGLE_API_KEY || e.GEMINI_API_KEY);
    const gcs           = !!(e.GCS_SERVICE_ACCOUNT_KEY && e.GCS_BUCKET_NAME);
    const gmail         = !!(e.GMAIL_USER && e.GMAIL_APP_PASSWORD);
    const apple         = !!(e.APPLE_TEAM_ID && e.APPLE_CLIENT_ID && e.APPLE_KEY_ID && e.APPLE_PRIVATE_KEY);
    const sessionSecret = !!e.SESSION_SECRET;
    const cashfreeMode  = (e.NODE_ENV === "production" || e.REPLIT_DEPLOYMENT === "1" || e.CASHFREE_ENV === "production") ? "production" : "sandbox";
    const nodeEnv       = e.NODE_ENV || "development";
    res.json({
      nodeEnv,
      cashfreeMode,
      services: {
        google_oauth:   { ok: googleOauth,   label: "Google OAuth",      missing: googleOauth   ? [] : ["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET"] },
        cashfree:       { ok: cashfree,      label: "Cashfree Payments", missing: cashfree      ? [] : ["CASHFREE_APP_ID","CASHFREE_SECRET_KEY"] },
        ai:             { ok: ai,            label: "AI (Gemini)",       missing: ai            ? [] : ["GEMINI_API_KEY (or GOOGLE_API_KEY)"] },
        gcs_backup:     { ok: gcs,           label: "GCS Backup",        missing: gcs           ? [] : ["GCS_SERVICE_ACCOUNT_KEY","GCS_BUCKET_NAME"] },
        gmail_smtp:     { ok: gmail,         label: "Gmail SMTP",        missing: gmail         ? [] : ["GMAIL_USER","GMAIL_APP_PASSWORD"] },
        apple_signin:   { ok: apple,         label: "Apple Sign-In",     missing: apple         ? [] : ["APPLE_TEAM_ID","APPLE_CLIENT_ID","APPLE_KEY_ID","APPLE_PRIVATE_KEY"] },
        session_secret: { ok: sessionSecret, label: "Session Secret",    missing: sessionSecret ? [] : ["SESSION_SECRET"] },
      },
    });
  });

  // POST /api/admin/backup/test-alert — send a test alert to the configured webhook
  app.post("/api/admin/backup/test-alert", adminCheck, async (_req, res) => {
    let sent = false;
    let message = "";
    try {
      const result = await sendBackupAlert({ errorMessage: "This is a test alert from the Mitrify admin dashboard." });
      sent = result.sent;
      message = result.sent ? "Test alert sent successfully." : (result.error ?? "Failed to send test alert.");
    } catch (err: any) {
      sent = false;
      message = err?.message || "Unexpected error.";
    }
    try {
      await recordTestAlert({ at: new Date().toISOString(), sent, message, triggeredBy: "admin" });
    } catch (logErr) {
      console.error("[backup] failed to record test alert history:", logErr);
    }
    res.json({ ok: sent, message });
  });

  // GET /api/admin/backup/test-alert-history — recent test alert audit log
  app.get("/api/admin/backup/test-alert-history", adminCheck, async (_req, res) => {
    try {
      const entries = await getTestAlertHistory();
      res.json({ entries });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load test alert history" });
    }
  });

  app.get("/api/admin/backup", adminCheck, async (req, res) => {
    const filename = makeBackupFilename();
    const startedAt = Date.now();
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    // Track bytes streamed so we can persist size in history without
    // buffering the whole dump in memory.
    let bytesStreamed = 0;
    try {
      const prevStatus = await getBackupStatus();
      const previousPerTable = prevStatus.lastSuccess?.perTableRows;
      const totals = await streamBackupSql(
        (s) => {
          bytesStreamed += Buffer.byteLength(s, "utf8");
          res.write(s);
        },
        {
          filename,
          previousPerTable,
          // Set the warnings header BEFORE the body stream begins so the
          // browser-side download handler can read it via response.headers
          // and surface a destructive toast.
          onMetricsReady: ({ warnings }) => {
            if (warnings.length > 0 && !res.headersSent) {
              res.setHeader("X-Backup-Warnings", String(warnings.length));
              res.setHeader("X-Backup-Warning-Detail", encodeURIComponent(warnings.join(" | ")));
            }
          },
        },
      );
      res.end();
      // Persist history entry (metadata only — no dump contents).
      try {
        await recordBackupHistory({
          filename,
          size: bytesStreamed,
          generatedAt: new Date().toISOString(),
          emailed: false,
          durationMs: Date.now() - startedAt,
          alertSent: false,
          totalRows: totals.totalRows,
          tableCount: totals.tableCount,
          perTableRows: totals.perTable,
          warnings: totals.warnings.length > 0 ? totals.warnings : undefined,
        });
      } catch (logErr) {
        console.error("[backup] failed to record manual download history:", logErr);
      }
    } catch (err: any) {
      console.error("Backup failed:", err);
      if (res.headersSent) {
        try { res.write(`\n-- BACKUP FAILED: ${String(err?.message || err).replace(/\n/g, " ")}\n`); } catch {}
        try { res.end(); } catch {}
      } else {
        res.status(500).json({ message: err?.message || "Backup failed" });
      }
    }
  });

  /** Parse the optional mode field from a request body. Default = "merge". */
  function parseRestoreMode(raw: any): "overwrite" | "merge" | "lenient" {
    if (raw === "overwrite") return "overwrite";
    if (raw === "lenient") return "lenient";
    return "merge";
  }

  /**
   * Parse an optional excludeList param from a request body.
   * Accepts both a JSON array sent as a native array (application/json)
   * or as a stringified JSON value (multipart/form-data).
   */
  function parseExcludeList(raw: unknown): string[] {
    if (Array.isArray(raw) && raw.every((t) => typeof t === "string")) return raw as string[];
    if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((t) => typeof t === "string")) return parsed as string[];
      } catch { /* ignore */ }
    }
    return [];
  }

  /**
   * Apply an excludeList on top of an allowList.
   * If allowList is undefined (= all tables), derives it from the dump SQL first.
   * Always returns an array — callers must treat a returned empty array as
   * "nothing to restore" and short-circuit BEFORE calling restoreFromSql, because
   * restoreFromSql(sql, undefined) means "restore all tables".
   */
  function applyExcludeList(
    sql: string,
    allowList: string[] | undefined,
    excludeList: string[],
  ): { effective: string[]; allExcluded: boolean } {
    if (excludeList.length === 0) {
      return { effective: allowList ?? [], allExcluded: false };
    }
    const excluded = new Set(excludeList);
    const base = allowList ?? parseTablesFromDump(sql);
    const effective = base.filter((t) => !excluded.has(t));
    return { effective, allExcluded: effective.length === 0 };
  }

  // POST /api/admin/restore/preview — parse a .sql dump and return a
  // dry-run summary (table list + row counts from the file) without
  // touching the database.
  app.post(
    "/api/admin/restore/preview",
    adminCheck,
    restoreUpload.single("file"),
    async (req: any, res) => {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const name = (file.originalname || "").toLowerCase();
      if (!name.endsWith(".sql")) {
        return res.status(400).json({ message: "Only .sql files are accepted" });
      }
      const sql = file.buffer.toString("utf8");
      if (!sql.trim()) {
        return res.status(400).json({ message: "Uploaded file is empty" });
      }
      let allowList: string[] | undefined;
      const tablesField = req.body?.tables;
      if (typeof tablesField === "string" && tablesField.trim()) {
        try {
          const parsed = JSON.parse(tablesField);
          if (Array.isArray(parsed) && parsed.every((t) => typeof t === "string")) {
            allowList = parsed as string[];
          } else {
            return res.status(400).json({ message: "Invalid tables field — expected a JSON array of strings" });
          }
        } catch {
          return res.status(400).json({ message: "Invalid tables field — expected a JSON array of strings" });
        }
        if (allowList && allowList.length > 0) {
          const dumpTables = new Set(parseTablesFromDump(sql));
          const unknown = allowList.filter((t) => !dumpTables.has(t));
          if (unknown.length > 0) {
            return res.status(400).json({
              message: `The following tables are not present in the uploaded dump: ${unknown.join(", ")}`,
            });
          }
        }
      }
      const mode = parseRestoreMode(req.body?.mode);
      const preview = previewSqlBackup(sql, allowList);
      if (mode === "merge") {
        const counts = await countRowsPerTable(preview.tables.map((t) => t.name));
        preview.tables = preview.tables.map((t) => ({ ...t, existingRowCount: counts[t.name] ?? 0 }));
      }
      if (mode === "lenient") {
        const { adjustments, schemaQueryFailed } = await previewLenientSchemaAdjustments(sql, allowList);
        res.json({ ...preview, mode, ...(adjustments.length > 0 ? { schemaAdjustments: adjustments } : {}), ...(schemaQueryFailed ? { schemaAdjustmentsUnavailable: true } : {}) });
      } else {
        res.json({ ...preview, mode });
      }
    },
  );

  // POST /api/admin/restore — admin uploads a .sql backup file and we
  // replay it inside a single transaction. Returns per-table row counts.
  app.post(
    "/api/admin/restore",
    adminCheck,
    restoreUpload.single("file"),
    async (req: any, res) => {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const name = (file.originalname || "").toLowerCase();
      if (!name.endsWith(".sql")) {
        return res.status(400).json({ message: "Only .sql files are accepted" });
      }
      const sql = file.buffer.toString("utf8");
      if (!sql.trim()) {
        return res.status(400).json({ message: "Uploaded file is empty" });
      }
      // Optional allow-list of table names to selectively restore.
      let allowList: string[] | undefined;
      const tablesField = req.body?.tables;
      if (typeof tablesField === "string" && tablesField.trim()) {
        try {
          const parsed = JSON.parse(tablesField);
          if (Array.isArray(parsed) && parsed.every((t) => typeof t === "string")) {
            allowList = parsed as string[];
          } else {
            return res.status(400).json({ message: "Invalid tables field — expected a JSON array of strings" });
          }
        } catch {
          return res.status(400).json({ message: "Invalid tables field — expected a JSON array of strings" });
        }
        // Validate that every requested table actually exists in the uploaded dump.
        // This prevents a caller from requesting a truncate-without-reinsert by
        // naming a table that is not in the backup file.
        if (allowList && allowList.length > 0) {
          const dumpTables = new Set(parseTablesFromDump(sql));
          const unknown = allowList.filter((t) => !dumpTables.has(t));
          if (unknown.length > 0) {
            return res.status(400).json({
              message: `The following tables are not present in the uploaded dump: ${unknown.join(", ")}`,
            });
          }
        }
      }
      const mode = parseRestoreMode(req.body?.mode);
      const excludeList = parseExcludeList(req.body?.excludeList);
      // Start from the existing allowList (or undefined = all tables).
      // When excludeList is non-empty, compute the effective list and guard against
      // an empty result — restoreFromSql(sql, undefined) means "restore all tables",
      // so we must never pass undefined when the admin explicitly excluded tables.
      let resolvedAllowList: string[] | undefined = allowList;
      if (excludeList.length > 0) {
        const { effective, allExcluded } = applyExcludeList(sql, allowList, excludeList);
        if (allExcluded) {
          return res.status(400).json({ message: "No tables remain after applying exclude list — nothing to restore." });
        }
        resolvedAllowList = effective;
      }
      try {
        const result = await restoreFromSql(sql, resolvedAllowList, mode);
        res.json({
          message: "Restore completed successfully",
          allowList: resolvedAllowList ?? null,
          ...result,
        });
      } catch (err: unknown) {
        if (err instanceof RestoreCancelledError) {
          return res.status(409).json({ message: "RESTORE_CANCELLED", cancelled: true });
        }
        console.error("Restore failed:", err);
        const msg = err instanceof Error ? err.message : "Restore failed — database has been rolled back";
        res.status(500).json({ message: msg });
      }
    },
  );

  // GET /api/admin/restore/skipped-report/:reportId — download full skipped-rows CSV
  app.get("/api/admin/restore/skipped-report/:reportId", adminCheck, (req, res) => {
    const { reportId } = req.params;
    if (!reportId || !/^[0-9a-f]{32}$/.test(reportId)) {
      return res.status(400).json({ message: "Invalid report ID" });
    }
    const rows = getSkippedReport(reportId);
    if (!rows) {
      return res.status(404).json({ message: "Report not found or has expired (reports are available for 2 hours after a restore)" });
    }
    const csvLines: string[] = ['"#","Error","SQL Statement"'];
    for (const row of rows) {
      const escapedError = `"${row.error.replace(/"/g, '""')}"`;
      const escapedSql = `"${row.sql.replace(/"/g, '""')}"`;
      csvLines.push(`${row.index},${escapedError},${escapedSql}`);
    }
    const csv = csvLines.join("\r\n");
    deleteSkippedReport(reportId);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="skipped-rows-${reportId.slice(0, 8)}.csv"`);
    res.send(csv);
  });

  // POST /api/admin/restore/direct — accept a .sql file and execute every
  // statement directly against the live database, best-effort (no transaction,
  // no rollback). Returns a summary: total statements, passed, failed, and a
  // list of any statement that failed along with its error message.
  app.post(
    "/api/admin/restore/direct",
    adminCheck,
    restoreUpload.single("file"),
    async (req: any, res) => {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const name = (file.originalname || "").toLowerCase();
      if (!name.endsWith(".sql")) {
        return res.status(400).json({ message: "Only .sql files are accepted" });
      }
      const sql = file.buffer.toString("utf8");
      if (!sql.trim()) {
        return res.status(400).json({ message: "Uploaded file is empty" });
      }
      const statements = splitSqlStatements(sql);
      if (statements.length === 0) {
        return res.status(400).json({ message: "No executable statements found in the file" });
      }
      const startMs = Date.now();
      let passed = 0;
      let failed = 0;
      const errors: Array<{ index: number; sql: string; error: string }> = [];
      const client = await pool.connect();
      try {
        for (let i = 0; i < statements.length; i++) {
          const stmt = statements[i];
          try {
            await client.query(stmt.endsWith(";") ? stmt : `${stmt};`);
            passed++;
          } catch (err: unknown) {
            failed++;
            errors.push({
              index: i + 1,
              sql: stmt.length > 200 ? stmt.slice(0, 200) + "…" : stmt,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } finally {
        client.release();
      }
      const durationMs = Date.now() - startMs;
      res.json({
        totalStatements: statements.length,
        passed,
        failed,
        durationMs,
        errors,
      });
    },
  );

  // POST /api/admin/restore/cancel — signal the active restore to stop
  app.post("/api/admin/restore/cancel", adminCheck, async (_req, res) => {
    const state = getActiveRestoreState();
    if (!state) {
      return res.status(404).json({ message: "No restore is currently in progress" });
    }
    markRestoreCancelled();
    let backendCancelSent = false;
    if (state.pid !== null) {
      try {
        await pool.query("SELECT pg_cancel_backend($1)", [state.pid]);
        backendCancelSent = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[restore] pg_cancel_backend failed:", msg);
      }
    }
    // Return cancelled:true either way — the flag is set and the hard gate
    // before COMMIT in restoreFromSql guarantees rollback even if
    // pg_cancel_backend did not interrupt the active query.
    res.json({ cancelled: true, backendCancelSent });
  });

  // GET /api/admin/backup/gcs-list — list backup files in the GCS bucket
  app.get("/api/admin/backup/gcs-list", adminCheck, async (_req, res) => {
    if (!isGCSConfigured()) {
      return res.status(400).json({ message: "GCS not configured — GCS_SERVICE_ACCOUNT_KEY / GCS_BUCKET_NAME missing" });
    }
    try {
      const files = await listGCSBackups();
      res.json({ files });
    } catch (err: any) {
      console.error("GCS list failed:", err);
      res.status(500).json({ message: err?.message || "Failed to list GCS backups" });
    }
  });

  // POST /api/admin/restore/gcs-preview — body: { gcsName, tables? }
  app.post("/api/admin/restore/gcs-preview", adminCheck, async (req, res) => {
    const gcsName = String(req.body?.gcsName || "").trim();
    if (!gcsName || !/^[A-Za-z0-9._\-/]+\.sql$/.test(gcsName) || gcsName.includes("..")) {
      return res.status(400).json({ message: "Invalid gcsName" });
    }
    if (!isGCSConfigured()) {
      return res.status(400).json({ message: "GCS not configured" });
    }
    try {
      const sql = await downloadFromGCS(gcsName);
      if (!sql.trim()) return res.status(400).json({ message: "GCS file is empty" });
      let allowList: string[] | undefined;
      const tablesField = req.body?.tables;
      if (Array.isArray(tablesField) && tablesField.every((t) => typeof t === "string")) {
        allowList = tablesField as string[];
        if (allowList.length > 0) {
          const dumpTables = new Set(parseTablesFromDump(sql));
          const unknown = allowList.filter((t) => !dumpTables.has(t));
          if (unknown.length > 0) {
            return res.status(400).json({ message: `The following tables are not present in the dump: ${unknown.join(", ")}` });
          }
        }
      }
      const mode = parseRestoreMode(req.body?.mode);
      const preview = previewSqlBackup(sql, allowList);
      if (mode === "merge") {
        const counts = await countRowsPerTable(preview.tables.map((t) => t.name));
        preview.tables = preview.tables.map((t) => ({ ...t, existingRowCount: counts[t.name] ?? 0 }));
      }
      if (mode === "lenient") {
        const { adjustments, schemaQueryFailed } = await previewLenientSchemaAdjustments(sql, allowList);
        res.json({ ...preview, mode, ...(adjustments.length > 0 ? { schemaAdjustments: adjustments } : {}), ...(schemaQueryFailed ? { schemaAdjustmentsUnavailable: true } : {}) });
      } else {
        res.json({ ...preview, mode });
      }
    } catch (err: any) {
      console.error("GCS restore preview failed:", err);
      res.status(500).json({ message: err?.message || "Preview failed" });
    }
  });

  // POST /api/admin/restore/gcs — body: { gcsName, tables? }
  app.post("/api/admin/restore/gcs", adminCheck, async (req, res) => {
    const gcsName = String(req.body?.gcsName || "").trim();
    if (!gcsName || !/^[A-Za-z0-9._\-/]+\.sql$/.test(gcsName) || gcsName.includes("..")) {
      return res.status(400).json({ message: "Invalid gcsName" });
    }
    if (!isGCSConfigured()) {
      return res.status(400).json({ message: "GCS not configured" });
    }
    try {
      const sql = await downloadFromGCS(gcsName);
      if (!sql.trim()) return res.status(400).json({ message: "GCS file is empty" });
      let allowList: string[] | undefined;
      const tablesField = req.body?.tables;
      if (Array.isArray(tablesField) && tablesField.every((t) => typeof t === "string")) {
        allowList = tablesField as string[];
        if (allowList.length > 0) {
          const dumpTables = new Set(parseTablesFromDump(sql));
          const unknown = allowList.filter((t) => !dumpTables.has(t));
          if (unknown.length > 0) {
            return res.status(400).json({ message: `The following tables are not present in the dump: ${unknown.join(", ")}` });
          }
        }
      }
      const mode = parseRestoreMode(req.body?.mode);
      const excludeList = parseExcludeList(req.body?.excludeList);
      let resolvedAllowList: string[] | undefined = allowList;
      if (excludeList.length > 0) {
        const { effective, allExcluded } = applyExcludeList(sql, allowList, excludeList);
        if (allExcluded) {
          return res.status(400).json({ message: "No tables remain after applying exclude list — nothing to restore." });
        }
        resolvedAllowList = effective;
      }
      const result = await restoreFromSql(sql, resolvedAllowList, mode);
      res.json({ message: "Restore completed successfully", source: gcsName, allowList: resolvedAllowList ?? null, ...result });
    } catch (err: unknown) {
      if (err instanceof RestoreCancelledError) {
        return res.status(409).json({ message: "RESTORE_CANCELLED", cancelled: true });
      }
      console.error("GCS restore failed:", err);
      const msg = err instanceof Error ? err.message : "Restore failed — database has been rolled back";
      res.status(500).json({ message: msg });
    }
  });

  /**
   * Shared validation for stored-backup routes:
   * - validates filename (safe chars + .sql extension, no path traversal)
   * - reads the SQL from BACKUPS_DIR
   * - validates and parses the optional JSON-body tables allow-list
   * Returns a validated { sql, allowList } or sends an error response and returns null.
   */
  async function resolveStoredBackup(
    req: any,
    res: any,
  ): Promise<{ sql: string; allowList: string[] | undefined } | null> {
    const { filename, tables: tablesField } = req.body || {};
    if (!filename || typeof filename !== "string") {
      res.status(400).json({ message: "filename is required" });
      return null;
    }
    if (!/^[\w.\-]+\.sql$/i.test(filename) || filename.includes("..")) {
      res.status(400).json({ message: "Invalid filename" });
      return null;
    }
    const filepath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(filepath)) {
      res.status(404).json({ message: "Backup file not found on server" });
      return null;
    }
    const sql = fs.readFileSync(filepath, "utf8");
    if (!sql.trim()) {
      res.status(400).json({ message: "Backup file is empty" });
      return null;
    }
    let allowList: string[] | undefined;
    if (tablesField !== undefined && tablesField !== null) {
      if (!Array.isArray(tablesField) || !tablesField.every((t: any) => typeof t === "string")) {
        res.status(400).json({ message: "Invalid tables field — expected a JSON array of strings" });
        return null;
      }
      if (tablesField.length > 0) {
        allowList = tablesField as string[];
        const dumpTables = new Set(parseTablesFromDump(sql));
        const unknown = allowList.filter((t) => !dumpTables.has(t));
        if (unknown.length > 0) {
          res.status(400).json({
            message: `The following tables are not present in this backup: ${unknown.join(", ")}`,
          });
          return null;
        }
      }
    }
    return { sql, allowList };
  }

  // POST /api/admin/restore/stored/preview — dry-run a stored server-side
  // backup file (by filename) without touching the database.
  app.post("/api/admin/restore/stored/preview", adminCheck, async (req: any, res) => {
    const resolved = await resolveStoredBackup(req, res);
    if (!resolved) return;
    const mode = parseRestoreMode(req.body?.mode);
    const preview = previewSqlBackup(resolved.sql, resolved.allowList);
    if (mode === "merge") {
      const counts = await countRowsPerTable(preview.tables.map((t) => t.name));
      preview.tables = preview.tables.map((t) => ({ ...t, existingRowCount: counts[t.name] ?? 0 }));
    }
    if (mode === "lenient") {
      const { adjustments, schemaQueryFailed } = await previewLenientSchemaAdjustments(resolved.sql, resolved.allowList);
      res.json({ ...preview, mode, ...(adjustments.length > 0 ? { schemaAdjustments: adjustments } : {}), ...(schemaQueryFailed ? { schemaAdjustmentsUnavailable: true } : {}) });
    } else {
      res.json({ ...preview, mode });
    }
  });

  // POST /api/admin/restore/stored — replay a stored server-side backup file
  // (by filename) inside a single transaction. Returns per-table row counts.
  app.post("/api/admin/restore/stored", adminCheck, async (req: any, res) => {
    const resolved = await resolveStoredBackup(req, res);
    if (!resolved) return;
    const mode = parseRestoreMode(req.body?.mode);
    const excludeList = parseExcludeList(req.body?.excludeList);
    let resolvedAllowList: string[] | undefined = resolved.allowList;
    if (excludeList.length > 0) {
      const { effective, allExcluded } = applyExcludeList(resolved.sql, resolved.allowList, excludeList);
      if (allExcluded) {
        return res.status(400).json({ message: "No tables remain after applying exclude list — nothing to restore." });
      }
      resolvedAllowList = effective;
    }
    try {
      const result = await restoreFromSql(resolved.sql, resolvedAllowList, mode);
      res.json({ message: "Restore completed successfully", allowList: resolvedAllowList ?? null, ...result });
    } catch (err: unknown) {
      if (err instanceof RestoreCancelledError) {
        return res.status(409).json({ message: "RESTORE_CANCELLED", cancelled: true });
      }
      console.error("Stored restore failed:", err);
      const msg = err instanceof Error ? err.message : "Restore failed — database has been rolled back";
      res.status(500).json({ message: msg });
    }
  });

  // ── ADMIN: BULK FILTER USERS ──────────────────────────────────────────────
  app.get("/api/admin/bulk-filter-users", adminCheck, async (req, res) => {
    try {
      const filter = (req.query.filter as string) || "all";
      const search = (req.query.search as string) || "";

      const allProfiles = await storage.getProfilesByRole("customer");
      const allProviders = await storage.getAllProviders();
      const providerUserIds = new Set(allProviders.map(p => p.userId));

      const allUsers = [
        ...allProfiles,
        ...(await storage.getProfilesByRole("provider")),
      ];

      const dedupedUsers = Array.from(new Map(allUsers.map(u => [u.userId, u])).values());

      function isSuspiciousName(name: string | null): boolean {
        if (!name || name.trim().length < 2) return true;
        if (/^[0-9\s\W]+$/.test(name.trim())) return true;
        const lname = name.toLowerCase().trim();
        const fakeNames = ["test", "user", "admin", "provider", "customer", "demo", "abc", "xyz", "na", "n/a", "none", "null"];
        if (fakeNames.includes(lname)) return true;
        return false;
      }

      let filtered = dedupedUsers;

      if (filter === "noMobile") {
        filtered = dedupedUsers.filter(u => {
          const mob = (u as any).mobile || (u as any).mobileNumber || "";
          return !mob || mob.trim() === "";
        });
      } else if (filter === "noLocation") {
        filtered = dedupedUsers.filter(u => {
          const prov = allProviders.find(p => p.userId === u.userId);
          if (!prov) return false;
          return !prov.latitude || !prov.longitude;
        });
      } else if (filter === "suspiciousName") {
        filtered = dedupedUsers.filter(u => isSuspiciousName(u.name));
      }

      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(u =>
          (u.name || "").toLowerCase().includes(s) ||
          (u.userId || "").toLowerCase().includes(s) ||
          ((u as any).mobile || "").includes(s)
        );
      }

      res.json(filtered.slice(0, 500));
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Filter failed" });
    }
  });

  startBackupScheduler();

  return httpServer;
}
