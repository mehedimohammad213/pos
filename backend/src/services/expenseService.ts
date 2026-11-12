import { query } from '../db/pool';
import { assertFound } from '../utils/errors';
import { formatPaginatedResponse } from '../utils/pagination';

export async function listExpenseCategories() {
  const r = await query(`SELECT * FROM expense_categories ORDER BY name`);
  return r.rows;
}

export async function createExpenseCategory(name: string) {
  const r = await query(`INSERT INTO expense_categories (name) VALUES ($1) RETURNING *`, [name]);
  return r.rows[0];
}

export async function listExpenses(from?: string, to?: string, params?: { page?: number; limit?: number }) {
  const where: string[] = ['1=1'];
  const values: unknown[] = [];
  let i = 1;
  if (from) {
    where.push(`e.expense_date >= $${i++}`);
    values.push(from);
  }
  if (to) {
    where.push(`e.expense_date <= $${i++}`);
    values.push(to);
  }

  const isPaginated = params?.page !== undefined || params?.limit !== undefined;
  if (isPaginated) {
    const page = Math.max(1, Number(params?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));
    const offset = (page - 1) * limit;

    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM expenses e WHERE ${where.join(' AND ')}`,
      values
    );
    const total = Number(countRes.rows[0]?.total || 0);

    const dataValues = [...values, limit, offset];
    const r = await query(
      `SELECT e.*, c.name AS category_name, u.name AS created_by_name
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE ${where.join(' AND ')}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      dataValues
    );
    return formatPaginatedResponse(r.rows, total, page, limit);
  }

  const r = await query(
    `SELECT e.*, c.name AS category_name, u.name AS created_by_name
     FROM expenses e
     LEFT JOIN expense_categories c ON c.id = e.category_id
     LEFT JOIN users u ON u.id = e.created_by
     WHERE ${where.join(' AND ')}
     ORDER BY e.expense_date DESC, e.created_at DESC`,
    values
  );
  return r.rows;
}

export async function createExpense(
  input: { category_id?: string; amount: number; expense_date?: string; note?: string },
  userId: string
) {
  const r = await query(
    `INSERT INTO expenses (category_id, amount, expense_date, note, created_by)
     VALUES ($1,$2,COALESCE($3::date,CURRENT_DATE),$4,$5) RETURNING *`,
    [input.category_id ?? null, input.amount, input.expense_date ?? null, input.note ?? null, userId]
  );
  return assertFound(r.rows[0]);
}
