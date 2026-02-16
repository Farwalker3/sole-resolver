import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';

import healthRoutes from './routes/health.js';
import resolveRoutes from './routes/resolve.js';
import ocrRoutes from './routes/ocr.js';
import { initCache } from './db/cache.js';

dotenv.config();

const fastify = Fastify({
  logger: {
    transport: process.env.NODE_ENV === 'development' 
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined
  }
});

// Plugins
await fastify.register(cors, { origin: true });
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

// Initialize database cache
initCache();

// Routes
await fastify.register(healthRoutes);
await fastify.register(resolveRoutes);
await fastify.register(ocrRoutes);

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
    fastify.log.info(`Sole Resolver API running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
