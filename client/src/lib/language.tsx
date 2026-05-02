import { createContext, useContext, useState } from "react";

export type Language = "en" | "hi" | "hl";

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  hi: "हिंदी",
  hl: "Hinglish",
};

const T = {
  en: {
    // Nav / menu
    home: "Home",
    myCredits: "My Credits",
    editProfile: "Edit Profile",
    myProfile: "My Profile",
    searchProviders: "Search Providers",
    recruitment: "Recruitment",
    subscriptions: "Subscriptions",
    aboutUs: "About Us",
    terms: "Terms & Conditions",
    contactUs: "Contact Us",
    contactUsTitle: "Get in touch",
    contactUsSubtitle: "Tap any email to open your mailbox",
    mailHelp: "Help & Support",
    mailContact: "General Inquiries",
    lightMode: "Light Mode",
    darkMode: "Dark Mode",
    logout: "Logout",
    loginSignup: "Login / Sign Up",
    language: "Language",
    dashboard: "Dashboard",
    callHistory: "Call History",
    notifications: "Notifications",
    noNotifications: "No notifications yet",
    noNotificationsHint: "When customers call you, they'll show up here",
    buyCredits: "Buy Credits",
    installApp: "Install App",
    coAdminLogin: "Staff Login",

    // Search
    searchPlaceholder: "Search by name, service, tags...",
    phoneSearchPlaceholder: "Enter mobile number...",
    searchBtn: "Search",
    searching: "Searching...",
    byNameService: "Name / Service",
    byMobile: "Mobile Number",
    currentLocation: "Current Location",
    customLocation: "Custom Location",
    enterAddress: "Enter your area / address...",
    useGps: "Use GPS",
    confirmLocation: "Confirm",
    popularServices: "Popular Services",
    noResults: "No providers found",
    noResultsHint: "Try a different search or expand your area",

    // Provider card
    approx: "Approx",
    away: "away",
    distanceUnknown: "Distance unknown",
    callNow: "Call",
    hidden: "Hidden",
    credits: "Credits",

    // Jobs
    jobs: "Jobs",
    postJob: "Post a Job",
    findJob: "Find Jobs",
    myPosts: "My Posts",
    jobMenuSubtitle: "Post or find jobs",
    jobPostDesc: "Post a job for 25 credits",
    jobFindDesc: "Call any job — 1 credit per call",
    jobMyPostsDesc: "View or delete your job posts",
    jobName: "Job Title",
    jobDesc: "Job Description",
    jobLocation: "Location",
    jobSalary: "Salary",
    jobHours: "Work Hours",
    jobPhone: "Contact Phone",
    postJobBtn: "Post Job (25 Credits)",
    confirmPost: "I confirm this is a real job post",
    noJobs: "No jobs posted yet",
    myPostsEmpty: "You haven't posted any jobs yet",
    deleteJob: "Delete",
    jobPostedOn: "Posted on",

    // Common
    cancel: "Cancel",
    submit: "Submit",
    loading: "Loading...",
    close: "Close",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    remove: "Remove",
    confirm: "Confirm",
    back: "Back",
    next: "Next",
    done: "Done",

    // Login prompt
    loginRequired: "Login Required",
    loginRequiredDesc: "Please login to make calls or post jobs",
    loginBtn: "Login",
    createAccount: "Create New Account",
    later: "Later",

    // Provider detail modal
    aboutSection: "About",
    chargeSection: "Approx Charge",
    distanceSection: "Distance",
    servicesSection: "Services",
    callBtn: "Call Now",
    connectingCall: "Connecting...",
    creditDeduct: "1 credit will be deducted per call",
    numberHidden: "Number hidden — Provider has hidden their contact",
    creditsFinished: "Credits finished — Cannot call",
    noNumber: "No number available",

    // Provider dashboard
    totalCredits: "Total Credits",
    totalCalls: "Total Calls",
    shareProfile: "Share Profile",
    copyLink: "Copy Link",
    callsReceived: "Calls Received",
    callsMade: "Calls Made",
    statsThisMonth: "This month",
    profileHidden: "Profile Hidden",
    profileVisible: "Profile Visible",
    hiddenInfo: "Your contact is hidden from customers",
    visibleInfo: "Customers can see and call you",
    hiddenWarning: "Your contact number will not be visible to anyone",

    // Credits
    freeCredits: "Free Credits",
    purchasedCredits: "Purchased Credits",
    creditsBalance: "Credits Balance",
    buyMore: "Buy More",
    promoCode: "Promo Code",
    applyPromo: "Apply",

    // Auth pages
    loginTitle: "Welcome Back",
    signupTitle: "Create Account",
    forgotPassword: "Forgot Password",
    sendOtp: "Send OTP",
    verifyOtp: "Verify & Login",
    resendOtp: "Resend OTP",
    orSignWith: "Or sign in with",
    noAccount: "Don't have an account? Sign Up",
    haveAccount: "Already have an account? Login",
    skipForNow: "Skip Login",
    googleLogin: "Continue with Google",

    // Provider setup form
    yourName: "Your Name",
    serviceName: "Service Name",
    description: "Description",
    tags: "Tags",
    serviceArea: "Service Area Address",

    // Notifications / toasts
    callFailed: "Call failed",
    noCreditMsg: "Buy credits to make calls",
    locationSet: "Location set",
    locationFailed: "Location not found",
    copiedLink: "Link copied!",
    loggedOut: "Logged out",

    // Double-charge calling
    doubleChargeBadge: "Double charge",
    forceCallingTitle: "Force Calling",
    forceCallingHint: "Allow calls from customers who have 0 credits. You'll pay 2 credits per such call.",
    forceCallingConfirmTitle: "Turn on Force Calling?",
    forceCallingConfirmBody: "When a 0-balance customer calls you, 2 credits will be deducted from your account (yours + customer's). Continue?",
    lowBalanceWarningTitle: "Provider has no balance",
    lowBalanceWarningBody: "{name}'s account has no balance. If you call now, 2 credits will be deducted from your account.",
    callTwoCredits: "Call (2 credits)",
    bothNoBalance: "Call not possible — both accounts have zero balance.",
    customerNoBalanceBlocked: "You don't have credits and the provider hasn't enabled zero-balance calls.",
    capReached: "Provider has hit today's limit for zero-balance calls.",
    needTwoCredits: "You need at least 2 credits to call this provider.",
    creditsCharged: "{n} credits deducted",
    callReasonNormal: "Normal",
    callReasonCustomerNoBalance: "Customer was low — you paid 2",
    callReasonProviderNoBalance: "Provider was low — you paid 2",
    lowBalanceBannerProvider: "Your balance is empty. Recharge or you'll keep losing leads.",
    rechargeNow: "Recharge now",
  },

  hi: {
    // Nav / menu
    home: "होम",
    myCredits: "मेरे क्रेडिट",
    editProfile: "प्रोफ़ाइल बदलें",
    myProfile: "मेरी प्रोफ़ाइल",
    searchProviders: "सेवा प्रदाता खोजें",
    recruitment: "भर्ती",
    subscriptions: "सब्सक्रिप्शन",
    aboutUs: "हमारे बारे में",
    terms: "नियम व शर्तें",
    contactUs: "संपर्क करें",
    contactUsTitle: "हमसे संपर्क करें",
    contactUsSubtitle: "किसी भी ईमेल पर टैप करें — आपका मेल ऐप खुल जाएगा",
    mailHelp: "सहायता व सपोर्ट",
    mailContact: "सामान्य पूछताछ",
    lightMode: "लाइट मोड",
    darkMode: "डार्क मोड",
    logout: "लॉगआउट",
    loginSignup: "लॉगिन / साइन अप",
    language: "भाषा",
    dashboard: "डैशबोर्ड",
    callHistory: "कॉल इतिहास",
    notifications: "सूचनाएं",
    noNotifications: "अभी कोई सूचना नहीं",
    noNotificationsHint: "जब ग्राहक आपको कॉल करेंगे, यहाँ दिखेगा",
    buyCredits: "क्रेडिट खरीदें",
    installApp: "ऐप इंस्टॉल करें",
    coAdminLogin: "स्टाफ लॉगिन",

    // Search
    searchPlaceholder: "नाम, सेवा, टैग से खोजें...",
    phoneSearchPlaceholder: "मोबाइल नंबर डालें...",
    searchBtn: "खोजें",
    searching: "खोज रहे हैं...",
    byNameService: "नाम / सेवा",
    byMobile: "मोबाइल नंबर",
    currentLocation: "वर्तमान स्थान",
    customLocation: "अन्य स्थान",
    enterAddress: "अपना क्षेत्र / पता डालें...",
    useGps: "GPS उपयोग करें",
    confirmLocation: "पुष्टि करें",
    popularServices: "लोकप्रिय सेवाएं",
    noResults: "कोई सेवा प्रदाता नहीं मिला",
    noResultsHint: "अलग खोज या बड़े क्षेत्र में खोजें",

    // Provider card
    approx: "अनुमानित",
    away: "दूर",
    distanceUnknown: "दूरी अज्ञात",
    callNow: "कॉल",
    hidden: "छुपाया",
    credits: "क्रेडिट",

    // Jobs
    jobs: "नौकरी",
    postJob: "नौकरी पोस्ट करें",
    findJob: "नौकरी खोजें",
    myPosts: "मेरी पोस्ट",
    jobMenuSubtitle: "नौकरी पोस्ट करें या खोजें",
    jobPostDesc: "25 क्रेडिट के लिए नौकरी पोस्ट करें",
    jobFindDesc: "कोई भी नौकरी पर कॉल करें — 1 क्रेडिट प्रति कॉल",
    jobMyPostsDesc: "अपनी नौकरी पोस्ट देखें या हटाएं",
    jobName: "नौकरी का नाम",
    jobDesc: "विवरण",
    jobLocation: "स्थान",
    jobSalary: "वेतन",
    jobHours: "काम के घंटे",
    jobPhone: "संपर्क नंबर",
    postJobBtn: "नौकरी पोस्ट करें (25 क्रेडिट)",
    confirmPost: "मैं पुष्टि करता/करती हूँ कि यह असली जॉब पोस्ट है",
    noJobs: "अभी कोई नौकरी नहीं",
    myPostsEmpty: "आपने अभी कोई नौकरी पोस्ट नहीं की",
    deleteJob: "हटाएं",
    jobPostedOn: "पोस्ट किया",

    // Common
    cancel: "रद्द करें",
    submit: "जमा करें",
    loading: "लोड हो रहा है...",
    close: "बंद करें",
    save: "सहेजें",
    delete: "हटाएं",
    edit: "बदलें",
    add: "जोड़ें",
    remove: "हटाएं",
    confirm: "पुष्टि करें",
    back: "वापस",
    next: "आगे",
    done: "हो गया",

    // Login prompt
    loginRequired: "लॉगिन आवश्यक है",
    loginRequiredDesc: "कॉल करने या नौकरी पोस्ट करने के लिए पहले लॉगिन करें",
    loginBtn: "लॉगिन करें",
    createAccount: "नया खाता बनाएं",
    later: "बाद में",

    // Provider detail modal
    aboutSection: "परिचय",
    chargeSection: "अनुमानित शुल्क",
    distanceSection: "दूरी",
    servicesSection: "सेवाएं",
    callBtn: "कॉल करें",
    connectingCall: "जोड़ रहे हैं...",
    creditDeduct: "कॉल पर 1 क्रेडिट कटेगा",
    numberHidden: "नंबर छुपाया है — प्रदाता ने संपर्क छुपाया है",
    creditsFinished: "क्रेडिट खत्म — कॉल नहीं हो सकती",
    noNumber: "कोई नंबर उपलब्ध नहीं",

    // Provider dashboard
    totalCredits: "कुल क्रेडिट",
    totalCalls: "कुल कॉल",
    shareProfile: "प्रोफ़ाइल शेयर करें",
    copyLink: "लिंक कॉपी करें",
    callsReceived: "प्राप्त कॉल",
    callsMade: "की गई कॉल",
    statsThisMonth: "इस महीने",
    profileHidden: "प्रोफ़ाइल छुपाई",
    profileVisible: "प्रोफ़ाइल दिखाई",
    hiddenInfo: "ग्राहक आपसे संपर्क नहीं कर सकते",
    visibleInfo: "ग्राहक आपको देख और कॉल कर सकते हैं",
    hiddenWarning: "आपका contact number किसी को नहीं दिखेगा",

    // Credits
    freeCredits: "मुफ्त क्रेडिट",
    purchasedCredits: "खरीदे क्रेडिट",
    creditsBalance: "क्रेडिट बैलेंस",
    buyMore: "और खरीदें",
    promoCode: "प्रोमो कोड",
    applyPromo: "लगाएं",

    // Auth pages
    loginTitle: "वापस स्वागत है",
    signupTitle: "खाता बनाएं",
    forgotPassword: "पासवर्ड भूल गए",
    sendOtp: "OTP भेजें",
    verifyOtp: "सत्यापित करें और लॉगिन",
    resendOtp: "OTP दोबारा भेजें",
    orSignWith: "या इससे साइन इन करें",
    noAccount: "खाता नहीं है? साइन अप करें",
    haveAccount: "खाता है? लॉगिन करें",
    skipForNow: "Skip Login",
    googleLogin: "Google से जारी रखें",

    // Provider setup form
    yourName: "आपका नाम क्या है",
    serviceName: "आप क्या काम करते हैं",
    description: "आपके काम के बारे में बताओ",
    tags: "टैग",
    serviceArea: "किस शहर में काम करते हैं",

    // Notifications
    callFailed: "कॉल विफल",
    noCreditMsg: "कॉल के लिए क्रेडिट खरीदें",
    locationSet: "स्थान सेट हो गया",
    locationFailed: "स्थान नहीं मिला",
    copiedLink: "लिंक कॉपी हो गया!",
    loggedOut: "लॉगआउट हो गए",

    // Double-charge calling
    doubleChargeBadge: "डबल चार्ज",
    forceCallingTitle: "फोर्स कॉलिंग",
    forceCallingHint: "0 बैलेंस वाले ग्राहकों की कॉल भी आ सकेगी। ऐसी हर कॉल पर 2 क्रेडिट आपके खाते से कटेंगे।",
    forceCallingConfirmTitle: "फोर्स कॉलिंग ON करें?",
    forceCallingConfirmBody: "जब भी कोई 0 बैलेंस वाला ग्राहक आपको कॉल करेगा, आपके खाते से 2 क्रेडिट (आपका + ग्राहक का) कट जाएंगे। जारी रखें?",
    lowBalanceWarningTitle: "प्रदाता के पास बैलेंस नहीं है",
    lowBalanceWarningBody: "{name} के खाते में बैलेंस नहीं है। अगर अभी कॉल करते हैं तो आपके खाते से 2 क्रेडिट कट जाएंगे।",
    callTwoCredits: "कॉल करें (2 क्रेडिट)",
    bothNoBalance: "कॉल संभव नहीं — दोनों खातों में बैलेंस खत्म है।",
    customerNoBalanceBlocked: "आपके पास क्रेडिट नहीं हैं और प्रदाता ने जीरो-बैलेंस कॉल चालू नहीं की है।",
    capReached: "इस प्रदाता की आज की जीरो-बैलेंस कॉल लिमिट पूरी हो गई है।",
    needTwoCredits: "इस प्रदाता को कॉल करने के लिए कम से कम 2 क्रेडिट चाहिए।",
    creditsCharged: "{n} क्रेडिट कटे",
    callReasonNormal: "सामान्य",
    callReasonCustomerNoBalance: "ग्राहक के पास बैलेंस नहीं था — आपने 2 दिए",
    callReasonProviderNoBalance: "प्रदाता के पास बैलेंस नहीं था — आपने 2 दिए",
    lowBalanceBannerProvider: "आपका बैलेंस खत्म है। रिचार्ज करें वरना आपकी कॉल कम होती जाएंगी।",
    rechargeNow: "अभी रिचार्ज करें",
  },

  hl: {
    // Nav / menu
    home: "Home",
    myCredits: "Mere Credits",
    editProfile: "Profile Edit Karo",
    myProfile: "Meri Profile",
    searchProviders: "Providers Dhundho",
    recruitment: "Recruitment",
    subscriptions: "Subscriptions",
    aboutUs: "Hamare Baare Mein",
    terms: "Terms & Conditions",
    contactUs: "Contact Us",
    contactUsTitle: "Humse Sampark Karein",
    contactUsSubtitle: "Kisi bhi email par tap karein — aapka mail app khul jayega",
    mailHelp: "Help & Support",
    mailContact: "General Inquiries",
    lightMode: "Light Mode",
    darkMode: "Dark Mode",
    logout: "Logout",
    loginSignup: "Login / Sign Up",
    language: "Bhasha",
    dashboard: "Dashboard",
    callHistory: "Call History",
    notifications: "Notifications",
    noNotifications: "Abhi koi notification nahi",
    noNotificationsHint: "Jab customer aapko call karenge, yahan dikhenge",
    buyCredits: "Credits Kharido",
    installApp: "App Install Karo",
    coAdminLogin: "Staff Login",

    // Search
    searchPlaceholder: "Naam, service, tags se dhundho...",
    phoneSearchPlaceholder: "Mobile number daalo...",
    searchBtn: "Dhundho",
    searching: "Dhundh rahe hain...",
    byNameService: "Naam / Service",
    byMobile: "Mobile Number",
    currentLocation: "Current Location",
    customLocation: "Alag Location",
    enterAddress: "Apna area / address daalo...",
    useGps: "GPS Use Karo",
    confirmLocation: "Confirm Karo",
    popularServices: "Popular Services",
    noResults: "Koi provider nahi mila",
    noResultsHint: "Alag search karo ya area badhao",

    // Provider card
    approx: "Lagbhag",
    away: "door",
    distanceUnknown: "Doori pata nahi",
    callNow: "Call",
    hidden: "Hidden",
    credits: "Credits",

    // Jobs
    jobs: "Jobs",
    postJob: "Job Post Karo",
    findJob: "Job Dhundho",
    myPosts: "Meri Posts",
    jobMenuSubtitle: "Job post karo ya dhundho",
    jobPostDesc: "25 credits mein job post karo",
    jobFindDesc: "Kisi bhi job par call karo — 1 credit per call",
    jobMyPostsDesc: "Apni posted jobs dekho ya delete karo",
    jobName: "Job ka Naam",
    jobDesc: "Kaam ki detail",
    jobLocation: "Location",
    jobSalary: "Salary",
    jobHours: "Kaam ke Ghante",
    jobPhone: "Contact Number",
    postJobBtn: "Job Post Karein (25 Credits)",
    confirmPost: "Main confirm karta/karti hoon ki yeh real job post hai",
    noJobs: "Abhi koi job nahi hai",
    myPostsEmpty: "Aapne abhi koi job post nahi ki",
    deleteJob: "Delete",
    jobPostedOn: "Post ki",

    // Common
    cancel: "Cancel",
    submit: "Submit Karo",
    loading: "Load ho raha hai...",
    close: "Band Karo",
    save: "Save Karo",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    remove: "Hataao",
    confirm: "Confirm",
    back: "Wapas",
    next: "Aage",
    done: "Ho Gaya",

    // Login prompt
    loginRequired: "Login Zaruri Hai",
    loginRequiredDesc: "Call karne ya job post karne ke liye pehle login karo",
    loginBtn: "Login Karein",
    createAccount: "Naya Account Banao",
    later: "Baad Mein",

    // Provider detail modal
    aboutSection: "Baare Mein",
    chargeSection: "Lagbhag Charge",
    distanceSection: "Doori",
    servicesSection: "Services",
    callBtn: "Call Karein",
    connectingCall: "Connect ho raha hai...",
    creditDeduct: "Call karne par 1 credit deduct hoga",
    numberHidden: "Number hidden hai — Provider ne contact chupaaya hai",
    creditsFinished: "Credits khatam — Call nahi ho sakti",
    noNumber: "Koi number available nahi",

    // Provider dashboard
    totalCredits: "Total Credits",
    totalCalls: "Total Calls",
    shareProfile: "Profile Share Karo",
    copyLink: "Link Copy Karo",
    callsReceived: "Calls Received",
    callsMade: "Calls Made",
    statsThisMonth: "Is mahine",
    profileHidden: "Profile Hidden",
    profileVisible: "Profile Visible",
    hiddenInfo: "Customers aapko contact nahi kar sakte",
    visibleInfo: "Customers aapko dekh aur call kar sakte hain",
    hiddenWarning: "Aapka contact number kisiko nahi dikhega",

    // Credits
    freeCredits: "Free Credits",
    purchasedCredits: "Kharide Credits",
    creditsBalance: "Credits Balance",
    buyMore: "Aur Kharido",
    promoCode: "Promo Code",
    applyPromo: "Apply",

    // Auth pages
    loginTitle: "Wapas Aaye!",
    signupTitle: "Account Banao",
    forgotPassword: "Password Bhool Gaye",
    sendOtp: "OTP Bhejo",
    verifyOtp: "Verify Karo & Login",
    resendOtp: "OTP Dobara Bhejo",
    orSignWith: "Ya isse sign in karo",
    noAccount: "Account nahi hai? Sign Up Karo",
    haveAccount: "Account hai? Login Karo",
    skipForNow: "Skip Login",
    googleLogin: "Google se Continue Karo",

    // Provider setup form
    yourName: "Aapka Naam Kya Hai",
    serviceName: "Aap Kya Kaam Karte Hain",
    description: "Aapke Kaam Ke Baare Mein Batao",
    tags: "Tags",
    serviceArea: "Aap Kaha Kaam Karte Hain",

    // Notifications
    callFailed: "Call fail ho gayi",
    noCreditMsg: "Call ke liye credits kharido",
    locationSet: "Location set ho gayi",
    locationFailed: "Location nahi mili",
    copiedLink: "Link copy ho gaya!",
    loggedOut: "Logout ho gaye",

    // Double-charge calling
    doubleChargeBadge: "Double charge",
    forceCallingTitle: "Force Calling",
    forceCallingHint: "0 balance wale customers ki call bhi le sakte ho. Aisi har call pe aapke account se 2 credit kat jayenge.",
    forceCallingConfirmTitle: "Force Calling ON karein?",
    forceCallingConfirmBody: "Jab bhi koi 0 balance wala customer aapko call karega, aapke account se 2 credit (apna + customer ka) kat jayenge. Continue?",
    lowBalanceWarningTitle: "Provider ke paas balance nahi hai",
    lowBalanceWarningBody: "{name} ke account mein balance nahi hai. Agar abhi call karenge to aapke account se 2 credit kat jayenge.",
    callTwoCredits: "Call karein (2 credits)",
    bothNoBalance: "Call abhi possible nahi — dono ke account mein balance khatam hai.",
    customerNoBalanceBlocked: "Aapke paas credits nahi hain aur provider ne zero-balance calls allow nahi ki hain.",
    capReached: "Is provider ki aaj ki zero-balance call limit puri ho gayi hai.",
    needTwoCredits: "Is provider ko call karne ke liye kam se kam 2 credits chahiye.",
    creditsCharged: "{n} credits cut hue",
    callReasonNormal: "Normal",
    callReasonCustomerNoBalance: "Customer low tha — aapne 2 diye",
    callReasonProviderNoBalance: "Provider low tha — aapne 2 diye",
    lowBalanceBannerProvider: "Aapka balance khatam hai. Recharge karein varna calls aana band ho jayegi.",
    rechargeNow: "Abhi recharge karein",
  },
};

export type TranslationKey = keyof typeof T["en"];

interface LanguageContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "hi",
  setLang: () => {},
  t: (key) => key as string,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem("mitrify_lang_v2");
      return (saved as Language) || "hi";
    } catch {
      return "hi";
    }
  });

  const setLang = (l: Language) => {
    setLangState(l);
    try { localStorage.setItem("mitrify_lang_v2", l); } catch {}
  };

  const t = (key: TranslationKey): string => {
    return (T[lang] as any)[key] ?? (T["hl"] as any)[key] ?? (key as string);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
