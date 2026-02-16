import { extractTextFromImage, isOcrConfigured } from '../services/ocr.js';
import { resolve } from '../resolvers/index.js';
import { validateImageData } from '../utils/validation.js';

export default async function ocrRoutes(fastify) {
  /**
   * POST /ocr
   * Extract text from a shoe tag image
   */
  fastify.post('/ocr', {
    schema: {
      body: {
        type: 'object',
        required: ['image'],
        properties: {
          image: { type: 'string' },
          auto_resolve: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request, reply) => {
    // Check if OCR is configured
    if (!isOcrConfigured()) {
      return reply.status(503).send({
        success: false,
        error: 'OCR service not configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS_BASE64.'
      });
    }

    const { image, auto_resolve } = request.body;

    // Validate image data
    const validation = validateImageData(image);
    if (!validation.valid) {
      return reply.status(400).send({
        success: false,
        error: validation.error
      });
    }

    try {
      // Extract text from image
      const ocrResult = await extractTextFromImage(image);
      
      if (!ocrResult.success) {
        return reply.status(400).send(ocrResult);
      }

      // If auto_resolve is enabled and we found a SKU, resolve it
      if (auto_resolve && ocrResult.extracted.sku) {
        const resolveResult = await resolve(ocrResult.extracted.sku);
        
        return {
          success: true,
          ocr: ocrResult,
          resolved: resolveResult.success ? resolveResult : null
        };
      }

      return ocrResult;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'OCR processing failed'
      });
    }
  });

  /**
   * POST /scan
   * All-in-one endpoint: OCR + Resolve + Return complete result
   * Designed for mobile app usage
   */
  fastify.post('/scan', {
    schema: {
      body: {
        type: 'object',
        required: ['image'],
        properties: {
          image: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    if (!isOcrConfigured()) {
      return reply.status(503).send({
        success: false,
        error: 'OCR service not configured'
      });
    }

    const { image } = request.body;

    const validation = validateImageData(image);
    if (!validation.valid) {
      return reply.status(400).send({
        success: false,
        error: validation.error
      });
    }

    try {
      // Step 1: OCR
      const ocrResult = await extractTextFromImage(image);
      
      if (!ocrResult.success) {
        return {
          success: false,
          step_failed: 'ocr',
          error: ocrResult.error
        };
      }

      // Step 2: Check if we found a SKU
      if (!ocrResult.extracted.sku) {
        return {
          success: false,
          step_failed: 'sku_extraction',
          error: 'No SKU detected in image',
          raw_text: ocrResult.raw_text,
          us_size: ocrResult.extracted.us_size
        };
      }

      // Step 3: Resolve the SKU
      const resolveResult = await resolve(ocrResult.extracted.sku);

      return {
        success: resolveResult.success,
        sku: ocrResult.extracted.sku,
        us_size: ocrResult.extracted.us_size,
        brand_hint: ocrResult.extracted.brand_hint,
        resolved: resolveResult.success ? resolveResult.resolved : null,
        confidence: resolveResult.confidence,
        source: resolveResult.source,
        raw_text: ocrResult.raw_text
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Scan processing failed'
      });
    }
  });
}
