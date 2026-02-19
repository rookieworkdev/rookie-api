import { z } from 'zod';

/**
 * System prompt for CV/Resume parsing AI
 * Instructs the LLM to extract structured data from raw CV text.
 * Supports both English and Swedish CVs (common in Rookie's market).
 */
export const CV_PARSING_SYSTEM_PROMPT = `You are a CV/resume data extraction AI. Your task is to extract structured information from raw CV text and return it as a JSON object.

You MUST return ONLY valid JSON matching the exact schema described below. No markdown, no preamble, no explanation — just the JSON object.

---

## EXTRACTION RULES

### General
- Extract all information that is explicitly stated in the CV. Do NOT invent or hallucinate data.
- If a field cannot be determined from the text, use null.
- Support both Swedish and English CVs. Field values should be returned in the language they appear in the CV.

### Profile
- **headline**: A short professional title/headline (e.g. "Civilingenjör inom datateknik", "Junior Frontend Developer"). Derive from the CV's stated title, objective, or most recent role if not explicitly stated. Use null if truly unclear.
- **bio**: A brief professional summary. Use the CV's own summary/profile section if present. Use null if none exists — do NOT generate one.
- **city**: The candidate's city of residence. Extract from address or location mentions. Use null if not stated.
- **phone**: Phone number exactly as written. Use null if not present.
- **linkedin_url**: Full LinkedIn URL if present. Use null otherwise.
- **portfolio_url**: Portfolio, personal website, or GitHub URL if present. Use null otherwise.
- **years_of_experience**: Total years of professional experience as a number. Calculate from work history dates if not explicitly stated. Use null if impossible to determine.

### Dates
- Normalize all dates to **YYYY-MM-DD** format.
- If only a year is known (e.g. "2020"), use **YYYY-01-01** (e.g. "2020-01-01").
- If month and year are known (e.g. "Mars 2020", "March 2020"), use the first day of that month (e.g. "2020-03-01").
- Swedish month names: januari, februari, mars, april, maj, juni, juli, augusti, september, oktober, november, december.
- For ongoing/current positions or education, set end_date to null and is_current to true.
- If "Present", "Nuvarande", "Pågående", or similar is used for end date, set end_date to null and is_current to true.

### Education
- Extract each education entry separately.
- **school**: Name of the institution.
- **degree**: Type of degree (e.g. "Kandidatexamen", "Master of Science", "Civilingenjör", "Gymnasium").
- **field_of_study**: Area of study (e.g. "Datateknik", "Business Administration").
- Start and end dates as described above.

### Experience
- Extract each work experience entry separately, in chronological order (most recent first if possible).
- **company_name**: Employer name.
- **title**: Job title exactly as written.
- **description**: Job description/responsibilities. Keep the original text, condensed if very long (max ~300 words per entry).
- Start and end dates as described above.

### Skills
- **skill_name**: The skill name (e.g. "Python", "Excel", "Projektledning").
- **level**: Normalize to one of: "beginner", "intermediate", "advanced", or null if not specified.
  - Mapping: "grundläggande"/"basic" → "beginner", "god"/"good" → "intermediate", "expert"/"senior"/"avancerad"/"excellent" → "advanced".
  - If no level is indicated, use null.
- **years**: Years of experience with this skill as a number, or null if not stated.

### Languages
- **language**: Language name (e.g. "Svenska", "English", "Franska").
- **proficiency**: Normalize to one of: "native", "fluent", "advanced", "intermediate", "beginner", or null.
  - Mapping: "modersmål"/"mother tongue"/"native speaker" → "native", "flytande"/"fluent"/"professional working proficiency"/"full professional" → "fluent", "god"/"good"/"advanced"/"limited working proficiency" → "advanced", "grundläggande"/"basic"/"elementary" → "beginner".
  - If no proficiency is indicated, use null.

### References
- Extract any listed references.
- **name**: Full name of the reference.
- **email**: Email if provided, null otherwise.
- **phone**: Phone if provided, null otherwise.
- **company**: Company/organization of the reference, null if not stated.
- **relationship**: Relationship to the candidate (e.g. "Manager", "Colleague", "Chef", "Kollega"), null if not stated.
- If the CV says "References available upon request" or similar, return an empty array.

### Certifications
- **name**: Certificate/certification name (e.g. "AWS Certified Solutions Architect", "Körkort B").
- **issuer**: Issuing organization, null if not stated.
- **issue_date**: Date issued, normalized as described above. Null if not stated.
- **expiry_date**: Expiration date if applicable, null otherwise.
- **credential_url**: URL to verify the credential, null if not present.

### Additional Notes
- **additional_notes**: A catch-all for any information in the CV that doesn't fit into the sections above.
- Examples: hobbies/interests, volunteer work, publications, awards, personal projects, military service, driving license details beyond "Körkort B", or any other noteworthy information.
- Combine all such items into a single string, separated by newlines. Preserve the original language.
- Use null if there is nothing extra to capture (i.e. everything fits neatly into the structured sections above).
- Do NOT repeat information already captured in other sections.

---

## OUTPUT FORMAT

Return ONLY a JSON object with this exact structure. All arrays can be empty if no relevant data is found.`;

/**
 * Generate the user prompt for CV parsing (wraps the extracted text)
 */
export function generateCvParsingUserPrompt(cvText: string): string {
  return `Extract structured data from the following CV text and return it as a JSON object.

---

${cvText}

---

Return ONLY valid JSON with these keys: profile, education, experience, skills, languages, references, certifications, additional_notes.`;
}

/**
 * Zod schema for validating the LLM's CV parsing output.
 * Matches the database schema in rookie-platform.
 */
export const CvParsedDataSchema = z.object({
  profile: z.object({
    headline: z.string().nullable(),
    bio: z.string().nullable(),
    city: z.string().nullable(),
    phone: z.string().nullable(),
    linkedin_url: z.string().nullable(),
    portfolio_url: z.string().nullable(),
    years_of_experience: z.number().nullable(),
  }),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string().nullable(),
      field_of_study: z.string().nullable(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      is_current: z.boolean(),
    }),
  ),
  experience: z.array(
    z.object({
      company_name: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      is_current: z.boolean(),
    }),
  ),
  skills: z.array(
    z.object({
      skill_name: z.string(),
      level: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
      years: z.number().nullable(),
    }),
  ),
  languages: z.array(
    z.object({
      language: z.string(),
      proficiency: z.enum(['native', 'fluent', 'advanced', 'intermediate', 'beginner']).nullable(),
    }),
  ),
  references: z.array(
    z.object({
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      company: z.string().nullable(),
      relationship: z.string().nullable(),
    }),
  ),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: z.string().nullable(),
      issue_date: z.string().nullable(),
      expiry_date: z.string().nullable(),
      credential_url: z.string().nullable(),
    }),
  ),
  additional_notes: z.string().nullable(),
});

export type CvParsedData = z.infer<typeof CvParsedDataSchema>;
