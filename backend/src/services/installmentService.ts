import { query, withTransaction } from '../db/pool';
import { AppError, assertFound } from '../utils/errors';
import { writeAudit } from './auditService';
import { appendLedger } from './saleService';

export async function listPlans(status?: string) {
  const values: unknown[] = [];
  let where = '1=1';
  if (status) {
    where = 'p.status = $1';
    values.push(status);
  }
  const r = await query(
    `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone, s.invoice_no
     FROM installment_plans p
     JOIN customers c ON c.id = p.customer_id
     JOIN sales s ON s.id = p.sale_id
     WHERE ${where}
     ORDER BY p.created_at DESC`,
    values
  );
  return r.rows;
}

export async function getPlan(id: string) {
  const p = await query(
    `SELECT p.*, c.name AS customer_name, c.phone, s.invoice_no
     FROM installment_plans p
     JOIN customers c ON c.id = p.customer_id
     JOIN sales s ON s.id = p.sale_id
     WHERE p.id = $1`,
    [id]
  );
  const plan = assertFound(p.rows[0]);
  const dues = await query(
    `SELECT * FROM installment_dues WHERE plan_id = $1 ORDER BY installment_no`,
    [id]
  );
  const payments = await query(
    `SELECT * FROM installment_payments WHERE plan_id = $1 ORDER BY paid_at DESC`,
    [id]
  );
  return { ...plan, dues: dues.rows, payments: payments.rows };
}

export async function payInstallment(
  input: { due_id: string; amount: number; method?: string; notes?: string },
  userId: string
) {
  if (input.amount <= 0) throw new AppError('Amount must be positive');
  return withTransaction(async (client) => {
    const dueRes = await client.query(
      `SELECT d.*, p.customer_id, p.id AS plan_id, p.sale_id
       FROM installment_dues d
       JOIN installment_plans p ON p.id = d.plan_id
       WHERE d.id = $1 FOR UPDATE`,
      [input.due_id]
    );
    const due = assertFound(dueRes.rows[0]);
    const remaining = Number(due.amount) - Number(due.paid_amount);
    if (input.amount > remaining) throw new AppError('Amount exceeds installment remaining');

    await client.query(
      `INSERT INTO installment_payments (plan_id, due_id, amount, method, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [due.plan_id, due.id, input.amount, input.method ?? 'cash', input.notes ?? null, userId]
    );

    const newPaid = Number(due.paid_amount) + input.amount;
    const status = newPaid >= Number(due.amount) ? 'paid' : 'partial';
    await client.query(
      `UPDATE installment_dues SET paid_amount = $2, status = $3,
         paid_at = CASE WHEN $3 = 'paid' THEN NOW() ELSE paid_at END
       WHERE id = $1`,
      [due.id, newPaid, status]
    );

    await client.query(
      `INSERT INTO payments (sale_id, customer_id, method, amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [due.sale_id, due.customer_id, input.method ?? 'cash', input.amount, 'EMI payment', userId]
    );

    await client.query(
      `UPDATE sales SET paid_amount = paid_amount + $2, due_amount = GREATEST(due_amount - $2, 0), updated_at = NOW()
       WHERE id = $1`,
      [due.sale_id, input.amount]
    );

    await appendLedger(
      client,
      due.customer_id,
      'credit',
      input.amount,
      `EMI payment #${due.installment_no}`,
      userId,
      due.sale_id
    );

    const open = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM installment_dues WHERE plan_id = $1 AND status != 'paid'`,
      [due.plan_id]
    );
    if (open.rows[0].cnt === 0) {
      await client.query(`UPDATE installment_plans SET status = 'completed' WHERE id = $1`, [due.plan_id]);
      await client.query(`UPDATE sales SET payment_status = 'paid', due_amount = 0 WHERE id = $1`, [due.sale_id]);
    }

    await writeAudit(userId, 'emi.pay', 'installment_due', due.id, input, client);
    return getPlan(due.plan_id);
  });
}

export async function markOverdue() {
  await query(
    `UPDATE installment_dues SET status = 'overdue'
     WHERE status IN ('pending','partial') AND due_date < CURRENT_DATE`
  );
}

export async function overdueList() {
  await markOverdue();
  const r = await query(
    `SELECT d.*, p.customer_id, c.name AS customer_name, c.phone, s.invoice_no
     FROM installment_dues d
     JOIN installment_plans p ON p.id = d.plan_id
     JOIN customers c ON c.id = p.customer_id
     JOIN sales s ON s.id = p.sale_id
     WHERE d.status IN ('overdue','pending','partial') AND d.due_date <= CURRENT_DATE
       AND d.paid_amount < d.amount
     ORDER BY d.due_date`
  );
  return r.rows;
}
