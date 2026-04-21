/**
 * Input validation utilities
 */

/**
 * Validate a SKU query
 * @param {string} query 
 * @returns {{ valid: boolean, error?: string, normalized?: string }}
 */
export function validateSkuQuery(query) {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Query is required and must be a string' };
  }

  const trimmed = query.trim();

  if (trimmed.length < 4) {
    return { valid: false, error: 'Query too short (minimum 4 characters)' };
  }

  if (trimmed.length > 20) {
    return { valid: false, error: 'Query too long (maximum 20 characters)' };
  }

  let allDigits = true;
  for (const char of trimmed) {
    if (char < '0' || char > '9') {
      allDigits = false;
      break;
    }
  }

  if (allDigits && trimmed.length < 6) {
    return { valid: false, error: 'Query appears to be invalid (too few characters)' };
  }

  const allowedCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789- ';
  for (const char of trimmed) {
    if (!allowedCharacters.includes(char)) {
      return { valid: false, error: 'Query contains invalid characters' };
    }
  }

  const normalized = trimmed.toUpperCase().split(' ').join('');

  return { valid: true, normalized };
}

/**
 * Validate base64 image data or raw image buffers
 * @param {string|Buffer|{buffer: Buffer}} imageData
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateImageData(imageData) {
  const MIN_BYTES = 1000;
  const MAX_BYTES = 10 * 1024 * 1024;

  if (Buffer.isBuffer(imageData)) {
    if (imageData.length < MIN_BYTES) {
      return { valid: false, error: 'Image too small' };
    }

    if (imageData.length > MAX_BYTES) {
      return { valid: false, error: 'Image too large (max 10MB)' };
    }

    return { valid: true };
  }

  if (imageData && typeof imageData === 'object' && Buffer.isBuffer(imageData.buffer)) {
    if (imageData.buffer.length < MIN_BYTES) {
      return { valid: false, error: 'Image too small' };
    }

    if (imageData.buffer.length > MAX_BYTES) {
      return { valid: false, error: 'Image too large (max 10MB)' };
    }

    return { valid: true };
  }

  if (!imageData || typeof imageData !== 'string') {
    return { valid: false, error: 'Image data is required' };
  }

  let base64Data = imageData;
  if (base64Data.startsWith('data:')) {
    const commaIndex = base64Data.indexOf(',');
    if (commaIndex !== -1) {
      base64Data = base64Data.slice(commaIndex + 1);
    }
  }

  try {
    const decoded = Buffer.from(base64Data, 'base64');

    if (decoded.length < MIN_BYTES) {
      return { valid: false, error: 'Image too small' };
    }

    if (decoded.length > MAX_BYTES) {
      return { valid: false, error: 'Image too large (max 10MB)' };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid base64 image data' };
  }
}
