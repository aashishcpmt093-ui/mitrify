# Mitrify — Railway Par Deploy Karne Ki Complete Guide

> **Note:** Actual keys aur passwords ke liye `RAILWAY_ENV_VARS.txt` file dekhein
> (yeh file gitignored hai — sirf aapke Replit mein hai, GitHub par nahi jayegi)

---

## STEP 1: GitHub Par Code Upload Karo

**Replit mein:**
1. Left sidebar mein **Git icon** (branch/fork wala icon) click karo
2. "Create a GitHub repository" option aayega
3. Repo name: `mitrify-app`
4. **Private** select karo (zaroori hai — secrets protect karne ke liye)
5. "Create Repository" click karo → sab files GitHub par upload ho jaayengi

---

## STEP 2: Railway Account Banao

1. **[railway.app](https://railway.app)** par jao
2. "Start a New Project" click karo
3. **GitHub se login karo** (same GitHub account)

---

## STEP 3: Railway Par App Deploy Karo

1. "Deploy from GitHub repo" click karo
2. `mitrify-app` repo select karo
3. Railway automatically build shuru karega (2-3 minute lagenge)

---

## STEP 4: PostgreSQL Database Add Karo

1. Railway project dashboard mein **"+ New"** button click karo
2. **"Database"** → **"Add PostgreSQL"** click karo
3. Database create hone ke baad, uske **"Variables"** tab mein jaao
4. `DATABASE_URL` copy karo — baad mein chahiye hoga

---

## STEP 5: Purana Data Import Karo (sirf agar purana data hai)

> **Good news:** Database schema (tables) ab **automatic** ban jaata hai — app
> start hote hi khud saare tables create kar leta hai. Koi migration SQL
> manually chalane ki zaroorat NAHI hai.

Agar aapke paas purana data hai (users, providers, etc.):

Railway PostgreSQL service click karo → **"Query"** tab kholo →
`railway_data_import.sql` ka poora content copy karke paste karo aur Run karo

> Yeh file Replit project mein hai — Download/copy karke Railway mein paste karo.
> **Important:** Data import se PEHLE app ko ek baar deploy/start hone do
> (taaki tables ban jaayein).

Agar bilkul naya start kar rahe ho (koi purana data nahi) — yeh step **skip** karo.

---

## STEP 6: Environment Variables Set Karo

Railway mein apni **App service** click karo → **"Variables"** tab → har variable add karo:

```
DATABASE_URL        = (Step 4 mein copy kiya tha)
SESSION_SECRET      = (RAILWAY_ENV_VARS.txt se dekhein)
NODE_ENV            = production

GMAIL_USER          = (RAILWAY_ENV_VARS.txt se)
GMAIL_APP_PASSWORD  = (RAILWAY_ENV_VARS.txt se)

GOOGLE_CLIENT_ID    = (RAILWAY_ENV_VARS.txt se)
GOOGLE_CLIENT_SECRET = (RAILWAY_ENV_VARS.txt se)

APPLE_TEAM_ID       = (RAILWAY_ENV_VARS.txt se)
APPLE_CLIENT_ID     = (RAILWAY_ENV_VARS.txt se)
APPLE_KEY_ID        = (RAILWAY_ENV_VARS.txt se)
APPLE_PRIVATE_KEY   = (RAILWAY_ENV_VARS.txt se — poori .p8 file)

CASHFREE_APP_ID     = (RAILWAY_ENV_VARS.txt se)
CASHFREE_SECRET_KEY = (RAILWAY_ENV_VARS.txt se)

VITE_FIREBASE_API_KEY      = (RAILWAY_ENV_VARS.txt se)
VITE_FIREBASE_AUTH_DOMAIN  = (RAILWAY_ENV_VARS.txt se)
VITE_FIREBASE_PROJECT_ID   = (RAILWAY_ENV_VARS.txt se)
```

> **Important:** Variables add karne ke baad Railway automatically redeploy karega

---

## STEP 7: Deployment Verify Karo

1. **"Deployments"** tab mein jaao
2. Latest deployment ki logs dekhо
3. "Server is running on port 5000" message aana chahiye
4. Railway ka temporary URL milega (xxx.up.railway.app) — isko browser mein kholo aur test karo

---

## STEP 8: mitrify.com Domain Connect Karo

### Railway mein:
1. App service → **"Settings"** → **"Domains"** mein jaao
2. **"Add Custom Domain"** click karo
3. `mitrify.com` type karo
4. Railway ek CNAME value dega (kuch aisa: `xxx.up.railway.app`)

### Hostinger mein (hpanel.hostinger.com):
1. **Domains** → **mitrify.com** → **DNS / Zone** mein jaao
2. Pehle wale **A records** delete karo (jo engineer ne lagaye the)
3. Naya record add karo:
   - Type: **CNAME**
   - Name: **@** (ya blank/root)
   - Value: **Railway ka domain** (xxx.up.railway.app)
   - TTL: 3600 (1 hour)
4. Save karo

> DNS change hone mein 15–60 minute lagte hain. Uske baad mitrify.com live hoga!

---

## Google OAuth Fix (zaroori!)

Google Cloud Console mein jaao:
**APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs**

Yeh URL add karo:
```
https://mitrify.com/api/auth/google/callback
```

---

## mitrify.com phir se live! ✓
