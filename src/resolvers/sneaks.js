/**
 * Sneaks API Resolver
 * Uses the open-source sneaks-api package as a fallback
 * No API key required
 */

import SneaksAPI from 'sneaks-api';

const sneaks = new SneaksAPI();

/**
 * Resolve a SKU using Sneaks API
 * @param {string} sku 
 * @returns {Promise<Object|null>}
 */
export async function resolveWithSneaks(sku) {
  return new Promise((resolve) => {
    // First try to get product by style ID (SKU)
    sneaks.getProductPrices(sku, (err, product) => {
      if (!err && product) {
        resolve(formatSneaksResult(product, sku, true));
        return;
      }

      // Fallback to search
      sneaks.getProducts(sku, 5, (err, products) => {
        if (err || !products || !products.length) {
          resolve(null);
          return;
        }

        // Find best match
        const exactMatch = products.find(p => 
          p.styleID?.toUpperCase() === sku.toUpperCase()
        );
        const product = exactMatch || products[0];
        
        resolve(formatSneaksResult(product, sku, !!exactMatch));
      });
    });
  });
}

/**
 * Format Sneaks API result to our standard format
 */
function formatSneaksResult(product, querySku, exactMatch) {
  if (!product) return null;

  return {
    brand: product.brand || extractBrandFromSneaks(product),
    name: product.shoeName || product.name || '',
    model: extractModelFromSneaks(product),
    colorway: product.colorway || '',
    category: 'sneakers',
    sku: product.styleID || querySku,
    source: 'sneaks',
    exactMatch,
    raw: {
      retailPrice: product.retailPrice,
      releaseDate: product.releaseDate,
      thumbnail: product.thumbnail,
      resellLinks: product.resellLinks,
      lowestResellPrice: product.lowestResellPrice
    }
  };
}

/**
 * Extract brand from Sneaks product
 */
function extractBrandFromSneaks(product) {
  if (product.brand) return product.brand;
  
  const name = (product.shoeName || product.name || '').toUpperCase();
  
  if (name.includes('JORDAN') || name.includes('AIR JORDAN')) return 'Jordan';
  if (name.includes('NIKE') || name.includes('DUNK') || name.includes('AIR FORCE') || name.includes('AIR MAX')) return 'Nike';
  if (name.includes('ADIDAS') || name.includes('YEEZY')) return 'Adidas';
  if (name.includes('NEW BALANCE')) return 'New Balance';
  
  return null;
}

/**
 * Extract model from Sneaks product
 */
function extractModelFromSneaks(product) {
  const name = product.shoeName || product.name || '';
  
  // Common patterns
  const patterns = [
    /\b(Dunk (?:Low|High|Mid))\b/i,
    /\b(Air Force 1)\b/i,
    /\b(Air Max \d+)\b/i,
    /\b(Jordan \d+(?: Retro)?)\b/i,
    /\b(Yeezy (?:Boost )?\d+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) return match[1];
  }

  return null;
}
