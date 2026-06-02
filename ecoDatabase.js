// ============================================================
// EcoScore Database v2 — Universal Material Intelligence
// Local scoring + fallback alternatives for ALL product types
// ============================================================

// ─── Primary Material Keywords ────────────────────────────────
const ecoKeywords = {
  // ✅ Highly sustainable (80–100)
  bamboo:       { score: 95, label: "Renewable & biodegradable bamboo", co2Factor: 0.5 },
  hemp:         { score: 94, label: "Rapidly renewable hemp crop", co2Factor: 0.6 },
  cork:         { score: 93, label: "Sustainable bark — tree stays alive", co2Factor: 0.4 },
  linen:        { score: 92, label: "Low-water natural linen fiber", co2Factor: 0.7 },
  organic:      { score: 91, label: "Organic certified — no harmful chemicals", co2Factor: 0.8 },
  recycled:     { score: 90, label: "Uses reclaimed / post-consumer material", co2Factor: 1.0 },
  refurbished:  { score: 92, label: "Extends product life — zero new resources", co2Factor: 0.3 },
  upcycled:     { score: 93, label: "Repurposed material prevents landfill waste", co2Factor: 0.2 },
  secondhand:   { score: 95, label: "Circular economy — no new production needed", co2Factor: 0.1 },
  compostable:  { score: 91, label: "Fully compostable at end of life", co2Factor: 0.6 },
  biodegradable:{ score: 89, label: "Naturally biodegrades without harm", co2Factor: 0.9 },
  solar:        { score: 92, label: "Solar-powered — zero emission energy", co2Factor: 0.2 },
  steel:        { score: 88, label: "Highly durable & infinitely recyclable", co2Factor: 2.1 },
  glass:        { score: 85, label: "100% recyclable natural material", co2Factor: 1.5 },
  jute:         { score: 85, label: "Biodegradable & low-carbon fiber", co2Factor: 0.5 },
  sisal:        { score: 82, label: "Natural plant fiber — low impact", co2Factor: 0.6 },
  beeswax:      { score: 88, label: "Natural & fully biodegradable", co2Factor: 0.4 },
  coconut:      { score: 86, label: "Sustainable coconut by-product", co2Factor: 0.7 },
  wood:         { score: 78, label: "Renewable if sustainably sourced (FSC)", co2Factor: 1.0 },
  paper:        { score: 78, label: "Biodegradable — prefer recycled grade", co2Factor: 1.2 },
  wool:         { score: 76, label: "Natural biodegradable animal fiber", co2Factor: 3.5 },
  cotton:       { score: 70, label: "Natural fiber but high water use", co2Factor: 2.8 },
  ceramic:      { score: 68, label: "Durable natural inorganic material", co2Factor: 1.8 },
  clay:         { score: 70, label: "Natural material, low embodied energy", co2Factor: 1.5 },
  linen:        { score: 92, label: "Low-water linen — excellent sustainability", co2Factor: 0.7 },

  // ⚠️ Medium impact (30–69)
  aluminum:     { score: 62, label: "Recyclable but energy-intensive to produce", co2Factor: 4.0 },
  rubber:       { score: 55, label: "Partially renewable natural rubber", co2Factor: 3.0 },
  leather:      { score: 35, label: "High water & chemical use in tanning", co2Factor: 17.0 },
  nylon:        { score: 32, label: "Petroleum-based — sheds microplastics", co2Factor: 5.5 },
  acrylic:      { score: 28, label: "Non-biodegradable petroleum synthetic", co2Factor: 4.8 },
  spandex:      { score: 28, label: "Synthetic stretch — microplastic risk", co2Factor: 4.5 },
  viscose:      { score: 42, label: "Semi-synthetic — deforestation risk", co2Factor: 3.5 },
  rayon:        { score: 40, label: "Chemical-heavy processing needed", co2Factor: 3.8 },

  // ❌ High impact / harmful (0–29)
  polyester:    { score: 22, label: "Microplastic-shedding petroleum synthetic", co2Factor: 5.5 },
  plastic:      { score: 20, label: "Petroleum-based, non-biodegradable", co2Factor: 6.0 },
  polypropylene:{ score: 18, label: "Non-biodegradable petroleum plastic", co2Factor: 5.8 },
  pvc:          { score: 12, label: "Toxic plasticisers — harmful production", co2Factor: 7.2 },
  styrofoam:    { score: 8,  label: "Extremely harmful — never biodegrades", co2Factor: 8.5 },
  disposable:   { score: 10, label: "Single-use — catastrophic waste impact", co2Factor: 7.0 },
  synthetic:    { score: 25, label: "Petroleum-derived material", co2Factor: 5.0 },
  "single-use": { score: 10, label: "Single-use product — massive waste", co2Factor: 7.0 },
  microplastic: { score: 5,  label: "Actively pollutes waterways with microplastics", co2Factor: 9.0 },
};

// ─── Category Modifiers ───────────────────────────────────────
const categoryModifiers = {
  reusable:        +12,
  refillable:      +14,
  "eco-friendly":  +15,
  sustainable:     +12,
  biodegradable:   +15,
  compostable:     +18,
  "energy efficient": +8,
  "solar powered": +20,
  handmade:        +5,
  "fair trade":    +8,
  "zero waste":    +16,
  "carbon neutral":+12,
  "plant based":   +10,
  vegan:           +6,
  "single use":    -20,
  "non-recyclable":-15,
  battery:         -5,
  electronic:      -8,
  "fast fashion":  -12,
};

// ─── Local Fallback Alternatives (used when AI is unavailable) ─
const alternatives = {
  plastic: [
    { name: "Bamboo Reusable Alternative", score: 92, icon: "🪴", searchQuery: "bamboo eco alternative plastic free" },
    { name: "Stainless Steel Version", score: 88, icon: "🫙", searchQuery: "stainless steel reusable plastic free" },
    { name: "Glass Option", score: 85, icon: "🧴", searchQuery: "glass eco alternative" },
  ],
  polyester: [
    { name: "Organic Cotton Clothing", score: 88, icon: "👕", searchQuery: "GOTS organic cotton clothing" },
    { name: "Hemp Fabric Garment", score: 93, icon: "🌿", searchQuery: "hemp fabric clothing sustainable" },
    { name: "Recycled Fiber Wear", score: 84, icon: "♻️", searchQuery: "recycled fiber sustainable clothing" },
  ],
  leather: [
    { name: "Cork Leather Item", score: 93, icon: "🍾", searchQuery: "cork leather vegan sustainable bag" },
    { name: "Hemp Canvas Alternative", score: 91, icon: "🌿", searchQuery: "hemp canvas vegan eco bag" },
    { name: "Apple Leather / PIÑATEX", score: 82, icon: "🍎", searchQuery: "apple leather pinatex vegan alternative" },
  ],
  nylon: [
    { name: "Organic Cotton Tote", score: 88, icon: "🛍️", searchQuery: "organic cotton tote bag" },
    { name: "Jute Bag", score: 85, icon: "🌾", searchQuery: "jute eco bag sustainable" },
    { name: "Recycled PET Bag", score: 80, icon: "♻️", searchQuery: "recycled PET bottle bag" },
  ],
  pvc: [
    { name: "Natural Rubber Mat", score: 65, icon: "🧘", searchQuery: "natural rubber yoga mat" },
    { name: "Cork Alternative", score: 93, icon: "🍾", searchQuery: "cork eco alternative" },
  ],
  disposable: [
    { name: "Reusable Bamboo Set", score: 95, icon: "🥢", searchQuery: "reusable bamboo cutlery set" },
    { name: "Stainless Steel Cutlery", score: 88, icon: "🍴", searchQuery: "stainless steel reusable cutlery" },
    { name: "Beeswax Food Wraps", score: 88, icon: "🍯", searchQuery: "beeswax food wrap reusable" },
  ],
  styrofoam: [
    { name: "Mushroom Packaging", score: 96, icon: "🍄", searchQuery: "mushroom mycelium packaging eco" },
    { name: "Cork Packaging", score: 93, icon: "🍾", searchQuery: "cork packaging eco friendly" },
    { name: "Recycled Cardboard", score: 80, icon: "📦", searchQuery: "recycled cardboard packaging" },
  ],
  acrylic: [
    { name: "Organic Wool Option", score: 76, icon: "🧶", searchQuery: "organic wool sustainable alternative" },
    { name: "Recycled Cashmere", score: 84, icon: "🌿", searchQuery: "recycled cashmere sustainable knitwear" },
  ],
  cotton: [
    { name: "Organic Cotton (GOTS)", score: 88, icon: "🌱", searchQuery: "GOTS certified organic cotton" },
    { name: "Linen Fabric Item", score: 92, icon: "🌿", searchQuery: "linen sustainable fabric product" },
    { name: "Tencel / Lyocell", score: 85, icon: "🌲", searchQuery: "tencel lyocell sustainable fabric" },
  ],
};

// ─── CO2 Context Labels ────────────────────────────────────────
const co2Messages = {
  low:      "Lower than avg. household item 🌱",
  medium:   "Similar to driving 10 km 🚗",
  high:     "Equivalent to a short flight ✈️",
  veryHigh: "Major environmental burden 🏭",
};

// ─── Grade System ──────────────────────────────────────────────
const gradeConfig = {
  "A+": { min: 90, color: "#00c853", emoji: "🌱", label: "Exceptional" },
  A:    { min: 75, color: "#64dd17", emoji: "✅", label: "Excellent" },
  B:    { min: 60, color: "#ffd600", emoji: "⚠️", label: "Moderate" },
  C:    { min: 40, color: "#ff6d00", emoji: "🔶", label: "Poor" },
  D:    { min: 0,  color: "#d50000", emoji: "❌", label: "Harmful" },
};

function getGrade(score) {
  if (score >= 90) return "A+";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

function getGradeConfig(score) {
  return gradeConfig[getGrade(score)];
}

// ─── Material Extraction Helper ────────────────────────────────
// Extracts matched eco keywords from a product title
function extractMaterials(titleLower) {
  const found = [];
  for (const key of Object.keys(ecoKeywords)) {
    if (titleLower.includes(key)) found.push(key);
  }
  return found;
}

// ─── Category Detection ────────────────────────────────────────
function detectCategory(titleLower) {
  const cats = {
    "Clothing & Apparel": ["shirt", "t-shirt", "tshirt", "dress", "trouser", "jeans", "jacket", "hoodie", "top", "skirt", "legging", "sock", "underwear", "bra", "kurta", "saree", "pajama", "shorts"],
    "Footwear": ["shoe", "sneaker", "sandal", "boot", "slipper", "heel", "loafer", "flip flop", "clogs"],
    "Kitchen & Home": ["bottle", "container", "jar", "cup", "mug", "plate", "bowl", "kitchen", "cookware", "pan", "pot", "utensil", "cutlery", "blender", "toaster", "kettle", "fryer", "cooker"],
    "Personal Care": ["toothbrush", "shampoo", "soap", "deodorant", "moisturiser", "lotion", "cream", "razor", "skincare", "haircare", "perfume", "trimmer"],
    "Electronics": [
      "phone", "smartphone", "mobile", "mobiles", "cellphone", "5g", "4g", "gb", "ram", "rom", "sim", 
      "iphone", "ipad", "macbook", "airpods", "redmi", "realme", "oneplus", "samsung", "galaxy", "motorola", 
      "moto", "vivo", "oppo", "xiaomi", "pixel", "lenovo", "asus", "nokia", "sony",
      "laptop", "tablet", "charger", "cable", "earphone", "speaker", "watch", "camera", "smartwatch",
      "tv", "television", "headphone", "earbud", "console", "playstation", "xbox", "nintendo"
    ],
    "Bags & Accessories": ["bag", "purse", "wallet", "backpack", "handbag", "tote", "sling", "luggage", "belt", "sunglasses"],
    "Food & Grocery": ["food", "snack", "drink", "beverage", "grocery", "organic food", "supplement", "protein", "coffee", "tea"],
    "Baby & Kids": ["baby", "kid", "child", "toy", "diaper", "nappy", "infant", "toddler", "stroller"],
    "Sports & Fitness": ["yoga", "gym", "fitness", "sport", "exercise", "workout", "running", "cycling", "mat", "dumbbell"],
    "Stationery": ["pen", "pencil", "notebook", "paper", "book", "diary", "journal", "planner"],
  };

  for (const [cat, keywords] of Object.entries(cats)) {
    if (
      keywords.some((k) => {
        // Use regex word boundaries for short words (less than 4 letters, like 'pan', 'pot', 'mat')
        // to prevent false positives in substrings (e.g. 'pan' matching inside 'companion' or 'spandex')
        if (k.length < 4) {
          return new RegExp("\\b" + k + "\\b").test(titleLower);
        }
        return titleLower.includes(k);
      })
    ) {
      return cat;
    }
  }
  return "General Product";
}
