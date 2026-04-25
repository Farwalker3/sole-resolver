import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
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
let googleDocPromise = null;

function buildMissingGoogleSheetsError() {
  const missing = [];
  if (!String(process.env.GOOGLE_SHEET_ID || '').trim()) {
    missing.push('GOOGLE_SHEET_ID');
  }
  if (!String(process.env.GOOGLE_CREDENTIALS_BASE64 || '').trim()) {
    missing.push('GOOGLE_CREDENTIALS_BASE64');
  }

  const error = new Error(
    missing.length
      ? `Google Sheets export is not configured. Set ${missing.join(' and ')}.`
      : 'Google Sheets export is not configured.'
  );
  error.statusCode = 503;
  return error;
}

function getGoogleCredentials() {
  const sheetId = String(process.env.GOOGLE_SHEET_ID || '').trim();
  const credentialsBase64 = String(process.env.GOOGLE_CREDENTIALS_BASE64 || '').trim();

  if (!sheetId || !credentialsBase64) {
    throw buildMissingGoogleSheetsError();
  }

  let credentialsJson;
  try {
    credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf8');
  } catch {
    const error = new Error('GOOGLE_CREDENTIALS_BASE64 is not valid base64.');
    error.statusCode = 503;
    throw error;
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    const error = new Error('GOOGLE_CREDENTIALS_BASE64 did not decode to valid JSON credentials.');
    error.statusCode = 503;
    throw error;
  }

  return { sheetId, credentials };
}

async function getGoogleDoc() {
  if (!googleDocPromise) {
    googleDocPromise = (async () => {
      const { sheetId, credentials } = getGoogleCredentials();
      const doc = new GoogleSpreadsheet(sheetId);
      await doc.useServiceAccountAuth(credentials);
      await doc.loadInfo();
      return doc;
    })().catch(error => {
      googleDocPromise = null;
      throw error;
    });
  }

  return googleDocPromise;
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

async function appendExportRow(row) {
  const doc = await getGoogleDoc();
  let sheet = doc.sheetsByTitle[EXPORT_SHEET_TITLE];

  if (!sheet) {
    sheet = await doc.addSheet({ title: EXPORT_SHEET_TITLE, headerValues: EXPORT_HEADERS });
  }

  await sheet.loadHeaderRow().catch(() => {});
  if (!sheet.headerValues || sheet.headerValues.length === 0) {
    await sheet.setHeaderRow(EXPORT_HEADERS);
  }

  await sheet.addRow(row);
  return { sheetTitle: sheet.title };
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
    const row = normalizeExportRow(request.body || {});
    const result = await appendExportRow(row);

    return reply.send({
      success: true,
      message: 'Exported sneaker data to Google Sheets.',
      sheet: result.sheetTitle,
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
