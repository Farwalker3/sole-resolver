/**
 * OCR Service - Placeholder (add @google-cloud/vision to package.json to enable)
 */

export async function extractTextFromImage(imageBase64) {
  return {
    success: false,
    error: 'OCR not configured. Add Google Cloud Vision credentials.'
  };
}

export function isOcrConfigured() {
  return false;
}
