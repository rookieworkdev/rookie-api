import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger, getErrorMessage } from '../utils/logger.js';
import { verifyApiKey } from '../middleware/scraperAuth.js';
import { scoreMatchBatch } from '../services/aiService.js';

const router: Router = Router();

const MatchPairSchema = z.object({
  pairId: z.string().min(1),
  candidateHeadline: z.string().nullable(),
  candidateSkills: z.array(z.string()),
  recentExperienceTitles: z.array(z.string()),
  jobTitle: z.string().min(1),
  jobDescriptionExcerpt: z.string().nullable(),
});

const ScoreBatchRequestSchema = z.object({
  pairs: z.array(MatchPairSchema).min(1).max(25),
});

/**
 * POST /api/matching/score-batch
 * Score up to 25 candidate-job pairs for semantic relevance using AI.
 * Returns [{pairId, score, reason}] for each pair.
 */
router.post('/score-batch', verifyApiKey, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const parseResult = ScoreBatchRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.errors.map((e) => e.message).join(', '),
      });
    }

    const { pairs } = parseResult.data;

    const results = await scoreMatchBatch(pairs);

    const processingTime = Date.now() - startTime;

    logger.info('Match score-batch request complete', {
      inputCount: pairs.length,
      outputCount: results.length,
      processingTime,
    });

    return res.status(200).json({
      success: true,
      results,
      processingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error('Match score-batch request failed', error, { processingTime });

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      processingTime,
    });
  }
});

export default router;
