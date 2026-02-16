/**
 * SKU Classifier - Detects brand from SKU pattern
 * 
 * Pattern Examples:
 * - Nike/Jordan: CT8527-100, DD1391-100, CZ0790-003, DM7866-200
 * - Adidas: GX1234, FY2903, H67123, EG1234
 * - New Balance: M990GL5, W990GL5, ML574EGG
 * - Puma: 384692-01, 389289-02
 * - Converse: 162050C, M9160C
 * - Vans: VN0A38F7PXP
 * - Asics: 1011A792-100
 */

const BRAND_PATTERNS = [
  {
    brand: 'Nike',
    patterns: [
      // Standard Nike/Jordan: 6 alphanumeric + hyphen + 3 digits
      /^[A-Z]{2}[0-9]{4}-[0-9]{3}$/i,
      // Older Nike format
      /^[0-9]{6}-[0-9]{3}$/,
      // Alternative Nike format
      /^[A-Z]{3}[0-9]{3}-[0-9]{3}$/i,
    ],
    confidence: 0.95
  },
  {
    brand: 'Jordan',
    patterns: [
      // Jordan often starts with specific prefixes
      /^(CT|CZ|DM|DD|DC|DQ|DR|DO|DN|FQ|FD)[0-9]{4}-[0-9]{3}$/i,
    ],
    confidence: 0.90  // Slightly lower because Nike uses same format
  },
  {
    brand: 'Adidas',
    patterns: [
      // Standard Adidas: 2 letters + 4 digits
      /^[A-Z]{2}[0-9]{4}$/i,
      // Alternative: letter + 5 digits
      /^[A-Z][0-9]{5}$/i,
      // Yeezy style
      /^(GW|GX|GY|GZ|HP|HQ|HR|HS|HT|ID|IE|IF|IG|IH)[0-9]{4}$/i,
    ],
    confidence: 0.90
  },
  {
    brand: 'New Balance',
    patterns: [
      // Men's: M + model + colorway (M990GL5)
      /^M[0-9]{3,4}[A-Z]{2,3}[0-9]?$/i,
      // Women's: W + model + colorway
      /^W[0-9]{3,4}[A-Z]{2,3}[0-9]?$/i,
      // Unisex: U + model
      /^U[0-9]{3,4}[A-Z]{2,3}[0-9]?$/i,
      // ML prefix (lifestyle)
      /^ML[0-9]{3,4}[A-Z]{2,3}$/i,
    ],
    confidence: 0.92
  },
  {
    brand: 'Puma',
    patterns: [
      // Puma: 6 digits + hyphen + 2 digits
      /^[0-9]{6}-[0-9]{2}$/,
      // Alternative: 3 digits + hyphen + 5 digits
      /^[0-9]{3}-[0-9]{5}$/,
    ],
    confidence: 0.88
  },
  {
    brand: 'Converse',
    patterns: [
      // Converse: 6 digits + C or letters + digits + C
      /^[0-9]{6}C$/i,
      /^[A-Z][0-9]{4,5}C$/i,
    ],
    confidence: 0.90
  },
  {
    brand: 'Vans',
    patterns: [
      // Vans: VN + 0 + A + alphanumeric
      /^VN0[A-Z][0-9A-Z]{5,7}$/i,
    ],
    confidence: 0.92
  },
  {
    brand: 'Asics',
    patterns: [
      // Asics: 4 digits + letter + 3-4 digits + optional hyphen + 3 digits
      /^[0-9]{4}[A-Z][0-9]{3,4}(-[0-9]{3})?$/i,
      /^1[0-9]{3}[A-Z][0-9]{3}-[0-9]{3}$/i,
    ],
    confidence: 0.88
  },
  {
    brand: 'Reebok',
    patterns: [
      // Reebok: Various formats
      /^[A-Z]{2}[0-9]{4}$/i,
      /^[0-9]{2}-[0-9]{5}$/,
    ],
    confidence: 0.85
  }
];

/**
 * Classify a SKU and detect the likely brand
 * @param {string} sku - The SKU to classify
 * @returns {{ brand: string, confidence: number, normalized: string }}
 */
export function classifySku(sku) {
  if (!sku || typeof sku !== 'string') {
    return { brand: 'Unknown', confidence: 0, normalized: '' };
  }

  // Normalize: uppercase, trim, remove extra spaces
  const normalized = sku.toUpperCase().trim().replace(/\s+/g, '');
  
  // Try each brand's patterns
  for (const { brand, patterns, confidence } of BRAND_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        return { brand, confidence, normalized };
      }
    }
  }

  // Generic fallback - if it looks like a product code
  if (/^[A-Z0-9]{5,12}(-[A-Z0-9]{2,4})?$/i.test(normalized)) {
    return { brand: 'Unknown', confidence: 0.5, normalized };
  }

  return { brand: 'Unknown', confidence: 0, normalized };
}

/**
 * Extract all potential SKUs from a block of text
 * @param {string} text - Raw text (e.g., from OCR)
 * @returns {Array<{ sku: string, brand: string, confidence: number }>}
 */
export function extractSkusFromText(text) {
  if (!text) return [];

  const results = [];
  const lines = text.toUpperCase().split(/[\n\r\s]+/);

  for (const line of lines) {
    // Clean up the line
    const cleaned = line.trim().replace(/[^\w-]/g, '');
    if (cleaned.length < 5 || cleaned.length > 15) continue;

    const classification = classifySku(cleaned);
    if (classification.confidence > 0.3) {
      results.push({
        sku: classification.normalized,
        brand: classification.brand,
        confidence: classification.confidence
      });
    }
  }

  // Sort by confidence descending
  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Extract US size from text
 * @param {string} text - Raw text
 * @returns {string|null}
 */
export function extractUsSize(text) {
  if (!text) return null;
  
  // Common patterns: "US 10.5", "US: 10", "US 10", "10.5 US", "SIZE US 10"
  const patterns = [
    /\bUS\s*[:#]?\s*(\d{1,2}(?:\.\d)?)\b/i,
    /\b(\d{1,2}(?:\.\d)?)\s*US\b/i,
    /\bSIZE\s*[:#]?\s*(\d{1,2}(?:\.\d)?)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Detect brand hints from text (useful when SKU doesn't match patterns)
 * @param {string} text 
 * @returns {string|null}
 */
export function detectBrandFromText(text) {
  if (!text) return null;
  
  const upper = text.toUpperCase();
  
  const brandKeywords = [
    { brand: 'Nike', keywords: ['NIKE', 'SWOOSH', 'JUST DO IT'] },
    { brand: 'Jordan', keywords: ['JORDAN', 'AIR JORDAN', 'JUMPMAN'] },
    { brand: 'Adidas', keywords: ['ADIDAS', 'THREE STRIPES', 'TREFOIL'] },
    { brand: 'New Balance', keywords: ['NEW BALANCE', 'NB', 'NEWBALANCE'] },
    { brand: 'Puma', keywords: ['PUMA'] },
    { brand: 'Converse', keywords: ['CONVERSE', 'CHUCK TAYLOR', 'ALL STAR'] },
    { brand: 'Vans', keywords: ['VANS', 'OFF THE WALL'] },
    { brand: 'Asics', keywords: ['ASICS', 'GEL-'] },
    { brand: 'Reebok', keywords: ['REEBOK'] },
  ];

  for (const { brand, keywords } of brandKeywords) {
    for (const keyword of keywords) {
      if (upper.includes(keyword)) {
        return brand;
      }
    }
  }

  return null;
}
