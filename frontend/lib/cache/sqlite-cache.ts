/**
 * SQLite Cache with Metrics
 *
 * Provides persistent caching with 7-day TTL and metrics tracking.
 * Falls back to memory cache if SQLite fails.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export interface CacheMetrics {
  requests_total: number;
  cache_hits: number;
  cache_misses: number;
  blocked_403_count: number;
  search_results_total: number;
  evidence_windows_total: number;
  filtered_out_total: number;
}

interface CacheRow {
  key: string;
  value: string;
  created_at: number;
  expires_at: number;
}

class SQLiteCache {
  private db: Database.Database | null = null;
  private memoryFallback: Map<string, { value: any; expiresAt: number }> = new Map();
  private useMemory = false;

  constructor(dbPath?: string) {
    try {
      const finalPath = dbPath || path.join(process.cwd(), "data", "cache.db");

      // Ensure directory exists
      const dir = path.dirname(finalPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(finalPath);
      this.initTables();
      console.log(`[sqlite-cache] Initialized at ${finalPath}`);
    } catch (error) {
      console.error("[sqlite-cache] Failed to initialize SQLite, using memory fallback:", error);
      this.useMemory = true;
    }
  }

  private initTables() {
    if (!this.db) return;

    // Cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_expires_at ON cache(expires_at);
    `);

    // Metrics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Initialize metric counters
    const metricKeys = [
      "requests_total",
      "cache_hits",
      "cache_misses",
      "blocked_403_count",
      "search_results_total",
      "evidence_windows_total",
      "filtered_out_total",
    ];

    const stmt = this.db.prepare("INSERT OR IGNORE INTO metrics (key, value) VALUES (?, 0)");
    metricKeys.forEach(key => stmt.run(key));
  }

  /**
   * Get value from cache
   */
  get<T = any>(key: string): T | null {
    if (this.useMemory) {
      return this.getMemory(key);
    }

    if (!this.db) return null;

    try {
      const now = Date.now();
      const row = this.db
        .prepare<string, CacheRow>("SELECT * FROM cache WHERE key = ? AND expires_at > ?")
        .get(key, now);

      if (row) {
        this.incrementMetric("cache_hits");
        return JSON.parse(row.value) as T;
      }

      this.incrementMetric("cache_misses");
      return null;
    } catch (error) {
      console.error(`[sqlite-cache] Error getting key "${key}":`, error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   * @param key Cache key
   * @param value Value to cache
   * @param ttlDays TTL in days (default: 7)
   */
  set(key: string, value: any, ttlDays = 7): void {
    if (this.useMemory) {
      return this.setMemory(key, value, ttlDays);
    }

    if (!this.db) return;

    try {
      const now = Date.now();
      const expiresAt = now + ttlDays * 24 * 60 * 60 * 1000;

      this.db
        .prepare(
          "INSERT OR REPLACE INTO cache (key, value, created_at, expires_at) VALUES (?, ?, ?, ?)"
        )
        .run(key, JSON.stringify(value), now, expiresAt);
    } catch (error) {
      console.error(`[sqlite-cache] Error setting key "${key}":`, error);
    }
  }

  /**
   * Delete expired entries
   */
  cleanup(): number {
    if (this.useMemory) {
      return this.cleanupMemory();
    }

    if (!this.db) return 0;

    try {
      const now = Date.now();
      const result = this.db.prepare("DELETE FROM cache WHERE expires_at <= ?").run(now);
      const deleted = result.changes;

      if (deleted > 0) {
        console.log(`[sqlite-cache] Cleaned up ${deleted} expired entries`);
      }

      return deleted;
    } catch (error) {
      console.error("[sqlite-cache] Error during cleanup:", error);
      return 0;
    }
  }

  /**
   * Increment a metric counter
   */
  incrementMetric(key: keyof CacheMetrics, delta = 1): void {
    if (this.useMemory) return; // Metrics not supported in memory mode

    if (!this.db) return;

    try {
      this.db
        .prepare("UPDATE metrics SET value = value + ? WHERE key = ?")
        .run(delta, key);
    } catch (error) {
      console.error(`[sqlite-cache] Error incrementing metric "${key}":`, error);
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): CacheMetrics {
    if (this.useMemory) {
      return {
        requests_total: 0,
        cache_hits: 0,
        cache_misses: 0,
        blocked_403_count: 0,
        search_results_total: 0,
        evidence_windows_total: 0,
        filtered_out_total: 0,
      };
    }

    if (!this.db) {
      return this.getMetrics(); // Return empty metrics
    }

    try {
      const rows = this.db.prepare("SELECT key, value FROM metrics").all() as {
        key: string;
        value: number;
      }[];

      const metrics: any = {};
      rows.forEach(row => {
        metrics[row.key] = row.value;
      });

      return metrics as CacheMetrics;
    } catch (error) {
      console.error("[sqlite-cache] Error getting metrics:", error);
      return this.getMetrics(); // Return empty
    }
  }

  /**
   * Memory fallback methods
   */
  private getMemory<T = any>(key: string): T | null {
    const entry = this.memoryFallback.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.memoryFallback.delete(key);
      return null;
    }

    return entry.value as T;
  }

  private setMemory(key: string, value: any, ttlDays = 7): void {
    const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
    this.memoryFallback.set(key, { value, expiresAt });
  }

  private cleanupMemory(): number {
    const now = Date.now();
    let deleted = 0;

    this.memoryFallback.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        this.memoryFallback.delete(key);
        deleted++;
      }
    });

    return deleted;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
let cacheInstance: SQLiteCache | null = null;

export function getCache(): SQLiteCache {
  if (!cacheInstance) {
    const dbPath = process.env.CACHE_DB_PATH;
    cacheInstance = new SQLiteCache(dbPath);
  }
  return cacheInstance;
}

export function closeCache(): void {
  if (cacheInstance) {
    cacheInstance.close();
    cacheInstance = null;
  }
}

// Auto-cleanup every hour
if (typeof process !== "undefined") {
  setInterval(() => {
    getCache().cleanup();
  }, 60 * 60 * 1000);
}
