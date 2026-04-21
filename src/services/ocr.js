/**
 * OCR Service - Google Cloud Vision via REST API
 */

import fs from 'node:fs';
import crypto from 'node:crypto';

import {
  extractSkusFromText,
  extractUsSize,
  detectBrandFromText
} from '../classifiers/sku-classifier.js';

let cachedCredentials = null;
let cachedCredentialsSource = null;
let cachedAccessToken = null;

function normalizeText(text) {
  return String(text || '')
    .replace(/
/g, '
')
    .replace(/[ 	]+$/gm, '')
    .replace(/
{3,}/g, '

')
    .trim();
}

function parseCredentialsFromEnv() {
  const base64Credentials = process.env.GOOGLE_CREDENTIALS_BASE64;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const source = (base64Credentials && base64Credentials.trim()) || (credentialsPath && credentialsPath.trim()) || '';

  if (!source) {
    return null;
  }

  if (cachedCredentials && cachedCredentialsSource === source) {
    return cachedCredentials;
  }

  try {
    let raw = '';

    if (base64Credentials && base64Credentials.trim()) {
      raw = Buffer.from(base64Credentials.trim(), 'base64').toString('utf8');
    } else if (credentialsPath && credentialsPath.trim()) {
      raw = fs.readFileSync(credentialsPath.trim(), 'utf8');
    }

    const credentials = JSON.parse(raw);
    if (!credentials.client_email || !credentials.private_key) {
      return null;
    }

    cachedCredentials = credentials;
    cachedCredentialsSource = source;
    return cachedCredentials;
  } catch (error) {
    console.error('Unable to load Google Cloud credentials:', error.message);
    return null;
  }
}

function normalizeImageInput(imageInput) {
  if (Buffer.isBuffer(imageInput)) {
    return { buffer: imageInput, mimeType: 'image/jpeg' };
  }

  if (imageInput && typeof imageInput === 'object' && Buffer.isBuffer(imageInput.buffer)) {
    return {
      buffer: imageInput.buffer,
      mimeType: imageInput.mimeType || imageInput.contentType || 'image/jpeg'
    };
  }

  if (typeof imageInput !== 'string') {
    throw new Error('Image data is required');
  }

  const mimeMatch = imageInput.match(/^data:(image/[a-zA-Z0-9.+-]+);base64,/);
  const base64Data = imageInput.replace(/^data:image/w+;base64,/, '');

  return {
    buffer: Buffer.from(base64Data, 'base64'),
    mimeType: mimeMatch ? mimeMatch[1] : 'image/jpeg'
  };
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function buildJwtAssertion(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const unsignedToken = base64UrlJson(header) + '.' + base64UrlJson(payload);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(credentials.private_key, 'base64url');
  return unsignedToken + '.' + signature;
}

async function getAccessToken(credentials) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60000) {
    return cachedAccessToken.token;
  }

  const assertion = buildJwtAssertion(credentials);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || ('Failed to obtain Google access token (' + response.status + ')'));
  }

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in || 3600) * 1000)
  };

  return cachedAccessToken.token;
}

async function runVisionOcr(imageInput) {
  const credentials = parseCredentialsFromEnv();
  if (!credentials) {
    throw new Error('OCR not configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS_BASE64.');
  }

  const normalizedImage = normalizeImageInput(imageInput);
  const accessToken = await getAccessToken(credentials);

  const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          image: {
            content: normalizedImage.buffer.toString('base64')
          },
          features: [
            { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
            { type: 'TEXT_DETECTION', maxResults: 1 }
          ]
        }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || ('Vision API request failed (' + response.status + ')');
    throw new Error(message);
  }

  const annotation = data?.responses?.[0] || {};
  const rawText = annotation.fullTextAnnotation?.text || annotation.textAnnotations?.[0]?.description || '';

  if (!normalizeText(rawText)) {
    throw new Error('No text detected in image');
  }

  return normalizeText(rawText);
}

export async function extractTextFromImage(imageInput) {
  if (!isOcrConfigured()) {
    return {
      success: false,
      error: 'OCR not configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS_BASE64.'
    };
  }

  try {
    const rawText = await runVisionOcr(imageInput);
    const extractedSkus = extractSkusFromText(rawText);
    const primarySku = extractedSkus[0] || null;
    const usSize = extractUsSize(rawText);
    const brandHint = detectBrandFromText(rawText) || (primarySku ? primarySku.brand : null);

    return {
      success: true,
      raw_text: rawText,
      extracted: {
        sku: primarySku ? primarySku.sku : null,
        us_size: usSize,
        brand_hint: brandHint,
        candidates: extractedSkus.slice(0, 5)
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'OCR processing failed'
    };
  }
}

export function isOcrConfigured() {
  return Boolean(
    (process.env.GOOGLE_CREDENTIALS_BASE64 && process.env.GOOGLE_CREDENTIALS_BASE64.trim()) ||
    (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_APPLICATION_CREDENTIALS.trim())
  );
}
