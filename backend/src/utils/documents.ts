import { PoolClient } from 'pg';

export async function nextDocumentNo(
  client: PoolClient,
  name: string,
  prefix: string,
  year = new Date().getFullYear()
): Promise<string> {
  const result = await client.query<{ last_value: number }>(
    `INSERT INTO document_counters (name, year, last_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (name, year)
     DO UPDATE SET last_value = document_counters.last_value + 1
     RETURNING last_value`,
    [name, year]
  );
  const n = result.rows[0].last_value;
  return `${prefix}-${year}-${String(n).padStart(6, '0')}`;
}
