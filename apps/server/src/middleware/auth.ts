/**
 * Authentication middleware for Fastify.
 *
 * Supports two authentication methods:
 * 1. Bearer token: Authorization: Bearer <token>
 * 2. HTTP Basic: Authorization: Basic <base64(username:password)>
 *
 * Attaches the authenticated user to request.context.user.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { UserService, type UserPublic } from '../services/userService.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserPublic;
  }
}

/**
 * Extract and validate authentication from request.
 * Returns user info or null if not authenticated.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  userService: UserService
): Promise<UserPublic | null> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // Bearer token authentication
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    const user = userService.findByToken(token);
    if (!user) return null;

    const userPublic: UserPublic = {
      id: user.id,
      username: user.username,
      role: user.role,
      api_token: user.api_token,
      created_at: user.created_at,
    };
    request.user = userPublic;
    return userPublic;
  }

  // HTTP Basic authentication
  if (authHeader.startsWith('Basic ')) {
    const encoded = authHeader.slice(6).trim();
    if (!encoded) return null;

    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const colonIndex = decoded.indexOf(':');
      if (colonIndex === -1) return null;

      const username = decoded.slice(0, colonIndex);
      const password = decoded.slice(colonIndex + 1);

      const user = userService.validateCredentials(username, password);
      if (!user) return null;

      const userPublic: UserPublic = {
        id: user.id,
        username: user.username,
        role: user.role,
        api_token: user.api_token,
        created_at: user.created_at,
      };
      request.user = userPublic;
      return userPublic;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Pre-handler hook that requires authentication.
 * Returns 401 if not authenticated.
 */
export function requireAuth(userService: UserService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = await authenticate(request, reply, userService);
    if (!user) {
      reply.code(401).send({ error: 'Authentication required' });
    }
  };
}

/**
 * Pre-handler hook that requires admin role.
 * Returns 403 if authenticated but not admin.
 */
export function requireAdmin(userService: UserService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = await authenticate(request, reply, userService);
    if (!user) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }
    if (user.role !== 'admin') {
      reply.code(403).send({ error: 'Admin access required' });
    }
  };
}
