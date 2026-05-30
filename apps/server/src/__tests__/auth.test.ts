/**
 * Authentication and multi-user tests.
 *
 * Tests:
 * - User service (CRUD, password hashing, token generation)
 * - Auth routes (login, me, register)
 * - Task isolation (user can only see own tasks, admin sees all)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../db/migrations.js';
import { UserService } from '../services/userService.js';
import { buildServer } from '../server.js';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-auth-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

// ── UserService Unit Tests ──────────────────────────────────────────

describe('UserService', () => {
  let db: Database.Database;
  let tmpDir: string;
  let userService: UserService;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'eata-user-service-test-'));
    db = new Database(join(tmpDir, 'test.sqlite3'));
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    userService = new UserService(db);
  });

  afterAll(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clean up users (except the seeded admin)
    db.prepare("DELETE FROM users WHERE username != 'admin'").run();
  });

  describe('Password hashing', () => {
    it('hashes and verifies password correctly', () => {
      const password = 'testpassword123';
      const hash = userService.hashPassword(password);
      expect(hash).toContain(':');
      expect(userService.verifyPassword(password, hash)).toBe(true);
    });

    it('rejects incorrect password', () => {
      const hash = userService.hashPassword('correctpassword');
      expect(userService.verifyPassword('wrongpassword', hash)).toBe(false);
    });

    it('generates unique hashes for same password', () => {
      const hash1 = userService.hashPassword('samepassword');
      const hash2 = userService.hashPassword('samepassword');
      expect(hash1).not.toBe(hash2);
      // Both should still verify
      expect(userService.verifyPassword('samepassword', hash1)).toBe(true);
      expect(userService.verifyPassword('samepassword', hash2)).toBe(true);
    });
  });

  describe('Token generation', () => {
    it('generates 64-character hex token', () => {
      const token = userService.generateToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('generates unique tokens', () => {
      const token1 = userService.generateToken();
      const token2 = userService.generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('User CRUD', () => {
    it('creates a new user', () => {
      const user = userService.createUser('testuser', 'password123', 'user');
      expect(user.id).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.role).toBe('user');
      expect(user.api_token).toHaveLength(64);
      expect(user.created_at).toBeDefined();
    });

    it('finds user by username', () => {
      userService.createUser('findme', 'password123');
      const user = userService.findByUsername('findme');
      expect(user).toBeDefined();
      expect(user!.username).toBe('findme');
    });

    it('finds user by token', () => {
      const created = userService.createUser('tokenuser', 'password123');
      const user = userService.findByToken(created.api_token!);
      expect(user).toBeDefined();
      expect(user!.username).toBe('tokenuser');
    });

    it('finds user by ID', () => {
      const created = userService.createUser('iduser', 'password123');
      const user = userService.findById(created.id);
      expect(user).toBeDefined();
      expect(user!.username).toBe('iduser');
    });

    it('lists all users', () => {
      // Plus the seeded admin
      const users = userService.listUsers();
      const admin = users.find(u => u.username === 'admin');
      expect(admin).toBeDefined();
      expect(admin!.role).toBe('admin');
    });

    it('validates correct credentials', () => {
      userService.createUser('validuser', 'correctpass');
      const user = userService.validateCredentials('validuser', 'correctpass');
      expect(user).toBeDefined();
      expect(user!.username).toBe('validuser');
    });

    it('rejects invalid credentials', () => {
      userService.createUser('invaliduser', 'correctpass');
      const user = userService.validateCredentials('invaliduser', 'wrongpass');
      expect(user).toBeUndefined();
    });

    it('updates user password', () => {
      const user = userService.createUser('pwuser', 'oldpassword');
      const updated = userService.updatePassword(user.id, 'newpassword');
      expect(updated).toBe(true);

      // Old password should fail
      const oldLogin = userService.validateCredentials('pwuser', 'oldpassword');
      expect(oldLogin).toBeUndefined();

      // New password should work
      const newLogin = userService.validateCredentials('pwuser', 'newpassword');
      expect(newLogin).toBeDefined();
    });

    it('regenerates user token', () => {
      const user = userService.createUser('tokenuser', 'password123');
      const oldToken = user.api_token;
      const newToken = userService.regenerateToken(user.id);
      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(oldToken);
    });

    it('deletes user', () => {
      const user = userService.createUser('deleteuser', 'password123');
      const deleted = userService.deleteUser(user.id);
      expect(deleted).toBe(true);

      const found = userService.findByUsername('deleteuser');
      expect(found).toBeUndefined();
    });
  });
});

// ── Auth Routes Integration Tests ───────────────────────────────────

describe('Auth Routes', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;
  let adminToken: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;

    // Get admin token from seeded user
    const admin = db.prepare("SELECT api_token FROM users WHERE username = 'admin'").get() as { api_token: string };
    adminToken = admin.api_token;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('POST /api/auth/login', () => {
    it('returns token for valid credentials', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'admin' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.username).toBe('admin');
      expect(body.user.role).toBe('admin');
      expect(body.token).toBeDefined();
      expect(body.token).toHaveLength(64);
    });

    it('returns 401 for invalid credentials', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'wrongpassword' },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Invalid credentials');
    });

    it('returns 400 for missing username', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'admin' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns user info with valid token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.username).toBe('admin');
      expect(body.user.role).toBe('admin');
    });

    it('returns 401 without token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: 'Bearer invalidtoken' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('supports Basic authentication', async () => {
      const encoded = Buffer.from('admin:admin').toString('base64');
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Basic ${encoded}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.username).toBe('admin');
    });
  });

  describe('POST /api/auth/register', () => {
    it('creates new user as admin', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: 'newuser', password: 'password123', role: 'user' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.user.username).toBe('newuser');
      expect(body.user.role).toBe('user');
      expect(body.user.api_token).toBeDefined();
    });

    it('returns 409 for duplicate username', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: 'admin', password: 'password123' },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Username already exists');
    });

    it('returns 401 without authentication', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { username: 'another', password: 'password123' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for non-admin user', async () => {
      // First create a regular user
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: 'regularuser', password: 'password123', role: 'user' },
      });
      const { user } = JSON.parse(createRes.body);

      // Try to register with regular user token
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { authorization: `Bearer ${user.api_token}` },
        payload: { username: 'shouldfail', password: 'password123' },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});

// ── Task Isolation Tests ────────────────────────────────────────────

describe('Task Isolation', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;
  let adminToken: string;
  let user1Token: string;
  let user2Token: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;

    // Get admin token
    const admin = db.prepare("SELECT api_token FROM users WHERE username = 'admin'").get() as { api_token: string };
    adminToken = admin.api_token;

    // Create two regular users
    const user1Res = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'user1', password: 'password123', role: 'user' },
    });
    user1Token = JSON.parse(user1Res.body).user.api_token;

    const user2Res = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'user2', password: 'password123', role: 'user' },
    });
    user2Token = JSON.parse(user2Res.body).user.api_token;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    // Clean up tasks and steps between tests
    db.prepare('DELETE FROM steps').run();
    db.prepare('DELETE FROM tasks').run();
  });

  it('user can only see their own tasks', async () => {
    // Create task for user1
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${user1Token}` },
      payload: { goal: 'User1 task', targetAppPath: '/app.exe', llmModel: 'gpt-4o' },
    });

    // Create task for user2
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${user2Token}` },
      payload: { goal: 'User2 task', targetAppPath: '/app.exe', llmModel: 'gpt-4o' },
    });

    // User1 should see only their task
    const user1Res = await server.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${user1Token}` },
    });
    const user1Body = JSON.parse(user1Res.body);
    expect(user1Body.data.length).toBe(1);
    expect(user1Body.data[0].goal).toBe('User1 task');

    // User2 should see only their task
    const user2Res = await server.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${user2Token}` },
    });
    const user2Body = JSON.parse(user2Res.body);
    expect(user2Body.data.length).toBe(1);
    expect(user2Body.data[0].goal).toBe('User2 task');
  });

  it('admin can see all tasks', async () => {
    // Create tasks for both users
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${user1Token}` },
      payload: { goal: 'User1 task', targetAppPath: '/app.exe', llmModel: 'gpt-4o' },
    });

    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${user2Token}` },
      payload: { goal: 'User2 task', targetAppPath: '/app.exe', llmModel: 'gpt-4o' },
    });

    // Admin should see both tasks
    const adminRes = await server.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminBody = JSON.parse(adminRes.body);
    expect(adminBody.data.length).toBe(2);
  });

  it('unauthenticated user can see all tasks (backward compatibility)', async () => {
    // Create task
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${user1Token}` },
      payload: { goal: 'Test task', targetAppPath: '/app.exe', llmModel: 'gpt-4o' },
    });

    // Unauthenticated request
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks',
    });
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
  });

  it('user cannot access another user task detail', async () => {
    // Create task for user1
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${user1Token}` },
      payload: { goal: 'Private task', targetAppPath: '/app.exe', llmModel: 'gpt-4o' },
    });
    const taskId = JSON.parse(createRes.body).id;

    // User2 tries to access user1's task
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}`,
      headers: { authorization: `Bearer ${user2Token}` },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Access denied');
  });

  it('admin can access any task detail', async () => {
    // Create task for user1
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${user1Token}` },
      payload: { goal: 'User task', targetAppPath: '/app.exe', llmModel: 'gpt-4o' },
    });
    const taskId = JSON.parse(createRes.body).id;

    // Admin can access
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.task.id).toBe(taskId);
  });

  it('default admin user exists after migration', () => {
    const admin = db.prepare("SELECT * FROM users WHERE username = 'admin'").get() as Record<string, unknown>;
    expect(admin).toBeDefined();
    expect(admin.username).toBe('admin');
    expect(admin.role).toBe('admin');
    expect(admin.api_token).toBeDefined();
    expect(admin.password_hash).toContain(':');
  });
});
