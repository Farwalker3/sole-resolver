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

  if (/^[0-9]+$/.test(trimmed) && trimmed.length < 6) {
    return { valid: false, error: 'Query appears to be invalid (too few characters)' };
  }

  if (/[^A-Za-z0-9-s]/.test(trimmed)) {
    return { valid: false, error: 'Query contains invalid characters' };
  }

  const normalized = trimmed.toUpperCase().replace(/s+/g, '');

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

  const base64Data = imageData.replace(/^data:image/w+;base64,/, '');

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
