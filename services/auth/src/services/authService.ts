import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { query, transaction } from '../db/postgres.js';
import { blacklistToken } from '../db/redis.js';
import { logger } from '../utils/logger.js';
import { ValidationError, AuthenticationError, ConflictError } from '../middleware/errorHandler.js';
import type { CreateUser, Login, User, JwtPayload } from '../types/index.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserWithPassword extends User {
  password_hash: string;
}

/**
 * Parse JWT expiration string to seconds
 */
const parseExpiresIn = (expiresIn: string): number => {
  const match = expiresIn.match(/^(\d+)([dhms])$/);
  if (!match) return 604800; // default 7 days

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'd': return value * 86400;
    case 'h': return value * 3600;
    case 'm': return value * 60;
    case 's': return value;
    default: return 604800;
  }
};

/**
 * Generate JWT token pair
 */
export const generateTokens = (user: User): TokenPair => {
  const now = Math.floor(Date.now() / 1000);
  const accessExpiresIn = parseExpiresIn(config.jwtExpiresIn);
  const refreshExpiresIn = parseExpiresIn(config.jwtRefreshExpiresIn);

  const accessPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    tenant_id: user.tenant_id,
    email: user.email,
    role: user.role,
    type: 'access',
  };

  const refreshPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    tenant_id: user.tenant_id,
    email: user.email,
    role: user.role,
    type: 'refresh',
  };

  const accessToken = jwt.sign(accessPayload, config.jwtSecret, {
    expiresIn: accessExpiresIn,
  });

  const refreshToken = jwt.sign(refreshPayload, config.jwtSecret, {
    expiresIn: refreshExpiresIn,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: accessExpiresIn,
  };
};

/**
 * Register a new user
 */
export const registerUser = async (data: CreateUser): Promise<{ user: User; tokens: TokenPair }> => {
  // Check if tenant exists
  const tenants = await query<{ id: string }>(
    'SELECT id FROM tenants WHERE id = $1 AND is_active = true',
    [data.tenant_id]
  );

  if (tenants.length === 0) {
    throw new ValidationError('Invalid tenant_id');
  }

  // Check if email already exists for this tenant
  const existing = await query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
    [data.email, data.tenant_id]
  );

  if (existing.length > 0) {
    throw new ConflictError('Email already registered for this tenant');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, config.apiKeyHashRounds);
  const userId = uuidv4();

  // Create user
  const users = await query<User>(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
     RETURNING id, tenant_id, email, name, role, is_active, created_at, updated_at`,
    [userId, data.tenant_id, data.email, passwordHash, data.name, data.role]
  );

  const user = users[0];
  const tokens = generateTokens(user);

  logger.info({ userId: user.id, tenantId: user.tenant_id }, 'User registered');

  return { user, tokens };
};

/**
 * Login user with email and password
 */
export const loginUser = async (data: Login): Promise<{ user: User; tokens: TokenPair }> => {
  // Build query based on whether tenant_id is provided
  let queryText = 'SELECT * FROM users WHERE email = $1 AND is_active = true';
  const queryParams: unknown[] = [data.email];

  if (data.tenant_id) {
    queryText += ' AND tenant_id = $2';
    queryParams.push(data.tenant_id);
  }

  const users = await query<UserWithPassword>(queryText, queryParams);

  if (users.length === 0) {
    throw new AuthenticationError('Invalid email or password');
  }

  // If multiple users found (same email, different tenants), require tenant_id
  if (users.length > 1) {
    throw new ValidationError('Multiple accounts found. Please provide tenant_id');
  }

  const userWithPassword = users[0];

  // Verify password
  const isValid = await bcrypt.compare(data.password, userWithPassword.password_hash);
  if (!isValid) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Remove password from response
  const { password_hash: _, ...user } = userWithPassword;
  const tokens = generateTokens(user as User);

  logger.info({ userId: user.id, tenantId: user.tenant_id }, 'User logged in');

  return { user: user as User, tokens };
};

/**
 * Refresh access token using refresh token
 */
export const refreshAccessToken = async (refreshToken: string): Promise<TokenPair> => {
  try {
    const payload = jwt.verify(refreshToken, config.jwtSecret) as JwtPayload;

    if (payload.type !== 'refresh') {
      throw new AuthenticationError('Invalid token type');
    }

    // Get current user data
    const users = await query<User>(
      'SELECT id, tenant_id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = $1 AND is_active = true',
      [payload.sub]
    );

    if (users.length === 0) {
      throw new AuthenticationError('User not found or inactive');
    }

    const tokens = generateTokens(users[0]);

    logger.info({ userId: users[0].id }, 'Token refreshed');

    return tokens;
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid refresh token');
    }
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Refresh token expired');
    }
    throw err;
  }
};

/**
 * Logout user (blacklist token)
 */
export const logoutUser = async (token: string): Promise<void> => {
  try {
    const payload = jwt.decode(token) as JwtPayload;
    if (payload?.exp) {
      const ttl = payload.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await blacklistToken(token, ttl);
      }
    }
    logger.info({ userId: payload?.sub }, 'User logged out');
  } catch {
    // Ignore decode errors
  }
};

/**
 * Change user password
 */
export const changePassword = async (
  userId: string,
  tenantId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const users = await query<UserWithPassword>(
    'SELECT * FROM users WHERE id = $1 AND tenant_id = $2',
    [userId, tenantId]
  );

  if (users.length === 0) {
    throw new AuthenticationError('User not found');
  }

  const isValid = await bcrypt.compare(currentPassword, users[0].password_hash);
  if (!isValid) {
    throw new AuthenticationError('Current password is incorrect');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, config.apiKeyHashRounds);

  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newPasswordHash, userId]
  );

  logger.info({ userId }, 'Password changed');
};

/**
 * Get user by ID
 */
export const getUserById = async (userId: string, tenantId: string): Promise<User | null> => {
  const users = await query<User>(
    `SELECT id, tenant_id, email, name, role, is_active, created_at, updated_at
     FROM users WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );

  return users[0] || null;
};

/**
 * List users for a tenant
 */
export const listUsers = async (
  tenantId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ users: User[]; total: number }> => {
  const [users, countResult] = await Promise.all([
    query<User>(
      `SELECT id, tenant_id, email, name, role, is_active, created_at, updated_at
       FROM users WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1',
      [tenantId]
    ),
  ]);

  return {
    users,
    total: parseInt(countResult[0].count, 10),
  };
};
