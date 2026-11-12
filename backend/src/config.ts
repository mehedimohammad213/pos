import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 9006),
  databaseUrl: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/hardware_pos'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-32chars'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me-32chars'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:9005',
  nodeEnv: process.env.NODE_ENV || 'development',
};

export type PermissionKey =
  | 'discount'
  | 'void'
  | 'see_cost'
  | 'approve_return'
  | 'wholesale_price'
  | 'backdate_sale'
  | 'manage_users'
  | 'walkin_exchange';

export const ROLE_DEFAULT_PERMISSIONS: Record<string, PermissionKey[]> = {
  admin: ['discount', 'void', 'see_cost', 'approve_return', 'wholesale_price', 'backdate_sale', 'manage_users', 'walkin_exchange'],
  manager: ['discount', 'void', 'see_cost', 'approve_return', 'wholesale_price', 'backdate_sale', 'walkin_exchange'],
  cashier: ['discount'],
  stock: [],
};
