/**
 * Simple in-memory cache (no native dependencies)
 */

const cache = new Map();

export function initCache() {
  console.log('Cache initialized (in-memory)');
}

export function getCached(sku) {
  if (!sku) return null;
  
  const normalized = sku.toUpperCase().trim();
  const entry = cache.get(normalized);
  
  if (entry) {
    const ttlMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    if (Date.now() - entry.timestamp < ttlMs) {
      return { ...entry.data, fromCache: true };
    }
    cache.delete(normalized);
  }
  
  return null;
}

export function setCache(sku, data) {
  if (!sku) return;
  
  const normalized = sku.toUpperCase().trim();
  cache.set(normalized, {
    data,
    timestamp: Date.now()
  });
}

export function getCacheStats() {
  return { total: cache.size, recentHits: 0 };
}
