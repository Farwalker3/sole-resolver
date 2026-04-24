import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

import healthRoutes from './routes/health.js';
import resolveRoutes from './routes/resolve.js';
import ocrRoutes from './routes/ocr.js';
import { initCache } from './db/cache.js';

dotenv.config();

const MAX_UPLOAD_SIZE = 20971520;

const fastify = Fastify({
  logger: true,
  bodyLimit: MAX_UPLOAD_SIZE
});

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

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
