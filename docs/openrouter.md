# OpenRouter जोड़ना (सिर्फ़ अपने इस्तेमाल के लिए)

OpenRouter एक ही API से कई कंपनियों के models देता है। यह gateway में पहले से बना है। इसका पता कोड में है: `https://openrouter.ai/api/v1`, और chat का रास्ता `/chat/completions` है।

## पहले यह पढ़ें: बेचने की इजाज़त

OpenRouter की **standard शर्तों के सार** (खोज से मिले, पूरा text मैंने पढ़ा नहीं) में "API access को आगे बेचना या competing service बनाना" मना बताया गया है। Enterprise समझौते की भाषा अलग है। इसलिए:

- **OpenRouter को सिर्फ़ अपने इस्तेमाल के लिए जोड़ें** (जैसे NavBharatAI)। `MITRIFY_OPENROUTER_RESALE_APPROVED` **न डालें**। तब API portal के ग्राहकों की keys OpenRouter तक कभी नहीं जातीं। यह code में पक्का है और tests में जांचा गया है।
- ग्राहकों को OpenRouter के models देने से पहले `openrouter.ai/terms` और उनका Enterprise समझौता खुद पढ़ें (या उनसे लिखकर पूछें)। यह कानूनी सलाह नहीं है।

जो मैं जांच नहीं पाया (मेरे सैंडबॉक्स से `openrouter.ai` नहीं खुलता): streaming में usage किस रूप में आता है, rate limits, और free models (`:free`) की शर्तें। **असली OpenRouter के साथ यह code अभी आज़माया नहीं गया है।**

## जोड़ने के कदम (Hostinger → Environment variables)

| नाम | मान |
|---|---|
| `MITRIFY_OPENROUTER_API_KEY` | OpenRouter की key। अलग से बनाएं (openrouter.ai → Keys), ताकि अलग खर्च दिखे और कभी रद्द कर सकें |
| `MITRIFY_OPENROUTER_APPROVED` | `1` |

(पता डालने की ज़रूरत नहीं। और `MITRIFY_OPENROUTER_MAX_CONCURRENCY` न डालें तो 4 रहता है।)

फिर **Save → Redeploy**। owner पेज (`mitrify.com/?portal=api`) के Gateway कार्ड में "OpenRouter: active" दिखना चाहिए।

## अपने-आप चुनाव (डिफ़ॉल्ट): `mitrify/auto-cheap`

NavBharatAI (या कोई भी) बस model का नाम **`mitrify/auto-cheap`** भेजे। हाथ से कुछ चुनना नहीं पड़ता:

1. **सर्वर चालू होते ही** gateway OpenRouter की models की सूची और कीमतें खुद पढ़ लेता है और पूल बना लेता है (हर 24 घंटे में दोबारा, और पूल खाली निकले तो हर घंटे कोशिश)।
2. **पूल का क्रम:** पहले **free** models, फिर सबसे सस्ते **सशुल्क** models। बराबर कीमत में लंबे context वाला पहले।
3. **सिर्फ़ chat वाले models** लिए जाते हैं (जो text पढ़ें और text लिखें), और जिनका context कम से कम 8000 tokens हो। संगीत, तस्वीर, आवाज़ या सुरक्षा-जांच वाले models छोड़ दिए जाते हैं।
4. **Free की सीमा भरने पर:** जब कोई model "limit पूरी" (429) कहता है, तो उसे कुछ देर के लिए अलग रख दिया जाता है (provider जितना बताए उतनी देर; न बताए तो पहली बार 1 मिनट, फिर 5 मिनट, 25 मिनट, ज़्यादा से ज़्यादा 2 घंटे), और अगला model जवाब देता है। जब सारे free भर जाते हैं तो सस्ते सशुल्क models जवाब देते हैं। थोड़ी देर बाद free को फिर आज़माया जाता है। कोई model "मौजूद नहीं" (404) कहे तो उसे 1 घंटे के लिए हटा दिया जाता है।
5. **हर request की आख़िरी कोशिश** (ज़्यादा से ज़्यादा 4 कोशिशें) हमेशा किसी सशुल्क model को मिलती है, ताकि कोई request सिर्फ़ इसलिए न रुके कि free भरे थे।
6. **कब दोबारा कोशिश नहीं होती:** जवाब शुरू होने के बाद, `500` या timeout पर कभी नहीं (हो सकता है काम शुरू हो चुका हो)।
7. **जवाब न आए तो अपने-आप अगली कोशिश (fallback):** एक request में ज़्यादा से ज़्यादा 4 कोशिशें (`MITRIFY_GATEWAY_MAX_ATTEMPTS`) होती हैं। इनमें से हर एक पर पूरा जवाब **ग्राहक को भेजने से पहले** देखा जाता है, और ये सब "जवाब नहीं आया" गिने जाते हैं:
   - provider की गड़बड़ी (`500/502/504`), "यह अनुरोध मंज़ूर नहीं" (`400`, जैसे model system prompt नहीं लेता), limit पूरी (`429`), `503`, model मौजूद नहीं (`404`);
   - **free model** चुप रहे (`MITRIFY_GATEWAY_FREE_FIRST_BYTE_TIMEOUT_MS`, डिफ़ॉल्ट 45 सेकंड, फिर उसकी कोशिश रोक दी जाती है);
   - सब ठीक दिखे (`200`) पर **जवाब खाली हो**, या जवाब के अंदर error लिखा हो, या stream का पहला ही event error हो या stream खाली हो।

   ऐसे model को कुछ मिनट (2, फिर 10, फिर 50) अलग रखकर अगला model आज़माया जाता है। जो जवाब ठीक निकले, वह **बिना बदले, उसी क्रम में** आगे भेजा जाता है। stream में पहला event देखने के बाद कुछ रोका नहीं जाता।
8. **सशुल्क model पर सावधानी:** जवाब शुरू होने से पहले की `5xx`, चुप्पी, या खाली जवाब पर सशुल्क model की दोबारा कोशिश **नहीं** होती (डिफ़ॉल्ट), ताकि कोई सशुल्क काम गलती से दो बार न चले। (`429`, `503`, `404` पर होती है।) अगर आप चाहते हैं कि सशुल्क भी हर तरह की विफलता पर अगले पर जाए, तो `MITRIFY_GATEWAY_RETRY_PAID=1` लगाएं। थोड़ा जोखिम स्वीकार करना होगा: कभी-कभी एक सशुल्क जवाब दो बार बन सकता है और दो बार खर्च हो सकता है।
9. **आख़िरी कोशिश कभी रोककर नहीं जांची जाती:** अगर कोई और model बचा ही नहीं, तो आख़िरी model का जवाब, चाहे वह खाली या error हो, जैसा है वैसा आप तक आता है। और **नाम से बुलाने** पर कभी दूसरे model पर नहीं जाता।
10. हर जवाब में `X-Mitrify-Model` और `X-Mitrify-Provider` बताते हैं कि असल में किसने जवाब दिया, और `X-Mitrify-Trail` बताता है कि हर कोशिश में क्या हुआ (जैसे `model-a:empty, model-b:502, model-c:200`)। owner पेज का "Try a message" गड़बड़ी पर यह सब दिखाता है।

owner पेज पर **Prices and models** में पूल का क्रम और "limit पूरी" वाले models (कितने मिनट बाद लौटेंगे) दिखते हैं। किसी model को अपने-आप चुने जाने से रोकना हो तो उसके आगे **Skip** लगाएं। **On** सिर्फ़ तब चाहिए जब कोई model का पूरा नाम लिखकर उसे सीधे बुलाए।

### Settings (वैकल्पिक, Hostinger में)
- `MITRIFY_GATEWAY_AUTO_SELECT=0`: अपने-आप चुनाव बंद (तब हर model पर हाथ से On और Pool लगाना पड़ेगा)।
- `MITRIFY_GATEWAY_MIN_CONTEXT`: कम से कम context (डिफ़ॉल्ट 8000)।
- `MITRIFY_GATEWAY_POOL_SIZE`: पूल में कितने models (डिफ़ॉल्ट 40)।
- `MITRIFY_GATEWAY_POOL_PAID`: पूल में सशुल्क models के लिए हमेशा बचाकर रखी जाने वाली जगह (डिफ़ॉल्ट 8)। free models कितने भी हों, उनके पीछे सबसे सस्ते 8 सशुल्क बने रहते हैं।
- `MITRIFY_GATEWAY_MAX_ATTEMPTS`: एक request की ज़्यादा से ज़्यादा कोशिशें (डिफ़ॉल्ट 4, अधिकतम 6)।
- `MITRIFY_GATEWAY_FREE_FIRST_BYTE_TIMEOUT_MS`: free model कितनी देर चुप रहे तो छोड़ दें (डिफ़ॉल्ट 45000)।
- `MITRIFY_GATEWAY_RETRY_PAID`: ऊपर कदम 8 देखें (डिफ़ॉल्ट बंद)।

## बहुत सारी requests एक साथ (जैसे 1000)

डिफ़ॉल्ट सीमाएं छोटी हैं (एक provider पर एक साथ 4 requests, कुल 200)। हज़ार requests एक साथ आएं तो इन्हें बढ़ाएं, वरना gateway खुद `429` या `503` देगा:

| नाम | सुझाई कीमत |
|---|---|
| `MITRIFY_OPENROUTER_MAX_CONCURRENCY` | `40` |
| `MITRIFY_OPENROUTER_MAX_QUEUE` | `1000` |
| `MITRIFY_GATEWAY_MAX_INFLIGHT` | `1200` |
| `MITRIFY_GATEWAY_QUEUE_TIMEOUT_MS` | `120000` |

ध्यान रखें:
- ये कीमतें मेरा अनुमान हैं। **Hostinger का आपका plan इतने एक साथ जुड़ाव संभाल पाएगा या नहीं, मैंने जांचा नहीं है**; इसे असली भार से परखना होगा।
- **OpenRouter की free models की असली सीमाएं मैंने नहीं पढ़ीं।** ऊपर का cooldown उन्हें चलते-चलते सीखता है।
- NavBharatAI को `429` या `503` मिलने पर थोड़ी देर रुककर (backoff) ही दोबारा भेजना चाहिए, और जवाब शुरू होने के बाद पूरी generation दोबारा नहीं चलानी चाहिए।
- **Free models पर निजी या मरीज़ों की जानकारी न भेजें।** उनके डेटा की शर्तें मैंने नहीं पढ़ी हैं।
- Streaming में `"stream_options": {"include_usage": true}` भेजना अब भी ज़रूरी है।

## आज़माना (owner पेज पर "Try a message")

owner पेज पर **Try a message** डिब्बे में **`mitrify/auto-cheap`** चुनकर (यही पहले से चुना रहता है) छोटा संदेश लिखें और **Send** दबाएं। कुछ On या Pool करने की ज़रूरत नहीं। जवाब के नीचे दिखता है कि किस provider और किस model ने जवाब दिया और कितने tokens लगे। यह असली gateway के रास्ते से जाता है, इसलिए खर्च "Spent today" में गिना जाता है (free का खर्च 0)। जवाब की लंबाई 300 tokens तक रखी जाती है।

## खर्च का हिसाब

- OpenRouter कहता है कि वह models की कीमत पर कोई markup नहीं लगाता, पर **credit खरीदने पर 5.5% fee (कम से कम $0.80)** लेता है। यह fee gateway के हिसाब में **शामिल नहीं** है। यह आपके और OpenRouter के बीच है।
- Gateway tokens × सूची की कीमत से खर्च निकालता है। असली बिल से मिलान `usage` की सूची में होता है।
- कुछ models "free" (कीमत 0) होते हैं। उनकी अलग rate limit और डेटा की शर्तें होती हैं। पहले OpenRouter के पन्ने पढ़ें, फिर ही उन्हें Pool में लगाएं।

## स्रोत
- [OpenRouter API reference](https://openrouter.ai/docs/api_reference/overview)
- [List models](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [Terms of Service](https://openrouter.ai/terms)
- [Enterprise Access Agreement](https://openrouter.ai/terms-of-service-enterprise)
