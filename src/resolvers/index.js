/**
 * Resolver Orchestrator
 * Manages the resolution chain with fallbacks
 */

import { getCached, setCache } from '../db/cache.js';
import { resolveWithKicksDb } from './kicksdb.js';
import { resolveWithSneaks } from './sneaks.js';
import { classifySku } from '../classifiers/sku-classifier.js';
import { normalizeResult } from '../services/normalizer.js';
import { calculateConfidence } from '../utils/confidence.js';

/**
 * Resolve a SKU through the resolver chain
 * Order: Cache → KicksDB → Sneaks API
 * 
 * @param {string} sku - The SKU to resolve
 * @returns {Promise<Object>}
 */
export async function resolve(sku) {
  const startTime = Date.now();
  
  // Classify the SKU first
  const classification = classifySku(sku);
  const normalizedSku = classification.normalized || sku.toUpperCase().trim();

  // 1. Check cache first
  const cached = getCached(normalizedSku);
  if (cached) {
    const confidence = calculateConfidence({
      patternConfidence: classification.confidence,
      source: 'cache',
      exactSkuMatch: true,
      hasBrand: !!cached.brand,
      hasModel: !!cached.model,
      hasColorway: !!cached.colorway,
      fromCache: true
    });

    return {
      success: true,
      input: sku,
      resolved: {
        brand: cached.brand,
        name: cached.name,
        model: cached.model,
        colorway: cached.colorway,
        category: cached.category
      },
      confidence: Math.round(confidence * 100) / 100,
      source: 'cache',
      classification,
      timing: Date.now() - startTime
    };
  }

  // 2. Try KicksDB
  let result = await resolveWithKicksDb(normalizedSku);
  
  // 3. Fallback to Sneaks API
  if (!result) {
    result = await resolveWithSneaks(normalizedSku);
  }

  // No results from any source
  if (!result) {
    return {
      success: false,
      input: sku,
      error: 'No match found',
      classification,
      timing: Date.now() - startTime
    };
  }

  // Normalize the result
  const normalized = normalizeResult(result);

  // Calculate confidence
  const confidence = calculateConfidence({
    patternConfidence: classification.confidence,
    source: result.source,
    exactSkuMatch: result.exactMatch,
    hasBrand: !!normalized.brand,
    hasModel: !!normalized.model,
    hasColorway: !!normalized.colorway,
    fromCache: false
  });

  // Cache successful results with good confidence
  if (confidence >= 0.5) {
    setCache(normalizedSku, {
      ...normalized,
      source: result.source,
      confidence
    });
  }

  return {
    success: true,
    input: sku,
    resolved: {
      brand: normalized.brand,
      name: normalized.name,
      model: normalized.model,
      colorway: normalized.colorway,
      category: normalized.category
    },
    confidence: Math.round(confidence * 100) / 100,
    source: result.source,
    classification,
    timing: Date.now() - startTime
  };
}
