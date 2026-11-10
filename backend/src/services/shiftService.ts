import { query, withTransaction } from '../db/pool';
import { AppError, assertFound } from '../utils/errors';
import { writeAudit } from './auditService';

export async function getOpenShift(userId: string) {
  const r = await query(
    `SELECT * FROM shifts WHERE user_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

export async function openShift(userId: string, openingCash: number) {
  const existing = await getOpenShift(userId);
  if (existing) throw new AppError('Shift already open');
  const r = await query(
    `INSERT INTO shifts (user_id, opening_cash) VALUES ($1,$2) RETURNING *`,
    [userId, openingCash]
  );
  await writeAudit(userId, 'shift.open', 'shift', r.rows[0].id, { openingCash });
  return r.rows[0];
}

export async function closeShift(userId: string, closingCash: number, notes?: string) {
  return withTransaction(async (client) => {
    const open = await client.query(
      `SELECT * FROM shifts WHERE user_id = $1 AND status = 'open' FOR UPDATE`,
      [userId]
    );
    const shift = assertFound(open.rows[0], 'No open shift');
    const pay = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN p.method='cash' THEN p.amount ELSE 0 END),0) AS cash,
         COALESCE(SUM(CASE WHEN p.method='card' THEN p.amount ELSE 0 END),0) AS card,
         COALESCE(SUM(CASE WHEN p.method IN ('bkash','nagad','rocket','mfs') THEN p.amount ELSE 0 END),0) AS mfs
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
       WHERE s.cashier_id = $1 AND s.status='completed'
         AND s.created_at >= $2 AND s.created_at <= NOW()`,
      [userId, shift.opened_at]
    );
    const cashSales = Number(pay.rows[0].cash);
    const expected = Number(shift.opening_cash) + cashSales;
    const r = await client.query(
      `UPDATE shifts SET
         closed_at = NOW(), closing_cash = $2, expected_cash = $3,
         cash_sales = $4, card_sales = $5, mfs_sales = $6,
         notes = $7, status = 'closed'
       WHERE id = $1 RETURNING *`,
      [
        shift.id,
        closingCash,
        expected,
        cashSales,
        Number(pay.rows[0].card),
        Number(pay.rows[0].mfs),
        notes ?? null,
      ]
    );
    await writeAudit(userId, 'shift.close', 'shift', shift.id, { closingCash, expected }, client);
    return r.rows[0];
  });
}

export async function listShifts(limit = 50) {
  const r = await query(
    `SELECT sh.*, u.name AS user_name FROM shifts sh
     JOIN users u ON u.id = sh.user_id
     ORDER BY sh.opened_at DESC LIMIT $1`,
    [limit]
  );
  return r.rows;
}
