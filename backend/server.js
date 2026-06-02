// ============================================================
// EcoScore Secure Backend Server (v2)
// Express + Helmet + Rate Limit + Google Token Verification + JSON DB
// ============================================================

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./database");
const { scoreProduct } = require("./scoreEngine");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security Middleware ──────────────────────────────────────
app.use(helmet());

// Dynamic CORS configuration to allow Chrome Extensions & Localhost
const allowedOriginRegex = /^chrome-extension:\/\/[a-z]{32}$/;
app.use(
  cors({
    origin: function (origin, callback) {
      // Chrome extension pages have an origin of chrome-extension://<32-chars-id>
      // Content scripts on pages may pass the page origin, but background requests pass chrome-extension://<id>
      // Local testing may not have an origin (null) or localhost
      if (
        !origin ||
        origin.startsWith("chrome-extension://") ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        allowedOriginRegex.test(origin)
      ) {
        callback(null, true);
      } else {
        console.warn(`[CORS Blocked] Request from unauthorized origin: ${origin}`);
        callback(new Error("Blocked by CORS policy"));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

app.use(express.json());

// Global Rate Limiter to prevent brute force and server abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // limit each IP to 150 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again later." },
});
app.use("/api/", apiLimiter);

// ── Google Token Verification Helper ────────────────────────
/**
 * Verifies a Google Access Token directly with Google's servers
 * @param {string} accessToken
 * @returns {Promise<object|null>} Profile information if valid, null otherwise
 */
async function verifyGoogleAccessToken(accessToken) {
  if (!accessToken) return null;
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Google tokeninfo endpoint error: ${response.status} - ${errText}`);
      return null;
    }

    const data = await response.json();
    if (data && data.id) {
      return {
        googleId: data.id,
        email: data.email,
        name: data.name,
        picture: data.picture,
      };
    }
    return null;
  } catch (err) {
    console.error("❌ Exception verifying Google access token:", err.message);
    return null;
  }
}

// ── Auth Routes ─────────────────────────────────────────────

/**
 * Health check route
 */
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "EcoScore Secure API",
    version: "2.0.0",
    databaseUsers: Object.keys(db.memoryDb.users).length,
    systemScans: db.getSystemStats().totalScans,
  });
});

/**
 * POST /api/auth/google
 * Authenticates user, verifies their token with Google, and stores profile.
 */
app.post("/api/auth/google", async (req, res) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: "Missing 'accessToken' in request body" });
  }

  console.log("🔐 Authenticating Google access token...");
  const googleProfile = await verifyGoogleAccessToken(accessToken);

  if (!googleProfile) {
    return res.status(401).json({ error: "Invalid Google access token. Verification failed." });
  }

  try {
    const user = db.upsertUser(googleProfile);
    res.json({
      success: true,
      message: "Google login verified and stored successfully",
      user,
    });
  } catch (err) {
    console.error("❌ Error upserting user in DB:", err);
    res.status(500).json({ error: "Internal server database error" });
  }
});

/**
 * POST /api/auth/sandbox
 * Developer sandbox login for immediate testing without Google credentials.
 */
app.post("/api/auth/sandbox", (req, res) => {
  console.log("🛠️ Developer Sandbox Login triggered...");
  
  const mockProfile = {
    googleId: "sandbox_dev_1337",
    email: "eco.developer@ecoscore.test",
    name: "Eco Sandbox Developer",
    picture: "https://lh3.googleusercontent.com/a/default-user=s96-c",
  };

  try {
    const user = db.upsertUser(mockProfile);
    res.json({
      success: true,
      message: "Sandbox developer profile loaded successfully",
      user,
    });
  } catch (err) {
    console.error("❌ Error saving sandbox profile:", err);
    res.status(500).json({ error: "Internal server database error" });
  }
});

// ── Profile & Stats Routes ──────────────────────────────────

/**
 * GET /api/user/:googleId
 * Fetches user profile details and current stats
 */
app.get("/api/user/:googleId", (req, res) => {
  const { googleId } = req.params;
  const user = db.getUser(googleId);

  if (!user) {
    return res.status(404).json({ error: "User not found in system" });
  }

  res.json({ success: true, user });
});

/**
 * POST /api/user/scan
 * Increments scanning stats and averages for a logged-in user
 */
app.post("/api/user/scan", (req, res) => {
  const { googleId, score, carbonSaved } = req.body;

  if (!googleId) {
    return res.status(400).json({ error: "Missing 'googleId' parameter" });
  }
  if (score === undefined) {
    return res.status(400).json({ error: "Missing 'score' parameter" });
  }

  const user = db.getUser(googleId);
  if (!user) {
    return res.status(404).json({ error: "User not registered in database" });
  }

  try {
    const updatedUser = db.recordScan(googleId, score, carbonSaved);
    res.json({
      success: true,
      message: "User stats successfully updated",
      user: updatedUser,
    });
  } catch (err) {
    console.error("❌ Error updating user stats:", err);
    res.status(500).json({ error: "Database stats write error" });
  }
});

/**
 * GET /api/users/leaderboard
 * Fetches the global sustainability leaderboard
 */
app.get("/api/users/leaderboard", (req, res) => {
  const leaderboard = db.getLeaderboard(10);
  const sysStats = db.getSystemStats();
  
  res.json({
    success: true,
    leaderboard,
    systemStats: sysStats,
  });
});

// ── Legacy Product Scoring API (kept for backward compatibility) ────

app.post("/score", (req, res) => {
  const { product } = req.body;
  if (!product || typeof product !== "string" || product.trim().length === 0) {
    return res.status(400).json({ error: "Missing or invalid 'product' field" });
  }
  const result = scoreProduct(product.trim());
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
});

app.get("/score", (req, res) => {
  const { product } = req.query;
  if (!product) {
    return res.status(400).json({ error: "Missing 'product' parameter" });
  }
  const result = scoreProduct(product.trim());
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
});

app.post("/compare", (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length < 2) {
    return res.status(400).json({ error: "Provide at least 2 products to compare" });
  }
  const results = products.slice(0, 5).map((p) => scoreProduct(String(p)));
  results.sort((a, b) => b.ecoScore - a.ecoScore);
  res.json({
    success: true,
    winner: results[0].productName,
    comparison: results,
    timestamp: new Date().toISOString(),
  });
});

// ── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌿 ============================================================`);
  console.log(`🌿 EcoScore SECURE Backend running on http://localhost:${PORT}`);
  console.log(`🌿 ============================================================`);
  console.log(`   [GET]  /health                   — Check server health & DB stats`);
  console.log(`   [POST] /api/auth/google          — Authenticate & upsert Google profile`);
  console.log(`   [POST] /api/auth/sandbox         — Developer sandbox instant login`);
  console.log(`   [POST] /api/user/scan            — Record user scanning metrics`);
  console.log(`   [GET]  /api/users/leaderboard    — Global sustainability leaders`);
  console.log(`================================================================\n`);
});
