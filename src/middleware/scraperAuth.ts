import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to verify ROOKIE_API_KEY (protects admin, scraper, and lead routes)
 */
export function verifyApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];

  if (!config.rookieApiKey) {
    if (config.nodeEnv === 'production') {
      logger.error('ROOKIE_API_KEY not configured in production');
      res.status(500).json({ success: false, error: 'API key not configured' });
      return;
    }
    logger.warn('ROOKIE_API_KEY not configured, allowing request in non-production');
    next();
    return;
  }

  if (!apiKey || typeof apiKey !== 'string') {
    logger.warn('Missing API key');
    res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    return;
  }

  const expected = Buffer.from(config.rookieApiKey);
  const provided = Buffer.from(apiKey);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    logger.warn('Invalid API key');
    res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    return;
  }

  next();
}

// Backwards-compatible alias
export const verifyScraperApiKey = verifyApiKey;
