import { z } from 'zod';

/**
 * System prompt for AI Interview Question Generation.
 * Generates personalized interview questions from a candidate's profile.
 * Purpose: verify profile claims, not test general knowledge.
 */
export const INTERVIEW_QUESTION_GENERATION_SYSTEM_PROMPT = `You are an interview question designer for Rookie AB, a Swedish recruitment agency specialising in white-collar roles with 0-8 years of experience.

Your task is to generate personalized interview questions based on a candidate's profile data. The interview's purpose is to VERIFY the candidate's profile claims - not to test general knowledge or conduct a standard interview.

CORE PRINCIPLES:
1. Every question must target a SPECIFIC claim from the candidate's profile
2. Questions should feel conversational and encouraging, not like an interrogation
3. The goal is to let strong candidates shine, not to catch people out
4. Questions should reveal depth of real experience vs surface-level claims
5. Mix question styles: open-ended stories, specific examples, situational, and language verification
6. Questions about language proficiency MUST be asked in that language
7. The candidate has chosen a preferred interview language - use it as the primary language for all questions. Language verification questions in other languages are still allowed as brief follow-ups

QUESTION DESIGN RULES:
- DO ask: "You listed bokforing as a key skill. What types have you worked with - lopande, arsbokslut, or koncernredovisning?"
- DO NOT ask: "What is bokforing?" (testing textbook knowledge, not verifying their claim)
- DO ask: "I see you studied mathematics for 4 years. Which topics did you enjoy most, and how do you apply what you learned?"
- DO NOT ask: "What is 12 times 15?" (quiz-style, insulting)
- DO ask: "You chose 'analytisk' as one of your strengths. Can you describe a situation where your analytical thinking made a real difference?"
- DO NOT ask: "Would you say you are analytical?" (yes/no, reveals nothing)

CLAIM CATEGORIES TO VERIFY (prioritize in this order):
1. Skills and competencies (candidate_skills with levels) - highest priority
2. Experience level and work history - does depth match claimed years?
3. Language proficiency - ask questions IN the claimed language
4. Role category knowledge - genuine interest and field understanding
5. Education - how they apply what they learned
6. Strengths/soft skills - concrete examples, not self-assessment
7. Work task preferences - real experience with claimed preferred tasks

LANGUAGE VERIFICATION:
- If candidate claims Swedish: native/fluent -> most questions in Swedish
- If candidate claims Swedish: conversational/basic -> ask 1-2 simple Swedish questions
- If candidate claims English: fluent -> include 2-3 questions in English
- If candidate claims other languages at fluent/native -> include 1 question in that language
- Language questions should be natural follow-ups, not sudden switches

QUESTION DISTRIBUTION:
Distribute questions across multiple claim categories. Never spend more than 40% of questions on a single category. Ensure at least 3 different categories are covered.

For each question, specify:
- The question text (in the appropriate language)
- Which profile claim it verifies (structured tag)
- The expected max recording duration in seconds (60-180, longer for open-ended)

You receive the candidate's full profile data and the desired number of questions.

Return ONLY valid JSON. No markdown, no code fences, no preamble.

{
  "questions": [
    {
      "question": "question text here",
      "profileClaim": "category:specific_claim",
      "maxDurationSeconds": 120,
      "language": "sv"
    }
  ]
}

Profile claim format examples:
- "skill:bokforing" (verifies a specific skill)
- "skill_level:excel:advanced" (verifies claimed skill level)
- "experience_level:5_8_years" (verifies experience depth)
- "language:english:fluent" (verifies language proficiency)
- "language:swedish:native" (verifies Swedish proficiency)
- "strength:analytisk" (verifies a claimed strength)
- "role_category:ekonom" (verifies role identity/knowledge)
- "education:field:mathematics" (verifies education claims)
- "experience:company:title" (verifies work history claims)
- "work_tasks:kundkontakt" (verifies task preference claims)`;

export const InterviewQuestionSchema = z.object({
  question: z.string(),
  profileClaim: z.string(),
  maxDurationSeconds: z.number().min(30).max(300),
  language: z.string().default('sv'),
});

export const InterviewQuestionGenerationResponseSchema = z.object({
  questions: z.array(InterviewQuestionSchema),
});

export type InterviewQuestionGenerationResponse = z.infer<typeof InterviewQuestionGenerationResponseSchema>;

/**
 * Build the user prompt with full candidate profile data.
 */
export function generateInterviewQuestionsUserPrompt(data: {
  questionCount: number;
  serviceType: string;
  profile: CandidateProfileForGeneration;
}): string {
  const { questionCount, serviceType, profile } = data;

  const sections: string[] = [];

  sections.push(`Generate exactly ${questionCount} interview questions for a ${serviceType} position.`);
  sections.push('');

  // Basic info
  sections.push('=== CANDIDATE PROFILE ===');
  if (profile.headline) sections.push(`Headline: ${profile.headline}`);
  if (profile.bio) sections.push(`Bio: ${profile.bio}`);

  // Experience level
  if (profile.experienceLevel) {
    const labels: Record<string, string> = {
      new_to_work: 'New to working life (0 years)',
      junior: 'Junior (1-2 years)',
      '3_5_years': '3-5 years experience',
      '5_8_years': '5-8 years experience',
    };
    sections.push(`Experience level: ${labels[profile.experienceLevel] || profile.experienceLevel}`);
  }

  // Role categories
  if (profile.roleCategories?.length) {
    sections.push(`Role categories: ${profile.roleCategories.join(', ')}`);
  }

  // Skills (from candidate_skills table)
  if (profile.skills?.length) {
    const skillLines = profile.skills.map(s => {
      let desc = s.skillName;
      if (s.level) desc += ` (${s.level})`;
      if (s.years) desc += ` - ${s.years} years`;
      return desc;
    });
    sections.push(`Skills:\n${skillLines.map(l => `  - ${l}`).join('\n')}`);
  }

  // Strengths
  if (profile.strengths?.length) {
    sections.push(`Strengths (soft skills): ${profile.strengths.join(', ')}`);
  }

  // Languages
  if (profile.languageSwedish) {
    sections.push(`Swedish proficiency: ${profile.languageSwedish}`);
  }
  if (profile.languageEnglish) {
    sections.push(`English proficiency: ${profile.languageEnglish}`);
  }
  if (profile.additionalLanguages?.length) {
    const langLines = profile.additionalLanguages.map(l =>
      `${l.language}${l.proficiency ? ` (${l.proficiency})` : ''}`
    );
    sections.push(`Additional languages: ${langLines.join(', ')}`);
  }

  // Education
  if (profile.education?.length) {
    const eduLines = profile.education.map(e => {
      const parts = [e.school];
      if (e.degree) parts.push(e.degree);
      if (e.fieldOfStudy) parts.push(e.fieldOfStudy);
      if (e.startDate || e.endDate) {
        parts.push(`(${e.startDate || '?'} - ${e.isCurrent ? 'present' : e.endDate || '?'})`);
      }
      return parts.join(', ');
    });
    sections.push(`Education:\n${eduLines.map(l => `  - ${l}`).join('\n')}`);
  }

  // Work experience
  if (profile.experience?.length) {
    const expLines = profile.experience.map(e => {
      const parts = [];
      if (e.title) parts.push(e.title);
      parts.push(`at ${e.companyName}`);
      if (e.startDate || e.endDate) {
        parts.push(`(${e.startDate || '?'} - ${e.isCurrent ? 'present' : e.endDate || '?'})`);
      }
      if (e.description) parts.push(`\n    ${e.description.slice(0, 200)}`);
      return parts.join(' ');
    });
    sections.push(`Work experience:\n${expLines.map(l => `  - ${l}`).join('\n')}`);
  }

  // Preferred work tasks
  if (profile.preferredWorkTasks?.length) {
    sections.push(`Preferred work tasks: ${profile.preferredWorkTasks.join(', ')}`);
  }

  // Service type context
  sections.push('');
  sections.push('=== INTERVIEW CONTEXT ===');
  sections.push(`Service type: ${serviceType}`);
  if (serviceType === 'direktrekrytering') {
    sections.push('This is a permanent hire interview - be thorough, verify depth across multiple dimensions.');
  } else if (serviceType === 'hyrrekrytering') {
    sections.push('This is a contract-to-hire interview - moderate depth, focus on key skills and experience.');
  } else if (serviceType === 'bemanning') {
    sections.push('This is a temp staffing interview - focus on core competencies and availability. Keep questions concise.');
  }

  // Interview language preference
  const lang = profile.interviewLanguage === 'en' ? 'English' : 'Swedish';
  sections.push(`Preferred interview language: ${lang}`);
  sections.push(`Ask all main questions in ${lang}. You may still include 1-2 brief verification questions in other languages the candidate claims proficiency in.`);

  sections.push('');
  sections.push(`Generate exactly ${questionCount} questions. Return JSON only.`);

  return sections.join('\n');
}

/**
 * Type for the candidate profile data sent to the generation prompt.
 */
export interface CandidateProfileForGeneration {
  headline: string | null;
  bio: string | null;
  experienceLevel: string | null;
  roleCategories: string[];
  skills: Array<{
    skillName: string;
    level: string | null;
    years: number | null;
  }>;
  strengths: string[];
  languageSwedish: string | null;
  languageEnglish: string | null;
  additionalLanguages: Array<{
    language: string;
    proficiency: string | null;
  }>;
  education: Array<{
    school: string;
    degree: string | null;
    fieldOfStudy: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
  }>;
  experience: Array<{
    companyName: string;
    title: string | null;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
  }>;
  preferredWorkTasks: string[];
  interviewLanguage: string | null;
}
