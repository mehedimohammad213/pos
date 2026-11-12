import { query } from '../db/pool';
import { normalizeBdPhone } from '../utils/phone';
import { AppError, assertFound } from '../utils/errors';
import { formatPaginatedResponse } from '../utils/pagination';

export async function listCustomers(params?: string | {
  q?: string;
  page?: number;
  limit?: number;
}) {
  const q = typeof params === 'string' ? params : params?.q;
  const pageParam = typeof params === 'object' ? params?.page : undefined;
  const limitParam = typeof params === 'object' ? params?.limit : undefined;

  const values: unknown[] = [];
  let where = 'deleted_at IS NULL';
  let i = 1;
  if (q) {
    where += ` AND (name ILIKE $${i} OR phone ILIKE $${i})`;
    values.push(`%${q}%`);
    i++;
  }

  const isPaginated = pageParam !== undefined || limitParam !== undefined;
  if (isPaginated) {
    const page = Math.max(1, Number(pageParam) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitParam) || 20));
    const offset = (page - 1) * limit;

    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM customers WHERE ${where}`,
      values
    );
    const total = Number(countRes.rows[0]?.total || 0);

    const dataValues = [...values, limit, offset];
    const r = await query(
      `SELECT * FROM customers WHERE ${where} ORDER BY name LIMIT $${i++} OFFSET $${i++}`,
      dataValues
    );
    return formatPaginatedResponse(r.rows, total, page, limit);
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
