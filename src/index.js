import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { GoogleSpreadsheet } from 'google-spreadsheet';

import healthRoutes from './routes/health.js';
import resolveRoutes from './routes/resolve.js';
import ocrRoutes from './routes/ocr.js';
import { initCache } from './db/cache.js';

dotenv.config();

const MAX_UPLOAD_SIZE = 20971520;
const EXPORT_SHEET_TITLE = 'Sole Resolver Exports';
const EXPORT_HEADERS = [
  'exportedAt',
  'sneaker',
  'sku',
  'usSize',
  'condition',
  'brand',
  'name',
  'model',
  'colorway',
  'source',
  'confidence',
  'copyText',
  'rawText'
];

const fastify = Fastify({
  logger: true,
  bodyLimit: MAX_UPLOAD_SIZE
});

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const googleDocCache = new Map();
let cachedGoogleCredentials = null;
let cachedGoogleCredentialsSource = null;

function normalizeSpreadsheetId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const urlMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  return raw;
}

function buildMissingGoogleSheetsError() {
  const error = new Error('Google Sheets export is not configured. Set GOOGLE_SHEET_ID or provide spreadsheetId in the request body, and configure GOOGLE_CREDENTIALS_BASE64 or GOOGLE_APPLICATION_CREDENTIALS.');
  error.statusCode = 503;
  return error;
}

function loadGoogleCredentials() {
  const base64Credentials = String(process.env.GOOGLE_CREDENTIALS_BASE64 || '').trim();
  const credentialsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  const source = base64Credentials || credentialsPath;

  if (!source) {
    throw buildMissingGoogleSheetsError();
  }

  if (cachedGoogleCredentials && cachedGoogleCredentialsSource === source) {
    return cachedGoogleCredentials;
  }

  let raw = '';
  if (base64Credentials) {
    raw = Buffer.from(base64Credentials, 'base64').toString('utf8');
  } else if (credentialsPath) {
    raw = fs.readFileSync(credentialsPath, 'utf8');
  }

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    const error = new Error('Google credentials could not be parsed as JSON.');
    error.statusCode = 503;
    throw error;
  }

  if (!credentials || !credentials.client_email || !credentials.private_key) {
    const error = new Error('Google credentials must include client_email and private_key.');
    error.statusCode = 503;
    throw error;
  }

  cachedGoogleCredentials = credentials;
  cachedGoogleCredentialsSource = source;
  return cachedGoogleCredentials;
}

function resolveSpreadsheetId(body = {}) {
  return normalizeSpreadsheetId(
    body.spreadsheetId ||
    body.targetSpreadsheetId ||
    body.sheetId ||
    process.env.GOOGLE_SHEET_ID ||
    ''
  );
}

async function getGoogleDoc(spreadsheetId) {
  const normalizedSpreadsheetId = normalizeSpreadsheetId(spreadsheetId);
  if (!normalizedSpreadsheetId) {
    throw buildMissingGoogleSheetsError();
  }

  if (!googleDocCache.has(normalizedSpreadsheetId)) {
    googleDocCache.set(normalizedSpreadsheetId, (async () => {
      const credentials = loadGoogleCredentials();
      const doc = new GoogleSpreadsheet(normalizedSpreadsheetId);
      await doc.useServiceAccountAuth(credentials);
      await doc.loadInfo();
      return doc;
    })().catch(error => {
      googleDocCache.delete(normalizedSpreadsheetId);
      throw error;
    }));
  }

  return googleDocCache.get(normalizedSpreadsheetId);
}

function normalizeExportRow(body = {}) {
  const resolved = body.resolved && typeof body.resolved === 'object' ? body.resolved : {};
  const extracted = body.extracted && typeof body.extracted === 'object' ? body.extracted : {};

  return {
    exportedAt: body.exportedAt || new Date().toISOString(),
    sneaker: String(body.sneaker || resolved.name || body.name || extracted.sku || body.sku || '').trim(),
    sku: String(body.sku || extracted.sku || '').trim(),
    usSize: String(body.usSize || body.us_size || extracted.us_size || '').trim(),
    condition: String(body.condition || '').trim(),
    brand: String(body.brand || resolved.brand || body.brand_hint || extracted.brand_hint || '').trim(),
    name: String(body.name || resolved.name || '').trim(),
    model: String(body.model || resolved.model || '').trim(),
    colorway: String(body.colorway || resolved.colorway || '').trim(),
    source: String(body.source || '').trim(),
    confidence: typeof body.confidence === 'number' ? body.confidence : (body.confidence ? Number(body.confidence) : ''),
    copyText: String(body.copyText || body.copy_text || body.text || '').trim(),
    rawText: String(body.rawText || body.raw_text || '').trim()
  };
}

async function appendExportRow(row, spreadsheetId) {
  const doc = await getGoogleDoc(spreadsheetId);
  let sheet = doc.sheetsByTitle[EXPORT_SHEET_TITLE];

  if (!sheet) {
    sheet = await doc.addSheet({ title: EXPORT_SHEET_TITLE, headerValues: EXPORT_HEADERS });
  }

  await sheet.loadHeaderRow().catch(() => {});
  if (!sheet.headerValues || sheet.headerValues.length === 0) {
    await sheet.setHeaderRow(EXPORT_HEADERS);
  }

  await sheet.addRow(row);
  return { sheetTitle: sheet.title, spreadsheetId: normalizedSpreadsheetId }; 
}

// Plugins
await fastify.register(cors, { origin: true });
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});
await fastify.register(multipart, {
  limits: {
    fileSize: MAX_UPLOAD_SIZE
  }
});

// Initialize cache
initCache();

// Routes
await fastify.register(healthRoutes);
await fastify.register(resolveRoutes);
await fastify.register(ocrRoutes);

fastify.post('/export', async (request, reply) => {
  try {
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const spreadsheetId = resolveSpreadsheetId(body);

    if (!spreadsheetId) {
      throw buildMissingGoogleSheetsError();
    }

    const row = normalizeExportRow(body);
    const result = await appendExportRow(row, spreadsheetId);

    return reply.send({
      success: true,
      message: 'Exported sneaker data to Google Sheets.',
      sheet: result.sheetTitle,
      spreadsheetId: result.spreadsheetId,
      row
    });
  } catch (error) {
    fastify.log.error(error);

    if (error && error.statusCode) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.message || 'Google Sheets export is not configured.'
      });
    }

    return reply.status(500).send({
      success: false,
      error: 'Export failed'
    });
  }
});

// Static frontend
await fastify.register(fastifyStatic, {
  root: publicDir,
  prefix: '/',
  index: ['index.html']
});

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.status(error.statusCode || 500).send({
    success: false,
    error: error.message || 'Internal Server Error'
  });
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Sole Resolver API running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
