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

## कीमतें और models (owner पेज पर)

1. **Prices and models** कार्ड में **Import prices from OpenRouter** दबाएं। OpenRouter अपनी models की सूची और कीमतें खुद बताता है (`GET /models`), वही पढ़ी जाती हैं। कीमत "प्रति token" आती है, उसे "प्रति 10 लाख tokens" में बदला जाता है।
2. **नए models बंद (Off) आते हैं।** आप जिन्हें चलाना चाहें उनके आगे **On** लगाएं (तब वे नाम से बुलाए जा सकते हैं)।
3. **Pool** तभी लगाएं जब आपने उस model की गुणवत्ता खुद जांच ली हो। तब `mitrify/auto-cheap` उसे चुन सकता है।
4. **Rebuild cheapest pool** दबाएं।
5. हर 24 घंटे में gateway OpenRouter की कीमतें खुद दोबारा पढ़ता है और पूल बदल देता है। आपके On/Pool के चुनाव वैसे ही रहते हैं। कीमत पढ़ने में कोई गड़बड़ हो तो पुरानी कीमतें बनी रहती हैं।

## खर्च का हिसाब

- OpenRouter कहता है कि वह models की कीमत पर कोई markup नहीं लगाता, पर **credit खरीदने पर 5.5% fee (कम से कम $0.80)** लेता है। यह fee gateway के हिसाब में **शामिल नहीं** है। यह आपके और OpenRouter के बीच है।
- Gateway tokens × सूची की कीमत से खर्च निकालता है। असली बिल से मिलान `usage` की सूची में होता है।
- कुछ models "free" (कीमत 0) होते हैं। उनकी अलग rate limit और डेटा की शर्तें होती हैं। पहले OpenRouter के पन्ने पढ़ें, फिर ही उन्हें Pool में लगाएं।

## स्रोत
- [OpenRouter API reference](https://openrouter.ai/docs/api_reference/overview)
- [List models](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [Terms of Service](https://openrouter.ai/terms)
- [Enterprise Access Agreement](https://openrouter.ai/terms-of-service-enterprise)
