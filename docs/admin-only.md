# Owner-only Mitrify (सिर्फ़ admin login कर सकता है)

`MITRIFY_ADMIN_ONLY=1` लगाने पर पूरा Mitrify सिर्फ़ admin के लिए खुलता है। यह server पर जांचा जाता है।
बटन छिपाने पर निर्भर नहीं है।

## चालू करना (Render → mitrify service → Environment)

```
ADMIN_ID=<आपका admin नाम>
ADMIN_PASSWORD=<कम से कम 10 अक्षर, मज़बूत>
MITRIFY_ADMIN_ONLY=1
```

Save करने पर Render restart करेगा। उसके बाद `mitrify.com` खोलने पर हर कोई `/admin/login` पर पहुंचता है।

> Render वह जगह है जहां Mitrify का server चलता है, Hostinger में नहीं। Hostinger में सिर्फ़ DNS है।

## क्या होता है
- बिना login कोई पेज नहीं खुलता (सब `/admin/login` पर जाते हैं), और कोई API जवाब नहीं देता (403)।
- खुले रहते हैं: login पेज और उसकी फ़ाइलें, `/health`, और admin login / password-reset के रास्ते।
- गलत password: 5 कोशिशों के बाद वह IP 15 मिनट के लिए बंद। किसी भी जगह से 1 घंटे में 20 गलत कोशिशों पर सब के लिए 1 घंटे बंद।
- Password-reset OTP: 5 गलत कोशिशों के बाद वह OTP रद्द, और नया OTP 1 मिनट से पहले नहीं मिलता।
- `ADMIN_PASSWORD` 10 अक्षर से छोटा हो तो login बंद रहता है और साफ़ संदेश दिखता है।
- `gateway.mitrify.com` इस नियम से अलग है। उसकी अपनी API keys हैं।

## इसका असर (ध्यान दें)
जब तक यह चालू है, **doctors, staff, patients और customers कोई login नहीं कर सकते**, और **staff Android app** भी
लॉगिन पेज पर ही रुकेगा। Doctor का AI assistant भी बंद रहता है। ऑनलाइन registration और payments भी नहीं चलेंगे।

## वापस पहले जैसा करना
Render में `MITRIFY_ADMIN_ONLY` हटा दें (या `0` कर दें)। साइट तुरंत पहले जैसी हो जाती है।

## ध्यान रखें
- Password बदलना है तो Render में `ADMIN_PASSWORD` बदलें। OTP से किया गया बदलाव सिर्फ़ तब तक रहता है जब तक server restart न हो।
- इस बदलाव से पहले `ADMIN_ID`/`ADMIN_PASSWORD` सेट नहीं थे, तो admin login पहले से बंद था। इसी वजह से login नहीं दिखता था।
