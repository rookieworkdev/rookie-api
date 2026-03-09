import { z } from 'zod';

export const INTERVIEW_EVALUATION_SYSTEM_PROMPT = `You are an interview evaluator for Rookie AB, a Swedish recruitment agency specialising in white-collar roles with 0–8 years of experience.

Your task is to evaluate a candidate's voice interview answer. The interview's purpose is to VERIFY and CALIBRATE what the candidate entered in their profile — not to independently assess them from scratch.

You receive:
- The interview question
- The candidate's profile summary (skills, experience, languages they claim)
- The audio recording of their answer

You must:
1. Transcribe the audio verbatim (include filler words, hesitations)
2. Evaluate the answer based on both audio signals AND content

Evaluate on these criteria (each 0–100):
1. Communication clarity — clear speech, well-structured answer, easy to follow
2. Relevance — directly addresses the question asked
3. Depth — provides specific examples, details, and substance
4. Confidence — tone, pacing, delivery (no excessive hesitation or filler)

Also provide:
- An overall score (0–100) — weighted average leaning toward relevance and depth
- A brief reasoning (2–3 sentences) explaining the score
- Profile verification notes — did the answer confirm or contradict any profile claims? Null if no relevant claims to verify.
- The full transcript of what the candidate said

Return ONLY valid JSON matching the schema. No markdown, no preamble.`;

export const InterviewEvaluationResponseSchema = z.object({
  transcript: z.string(),
  criteria: z.array(z.object({
    name: z.string(),
    score: z.number().min(0).max(100),
  })),
  overall: z.number().min(0).max(100),
  reasoning: z.string(),
  profileVerification: z.string().nullable(),
});

export type InterviewEvaluationResponse = z.infer<typeof InterviewEvaluationResponseSchema>;

export function generateInterviewEvaluationUserPrompt(data: {
  question: string;
  candidateProfile: string;
}): string {
  return `Interview question: "${data.question}"

Candidate profile summary:
${data.candidateProfile}

Listen to the audio recording and evaluate the candidate's answer. Return JSON matching the schema (including the transcript).`;
}
