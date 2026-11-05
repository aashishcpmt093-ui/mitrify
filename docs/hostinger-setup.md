# Hostinger पर Mitrify चालू करना (database और admin login)

`mitrify.com` Hostinger की hosting से चलता है (DNS में `mitrify.com.cdn.hstgr.net`)। Auto-deploy चालू है,
यानी GitHub की `main` branch में merge होते ही नया code अपने-आप deploy होता है।

सारी settings Hostinger में: साइट `mitrify.com` → **Node.js** / **Environment variables** में जोड़ें, फिर **Redeploy**।

## 1. Database (Neon PostgreSQL)

Neon में project खोलें → **Connect** दबाएं → **Parameters only** चुनें। वहां ये मान अलग-अलग दिखते हैं।
इन्हें Hostinger में **इन्हीं नामों से** जोड़ें:

| Hostinger में नाम | Neon से क्या कॉपी करें |
|---|---|
| `PGHOST` | Host (जैसे `ep-....neon.tech`) |
| `PGUSER` | User / Role |
| `PGPASSWORD` | Password |
| `PGDATABASE` | Database |
| `PGSSLMODE` | `require` (न डालें तो भी यही माना जाता है) |

Password में `@`, `#`, `/` जैसे चिह्न हों तो भी चलता है। Code उन्हें खुद सुरक्षित कर लेता है।
अगर आप पहले से पूरा `DATABASE_URL` डालते हैं, तो वही चलेगा और ऊपर के मान इस्तेमाल नहीं होंगे।

> **Password बदलना:** पुराना database password git में खुला पड़ा था। Neon में **Connect** वाली window में
> **Reset password** है। उससे नया password लेकर `PGPASSWORD` में डालें।
> पुराना password जारी रखने पर वह git history में हमेशा के लिए खुला रहेगा।

## 2. Login और sessions

| नाम | मान |
|---|---|
| `SESSION_SECRET` | कोई भी लंबा random text (40+ अक्षर) |
| `ADMIN_ID` | आपका admin नाम |
| `ADMIN_PASSWORD` | कम से कम 10 अक्षर, मज़बूत |

## 3. जांच

Redeploy के बाद Hostinger के **Logs** में **ये line नहीं** दिखनी चाहिए:

- `DATABASE_URL is not set: database features are disabled`
- `[startup] FAILED`

और ये दिखनी चाहिए: `[db] DATABASE_URL was built from PGHOST / PGUSER / PGPASSWORD / PGDATABASE.`
अधूरी settings हों तो log में सिर्फ़ **नाम** लिखे आते हैं कि कौन-सा गायब है (मान कभी नहीं)।

## 4. बाद में (अपनी मर्ज़ी से)

- `MITRIFY_ADMIN_ONLY=1`: पूरी साइट सिर्फ़ admin के लिए। विस्तार `docs/admin-only.md` में।
- Razorpay secret भी बदलें, वह भी git में खुला मिला था।
