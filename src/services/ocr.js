/**
 * OCR Service - Placeholder
 * Add @google-cloud/vision to package.json to enable
 */

import { extractSkusFromText, extractUsSize, detectBrandFromText } from '../classifiers/sku-classifier.js';

export async function extractTextFromImage(imageBase64) {
  return {
    success: false,
    error: 'OCR not configured. Add Google Cloud Vision to enable.'
  };
}

export function isOcrConfigured() {
  return false;
}
