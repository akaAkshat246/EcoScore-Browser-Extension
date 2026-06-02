// ============================================================
// EcoScore Score Engine — Shared scoring logic for backend
// ============================================================

const ecoKeywords = {
  bamboo:       { score: 95, label: "Renewable & biodegradable", co2Factor: 0.5 },
  hemp:         { score: 94, label: "Rapidly renewable crop", co2Factor: 0.6 },
  cork:         { score: 93, label: "Sustainable bark harvest", co2Factor: 0.4 },
  linen:        { score: 92, label: "Low-impact natural fiber", co2Factor: 0.7 },
  organic:      { score: 91, label: "Organic & chemical-free", co2Factor: 0.8 },
  recycled:     { score: 90, label: "Uses reclaimed materials", co2Factor: 1.0 },
  steel:        { score: 88, label: "Highly durable & reusable", co2Factor: 2.1 },
  glass:        { score: 85, label: "100% recyclable material", co2Factor: 1.5 },
  jute:         { score: 85, label: "Biodegradable & low-carbon", co2Factor: 0.5 },
  paper:        { score: 80, label: "Biodegradable material", co2Factor: 1.2 },
  wood:         { score: 78, label: "Renewable if sustainably sourced", co2Factor: 1.0 },
  wool:         { score: 76, label: "Natural & biodegradable fiber", co2Factor: 3.5 },
  cotton:       { score: 70, label: "Natural fiber (high water use)", co2Factor: 2.8 },
  ceramic:      { score: 68, label: "Durable natural material", co2Factor: 1.8 },
  rubber:       { score: 55, label: "Partially renewable material", co2Factor: 3.0 },
  leather:      { score: 45, label: "High environmental impact", co2Factor: 17.0 },
  nylon:        { score: 35, label: "Petroleum-based synthetic", co2Factor: 5.5 },
  acrylic:      { score: 30, label: "Non-biodegradable synthetic", co2Factor: 4.8 },
  polyester:    { score: 22, label: "Microplastic-shedding synthetic", co2Factor: 5.5 },
  plastic:      { score: 20, label: "Petroleum-based, non-biodegradable", co2Factor: 6.0 },
  polypropylene:{ score: 18, label: "Non-biodegradable plastic", co2Factor: 5.8 },
  pvc:          { score: 12, label: "Toxic plastic material", co2Factor: 7.2 },
  styrofoam:    { score: 8,  label: "Extremely harmful to environment", co2Factor: 8.5 },
  disposable:   { score: 10, label: "Single-use — high waste impact", co2Factor: 7.0 },
  synthetic:    { score: 25, label: "Petroleum-derived material", co2Factor: 5.0 },
};

const categoryModifiers = {
  reusable: 10,
  refillable: 12,
  "eco-friendly": 15,
  sustainable: 12,
  biodegradable: 15,
  compostable: 18,
  "single use": -20,
  "non-recyclable": -15,
};

function gradeFromScore(score) {
  if (score >= 90) return "A+";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

function gradeLabel(grade) {
  const labels = { "A+": "Exceptional", A: "Excellent", B: "Moderate", C: "Poor", D: "Harmful" };
  return labels[grade] || "Unknown";
}

function scoreProduct(productName) {
  const lower = productName.toLowerCase();
  let score = 55;
  let matchedKeyword = null;
  let reason = "General product — no specific eco material detected";
  let co2 = 4.5;

  for (const [key, data] of Object.entries(ecoKeywords)) {
    if (lower.includes(key)) {
      score = data.score;
      matchedKeyword = key;
      reason = data.label;
      co2 = data.co2Factor;
      break;
    }
  }

  for (const [mod, delta] of Object.entries(categoryModifiers)) {
    if (lower.includes(mod)) {
      score = Math.min(100, Math.max(0, score + delta));
    }
  }

  const grade = gradeFromScore(score);

  return {
    productName,
    ecoScore: score,
    grade,
    gradeLabel: gradeLabel(grade),
    reason,
    matchedMaterial: matchedKeyword,
    carbonFootprint: {
      estimatedKgCO2: parseFloat(co2.toFixed(2)),
      unit: "kg CO₂ equivalent",
    },
  };
}

module.exports = { scoreProduct };
