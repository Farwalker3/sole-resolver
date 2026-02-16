/**
 * Sneaker Catalog App (Google Apps Script)
 * Updated to use Sole Resolver API
 * 
 * Sheet columns (A:L):
 * A Sneaker | B SKU | C US Size | D Condition | E Purchase Price | F Purchase Source
 * G Date Added | H Sold Price | I Sold To | J Sold Date | K Profit | L Days to Sell
 */

const CONFIG = {
  // If you want to hard-pin the spreadsheet, paste its ID here. Otherwise it uses the container-bound sheet.
  SPREADSHEET_ID: "",

  // Sole Resolver API endpoint (your deployed API)
  // Update this after deploying to Railway/Render
  SOLE_RESOLVER_URL: "https://your-sole-resolver.railway.app",

  // Column indexes (1-based)
  COL: {
    SNEAKER: 1,
    SKU: 2,
    US_SIZE: 3,
    CONDITION: 4,
    PURCHASE_PRICE: 5,
    PURCHASE_SOURCE: 6,
    DATE_ADDED: 7,
    SOLD_PRICE: 8,
    SOLD_TO: 9,
    SOLD_DATE: 10,
    PROFIT: 11,
    DAYS_TO_SELL: 12,
  }
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("Sneaker Catalog")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSheetUrl_() {
  const ss = getSpreadsheet_();
  return ss.getUrl();
}

function getCurrentMonthSheet_() {
  const ss = getSpreadsheet_();
  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];
  const now = new Date();
  const name = `${months[now.getMonth()]} ${now.getFullYear()}`;
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const headers = [
      "Sneaker","SKU","US Size","Condition","Purchase Price","Purchase Source",
      "Date Added","Sold Price","Sold To","Sold Date","Profit","Days to Sell"
    ];
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return sh;
}

function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.trim()) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID.trim());
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getScriptProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setScriptProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

/**
 * Save the Sole Resolver API URL
 */
function setSoleResolverUrl(url) {
  setScriptProp_("SOLE_RESOLVER_URL", url);
  return true;
}

/**
 * Get the configured Sole Resolver URL
 */
function getSoleResolverUrl() {
  return getScriptProp_("SOLE_RESOLVER_URL") || CONFIG.SOLE_RESOLVER_URL;
}

/**
 * Look up sneaker details by SKU using Sole Resolver API
 * Returns { title, sku, brand, model, colorway } or null
 */
function lookupSneakerBySku(sku) {
  const baseUrl = getSoleResolverUrl();
  if (!baseUrl || baseUrl === "https://your-sole-resolver.railway.app") {
    throw new Error("Sole Resolver API not configured. Open Settings and enter your API URL.");
  }

  const url = `${baseUrl}/resolve`;
  
  try {
    const resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ query: sku }),
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      console.log(`Sole Resolver failed: ${resp.getContentText()}`);
      return null;
    }

    const data = JSON.parse(resp.getContentText());
    
    if (!data.success || !data.resolved) {
      return null;
    }

    return {
      title: data.resolved.name || "",
      sku: sku,
      brand: data.resolved.brand || "",
      model: data.resolved.model || "",
      colorway: data.resolved.colorway || "",
      confidence: data.confidence || 0
    };
  } catch (error) {
    console.log(`Lookup error: ${error.message}`);
    return null;
  }
}

/**
 * Process image through Sole Resolver OCR + Resolve
 * Returns { sku, usSize, sneakerName, brand, model, colorway } or error
 */
function processImageWithOcr(imageBase64) {
  const baseUrl = getSoleResolverUrl();
  if (!baseUrl || baseUrl === "https://your-sole-resolver.railway.app") {
    throw new Error("Sole Resolver API not configured. Open Settings and enter your API URL.");
  }

  const url = `${baseUrl}/scan`;
  
  try {
    const resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ image: imageBase64 }),
      muteHttpExceptions: true
    });

    const data = JSON.parse(resp.getContentText());
    
    if (resp.getResponseCode() !== 200) {
      return {
        success: false,
        error: data.error || "OCR request failed"
      };
    }

    return {
      success: data.success,
      sku: data.sku || null,
      usSize: data.us_size || null,
      sneakerName: data.resolved?.name || null,
      brand: data.resolved?.brand || data.brand_hint || null,
      model: data.resolved?.model || null,
      colorway: data.resolved?.colorway || null,
      confidence: data.confidence || 0,
      rawText: data.raw_text || "",
      error: data.error || null
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Adds a row for a new sneaker.
 * payload: { sneaker, sku, usSize, condition }
 */
function addSneakerRow(payload) {
  const sh = getCurrentMonthSheet_();
  const lastRow = Math.max(sh.getLastRow(), 1);
  const nextRow = lastRow + 1;
  const dateAdded = new Date();

  const row = [];
  row[CONFIG.COL.SNEAKER - 1] = payload.sneaker || "";
  row[CONFIG.COL.SKU - 1] = payload.sku || "";
  row[CONFIG.COL.US_SIZE - 1] = payload.usSize || "";
  row[CONFIG.COL.CONDITION - 1] = payload.condition || "";
  row[CONFIG.COL.PURCHASE_PRICE - 1] = "";
  row[CONFIG.COL.PURCHASE_SOURCE - 1] = "";
  row[CONFIG.COL.DATE_ADDED - 1] = dateAdded;
  row[CONFIG.COL.SOLD_PRICE - 1] = "";
  row[CONFIG.COL.SOLD_TO - 1] = "";
  row[CONFIG.COL.SOLD_DATE - 1] = "";
  row[CONFIG.COL.PROFIT - 1] = "";
  row[CONFIG.COL.DAYS_TO_SELL - 1] = "";

  sh.getRange(nextRow, 1, 1, 12).setValues([row]);
  sortSoldToTop_();

  return { ok: true, sheetUrl: getSheetUrl_(), monthTab: sh.getName(), row: nextRow };
}

function sortSoldToTop_() {
  const sh = getCurrentMonthSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow <= 1) return;

  const range = sh.getRange(2, 1, lastRow - 1, 12);
  range.sort([
    { column: CONFIG.COL.SOLD_DATE, ascending: false },
    { column: CONFIG.COL.DATE_ADDED, ascending: false }
  ]);
}

/**
 * Simple helper for the UI so the user can open the sheet anytime.
 */
function getAppLinks() {
  const sh = getCurrentMonthSheet_();
  return {
    sheetUrl: getSheetUrl_(),
    currentMonthTab: sh.getName()
  };
}

/**
 * Check if the API is configured and reachable
 */
function checkApiStatus() {
  const baseUrl = getSoleResolverUrl();
  if (!baseUrl || baseUrl === "https://your-sole-resolver.railway.app") {
    return { configured: false, reachable: false };
  }

  try {
    const resp = UrlFetchApp.fetch(`${baseUrl}/health`, {
      method: "get",
      muteHttpExceptions: true
    });
    return {
      configured: true,
      reachable: resp.getResponseCode() === 200
    };
  } catch (e) {
    return { configured: true, reachable: false };
  }
}
