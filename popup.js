// ============================================================
// EcoScore Popup v2 — Score display, Gemini API, & Google Auth
// ============================================================

// ─── Tab Switching ────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.id === "tab-" + tab);
    b.setAttribute("aria-selected", b.id === "tab-" + tab);
  });
  document.querySelectorAll(".tab-pane").forEach((p) => {
    p.style.display = p.id === "pane-" + tab ? "block" : "none";
  });
  
  if (tab === "settings") loadSettingsPane();
  if (tab === "profile") loadProfilePane();
}

// ─── Score Display ────────────────────────────────────────────
const CIRC = 2 * Math.PI * 40; // r=40

function animateRing(score, color) {
  const fill = document.getElementById("ring-fill");
  if (!fill) return;
  const target = CIRC - (score / 100) * CIRC;
  fill.style.stroke = color;
  fill.style.strokeDasharray = CIRC;
  fill.style.strokeDashoffset = CIRC;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      fill.style.transition = "stroke-dashoffset 1.3s cubic-bezier(0.4,0,0.2,1)";
      fill.style.strokeDashoffset = target;
    })
  );
}

function animateBar(score, color) {
  const bar = document.getElementById("score-bar-fill");
  if (!bar) return;
  bar.style.background = color;
  bar.style.width = "0%";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      bar.style.transition = "width 1.3s cubic-bezier(0.4,0,0.2,1)";
      bar.style.width = score + "%";
    })
  );
}

function animateCount(score) {
  const el = document.getElementById("score-number");
  if (!el) return;
  const duration = 1200;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = Math.round((1 - Math.pow(1 - t, 3)) * score);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderScore(data) {
  document.getElementById("loading-state").style.display = "none";
  document.getElementById("product-card").style.display  = "block";

  const cfg = getGradeConfig(data.score);

  animateRing(data.score, cfg.color);
  animateBar(data.score, cfg.color);
  animateCount(data.score);

  const chip = document.getElementById("grade-chip");
  chip.style.background   = cfg.color + "1a";
  chip.style.borderColor  = cfg.color;
  chip.style.color        = cfg.color;
  document.getElementById("grade-emoji").textContent = cfg.emoji;
  document.getElementById("grade-text").textContent  = "Grade " + getGrade(data.score);

  const word = document.getElementById("grade-word");
  word.textContent  = cfg.label;
  word.style.color  = cfg.color;

  document.getElementById("product-name").textContent =
    data.title && data.title.length > 65 ? data.title.substring(0, 65) + "…" : (data.title || "Unknown product");

  // Category
  const catEl = document.getElementById("product-category");
  if (data.category) {
    catEl.textContent = "📦 " + data.category;
    catEl.style.display = "block";
  } else {
    catEl.style.display = "none";
  }

  document.getElementById("co2-value").textContent =
    (data.co2 || "?") + " kg CO₂";

  document.getElementById("reason-text").textContent =
    data.reason || "Score based on product material analysis";

  // Timestamp
  const ts = document.getElementById("timestamp");
  if (data.timestamp) {
    const age = Math.round((Date.now() - data.timestamp) / 60000);
    const stale = age > 30;
    ts.textContent = stale ? `⚠️ Score from ${age} min ago` : `Updated ${age} min ago`;
    ts.style.color = stale ? "#ff6d00" : "#484f58";
    if (stale) document.getElementById("stale-warning").style.display = "block";
  }
}

// ─── Boot: Load Score & Auth States ───────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  if (!chrome?.storage?.local) {
    document.getElementById("loading-state").style.display = "none";
    document.getElementById("no-data").style.display = "block";
    return;
  }

  // Load product scoring from storage
  chrome.storage.local.get("lastScore", ({ lastScore }) => {
    if (!lastScore || !lastScore.score) {
      document.getElementById("loading-state").style.display = "none";
      document.getElementById("no-data").style.display = "block";
      return;
    }
    renderScore(lastScore);
  });

  // Load settings state indicator on boot & check for API key
  chrome.storage.sync.get("geminiApiKey", ({ geminiApiKey }) => {
    if (geminiApiKey && geminiApiKey !== "YOUR_GEMINI_API_KEY_HERE" && geminiApiKey !== "") {
      updateAIStatusBanner(true);
    } else {
      const defaultPlaceholder = "YOUR_GEMINI_API_KEY_HERE";
      chrome.storage.sync.set({ geminiApiKey: defaultPlaceholder }, () => {
        updateAIStatusBanner(false);
        const input = document.getElementById("api-key-input");
        if (input) input.value = ""; // Keep input blank for easy custom entry
      });
    }
  });

  // Add click listeners for tabs, settings, & auth
  document.getElementById("tab-score")?.addEventListener("click", () => switchTab("score"));
  document.getElementById("tab-profile")?.addEventListener("click", () => switchTab("profile"));
  document.getElementById("tab-settings")?.addEventListener("click", () => switchTab("settings"));

  document.getElementById("key-toggle-btn")?.addEventListener("click", toggleKeyVisibility);
  document.getElementById("btn-save-key")?.addEventListener("click", saveApiKey);
  document.getElementById("btn-clear-key")?.addEventListener("click", clearApiKey);

  document.getElementById("btn-google-login")?.addEventListener("click", loginWithGoogle);
  document.getElementById("btn-sandbox-login")?.addEventListener("click", loginWithSandbox);
  document.getElementById("btn-logout")?.addEventListener("click", logoutUser);

  // Check URL parameters for install onboarding triggers
  const params = new URLSearchParams(window.location.search);
  if (params.get("onboarding") === "true") {
    console.log("Onboarding URL flag detected. Showing onboarding header.");
    document.getElementById("onboarding-banner").style.display = "block";
    // Force switch to profile tab
    switchTab("profile");
  }

  // Pre-load user state and attempt background synchronization
  chrome.storage.local.get("currentUser", ({ currentUser }) => {
    if (currentUser) {
      // Sync stats actively from the backend in the background
      chrome.runtime.sendMessage({ type: "ECO_GET_USER_STATS" }, (res) => {
        if (res?.success && res.user) {
          loadProfilePane(); // Re-render with new server-side stats
        }
      });
    }
  });
});

// ─── Settings Pane ────────────────────────────────────────────
function loadSettingsPane() {
  if (!chrome?.storage?.sync) return;
  chrome.storage.sync.get("geminiApiKey", ({ geminiApiKey }) => {
    const input = document.getElementById("api-key-input");
    if (input && geminiApiKey) {
      input.value = geminiApiKey;
    }
    updateAIStatusBanner(!!geminiApiKey);
  });
}

function updateAIStatusBanner(hasKey) {
  const icon  = document.getElementById("ai-status-icon");
  const title = document.getElementById("ai-status-title");
  const sub   = document.getElementById("ai-status-sub");
  const banner = document.getElementById("ai-status-banner");
  if (!icon || !title || !sub) return;

  if (hasKey) {
    icon.textContent   = "🟢";
    title.textContent  = "AI Search Active";
    sub.textContent    = "Gemini AI will suggest alternatives on every product page";
    if (banner) banner.style.borderColor = "rgba(63,185,80,0.4)";
  } else {
    icon.textContent   = "🔴";
    title.textContent  = "AI Search Not Active";
    sub.textContent    = "Add your free Gemini API key below to enable AI alternatives";
    if (banner) banner.style.borderColor = "rgba(255,109,0,0.3)";
  }
}

function saveApiKey() {
  const key  = document.getElementById("api-key-input")?.value?.trim();
  if (!key) {
    showFeedback("⚠️ Please enter an API key first", "warn");
    return;
  }
  if ((!key.startsWith("AIza") && !key.startsWith("AQ")) || key.length < 30) {
    showFeedback("⚠️ This doesn't look like a valid Gemini API key (should start with AIza or AQ)", "warn");
    return;
  }

  const btn = document.getElementById("btn-save-key");
  btn.textContent = "Saving…";
  btn.disabled = true;

  chrome.runtime.sendMessage({ type: "ECO_SAVE_KEY", key }, (res) => {
    btn.textContent = "Save Key & Enable AI";
    btn.disabled = false;
    if (res?.success) {
      showFeedback("✅ API key saved! AI alternatives will appear on your next product page.", "ok");
      updateAIStatusBanner(true);
    } else {
      showFeedback("❌ Failed to save key. Try again.", "warn");
    }
  });
}

function clearApiKey() {
  chrome.storage.sync.remove("geminiApiKey", () => {
    const input = document.getElementById("api-key-input");
    if (input) input.value = "";
    updateAIStatusBanner(false);
    showFeedback("🗑️ API key removed. Using local fallback alternatives.", "warn");
  });
}

function showFeedback(msg, type) {
  const el = document.getElementById("save-feedback");
  if (!el) return;
  el.textContent = msg;
  el.className   = "save-feedback save-feedback--" + type;
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = "none"; }, 5000);
}

function toggleKeyVisibility() {
  const input = document.getElementById("api-key-input");
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

// ─── 👤 Profile Pane & Gamified Leaderboard Logic ─────────────

function loadProfilePane() {
  chrome.storage.local.get("currentUser", ({ currentUser }) => {
    const loggedOutView = document.getElementById("profile-logged-out");
    const loggedInView  = document.getElementById("profile-logged-in");

    if (!currentUser) {
      loggedOutView.style.display = "flex";
      loggedInView.style.display  = "none";
      return;
    }

    loggedOutView.style.display = "none";
    loggedInView.style.display  = "flex";

    // Populate user profile info
    document.getElementById("profile-name").textContent = currentUser.name || "Eco Explorer";
    document.getElementById("profile-email").textContent = currentUser.email || "";
    
    const avatarImg = document.getElementById("profile-avatar");
    if (avatarImg && currentUser.picture) {
      avatarImg.src = currentUser.picture;
    }

    // Populate statistics
    const scansCount = currentUser.pagesScanned || 0;
    const avgScore   = currentUser.averageEcoScore || 0;
    const carbonSaved = Number(currentUser.carbonSavedKg || 0);

    document.getElementById("stat-scans").textContent = scansCount;
    document.getElementById("stat-avg").textContent   = avgScore ? Math.round(avgScore) : 0;
    document.getElementById("stat-carbon").textContent = carbonSaved.toFixed(1);

    // Calculate Rank and Progress
    calculateRankAndProgress(carbonSaved);
  });
}

/**
 * Calculates user rank based on carbonSaved and displays gamified progress bar
 */
function calculateRankAndProgress(co2Saved) {
  const badge = document.getElementById("badge-rank");
  const fill = document.getElementById("rank-progress-fill");
  const pctText = document.getElementById("rank-progress-pct");
  const hintText = document.getElementById("rank-progress-hint");

  if (!badge || !fill || !pctText || !hintText) return;

  let rank = "Susty Novice";
  let badgeClass = "rank-novice";
  let progressPct = 0;
  let nextRankMessage = "";

  if (co2Saved < 2.0) {
    rank = "Susty Novice";
    badgeClass = "rank-novice";
    progressPct = (co2Saved / 2.0) * 100;
    const missing = (2.0 - co2Saved).toFixed(1);
    nextRankMessage = `Save ${missing} kg more CO₂ to become a Susty Warrior!`;
  } else if (co2Saved < 10.0) {
    rank = "Susty Warrior";
    badgeClass = "rank-warrior";
    progressPct = ((co2Saved - 2.0) / 8.0) * 100;
    const missing = (10.0 - co2Saved).toFixed(1);
    nextRankMessage = `Save ${missing} kg more CO₂ to become a Carbon Crusader!`;
  } else if (co2Saved < 30.0) {
    rank = "Carbon Crusader";
    badgeClass = "rank-hero";
    progressPct = ((co2Saved - 10.0) / 20.0) * 100;
    const missing = (30.0 - co2Saved).toFixed(1);
    nextRankMessage = `Save ${missing} kg more CO₂ to become a Climate Champion!`;
  } else {
    rank = "Climate Champion";
    badgeClass = "rank-champion";
    progressPct = 100;
    nextRankMessage = "🌟 Master environmental status achieved! You're saving the planet!";
  }

  // Cap percentage
  progressPct = Math.max(0, Math.min(100, progressPct));

  // Render
  badge.textContent = rank;
  badge.className = "rank-badge " + badgeClass;
  fill.style.width = progressPct + "%";
  pctText.textContent = Math.round(progressPct) + "%";
  hintText.textContent = nextRankMessage;
}

// ─── Authentication Event Triggers ────────────────────────────

function loginWithGoogle() {
  const btn = document.getElementById("btn-google-login");
  const text = btn.querySelector(".google-btn-text");
  
  text.textContent = "Signing in…";
  btn.disabled = true;

  chrome.runtime.sendMessage({ type: "ECO_GOOGLE_LOGIN" }, (res) => {
    btn.disabled = false;
    text.textContent = "Sign in with Google";

    if (res?.success && res.user) {
      showAuthFeedback("✅ Google Account verified and logged in!", "ok");
      loadProfilePane();
    } else {
      showAuthFeedback("❌ Login Failed: " + (res?.error || "Google console client setup required"), "warn");
    }
  });
}

function loginWithSandbox() {
  const btn = document.getElementById("btn-sandbox-login");
  btn.disabled = true;

  chrome.runtime.sendMessage({ type: "ECO_SANDBOX_LOGIN" }, (res) => {
    btn.disabled = false;
    
    if (res?.success && res.user) {
      showAuthFeedback("✅ Successfully logged into Developer Sandbox!", "ok");
      loadProfilePane();
    } else {
      showAuthFeedback("❌ Sandbox login failed. Is your backend server running?", "warn");
    }
  });
}

function logoutUser() {
  chrome.runtime.sendMessage({ type: "ECO_LOGOUT" }, (res) => {
    if (res?.success) {
      showAuthFeedback("🚪 Logged out successfully.", "warn");
      loadProfilePane();
    }
  });
}

function showAuthFeedback(msg, type) {
  const el = document.getElementById("auth-feedback");
  if (!el) return;
  el.textContent = msg;
  el.className   = "auth-feedback auth-feedback--" + type;
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = "none"; }, 5000);
}
