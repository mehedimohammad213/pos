import { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool';
import { AuthUser } from '../middleware/auth';
import { nextDocumentNo } from '../utils/documents';
import { AppError, assertFound } from '../utils/errors';
import { writeAudit } from './auditService';
import { formatPaginatedResponse } from '../utils/pagination';

export type SaleLineInput = {
  product_id: string;
  quantity: number;
  unit_price?: number;
  discount_amount?: number;
  serial_ids?: string[];
};

export type PaymentInput = {
  method: string;
  amount: number;
  reference?: string;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function loadProduct(client: PoolClient, productId: string) {
  const r = await client.query(
    `SELECT p.*, COALESCE(ps.quantity,0) AS stock_qty
     FROM products p LEFT JOIN product_stock ps ON ps.product_id = p.id
     WHERE p.id = $1 AND p.deleted_at IS NULL AND p.is_active = TRUE`,
    [productId]
  );
  return assertFound(r.rows[0], `Product ${productId} not found`);
}

async function appendLedger(
  client: PoolClient,
  customerId: string,
  entryType: 'debit' | 'credit',
  amount: number,
  description: string,
  userId: string,
  saleId?: string,
  paymentId?: string
) {
  const bal = await client.query(`SELECT due_balance FROM customers WHERE id = $1 FOR UPDATE`, [customerId]);
  const current = Number(bal.rows[0].due_balance);
  const next = entryType === 'debit' ? current + amount : current - amount;
  await client.query(`UPDATE customers SET due_balance = $2, updated_at = NOW() WHERE id = $1`, [
    customerId,
    next,
  ]);
  const r = await client.query(
    `INSERT INTO customer_ledger (customer_id, sale_id, payment_id, entry_type, amount, balance_after, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [customerId, saleId ?? null, paymentId ?? null, entryType, amount, next, description, userId]
  );
  return r.rows[0];
}

async function createSaleTx(
  client: PoolClient,
  input: {
    customer_id?: string;
    sale_type: 'retail' | 'wholesale';
    sale_date?: string;
    discount_amount?: number;
    notes?: string;
    hold?: boolean;
    hold_name?: string;
    items: SaleLineInput[];
    payments?: PaymentInput[];
    installment?: { down_payment: number; months: number; start_date?: string };
    skip_due_ledger?: boolean;
  },
  user: AuthUser
) {
  if (!input.items?.length) throw new AppError('Cart is empty');
  if (input.sale_type === 'wholesale' && !user.permissions.includes('wholesale_price') && user.role !== 'admin') {
    throw new AppError('Wholesale sale not allowed', 403);
  }
  const isBackdated = Boolean(input.sale_date && input.sale_date < new Date().toISOString().slice(0, 10));
  if (isBackdated && !user.permissions.includes('backdate_sale') && user.role !== 'admin') {
    throw new AppError('Backdate sale not allowed', 403);
  }
  if (input.discount_amount && input.discount_amount > 0 && !user.permissions.includes('discount') && user.role !== 'admin') {
    throw new AppError('Discount not allowed', 403);
  }

  const shop = await client.query(`SELECT invoice_prefix, default_tax_percent FROM shop_settings WHERE id = 1`);
    const prefix = shop.rows[0]?.invoice_prefix || 'INV';
    const invoiceNo = input.hold ? `HOLD-${Date.now()}` : await nextDocumentNo(client, 'invoice', prefix);

    let subtotal = 0;
    let taxAmount = 0;
    const computedLines: Array<{
      product: Record<string, unknown>;
      quantity: number;
      unitPrice: number;
      discount: number;
      tax: number;
      lineTotal: number;
      serial_ids?: string[];
    }> = [];

    for (const line of input.items) {
      const product = await loadProduct(client, line.product_id);
      const defaultPrice =
        input.sale_type === 'wholesale' ? Number(product.wholesale_price) : Number(product.retail_price);
      const unitPrice = line.unit_price !== undefined ? Number(line.unit_price) : defaultPrice;
      if (line.unit_price !== undefined && line.unit_price !== defaultPrice) {
        if (!user.permissions.includes('discount') && user.role !== 'admin') {
          throw new AppError('Price override requires permission', 403);
        }
      }
      if (product.serial_required) {
        const serials = line.serial_ids || [];
        if (serials.length !== line.quantity) {
          throw new AppError(`Serials required for ${product.name}`);
        }
      }
      if (!input.hold && Number(product.stock_qty) < line.quantity) {
        throw new AppError(`Insufficient stock for ${product.name}`);
      }
      const discount = Number(line.discount_amount || 0);
      const taxable = unitPrice * line.quantity - discount;
      const tax = round2((taxable * Number(product.tax_percent || 0)) / 100);
      const lineTotal = round2(taxable + tax);
      subtotal += unitPrice * line.quantity;
      taxAmount += tax;
      computedLines.push({
        product,
        quantity: line.quantity,
        unitPrice,
        discount,
        tax,
        lineTotal,
        serial_ids: line.serial_ids,
      });
    }

    const billDiscount = Number(input.discount_amount || 0);
    const total = round2(subtotal - billDiscount + taxAmount);
    const payments = input.payments || [];
    const paidAmount = round2(payments.reduce((s, p) => s + Number(p.amount), 0));
    let dueAmount = round2(Math.max(total - paidAmount, 0));
    let paymentStatus: string = 'paid';
    if (input.hold) paymentStatus = 'paid';
    else if (input.installment) paymentStatus = 'installment';
    else if (dueAmount > 0 && paidAmount > 0) paymentStatus = 'partial';
    else if (dueAmount > 0) paymentStatus = 'due';

    if (dueAmount > 0 && !input.installment) {
      if (!input.customer_id) throw new AppError('Customer required for credit/due sale');
      const cust = await client.query(`SELECT * FROM customers WHERE id = $1 FOR UPDATE`, [input.customer_id]);
      const customer = assertFound(cust.rows[0], 'Customer not found');
      if (Number(customer.due_balance) + dueAmount > Number(customer.credit_limit) && Number(customer.credit_limit) > 0) {
        throw new AppError('Credit limit exceeded');
      }
    }

    const sale = await client.query(
      `INSERT INTO sales
       (invoice_no, customer_id, cashier_id, sale_type, sale_date, is_backdated, status,
        subtotal, discount_amount, tax_amount, total, paid_amount, due_amount, payment_status, notes, hold_name)
       VALUES ($1,$2,$3,$4,COALESCE($5::date,CURRENT_DATE),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        invoiceNo,
        input.customer_id ?? null,
        user.id,
        input.sale_type,
        input.sale_date ?? null,
        isBackdated,
        input.hold ? 'held' : 'completed',
        round2(subtotal),
        billDiscount,
        round2(taxAmount),
        total,
        input.hold ? 0 : paidAmount,
        input.hold ? 0 : dueAmount,
        paymentStatus,
        input.notes ?? null,
        input.hold_name ?? null,
      ]
    );
    const saleRow = sale.rows[0];

    for (const line of computedLines) {
      const item = await client.query(
        `INSERT INTO sale_items
         (sale_id, product_id, quantity, unit_price, cost_at_sale, discount_amount, tax_amount, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          saleRow.id,
          line.product.id,
          line.quantity,
          line.unitPrice,
          line.product.cost,
          line.discount,
          line.tax,
          line.lineTotal,
        ]
      );
      if (!input.hold) {
        await client.query(
          `UPDATE product_stock SET quantity = quantity - $2, updated_at = NOW() WHERE product_id = $1`,
          [line.product.id, line.quantity]
        );
        if (line.serial_ids?.length) {
          for (const serialId of line.serial_ids) {
            const ser = await client.query(
              `UPDATE serials SET status = 'sold', sale_item_id = $2,
                 warranty_expires_at = CASE WHEN warranty_months > 0
                   THEN (COALESCE($3::date, CURRENT_DATE) + (warranty_months || ' months')::interval)::date
                   ELSE NULL END,
                 updated_at = NOW()
               WHERE id = $1 AND product_id = $4 AND status = 'in_stock'
               RETURNING *`,
              [serialId, item.rows[0].id, input.sale_date ?? null, line.product.id]
            );
            if (!ser.rows[0]) throw new AppError(`Serial unavailable: ${serialId}`);
            await client.query(
              `INSERT INTO sale_serials (sale_item_id, serial_id) VALUES ($1,$2)`,
              [item.rows[0].id, serialId]
            );
          }
        }
      }
    }

    if (!input.hold) {
      for (const pay of payments) {
        if (pay.amount <= 0) continue;
        await client.query(
          `INSERT INTO payments (sale_id, customer_id, method, amount, reference, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [saleRow.id, input.customer_id ?? null, pay.method, pay.amount, pay.reference ?? null, user.id]
        );
      }

      if (dueAmount > 0 && input.customer_id && !input.installment && !input.skip_due_ledger) {
        await appendLedger(
          client,
          input.customer_id,
          'debit',
          dueAmount,
          `Due for ${invoiceNo}`,
          user.id,
          saleRow.id
        );
      }

      if (input.installment) {
        if (!input.customer_id) throw new AppError('Customer required for installment');
        const months = input.installment.months;
        if (months < 1) throw new AppError('Invalid installment months');
        const down = Number(input.installment.down_payment || 0);
        const financed = round2(total - down);
        if (financed <= 0) throw new AppError('Installment amount must be positive after down payment');
        const monthly = round2(financed / months);
        const start = input.installment.start_date || new Date().toISOString().slice(0, 10);
        const plan = await client.query(
          `INSERT INTO installment_plans
           (sale_id, customer_id, down_payment, total_amount, months, monthly_amount, start_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7::date) RETURNING *`,
          [saleRow.id, input.customer_id, down, financed, months, monthly, start]
        );
        for (let n = 1; n <= months; n++) {
          const amount = n === months ? round2(financed - monthly * (months - 1)) : monthly;
          await client.query(
            `INSERT INTO installment_dues (plan_id, installment_no, due_date, amount)
             VALUES ($1,$2, ($3::date + (($4 || ' months')::interval)), $5)`,
            [plan.rows[0].id, n, start, n, amount]
          );
        }
        await client.query(
          `UPDATE sales SET payment_status = 'installment', paid_amount = $2, due_amount = $3 WHERE id = $1`,
          [saleRow.id, down, financed]
        );
        if (down > 0) {
          await client.query(
            `INSERT INTO payments (sale_id, customer_id, method, amount, created_by)
             VALUES ($1,$2,'installment',$3,$4)`,
            [saleRow.id, input.customer_id, down, user.id]
          );
        }
        await appendLedger(
          client,
          input.customer_id,
          'debit',
          financed,
          `EMI for ${invoiceNo}`,
          user.id,
          saleRow.id
        );
      }
    }

    if (isBackdated) {
      await writeAudit(
        user.id,
        'sale.backdated',
        'sale',
        saleRow.id,
        { invoiceNo, sale_date: input.sale_date, system_time: new Date().toISOString() },
        client
      );
    }
  await writeAudit(user.id, input.hold ? 'sale.hold' : 'sale.create', 'sale', saleRow.id, { invoiceNo }, client);
  return getSale(saleRow.id, client);
}

export async function createSale(
  input: {
    customer_id?: string;
    sale_type: 'retail' | 'wholesale';
    sale_date?: string;
    discount_amount?: number;
    notes?: string;
    hold?: boolean;
    hold_name?: string;
    items: SaleLineInput[];
    payments?: PaymentInput[];
    installment?: { down_payment: number; months: number; start_date?: string };
    skip_due_ledger?: boolean;
  },
  user: AuthUser,
  client?: PoolClient
) {
  if (client) return createSaleTx(client, input, user);
  return withTransaction((c) => createSaleTx(c, input, user));
}

export type SaleDetail = Record<string, any> & {
  id: string;
  invoice_no: string;
  customer_id: string | null;
  sale_type: 'retail' | 'wholesale';
  status: string;
  discount_amount: number | string;
  notes: string | null;
  total: number | string;
  due_amount: number | string;
  items: Array<Record<string, any>>;
  payments: Array<Record<string, any>>;
  installment_plan: Record<string, any> | null;
  installment_dues: unknown[];
};

export async function getSale(id: string, client?: PoolClient): Promise<SaleDetail> {
  const q = client ? client.query.bind(client) : query;
  const sale = await q(
    `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS cashier_name
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN users u ON u.id = s.cashier_id
     WHERE s.id = $1`,
    [id]
  );
  const row = assertFound(sale.rows[0]);
  const items = await q(
    `SELECT si.*, p.name AS product_name, p.sku, p.barcode, p.serial_required,
            COALESCE(json_agg(json_build_object('serial_id', ss.serial_id, 'serial_number', ser.serial_number))
              FILTER (WHERE ss.id IS NOT NULL), '[]') AS serials
     FROM sale_items si
     JOIN products p ON p.id = si.product_id
     LEFT JOIN sale_serials ss ON ss.sale_item_id = si.id
     LEFT JOIN serials ser ON ser.id = ss.serial_id
     WHERE si.sale_id = $1
     GROUP BY si.id, p.name, p.sku, p.barcode, p.serial_required`,
    [id]
  );
  const payments = await q(`SELECT * FROM payments WHERE sale_id = $1 ORDER BY paid_at`, [id]);
  const plan = await q(`SELECT * FROM installment_plans WHERE sale_id = $1`, [id]);
  let dues: unknown[] = [];
  if (plan.rows[0]) {
    const d = await q(`SELECT * FROM installment_dues WHERE plan_id = $1 ORDER BY installment_no`, [
      plan.rows[0].id,
    ]);
    dues = d.rows;
  }
  return {
    ...row,
    items: items.rows,
    payments: payments.rows,
    installment_plan: plan.rows[0] || null,
    installment_dues: dues,
  } as SaleDetail;
}

export async function listSales(params: {
  from?: string;
  to?: string;
  status?: string;
  sale_type?: string;
  q?: string;
  page?: number;
  limit?: number;
}) {
  const where: string[] = ['1=1'];
  const values: unknown[] = [];
  let i = 1;
  if (params.from) {
    where.push(`s.sale_date >= $` + i++);
    values.push(params.from);
  }
  if (params.to) {
    where.push(`s.sale_date <= $` + i++);
    values.push(params.to);
  }
  if (params.status) {
    where.push(`s.status = $` + i++);
    values.push(params.status);
  }
  if (params.sale_type) {
    where.push(`s.sale_type = $` + i++);
    values.push(params.sale_type);
  }
  if (params.q) {
    where.push(`(s.invoice_no ILIKE $${i} OR c.phone ILIKE $${i} OR c.name ILIKE $${i})`);
    values.push(`%${params.q}%`);
    i++;
  }

  const isPaginated = params.page !== undefined || params.limit !== undefined;
  if (isPaginated) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const offset = (page - 1) * limit;

    const countRes = await query(
      `SELECT COUNT(*)::int AS total
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE ${where.join(' AND ')}`,
      values
    );
    const total = Number(countRes.rows[0]?.total || 0);

    const dataValues = [...values, limit, offset];
    const r = await query(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS cashier_name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.cashier_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.sale_date DESC, s.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      dataValues
    );
    return formatPaginatedResponse(r.rows, total, page, limit);
  }

  const r = await query(
    `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS cashier_name
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN users u ON u.id = s.cashier_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.sale_date DESC, s.created_at DESC
     LIMIT 300`,
    values
  );
  return r.rows;
}

export async function listHeldSales() {
  return listSales({ status: 'held' });
}

export async function recallHold(id: string, user: AuthUser, payments?: PaymentInput[]) {
  const held = await getSale(id);
  if (held.status !== 'held') throw new AppError('Sale is not on hold');
  await query(`UPDATE sales SET status = 'voided', updated_at = NOW() WHERE id = $1`, [id]);
  return createSale(
    {
      customer_id: held.customer_id ?? undefined,
      sale_type: held.sale_type,
      discount_amount: Number(held.discount_amount),
      notes: held.notes ?? undefined,
      items: held.items.map((it: Record<string, unknown>) => ({
        product_id: String(it.product_id),
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        discount_amount: Number(it.discount_amount || 0),
      })),
      payments: payments || [{ method: 'cash', amount: Number(held.total) }],
    },
    user
  );
}

export async function voidSale(id: string, user: AuthUser) {
  if (!user.permissions.includes('void') && user.role !== 'admin') {
    throw new AppError('Void not allowed', 403);
  }
  return withTransaction(async (client) => {
    const sale = await getSale(id, client);
    if (sale.status === 'voided') throw new AppError('Already voided');
    if (sale.status === 'held') {
      await client.query(`UPDATE sales SET status = 'voided', updated_at = NOW() WHERE id = $1`, [id]);
      return getSale(id, client);
    }
    for (const item of sale.items as Array<Record<string, unknown>>) {
      await client.query(
        `UPDATE product_stock SET quantity = quantity + $2, updated_at = NOW() WHERE product_id = $1`,
        [item.product_id, item.quantity]
      );
      const serials = (item.serials as Array<{ serial_id: string }>) || [];
      for (const s of serials) {
        await client.query(
          `UPDATE serials SET status = 'in_stock', sale_item_id = NULL, warranty_expires_at = NULL, updated_at = NOW()
           WHERE id = $1`,
          [s.serial_id]
        );
      }
    }
    if (Number(sale.due_amount) > 0 && sale.customer_id) {
      await appendLedger(
        client,
        sale.customer_id,
        'credit',
        Number(sale.due_amount),
        `Void ${sale.invoice_no}`,
        user.id,
        sale.id
      );
    }
    await client.query(`UPDATE sales SET status = 'voided', updated_at = NOW() WHERE id = $1`, [id]);
    await writeAudit(user.id, 'sale.void', 'sale', id, { invoice: sale.invoice_no }, client);
    return getSale(id, client);
  });
}

export { appendLedger };
