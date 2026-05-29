import { z } from 'zod';

/**
 * Shared validation schemas for common path parameters.
 */

/** Validate that the `:id` path parameter is a valid UUID. */
export const UuidParam = z.object({ id: z.string().uuid() });

/** Validate that the `:id` path parameter is a non-empty string. */
export const IdParam = z.object({ id: z.string().min(1) });
