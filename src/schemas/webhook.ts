import { z } from 'zod';

/**
 * Schema for validating incoming webhook request body.
 * This validates the structure and basic format of the data.
 * Business logic validation (spam detection, lead scoring) happens later in the pipeline.
 */
export const webhookRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  phone: z.string().optional(),
  company: z.string().min(1, 'Company is required'),
  industry: z.string().optional(),
  service_type: z.string().optional(),
  message: z.string().optional(),
  subject: z.string().optional(),
});

/**
 * Type inferred from the webhook request schema.
 * Use this instead of manually defining WebhookRequestBody.
 */
export type WebhookRequestBody = z.infer<typeof webhookRequestSchema>;

/**
 * Validation result type for handling parse errors gracefully.
 */
export type WebhookValidationResult =
  | { success: true; data: WebhookRequestBody }
  | { success: false; errors: z.ZodError };

/**
 * Parse and validate webhook request body.
 * Returns a result object instead of throwing.
 */
export function parseWebhookRequest(body: unknown): WebhookValidationResult {
  const result = webhookRequestSchema.safeParse(body);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error };
}

/**
 * Format zod validation errors into a user-friendly message.
 */
export function formatValidationErrors(errors: z.ZodError): string {
  return errors.errors
    .map((err) => `${err.path.join('.')}: ${err.message}`)
    .join(', ');
}
