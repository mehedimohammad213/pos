import { query, withTransaction } from '../db/pool';
import { AuthUser } from '../middleware/auth';
import { nextDocumentNo } from '../utils/documents';
import { AppError, assertFound } from '../utils/errors';
import { writeAudit } from './auditService';
import { appendLedger, createSale, getSale } from './saleService';
import { formatPaginatedResponse } from '../utils/pagination';

export async function createReturn(
  input: {
    sale_id: string;
    reason?: string;
    restock?: boolean;
    items: { sale_item_id: string; quantity: number; serial_id?: string; condition?: 'restock' | 'defective' }[];
  },
  user: AuthUser
) {
  if (!user.permissions.includes('approve_return') && user.role !== 'admin' && user.role !== 'manager') {
    throw new AppError('Return approval permission required', 403);
  }
  if (!input.items?.length) throw new AppError('No return items');

  return withTransaction(async (client) => {
    const sale = await getSale(input.sale_id, client);
    if (sale.status !== 'completed') throw new AppError('Can only return completed sales');
    const returnNo = await nextDocumentNo(client, 'return', 'RET');
    let refund = 0;
    const ret = await client.query(
      `INSERT INTO returns (return_no, sale_id, customer_id, refund_amount, restock, reason, status, created_by, approved_by)
       VALUES ($1,$2,$3,0,$4,$5,'completed',$6,$6) RETURNING *`,
      [
        returnNo,
        sale.id,
        sale.customer_id,
        input.restock !== false,
        input.reason ?? null,
        user.id,
      ]
    );

    for (const item of input.items) {
      const saleItem = (sale.items as Array<Record<string, unknown>>).find((i) => i.id === item.sale_item_id);
      if (!saleItem) throw new AppError('Sale item not found on invoice');
      if (item.quantity > Number(saleItem.quantity)) throw new AppError('Return qty exceeds sold qty');
      const unit = Number(saleItem.unit_price);
      const lineTotal = unit * item.quantity;
      refund += lineTotal;
      const condition = item.condition || (input.restock === false ? 'defective' : 'restock');
      await client.query(
        `INSERT INTO return_items (return_id, sale_item_id, product_id, quantity, unit_price, line_total, serial_id, condition)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          ret.rows[0].id,
          item.sale_item_id,
          saleItem.product_id,
          item.quantity,
          unit,
          lineTotal,
          item.serial_id ?? null,
          condition,
        ]
      );
      if (condition === 'restock') {
        await client.query(
          `UPDATE product_stock SET quantity = quantity + $2, updated_at = NOW() WHERE product_id = $1`,
          [saleItem.product_id, item.quantity]
        );
        if (item.serial_id) {
          await client.query(
            `UPDATE serials SET status = 'returned', updated_at = NOW() WHERE id = $1`,
            [item.serial_id]
          );
          await client.query(
            `UPDATE serials SET status = 'in_stock', sale_item_id = NULL, updated_at = NOW() WHERE id = $1`,
            [item.serial_id]
          );
        }
      } else if (item.serial_id) {
        await client.query(`UPDATE serials SET status = 'defective', updated_at = NOW() WHERE id = $1`, [
          item.serial_id,
        ]);
      }
    }

    await client.query(`UPDATE returns SET refund_amount = $2 WHERE id = $1`, [ret.rows[0].id, refund]);
    if (sale.customer_id && Number(sale.due_amount) > 0) {
      const credit = Math.min(refund, Number(sale.due_amount));
      if (credit > 0) {
        await appendLedger(client, sale.customer_id, 'credit', credit, `Return ${returnNo}`, user.id, sale.id);
        await client.query(
          `UPDATE sales SET due_amount = GREATEST(due_amount - $2, 0), paid_amount = LEAST(total, paid_amount), updated_at = NOW()
           WHERE id = $1`,
          [sale.id, credit]
        );
      }
    }
    await client.query(`UPDATE sales SET status = 'returned', updated_at = NOW() WHERE id = $1`, [sale.id]);
    await writeAudit(user.id, 'return.create', 'return', ret.rows[0].id, { returnNo }, client);
    return { ...ret.rows[0], refund_amount: refund };
  });
}

export async function createExchange(
  input: {
    original_sale_id?: string;
    customer_id?: string;
    fee_amount?: number;
    discount_amount?: number;
    notes?: string;
    return_items: { sale_item_id?: string; product_id: string; quantity: number; unit_price: number; serial_id?: string; condition?: 'restock' | 'defective' }[];
    new_items: { product_id: string; quantity: number; unit_price?: number; serial_ids?: string[] }[];
    sale_type?: 'retail' | 'wholesale';
    payments?: { method: string; amount: number }[];
  },
  user: AuthUser
) {
  if (!input.original_sale_id && !user.permissions.includes('walkin_exchange') && user.role !== 'admin') {
    throw new AppError('Walk-in exchange requires permission', 403);
  }

  return withTransaction(async (client) => {
    let original = null as Awaited<ReturnType<typeof getSale>> | null;
    if (input.original_sale_id) {
      original = await getSale(input.original_sale_id, client);
    }
    const customerId = input.customer_id || original?.customer_id;
    const exchangeNo = await nextDocumentNo(client, 'exchange', 'EXC');

    let returnedValue = 0;
    for (const item of input.return_items) {
      returnedValue += item.unit_price * item.quantity;
      const condition = item.condition || 'restock';
      if (condition === 'restock') {
        await client.query(
          `UPDATE product_stock SET quantity = quantity + $2, updated_at = NOW() WHERE product_id = $1`,
          [item.product_id, item.quantity]
        );
        if (item.serial_id) {
          await client.query(
            `UPDATE serials SET status = 'in_stock', sale_item_id = NULL, updated_at = NOW() WHERE id = $1`,
            [item.serial_id]
          );
        }
      } else if (item.serial_id) {
        await client.query(`UPDATE serials SET status = 'defective', updated_at = NOW() WHERE id = $1`, [
          item.serial_id,
        ]);
      }
    }

    const fee = Number(input.fee_amount || 0);
    const discount = Number(input.discount_amount || 0);
    const provisionalNew = input.new_items.reduce((s, it) => s + (it.unit_price || 0) * it.quantity, 0);
    const net = Math.round((provisionalNew - returnedValue - discount + fee) * 100) / 100;
    const paid = (input.payments || []).reduce((s, p) => s + p.amount, 0);
    const due = Math.max(net - paid, 0);

    const newSale = await createSale(
      {
        customer_id: customerId || undefined,
        sale_type: input.sale_type || (original?.sale_type as 'retail' | 'wholesale') || 'retail',
        items: input.new_items,
        payments: input.payments?.length ? input.payments : net <= 0 ? [{ method: 'cash', amount: 0 }] : [],
        notes: `Exchange ${exchangeNo}`,
        discount_amount: discount,
        skip_due_ledger: true,
      },
      user,
      client
    );

    await client.query(
      `UPDATE sales SET
         total = $2, discount_amount = $3,
         paid_amount = $4, due_amount = $5,
         payment_status = CASE WHEN $5 > 0 THEN CASE WHEN $4 > 0 THEN 'partial' ELSE 'due' END ELSE 'paid' END,
         status = 'completed', notes = COALESCE(notes,'') || ' [exchange]',
         updated_at = NOW()
       WHERE id = $1`,
      [newSale.id, Math.max(net, 0), discount, Math.max(paid, 0), due]
    );

    if (due > 0 && customerId) {
      await appendLedger(
        client,
        customerId,
        'debit',
        due,
        `Exchange net due ${exchangeNo}`,
        user.id,
        newSale.id
      );
    }

    const newValue = provisionalNew;

    const ex = await client.query(
      `INSERT INTO exchanges
       (exchange_no, original_sale_id, new_sale_id, customer_id, returned_value, new_value,
        fee_amount, discount_amount, net_payable, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        exchangeNo,
        input.original_sale_id ?? null,
        newSale.id,
        customerId ?? null,
        returnedValue,
        newValue,
        fee,
        discount,
        net,
        input.notes ?? null,
        user.id,
      ]
    );

    for (const item of input.return_items) {
      await client.query(
        `INSERT INTO exchange_items (exchange_id, direction, product_id, sale_item_id, quantity, unit_price, line_total, serial_id, condition)
         VALUES ($1,'return',$2,$3,$4,$5,$6,$7,$8)`,
        [
          ex.rows[0].id,
          item.product_id,
          item.sale_item_id ?? null,
          item.quantity,
          item.unit_price,
          item.unit_price * item.quantity,
          item.serial_id ?? null,
          item.condition || 'restock',
        ]
      );
    }
    for (const item of input.new_items) {
      const price = item.unit_price ?? 0;
      await client.query(
        `INSERT INTO exchange_items (exchange_id, direction, product_id, quantity, unit_price, line_total)
         VALUES ($1,'new',$2,$3,$4,$5)`,
        [ex.rows[0].id, item.product_id, item.quantity, price, price * item.quantity]
      );
    }

    if (original) {
      await client.query(`UPDATE sales SET status = 'exchanged', updated_at = NOW() WHERE id = $1`, [
        original.id,
      ]);
    }

    await writeAudit(user.id, 'exchange.create', 'exchange', ex.rows[0].id, { exchangeNo, net }, client);
    return { exchange: ex.rows[0], new_sale: await getSale(newSale.id, client) };
  });
}

export async function listReturns(params?: { page?: number; limit?: number }) {
  const isPaginated = params?.page !== undefined || params?.limit !== undefined;
  if (isPaginated) {
    const page = Math.max(1, Number(params?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));
    const offset = (page - 1) * limit;
    const countRes = await query(`SELECT COUNT(*)::int AS total FROM returns`);
    const total = Number(countRes.rows[0]?.total || 0);
    const r = await query(
      `SELECT r.*, s.invoice_no, c.name AS customer_name
       FROM returns r
       JOIN sales s ON s.id = r.sale_id
       LEFT JOIN customers c ON c.id = r.customer_id
       ORDER BY r.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return formatPaginatedResponse(r.rows, total, page, limit);
  }
  const r = await query(
    `SELECT r.*, s.invoice_no, c.name AS customer_name
     FROM returns r
     JOIN sales s ON s.id = r.sale_id
     LEFT JOIN customers c ON c.id = r.customer_id
     ORDER BY r.created_at DESC`
  );
  return r.rows;
}

export async function listExchanges(params?: { page?: number; limit?: number }) {
  const isPaginated = params?.page !== undefined || params?.limit !== undefined;
  if (isPaginated) {
    const page = Math.max(1, Number(params?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));
    const offset = (page - 1) * limit;
    const countRes = await query(`SELECT COUNT(*)::int AS total FROM exchanges`);
    const total = Number(countRes.rows[0]?.total || 0);
    const r = await query(
      `SELECT e.*, os.invoice_no AS original_invoice, ns.invoice_no AS new_invoice, c.name AS customer_name
       FROM exchanges e
       LEFT JOIN sales os ON os.id = e.original_sale_id
       LEFT JOIN sales ns ON ns.id = e.new_sale_id
       LEFT JOIN customers c ON c.id = e.customer_id
       ORDER BY e.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return formatPaginatedResponse(r.rows, total, page, limit);
  }
  const r = await query(
    `SELECT e.*, os.invoice_no AS original_invoice, ns.invoice_no AS new_invoice, c.name AS customer_name
     FROM exchanges e
     LEFT JOIN sales os ON os.id = e.original_sale_id
     LEFT JOIN sales ns ON ns.id = e.new_sale_id
     LEFT JOIN customers c ON c.id = e.customer_id
     ORDER BY e.created_at DESC`
  );
  return r.rows;
}

export async function createWarrantyClaim(
  input: {
    serial_id: string;
    issue_description: string;
    sale_id?: string;
    customer_id?: string;
    notes?: string;
  },
  userId: string
) {
  return withTransaction(async (client) => {
    const serial = await client.query(`SELECT * FROM serials WHERE id = $1`, [input.serial_id]);
    assertFound(serial.rows[0], 'Serial not found');
    const claimNo = await nextDocumentNo(client, 'warranty', 'WRN');
    const r = await client.query(
      `INSERT INTO warranty_claims
       (claim_no, serial_id, sale_id, customer_id, issue_description, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        claimNo,
        input.serial_id,
        input.sale_id ?? null,
        input.customer_id ?? null,
        input.issue_description,
        input.notes ?? null,
        userId,
      ]
    );
    return r.rows[0];
  });
}

export async function resolveWarrantyClaim(
  id: string,
  input: { resolution: 'repair' | 'replace' | 'reject'; status?: string; notes?: string },
  userId: string
) {
  const r = await query(
    `UPDATE warranty_claims SET
       resolution = $2,
       status = COALESCE($3, 'resolved'),
       notes = COALESCE($4, notes),
       resolved_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, input.resolution, input.status ?? 'resolved', input.notes ?? null]
  );
  const claim = assertFound(r.rows[0]);
  await writeAudit(userId, 'warranty.resolve', 'warranty_claim', id, input);
  return claim;
}

export async function listWarrantyClaims(params?: { page?: number; limit?: number }) {
  const isPaginated = params?.page !== undefined || params?.limit !== undefined;
  if (isPaginated) {
    const page = Math.max(1, Number(params?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));
    const offset = (page - 1) * limit;
    const countRes = await query(`SELECT COUNT(*)::int AS total FROM warranty_claims`);
    const total = Number(countRes.rows[0]?.total || 0);
    const r = await query(
      `SELECT w.*, s.serial_number, p.name AS product_name, c.name AS customer_name
       FROM warranty_claims w
       JOIN serials s ON s.id = w.serial_id
       JOIN products p ON p.id = s.product_id
       LEFT JOIN customers c ON c.id = w.customer_id
       ORDER BY w.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return formatPaginatedResponse(r.rows, total, page, limit);
  }
  const r = await query(
    `SELECT w.*, s.serial_number, p.name AS product_name, c.name AS customer_name
     FROM warranty_claims w
     JOIN serials s ON s.id = w.serial_id
     JOIN products p ON p.id = s.product_id
     LEFT JOIN customers c ON c.id = w.customer_id
     ORDER BY w.created_at DESC`
  );
  return r.rows;
}
