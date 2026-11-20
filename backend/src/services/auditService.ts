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
  // Resolve user_id via subquery so stale JWTs / deleted users don't violate audit_logs_user_id_fkey
  // and roll back the parent business transaction.
  const sql = `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
               VALUES ((SELECT id FROM users WHERE id = $1), $2, $3, $4, $5)`;
  const params = [userId ?? null, action, entityType ?? null, entityId ?? null, details ? JSON.stringify(details) : null];
  if (client) await client.query(sql, params);
  else await query(sql, params);
}
