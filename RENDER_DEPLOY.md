# Mitrify — Render Par FREE Deploy Karne Ki Complete Guide

> Railway ki jagah ab **Render.com** use kar rahe hain — free tier pe start
> ho jaata hai. Database ke liye **Neon.tech** (free PostgreSQL) use karenge.
>
> **Note:** Secret keys ke liye Replit wali `RAILWAY_ENV_VARS.txt` file dekhein —
> naam bhale Railway ho, values wahi yahan bhi lagengi.

---

## STEP 1: Neon Par FREE Database Banao (5 minute)

> Render ka apna free database 30 din baad expire ho jaata hai — isliye Neon
> use karo, wo hamesha free rehta hai.

1. **[neon.tech](https://neon.tech)** par jao → "Sign Up" → **GitHub se login karo**
2. "Create a project" mein:
   - Project name: `mitrify`
   - Region: **AWS Asia Pacific (Singapore)** select karo (India ke sabse paas)
3. Project ban'ne ke baad dashboard par **"Connect"** button click karo
4. **Connection string** copy karo — aisi dikhegi:
   ```
   postgresql://neondb_owner:xxxxx@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
5. Isse kahin save kar lo — **STEP 3 mein chahiye hogi**

---

## STEP 2: Render Account Banao

1. **[render.com](https://render.com)** par jao
2. "Get Started" → **GitHub se login karo** (same GitHub account jisme mitrify repo hai)

---

## STEP 3: App Deploy Karo (Blueprint se — automatic)

1. Render dashboard mein **"New +"** → **"Blueprint"** click karo
2. GitHub repo connect karo: `mitrify` select karo
   (pehli baar Render ko GitHub access dena padega — "Configure account" se repo allow karo)
3. Render ko repo mein `render.yaml` mil jayega — service ka naam `mitrify` dikhega
4. **DATABASE_URL** ka box aayega — **STEP 1 wali Neon connection string paste karo**
5. **"Apply"** click karo → build shuru hoga (5-7 minute lagenge)

> Database tables **khud ban jaayenge** app ke pehli baar start hote hi —
> koi SQL manually chalane ki zaroorat NAHI hai.

---

## STEP 4: Baaki Environment Variables Add Karo

Render dashboard → `mitrify` service → **"Environment"** tab → "Add Environment Variable":

```
GMAIL_USER            = (RAILWAY_ENV_VARS.txt se)
GMAIL_APP_PASSWORD    = (RAILWAY_ENV_VARS.txt se)

GOOGLE_CLIENT_ID      = (RAILWAY_ENV_VARS.txt se)
GOOGLE_CLIENT_SECRET  = (RAILWAY_ENV_VARS.txt se)

CASHFREE_APP_ID       = (RAILWAY_ENV_VARS.txt se)
CASHFREE_SECRET_KEY   = (RAILWAY_ENV_VARS.txt se)

VITE_FIREBASE_API_KEY     = (RAILWAY_ENV_VARS.txt se)
VITE_FIREBASE_AUTH_DOMAIN = (RAILWAY_ENV_VARS.txt se)
VITE_FIREBASE_PROJECT_ID  = (RAILWAY_ENV_VARS.txt se)

GOOGLE_API_KEY        = (RAILWAY_ENV_VARS.txt se — Gemini/Places ke liye)

ADMIN_ID              = (naya admin username set karo)
ADMIN_PASSWORD        = (naya strong password set karo)
ADMIN_PHONE           = (admin phone number)

APPLE_TEAM_ID         = (RAILWAY_ENV_VARS.txt se — agar Apple login chahiye)
APPLE_CLIENT_ID       = (RAILWAY_ENV_VARS.txt se)
APPLE_KEY_ID          = (RAILWAY_ENV_VARS.txt se)
APPLE_PRIVATE_KEY     = (RAILWAY_ENV_VARS.txt se — poori .p8 file)
```

> **Important:** `ADMIN_ID` / `ADMIN_PASSWORD` zaroor set karo — nahi toh code
> wale purane default credentials chalenge jo secure nahi hain.

Variables save karte hi Render **automatically redeploy** karega (2-5 minute).

> `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV` pehle se set hain (Step 3 mein) —
> unhe dobara add karne ki zaroorat nahi.

---

## STEP 5: Deployment Test Karo

1. Render dashboard mein service ka URL dikhega: `https://mitrify.onrender.com`
   (ya jo naam mila ho)
2. Browser mein kholo — app khulni chahiye
3. `https://mitrify.onrender.com/health` kholo — `{"status":"ok"}` dikhna chahiye
4. **"Logs"** tab mein `serving on port` aur
   `[ensureSchema] all 22 tables verified` dikhna chahiye

---

## STEP 6: Purana Data Import Karo (sirf agar purana data hai)

Agar aapke paas purana data hai (users, providers, etc.):

1. **[neon.tech](https://neon.tech)** dashboard → apna project → **"SQL Editor"** kholo
2. Replit wali `railway_data_import.sql` file ka poora content paste karo → **Run**

Naya start kar rahe ho? — Yeh step **skip** karo.

---

## STEP 7: mitrify.com Domain Connect Karo

### Render mein:
1. `mitrify` service → **"Settings"** → **"Custom Domains"**
2. **"Add Custom Domain"** → `mitrify.com` add karo → phir `www.mitrify.com` bhi add karo
3. Render har domain ke liye **exact DNS records** dikhayega — wahi use karne hain
   (typically: `mitrify.com` ke liye **A record → 216.24.57.1**,
   `www` ke liye **CNAME → mitrify.onrender.com`)

### Hostinger mein (hpanel.hostinger.com):
1. **Domains** → **mitrify.com** → **DNS / Zone** kholo
2. Purane **A records** aur purana **CNAME** (agar Railway wala hai) delete karo
3. Render ne jo records dikhaye wahi add karo:
   - Type: **A**, Name: **@**, Value: **216.24.57.1** (ya jo IP Render ne dikhaya)
   - Type: **CNAME**, Name: **www**, Value: **mitrify.onrender.com** (apna onrender URL)
4. Save karo

> DNS change hone mein 15–60 minute lagte hain. Render "Certificate Issued"
> dikhayega jab HTTPS ready ho jayega — uske baad **mitrify.com live!**

---

## STEP 8: Google OAuth Fix (zaroori!)

Google Cloud Console mein jao:
**APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs**

Yeh URLs add karo (jo pehle se hain unhe rehne do):
```
https://mitrify.onrender.com/api/auth/google/callback
https://mitrify.com/api/auth/google/callback
https://www.mitrify.com/api/auth/google/callback
```
(`mitrify.onrender.com` ki jagah apna actual Render URL likhna)

> Apple login use karte ho toh Apple Developer Console mein bhi
> `https://mitrify.com/api/auth/apple/callback` return URL hona chahiye
> (SETUP_README.md mein detail hai).

---

## Free Tier Ki Ek Zaroori Baat

Render ka **free plan** 15 minute tak koi visitor na aaye toh app ko **sula
deta hai** — agla visitor aane par app ~30-50 second mein uthti hai (pehli
request slow lagegi, uske baad normal).

Jab users badh jaayein aur 24x7 fast chahiye ho:
**Settings → Instance Type → "Starter" ($7/month)** upgrade kar dena —
phir app kabhi nahi soyegi aur raat wale automatic backup jobs bhi
time par chalenge.

---

## mitrify.com live! ✓
