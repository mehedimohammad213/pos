import { query } from '../db/pool';
import { assertFound } from '../utils/errors';

export async function getShopSettings() {
  const result = await query(`SELECT * FROM shop_settings WHERE id = 1`);
  if (!result.rows[0]) {
    await query(`INSERT INTO shop_settings (id, name) VALUES (1, 'Hardware Shop') ON CONFLICT DO NOTHING`);
    const again = await query(`SELECT * FROM shop_settings WHERE id = 1`);
    return again.rows[0];
  }
  return result.rows[0];
}

export async function updateShopSettings(input: Record<string, unknown>) {
  const allowed = ['name', 'logo_url', 'address', 'phone', 'vat_tin', 'default_tax_percent', 'currency', 'invoice_prefix', 'demand_prefix'];
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const key of allowed) {
    if (input[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(input[key]);
    }
  }
  if (!fields.length) return getShopSettings();
  fields.push('updated_at = NOW()');
  const result = await query(
    `UPDATE shop_settings SET ${fields.join(', ')} WHERE id = 1 RETURNING *`,
    values
  );
  return assertFound(result.rows[0]);
}
