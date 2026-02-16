/**
 * KicksDB API Resolver
 * Uses KicksDB's unified API to search across StockX, GOAT, Flight Club
 */

const KICKSDB_BASE_URL = 'https://api.kicks.dev/v3/stockx/products';

/**
 * Resolve a SKU using KicksDB
 * @param {string} sku 
 * @returns {Promise<Object|null>}
 */
export async function resolveWithKicksDb(sku) {
  const apiKey = process.env.KICKSDB_API_KEY;
  
  if (!apiKey) {
    console.warn('KicksDB API key not configured');
    return null;
  }

  try {
    const url = `${KICKSDB_BASE_URL}?query=${encodeURIComponent(sku)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`KicksDB request failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const items = data?.data || [];

    if (!items.length) {
      return null;
    }

    // Find best match - prefer exact SKU match
    const exactMatch = items.find(item => 
      item.sku?.toUpperCase() === sku.toUpperCase()
    );
    const item = exactMatch || items[0];

    return {
      brand: item.brand || extractBrandFromTitle(item.title),
      name: item.title || item.name || '',
      model: item.model || extractModelFromTitle(item.title),
      colorway: item.colorway || extractColorwayFromTitle(item.title),
      category: item.categories?.[0] || 'sneakers',
      sku: item.sku || sku,
      source: 'kicksdb',
      exactMatch: !!exactMatch,
      raw: item
    };
  } catch (error) {
    console.error('KicksDB resolver error:', error.message);
    return null;
  }
}

/**
 * Extract brand from title if not provided
 */
function extractBrandFromTitle(title) {
  if (!title) return null;
  
  const brands = ['Nike', 'Jordan', 'Adidas', 'New Balance', 'Puma', 'Converse', 'Vans', 'Asics', 'Reebok', 'Yeezy'];
  const upper = title.toUpperCase();
  
  for (const brand of brands) {
    if (upper.includes(brand.toUpperCase())) {
      return brand;
    }
  }
  
  // Check for "Air Jordan" specifically
  if (upper.includes('AIR JORDAN') || upper.includes('JORDAN')) {
    return 'Jordan';
  }
  
  return null;
}

/**
 * Extract model from title
 */
function extractModelFromTitle(title) {
  if (!title) return null;
  
  // Common model patterns
  const modelPatterns = [
    /\b(Dunk (?:Low|High|Mid))\b/i,
    /\b(Air Force 1(?: Low| High| Mid)?)\b/i,
    /\b(Air Max \d+)\b/i,
    /\b(Air Jordan \d+)\b/i,
    /\b(Jordan \d+(?: Retro)?)\b/i,
    /\b(Yeezy (?:Boost )?\d+(?:\s*V\d)?)\b/i,
    /\b(Ultra ?Boost)\b/i,
    /\b(NMD[_ ]?R?\d?)\b/i,
    /\b(\d{3,4}(?:v\d)?)\b/i, // New Balance models like 990, 574, 2002r
  ];

  for (const pattern of modelPatterns) {
    const match = title.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Extract colorway from title
 */
function extractColorwayFromTitle(title) {
  if (!title) return null;
  
  // Colorway is often in quotes or after certain keywords
  const quoteMatch = title.match(/['"]([^'"]+)['"]/);
  if (quoteMatch) return quoteMatch[1];

  // After model name, colorway often follows
  // e.g., "Jordan 4 Retro White Oreo" - "White Oreo" is the colorway
  // This is handled better by the normalizer service
  
  return null;
}
