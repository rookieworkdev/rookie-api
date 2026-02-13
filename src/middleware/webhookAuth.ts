import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Extend Express Request to include rawBody
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

/**
 * Verifies HMAC-SHA256 signature of incoming webhook requests.
 *
 * The sender must create a signature by hashing the request body with the shared secret:
 *   signature = HMAC-SHA256(body, secret)
 *
 * The signature should be sent in the 'x-webhook-signature' header as a hex string.
 *
 * If WEBHOOK_SECRET is not configured, verification is skipped (for development).
 */
export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  // Skip verification for dry run requests (Swagger testing)
  if (req.query.dryRun === 'true') {
    next();
    return;
  }

  const secret = config.webhook.secret;

  // Skip verification if no secret is configured (development mode)
  if (!secret) {
    logger.warn('Webhook signature verification skipped - WEBHOOK_SECRET not configured');
    next();
    return;
  }

  const signature = req.headers['x-webhook-signature'];

  // Check if signature header is present
  if (!signature || typeof signature !== 'string') {
    logger.warn('Webhook request rejected - missing x-webhook-signature header', {
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Missing webhook signature',
    });
    return;
  }

  // Get raw body for signature verification
  const rawBody = req.rawBody;

  if (!rawBody) {
    logger.error('Raw body not available for signature verification');
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Unable to verify signature',
    });
    return;
  }

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  // Buffers must be same length for timingSafeEqual
  if (signatureBuffer.length !== expectedBuffer.length) {
    logger.warn('Webhook signature verification failed - length mismatch', {
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid webhook signature',
    });
    return;
  }

  const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!isValid) {
    logger.warn('Webhook signature verification failed - signature mismatch', {
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid webhook signature',
    });
    return;
  }

  logger.debug('Webhook signature verified successfully');
  next();
}
