/**
 * Extract a human-readable error message from an unknown thrown value.
 *
 * Handles the common `err instanceof Error ? err.message : String(err)`
 * pattern found throughout the codebase.
 */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
