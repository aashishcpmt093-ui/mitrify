import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import AppleStrategy from "passport-apple";
import jwt from "jsonwebtoken";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { storage } from "../../storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 30 * 24 * 60 * 60 * 1000; // 30 days
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
    errorLog: (err: any) => console.error("Session store error (server kept alive):", err.message),
  });
  const isProduction = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: sessionTtl,
      path: "/",
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = async (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const config = await getOidcConfig();
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", async (req, res, next) => {
    try {
      await ensureStrategy(req.hostname);
      passport.authenticate(`replitauth:${req.hostname}`, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Auth service unavailable" });
    }
  });

  app.get("/api/callback", async (req, res, next) => {
    try {
      await ensureStrategy(req.hostname);
      passport.authenticate(`replitauth:${req.hostname}`, {
        successReturnToOrRedirect: "/select-role",
        failureRedirect: "/api/login",
      })(req, res, next);
    } catch (error) {
      console.error("Callback error:", error);
      res.redirect("/api/login");
    }
  });

  app.get("/api/logout", async (req, res) => {
    try {
      const config = await getOidcConfig();
      req.logout(() => {
        res.redirect(
          client.buildEndSessionUrl(config, {
            client_id: process.env.REPL_ID!,
            post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
          }).href
        );
      });
    } catch (error) {
      req.logout(() => {
        res.redirect("/");
      });
    }
  });

  const googleClientId = (process.env.GOOGLE_CLIENT_ID || "").replace(/^https?:\/\//, "").trim();
  const googleClientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").replace(/^https?:\/\//, "").trim();

  if (googleClientId && googleClientSecret) {
    const allowedHosts = new Set<string>();
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => allowedHosts.add(d.trim()));
    }
    // Railway auto-injects RAILWAY_PUBLIC_DOMAIN — register it so the
    // production app on Railway uses its own callback URL instead of
    // falling back to www.mitrify.com (which causes redirect_uri_mismatch
    // until DNS is switched over).
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      allowedHosts.add(process.env.RAILWAY_PUBLIC_DOMAIN.trim());
    }
    allowedHosts.add("mitrify-production.up.railway.app");
    allowedHosts.add("www.mitrify.com");
    allowedHosts.add("mitrify.com");

    const googleVerify = async (_accessToken: any, _refreshToken: any, profile: any, done: any) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error("No email returned from Google"));
        }

        let user = await storage.getLocalUserByEmail(email);
        if (user?.isBlocked) {
          return done(null, false, { message: "Aapka account block kar diya gaya hai." });
        }
        if (!user) {
          user = await storage.createLocalUser({
            email,
            username: null,
            password: null,
            phone: null,
            role: "customer",
            authMethod: "google",
          });
        }

        done(null, { localUserId: user.userId, email });
      } catch (err) {
        done(err as Error);
      }
    };

    const getCallbackURL = (hostname: string): string => {
      if (hostname === "mitrify-production.up.railway.app") {
        return `https://mitrify-production.up.railway.app/api/auth/google/callback`;
      }
      if (hostname === "mitrify.com" || hostname === "www.mitrify.com") {
        return `https://${hostname}/api/auth/google/callback`;
      }
      return `https://mitrify-production.up.railway.app/api/auth/google/callback`;
    };

    const registeredGoogleStrategies = new Set<string>();

    const ensureGoogleStrategy = (hostname: string) => {
      const strategyName = `google-${hostname}`;
      if (!registeredGoogleStrategies.has(strategyName)) {
        passport.use(
          strategyName,
          new GoogleStrategy(
            {
              clientID: googleClientId,
              clientSecret: googleClientSecret,
              callbackURL: getCallbackURL(hostname),
              scope: ["profile", "email"],
            },
            googleVerify
          )
        );
        registeredGoogleStrategies.add(strategyName);
      }
      return strategyName;
    };

    app.get("/api/auth/google", (req, res, next) => {
      const strategyName = ensureGoogleStrategy(req.hostname);
      passport.authenticate(strategyName, {
        scope: ["profile", "email"],
        prompt: "select_account",
      })(req, res, next);
    });

    app.get("/api/auth/google/callback", (req, res, next) => {
      const strategyName = ensureGoogleStrategy(req.hostname);
      passport.authenticate(strategyName, { failureRedirect: "/welcome" }, (err: any, user: any) => {
        if (err || !user) {
          console.error("Google auth error:", err);
          return res.redirect("/welcome");
        }
        req.login(user, (loginErr) => {
          if (loginErr) {
            console.error("Session login error:", loginErr);
            return res.redirect("/welcome");
          }
          (req.session as any).localUserId = user.localUserId;
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("Session save error:", saveErr);
            }
            res.redirect("/select-role");
          });
        });
      })(req, res, next);
    });

    console.log(`Google OAuth strategy registered (clientId: ${googleClientId.substring(0, 15)}...)`);
  } else {
    console.warn("Google OAuth not configured: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing");
  }

  const appleTeamId = process.env.APPLE_TEAM_ID;
  const appleClientId = process.env.APPLE_CLIENT_ID;
  const appleKeyId = process.env.APPLE_KEY_ID;
  const applePrivateKey = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n").replace(/^ +| +$/gm, (m, offset, str) => str[offset] === '-' ? m : '');

  if (appleTeamId && appleClientId && appleKeyId && applePrivateKey) {
    const appleAllowedHosts = new Set<string>();
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => appleAllowedHosts.add(d.trim()));
    }
    appleAllowedHosts.add("www.mitrify.com");
    appleAllowedHosts.add("mitrify.com");

    const getAppleCallbackURL = (hostname: string): string => {
      if (appleAllowedHosts.has(hostname)) {
        return `https://${hostname}/api/auth/apple/callback`;
      }
      return `https://mitrify.com/api/auth/apple/callback`;
    };

    const registeredAppleStrategies = new Set<string>();

    const ensureAppleStrategy = (hostname: string) => {
      const strategyName = `apple-${hostname}`;
      if (!registeredAppleStrategies.has(strategyName)) {
        passport.use(
          strategyName,
          new AppleStrategy(
            {
              clientID: appleClientId!,
              teamID: appleTeamId!,
              keyID: appleKeyId!,
              privateKeyString: applePrivateKey!,
              callbackURL: getAppleCallbackURL(hostname),
              passReqToCallback: false,
            },
            async (accessToken: any, refreshToken: any, idToken: any, profile: any, done: any) => {
              try {
                let email: string | undefined;

                if (typeof idToken === "string") {
                  const decoded = jwt.decode(idToken) as any;
                  email = decoded?.email;
                  console.log("Apple idToken decoded:", { email, sub: decoded?.sub });
                } else if (idToken && typeof idToken === "object") {
                  email = idToken.email;
                }

                if (!email) {
                  email = profile?.email || profile?.emails?.[0]?.value;
                }

                if (!email) {
                  console.error("Apple auth: no email found in idToken or profile", { idToken, profile });
                  return done(new Error("No email returned from Apple"));
                }

                let user = await storage.getLocalUserByEmail(email);
                if (!user) {
                  user = await storage.createLocalUser({
                    email,
                    username: null,
                    password: null,
                    phone: null,
                    role: "customer",
                    authMethod: "apple",
                  });
                }

                done(null, { localUserId: user.userId, email });
              } catch (err) {
                console.error("Apple verify error:", err);
                done(err as Error);
              }
            }
          )
        );
        registeredAppleStrategies.add(strategyName);
      }
      return strategyName;
    };

    app.get("/api/auth/apple", (req, res, next) => {
      const strategyName = ensureAppleStrategy(req.hostname);
      passport.authenticate(strategyName, {
        scope: ["name", "email"],
      })(req, res, next);
    });

    app.post("/api/auth/apple/callback", (req, res, next) => {
      const strategyName = ensureAppleStrategy(req.hostname);
      passport.authenticate(strategyName, { failureRedirect: "/welcome" }, (err: any, user: any) => {
        if (err || !user) {
          console.error("Apple auth error:", err);
          return res.redirect("/welcome");
        }
        req.login(user, (loginErr) => {
          if (loginErr) {
            console.error("Apple session login error:", loginErr);
            return res.redirect("/welcome");
          }
          (req.session as any).localUserId = user.localUserId;
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("Apple session save error:", saveErr);
            }
            res.redirect("/select-role");
          });
        });
      })(req, res, next);
    });

    console.log(`Apple Sign In strategy registered (clientId: ${appleClientId})`);
  } else {
    console.warn("Apple Sign In not configured: APPLE_TEAM_ID, APPLE_CLIENT_ID, APPLE_KEY_ID, or APPLE_PRIVATE_KEY missing");
  }
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
