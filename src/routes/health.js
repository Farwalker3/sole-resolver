export default async function healthRoutes(fastify) {
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'sole-resolver'
    };
  });
}
