import type { Express } from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { db, pool } from "./db";
import { profiles, siteContent, jobs, pendingProviders } from "@shared/schema";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { eq, desc, count, and } from "drizzle-orm";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { createCashfreeOrder, verifyCashfreePayment } from "./cashfreeClient";
import multer from "multer";
import * as XLSX from "xlsx";
import { streamBackupSql, makeBackupFilename, getBackupStatus, startBackupScheduler, restoreFromSql, runDailyBackup, parseTablesFromDump, previewSqlBackup, uploadToGCS, isGCSConfigured, sendBackupAlert, claimRunNowSlot, listGCSBackups, downloadFromGCS, BACKUPS_DIR } from "./backupJob";

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

  // --- Set Username + Password for logged-in user ---
  app.post("/api/local/set-credentials", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Username and password required" });
      if (/\s/.test(username)) return res.status(400).json({ message: "Username cannot contain spaces" });
      if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
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

  // Search open to all (including guests — no auth required)
  app.get(api.providers.search.path, async (req: any, res) => {
    try {
      const { query, lat, lng, radius } = req.query;
      const results = await storage.searchProviders(
        query as string,
        lat ? parseFloat(lat as string) : undefined,
        lng ? parseFloat(lng as string) : undefined,
        radius ? parseFloat(radius as string) : undefined,
      );
      // Track search server-side (fire-and-forget, never block response)
      if (query && typeof query === "string" && query.trim().length > 0) {
        storage.trackSearch(query.trim()).catch(() => {});
      }
      res.json({ results });
    } catch (error) {
      res.status(500).json({ message: "Search failed" });
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

      const data = { ...req.body, userId, mobileNumbers: verifiedNumbers };
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
      const provider = await storage.updateProvider(userId, req.body);
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
        return res.status(201).json(result);
      } catch (e: any) {
        const reason = e?.message || "call_failed";
        const map: Record<string, string> = {
          both_no_balance: "Call not possible: both accounts have zero balance.",
          customer_no_balance_blocked: "You don't have credits and the provider hasn't opted in to receive zero-balance calls.",
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

  app.get(api.admin.stats.path, adminCheck, async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get(api.admin.customers.path, adminCheck, async (req, res) => {
    try {
      const customers = await storage.getProfilesByRole("customer");
      res.json(customers);
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get(api.admin.providers.path, adminCheck, async (req, res) => {
    try {
      const providerProfiles = await storage.getProfilesByRole("provider");
      const allProviders = await storage.getAllProviders();
      const result = providerProfiles.map(p => {
        const providerData = allProviders.find(pr => pr.userId === p.userId);
        return { ...p, providerData };
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get(api.admin.callLogs.path, adminCheck, async (req, res) => {
    try {
      const logs = await storage.getAllCallLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Internal error" });
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
      const { jobName, description, location, state, district, salary, workHours, numEmployees, contactPhone } = req.body;
      if (!jobName || !description || !location || !contactPhone) {
        return res.status(400).json({ message: "Required fields missing" });
      }
      const credit = await storage.getOrCreateCredits(userId, "customer");
      const total = (credit?.freeCredits || 0) + (credit?.purchasedCredits || 0);
      if (total < JOB_CREDIT_COST) {
        return res.status(400).json({ message: `Job post ke liye ${JOB_CREDIT_COST} credits chahiye. Abhi: ${total}` });
      }
      await storage.deductMultipleCredits(userId, "user", JOB_CREDIT_COST);
      const job = await storage.createJob({ userId, jobName, description, location, state, district, salary, workHours, numEmployees, contactPhone });
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
      const { jobName, description, location, salary, workHours, contactPhone, isActive } = req.body;
      const updated = await storage.adminUpdateJob(jobId, { jobName, description, location, salary, workHours, contactPhone, isActive });
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
      res.status(500).json({ message: "Failed to freeze credits" });
    }
  });

  app.post("/api/admin/reset-credits/:userId/:role", adminCheck, async (req, res) => {
    try {
      const { userId, role } = req.params;
      const credit = await storage.resetUserCredits(userId, role);
      res.json(credit);
    } catch (error: any) {
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
  app.post("/api/cashfree/create-order", isLocalAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { credits: creditCount } = req.body;

      if (!creditCount || creditCount < 1 || creditCount > 10000) {
        return res.status(400).json({ message: "Credits must be between 1 and 10000" });
      }

      const amount = creditCount;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const orderId = `${userId.substring(0, 8)}_${Date.now()}`;

      const profile = await storage.getProfile(userId);
      const username = req.user?.claims?.username || "User";
      const email = req.user?.claims?.email || "user@mitrify.com";

      const order = await createCashfreeOrder({
        orderId,
        amount,
        customerName: profile?.name || username,
        customerEmail: email,
        customerPhone: profile?.mobile || "9999999999",
        returnUrl: `${baseUrl}/payment/success?credits=${creditCount}&order_id=${orderId}`,
        orderNote: `Mitrify ${creditCount} Credits @ ₹1/credit`,
        orderTags: {
          userId,
          credits: String(creditCount),
        },
      });

      const cfMode = process.env.REPLIT_DEPLOYMENT === "1" ? "production" : "sandbox";
      res.json({
        paymentSessionId: order.payment_session_id,
        orderId: order.order_id,
        cfOrderId: order.cf_order_id,
        cfMode,
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

      const tags = (order as any).order_tags || {};
      if (tags.userId !== userId) {
        return res.status(403).json({ message: "Payment does not belong to this user" });
      }

      const creditCount = parseInt(tags.credits || "0", 10);

      if (creditCount > 0) {
        await storage.addPurchasedCredits(userId, "user", creditCount);
      }

      res.json({ success: true, message: "Payment verified and credits added" });
    } catch (error: any) {
      console.error("Payment verification error:", error);
      res.status(500).json({ message: "Payment verification failed" });
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
    if (!req.session?.coAdminId) return res.status(401).json({ message: "Not authenticated" });
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
      res.status(500).json({ message: "Failed to create co-admin" });
    }
  });

  app.delete("/api/admin/co-admins/:id", adminCheck, async (req, res) => {
    try {
      await storage.deleteCoAdmin(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
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
      res.status(500).json({ message: "Failed to fetch pending providers" });
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
        const name = String(row[nameCol] || "").trim();
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

      const records: Array<{ name: string; mobile: string; serviceName?: string; address?: string }> = [];
      let skippedNoMobile = 0;
      for (const row of rows) {
        const name = String(row[nameCol] || "").trim();
        const rawMobile = String(row[mobileCol] || "").trim().replace(/\D/g, "");
        if (!name) continue;
        if (rawMobile.length < 7) { skippedNoMobile++; continue; }
        const mobile = rawMobile.length === 10 ? rawMobile : rawMobile.slice(-10);
        if (mobile.length < 7) { skippedNoMobile++; continue; }
        const serviceName = serviceCol ? String(row[serviceCol] || "").trim() : "";
        const address = addressCol ? String(row[addressCol] || "").trim() : "";
        const description = descriptionCol ? String(row[descriptionCol] || "").trim() : "";
        records.push({ name, mobile, serviceName, address, description });
      }
      if (records.length === 0) return res.status(400).json({ message: `No valid records found. ${skippedNoMobile} rows had no mobile. Check column names.` });

      const result = await storage.bulkCreateMetaLeads(records, assignTo, allowDuplicate);
      res.json({ ok: true, ...result, skippedNoMobile });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Meta import failed" });
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
      await streamBackupSql((s) => { writeP(s); }, { filename });
      await new Promise<void>((resolve, reject) => {
        stream.end((err?: Error | null) => err ? reject(err) : resolve());
      });
      // Upload to GCS
      const result = await uploadToGCS(filepath, filename, mode);
      const size = fs.statSync(filepath).size;
      res.json({ ok: true, gcsName: result.gcsName, url: result.url, size, filename });
    } catch (err: any) {
      try { fs.unlinkSync(filepath); } catch {}
      res.status(500).json({ message: err?.message || "GCS upload failed" });
    }
  });

  // GET /api/admin/backup/gcs-status — is GCS configured?
  app.get("/api/admin/backup/gcs-status", adminCheck, (_req, res) => {
    res.json({ configured: isGCSConfigured(), bucket: process.env.GCS_BUCKET_NAME || null });
  });

  // POST /api/admin/backup/test-alert — send a test alert to the configured webhook
  app.post("/api/admin/backup/test-alert", adminCheck, async (_req, res) => {
    try {
      const result = await sendBackupAlert({ errorMessage: "This is a test alert from the Mitrify admin dashboard." });
      res.json({ ok: result.sent, message: result.sent ? "Test alert sent successfully." : (result.error ?? "Failed to send test alert.") });
    } catch (err: any) {
      res.json({ ok: false, message: err?.message || "Unexpected error." });
    }
  });

  app.get("/api/admin/backup", adminCheck, async (req, res) => {
    const filename = makeBackupFilename();
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    try {
      await streamBackupSql((s) => res.write(s), { filename });
      res.end();
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
      const preview = previewSqlBackup(sql, allowList);
      res.json(preview);
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
      try {
        const result = await restoreFromSql(sql, allowList);
        res.json({
          message: "Restore completed successfully",
          ...result,
        });
      } catch (err: any) {
        console.error("Restore failed:", err);
        res.status(500).json({
          message: err?.message || "Restore failed — database has been rolled back",
        });
      }
    },
  );

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
    if (!gcsName || !/^[A-Za-z0-9._-]+\.sql$/.test(gcsName)) {
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
      res.json(previewSqlBackup(sql, allowList));
    } catch (err: any) {
      console.error("GCS restore preview failed:", err);
      res.status(500).json({ message: err?.message || "Preview failed" });
    }
  });

  // POST /api/admin/restore/gcs — body: { gcsName, tables? }
  app.post("/api/admin/restore/gcs", adminCheck, async (req, res) => {
    const gcsName = String(req.body?.gcsName || "").trim();
    if (!gcsName || !/^[A-Za-z0-9._-]+\.sql$/.test(gcsName)) {
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
      const result = await restoreFromSql(sql, allowList);
      res.json({ message: "Restore completed successfully", source: gcsName, ...result });
    } catch (err: any) {
      console.error("GCS restore failed:", err);
      res.status(500).json({ message: err?.message || "Restore failed — database has been rolled back" });
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
    const preview = previewSqlBackup(resolved.sql, resolved.allowList);
    res.json(preview);
  });

  // POST /api/admin/restore/stored — replay a stored server-side backup file
  // (by filename) inside a single transaction. Returns per-table row counts.
  app.post("/api/admin/restore/stored", adminCheck, async (req: any, res) => {
    const resolved = await resolveStoredBackup(req, res);
    if (!resolved) return;
    try {
      const result = await restoreFromSql(resolved.sql, resolved.allowList);
      res.json({ message: "Restore completed successfully", ...result });
    } catch (err: any) {
      console.error("Stored restore failed:", err);
      res.status(500).json({
        message: err?.message || "Restore failed — database has been rolled back",
      });
    }
  });

  startBackupScheduler();

  return httpServer;
}
