// ============================================================
// EcoScore Content Script v2 — Universal Shopping Detection
// Works on Amazon, Flipkart, eBay, Etsy, Shopify, Walmart,
// Myntra, Meesho, ASOS, Zara, H&M and ANY e-commerce site.
// ============================================================

(function () {
  "use strict";

  if (document.getElementById("ecoscore-widget-root")) return;

  let currentProductCO2 = null; // Stored carbon footprint of the active product page

  // ─── 1. Universal Product Detection ──────────────────────

  // Priority 1: Schema.org JSON-LD — most reliable signal across all sites
  function getSchemaProduct() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        let data = JSON.parse(s.textContent.trim());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          // Direct Product
          if (item["@type"] === "Product" && item.name) {
            return { title: item.name.trim(), source: "schema-ld+json" };
          }
          // Nested in @graph (common on Shopify, WooCommerce)
          if (item["@graph"]) {
            const prod = item["@graph"].find((g) => g["@type"] === "Product");
            if (prod?.name) return { title: prod.name.trim(), source: "schema-graph" };
          }
          // BreadcrumbList — skip
        }
      } catch (_) {}
    }
    return null;
  }

  // Priority 2: Open Graph product tags
  function getOGProduct() {
    const ogType = (
      document.querySelector('meta[property="og:type"]')?.content || ""
    ).toLowerCase();
    if (ogType.includes("product")) {
      const t =
        document.querySelector('meta[property="og:title"]')?.content ||
        document.querySelector('meta[name="twitter:title"]')?.content;
      if (t?.trim()) return { title: t.trim(), source: "opengraph" };
    }
    return null;
  }

  // Priority 3: HTML Microdata (itemprop)
  function getMicrodataProduct() {
    const el = document.querySelector(
      '[itemtype*="schema.org/Product"] [itemprop="name"], [itemtype*="schema.org/Product"][itemprop="name"]'
    );
    if (el) {
      const t = (el.textContent || el.content || "").trim();
      if (t.length > 3) return { title: t, source: "microdata" };
    }
    return null;
  }

  // Priority 4: Site-specific CSS selectors (top 30 shopping sites globally)
  const SITE_MAP = {
    // India
    amazon:    ["#productTitle", "#title span.a-size-large", ".product-title-word-break"],
    flipkart:  ["span.VU-ZEz", "h1.yhB1nd", "span.B_NuCI", "h1._6EBuvT"],
    myntra:    [".pdp-name", "h1.title-name", ".pdp-product-description-content h1"],
    meesho:    ["h1[class*='ProductTitle']", "[data-testid='product-title']", "h1.sc-dcJsrY"],
    ajio:      [".prod-name", "h1.prod-name", ".prod-sp-nm"],
    nykaa:     [".product-title h1", "h1.css-title", "span.css-lkx8d5"],
    snapdeal:  [".pdp-e-i-head", "#product-title"],
    tatacliq:  [".prd-nm-heading", "h1[class*='prodName']"],
    // Global
    ebay:      ["h1.x-item-title__mainTitle span", "#iti-title h1", "#itemTitle"],
    walmart:   ["h1[itemprop='name']", ".prod-ProductTitle h1", "[data-automation-id='product-title']"],
    target:    ["h1[data-test='product-title']", ".Heading__StyledHeading"],
    etsy:      ["h1[data-buy-box-listing-title]", ".wt-text-body-03 h1", "h1.title-value"],
    asos:      ["h1.product-hero__title", "[class*='product-title']"],
    zara:      ["h1.product-detail-info__header-name", ".product-name"],
    hm:        ["h1.product-detail-main-header-title", "[class*='ProductName']"],
    shopify:   [".product__title h1", ".product-single__title", "#product-title", ".ProductMeta__Title"],
    woocommerce: [".product_title.entry-title", "h1.product_title"],
    aliexpress:["h1.product-title-text", ".product-title span"],
    shein:     ["h1.title-en", "[class*='product-title']"],
    // More
    croma:     ["h1.pdp-name", ".PDP_pdp-name__1yvl5"],
    reliance:  ["h1.ProductDetailedView_prod-nm__", ".proddet-name"],
    pepperfry: ["h1.prod_name", "[class*='product_name']"],
    firstcry:  ["h1.product-title", ".prd-dtl-head h1"],
    limeroad:  ["h1[class*='product']", ".product-title"],
    fabindia:  ["h1.product-title", ".product-name h1"],
  };

  function getSiteSpecificTitle() {
    const host = location.hostname.toLowerCase().replace(/^www\./, "");

    for (const [site, sels] of Object.entries(SITE_MAP)) {
      if (host.includes(site)) {
        for (const sel of sels) {
          try {
            const el = document.querySelector(sel);
            if (el) {
              const t = (el.innerText || el.textContent || "").trim();
              if (t.length > 4) return { title: t, source: `site:${site}` };
            }
          } catch (_) {}
        }
      }
    }

    // Generic selectors — work on most Shopify/WooCommerce/custom sites
    const genericSels = [
      "h1[class*='product-title']", "h1[class*='ProductTitle']",
      "h1[class*='product_title']", "h1[id*='product-title']",
      "h1[class*='item-title']",    "h1[class*='listing-title']",
      "[data-testid*='product-title']", "[data-testid*='product-name']",
      "[data-qa*='product-title']", "[data-qa*='product-name']",
      "[itemprop='name']", "h1.title", "h1.name",
    ];
    for (const sel of genericSels) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const t = (el.innerText || el.textContent || "").trim();
          if (t.length > 4) return { title: t, source: "generic-css" };
        }
      } catch (_) {}
    }
    return null;
  }

  // Priority 5: H1 + price heuristic (last resort)
  function getHeuristicTitle() {
    const h1 = document.querySelector("h1");
    if (!h1) return null;
    const t = (h1.innerText || h1.textContent || "").trim();
    if (t.length < 5 || t.length > 300) return null;

    // Check if page looks like a product page
    const priceRx = /[₹$€£¥][\d,.]|\d[\d,.]+\s*(rs|inr|usd|eur|gbp)/i;
    const cartRx  = /add\s*to\s*(cart|bag|wishlist)|buy\s*now|order\s*now|shop\s*now/i;
    const body5k  = (document.body.innerText || "").substring(0, 6000);

    if (priceRx.test(body5k) && (cartRx.test(body5k) || priceRx.test(body5k))) {
      return { title: t, source: "heuristic-h1" };
    }
    return null;
  }

  // Master title getter
  function getProductInfo() {
    const result =
      getSchemaProduct() ||
      getOGProduct()     ||
      getMicrodataProduct() ||
      getSiteSpecificTitle() ||
      getHeuristicTitle();

    if (!result) return null;

    const lower = result.title.toLowerCase();
    return {
      ...result,
      materials: extractMaterials(lower),
      category:  detectCategory(lower),
    };
  }

  // ─── 2. Shopping Page Guard ────────────────────────────────

  function isShoppingPage() {
    // Structured data wins
    if (getSchemaProduct() || getOGProduct() || getMicrodataProduct()) return true;

    // Add-to-cart / buy button (strong signal)
    const cartSels = [
      'button[id*="add-to-cart"]', 'button[id*="addToCart"]',
      'button[id*="add_to_cart"]', 'button[class*="add-to-cart"]',
      'button[class*="AddToCart"]', 'button[name="add"]',
      'input[name="add-to-cart"]', '[data-action="add-to-cart"]',
      'form[action*="/cart/add"]', 'form[action*="cart"]',
      '#product-addtocart-button', '.ProductForm__AddToCart',
      '[data-testid*="add-to-cart"]', '[data-qa*="add-to-cart"]',
    ];
    if (cartSels.some((s) => { try { return !!document.querySelector(s); } catch(_) { return false; } })) return true;

    // URL patterns
    const url = location.href.toLowerCase();
    const patterns = [
      "/product/", "/products/", "/item/", "/items/",
      "/p/", "/dp/", "/gp/product/", "/buy/",
      "product_id=", "item_id=", "sku=", "pid=",
      "/listing/", "/detail/", "/pd/", "/shop/product",
      "/catalogue/", "/catalog/",
    ];
    return patterns.some((p) => url.includes(p));
  }

  // ─── 3. Score Calculation ──────────────────────────────────

  function calculateScore(lower) {
    let score = 52; // neutral baseline
    let matchedKey = null;
    let matchedLabel = "No specific eco material detected";
    let co2 = 4.5;

    for (const [key, data] of Object.entries(ecoKeywords)) {
      if (lower.includes(key)) {
        score = data.score;
        matchedKey = key;
        matchedLabel = data.label;
        co2 = data.co2Factor;
        break; // first match wins (sorted by importance in db)
      }
    }

    for (const [mod, delta] of Object.entries(categoryModifiers)) {
      if (lower.includes(mod)) {
        score = Math.min(100, Math.max(0, score + delta));
      }
    }

    const co2Num = typeof co2 === "number" ? co2 : 4.5;
    return {
      score: Math.round(score),
      keyword: matchedKey,
      reason: matchedLabel,
      co2: co2Num.toFixed(1),
      co2Label: getCO2Label(co2Num),
    };
  }

  function getCO2Label(co2) {
    if (co2 < 1.5) return co2Messages.low;
    if (co2 < 4.0) return co2Messages.medium;
    if (co2 < 7.0) return co2Messages.high;
    return co2Messages.veryHigh;
  }

  // ─── 4. Widget HTML Builder ────────────────────────────────

  function buildWidget(productInfo, scoreData) {
    const { title, source, materials, category } = productInfo;
    const { score, reason, co2, co2Label, keyword } = scoreData;
    currentProductCO2 = parseFloat(co2) || null; // Set baseline carbon footprint
    const grade = getGrade(score);
    const cfg   = getGradeConfig(score);
    const platform = getPlatformName();

    const CIRC = 2 * Math.PI * 31;
    const shortTitle = title.length > 52 ? title.substring(0, 52) + "…" : title;

    return `
      <div id="ecoscore-widget-root" class="eco-widget" role="complementary" aria-label="EcoScore sustainability rating">

        <!-- Toggle pill -->
        <button id="eco-toggle-btn" class="eco-toggle-btn" aria-expanded="false" aria-controls="eco-panel" title="Click to open · Drag to move">
          <span class="eco-toggle-leaf" aria-hidden="true">🌱</span>
          <span class="eco-toggle-grade" style="color:${cfg.color}">${grade}</span>
          <span class="eco-toggle-label">EcoScore</span>
        </button>

        <!-- Panel -->
        <div id="eco-panel" class="eco-panel" role="region" aria-label="EcoScore details">

          <div class="eco-header" id="eco-drag-header">
            <div class="eco-header-left">
              <div class="eco-logo">🌿 EcoScore</div>
              <div class="eco-platform" id="eco-platform-label">${platform}</div>
            </div>
            <button id="eco-close-btn" class="eco-close-btn" aria-label="Close" title="Close">✕</button>
          </div>

          <!-- Score ring -->
          <div class="eco-score-section">
            <div class="eco-ring-wrapper" aria-hidden="true">
              <svg class="eco-ring" viewBox="0 0 80 80" role="presentation">
                <circle cx="40" cy="40" r="31" class="eco-ring-bg"/>
                <circle cx="40" cy="40" r="31" class="eco-ring-fill" id="eco-ring-fill"
                  style="stroke:${cfg.color};stroke-dasharray:${CIRC};stroke-dashoffset:${CIRC}"
                  transform="rotate(-90 40 40)"/>
              </svg>
              <div class="eco-ring-inner">
                <div class="eco-score-num" id="eco-score-num">0</div>
                <div class="eco-score-max">/100</div>
              </div>
            </div>
            <div class="eco-grade-info">
              <div class="eco-grade-badge" style="background:${cfg.color}1a;border-color:${cfg.color};color:${cfg.color};">
                <span>${cfg.emoji}</span> Grade ${grade}
              </div>
              <div class="eco-grade-label" style="color:${cfg.color}">${cfg.label}</div>
              <div class="eco-product-name" title="${title}">${shortTitle}</div>
            </div>
          </div>

          <!-- Score bar -->
          <div class="eco-bar-wrap" aria-hidden="true">
            <div class="eco-bar-track">
              <div class="eco-bar-fill" id="eco-bar-fill" style="background:${cfg.color}"></div>
            </div>
            <div class="eco-bar-labels">
              <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
            </div>
          </div>

          <!-- Why this score -->
          <div class="eco-section">
            <div class="eco-section-title">📋 Why this score?</div>
            <div class="eco-reason-card">
              ${keyword ? `<span class="eco-keyword-tag">${keyword.toUpperCase()}</span>` : ""}
              <span class="eco-reason-text">${reason}</span>
            </div>
            ${category ? `<div class="eco-category-chip">📦 ${category}</div>` : ""}
          </div>

          <!-- CO2 -->
          <div class="eco-section">
            <div class="eco-section-title">🌍 Carbon Footprint</div>
            <div class="eco-co2-card">
              <div class="eco-co2-main" style="display:flex !important;align-items:center !important;justify-content:space-between !important;width:100% !important;margin-bottom:4px !important;">
                <div class="eco-co2-num">${co2} <span class="eco-co2-unit">kg CO₂</span></div>
                <div class="eco-co2-pct-badge" id="eco-co2-pct-badge" style="display:none;font-size:10px !important;font-weight:700 !important;padding:2px 8px !important;border-radius:4px !important;align-items:center !important;gap:3px !important;"></div>
              </div>
              <div class="eco-co2-label">${co2Label}</div>
            </div>
            <button class="eco-co2-learn-btn" id="eco-co2-learn-btn" aria-expanded="false">
              <span class="eco-co2-learn-arrow">▶</span>
              <span>What is carbon footprint &amp; why it matters?</span>
            </button>
            <div class="eco-co2-explainer" id="eco-co2-explainer" role="note">
              A <strong>carbon footprint</strong> is the total CO₂ released during a product's lifecycle — from extracting raw materials and manufacturing to shipping and disposal. These gases trap heat, causing <strong>global warming, rising sea levels, extreme weather</strong>, and ecosystem collapse. A single plastic bottle generates ~6 kg CO₂. <strong>Choosing eco materials can reduce this by up to 10×</strong> per purchase.
            </div>
          </div>

          <!-- Alternatives — loaded async via AI or local fallback -->
          <div class="eco-section" id="eco-alts-section">
            <div class="eco-section-title">🔍 Eco-Friendly Alternatives</div>
            <div id="eco-alts-container">
              <div class="eco-alts-loading" id="eco-alts-loading">
                <div class="eco-loading-dot"></div>
                <div class="eco-loading-dot"></div>
                <div class="eco-loading-dot"></div>
                <span>Searching web for greener alternatives…</span>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="eco-footer">
            <span>EcoScore AI</span>
            <span class="eco-footer-dot">•</span>
            <span id="eco-footer-source">v2.0</span>
          </div>

        </div>
      </div>`;
  }

  function getPlatformName() {
    const host = location.hostname.toLowerCase().replace(/^www\./, "");
    const map = {
      amazon: "🛒 Amazon", flipkart: "🛍️ Flipkart", ebay: "🏷️ eBay",
      etsy: "🎨 Etsy", walmart: "🏪 Walmart", target: "🎯 Target",
      myntra: "👗 Myntra", meesho: "📦 Meesho", ajio: "👔 Ajio",
      nykaa: "💄 Nykaa", snapdeal: "🔖 Snapdeal", asos: "🛒 ASOS",
      shopify: "🏪 Online Store", "shopify.com": "🏪 Shopify",
    };
    for (const [key, val] of Object.entries(map)) {
      if (host.includes(key)) return val;
    }
    return `🌐 ${host.split(".").slice(-2, -1)[0] || "Online Store"}`;
  }

  // ─── 5. Animations ────────────────────────────────────────

  function animateRing(score) {
    const CIRC = 2 * Math.PI * 31;
    const fill = document.getElementById("eco-ring-fill");
    if (!fill) return;
    const target = CIRC - (score / 100) * CIRC;
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.strokeDashoffset = target; }));
  }

  function animateBar(score) {
    const bar = document.getElementById("eco-bar-fill");
    if (!bar) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = score + "%"; }));
  }

  function animateCount(score) {
    const el = document.getElementById("eco-score-num");
    if (!el) return;
    const duration = 1100;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      el.textContent = Math.round((1 - Math.pow(1 - t, 3)) * score);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ─── Dynamic Widget AI Updates ──────────────────────────────
  // Overwrites fast offline estimates with exact, real-time AI carbon metrics
  function updateWidgetWithAI(analysis) {
    const { score, co2, reason, pctDiff, status } = analysis;
    if (co2) {
      currentProductCO2 = parseFloat(co2); // Update to exact audited carbon footprint
    }
    const grade = getGrade(score);
    const cfg = getGradeConfig(score);

    // 1. Update toggle pill grade badge
    const toggleGrade = document.querySelector(".eco-toggle-grade");
    if (toggleGrade) {
      toggleGrade.textContent = grade;
      toggleGrade.style.color = cfg.color;
    }

    // 2. Update panel grade badges and text
    const gradeBadge = document.querySelector(".eco-grade-badge");
    if (gradeBadge) {
      gradeBadge.style.background = cfg.color + "1a";
      gradeBadge.style.borderColor = cfg.color;
      gradeBadge.style.color = cfg.color;
      gradeBadge.innerHTML = `<span>${cfg.emoji}</span> Grade ${grade}`;
    }

    const gradeLabel = document.querySelector(".eco-grade-label");
    if (gradeLabel) {
      gradeLabel.textContent = cfg.label;
      gradeLabel.style.color = cfg.color;
    }

    // 3. Update reason card text
    const reasonText = document.querySelector(".eco-reason-text");
    if (reasonText) {
      reasonText.textContent = reason;
      // Fade-in animation to make it look smooth and professional
      reasonText.style.animation = "none";
      requestAnimationFrame(() => {
        reasonText.style.animation = "paneFadeIn 0.38s ease-out";
      });
    }

    // 4. Update CO2 value and percentage badge
    const co2Num = document.querySelector(".eco-co2-num");
    if (co2Num) {
      co2Num.innerHTML = `${co2} <span class="eco-co2-unit">kg CO₂</span>`;
    }

    const pctBadge = document.getElementById("eco-co2-pct-badge");
    if (pctBadge && pctDiff !== undefined && pctDiff > 0) {
      const pctValue = Math.round(pctDiff);
      pctBadge.style.display = "inline-flex";
      if (status === "better") {
        pctBadge.style.background = "rgba(63,185,80,0.15)";
        pctBadge.style.border = "1px solid rgba(63,185,80,0.3)";
        pctBadge.style.color = "#3fb950";
        pctBadge.textContent = `📉 ${pctValue}% Saved`;
      } else {
        pctBadge.style.background = "rgba(248,81,73,0.15)";
        pctBadge.style.border = "1px solid rgba(248,81,73,0.3)";
        pctBadge.style.color = "#f85149";
        pctBadge.textContent = `📈 ${pctValue}% Higher`;
      }
    } else if (pctBadge) {
      pctBadge.style.display = "none";
    }

    const co2LabelEl = document.querySelector(".eco-co2-label");
    if (co2LabelEl) {
      const co2Val = Number(co2) || 4.5;
      let label = co2Messages.medium;
      if (co2Val < 1.5) label = co2Messages.low;
      else if (co2Val < 4.0) label = co2Messages.medium;
      else if (co2Val < 7.0) label = co2Messages.high;
      else label = co2Messages.veryHigh;
      co2LabelEl.textContent = label;
    }

    // 5. Re-run score fill animations
    animateRing(score);
    animateBar(score);
    animateCount(score);
    
    // 6. Update local storage so popup and backend statistics sync
    try {
      chrome.storage.local.get("lastScore", ({ lastScore }) => {
        if (lastScore) {
          const newScoreObj = {
            ...lastScore,
            score: score,
            grade: grade,
            co2: co2,
            reason: reason,
            timestamp: Date.now()
          };
          chrome.storage.local.set({ lastScore: newScoreObj });
          
          // Re-record statistics dynamically on the secure backend
          if (chrome.runtime && chrome.runtime.sendMessage) {
            const carbonSaved = score > 50 ? parseFloat(((score - 50) / 10).toFixed(2)) : 0.0;
            chrome.runtime.sendMessage({
              type: "ECO_RECORD_SCAN",
              score: score,
              carbonSaved: carbonSaved
            }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
        }
      });
    } catch (_) {}
  }

  // ─── 6. Alternatives Rendering ────────────────────────────

  function renderAlternatives(alternatives, usedAI) {
    const container = document.getElementById("eco-alts-container");
    if (!container) return;

    const footer = document.getElementById("eco-footer-source");
    if (footer) footer.textContent = usedAI ? "✨ AI-Powered" : "v2.0 (local db)";

    if (!alternatives || alternatives.length === 0) {
      container.innerHTML = `<div class="eco-no-alts">No alternatives found for this product.</div>`;
      return;
    }

    container.innerHTML = alternatives
      .map(
        (a) => {
          const altCO2 = parseFloat(a.co2Kg || "1000");
          let savingsHTML = "";
          if (currentProductCO2 && altCO2 && altCO2 < currentProductCO2) {
            const savedVal = (currentProductCO2 - altCO2).toFixed(1);
            const savedPct = Math.round(((currentProductCO2 - altCO2) / currentProductCO2) * 100);
            savingsHTML = `<span class="eco-alt-savings" style="font-size:9px !important;color:#3fb950 !important;font-weight:700 !important;display:inline-flex !important;align-items:center !important;gap:3px !important;margin-top:3px !important;background:rgba(63,185,80,0.1) !important;border:1px solid rgba(63,185,80,0.2) !important;border-radius:4px !important;padding:1px 6px !important;width:fit-content !important;">📉 Save ${savedVal} kg (${savedPct}% less CO₂)</span>`;
          }
          return `
          <div class="eco-alt-item" ${a.searchQuery ? `onclick="window.open('https://www.google.com/search?q=${encodeURIComponent(a.searchQuery + " eco friendly buy online")}','_blank')" style="cursor:pointer;"` : ""}>
            <span class="eco-alt-icon">${a.icon || "🌿"}</span>
            <div class="eco-alt-info" style="display:flex !important;flex-direction:column !important;gap:2px !important;">
              <span class="eco-alt-name">${a.name}</span>
              ${a.reason ? `<span class="eco-alt-reason" style="font-size:9.5px !important;color:#8b949e !important;line-height:1.4 !important;">${a.reason}</span>` : ""}
              ${savingsHTML}
              ${a.where ? `<span class="eco-alt-where" style="font-size:9px !important;color:#3fb950 !important;font-weight:500 !important;margin-top:2px !important;">📍 ${a.where}</span>` : ""}
            </div>
            <span class="eco-alt-badge" style="background:${getGradeConfig(a.score || 80).color}20;color:${getGradeConfig(a.score || 80).color};">${a.score || "?"}</span>
          </div>`;
        }
      )
      .join("");

    if (usedAI) {
      container.insertAdjacentHTML(
        "beforeend",
        `<div class="eco-ai-badge">✨ Alternatives found via Gemini AI · Click any to search</div>`
      );
    } else {
      container.insertAdjacentHTML(
        "beforeend",
        `<div class="eco-ai-badge eco-ai-badge--fallback">💡 Add Gemini API key in EcoScore popup for AI-powered search</div>`
      );
    }
  }

  function showAltsError(msg) {
    const container = document.getElementById("eco-alts-container");
    if (container) {
      container.innerHTML = `<div class="eco-no-alts">⚠️ ${msg}</div>`;
    }
  }

  // ─── 7. Drag-to-Move ──────────────────────────────────────

  function makeDraggable(root, toggleBtn, onToggle) {
    const DRAG_THRESHOLD = 6;
    const EDGE_MARGIN    = 10;
    let pointerDown = false, didDrag = false;
    let startX, startY, origLeft, origTop;

    (function restorePos() {
      try {
        const saved = sessionStorage.getItem("ecoscore-pos");
        if (!saved) return;
        const { left, top } = JSON.parse(saved);
        applyPos(left, top);
      } catch (_) {}
    })();

    function applyPos(left, top) {
      const pillW = toggleBtn.offsetWidth  || 120;
      const pillH = toggleBtn.offsetHeight || 40;
      left = Math.max(EDGE_MARGIN, Math.min(window.innerWidth  - pillW - EDGE_MARGIN, left));
      top  = Math.max(EDGE_MARGIN, Math.min(window.innerHeight - pillH - EDGE_MARGIN, top));
      root.style.setProperty("left",  left + "px",  "important");
      root.style.setProperty("top",   top  + "px",  "important");
      root.style.setProperty("right", "auto",        "important");
    }

    function savePos(left, top) {
      try { sessionStorage.setItem("ecoscore-pos", JSON.stringify({ left, top })); } catch (_) {}
    }

    toggleBtn.addEventListener("pointerdown", (e) => {
      // Only drag on left click or touch touch
      if (e.pointerType === "mouse" && e.button !== 0) return;
      
      pointerDown = true;
      didDrag = false;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = toggleBtn.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      
      // Capture the pointer! Routes all subsequent moves directly to toggleBtn
      // preventing overlay elements or site image zooms from freezing it.
      toggleBtn.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    toggleBtn.addEventListener("pointermove", (e) => {
      if (!pointerDown) return;
      
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!didDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      
      if (!didDrag) {
        didDrag = true;
        toggleBtn.classList.add("eco-dragging");
        root.classList.add("eco-is-dragging");
        toggleBtn.style.setProperty("transition", "none", "important");
      }
      
      applyPos(origLeft + dx, origTop + dy);
    });

    function onPointerUp(e) {
      if (!pointerDown) return;
      pointerDown = false;
      
      try { toggleBtn.releasePointerCapture(e.pointerId); } catch (_) {}
      
      if (didDrag) {
        const rect = toggleBtn.getBoundingClientRect();
        savePos(rect.left, rect.top);
        
        toggleBtn.classList.remove("eco-dragging");
        root.classList.remove("eco-is-dragging");
        toggleBtn.style.removeProperty("transition");
        root.classList.add("eco-snap");
        setTimeout(() => root.classList.remove("eco-snap"), 400);
      } else {
        onToggle();
      }
      didDrag = false;
    }

    toggleBtn.addEventListener("pointerup", onPointerUp);
    toggleBtn.addEventListener("pointercancel", onPointerUp);
  }

  // ─── 8. CO2 Explainer Toggle ──────────────────────────────

  function setupCO2Toggle() {
    const btn = document.getElementById("eco-co2-learn-btn");
    const box = document.getElementById("eco-co2-explainer");
    if (!btn || !box) return;
    btn.addEventListener("click", () => {
      const open = box.classList.toggle("eco-visible");
      btn.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open);
    });
  }

  // ─── 9. Widget Injection & Lifecycle ─────────────────────

  function injectWidget(productInfo, scoreData) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildWidget(productInfo, scoreData);
    const root = wrapper.firstElementChild;
    document.body.appendChild(root);

    const toggleBtn = document.getElementById("eco-toggle-btn");
    const closeBtn  = document.getElementById("eco-close-btn");

    function openPanel() {
      root.classList.add("eco-widget--open");
      toggleBtn.setAttribute("aria-expanded", "true");
      animateRing(scoreData.score);
      animateBar(scoreData.score);
      animateCount(scoreData.score);
    }

    function closePanel() {
      root.classList.remove("eco-widget--open");
      toggleBtn.setAttribute("aria-expanded", "false");
    }

    toggleBtn.addEventListener("click", (e) => {
      if (e.detail === 0) { // keyboard Enter/Space
        const isOpen = root.classList.contains("eco-widget--open");
        isOpen ? closePanel() : openPanel();
      }
    });

    closeBtn.addEventListener("click", closePanel);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && root.classList.contains("eco-widget--open")) closePanel();
    });

    makeDraggable(root, toggleBtn, () => {
      const isOpen = root.classList.contains("eco-widget--open");
      isOpen ? closePanel() : openPanel();
    });

    setupCO2Toggle();

    // Auto-open
    setTimeout(openPanel, 900);

    // Async: fetch AI alternatives
    fetchAIAlternatives(productInfo);
  }

  // ─── 10. AI Alternatives via Background Worker ─────────────

  function fetchAIAlternatives(productInfo) {
    // Use local fallback immediately while AI loads
    const localAlts = alternatives[productInfo.materials?.[0]] || null;

    if (typeof chrome === "undefined" || !chrome.runtime) {
      // Dev/preview mode — show local fallback
      const fallback = localAlts || getGenericFallback();
      setTimeout(() => renderAlternatives(fallback, false), 800);
      return;
    }

    // Send message to background service worker
    chrome.runtime.sendMessage(
      {
        type: "ECO_GET_ALTERNATIVES",
        productTitle:     productInfo.title,
        detectedMaterials: productInfo.materials,
        category:         productInfo.category,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[EcoScore] Background error:", chrome.runtime.lastError.message);
          renderAlternatives(localAlts || getGenericFallback(), false);
          return;
        }

        if (response?.success && response.alternatives?.length) {
          renderAlternatives(response.alternatives, response.usedAI);
          if (response.usedAI && response.analysis) {
            updateWidgetWithAI(response.analysis);
          }
        } else {
          if (response?.error === "no_key") {
            renderAlternatives(response.alternatives || getGenericFallback(), false);
          } else {
            renderAlternatives(localAlts || getGenericFallback(), false);
          }
        }
      }
    );
  }

  function getGenericFallback() {
    return [
      { name: "Certified Organic Option", icon: "🌱", reason: "Organic certified, lower chemical impact", score: 84, searchQuery: "organic certified eco friendly product", where: "Amazon, Etsy" },
      { name: "Secondhand / Refurbished", icon: "♻️", reason: "Zero new resource extraction needed", score: 96, searchQuery: "secondhand refurbished buy online", where: "eBay, Etsy, Facebook Marketplace" },
      { name: "B-Corp Certified Brand", icon: "🏅", reason: "Verified sustainability standards globally", score: 88, searchQuery: "B-corp certified sustainable brand", where: "Brand websites, Amazon" },
    ];
  }

  // ─── 11. Storage Save ────────────────────────────────────

  function saveToStorage(productInfo, scoreData) {
    if (typeof chrome === "undefined" || !chrome.storage) return;
    chrome.storage.local.set({
      lastScore: {
        title:    productInfo.title,
        score:    scoreData.score,
        grade:    getGrade(scoreData.score),
        reason:   scoreData.reason,
        co2:      scoreData.co2,
        source:   productInfo.source,
        category: productInfo.category,
        url:      window.location.href,
        timestamp: Date.now(),
      },
    }, () => {
      // Trigger scan statistics reporting to the secure backend
      if (chrome.runtime && chrome.runtime.sendMessage) {
        const carbonSaved = scoreData.score > 50 ? parseFloat(((scoreData.score - 50) / 10).toFixed(2)) : 0.0;
        chrome.runtime.sendMessage({
          type: "ECO_RECORD_SCAN",
          score: scoreData.score,
          carbonSaved: carbonSaved
        }, () => {
          if (chrome.runtime.lastError) {
            // Ignore error if background is sleeping
          }
        });
      }
    });
  }

  // ─── 12. Retry Init (for SPAs) ───────────────────────────

  let initAttempts = 0;
  const MAX_ATTEMPTS = 10;

  function tryInit() {
    if (document.getElementById("ecoscore-widget-root")) return;
    if (!isShoppingPage() && initAttempts === 0) return; // Skip non-shopping pages on first try

    const productInfo = getProductInfo();
    if (!productInfo) {
      initAttempts++;
      if (initAttempts < MAX_ATTEMPTS) setTimeout(tryInit, 1400);
      return;
    }

    initAttempts = 0;
    const scoreData = calculateScore(productInfo.title.toLowerCase());
    injectWidget(productInfo, scoreData);
    saveToStorage(productInfo, scoreData);
  }

  // ─── 13. SPA Navigation Observer (throttled) ────────────

  let lastUrl = location.href;
  let navDebounce = null;

  const navObserver = new MutationObserver(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    clearTimeout(navDebounce);
    navDebounce = setTimeout(() => {
      const old = document.getElementById("ecoscore-widget-root");
      if (old) old.remove();
      initAttempts = 0;
      tryInit();
    }, 1600);
  });

  // ─── 14. Boot ────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      tryInit();
      navObserver.observe(document.body, { childList: true, subtree: false });
    });
  } else {
    tryInit();
    navObserver.observe(document.body, { childList: true, subtree: false });
  }

})();
