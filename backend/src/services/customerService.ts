import { query } from '../db/pool';
import { normalizeBdPhone } from '../utils/phone';
import { AppError, assertFound } from '../utils/errors';

export async function listCustomers(q?: string) {
  const values: unknown[] = [];
  let where = 'deleted_at IS NULL';
  if (q) {
    where += ` AND (name ILIKE $1 OR phone ILIKE $1)`;
    values.push(`%${q}%`);
  }
  const r = await query(
    `SELECT * FROM customers WHERE ${where} ORDER BY name LIMIT 200`,
    values
  );
  return r.rows;
}

export async function getCustomer(id: string) {
  const r = await query(`SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return assertFound(r.rows[0]);
}

export async function findByPhone(phone: string) {
  const normalized = normalizeBdPhone(phone);
  const r = await query(`SELECT * FROM customers WHERE phone = $1 AND deleted_at IS NULL`, [normalized]);
  return r.rows[0] || null;
}

export async function createCustomer(input: {
  name: string;
  phone: string;
  address?: string;
  nid?: string;
  credit_limit?: number;
}) {
  const phone = normalizeBdPhone(input.phone);
  try {
    const r = await query(
      `INSERT INTO customers (name, phone, address, nid, credit_limit)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [input.name, phone, input.address ?? null, input.nid ?? null, input.credit_limit ?? 0]
    );
    return r.rows[0];
  } catch (err: unknown) {
    if (typeof err === 'object' && err && 'code' in err && (err as { code: string }).code === '23505') {
      throw new AppError('Phone already registered', 409);
    }
    throw err;
  }
}

export async function updateCustomer(
  id: string,
  input: Partial<{ name: string; phone: string; address: string; nid: string; credit_limit: number }>
) {
  const phone = input.phone ? normalizeBdPhone(input.phone) : undefined;
  const r = await query(
    `UPDATE customers SET
       name = COALESCE($2, name),
       phone = COALESCE($3, phone),
       address = COALESCE($4, address),
       nid = COALESCE($5, nid),
       credit_limit = COALESCE($6, credit_limit),
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [id, input.name ?? null, phone ?? null, input.address ?? null, input.nid ?? null, input.credit_limit ?? null]
  );
  return assertFound(r.rows[0]);
}

export async function customerHistory(id: string) {
  const sales = await query(
    `SELECT id, invoice_no, sale_date, sale_type, total, paid_amount, due_amount, payment_status, status
     FROM sales WHERE customer_id = $1 ORDER BY sale_date DESC, created_at DESC LIMIT 100`,
    [id]
  );
  const ledger = await query(
    `SELECT * FROM customer_ledger WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [id]
  );
  return { sales: sales.rows, ledger: ledger.rows };
}
