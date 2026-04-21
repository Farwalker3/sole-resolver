import { extractTextFromImage, isOcrConfigured } from '../services/ocr.js';
import { resolve } from '../resolvers/index.js';
import { validateImageData } from '../utils/validation.js';

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === undefined || value === null) {
    return false;
  }

  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function getBoundary(contentType) {
  const match = /boundary=([^;]+)/i.exec(contentType || '');
  return match ? match[1].replace(/^"|"$/g, '') : null;
}

async function readRequestBuffer(request) {
  const chunks = [];
  for await (const chunk of request.raw) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseMultipartBody(buffer, boundary) {
  const bodyText = buffer.toString('latin1');
  const boundaryToken = '--' + boundary;
  const sections = bodyText.split(boundaryToken);
  const fields = {};
  let file = null;

  for (const section of sections) {
    let part = section;
    if (!part || part === '--
' || part === '--') {
      continue;
    }

    if (part.startsWith('
')) {
      part = part.slice(2);
    }

    if (part.startsWith('--')) {
      continue;
    }

    const separatorIndex = part.indexOf('

');
    if (separatorIndex === -1) {
      continue;
    }

    const headerText = part.slice(0, separatorIndex);
    let valueText = part.slice(separatorIndex + 4);

    if (valueText.endsWith('
')) {
      valueText = valueText.slice(0, -2);
    }

    const headers = {};
    for (const line of headerText.split('
')) {
      const idx = line.indexOf(':');
      if (idx > -1) {
        headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
      }
    }

    const disposition = headers['content-disposition'] || '';
    const nameMatch = disposition.match(/name="([^"]+)"/i);
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    const fieldName = nameMatch ? nameMatch[1] : null;

    if (filenameMatch) {
      file = {
        fieldName,
        filename: filenameMatch[1],
        contentType: headers['content-type'] || 'application/octet-stream',
        buffer: Buffer.from(valueText, 'latin1')
      };
    } else if (fieldName) {
      fields[fieldName] = valueText;
    }
  }

  return { fields, file };
}

async function readImagePayload(request) {
  const contentType = String(request.headers['content-type'] || '');

  if (contentType.includes('multipart/form-data')) {
    const boundary = getBoundary(contentType);
    if (!boundary) {
      return { error: 'Malformed multipart request' };
    }

    const buffer = await readRequestBuffer(request);
    const { fields, file } = parseMultipartBody(buffer, boundary);

    if (!file || !file.buffer || !file.buffer.length) {
      return { error: 'Image file is required' };
    }

    return {
      image: {
        buffer: file.buffer,
        mimeType: file.contentType,
        filename: file.filename
      },
      autoResolve: parseBoolean(fields.auto_resolve || fields.autoResolve)
    };
  }

  const body = request.body || {};
  return {
    image: body.image,
    autoResolve: parseBoolean(body.auto_resolve || body.autoResolve)
  };
}

function buildCopyText({ extracted, resolved, rawText }) {
  const lines = [];
  const resolvedBrand = resolved && resolved.brand ? resolved.brand : null;
  const resolvedName = resolved && resolved.name ? resolved.name : null;
  const resolvedModel = resolved && resolved.model ? resolved.model : null;
  const resolvedColorway = resolved && resolved.colorway ? resolved.colorway : null;
  const brandHint = extracted && extracted.brand_hint ? extracted.brand_hint : null;
  const sku = extracted && extracted.sku ? extracted.sku : null;
  const usSize = extracted && extracted.us_size ? extracted.us_size : null;

  if (resolvedBrand || brandHint) {
    lines.push('Brand: ' + (resolvedBrand || brandHint));
  }

  if (resolvedName) {
    lines.push('Name: ' + resolvedName);
  }

  if (resolvedModel) {
    lines.push('Model: ' + resolvedModel);
  }

  if (resolvedColorway) {
    lines.push('Colorway: ' + resolvedColorway);
  }

  if (sku) {
    lines.push('SKU: ' + sku);
  }

  if (usSize) {
    lines.push('US Size: ' + usSize);
  }

  if (rawText) {
    if (lines.length) {
      lines.push('');
    }
    lines.push('Raw OCR Text:');
    lines.push(rawText.trim());
  }

  return lines.join('
').trim();
}

function buildResolvedResponse({ ocrResult, resolvedResult, resolvedError }) {
  const resolved = resolvedResult && resolvedResult.success ? resolvedResult.resolved : null;
  const responseText = buildCopyText({
    extracted: ocrResult.extracted,
    resolved,
    rawText: ocrResult.raw_text || ''
  });

  const response = {
    success: true,
    ocr_success: true,
    resolved_success: Boolean(resolved),
    sku: ocrResult.extracted ? ocrResult.extracted.sku : null,
    us_size: ocrResult.extracted ? ocrResult.extracted.us_size : null,
    brand_hint: ocrResult.extracted ? ocrResult.extracted.brand_hint : null,
    resolved,
    confidence: resolvedResult && resolvedResult.success ? resolvedResult.confidence : null,
    source: resolvedResult && resolvedResult.success ? resolvedResult.source : null,
    raw_text: ocrResult.raw_text || '',
    text: responseText,
    copy_text: responseText,
    extracted: ocrResult.extracted || {}
  };

  if (resolvedError) {
    response.resolve_error = resolvedError;
  }

  return response;
}

export default async function ocrRoutes(fastify) {
  fastify.post('/ocr', async (request, reply) => {
    if (!isOcrConfigured()) {
      return reply.status(503).send({
        success: false,
        error: 'OCR service not configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS_BASE64.'
      });
    }

    const payload = await readImagePayload(request);
    if (payload.error) {
      return reply.status(400).send({
        success: false,
        error: payload.error
      });
    }

    const validation = validateImageData(payload.image);
    if (!validation.valid) {
      return reply.status(400).send({
        success: false,
        error: validation.error
      });
    }

    try {
      const ocrResult = await extractTextFromImage(payload.image);

      if (!ocrResult.success) {
        return reply.status(400).send({
          success: false,
          error: ocrResult.error
        });
      }

      let resolvedResult = null;
      let resolvedError = null;

      if (payload.autoResolve && ocrResult.extracted && ocrResult.extracted.sku) {
        resolvedResult = await resolve(ocrResult.extracted.sku);
        if (!resolvedResult.success) {
          resolvedError = resolvedResult.error || 'No match found';
        }
      }

      return reply.send(buildResolvedResponse({
        ocrResult,
        resolvedResult,
        resolvedError
      }));
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'OCR processing failed'
      });
    }
  });

  fastify.post('/scan', async (request, reply) => {
    if (!isOcrConfigured()) {
      return reply.status(503).send({
        success: false,
        error: 'OCR service not configured'
      });
    }

    const payload = await readImagePayload(request);
    if (payload.error) {
      return reply.status(400).send({
        success: false,
        error: payload.error
      });
    }

    const validation = validateImageData(payload.image);
    if (!validation.valid) {
      return reply.status(400).send({
        success: false,
        error: validation.error
      });
    }

    try {
      const ocrResult = await extractTextFromImage(payload.image);

      if (!ocrResult.success) {
        return reply.status(400).send({
          success: false,
          step_failed: 'ocr',
          error: ocrResult.error
        });
      }

      if (!ocrResult.extracted || !ocrResult.extracted.sku) {
        const responseText = buildCopyText({
          extracted: ocrResult.extracted,
          rawText: ocrResult.raw_text || ''
        });

        return reply.send({
          success: true,
          resolved_success: false,
          step_failed: 'sku_extraction',
          error: 'No SKU detected in image',
          sku: null,
          us_size: ocrResult.extracted ? ocrResult.extracted.us_size : null,
          brand_hint: ocrResult.extracted ? ocrResult.extracted.brand_hint : null,
          resolved: null,
          confidence: null,
          source: null,
          raw_text: ocrResult.raw_text || '',
          text: responseText,
          copy_text: responseText,
          extracted: ocrResult.extracted || {}
        });
      }

      const resolveResult = await resolve(ocrResult.extracted.sku);
      const resolved = resolveResult.success ? resolveResult.resolved : null;
      const responseText = buildCopyText({
        extracted: ocrResult.extracted,
        resolved,
        rawText: ocrResult.raw_text || ''
      });

      return reply.send({
        success: true,
        resolved_success: Boolean(resolved),
        sku: ocrResult.extracted.sku,
        us_size: ocrResult.extracted.us_size,
        brand_hint: ocrResult.extracted.brand_hint,
        resolved,
        confidence: resolveResult.success ? resolveResult.confidence : null,
        source: resolveResult.success ? resolveResult.source : null,
        resolve_error: resolveResult.success ? null : (resolveResult.error || 'No match found'),
        raw_text: ocrResult.raw_text || '',
        text: responseText,
        copy_text: responseText,
        extracted: ocrResult.extracted || {}
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Scan processing failed'
      });
    }
  });
}
