import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { verifyApiKey } from '../middleware/scraperAuth.js';
import { evaluateInterviewRecording, generateInterviewQuestions, translateInterviewQuestions } from '../services/aiService.js';
import { logger } from '../utils/logger.js';
import { sendCriticalErrorAlert } from '../services/emailService.js';

const router: Router = Router();

const EvaluateRequestSchema = z.object({
  recordingUrl: z.string().url(),
  question: z.string().min(1),
  candidateProfile: z.string(),
  profileClaim: z.string().nullable().optional(),
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

  const { recordingUrl, question, candidateProfile, profileClaim } = parseResult.data;

  try {
    const result = await evaluateInterviewRecording(recordingUrl, question, candidateProfile, profileClaim ?? null);

    res.json({
      success: true,
      transcript: result.transcript,
      evaluation: result.evaluation,
      processingTime: Date.now() - startTime,
    });
  } catch (error) {
    logger.error('Interview evaluation endpoint error', error as Error);
    sendCriticalErrorAlert('Interview Evaluation', error, {
      endpoint: '/api/interview/evaluate',
      input: { question: question.slice(0, 100) },
      processingTime: Date.now() - startTime,
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({
      success: false,
      error: 'Interview evaluation failed',
    });
  }
});

const GenerateQuestionsRequestSchema = z.object({
  questionCount: z.number().min(1).max(30),
  serviceType: z.string().min(1),
  profile: z.object({
    headline: z.string().nullable(),
    bio: z.string().nullable(),
    experienceLevel: z.string().nullable(),
    roleCategories: z.array(z.string()),
    skills: z.array(z.object({
      skillName: z.string(),
      level: z.string().nullable(),
      years: z.number().nullable(),
    })),
    strengths: z.array(z.string()),
    languageSwedish: z.string().nullable(),
    languageEnglish: z.string().nullable(),
    additionalLanguages: z.array(z.object({
      language: z.string(),
      proficiency: z.string().nullable(),
    })),
    education: z.array(z.object({
      school: z.string(),
      degree: z.string().nullable(),
      fieldOfStudy: z.string().nullable(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      isCurrent: z.boolean(),
    })),
    experience: z.array(z.object({
      companyName: z.string(),
      title: z.string().nullable(),
      description: z.string().nullable(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      isCurrent: z.boolean(),
    })),
    preferredWorkTasks: z.array(z.string()),
    interviewLanguage: z.string().nullable().default(null),
  }),
});

/**
 * POST /api/interview/generate-questions
 * Generate personalized interview questions from a candidate's profile.
 */
router.post('/generate-questions', verifyApiKey, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const parseResult = GenerateQuestionsRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: parseResult.error.errors.map(e => e.message).join(', '),
    });
    return;
  }

  const { questionCount, serviceType, profile } = parseResult.data;

  try {
    const result = await generateInterviewQuestions(questionCount, serviceType, profile);

    if (!result) {
      res.status(500).json({
        success: false,
        error: 'Question generation failed',
      });
      return;
    }

    res.json({
      success: true,
      questions: result.questions,
      processingTime: Date.now() - startTime,
    });
  } catch (error) {
    logger.error('Interview question generation endpoint error', error as Error);
    sendCriticalErrorAlert('Interview Question Generation', error, {
      endpoint: '/api/interview/generate-questions',
      input: { serviceType, questionCount },
      processingTime: Date.now() - startTime,
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({
      success: false,
      error: 'Interview question generation failed',
    });
  }
});

const TranslateQuestionsRequestSchema = z.object({
  questions: z.array(z.object({
    id: z.string(),
    question: z.string(),
  })),
  targetLanguage: z.string().min(1),
});

/**
 * POST /api/interview/translate-questions
 * Translate interview questions to a target language.
 */
router.post('/translate-questions', verifyApiKey, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const parseResult = TranslateQuestionsRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: parseResult.error.errors.map(e => e.message).join(', '),
    });
    return;
  }

  const { questions, targetLanguage } = parseResult.data;

  try {
    const result = await translateInterviewQuestions(questions, targetLanguage);

    if (!result) {
      res.status(500).json({
        success: false,
        error: 'Translation failed',
      });
      return;
    }

    res.json({
      success: true,
      questions: result,
      processingTime: Date.now() - startTime,
    });
  } catch (error) {
    logger.error('Interview question translation endpoint error', error as Error);
    sendCriticalErrorAlert('Interview Translation', error, {
      endpoint: '/api/interview/translate-questions',
      input: { targetLanguage, questionCount: questions.length },
      processingTime: Date.now() - startTime,
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({
      success: false,
      error: 'Translation failed',
    });
  }
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'interview' });
});

export default router;
