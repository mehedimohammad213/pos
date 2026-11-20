import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, PermissionKey, ROLE_DEFAULT_PERMISSIONS } from '../config';
import { query } from '../db/pool';
import { AppError } from '../utils/errors';

export type AuthUser = {
  id: string;
  role: string;
  email: string;
  name: string;
  permissions: PermissionKey[];
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, name: user.name, permissions: user.permissions },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessExpires as jwt.SignOptions['expiresIn'] }
  );
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpires as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verify JWT and ensure the user still exists / is active.
 * Stale tokens after DB reseed otherwise cause FK errors on sales.cashier_id, audit_logs.user_id, etc.
 */
export async function authRequired(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401));
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwtAccessSecret) as jwt.JwtPayload;
    const userId = String(payload.sub);

    const result = await query<{
      id: string;
      name: string;
      email: string;
      role: string;
      permissions: Record<string, boolean> | null;
      is_active: boolean;
    }>(
      `SELECT id, name, email, role, permissions, is_active
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    const row = result.rows[0];
    if (!row || !row.is_active) {
      return next(new AppError('Invalid or expired token', 401));
    }

    req.user = {
      id: row.id,
      role: row.role,
      email: row.email,
      name: row.name,
      permissions: resolvePermissions(row.role, row.permissions),
    };
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError('Invalid or expired token', 401));
  }
}

export function requireRoles(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Unauthorized', 401));
    if (!roles.includes(req.user.role)) return next(new AppError('Forbidden', 403));
    next();
  };
}

export function requirePermission(...perms: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Unauthorized', 401));
    const has = perms.every((p) => req.user!.permissions.includes(p) || req.user!.role === 'admin');
    if (!has) return next(new AppError('Missing permission', 403));
    next();
  };
}

export function resolvePermissions(role: string, custom?: Record<string, boolean> | null): PermissionKey[] {
  const defaults = ROLE_DEFAULT_PERMISSIONS[role] || [];
  if (!custom) return [...defaults];
  const set = new Set(defaults);
  for (const [key, enabled] of Object.entries(custom)) {
    if (enabled) set.add(key as PermissionKey);
    else set.delete(key as PermissionKey);
  }
  return [...set];
}
