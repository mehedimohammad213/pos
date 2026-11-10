import { query, withTransaction } from '../db/pool';
import { AppError, assertFound } from '../utils/errors';
import { writeAudit } from './auditService';
import { appendLedger } from './saleService';

export async function collectDue(
  input: {
    customer_id: string;
    amount: number;
    method?: string;
    reference?: string;
    allocations?: { sale_id: string; amount: number }[];
    notes?: string;
  },
  userId: string
) {
  if (input.amount <= 0) throw new AppError('Amount must be positive');
  return withTransaction(async (client) => {
    const cust = await client.query(`SELECT * FROM customers WHERE id = $1 FOR UPDATE`, [input.customer_id]);
    const customer = assertFound(cust.rows[0]);
    if (Number(customer.due_balance) < input.amount) {
      throw new AppError('Collection exceeds due balance');
    }

    const pay = await client.query(
      `INSERT INTO payments (customer_id, method, amount, reference, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        input.customer_id,
        input.method ?? 'cash',
        input.amount,
        input.reference ?? null,
        input.notes ?? null,
        userId,
      ]
    );

    await appendLedger(
      client,
      input.customer_id,
      'credit',
      input.amount,
      input.notes || 'Due collection',
      userId,
      undefined,
      pay.rows[0].id
    );

    let remaining = input.amount;
    const allocations =
      input.allocations ||
      (
        await client.query(
          `SELECT id, due_amount FROM sales
           WHERE customer_id = $1 AND due_amount > 0 AND status = 'completed'
           ORDER BY sale_date, created_at`,
          [input.customer_id]
        )
      ).rows.map((r) => ({ sale_id: r.id as string, amount: Number(r.due_amount) }));

    for (const alloc of allocations) {
      if (remaining <= 0) break;
      const apply = Math.min(remaining, alloc.amount);
      await client.query(
        `UPDATE sales SET
           paid_amount = paid_amount + $2,
           due_amount = GREATEST(due_amount - $2, 0),
           payment_status = CASE WHEN due_amount - $2 <= 0 THEN 'paid' ELSE 'partial' END,
           updated_at = NOW()
         WHERE id = $1`,
        [alloc.sale_id, apply]
      );
      remaining = Math.round((remaining - apply) * 100) / 100;
    }

    await writeAudit(userId, 'due.collect', 'customer', input.customer_id, input, client);
    return { payment: pay.rows[0], customer_id: input.customer_id };
  });
}

export async function dueAging() {
  const r = await query(
    `SELECT c.id, c.name, c.phone, c.due_balance, c.credit_limit,
       COALESCE(SUM(CASE WHEN s.sale_date >= CURRENT_DATE - 30 THEN s.due_amount ELSE 0 END),0) AS d0_30,
       COALESCE(SUM(CASE WHEN s.sale_date < CURRENT_DATE - 30 AND s.sale_date >= CURRENT_DATE - 60 THEN s.due_amount ELSE 0 END),0) AS d31_60,
       COALESCE(SUM(CASE WHEN s.sale_date < CURRENT_DATE - 60 AND s.sale_date >= CURRENT_DATE - 90 THEN s.due_amount ELSE 0 END),0) AS d61_90,
       COALESCE(SUM(CASE WHEN s.sale_date < CURRENT_DATE - 90 THEN s.due_amount ELSE 0 END),0) AS d90_plus
     FROM customers c
     LEFT JOIN sales s ON s.customer_id = c.id AND s.due_amount > 0 AND s.status = 'completed'
     WHERE c.deleted_at IS NULL AND c.due_balance > 0
     GROUP BY c.id
     ORDER BY c.due_balance DESC`
  );
  return r.rows;
}

export async function customerLedger(customerId: string) {
  const r = await query(
    `SELECT * FROM customer_ledger WHERE customer_id = $1 ORDER BY created_at DESC`,
    [customerId]
  );
  return r.rows;
}
