// Pre-curated Hinglish + English tag dictionary for the most common
// Indian local-service professions. Each canonical key has 8-10 tags and
// a list of synonym strings used for matching against `serviceName`.
// Add new entries here — code does not need any other changes.

export interface DictEntry {
  /** Canonical profession key (lowercase) */
  key: string;
  /** Substrings to look for inside the (lowercased) serviceName */
  synonyms: string[];
  /** Pre-curated Hinglish + English hashtags */
  tags: string[];
}

export const TAG_DICTIONARY: DictEntry[] = [
  {
    key: "plumber",
    synonyms: ["plumber", "plumbing", "nal", "tap fitting", "pipe", "pipeline"],
    tags: ["plumber", "nal-thik", "pipe-fitting", "tap-repair", "leakage-fix", "bathroom-fitting", "water-pipe", "plumbing", "geyser-install", "drainage"],
  },
  {
    key: "electrician",
    synonyms: ["electrician", "electric", "wiring", "bijli", "light fitting", "electrical"],
    tags: ["electrician", "bijli-mistri", "wiring", "switch-board", "fan-repair", "mcb-install", "light-fitting", "inverter-install", "house-wiring", "electrical-repair"],
  },
  {
    key: "ac-mechanic",
    synonyms: ["ac mechanic", "ac repair", "ac service", "air conditioner", "split ac", "window ac"],
    tags: ["ac-repair", "ac-service", "ac-installation", "split-ac", "window-ac", "ac-gas-filling", "ac-mechanic", "ac-cleaning", "cooling-repair", "ac-amc"],
  },
  {
    key: "carpenter",
    synonyms: ["carpenter", "badhai", "wood work", "furniture maker", "lakdi"],
    tags: ["carpenter", "badhai", "furniture-repair", "wood-work", "almirah-repair", "door-fitting", "modular-kitchen", "polish-work", "lakdi-kaam", "bed-repair"],
  },
  {
    key: "painter",
    synonyms: ["painter", "painting", "paint", "rang"],
    tags: ["painter", "wall-painting", "house-painting", "rangai", "putty-work", "texture-paint", "asian-paints", "interior-painting", "exterior-paint", "white-wash"],
  },
  {
    key: "bike-mechanic",
    synonyms: ["bike mechanic", "two wheeler", "scooter repair", "motorcycle", "bike repair"],
    tags: ["bike-mechanic", "two-wheeler-repair", "scooter-repair", "bike-service", "tyre-puncture", "engine-oil-change", "bike-wash", "chain-set", "battery-change", "motorcycle-repair"],
  },
  {
    key: "car-mechanic",
    synonyms: ["car mechanic", "car repair", "auto mechanic", "garage", "car service"],
    tags: ["car-mechanic", "car-repair", "car-service", "engine-repair", "car-wash", "denting-painting", "ac-repair-car", "tyre-change", "battery-jump", "garage"],
  },
  {
    key: "beautician",
    synonyms: ["beautician", "beauty parlour", "beauty salon", "facial", "makeup"],
    tags: ["beautician", "beauty-parlour", "facial", "threading", "waxing", "bridal-makeup", "haircut", "manicure-pedicure", "hair-spa", "ladies-salon"],
  },
  {
    key: "tailor",
    synonyms: ["tailor", "darzi", "stitching", "silai", "boutique"],
    tags: ["tailor", "darzi", "silai", "blouse-stitching", "alteration", "suit-stitching", "kurta-pajama", "boutique", "embroidery", "fall-pico"],
  },
  {
    key: "cook",
    synonyms: ["cook", "khana banane wala", "chef", "kitchen helper"],
    tags: ["cook", "home-cook", "khana-banao", "chef", "tiffin-cook", "party-cook", "north-indian", "south-indian", "veg-cook", "non-veg-cook"],
  },
  {
    key: "driver",
    synonyms: ["driver", "car driver", "personal driver", "taxi driver"],
    tags: ["driver", "personal-driver", "car-driver", "outstation-driver", "monthly-driver", "taxi-driver", "lmv-license", "experienced-driver", "night-driver", "wedding-driver"],
  },
  {
    key: "tutor",
    synonyms: ["tutor", "tuition", "teacher", "home tuition", "coaching", "padhane"],
    tags: ["home-tutor", "tuition-teacher", "school-tutor", "english-medium", "math-tutor", "science-tutor", "cbse-board", "class-1-to-10", "competitive-prep", "online-tuition"],
  },
  {
    key: "maid",
    synonyms: ["maid", "house help", "kaamwali", "bai", "domestic help", "house keeping"],
    tags: ["maid", "kaamwali", "bartan-jhaadu", "house-help", "cook-and-clean", "live-in-maid", "part-time-maid", "full-time-maid", "baby-care", "elderly-care"],
  },
  {
    key: "gardener",
    synonyms: ["gardener", "mali", "garden work", "plants"],
    tags: ["gardener", "mali", "plant-care", "lawn-mowing", "garden-design", "tree-trimming", "gamla-setup", "hedge-cutting", "monthly-mali", "kitchen-garden"],
  },
  {
    key: "photographer",
    synonyms: ["photographer", "photography", "camera", "videography", "shoot"],
    tags: ["photographer", "wedding-photography", "pre-wedding", "videography", "candid-shoot", "event-photo", "drone-shoot", "album-design", "studio-shoot", "birthday-shoot"],
  },
  {
    key: "mehndi-artist",
    synonyms: ["mehndi", "henna", "mehandi"],
    tags: ["mehndi-artist", "bridal-mehndi", "arabic-mehndi", "rajasthani-mehndi", "engagement-mehndi", "karva-chauth", "henna-design", "kids-mehndi", "wedding-mehndi", "dulhan-mehndi"],
  },
  {
    key: "dj",
    synonyms: ["dj", "sound system", "music system", "wedding dj"],
    tags: ["dj", "wedding-dj", "sound-system", "dj-on-rent", "party-dj", "lighting-setup", "speakers-rent", "dj-and-lights", "dj-floor", "music-system"],
  },
  {
    key: "pandit",
    synonyms: ["pandit", "pujari", "purohit", "panditji", "shastri"],
    tags: ["pandit", "pujari", "shadi-pandit", "havan-pooja", "griha-pravesh", "satyanarayan-katha", "purohit", "vidhi-vidhan", "marriage-pandit", "festival-pooja"],
  },
  {
    key: "ro-repair",
    synonyms: ["ro repair", "ro service", "water purifier", "ro filter", "aquaguard"],
    tags: ["ro-repair", "ro-service", "water-purifier", "filter-change", "ro-installation", "aquaguard-service", "kent-ro", "ro-amc", "uv-purifier", "drinking-water"],
  },
  {
    key: "mobile-repair",
    synonyms: ["mobile repair", "phone repair", "smartphone", "mobile shop"],
    tags: ["mobile-repair", "phone-repair", "screen-replace", "battery-change-mobile", "software-update", "iphone-repair", "android-repair", "charging-jack", "speaker-repair", "data-recovery"],
  },
  {
    key: "laptop-repair",
    synonyms: ["laptop repair", "computer repair", "pc repair", "desktop"],
    tags: ["laptop-repair", "computer-repair", "screen-repair-laptop", "keyboard-replace", "ram-upgrade", "ssd-install", "windows-install", "data-recovery-pc", "battery-replace-laptop", "virus-clean"],
  },
  {
    key: "laundry",
    synonyms: ["laundry", "dhobi", "dry clean", "wash and iron", "ironing"],
    tags: ["laundry", "dhobi", "dry-cleaning", "wash-and-iron", "press-wala", "monthly-laundry", "bedsheet-wash", "curtain-cleaning", "shoe-laundry", "starch-iron"],
  },
  {
    key: "tiffin-service",
    synonyms: ["tiffin", "dabba service", "lunch box", "ghar ka khana"],
    tags: ["tiffin-service", "ghar-ka-khana", "dabba-service", "lunch-tiffin", "veg-tiffin", "monthly-tiffin", "office-lunch", "homely-food", "north-indian-tiffin", "student-tiffin"],
  },
  {
    key: "event-decorator",
    synonyms: ["decorator", "decoration", "event decor", "wedding decor", "tent house"],
    tags: ["event-decorator", "wedding-decoration", "stage-decor", "flower-decoration", "balloon-decor", "tent-house", "haldi-decor", "engagement-decor", "birthday-decor", "mandap-decor"],
  },
  {
    key: "makeup-artist",
    synonyms: ["makeup artist", "bridal makeup", "mua"],
    tags: ["makeup-artist", "bridal-makeup", "engagement-makeup", "party-makeup", "hd-makeup", "airbrush-makeup", "hairstyling", "saree-draping", "pre-wedding-makeup", "reception-makeup"],
  },
  {
    key: "yoga-instructor",
    synonyms: ["yoga", "yoga teacher", "yoga trainer", "meditation"],
    tags: ["yoga-instructor", "home-yoga", "morning-yoga", "weight-loss-yoga", "meditation", "pranayam", "kids-yoga", "ladies-yoga", "online-yoga", "back-pain-yoga"],
  },
  {
    key: "gym-trainer",
    synonyms: ["gym trainer", "fitness trainer", "personal trainer", "fitness coach"],
    tags: ["gym-trainer", "personal-trainer", "fitness-coach", "weight-loss", "muscle-gain", "diet-plan", "home-workout", "ladies-trainer", "cardio-training", "strength-training"],
  },
  {
    key: "security-guard",
    synonyms: ["security guard", "watchman", "chowkidar", "security"],
    tags: ["security-guard", "chowkidar", "watchman", "night-guard", "gunman", "bouncer", "society-guard", "factory-security", "wedding-security", "armed-guard"],
  },
  {
    key: "labour",
    synonyms: ["labour", "majdoor", "helper", "loading unloading", "mazdoor"],
    tags: ["labour", "majdoor", "helper", "loading-unloading", "shifting-help", "construction-labour", "daily-wage", "packing-help", "lifting-work", "unskilled-worker"],
  },
  {
    key: "mason",
    synonyms: ["mason", "raj mistri", "construction", "rajmistri", "thekedar"],
    tags: ["mason", "raj-mistri", "construction-work", "house-construction", "plaster-work", "tile-fitting", "brick-work", "boundary-wall", "thekedar", "renovation-work"],
  },
  {
    key: "welder",
    synonyms: ["welder", "welding", "iron work", "lohar"],
    tags: ["welder", "welding-work", "iron-grill", "gate-fabrication", "lohar", "shutter-repair", "railing-work", "steel-fabrication", "arc-welding", "metal-work"],
  },
  {
    key: "packers-movers",
    synonyms: ["packers", "movers", "shifting", "house shifting", "packers and movers"],
    tags: ["packers-movers", "house-shifting", "office-shifting", "local-shifting", "outstation-shifting", "loading-unloading", "packing-service", "transport", "tempo-on-rent", "intercity-shifting"],
  },
  {
    key: "pest-control",
    synonyms: ["pest control", "termite", "cockroach", "deemak"],
    tags: ["pest-control", "termite-treatment", "deemak-control", "cockroach-spray", "bed-bug-treatment", "rodent-control", "mosquito-spray", "annual-pest", "kitchen-pest", "general-pest"],
  },
];

const NORMALISED: Array<{ entry: DictEntry; needles: string[] }> =
  TAG_DICTIONARY.map(e => ({ entry: e, needles: e.synonyms.map(s => s.toLowerCase()) }));

/**
 * Look up tags from the dictionary using `serviceName` (and optionally extra
 * context like description). Returns an empty array when no synonym matches.
 */
export function lookupDictionary(serviceName: string, description?: string | null): string[] {
  const hay = `${serviceName} ${description || ""}`.toLowerCase();
  const matched = new Set<string>();
  for (const { entry, needles } of NORMALISED) {
    if (needles.some(n => hay.includes(n))) {
      for (const t of entry.tags) matched.add(t);
    }
  }
  return Array.from(matched);
}
