/**
 * Confidence scoring for resolver results
 */

/**
 * Calculate overall confidence score based on multiple signals
 * @param {Object} params
 * @param {number} params.patternConfidence - SKU pattern match confidence (0-1)
 * @param {string} params.source - Where the data came from
 * @param {boolean} params.exactSkuMatch - Did the returned SKU match exactly?
 * @param {boolean} params.hasBrand - Does result have brand info?
 * @param {boolean} params.hasModel - Does result have model info?
 * @param {boolean} params.hasColorway - Does result have colorway info?
 * @param {boolean} params.fromCache - Was this from our cache?
 * @returns {number} Confidence score 0-1
 */
export function calculateConfidence({
  patternConfidence = 0.5,
  source = 'unknown',
  exactSkuMatch = false,
  hasBrand = false,
  hasModel = false,
  hasColorway = false,
  fromCache = false
}) {
  let score = 0;

  // Base score from pattern match
  score += patternConfidence * 0.3;

  // Exact SKU match is a strong signal
  if (exactSkuMatch) {
    score += 0.25;
  }

  // Source reliability
  const sourceScores = {
    cache: 0.15,      // Cached results were previously validated
    kicksdb: 0.15,    // Paid API, good data
    sneaks: 0.12,     // Open source, decent data
    google: 0.08,     // Search results, less reliable
    unknown: 0.02
  };
  score += sourceScores[source] || sourceScores.unknown;

  // Completeness of data
  if (hasBrand) score += 0.10;
  if (hasModel) score += 0.10;
  if (hasColorway) score += 0.10;

  // Cached results get a small boost (they were good enough to cache)
  if (fromCache) {
    score += 0.05;
  }

  // Clamp to 0-1
  return Math.min(1, Math.max(0, score));
}

/**
 * Get confidence level label
 * @param {number} confidence 
 * @returns {'high' | 'medium' | 'low'}
 */
export function getConfidenceLevel(confidence) {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}
