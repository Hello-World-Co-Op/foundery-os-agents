/**
 * User Context Validation
 *
 * Validates and sanitizes user-provided context before injecting into prompts.
 * Prevents prompt injection and ensures context conforms to expected structure.
 *
 * @module validation/user-context
 * @see FOS-5.6.3 AC-5.6.3.3 - User context validated with Zod schema before prompt injection
 * @see F-10 (security-audit-backend-auth.md) - Unvalidated user context in prompts
 */

import { z } from 'zod';

/**
 * Maximum number of fields allowed in context
 */
export const MAX_CONTEXT_FIELDS = 10;

/**
 * Maximum length of each context value
 */
export const MAX_FIELD_LENGTH = 1000;

/**
 * Patterns that could indicate prompt injection attempts
 * These are sanitized from context values
 */
const PROMPT_INJECTION_PATTERNS = [
  // Common LLM manipulation patterns
  /\bignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/gi,
  /\byou\s+are\s+now\b/gi,
  /\bforget\s+(everything|all)/gi,
  /\bsystem\s*:/gi,
  /\buser\s*:/gi,
  /\bassistant\s*:/gi,
  // XML/JSON injection
  /<\/?(?:system|user|assistant|message|prompt)[^>]*>/gi,
  // Markdown injection
  /^#+\s*system\s*$/gim,
  // Common jailbreak phrases
  /\bdan\s+mode\b/gi,
  /\bdev\s+mode\b/gi,
  /\bjailbreak/gi,
];

/**
 * Zod schema for individual context field value
 */
const contextFieldValueSchema = z.string()
  .max(MAX_FIELD_LENGTH, `Context field value must be at most ${MAX_FIELD_LENGTH} characters`);

/**
 * Zod schema for user context
 * Limits number of fields and validates each value
 */
export const userContextSchema = z.record(z.string(), z.unknown())
  .refine(
    (ctx) => Object.keys(ctx).length <= MAX_CONTEXT_FIELDS,
    { message: `Context cannot have more than ${MAX_CONTEXT_FIELDS} fields` }
  )
  .transform((ctx) => {
    // Transform and validate each field
    const validated: Record<string, string> = {};
    for (const [key, value] of Object.entries(ctx)) {
      // Only allow string values
      if (typeof value === 'string') {
        const result = contextFieldValueSchema.safeParse(value);
        if (result.success) {
          validated[key] = result.data;
        }
        // Skip invalid values silently
      }
      // Non-string values are ignored
    }
    return validated;
  });

/**
 * Sanitize a context value by removing potential prompt injection patterns
 *
 * @param value - The raw context value
 * @returns Sanitized value with injection patterns removed
 */
export function sanitizeContextValue(value: string): string {
  let sanitized = value;

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // Also escape any remaining angle brackets to prevent XML/HTML injection
  sanitized = sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return sanitized;
}

/**
 * Validate and sanitize user context
 *
 * @param context - Raw user-provided context
 * @returns Validated and sanitized context, or validation error
 */
export function validateUserContext(context: unknown): {
  valid: boolean;
  context?: Record<string, string>;
  error?: string;
} {
  // Null or undefined context is valid (optional field)
  if (context === null || context === undefined) {
    return { valid: true, context: {} };
  }

  // Context must be an object
  if (typeof context !== 'object' || Array.isArray(context)) {
    return {
      valid: false,
      error: 'Context must be an object with string keys and values',
    };
  }

  // Check field count before schema validation
  const fieldCount = Object.keys(context as Record<string, unknown>).length;
  if (fieldCount > MAX_CONTEXT_FIELDS) {
    return {
      valid: false,
      error: `Context cannot have more than ${MAX_CONTEXT_FIELDS} fields`,
    };
  }

  // Validate with Zod schema
  const result = userContextSchema.safeParse(context);

  if (!result.success) {
    const firstError = result.error.issues?.[0];
    return {
      valid: false,
      error: firstError?.message || 'Invalid context format',
    };
  }

  // Sanitize each value
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(result.data)) {
    sanitized[key] = sanitizeContextValue(value);
  }

  return { valid: true, context: sanitized };
}

/**
 * Express middleware factory for context validation
 *
 * Validates the `context` field in the request body.
 * If invalid, returns 400 Bad Request with error details.
 * If valid, replaces req.body.context with sanitized version.
 */
export function validateContextMiddleware() {
  return (req: { body?: { context?: unknown } }, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    if (!req.body?.context) {
      // No context provided, continue
      next();
      return;
    }

    const result = validateUserContext(req.body.context);

    if (!result.valid) {
      res.status(400).json({
        error: 'Bad Request',
        code: 'INVALID_CONTEXT',
        message: result.error,
      });
      return;
    }

    // Replace with sanitized context
    req.body.context = result.context;
    next();
  };
}
