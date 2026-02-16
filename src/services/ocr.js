/**
 * OCR Service
 * Uses Google Cloud Vision for text extraction from shoe tags
 */

import vision from '@google-cloud/vision';
import { extractSkusFromText, extractUsSize, detectBrandFromText } from '../classifiers/sku-classifier.js';

let client = null;

/**
 * Initialize the Vision API client
 */
function getClient() {
  if (client) return client;

  // Check for base64 encoded credentials (for cloud deployment)
  if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString()
    );
    client = new vision.ImageAnnotatorClient({ credentials });
  } else {
    // Use GOOGLE_APPLICATION_CREDENTIALS env var or default credentials
    client = new vision.ImageAnnotatorClient();
  }

  return client;
}

/**
 * Extract text from an image using Google Cloud Vision
 * @param {string} imageBase64 - Base64 encoded image data
 * @returns {Promise<Object>}
 */
export async function extractTextFromImage(imageBase64) {
  const visionClient = getClient();

  // Remove data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  try {
    // Call Google Cloud Vision
    const [result] = await visionClient.textDetection({
      image: { content: base64Data }
    });

    const detections = result.textAnnotations;
    
    if (!detections || detections.length === 0) {
      return {
        success: false,
        error: 'No text detected in image'
      };
    }

    // First annotation contains the full text
    const rawText = detections[0].description || '';

    // Extract SKUs from the text
    const skus = extractSkusFromText(rawText);
    
    // Extract US size
    const usSize = extractUsSize(rawText);
    
    // Detect brand from text
    const brandHint = detectBrandFromText(rawText);

    // Get the best SKU (highest confidence)
    const bestSku = skus.length > 0 ? skus[0] : null;

    return {
      success: true,
      raw_text: rawText,
      extracted: {
        sku: bestSku?.sku || null,
        sku_confidence: bestSku?.confidence || 0,
        all_skus: skus,
        us_size: usSize,
        brand_hint: bestSku?.brand || brandHint
      }
    };
  } catch (error) {
    console.error('OCR error:', error.message);
    
    // Handle specific Google Cloud errors
    if (error.code === 7) {
      return {
        success: false,
        error: 'Google Cloud Vision API not enabled or credentials invalid'
      };
    }
    
    return {
      success: false,
      error: `OCR failed: ${error.message}`
    };
  }
}

/**
 * Check if OCR service is properly configured
 */
export function isOcrConfigured() {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS || 
    process.env.GOOGLE_CREDENTIALS_BASE64
  );
}
