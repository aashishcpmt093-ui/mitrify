# Mitrify AI Gateway — `gateway.mitrify.com`

NavBharatAI → **Mitrify Gateway** → provider (पहले Surplus) → AI model, और जवाब उसी रास्ते से वापस।

इस pilot का दायरा: **सिर्फ़ सिंपल चैट**, सिर्फ़ owner/internal इस्तेमाल। App Builder अभी नहीं जुड़ा है।

---

## 1. यह कैसे काम करता है

- Gateway उसी Mitrify server के अंदर एक अलग module है (`server/gateway/`)। यह **सिर्फ़ उन requests का जवाब देता है जिनका host `gateway.mitrify.com` हो।** `mitrify.com` के बाकी सारे पेज और API पहले जैसे चलते हैं।
- `MITRIFY_GATEWAY_ENABLED=1` न हो, तो gateway कुछ भी नहीं करता।
- Gateway का database हिस्सा अलग tables में है (`gateway_*`)। Marketplace के data को यह न पढ़ता है, न बदलता है।

### Endpoints

| Endpoint | किसके लिए | Auth |
|---|---|---|
| `POST /v1/chat/completions` | चैट (streaming और non-streaming) | `Authorization: Bearer mtf_live_...` |
| `GET /v1/models` | उपलब्ध models की list | वही key |
| `GET /healthz` | server चालू है या नहीं | कोई नहीं |
| `/admin/*` | keys, prices, kill switch, usage | `X-Mitrify-Setup-Code` header |

### दो modes

| Mode | NavBharatAI क्या भेजे | Gateway क्या करता है |
|---|---|---|
| **Pinned** | exact model, जैसे `"model": "deepseek-chat"` (ज़रूरत हो तो `X-Mitrify-Provider: surplus` header) | Request body **byte-for-byte** आगे जाती है। कोई fallback नहीं। |
| **Auto-cheap** | `"model": "mitrify/auto-cheap"` | आज के pool का सबसे सस्ता model चुनता है और **सिर्फ़ `model` की value बदलता है**। बाकी हर byte वैसा ही रहता है। |

हर जवाब में ये headers आते हैं: `X-Mitrify-Request-Id`, `X-Mitrify-Provider`, `X-Mitrify-Model`, `X-Mitrify-Mode`, `X-Mitrify-Attempts`।

### Gateway क्या कभी नहीं करता

- Prompt, system message, history, temperature, max_tokens या tools नहीं बदलता।
- जवाब नहीं बदलता, cache नहीं करता, streaming events का क्रम नहीं बदलता, पूरा stream रोककर नहीं रखता।
- NavBharatAI की key या कोई client header provider तक नहीं भेजता। सिर्फ़ provider की अपनी key जाती है।
- Prompt और जवाब का content न database में रखता है, न logs में।
- Client को upstream URL चुनने नहीं देता। Provider के URL सिर्फ़ server की settings में होते हैं, और सिर्फ़ `https://`।

### Fallback के नियम

- Fallback सिर्फ़ auto-cheap mode में होता है, और सिर्फ़ आज के pool के अंदर।
- दूसरा model तभी आज़माया जाता है जब provider ने **काम शुरू होने से पहले ही मना किया हो**: connection refused, `429` या `503`। ज़्यादा से ज़्यादा 2 कोशिशें होती हैं।
- `500`, timeout, या stream शुरू होने के बाद की गड़बड़ी पर **दोबारा कोशिश नहीं होती**, क्योंकि हो सकता है काम शुरू हो चुका हो।
- Stream बीच में टूटे तो gateway connection काट देता है। इससे NavBharatAI को error मिलता है और वह अधूरे जवाब को पूरा नहीं मान सकता।

### Streaming और billing

- Streaming request में `"stream_options": {"include_usage": true}` भेजना **ज़रूरी** है। Gateway इसे खुद नहीं जोड़ता, क्योंकि request बदलना मना है। इसके बिना request `400 usage_required` से लौटती है, ताकि हर request का खर्च गिना जा सके।
- खर्च = provider की listed कीमत × tokens, **0% markup**। Cached tokens की कीमत अलग गिनी जाती है।
- Provider usage न बताए तो खर्च `unknown` लिखा जाता है, अंदाज़े से नहीं भरा जाता।
- हर request का estimated खर्च तुरंत रिकॉर्ड होता है। Provider के bill से मिलान करके `reconciled` खर्च अलग column में आता है।

---

## 2. पहली बार चालू करना (owner के लिए)

> **ज़रूरी बात:** Audit में पता चला कि Mitrify का server **Render** पर चलता है (`render.yaml`), और **Hostinger पर सिर्फ़ DNS** है। इसलिए environment variables **Render dashboard** में डालने हैं, Hostinger में नहीं। Hostinger में सिर्फ़ एक DNS record जुड़ेगा।

### Step 1: Setup code बनाएं

अपने computer पर चलाएं (या कोई भी 32+ अक्षरों का random password manager वाला code लें):

```bash
openssl rand -base64 36
```

इसे password manager में सुरक्षित रखें। **यही code API key बनाने की चाबी है।** इसके बिना कोई भी, admin भी, key नहीं बना सकता।

### Step 2: Render में environment variables डालें

Render → `mitrify` service → **Environment** में ये डालें (पूरी list `docs/ai-gateway.env.example` में है):

```
MITRIFY_GATEWAY_ENABLED=1
MITRIFY_GATEWAY_SETUP_CODE=<Step 1 वाला code>
MITRIFY_GATEWAY_DAILY_BUDGET_USD=2
MITRIFY_GATEWAY_TRUST_PROXY=1
MITRIFY_SURPLUS_API_KEY=<Surplus की key>
MITRIFY_SURPLUS_BASE_URL=<Surplus के official docs वाला https base URL>
MITRIFY_SURPLUS_APPROVED=1        ← Surplus की terms जांचने के बाद ही
MITRIFY_SURPLUS_MAX_CONCURRENCY=<Surplus की असली limit>
```

Save करने पर Render service restart करेगा।

### Step 3: Subdomain जोड़ें

1. **Render:** `mitrify` service → Settings → Custom Domains → `gateway.mitrify.com` जोड़ें। Render एक CNAME target दिखाएगा (आमतौर पर `mitrify.onrender.com`)।
2. **Hostinger** (hpanel → Domains → mitrify.com → DNS): नया record जोड़ें: Type **CNAME**, Name **gateway**, Value **वही target जो Render ने दिखाया**।
3. Render में "Certificate Issued" दिखने का इंतज़ार करें।

जांच: `curl https://gateway.mitrify.com/healthz` का जवाब `{"status":"ok"}` आना चाहिए।

### Step 4: कीमतें डालें (official pricing page से)

हर model के लिए provider के **official pricing page** से कीमत लें (USD प्रति 10 लाख tokens), और वह link और तारीख़ भी साथ भेजें:

```bash
CODE='<setup code>'
curl -X PUT https://gateway.mitrify.com/admin/prices \
  -H "X-Mitrify-Setup-Code: $CODE" -H "content-type: application/json" \
  -d '[{"provider":"surplus","upstreamModel":"<model id from Surplus docs>",
        "inputPerMTokUsd":0.27,"outputPerMTokUsd":1.10,"cachedInputPerMTokUsd":0.07,
        "sourceUrl":"https://<surplus official pricing page>","verifiedAt":"2026-11-05",
        "contextLength":64000,"supportsStreaming":true,"qualityPassed":false}]'
```

- `qualityPassed: false` से शुरू करें। ऐसा model **pinned mode** में चल सकता है लेकिन **auto-cheap pool** में नहीं आता। 20–30 चैट सवालों पर जांचने के बाद इसे `true` करें।
- 30 दिन से पुरानी कीमत pool से अपने-आप बाहर हो जाती है। इसलिए कीमत दोबारा जांचें और `verifiedAt` बदलें।

फिर pool बनाएं:

```bash
curl -X POST https://gateway.mitrify.com/admin/catalog/refresh -H "X-Mitrify-Setup-Code: $CODE" -H "content-type: application/json" -d '{}'
```

Pool अपने-आप हर 24 घंटे में दोबारा बनता है। अगर किसी दिन refresh fail हो, तो पिछले दिन का pool चलता रहता है।

### Step 5: NavBharatAI के लिए API key बनाएं

```bash
curl -X POST https://gateway.mitrify.com/admin/keys \
  -H "X-Mitrify-Setup-Code: $CODE" -H "content-type: application/json" \
  -d '{"name":"navbharatai-chat","dailyBudgetUsd":1,"rpm":600,"expiresInDays":90}'
```

जवाब में `key` (`mtf_live_...`) **सिर्फ़ एक बार** दिखती है। Database में सिर्फ़ उसका hash रहता है। इसे NavBharatAI के **server** settings में रखें, app या browser में नहीं।

### Step 6: NavBharatAI में लगाएं (सिर्फ़ चैट)

```
Base URL:  https://gateway.mitrify.com/v1
API key:   mtf_live_...
Model:     mitrify/auto-cheap   (या pinned model id)
Streaming: "stream_options": {"include_usage": true} ज़रूर भेजें
```

Direct-Surplus वाला पुराना रास्ता **हटाएं नहीं**। एक switch रखें (`AI_BASE_URL = direct | mitrify`), ताकि वापस जाना एक बदलाव का काम हो।

---

## 3. रोज़ का काम

```bash
H="-H X-Mitrify-Setup-Code:$CODE -H content-type:application/json"
curl $H https://gateway.mitrify.com/admin/status            # providers, circuit, queue, आज का खर्च
curl $H "https://gateway.mitrify.com/admin/usage?hours=24"   # खर्च का हिसाब (markup 0%)
curl $H https://gateway.mitrify.com/admin/catalog           # आज के top-10 और कौन क्यों बाहर हुआ
curl $H https://gateway.mitrify.com/admin/keys              # keys (बिना key और hash के)
curl $H https://gateway.mitrify.com/admin/audit             # कौन-सा admin काम कब हुआ
```

| काम | Command |
|---|---|
| पूरा gateway बंद | `POST /admin/kill` `{"enabled":true}`। चालू करना: `{"enabled":false}` |
| Database के बिना भी बंद | Render में `MITRIFY_GATEWAY_KILL=1` डालें |
| एक provider बंद | `POST /admin/providers/surplus/disable` `{"disabled":true}` |
| Key तुरंत रद्द | `POST /admin/keys/<id>/revoke` |
| Key बदलें | `POST /admin/keys/<id>/rotate` (नई key मिलती है, पुरानी 24 घंटे और चलती है) |
| Provider के bill से मिलान | `POST /admin/usage/<requestId>/reconcile` `{"costUsd":0.0012}` |

---

## 4. सुरक्षा

- **Setup code:** हर admin काम के लिए ज़रूरी है। गलत code पर 5 कोशिशों के बाद वह IP 15 मिनट के लिए lock हो जाता है। किसी भी जगह से एक घंटे में 20 गलत कोशिशें हों तो सारे admin काम एक घंटे के लिए बंद हो जाते हैं। हर गलत कोशिश audit log में दर्ज होती है।
- Code का environment में न होना, या 32 अक्षरों से छोटा होना = admin पूरी तरह बंद।
- Marketplace का admin login (`/admin/login`) gateway को **नहीं** खोलता। दोनों पूरी तरह अलग हैं।
- Client keys: 256-bit random, सिर्फ़ sha256 hash store होता है। हर key का अपना scope, rate limit, daily budget और expiry है।
- Provider keys सिर्फ़ server environment में रहती हैं। किसी response, status page या log में नहीं आतीं। Status page पर सिर्फ़ `apiKeyConfigured: true` दिखता है।
- Request body की सीमा 8 MB है। एक ही JSON में दो `model` keys हों (parser को धोखा देने की कोशिश) तो request reject होती है।

**सच्चाई:** setup code एक मज़बूत shared secret है, पूरी MFA नहीं। Admin IP allowlist (`MITRIFY_GATEWAY_ADMIN_IPS`) लगाने से सुरक्षा और बढ़ेगी।

---

## 5. Rollback

1. **सबसे तेज़:** NavBharatAI का switch वापस `direct` पर करें। Mitrify में कुछ बदलने की ज़रूरत नहीं।
2. **Gateway बंद:** `POST /admin/kill` या Render में `MITRIFY_GATEWAY_KILL=1`।
3. **Gateway हटाएं:** Render में `MITRIFY_GATEWAY_ENABLED` हटाएं। Marketplace पहले जैसा चलता है।
4. **Tables हटाएं (ज़रूरी हो तो):** पहले usage export करें, फिर `migrations/0012_ai_gateway.down.sql` चलाएं।
5. **Code हटाएं:** इस branch का merge commit revert करें।

---

## 6. Tests

```bash
npm run test:gateway
# Postgres store tests भी (सिर्फ़ throwaway database पर, production पर कभी नहीं):
GATEWAY_TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/scratch npm run test:gateway
```

ये tests mock provider पर चलते हैं: byte-for-byte passthrough, SSE का क्रम और बिना buffering के आना, बीच में टूटना, cancellation, fallback के नियम, auth, setup-code lockout, kill switch, budget, queue/429, secrets का leak न होना, और marketplace पर कोई असर न पड़ना। CI: `.github/workflows/gateway-tests.yml`।

---

## 7. अभी बाकी (owner की मंज़ूरी या जानकारी चाहिए)

- Surplus का official base URL, model ids, कीमतें, rate limit और terms (resale/gateway की इजाज़त)। **मैंने कोई endpoint या कीमत अपनी तरफ़ से नहीं लिखी।**
- बाकी 4 providers: हर एक के docs और terms जांचने के बाद ही उनकी settings डालें।
- Render free plan 15 मिनट बाद सो जाता है, फिर पहली request 30–50 सेकंड लेती है। Gateway के लिए Starter plan बेहतर रहेगा। लंबी streaming पर Render का असली बर्ताव live test में जांचना होगा।
- Live चैट test (असली Surplus के साथ) और load test अभी नहीं हुए हैं।
- Rate limits, queue और budget का हिसाब एक process की memory में है। अभी Render पर एक instance है, ठीक है, लेकिन कई instances पर ले जाने से पहले इसे shared storage में ले जाना होगा।
- Budget की जांच request से **पहले** होती है, इसलिए एक साथ चल रही requests cap को थोड़ा पार कर सकती हैं।
