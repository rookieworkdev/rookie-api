import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { verifyApiKey } from '../middleware/scraperAuth.js';
import { evaluateInterviewRecording } from '../services/aiService.js';
import { logger } from '../utils/logger.js';

const router: Router = Router();

const EvaluateRequestSchema = z.object({
  recordingUrl: z.string().url(),
  question: z.string().min(1),
  candidateProfile: z.string(),
});

/**
 * POST /api/interview/evaluate
 * Transcribes an interview recording and evaluates it with AI.
 */
router.post('/evaluate', verifyApiKey, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const parseResult = EvaluateRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: parseResult.error.errors.map(e => e.message).join(', '),
    });
    return;
  }

  const { recordingUrl, question, candidateProfile } = parseResult.data;

  try {
    const result = await evaluateInterviewRecording(recordingUrl, question, candidateProfile);

    res.json({
      success: true,
      transcript: result.transcript,
      evaluation: result.evaluation,
      processingTime: Date.now() - startTime,
    });
  } catch (error) {
    logger.error('Interview evaluation endpoint error', error as Error);
    res.status(500).json({
      success: false,
      error: 'Interview evaluation failed',
    });
  }
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'interview' });
});

export default router;
