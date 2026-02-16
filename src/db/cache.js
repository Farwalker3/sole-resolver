import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../data/cache.db');

let db = null;

/**
 * Initialize the cache database
 */
export function initCache() {
  // Ensure data directory exists
  const dataDir = join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sku_cache (
      sku TEXT PRIMARY KEY,
      brand TEXT,
      name TEXT,
      model TEXT,
      colorway TEXT,
      category TEXT,
      source TEXT,
      confidence REAL,
      raw_data TEXT,
      created_at INTEGER,
      accessed_at INTEGER,
      access_count INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_sku_cache_accessed 
    ON sku_cache(accessed_at);
  `);

  return db;
}

/**
 * Get cached result for a SKU
 * @param {string} sku 
 * @returns {Object|null}
 */
export function getCached(sku) {
  if (!db) return null;
  
  const normalized = sku.toUpperCase().trim();
  const ttlDays = parseInt(process.env.CACHE_TTL_DAYS || '30', 10);
  const minTimestamp = Date.now() - (ttlDays * 24 * 60 * 60 * 1000);

  const row = db.prepare(`
    SELECT * FROM sku_cache 
    WHERE sku = ? AND created_at > ?
  `).get(normalized, minTimestamp);

  if (row) {
    // Update access stats
    db.prepare(`
      UPDATE sku_cache 
      SET accessed_at = ?, access_count = access_count + 1 
      WHERE sku = ?
    `).run(Date.now(), normalized);

    return {
      brand: row.brand,
      name: row.name,
      model: row.model,
      colorway: row.colorway,
      category: row.category,
      source: row.source,
      confidence: row.confidence,
      fromCache: true
    };
  }

  return null;
}

/**
 * Cache a resolved SKU
 * @param {string} sku 
 * @param {Object} data 
 */
export function setCache(sku, data) {
  if (!db) return;

  const normalized = sku.toUpperCase().trim();
  const now = Date.now();

  db.prepare(`
    INSERT OR REPLACE INTO sku_cache 
    (sku, brand, name, model, colorway, category, source, confidence, raw_data, created_at, accessed_at, access_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
      COALESCE((SELECT access_count FROM sku_cache WHERE sku = ?), 0) + 1
    )
  `).run(
    normalized,
    data.brand || null,
    data.name || null,
    data.model || null,
    data.colorway || null,
    data.category || null,
    data.source || 'unknown',
    data.confidence || 0,
    JSON.stringify(data),
    now,
    now,
    normalized
  );
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  if (!db) return { total: 0, recentHits: 0 };

  const total = db.prepare('SELECT COUNT(*) as count FROM sku_cache').get();
  const recentHits = db.prepare(`
    SELECT COUNT(*) as count FROM sku_cache 
    WHERE accessed_at > ?
  `).get(Date.now() - 24 * 60 * 60 * 1000);

  return {
    total: total.count,
    recentHits: recentHits.count
  };
}
