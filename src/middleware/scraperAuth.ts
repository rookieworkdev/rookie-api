import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to verify scraper API key (shared by job and lead scraping routes)
 */
export function verifyScraperApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];

  if (!config.scraper.apiKey) {
    if (config.nodeEnv === 'production') {
      logger.error('Scraper API key not configured in production');
      res.status(500).json({ success: false, error: 'Scraper API key not configured' });
      return;
    }
    logger.warn('Scraper API key not configured, allowing request in non-production');
    next();
    return;
  }

  if (!apiKey || typeof apiKey !== 'string') {
    logger.warn('Missing scraper API key');
    res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    return;
  }

  const expected = Buffer.from(config.scraper.apiKey);
  const provided = Buffer.from(apiKey);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    logger.warn('Invalid scraper API key');
    res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    return;
  }

  next();
}
