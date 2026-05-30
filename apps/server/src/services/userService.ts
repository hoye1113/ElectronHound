/**
 * User service for multi-user authentication and management.
 *
 * Handles user CRUD, password hashing with crypto.scrypt,
 * and API token generation.
 */
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  api_token: string | null;
  created_at: string;
}

export interface UserPublic {
  id: string;
  username: string;
  role: 'admin' | 'user';
  api_token: string | null;
  created_at: string;
}

export class UserService {
  constructor(private db: Database.Database) {}

  /**
   * Hash a password using scrypt with a random salt.
   * Format: salt:hash (both hex-encoded)
   */
  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verify a password against a stored hash.
   * Uses timing-safe comparison to prevent timing attacks.
   */
  verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const hashBuffer = Buffer.from(hash, 'hex');
    const testBuffer = scryptSync(password, salt, 64);
    return timingSafeEqual(hashBuffer, testBuffer);
  }

  /**
   * Generate a random API token (32-byte hex string).
   */
  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Create a new user.
   */
  createUser(username: string, password: string, role: 'admin' | 'user' = 'user'): UserPublic {
    const id = randomUUID();
    const passwordHash = this.hashPassword(password);
    const token = this.generateToken();
    const now = new Date().toISOString();

    this.db.prepare(
      'INSERT INTO users (id, username, password_hash, role, api_token, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, username, passwordHash, role, token, now);

    return { id, username, role, api_token: token, created_at: now };
  }

  /**
   * List all users (without password hashes).
   */
  listUsers(): UserPublic[] {
    const rows = this.db.prepare(
      'SELECT id, username, role, api_token, created_at FROM users ORDER BY created_at ASC'
    ).all() as User[];
    return rows.map(row => ({
      id: row.id,
      username: row.username,
      role: row.role,
      api_token: row.api_token,
      created_at: row.created_at,
    }));
  }

  /**
   * Find a user by username.
   */
  findByUsername(username: string): User | undefined {
    return this.db.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).get(username) as User | undefined;
  }

  /**
   * Find a user by API token.
   */
  findByToken(token: string): User | undefined {
    return this.db.prepare(
      'SELECT * FROM users WHERE api_token = ?'
    ).get(token) as User | undefined;
  }

  /**
   * Find a user by ID.
   */
  findById(id: string): UserPublic | undefined {
    return this.db.prepare(
      'SELECT id, username, role, api_token, created_at FROM users WHERE id = ?'
    ).get(id) as UserPublic | undefined;
  }

  /**
   * Update a user's password.
   */
  updatePassword(userId: string, newPassword: string): boolean {
    const passwordHash = this.hashPassword(newPassword);
    const result = this.db.prepare(
      'UPDATE users SET password_hash = ? WHERE id = ?'
    ).run(passwordHash, userId);
    return result.changes > 0;
  }

  /**
   * Regenerate a user's API token.
   */
  regenerateToken(userId: string): string | null {
    const token = this.generateToken();
    const result = this.db.prepare(
      'UPDATE users SET api_token = ? WHERE id = ?'
    ).run(token, userId);
    return result.changes > 0 ? token : null;
  }

  /**
   * Delete a user.
   */
  deleteUser(userId: string): boolean {
    const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return result.changes > 0;
  }

  /**
   * Validate credentials and return user if valid.
   */
  validateCredentials(username: string, password: string): User | undefined {
    const user = this.findByUsername(username);
    if (!user) return undefined;
    if (!this.verifyPassword(password, user.password_hash)) return undefined;
    return user;
  }
}
