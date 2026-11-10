import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { query } from '../db/pool';
import { resolvePermissions, signAccessToken, signRefreshToken, AuthUser } from '../middleware/auth';
import { AppError, assertFound } from '../utils/errors';
import { writeAudit } from './auditService';

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: Record<string, boolean> | null;
  password_hash: string;
  is_active: boolean;
};

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    permissions: resolvePermissions(row.role, row.permissions),
  };
}

export async function login(email: string, password: string) {
  const result = await query<UserRow>(
    `SELECT id, name, email, role, permissions, password_hash, is_active
     FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()]
  );
  const user = result.rows[0];
  if (!user || !user.is_active) throw new AppError('Invalid credentials', 401);
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new AppError('Invalid credentials', 401);

  const authUser = toAuthUser(user);
  const accessToken = signAccessToken(authUser);
  const refreshToken = signRefreshToken(user.id);
  const refreshHash = await bcrypt.hash(refreshToken, 10);
  await query(`UPDATE users SET refresh_token_hash = $1, updated_at = NOW() WHERE id = $2`, [
    refreshHash,
    user.id,
  ]);
  await writeAudit(user.id, 'login', 'user', user.id);
  return { user: authUser, accessToken, refreshToken };
}

export async function refresh(refreshToken: string) {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as jwt.JwtPayload;
  } catch {
    throw new AppError('Invalid refresh token', 401);
  }
  const userId = String(payload.sub);
  const result = await query<UserRow>(
    `SELECT id, name, email, role, permissions, password_hash, is_active, refresh_token_hash
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  const user = assertFound(result.rows[0], 'User not found') as UserRow & { refresh_token_hash: string | null };
  if (!user.is_active || !user.refresh_token_hash) throw new AppError('Invalid refresh token', 401);
  const match = await bcrypt.compare(refreshToken, user.refresh_token_hash);
  if (!match) throw new AppError('Invalid refresh token', 401);

  const authUser = toAuthUser(user);
  const accessToken = signAccessToken(authUser);
  const newRefresh = signRefreshToken(user.id);
  const refreshHash = await bcrypt.hash(newRefresh, 10);
  await query(`UPDATE users SET refresh_token_hash = $1, updated_at = NOW() WHERE id = $2`, [
    refreshHash,
    user.id,
  ]);
  return { user: authUser, accessToken, refreshToken: newRefresh };
}

export async function logout(userId: string) {
  await query(`UPDATE users SET refresh_token_hash = NULL, updated_at = NOW() WHERE id = $1`, [userId]);
  await writeAudit(userId, 'logout', 'user', userId);
}

export async function createUser(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: string;
  permissions?: Record<string, boolean>;
}) {
  const hash = await bcrypt.hash(input.password, 10);
  const result = await query(
    `INSERT INTO users (name, email, phone, password_hash, role, permissions)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, name, email, phone, role, permissions, is_active, created_at`,
    [
      input.name,
      input.email.toLowerCase(),
      input.phone ?? null,
      hash,
      input.role,
      JSON.stringify(input.permissions || {}),
    ]
  );
  return result.rows[0];
}

export async function listUsers() {
  const result = await query(
    `SELECT id, name, email, phone, role, permissions, is_active, created_at
     FROM users WHERE deleted_at IS NULL ORDER BY created_at`
  );
  return result.rows;
}

export async function updateUser(
  id: string,
  input: Partial<{ name: string; phone: string; role: string; permissions: Record<string, boolean>; is_active: boolean; password: string }>
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (key === 'password') {
      fields.push(`password_hash = $${i++}`);
      values.push(await bcrypt.hash(String(value), 10));
    } else if (key === 'permissions') {
      fields.push(`permissions = $${i++}`);
      values.push(JSON.stringify(value));
    } else {
      fields.push(`${key} = $${i++}`);
      values.push(value);
    }
  }
  if (!fields.length) throw new AppError('No fields to update');
  fields.push('updated_at = NOW()');
  values.push(id);
  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} AND deleted_at IS NULL
     RETURNING id, name, email, phone, role, permissions, is_active`,
    values
  );
  return assertFound(result.rows[0]);
}
