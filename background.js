// ============================================================
// EcoScore Background Service Worker (MV3)
// Handles Google OAuth, Stats tracking, & Gemini AI calls
// ============================================================

const BACKEND_URL = "http://localhost:5000";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent";

// ─── Installation Onboarding ──────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("🌱 EcoScore Extension Installed! Opening onboarding dashboard...");
    chrome.tabs.create({
      url: chrome.runtime.getURL("popup.html?onboarding=true"),
    });
  }
});

// ─── Message Router ───────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ECO_GET_ALTERNATIVES") {
    handleAlternatives(message)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ success: false, error: err.message, alternatives: [], usedAI: false })
      );
    return true; // keep channel open for async
  }

  if (message.type === "ECO_SAVE_KEY") {
    chrome.storage.sync.set({ geminiApiKey: message.key }, () =>
      sendResponse({ success: true })
    );
    return true;
  }

  if (message.type === "ECO_GET_KEY") {
    chrome.storage.sync.get("geminiApiKey", (r) =>
      sendResponse({ key: r.geminiApiKey || "" })
    );
    return true;
  }

  // ─── NEW: Google OAuth Actions ─────────────────────────────

  if (message.type === "ECO_GOOGLE_LOGIN") {
    handleGoogleLogin()
      .then(sendResponse)
      .catch((err) => {
        console.error("Google Login Exception:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.type === "ECO_SANDBOX_LOGIN") {
    handleSandboxLogin()
      .then(sendResponse)
      .catch((err) => {
        console.error("Sandbox Login Exception:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.type === "ECO_LOGOUT") {
    handleLogout()
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ─── NEW: User Stats Updates ────────────────────────────────

  if (message.type === "ECO_RECORD_SCAN") {
    handleRecordScan(message.score, message.carbonSaved)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "ECO_GET_USER_STATS") {
    syncUserStats()
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ─── Google OAuth Flow ────────────────────────────────────────
async function handleGoogleLogin() {
  console.log("🔐 Background: Initiating chrome.identity.getAuthToken...");
  
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError) {
        console.error("chrome.identity Error:", chrome.runtime.lastError.message);
        return reject(new Error(chrome.runtime.lastError.message));
      }

      if (!token) {
        return reject(new Error("No access token returned from Google."));
      }

      console.log("🔑 Background: Token received. Fetching Google user info...");
      try {
        // Exchange token for Google profile info
        const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!userinfoRes.ok) {
          throw new Error(`Google profile fetch failed: ${userinfoRes.status}`);
        }

        const profile = await userinfoRes.json();
        console.log(`👤 Background: Retrieved profile for ${profile.email}. Syncing with backend...`);

        // Send token to backend to verify and record in DB
        const backendRes = await fetch(`${BACKEND_URL}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: token }),
        });

        if (!backendRes.ok) {
          const backendErr = await backendRes.text();
          throw new Error(`Backend Sync Failed: ${backendErr}`);
        }

        const data = await backendRes.json();
        if (data.success && data.user) {
          // Store user session in storage
          await chrome.storage.local.set({
            currentUser: data.user,
            accessToken: token,
            authProvider: "google"
          });
          console.log("✅ Background: User profile saved to local storage");
          resolve({ success: true, user: data.user });
        } else {
          throw new Error(data.error || "Unknown backend response");
        }
      } catch (err) {
        // Remove cached token if authentication failed
        chrome.identity.removeCachedAuthToken({ token }, () => {});
        reject(err);
      }
    });
  });
}

// ─── Sandbox Login Flow ───────────────────────────────────────
async function handleSandboxLogin() {
  console.log("🛠️ Background: Requesting developer sandbox credentials...");
  
  const res = await fetch(`${BACKEND_URL}/api/auth/sandbox`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sandbox authentication server error: ${errText}`);
  }

  const data = await res.json();
  if (data.success && data.user) {
    await chrome.storage.local.set({
      currentUser: data.user,
      accessToken: "sandbox_token_12345",
      authProvider: "sandbox"
    });
    console.log("✅ Background: Sandbox developer profile saved to storage");
    return { success: true, user: data.user };
  } else {
    throw new Error(data.error || "Sandbox server response error");
  }
}

// ─── Logout Flow ──────────────────────────────────────────────
async function handleLogout() {
  console.log("🚪 Background: Logging user out...");
  
  const local = await chrome.storage.local.get(["accessToken", "authProvider"]);
  const token = local.accessToken;
  const provider = local.authProvider;

  if (token && provider === "google") {
    // Revoke from chrome's cache
    await new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        console.log("🗑️ Background: Google token removed from Chrome cache");
        resolve();
      });
    });
  }

  // Clear local credentials
  await chrome.storage.local.remove(["currentUser", "accessToken", "authProvider"]);
  console.log("✅ Background: User session cleared.");
  return { success: true };
}

// ─── Record Product Scan ──────────────────────────────────────
async function handleRecordScan(score, carbonSaved) {
  const local = await chrome.storage.local.get("currentUser");
  const user = local.currentUser;

  if (!user || !user.googleId) {
    console.log("👤 Background: No active user session. Scan not saved in database.");
    return { success: false, error: "not_logged_in" };
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/user/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        googleId: user.googleId,
        score: score,
        carbonSaved: carbonSaved || 0
      })
    });

    if (!res.ok) {
      throw new Error(`Failed to record scan on server: ${res.status}`);
    }

    const data = await res.json();
    if (data.success && data.user) {
      await chrome.storage.local.set({ currentUser: data.user });
      console.log(`📈 Background: Updated stats stored locally for ${data.user.email}`);
      return { success: true, user: data.user };
    }
    return { success: false };
  } catch (err) {
    console.warn("⚠️ Background: Could not sync scan stats with backend:", err.message);
    return { success: false, error: err.message };
  }
}

// ─── Sync User Profile Stats ──────────────────────────────────
async function syncUserStats() {
  const local = await chrome.storage.local.get("currentUser");
  const user = local.currentUser;

  if (!user || !user.googleId) {
    return { success: false, error: "not_logged_in" };
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/user/${user.googleId}`);
    if (!res.ok) {
      throw new Error(`Profile fetch error: ${res.status}`);
    }

    const data = await res.json();
    if (data.success && data.user) {
      await chrome.storage.local.set({ currentUser: data.user });
      return { success: true, user: data.user };
    }
    return { success: false };
  } catch (err) {
    console.warn("⚠️ Background: Could not sync user stats with server:", err.message);
    // Return locally stored credentials as fallback
    return { success: true, user };
  }
}

// ─── Core: Get Eco Alternatives (Original Logic Kept) ─────────
// ─── Core: Get Eco Alternatives (Unified Real-Time AI Auditor) ───
async function handleAlternatives({ productTitle, detectedMaterials, category }) {
  const stored = await chrome.storage.sync.get("geminiApiKey");
  const apiKey = stored.geminiApiKey || "";

  if (!apiKey || apiKey === "" || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
    return {
      success: false,
      error: "no_key",
      analysis: null,
      alternatives: getLocalFallback(detectedMaterials),
      usedAI: false,
    };
  }

  try {
    const prompt = buildPrompt(productTitle, detectedMaterials, category);
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 1000, topP: 0.95 }
    };

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API ${res.status}: ${errText.substring(0, 120)}`);
    }

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("Empty response from Gemini");

    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") throw new Error("Response is not a valid JSON object");

    return {
      success: true,
      analysis: {
        score: Math.round(Number(parsed.productAnalysis?.score) || 50),
        co2: String(parsed.productAnalysis?.co2Kg || "4.5"),
        reason: String(parsed.productAnalysis?.reason || "Audited via Gemini AI"),
      },
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0, 4) : getLocalFallback(detectedMaterials),
      usedAI: true,
    };
  } catch (err) {
    console.warn("[EcoScore] AI search failed, using fallback:", err.message);
    return {
      success: false,
      error: err.message,
      analysis: null,
      alternatives: getLocalFallback(detectedMaterials),
      usedAI: false,
    };
  }
}

function buildPrompt(title, materials, category) {
  const matLine = materials?.length
    ? `Detected materials/keywords: ${materials.join(", ")}.`
    : "";
  const catLine = category ? `Product category: ${category}.` : "";

  return `You are a world-class environmental sustainability expert and green-product researcher.

A shopper is viewing this product online:
"${title}"
${matLine}
${catLine}

Your mission:
1. Conduct an environmental sustainability audit of this exact product. Estimate:
   a. Its EcoScore (0-100, where higher is greener, lower is more harmful).
   b. Its estimated lifecycle carbon footprint in kg CO₂ equivalent (as a precise, highly realistic number based on category, manufacturing energy, transport, and weight e.g. smartphones range from "70.0" to "90.0", clothes "8.0" to "15.0", plastics "2.0" to "6.0", durables "30.0" to "150.0" etc.).
   c. A highly specific, non-generic explanation of why you gave this score and carbon footprint (maximum 22 words). Focus on key materials, production impact, or electronic battery waste.
2. Find exactly 3 commercially available eco-friendly ALTERNATIVE PRODUCTS that are commercially available online, functionally equivalent, specific enough to search for, and have a lower footprint.

Return ONLY a valid JSON object — no markdown, no explanation, no extra text:
{
  "productAnalysis": {
    "score": 35,
    "co2Kg": "78.5",
    "reason": "Detailed precise explanation under 22 words"
  },
  "alternatives": [
    {
      "name": "Specific Eco-Friendly Alternative",
      "icon": "🌿",
      "reason": "Lower CO₂ impact explanation",
      "score": 88,
      "co2Kg": "2.1", // Estimated lifecycle carbon footprint in kg CO2 for this alternative (MUST be numerically LESS than the productAnalysis co2Kg!)
      "searchQuery": "exact search query to buy on Amazon/Etsy",
      "where": "Amazon, Brand Site"
    }
  ]
}`;
}

function getLocalFallback(materials) {
  const m = (materials || []).join(" ").toLowerCase();

  if (m.includes("plastic") || m.includes("polyester") || m.includes("pvc") || m.includes("nylon")) {
    return [
      { name: "Bamboo Alternative", icon: "🪴", reason: "Biodegradable, fast-growing, zero plastic", score: 90, co2Kg: "0.4", searchQuery: "bamboo eco friendly alternative", where: "Amazon, Etsy" },
      { name: "Stainless Steel Reusable", icon: "🫙", reason: "Infinitely recyclable, lasts decades", score: 87, co2Kg: "2.1", searchQuery: "stainless steel reusable eco product", where: "Amazon" },
      { name: "Recycled Material Version", icon: "♻️", reason: "Made from post-consumer waste", score: 82, co2Kg: "1.5", searchQuery: "recycled material sustainable product", where: "Amazon, Etsy" },
    ];
  }
  if (m.includes("leather") || m.includes("fur")) {
    return [
      { name: "Cork Leather Accessory", icon: "🍾", reason: "Plant-based, biodegradable cork material", score: 93, co2Kg: "0.8", searchQuery: "cork leather vegan bag wallet", where: "Etsy, Amazon" },
      { name: "Hemp Canvas Product", icon: "🌿", reason: "Rapidly renewable, strong natural fiber", score: 92, co2Kg: "1.1", searchQuery: "hemp canvas eco vegan alternative", where: "Etsy" },
      { name: "Recycled PET Fabric Item", icon: "♻️", reason: "Made from recycled plastic bottles", score: 80, co2Kg: "1.8", searchQuery: "recycled PET fabric vegan product", where: "Amazon" },
    ];
  }
  if (m.includes("cotton") || m.includes("synthetic") || m.includes("acrylic")) {
    return [
      { name: "Organic Cotton Version", icon: "🌱", reason: "GOTS certified, no pesticides or chemicals", score: 88, co2Kg: "1.2", searchQuery: "GOTS certified organic cotton product", where: "Amazon, Etsy" },
      { name: "Linen or Hemp Fabric", icon: "🌿", reason: "Minimal water use, naturally biodegradable", score: 91, co2Kg: "1.0", searchQuery: "linen hemp natural fabric product", where: "Etsy, Amazon" },
      { name: "Fair Trade Organic Brand", icon: "🤝", reason: "Ethical production & lower emissions", score: 85, co2Kg: "1.6", searchQuery: "fair trade organic eco certified product", where: "Multiple retailers" },
    ];
  }

  return [
    { name: "Certified Organic Option", icon: "🌱", reason: "Organic certified, reduced chemical impact", score: 84, co2Kg: "1.5", searchQuery: "organic certified eco friendly product", where: "Amazon, Etsy" },
    { name: "Secondhand / Upcycled", icon: "♻️", reason: "Zero new resource extraction required", score: 97, co2Kg: "0.1", searchQuery: "secondhand upcycled refurbished product", where: "eBay, Etsy, Facebook Marketplace" },
    { name: "B-Corp Certified Brand", icon: "🏅", reason: "Independently verified sustainability standards", score: 88, co2Kg: "1.4", searchQuery: "B-corp certified sustainable brand product", where: "Brand websites, Amazon" },
  ];
}
