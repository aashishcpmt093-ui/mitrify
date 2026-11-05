# API portal: API की बिक्री (ग्राहकों के लिए)

`mitrify.com/?portal=api` एक छोटा अलग पेज है (clinic portal की तरह), जिसके पीछे वही Mitrify gateway है।

- **Owner (आप):** setup code डालकर ग्राहक बनाते हैं, credit देते हैं, kill switch और खर्च देखते हैं।
- **ग्राहक:** अपने ईमेल और password से login करता है, अपने credit देखता है, अपनी API keys बनाता है और अपना usage देखता है।

**कोई public sign-up नहीं है।** खाता सिर्फ़ owner बना सकता है। ग्राहक सिर्फ़ अपना ही data देख और बदल सकता है।

## इसे चालू करने से पहले (ज़रूरी)

1. **Database चाहिए।** ग्राहक, credit और ledger PostgreSQL में रहते हैं। `docs/hostinger-setup.md` देखें।
2. **Provider की इजाज़त।** किसी provider के models दूसरों को बेचने की इजाज़त उसकी terms में होनी चाहिए। ग्राहकों की keys सिर्फ़ उन providers पर जाती हैं जिन पर आपने `MITRIFY_<PROVIDER>_RESALE_APPROVED=1` लगाया है। यह `..._APPROVED` से अलग है, ताकि आप किसी provider को अपने इस्तेमाल के लिए चला सकें पर बेचने के लिए नहीं। **मैंने किसी provider की terms जांची नहीं हैं।** यह आपको खुद करना है।
3. **Payment अभी नहीं है।** Credit आप खुद डालते हैं (जब ग्राहक आपको पैसे दे दे)। ऑनलाइन payment (Razorpay) बाद में अलग से जुड़ सकता है।

## Settings (Hostinger → Environment variables)

| नाम | क्या |
|---|---|
| `MITRIFY_GATEWAY_ENABLED=1` | Gateway चालू |
| `MITRIFY_GATEWAY_SETUP_CODE` | आपका owner code (32+ अक्षर) |
| `MITRIFY_PORTAL_SECRET` | ग्राहकों के login token के लिए अलग लंबा random text (32+ अक्षर)। इसके बिना ग्राहकों के खाते बंद रहते हैं |
| `MITRIFY_GATEWAY_DAILY_BUDGET_USD` | रोज़ का कुल खर्च |
| `MITRIFY_<PROVIDER>_API_KEY / _BASE_URL / _APPROVED / _RESALE_APPROVED` | provider की settings |
| `MITRIFY_RESALE_MARKUP_PERCENT` | ग्राहक से provider की कीमत के ऊपर कितने % ज़्यादा। **न डालें तो 0 (वही कीमत)**। जो भी हो, पेज पर ग्राहक को साफ़ दिखता है |
| `MITRIFY_GATEWAY_PUBLIC_URL` | (ज़रूरत हो तो) ग्राहकों को दिखने वाला API पता, जैसे `https://gateway.mitrify.com/v1` |

## रोज़ का काम (owner)

1. `mitrify.com/?portal=api` खोलें → **I am the owner** → setup code डालें।
2. **New customer:** ईमेल और नाम डालें (password खाली छोड़ें तो 16 अक्षर का बन जाता है, **सिर्फ़ एक बार दिखता है**, ग्राहक को दें)।
3. ग्राहक के नीचे **Add credit** में रकम (डॉलर में) डालकर **Add** दबाएं।
4. ग्राहक को ये दें: ईमेल, password और पेज का पता `mitrify.com/?portal=api`।

बाकी सब बटन: **Switch off** (ग्राहक की सारी keys, login और token तुरंत बंद), **New password**, **History** (credit और कटौती की पूरी सूची), **Emergency stop** (पूरा gateway बंद)।

## पैसे का हिसाब

- हर request पर: provider की बताई कीमत × उसके बताए tokens (cached tokens की कीमत अलग)। Markup 0% है जब तक आप न डालें।
- हर कटौती ledger में request id के साथ लिखी जाती है। Provider से मिलान के लिए यही सूची काम आती है।
- **Provider ने tokens नहीं बताए** तो उस request के पैसे नहीं कटते, और वह "unknown" दर्ज होती है।
- **Credit खत्म:** ग्राहक को `402 insufficient_balance` मिलता है, और provider तक कुछ नहीं जाता।
- एक साथ चल रही कई requests credit को थोड़ा सा शून्य के नीचे ले जा सकती हैं। रकम छोटी रखें और ग्राहक का daily limit लगाएं।

## सुरक्षा

- Password सिर्फ़ hash के रूप में रखे जाते हैं। Login token 12 घंटे चलता है और हर बार ग्राहक दोबारा जांचा जाता है, इसलिए बंद किया गया खाता तुरंत बंद हो जाता है।
- गलत password: 5 बार पर वह खाता 15 मिनट के लिए बंद। एक IP से 10 बार पर वह IP बंद।
- Owner के रास्ते वही setup code, lockout और (अगर लगाया हो) IP allowlist मानते हैं।
- ग्राहक की key पर अपनी सीमा (रोज़ का खर्च, प्रति मिनट requests) लगती है, और ग्राहक को provider की key या नाम का कोई secret नहीं दिखता।

## कानूनी और कर (मेरी तरफ़ से सिर्फ़ याद दिलाना)

ग्राहकों से पैसे लेने पर GST, चालान और provider की terms आपकी ज़िम्मेदारी हैं। इस code में उनका कोई हिसाब नहीं है।

## वापस लेना

Settings से `MITRIFY_PORTAL_SECRET` हटाएं: ग्राहकों के खाते तुरंत बंद। या `migrations/0013_api_portal.down.sql` चलाकर ग्राहकों का data मिटाएं (पहले export कर लें)।
