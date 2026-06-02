// ============================================================
// EcoScore Robust Local Database Helper (Atomic Writes)
// ============================================================

const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "users.db.json");
const BACKUP_FILE = path.join(__dirname, "users.db.json.bak");

// Initialize empty DB structure
const initialSchema = {
  users: {},
  systemStats: {
    totalScans: 0,
    totalCarbonSavedKg: 0,
  }
};

/**
 * Robust DB manager that handles reading/writing atomically
 */
class EcoDatabase {
  constructor() {
    this.memoryDb = null;
    this.init();
  }

  /**
   * Initializes the DB file if it doesn't exist
   */
  init() {
    try {
      if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify(initialSchema, null, 2), "utf8");
        this.memoryDb = JSON.parse(JSON.stringify(initialSchema));
        console.log("💾 EcoDatabase: Created new database file at", DB_FILE);
      } else {
        this.load();
      }
    } catch (err) {
      console.error("❌ EcoDatabase init error:", err);
      this.memoryDb = JSON.parse(JSON.stringify(initialSchema));
    }
  }

  /**
   * Load data from database file with fallback to backup
   */
  load() {
    try {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      this.memoryDb = JSON.parse(raw);
    } catch (err) {
      console.warn("⚠️ EcoDatabase: Primary file load failed, attempting backup...", err.message);
      try {
        if (fs.existsSync(BACKUP_FILE)) {
          const rawBak = fs.readFileSync(BACKUP_FILE, "utf8");
          this.memoryDb = JSON.parse(rawBak);
          // Restore primary from backup
          fs.writeFileSync(DB_FILE, rawBak, "utf8");
          console.log("♻️ EcoDatabase: Recovered from backup successfully");
        } else {
          throw new Error("No backup file available");
        }
      } catch (backupErr) {
        console.error("❌ EcoDatabase recovery failed. Initializing empty database.", backupErr.message);
        this.memoryDb = JSON.parse(JSON.stringify(initialSchema));
        this.save();
      }
    }
  }

  /**
   * Atomic Save: Write to a temp file, then rename to primary.
   * This prevents corruption if writing is interrupted.
   */
  save() {
    if (!this.memoryDb) return;
    const tempFile = DB_FILE + ".tmp";
    try {
      // 1. Create a backup of the current database if it exists
      if (fs.existsSync(DB_FILE)) {
        fs.copyFileSync(DB_FILE, BACKUP_FILE);
      }
      
      // 2. Write new contents to temporary file
      const raw = JSON.stringify(this.memoryDb, null, 2);
      fs.writeFileSync(tempFile, raw, "utf8");
      
      // 3. Rename temp file to primary (atomic operation)
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      console.error("❌ EcoDatabase: Atomic save failed:", err);
      // Clean up temp file if it exists
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (e) {}
      }
    }
  }

  /**
   * Find a user by Google ID
   */
  getUser(googleId) {
    this.load(); // Refresh memory state in case of manual edits or concurrent writes
    return this.memoryDb.users[googleId] || null;
  }

  /**
   * Upsert user profile info on Google login
   */
  upsertUser(profile) {
    const { googleId, email, name, picture } = profile;
    if (!googleId) throw new Error("googleId is required for user upsert");

    this.load();

    const existing = this.memoryDb.users[googleId];
    const now = new Date().toISOString();

    if (existing) {
      // Update details while preserving statistics
      this.memoryDb.users[googleId] = {
        ...existing,
        email: email || existing.email,
        name: name || existing.name,
        picture: picture || existing.picture,
        lastSeen: now,
      };
      console.log(`👤 EcoDatabase: Updated existing user profile: ${email}`);
    } else {
      // Create new user profile with base stats
      this.memoryDb.users[googleId] = {
        googleId,
        email,
        name,
        picture: picture || "https://lh3.googleusercontent.com/a/default-user=s96-c",
        installDate: now,
        lastSeen: now,
        pagesScanned: 0,
        averageEcoScore: 0,
        carbonSavedKg: 0.0,
      };
      console.log(`🆕 EcoDatabase: Registered new user: ${email}`);
    }

    this.save();
    return this.memoryDb.users[googleId];
  }

  /**
   * Record a scan event and update carbon metrics
   * @param {string} googleId
   * @param {number} score - Sustainability score (0-100)
   * @param {number} carbonSaved - Carbon saved in kg (positive float)
   */
  recordScan(googleId, score, carbonSaved = 0) {
    this.load();

    const user = this.memoryDb.users[googleId];
    if (!user) {
      console.warn(`⚠️ EcoDatabase: Cannot record scan, user ${googleId} not found.`);
      return null;
    }

    // Parse inputs safely
    const scanScore = Math.max(0, Math.min(100, Number(score) || 0));
    const savedCO2 = Math.max(0, Number(carbonSaved) || 0);

    // Calculate rolling average for EcoScore
    const prevScans = user.pagesScanned || 0;
    const nextScans = prevScans + 1;
    const prevAvg = user.averageEcoScore || 0;
    
    user.averageEcoScore = parseFloat(((prevAvg * prevScans + scanScore) / nextScans).toFixed(1));
    user.pagesScanned = nextScans;
    user.carbonSavedKg = parseFloat((Number(user.carbonSavedKg || 0) + savedCO2).toFixed(2));
    user.lastSeen = new Date().toISOString();

    // Update global aggregates
    this.memoryDb.systemStats.totalScans += 1;
    this.memoryDb.systemStats.totalCarbonSavedKg = parseFloat(
      (this.memoryDb.systemStats.totalCarbonSavedKg + savedCO2).toFixed(2)
    );

    this.save();
    console.log(`📈 EcoDatabase: Stats updated for user ${user.email}. Scans: ${user.pagesScanned}, AvgScore: ${user.averageEcoScore}, CarbonSaved: ${user.carbonSavedKg} kg.`);
    return user;
  }

  /**
   * Get leaderboard of top eco-savers
   */
  getLeaderboard(limit = 10) {
    this.load();
    return Object.values(this.memoryDb.users)
      .sort((a, b) => b.carbonSavedKg - a.carbonSavedKg)
      .slice(0, limit)
      .map(u => ({
        name: u.name,
        picture: u.picture,
        carbonSavedKg: u.carbonSavedKg,
        pagesScanned: u.pagesScanned,
        averageEcoScore: u.averageEcoScore,
      }));
  }

  /**
   * Get system-wide stats
   */
  getSystemStats() {
    this.load();
    return this.memoryDb.systemStats;
  }
}

// Export a singleton instance
module.exports = new EcoDatabase();
