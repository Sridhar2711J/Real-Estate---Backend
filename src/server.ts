import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { logger } from './utils/logger';

const startServer = async () => {
  try {
    // Attempt database connection
    await connectDatabase();

    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Real Estate Backend running on http://localhost:${env.PORT}`);
      logger.info(`📚 Swagger Documentation available at http://localhost:${env.PORT}/api-docs`);
      logger.info(`🌱 Environment: ${env.NODE_ENV}`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Initiating graceful shutdown...`);
      server.close(async () => {
        await disconnectDatabase();
        logger.info('HTTP server closed.');
        process.exit(0);
      });

      // Force exit after 10 seconds if graceful shutdown hangs
      setTimeout(() => {
        logger.error('Force shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Server failed to start:', error);
    process.exit(1);
  }
};

startServer();

