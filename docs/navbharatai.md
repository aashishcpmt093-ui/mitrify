# NavBharatAI को Mitrify से जोड़ना (सिर्फ़ चैट)

NavBharatAI अपने AI के लिए अब सीधे किसी provider को नहीं, **Mitrify gateway** को बुलाएगा:

```
NavBharatAI → https://mitrify.com/v1 → (अपने-आप चुना सबसे सस्ता model: पहले free, फिर सशुल्क) → जवाब वापस
```

इसका API वही **OpenAI वाला तरीका** है, इसलिए NavBharatAI में सिर्फ़ तीन चीज़ें बदलती हैं: पता, key और model का नाम।

## 1. चाबी (key) बनाएं
`mitrify.com/?portal=api` → **I am the owner** → setup code → **Your API keys (for NavBharatAI)** → नाम `navbharatai-chat`, चाहें तो रोज़ की खर्च सीमा डालें → **Create key**।

पीले बॉक्स में `mtf_live_...` वाली key **सिर्फ़ एक बार** दिखती है। उसे कॉपी करके Passwords ऐप में रखें। चैट में न भेजें।

## 2. NavBharatAI के **server** की settings में ये तीन चीज़ें रखें
| चीज़ | मान |
|---|---|
| पता (Base URL) | `https://mitrify.com/v1` |
| API key | वही `mtf_live_...` |
| Model का नाम | `mitrify/auto-cheap` |

key सिर्फ़ NavBharatAI के **server** पर रहे। किसी app, browser या GitHub में कभी नहीं।

हाथ से model चुनने की ज़रूरत नहीं: `mitrify/auto-cheap` भेजने पर Mitrify खुद सबसे सस्ता chat model चुनता है और जवाब न आए तो अपने-आप अगले पर जाता है (`docs/openrouter.md` देखें)।

## 3. पुराना रास्ता हटाएं नहीं
NavBharatAI में एक switch रखें (जैसे `AI_BASE_URL = direct` या `mitrify`)। कोई गड़बड़ हो तो switch वापस करते ही सब पहले जैसा। साथ ही Mitrify में उस key को **Stop now** दबाने से वह तुरंत बंद हो जाती है।

## 4. NavBharatAI के लिए ज़रूरी नियम
- **Streaming** चाहिए तो हर request में `"stream_options": {"include_usage": true}` भेजें। Mitrify इसे खुद नहीं जोड़ता (request बदलना मना है), और इसके बिना `400 usage_required` आता है ताकि खर्च गिना जा सके।
- जवाब `429` या `503` आए तो **थोड़ी देर रुककर (backoff)** ही दोबारा भेजें, और अगर जवाब शुरू हो चुका था तो पूरी generation दोबारा न चलाएं।
- हर जवाब के headers में `X-Mitrify-Model`, `X-Mitrify-Provider` और `X-Mitrify-Trail` आते हैं: किस model ने जवाब दिया और कितनी कोशिशें हुईं।
- **Free models पर निजी या मरीज़ों की जानकारी न भेजें।** उनके डेटा की शर्तें जांची नहीं गई हैं।
- **App Builder को अभी न जोड़ें।** अभी सिर्फ़ साधारण चैट आज़माई गई है (`mitrify/auto-cheap` free models की गुणवत्ता बहुत अलग-अलग होती है)। App Builder के लिए पहले अलग परीक्षण (tool calls, बड़े जवाब, patches) ज़रूरी हैं।

## 5. जोड़ने से पहले परखें
owner पेज पर **Try a message** में **Stream** का निशान लगाकर संदेश भेजें। नीचे लिखा आएगा कि "words arrived one after another" (ठीक है) या "WARNING: everything arrived at once" (साइट के आगे कोई चीज़, जैसे Hostinger का CDN, stream को रोककर रख रही है, तब NavBharatAI में streaming ठीक नहीं चलेगी और मुझे बताएं)।

## 6. बहुत सारी requests (जैसे 1000)
हज़ार एक साथ के लिए `docs/capacity.md` पढ़ें: key का `rpm` बढ़ाना (6000), providers की सीमाएं सही रखना, और NavBharatAI की तरफ़ से एक साथ भेजी जाने वाली requests की अपनी सीमा। **Hostinger का आपका plan इतना भार संभालेगा या नहीं, यह अभी जांचा नहीं गया है।**

## 7. खर्च देखना
owner पेज के **Gateway** कार्ड में "Spent today" दिखता है (free का खर्च 0)। हर request का हिसाब gateway में रहता है।

## 8. जो अभी जांचा नहीं गया
- असली NavBharatAI के साथ पूरा रास्ता।
- Hostinger के आगे लगे CDN से लंबी streaming (ऊपर कदम 5 से परखें) और लंबी चलने वाली requests का कटना।
