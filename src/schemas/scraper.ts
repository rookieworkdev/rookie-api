import { z } from 'zod';

// Schema for raw Indeed job from Apify
export const RawIndeedJobSchema = z.object({
  id: z.string(),
  positionName: z.string(),
  company: z.string(),
  location: z.string().optional().default(''),
  description: z.string().optional().default(''),
  url: z.string().url(),
  externalApplyLink: z.string().optional(),
  postingDateParsed: z.string().optional(),
  postedAt: z.string().optional(),
  jobType: z.array(z.string()).optional(),
  salary: z.string().optional(),
});

export type RawIndeedJobType = z.infer<typeof RawIndeedJobSchema>;

// Schema for normalized job (common format)
export const NormalizedJobSchema = z.object({
  externalId: z.string(),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string(),
  description: z.string(),
  url: z.string().url(),
  applicationUrl: z.string().optional(),
  postedAt: z.string().optional(),
  jobType: z.string().optional(),
  salary: z.string().optional(),
  source: z.enum(['indeed', 'linkedin', 'arbetsformedlingen']),
  rawData: z.record(z.unknown()),
});

export type NormalizedJobType = z.infer<typeof NormalizedJobSchema>;

// Schema for AI job evaluation response
export const JobEvaluationResultSchema = z.object({
  isValid: z.boolean(),
  score: z.number().min(0).max(100),
  category: z.string(),
  experience: z.string(),
  experience_logic: z.string(),
  reasoning: z.string(),
  applicationEmail: z.string(),
  duration: z.string(),
});

export type JobEvaluationResultType = z.infer<typeof JobEvaluationResultSchema>;

// Schema for scraper run request
export const ScraperRunRequestSchema = z.object({
  keywords: z.string().optional(),
  exclusionKeywords: z.array(z.string()).optional(),
  country: z.string().optional().default('SE'),
  maxItems: z.number().min(1).max(500).optional().default(50),
});

export type ScraperRunRequestType = z.infer<typeof ScraperRunRequestSchema>;

// Validation helpers
export function parseRawIndeedJobs(data: unknown[]): z.infer<typeof RawIndeedJobSchema>[] {
  const results: z.infer<typeof RawIndeedJobSchema>[] = [];

  for (const item of data) {
    const parsed = RawIndeedJobSchema.safeParse(item);
    if (parsed.success) {
      results.push(parsed.data);
    }
  }

  return results;
}

export function parseJobEvaluationResult(data: unknown): z.infer<typeof JobEvaluationResultSchema> | null {
  const parsed = JobEvaluationResultSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
