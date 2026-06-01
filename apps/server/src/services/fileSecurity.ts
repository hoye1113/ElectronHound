import { resolve } from 'node:path';

export class PathTraversalError extends Error {
  constructor(path: string) {
    super(`Path traversal detected: ${path}`);
    this.name = 'PathTraversalError';
  }
}

export function validatePath(baseDir: string, targetPath: string): string {
  // Reject empty or whitespace-only target paths
  if (!targetPath || targetPath.trim().length === 0) {
    throw new PathTraversalError(targetPath || '(empty)');
  }

  // Normalize backslashes to forward slashes for cross-platform compatibility
  // This ensures Windows-style paths work on Linux too
  const normalizedTarget = targetPath.replace(/\\/g, '/');

  // Reject paths containing literal '..' segments before resolution
  // This catches obvious traversal attempts regardless of separator style
  const normalizedSegments = normalizedTarget.split('/');
  if (normalizedSegments.includes('..')) {
    throw new PathTraversalError(targetPath);
  }

  const normalizedBase = resolve(baseDir);
  const resolved = resolve(baseDir, normalizedTarget);

  // Cross-platform component comparison: split on forward slash
  // We've already normalized to forward slashes above
  const baseParts = normalizedBase.split('/');
  const resolvedParts = resolved.split('/');

  if (resolvedParts.length < baseParts.length) {
    throw new PathTraversalError(targetPath);
  }

  for (let i = 0; i < baseParts.length; i++) {
    if (resolvedParts[i] !== baseParts[i]) {
      throw new PathTraversalError(targetPath);
    }
  }

  return resolved;
}
