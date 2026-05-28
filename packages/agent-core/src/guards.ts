import { z } from 'zod/v4';
import {
  ObservationResultSchema,
  PlanResultSchema,
  ExecResultSchema,
  VerdictResultSchema,
} from '@eata/shared-types';
import type {
  ObservationResult,
  PlanResult,
  ExecResult,
  VerdictResult,
} from '@eata/shared-types';

export class GuardError extends Error {
  constructor(
    message: string,
    public readonly schemaName: string,
    public readonly cause: z.ZodError | Error,
  ) {
    super(message);
    this.name = 'GuardError';
  }
}

export function guardObservation(data: unknown): ObservationResult {
  try {
    return ObservationResultSchema.parse(data);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      throw new GuardError(
        `Observation validation failed: ${formatZodError(err)}`,
        'ObservationResult',
        err,
      );
    }
    throw new GuardError(
      `Observation validation failed: ${String(err)}`,
      'ObservationResult',
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

export function guardPlan(data: unknown): PlanResult {
  try {
    return PlanResultSchema.parse(data);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      throw new GuardError(
        `Plan validation failed: ${formatZodError(err)}`,
        'PlanResult',
        err,
      );
    }
    throw new GuardError(
      `Plan validation failed: ${String(err)}`,
      'PlanResult',
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

export function guardExecResult(data: unknown): ExecResult {
  try {
    return ExecResultSchema.parse(data);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      throw new GuardError(
        `ExecResult validation failed: ${formatZodError(err)}`,
        'ExecResult',
        err,
      );
    }
    throw new GuardError(
      `ExecResult validation failed: ${String(err)}`,
      'ExecResult',
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

export function guardVerdict(data: unknown): VerdictResult {
  try {
    return VerdictResultSchema.parse(data);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      throw new GuardError(
        `Verdict validation failed: ${formatZodError(err)}`,
        'VerdictResult',
        err,
      );
    }
    throw new GuardError(
      `Verdict validation failed: ${String(err)}`,
      'VerdictResult',
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}
