/**
 * Normalizer Service
 * Converts raw API responses into structured sneaker metadata
 */

/**
 * Normalize a resolver result into standard format
 * @param {Object} result - Raw result from a resolver
 * @returns {Object}
 */
export function normalizeResult(result) {
  if (!result) {
    return {
      brand: null,
      name: null,
      model: null,
      colorway: null,
      category: 'sneakers'
    };
  }

  const name = result.name || '';
  
  return {
    brand: result.brand || extractBrand(name),
    name: name,
    model: result.model || extractModel(name),
    colorway: result.colorway || extractColorway(name),
    category: result.category || 'sneakers'
  };
}

/**
 * Extract brand from sneaker name
 */
function extractBrand(name) {
  if (!name) return null;
  
  const upper = name.toUpperCase();
  
  // Order matters - more specific first
  const brandPatterns = [
    { brand: 'Jordan', patterns: ['AIR JORDAN', 'JORDAN'] },
    { brand: 'Nike', patterns: ['NIKE', 'DUNK', 'AIR FORCE', 'AIR MAX', 'BLAZER', 'CORTEZ'] },
    { brand: 'Adidas', patterns: ['ADIDAS', 'YEEZY', 'ULTRABOOST', 'NMD', 'SUPERSTAR', 'STAN SMITH'] },
    { brand: 'New Balance', patterns: ['NEW BALANCE', 'NB '] },
    { brand: 'Puma', patterns: ['PUMA'] },
    { brand: 'Converse', patterns: ['CONVERSE', 'CHUCK TAYLOR', 'ALL STAR'] },
    { brand: 'Vans', patterns: ['VANS', 'OLD SKOOL', 'SK8-HI', 'AUTHENTIC'] },
    { brand: 'Asics', patterns: ['ASICS', 'GEL-LYTE', 'GEL-KAYANO'] },
    { brand: 'Reebok', patterns: ['REEBOK', 'CLUB C', 'CLASSIC LEATHER'] },
  ];

  for (const { brand, patterns } of brandPatterns) {
    for (const pattern of patterns) {
      if (upper.includes(pattern)) {
        return brand;
      }
    }
  }

  return null;
}

/**
 * Extract model from sneaker name
 */
function extractModel(name) {
  if (!name) return null;

  // Model extraction patterns - order by specificity
  const modelPatterns = [
    // Nike/Jordan
    { pattern: /\b(Air Jordan \d+)\b/i, brand: 'Jordan' },
    { pattern: /\b(Jordan \d+(?: Retro)?)\b/i, brand: 'Jordan' },
    { pattern: /\b(Dunk (?:Low|High|Mid))\b/i, brand: 'Nike' },
    { pattern: /\b(Air Force 1(?: Low| High| Mid| '07)?)\b/i, brand: 'Nike' },
    { pattern: /\b(Air Max \d+)\b/i, brand: 'Nike' },
    { pattern: /\b(Blazer (?:Low|Mid|High))\b/i, brand: 'Nike' },
    { pattern: /\b(Cortez)\b/i, brand: 'Nike' },
    
    // Adidas
    { pattern: /\b(Yeezy (?:Boost )?\d+(?:\s*V\d)?)\b/i, brand: 'Adidas' },
    { pattern: /\b(Ultra ?Boost(?:\s*\d+)?)\b/i, brand: 'Adidas' },
    { pattern: /\b(NMD[_ ]?R?\d?)\b/i, brand: 'Adidas' },
    { pattern: /\b(Superstar)\b/i, brand: 'Adidas' },
    { pattern: /\b(Stan Smith)\b/i, brand: 'Adidas' },
    { pattern: /\b(Forum (?:Low|High|Mid))\b/i, brand: 'Adidas' },
    
    // New Balance
    { pattern: /\b(\d{3,4}(?:v\d)?)\b/i, brand: 'New Balance' },
    
    // Converse
    { pattern: /\b(Chuck Taylor|Chuck 70|All Star)\b/i, brand: 'Converse' },
    
    // Vans
    { pattern: /\b(Old Skool|Sk8-Hi|Authentic|Era|Slip-On)\b/i, brand: 'Vans' },
    
    // Asics
    { pattern: /\b(Gel-Lyte(?:\s*[IVX]+)?)\b/i, brand: 'Asics' },
    { pattern: /\b(Gel-Kayano(?:\s*\d+)?)\b/i, brand: 'Asics' },
  ];

  for (const { pattern } of modelPatterns) {
    const match = name.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract colorway from sneaker name
 */
function extractColorway(name) {
  if (!name) return null;

  // Try to find colorway in quotes first
  const quoteMatch = name.match(/['"]([^'"]+)['"]/);
  if (quoteMatch) {
    return quoteMatch[1];
  }

  // Common colorway patterns
  const colorwayPatterns = [
    // After "Retro" + year pattern: "Jordan 4 Retro 'White Oreo' 2021"
    /Retro\s+['"]?([^'"(]+?)['"]?\s*(?:\(\d{4}\)|\d{4})?$/i,
    
    // After model name, remaining words are often colorway
    // "Dunk Low Panda" -> "Panda"
    // "Air Jordan 1 Retro High OG Chicago" -> "Chicago"
  ];

  for (const pattern of colorwayPatterns) {
    const match = name.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // Try to extract from parentheses: "Jordan 4 (Fire Red)"
  const parenMatch = name.match(/\(([^)]+)\)/);
  if (parenMatch && !parenMatch[1].match(/^\d{4}$/)) {
    return parenMatch[1];
  }

  // Known colorway keywords
  const colorwayKeywords = [
    'Panda', 'Bred', 'Chicago', 'Royal', 'Shadow', 'Pine Green',
    'University Blue', 'Fire Red', 'Cement', 'Infrared', 'Concord',
    'White Oreo', 'Black Cat', 'Cool Grey', 'Triple White', 'Triple Black',
    'Zebra', 'Beluga', 'Cream', 'Butter', 'Static', 'Bone',
    'Grey Day', 'Sea Salt', 'Navy', 'Burgundy', 'Forest Green'
  ];

  const upper = name.toUpperCase();
  for (const colorway of colorwayKeywords) {
    if (upper.includes(colorway.toUpperCase())) {
      return colorway;
    }
  }

  return null;
}

/**
 * Clean and format a sneaker name
 */
export function cleanName(name) {
  if (!name) return '';
  
  return name
    .replace(/\s+/g, ' ')
    .replace(/\(\d{4}\)/, '') // Remove year in parens
    .trim();
}
