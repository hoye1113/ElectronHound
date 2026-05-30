/**
 * Authentication routes.
 *
 * POST /auth/login  - Authenticate and return API token
 * GET  /auth/me     - Get current user info
 * POST /auth/register - Create new user (admin only)
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UserService } from '../services/userService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const RegisterSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'user']).default('user'),
});

export async function authRoutes(server: FastifyInstance) {
  const userService = new UserService(server.db);

  // POST /auth/login - Authenticate and return API token
  server.post('/auth/login', async (request, reply) => {
    const parseResult = LoginSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: 'Validation failed', details: parseResult.error.issues };
    }

    const { username, password } = parseResult.data;
    const user = userService.validateCredentials(username, password);

    if (!user) {
      reply.code(401);
      return { error: 'Invalid credentials' };
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      token: user.api_token,
    };
  });

  // GET /auth/me - Get current user info
  server.get('/auth/me', {
    preHandler: [requireAuth(userService)],
  }, async (request) => {
    return { user: request.user };
  });

  // POST /auth/register - Create new user (admin only)
  server.post('/auth/register', {
    preHandler: [requireAdmin(userService)],
  }, async (request, reply) => {
    const parseResult = RegisterSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: 'Validation failed', details: parseResult.error.issues };
    }

    const { username, password, role } = parseResult.data;

    // Check if username already exists
    const existing = userService.findByUsername(username);
    if (existing) {
      reply.code(409);
      return { error: 'Username already exists' };
    }

    const newUser = userService.createUser(username, password, role);

    reply.code(201);
    return { user: newUser };
  });
}
