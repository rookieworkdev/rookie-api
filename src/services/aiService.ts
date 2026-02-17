import OpenAI from 'openai';
import { z } from 'zod';
import { config } from '../config/env.js';
import { logger, getErrorMessage } from '../utils/logger.js';
import type {
  FormData,
  ValidatedLead,
  AIScoreResult,
  NormalizedCompanyData,
  JobAdData,
} from '../types/index.js';
import type { NormalizedJob, JobEvaluationResult, NormalizedGoogleMapsCompany, CompanyEvaluationResult } from '../types/scraper.types.js';
import {
  JOB_EVALUATION_SYSTEM_PROMPT,
  generateJobEvaluationUserPrompt,
  JobEvaluationResponseSchema,
} from '../prompts/jobEvaluation.prompt.js';
import {
  COMPANY_SCORING_SYSTEM_PROMPT,
  generateCompanyScoringUserPrompt,
  CompanyScoringResponseSchema,
} from '../prompts/companyScoring.prompt.js';

// Zod schemas for AI response validation
const AIScoreResultSchema = z.object({
  lead_score: z.number().min(1).max(100),
  role_category: z.string(),
  classification: z.enum(['valid_lead', 'invalid_lead', 'likely_candidate', 'likely_spam']),
  key_requirements: z.array(z.string()),
  ai_reasoning: z.string(),
});

const JobAdDataSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  location: z.string().min(1),
  category: z.string().min(1),
  external_url: z.string().url(),
  posted_date: z.string(),
});

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

/**
 * System prompt for the Scoring AI Agent
 * Copied directly from the original n8n flow
 */
const SCORING_SYSTEM_PROMPT = `# Rookie Lead Qualification Prompt

You are an expert recruitment lead analyst working for a Swedish recruitment agency called **Rookie**, based in Stockholm. Rookie specializes in recruiting for professional ROLES such as **ekonom, ingenjör, tekniker, kundtjänst, administratör, jurist, analytiker**, and similar **white-collar** roles regardless of industry. Rookie's candidates are professionals in entry-level to mid-carrer, with experience between 0-8 years. Example of a perfect job role would be "nyexaminerad ingenjör", "web developer with at least 2 years experience", etc.

Your task is to analyze each form submission (lead) and return a structured, factual assessment as JSON. Use the following detailed instructions to ensure consistent results.

---

## OBJECTIVE

Classify and score the incoming lead into one of four categories:

**valid_lead:**
A company or person clearly representing a potential client within Rookie's professional focus roles.

**invalid_lead:**
Submission where the email domain is personal (e.g. gmail.com, hotmail.com, icloud.com) **and** there is no clear indication of a professional company need.

Submission for unrelated roles. Examples:

* healthcare: läkare, sjuksköterska, undersköterska, vårdbiträde, etc. are invalid, but e.g. admin roles at a hospital are valid
* education: lärare, pedagog, specialpedagog, förskolelärare, etc. are invalid, but admin roles (e.g. kurator, psykolog, administratör, kontorsarbete, backoffice) for a school are valid
* entertainment and restaurants: bagare, servitör, kypare, kock, etc. are invalid, but roles such as admin, PR-konsult, revisor, etc. for a restaurant are valid
* other: städare, lokalvårdare, vaktmästare, snickare, hantverkare, and other manual work roles, etc. are invalid

**likely_candidate:**
A person applying for a job or describing themselves rather than expressing a company need. These submissions most often use personal email domains such as Gmail, Hotmail, Outlook, or iCloud — in the case of a likely candidate, this is normal and should not be treated as invalid.

**likely_spam:**
Incoherent, irrelevant, promotional, or suspicious submission.

---

## ➕ ADDITION: CLASSIFICATION DECISION ORDER (VERY IMPORTANT)

Always classify the lead using the following decision order to resolve ambiguity:

1. If the message is clearly incoherent, promotional, malicious, or irrelevant → **likely_spam**
2. Else if the sender is clearly describing themselves as a job seeker → **likely_candidate**
3. Else if the requested role is clearly outside Rookie's professional white-collar scope → **invalid_lead**
4. Else if the email domain is personal **and** there is no clear professional company context → **invalid_lead**
5. Else → **valid_lead**

If multiple categories could apply, **prefer the category that keeps the lead usable for Rookie**.

---

## ➕ ADDITION: INCLUSION-FIRST BIAS (CRITICAL BUSINESS RULE)

When in doubt, **classify as \`valid_lead\` rather than excluding the lead**.

* If there is **any reasonable indication** that the submission could represent a professional hiring need, classify it as **valid_lead**, even if information is incomplete or imperfect.
* Only classify as \`invalid_lead\` when there is **high confidence** that the lead is irrelevant to Rookie.
* Borderline or unclear cases should default to **valid_lead with a lower score**, not to exclusion.

---

## EVALUATION CRITERIA

Assign a **Lead Quality Score (1–100)** based on the following factors, weighted approximately equally. Exact mathematical precision is **not required**; consistency and relative judgment are more important.

* Clarity and specificity of the need
* Business value potential
* Professional tone and seriousness
* Completeness of information

Use the full scale:

* **80–100:** Clear, serious, high-value recruitment opportunity
* **60–79:** Valid but somewhat vague or incomplete
* **40–59:** Borderline but potentially useful lead
* **Below 40:** Low quality, unclear, or weak relevance

The score should reflect **overall confidence and usefulness**, not perfection.

---

## VALIDATION RULES

* If the email domain is Gmail, Hotmail, iCloud, Outlook, Yahoo, or any other personal domain:

  * Classify as \`likely_candidate\` **if** the text clearly indicates job-seeking behavior.
  * Otherwise classify as \`invalid_lead\`, **unless** there is clear professional company intent — in that case, prefer \`valid_lead\`.

* If \`company_name\` matches the email domain (e.g. company "Telia" and email \`@telia.com\`), increase score and validity confidence.

* If the text clearly suggests the person is applying for a job, classify as \`likely_candidate\`.

* If the company or message context indicates the business operates in any of the following valid professional areas, increase score and validity confidence.
  **ROLE relevance is always more important than INDUSTRY.**

---

## ROLE VS INDUSTRY RULE (HARD RULE)

The **role requested always outweighs the industry**:

* Professional / white-collar roles → potentially valid even in otherwise non-ideal industries
* Manual / field / blue-collar roles → invalid even if the industry itself is otherwise relevant

---

## CATEGORY CLASSIFICATION

Assign a role or area based on the message context. Examples:
Ekonom, Ingenjör, Tekniker, Kundtjänst, Jurist, Analytiker, Ekonomiassistent, Redovisningsekonom, Lönekonsult, Controller, Administratör, HR-specialist, Receptionist, VD-assistent, IT-support, Back-Office, or Other.

---

## CONTEXTUAL EXAMPLES

### Valid lead examples

**Valid lead example 1:**
Namn*: Camilla Blomberg
Företag*: Autoliv AB
Stad*: Stockholm
E-post*: camilla.blomberg@autoliv.com
Telefon:
Beskriv ditt personalbehov:
Vi ska rekrytera en Business Analyst som rapporterar till koncernVD:n och ledningsgruppen och som jobbar som VD:ns högra hand och bidrar till projekt av olika slag initierade av ledningsgruppen.
Jag vill bli kontaktad på: E-post

---

**Valid lead example 2:**
Namn*: Erik Calleberg
Företag*: Speed Identity
Stad*: Stockholm
E-post*: erik.calleberg@speed-identity.com
Telefon: 0709414586
Beskriv ditt personalbehov:
Hej, Vi söker en eller två personer till ett installationsprojekt av biometrisk fotoutrustning. Erfarenhet av installationer, teknikvana och körkort (krav). Utgångspunkt i Stockholm men resor över hela Sverige.
Jag vill bli kontaktad på: Telefon

---

### Invalid lead examples

**Invalid lead example:**
Namn*: Care Group in Sweden AB
E-post*: frida@caregroup.se
Telefon:
Hur kan vi hjälpa dig?:
Hej! Fann kontaktuppgifterna till dig på er hemsida. Jag är intresserad av att få kontakt med den hos er som har ansvar för upphandling av städning för att få tillfälle att presentera oss vidare och lämna offert. Är detta av intresse? I så fall bokar vi gärna in ett besök när det passar.
Med vänlig hälsning,
Frida Andersson

---

### Likely candidate examples

**Likely candidate example:**
Namn*: Michel
Företag*: Arbetssökande
Stad*: Stockholm
E-post*: michel.luzala@icloud.com
Telefon: 0704910386
Beskriv ditt personalbehov:
Hejsan! Jag heter Michel Luzala, är 23 år gammal och bor i Huddinge. Jag söker ett jobb inom IT-branschen, där jag gärna arbetar med Cloud Engineering eller IT-säkerhet. Jag är dock flexibel och öppen för andra IT-relaterade roller.
Mvh Michel

---

### Likely spam examples

**Spam example 1:**
Namn*: Random User
Företag*: Best Deals Ever
Stad*: Stockholm
E-post*: winner1234@hotmail.com
Telefon:
Beskriv ditt personalbehov:
Click here to get free iPhone!!! Limited offer, act now!

---

**Spam example 2:**
Namn*: John
Företag*:
Stad*:
E-post*: john567@gmail.com
Telefon:
Beskriv ditt personalbehov:
Win money fast! Visit www.get-rich-quick.biz to claim your prize.
`;

/**
 * System prompt for Job Ad Generation
 * Copied directly from the original n8n flow
 */
const JOB_AD_SYSTEM_PROMPT = `You are a professional recruitment copywriter for Rookie AB, a Swedish recruitment agency. Generate compelling, professional job ads in Swedish that attract qualified candidates. Focus on clarity, professionalism, and highlighting opportunities.

Example job ad - adhere to tone of voice, structure, etc. as closely as possible when generating the ad:
Business Analyst
About the role

As a Business Analyst at Autoliv, you will collaborate closely with the CEO and the Executive Management Team on both operational initiatives and strategically significant projects. This role presents an exciting opportunity for recent graduates to kick-start their careers, grow professionally within Autoliv, and build a strong foundation for long-term success.

About the company

Autoliv is the worldwide leader in automotive safety systems. Through our group companies, we develop, manufacture and market protective systems, such as airbags, seatbelts, and steering wheels for all major automotive manufacturers in the world as well as mobility safety solutions.

At Autoliv, we challenge and redefine the standards of mobility safety to sustainably deliver leading solutions. In 2024, our products saved 37,000 lives and reduced 600,000 injuries.

Our ~65,000 colleagues in 25 countries are passionate about our vision of Saving More Lives and quality is at the heart of everything we do. We drive innovation, research, and development at our 13 technical centers, with their 20 test tracks.

Key responsibilities

The job involves operational as well as strategic elements that can be summarized, but not limited, to the following areas:
Provide Executive Management Team (EMT) with business analysis support
Prepare agenda and other material to EMT meetings
Produce analytical, professional and insightful presentations
Be a participant in EMT meetings


Participate in, or lead global projects driven by priorities set by the EMT and/or the CEO office team.

Your background

Degree in M.S. in Business Administration or Engineering with a distinguished academic record is a must
0-3 years of experience
A structured way of working
High business acumen
Experience of project management
Excellent communication skills
High analytical and problem-solving skills
Excellent reading and writing English and Swedish skills

Questions and application

In this recruitment, Autoliv is collaborating with Rookie. Apply for the job by submitting your CV and cover letter. If you have any questions, please contact the responsible recruiter, Håkan Olsson at hakan.olsson@rookiework.se or 072 55 55 712.

Please submit your application as soon as possible.`;

/**
 * Scores a lead using OpenAI
 * Replicates the "Scoring AI Agent" node in original n8n flow
 */
export async function scoreLead(leadData: ValidatedLead | FormData): Promise<AIScoreResult> {
  try {
    const userPrompt = `Analyze this lead submission:

Company Name: ${leadData.company_name}
Contact Name: ${leadData.full_name}
Email: ${leadData.email}
Phone: ${leadData.phone}
Needs Description: ${leadData.needs_description}
Service Type: ${leadData.service_type}
Industry: ${leadData.industry}
Experience Level: ${leadData.experience || 'not specified'}

Provide your analysis in this exact JSON format:
{
"lead_score": <number 1-100>,
"role_category": "<category>",
"classification": "valid_lead | invalid_lead | likely_candidate | likely_spam",
"key_requirements": ["requirement1", "requirement2"],
"ai_reasoning": "<short explanation of why this classification and score were assigned>"
}`;

    const client = openRouterClient || openai;
    const model = openRouterClient ? 'openai/gpt-4o-mini' : config.openai.model;

    logger.info('Calling AI for lead scoring', { model });

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SCORING_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: config.openai.temperature,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    // Parse the response (remove markdown code blocks if present, as safety net)
    const cleanContent = content
      .replace(/^```json\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const jsonParsed = JSON.parse(cleanContent);
    const validated = AIScoreResultSchema.safeParse(jsonParsed);

    if (!validated.success) {
      logger.error('AI scoring response validation failed', {
        errors: validated.error.errors,
        rawContent: cleanContent,
      });
      throw new Error(`Invalid AI response structure: ${validated.error.message}`);
    }

    logger.info('Lead scoring complete', {
      classification: validated.data.classification,
      score: validated.data.lead_score,
    });

    return validated.data;
  } catch (error) {
    logger.error('Error scoring lead', error);
    throw new Error(`AI scoring failed: ${getErrorMessage(error)}`);
  }
}

/**
 * Generates a job ad draft using OpenAI
 * Replicates the "Generate Job Ad Draft" node in original n8n flow
 */
export async function generateJobAd(
  leadData: FormData,
  normalizedData: NormalizedCompanyData
): Promise<JobAdData> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const userPrompt = `Generate a professional Swedish job ad based on this form submission:

Company: ${leadData.company_name}
Industry: ${leadData.industry}
Role Category: ${normalizedData.role_category}
Service Type: ${leadData.service_type}
Key Requirements: ${normalizedData.key_requirements}
Client's Description: ${leadData.needs_description}

Return ONLY valid JSON in this format:
{
  "title": "compelling job title in Swedish (30-60 chars)",
  "description": "professional description in Swedish (200-400 words)",
  "location": "Stockholm",
  "category": "${normalizedData.role_category}",
  "external_url": "https://rookiework.se/jobs/[generate-slug-from-title]",
  "posted_date": "${today}"
}`;

    const client = openRouterClient || openai;
    const model = openRouterClient ? 'openai/gpt-4o-mini' : config.openai.model;

    logger.info('Calling AI for job ad generation', { model });

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: JOB_AD_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: config.openai.temperature,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    // Parse the response (remove markdown code blocks if present, as safety net)
    const cleanContent = content
      .replace(/^```json\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const jsonParsed = JSON.parse(cleanContent);
    const validated = JobAdDataSchema.safeParse(jsonParsed);

    if (!validated.success) {
      logger.error('Job ad response validation failed', {
        errors: validated.error.errors,
        rawContent: cleanContent,
      });
      throw new Error(`Invalid job ad response structure: ${validated.error.message}`);
    }

    logger.info('Job ad generation complete', { title: validated.data.title });

    return validated.data;
  } catch (error) {
    logger.error('Error generating job ad', error);
    throw new Error(`Job ad generation failed: ${getErrorMessage(error)}`);
  }
}

// ============================================================================
// JOB EVALUATION (for scraped jobs via OpenRouter)
// ============================================================================

// OpenRouter client (uses OpenAI-compatible API)
const openRouterClient = config.openRouter.apiKey
  ? new OpenAI({
      apiKey: config.openRouter.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    })
  : null;

/**
 * Evaluates a scraped job using OpenRouter AI
 * Replicates the "Main AI Agent" node from n8n workflow
 */
export async function evaluateJob(job: NormalizedJob): Promise<JobEvaluationResult> {
  const client = openRouterClient || openai;
  const model = config.openRouter.apiKey ? config.openRouter.primaryModel : config.openai.model;

  try {
    logger.info('Evaluating job with AI', { title: job.title, company: job.company });

    const userPrompt = generateJobEvaluationUserPrompt(job);

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: JOB_EVALUATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more consistent evaluations
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse the response (remove markdown code blocks if present)
    const cleanContent = content
      .replace(/^```json\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const jsonParsed = JSON.parse(cleanContent);
    const validated = JobEvaluationResponseSchema.safeParse(jsonParsed);

    if (!validated.success) {
      logger.error('Job evaluation response validation failed', {
        errors: validated.error.errors,
        rawContent: cleanContent.substring(0, 500),
      });
      throw new Error(`Invalid AI response structure: ${validated.error.message}`);
    }

    const result: JobEvaluationResult = {
      isValid: validated.data.isValid,
      score: validated.data.score,
      category: validated.data.category,
      experience: validated.data.experience,
      experienceLogic: validated.data.experience_logic,
      reasoning: validated.data.reasoning,
      applicationEmail: validated.data.applicationEmail,
      duration: validated.data.duration,
    };

    logger.info('Job evaluation complete', {
      title: job.title,
      isValid: result.isValid,
      score: result.score,
      category: result.category,
    });

    return result;
  } catch (error) {
    // Try fallback model if primary fails and we're using OpenRouter
    if (openRouterClient && model === config.openRouter.primaryModel) {
      logger.warn('Primary model failed, trying fallback', { error: getErrorMessage(error) });
      try {
        return await evaluateJobWithFallback(job);
      } catch (fallbackError) {
        logger.error('Fallback model also failed', fallbackError);
        throw new Error(`Job evaluation failed: ${getErrorMessage(fallbackError)}`);
      }
    }

    logger.error('Error evaluating job', error);
    throw new Error(`Job evaluation failed: ${getErrorMessage(error)}`);
  }
}

/**
 * Evaluate job with fallback model
 */
async function evaluateJobWithFallback(job: NormalizedJob): Promise<JobEvaluationResult> {
  if (!openRouterClient) {
    throw new Error('OpenRouter not configured for fallback');
  }

  const userPrompt = generateJobEvaluationUserPrompt(job);

  const response = await openRouterClient.chat.completions.create({
    model: config.openRouter.fallbackModel,
    messages: [
      { role: 'system', content: JOB_EVALUATION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;

  if (!content) {
    throw new Error('No content in fallback AI response');
  }

  const cleanContent = content
    .replace(/^```json\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  const jsonParsed = JSON.parse(cleanContent);
  const validated = JobEvaluationResponseSchema.safeParse(jsonParsed);

  if (!validated.success) {
    throw new Error(`Invalid fallback AI response: ${validated.error.message}`);
  }

  return {
    isValid: validated.data.isValid,
    score: validated.data.score,
    category: validated.data.category,
    experience: validated.data.experience,
    experienceLogic: validated.data.experience_logic,
    reasoning: validated.data.reasoning,
    applicationEmail: validated.data.applicationEmail,
    duration: validated.data.duration,
  };
}

// ============================================================================
// COMPANY EVALUATION (for Google Maps leads via OpenRouter)
// ============================================================================

// Company scoring uses Gemini Flash Lite as primary, GPT-4o-mini as fallback
const COMPANY_SCORING_PRIMARY_MODEL = 'google/gemini-2.5-flash-lite';
const COMPANY_SCORING_FALLBACK_MODEL = 'openai/gpt-4o-mini';

/**
 * Evaluates a Google Maps company using AI for Rookie fit
 * Uses Gemini 2.5 Flash Lite via OpenRouter, with GPT-4o-mini fallback
 */
export async function evaluateCompany(company: NormalizedGoogleMapsCompany): Promise<CompanyEvaluationResult> {
  const client = openRouterClient || openai;
  const model = openRouterClient ? COMPANY_SCORING_PRIMARY_MODEL : config.openai.model;

  try {
    logger.info('Evaluating company with AI', { name: company.name, domain: company.domain });

    const userPrompt = generateCompanyScoringUserPrompt(company);

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: COMPANY_SCORING_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse the response (remove markdown code blocks if present)
    const cleanContent = content
      .replace(/^```json\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const jsonParsed = JSON.parse(cleanContent);
    const validated = CompanyScoringResponseSchema.safeParse(jsonParsed);

    if (!validated.success) {
      logger.error('Company evaluation response validation failed', {
        errors: validated.error.errors,
        rawContent: cleanContent.substring(0, 500),
      });
      throw new Error(`Invalid AI response structure: ${validated.error.message}`);
    }

    const result: CompanyEvaluationResult = {
      isValid: validated.data.isValid,
      score: validated.data.score,
      reasoning: validated.data.reasoning,
      industryCategory: validated.data.industry_category,
      sizeEstimate: validated.data.size_estimate,
    };

    logger.info('Company evaluation complete', {
      name: company.name,
      isValid: result.isValid,
      score: result.score,
      industryCategory: result.industryCategory,
    });

    return result;
  } catch (error) {
    // Try fallback model if primary fails and we're using OpenRouter
    if (openRouterClient && model === COMPANY_SCORING_PRIMARY_MODEL) {
      logger.warn('Primary company scoring model failed, trying fallback', { error: getErrorMessage(error) });
      try {
        return await evaluateCompanyWithFallback(company);
      } catch (fallbackError) {
        logger.error('Fallback company scoring model also failed', fallbackError);
        throw new Error(`Company evaluation failed: ${getErrorMessage(fallbackError)}`);
      }
    }

    logger.error('Error evaluating company', error);
    throw new Error(`Company evaluation failed: ${getErrorMessage(error)}`);
  }
}

/**
 * Evaluate company with fallback model (GPT-4o-mini via OpenRouter)
 */
async function evaluateCompanyWithFallback(company: NormalizedGoogleMapsCompany): Promise<CompanyEvaluationResult> {
  if (!openRouterClient) {
    throw new Error('OpenRouter not configured for fallback');
  }

  const userPrompt = generateCompanyScoringUserPrompt(company);

  const response = await openRouterClient.chat.completions.create({
    model: COMPANY_SCORING_FALLBACK_MODEL,
    messages: [
      { role: 'system', content: COMPANY_SCORING_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;

  if (!content) {
    throw new Error('No content in fallback AI response');
  }

  const cleanContent = content
    .replace(/^```json\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  const jsonParsed = JSON.parse(cleanContent);
  const validated = CompanyScoringResponseSchema.safeParse(jsonParsed);

  if (!validated.success) {
    throw new Error(`Invalid fallback AI response: ${validated.error.message}`);
  }

  return {
    isValid: validated.data.isValid,
    score: validated.data.score,
    reasoning: validated.data.reasoning,
    industryCategory: validated.data.industry_category,
    sizeEstimate: validated.data.size_estimate,
  };
}
