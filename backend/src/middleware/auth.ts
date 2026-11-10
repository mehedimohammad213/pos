import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, PermissionKey, ROLE_DEFAULT_PERMISSIONS } from '../config';
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

export function authRequired(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401));
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwtAccessSecret) as jwt.JwtPayload;
    req.user = {
      id: String(payload.sub),
      role: String(payload.role),
      email: String(payload.email),
      name: String(payload.name),
      permissions: (payload.permissions as PermissionKey[]) || [],
    };
    next();
  } catch {
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
