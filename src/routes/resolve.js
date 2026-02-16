import { resolve } from '../resolvers/index.js';
import { validateSkuQuery } from '../utils/validation.js';

export default async function resolveRoutes(fastify) {
  /**
   * POST /resolve
   * Resolve a SKU to sneaker metadata
   */
  fastify.post('/resolve', {
    schema: {
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { query } = request.body;

    // Validate input
    const validation = validateSkuQuery(query);
    if (!validation.valid) {
      return reply.status(400).send({
        success: false,
        error: validation.error
      });
    }

    try {
      const result = await resolve(validation.normalized);
      return result;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Resolution failed'
      });
    }
  });

  /**
   * GET /resolve/:sku
   * Alternative GET endpoint for quick lookups
   */
  fastify.get('/resolve/:sku', async (request, reply) => {
    const { sku } = request.params;

    const validation = validateSkuQuery(sku);
    if (!validation.valid) {
      return reply.status(400).send({
        success: false,
        error: validation.error
      });
    }

    try {
      const result = await resolve(validation.normalized);
      return result;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Resolution failed'
      });
    }
  });
}
