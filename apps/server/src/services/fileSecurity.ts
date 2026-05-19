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

  // Reject paths containing literal '..' segments before resolution
  // This catches obvious traversal attempts regardless of separator style
  const normalizedSegments = targetPath.replace(/\\/g, '/').split('/');
  if (normalizedSegments.includes('..')) {
    throw new PathTraversalError(targetPath);
  }

  const normalizedBase = resolve(baseDir);
  const resolved = resolve(baseDir, targetPath);

  // Cross-platform component comparison: split on either separator type
  // resolve() normalizes to platform-specific separators, so we detect the style
  const sep = resolved.includes('\\') ? '\\' : '/';
  const baseParts = normalizedBase.split(sep);
  const resolvedParts = resolved.split(sep);

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
