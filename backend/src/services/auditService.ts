import { PoolClient } from 'pg';
import { query } from '../db/pool';

export async function writeAudit(
  userId: string | null | undefined,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: unknown,
  client?: PoolClient
) {
  const sql = `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
               VALUES ($1,$2,$3,$4,$5)`;
  const params = [userId ?? null, action, entityType ?? null, entityId ?? null, details ? JSON.stringify(details) : null];
  if (client) await client.query(sql, params);
  else await query(sql, params);
}
