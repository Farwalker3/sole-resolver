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

  // Check for garbage input
  if (/^[0-9]+$/.test(trimmed) && trimmed.length < 6) {
    return { valid: false, error: 'Query appears to be invalid (too few characters)' };
  }

  // Check for impossible characters
  if (/[^A-Za-z0-9\-\s]/.test(trimmed)) {
    return { valid: false, error: 'Query contains invalid characters' };
  }

  // Normalize
  const normalized = trimmed.toUpperCase().replace(/\s+/g, '');

  return { valid: true, normalized };
}

/**
 * Validate base64 image data
 * @param {string} imageData 
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateImageData(imageData) {
  if (!imageData || typeof imageData !== 'string') {
    return { valid: false, error: 'Image data is required' };
  }

  // Remove data URL prefix if present
  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
  
  // Check if it's valid base64
  try {
    const decoded = Buffer.from(base64Data, 'base64');
    
    // Check minimum size (roughly 1KB for a tiny image)
    if (decoded.length < 1000) {
      return { valid: false, error: 'Image too small' };
    }
    
    // Check maximum size (10MB)
    if (decoded.length > 10 * 1024 * 1024) {
      return { valid: false, error: 'Image too large (max 10MB)' };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid base64 image data' };
  }
}
