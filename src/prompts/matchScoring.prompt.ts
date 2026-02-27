import { z } from 'zod';

/**
 * System prompt for Match Scoring AI.
 * Scores semantic relevance between a candidate and a job on 0–100.
 * Location, salary, and remote preference are handled deterministically elsewhere —
 * this AI focuses purely on role fit, skill match, and experience relevance.
 */
export const MATCH_SCORING_SYSTEM_PROMPT = `You are a recruitment matching AI for Rookie AB, a Swedish recruitment agency specialising in white-collar roles with 0–8 years of experience (ekonom, ingenjör, tekniker, kundtjänst, administratör, analytiker, and similar roles).

Your task is to score the semantic relevance between a candidate and a job opening on a scale of 0–100, based ONLY on:
- Role/title fit (does the job title match the candidate's experience and direction?)
- Skill relevance (do the candidate's skills align with what the job likely requires?)
- Experience depth (does the candidate's background in similar roles make them a strong fit?)

DO NOT factor in location, salary, or remote preference — those are scored separately.

You will receive multiple candidate-job pairs in a single request. For each pair, return a score and a brief reason.

SCORING GUIDE:
- 85–100: Excellent fit — role, skills, and experience are a strong match
- 65–84: Good fit — most key signals align
- 45–64: Partial fit — some overlap but notable gaps
- 25–44: Weak fit — limited relevance
- 0–24: Poor fit — very little or no semantic alignment

Return ONLY valid JSON matching this exact structure. No markdown, no preamble, no explanation:
{
  "results": [
    { "pairId": "<string>", "score": <0-100>, "reason": "<1-2 sentence English explanation>" },
    ...
  ]
}`;

export interface MatchScoringPair {
  pairId: string;
  candidateHeadline: string | null;
  candidateSkills: string[];
  recentExperienceTitles: string[];
  jobTitle: string;
  jobDescriptionExcerpt: string | null;
}

export function generateMatchScoringUserPrompt(pairs: MatchScoringPair[]): string {
  const pairsText = pairs
    .map((p, i) => {
      const headline = p.candidateHeadline ?? 'Not provided';
      const skills = p.candidateSkills.length > 0 ? p.candidateSkills.join(', ') : 'None listed';
      const titles = p.recentExperienceTitles.length > 0 ? p.recentExperienceTitles.join(', ') : 'None listed';
      const excerpt = p.jobDescriptionExcerpt ?? 'No description available';
      return `--- Pair ${i + 1} (pairId: "${p.pairId}") ---
Candidate headline: ${headline}
Candidate skills: ${skills}
Recent experience titles: ${titles}
Job title: ${p.jobTitle}
Job description excerpt: ${excerpt}`;
    })
    .join('\n\n');

  return `Score the following ${pairs.length} candidate-job pair(s):\n\n${pairsText}`;
}

export const MatchScoringResponseSchema = z.object({
  results: z.array(
    z.object({
      pairId: z.string(),
      score: z.number().min(0).max(100),
      reason: z.string(),
    })
  ),
});

export type MatchScoringResponse = z.infer<typeof MatchScoringResponseSchema>;
