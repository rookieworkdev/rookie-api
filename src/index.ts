import express, { Request, Response, NextFunction, Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import webhookRouter from './routes/webhook.js';
import jobScrapingRouter from './routes/jobScraping.js';
// Import for Express Request type augmentation (adds rawBody property)
import './middleware/webhookAuth.js';

interface ErrorWithStatus extends Error {
  status?: number;
}

const app: Application = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  })
);

// Rate limiting - 100 requests per 15 minutes per IP (skip health checks)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.path.endsWith('/health'),
});

app.use(limiter);

// Body parser middleware with raw body capture for webhook signature verification
app.use(
  express.json({
    limit: '5mb',
    verify: (req: Request, _res, buf) => {
      // Store raw body buffer for HMAC signature verification
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request processed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
    });
  });

  next();
});

// Mount routes
app.use('/api', webhookRouter);
app.use('/api/scraping/jobs', jobScrapingRouter);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'Rookie Recruitment API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      webhook: 'POST /api/webhook',
      health: 'GET /api/health',
      scraping: {
        indeed: 'POST /api/scraping/jobs/indeed',
        cleanup: 'POST /api/scraping/jobs/cleanup',
        health: 'GET /api/scraping/jobs/health',
      },
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err: ErrorWithStatus, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', err, {
    method: req.method,
    path: req.path,
  });

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: config.nodeEnv === 'production' ? 'An error occurred' : err.message,
  });
});

// Start server (only in non-serverless environments)
// Vercel and other serverless platforms will import the app directly
if (process.env.VERCEL !== '1') {
  const PORT = config.port;
  const SHUTDOWN_TIMEOUT_MS = 10000; // 10 seconds

  const server = app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`, {
      nodeEnv: config.nodeEnv,
      port: PORT,
    });
  });

  // Graceful shutdown handler
  function gracefulShutdown(signal: string) {
    logger.info(`${signal} received, shutting down gracefully`);

    // Stop accepting new connections
    server.close((err) => {
      if (err) {
        logger.error('Error during server close', err);
        process.exit(1);
      }

      logger.info('HTTP server closed, all connections drained');
      process.exit(0);
    });

    // Force exit if shutdown takes too long
    setTimeout(() => {
      logger.warn('Shutdown timeout reached, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export default app;
