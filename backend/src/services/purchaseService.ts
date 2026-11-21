import { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool';
import { nextDocumentNo } from '../utils/documents';
import { AppError, assertFound } from '../utils/errors';
import { writeAudit } from './auditService';
import { addSerials } from './catalogService';
import { formatPaginatedResponse } from '../utils/pagination';

export async function listSuppliers(params?: { page?: number; limit?: number; q?: string }) {
  const where: string[] = ['deleted_at IS NULL'];
  const values: unknown[] = [];
  let i = 1;
  if (params?.q) {
    where.push(`(name ILIKE $${i} OR phone ILIKE $${i})`);
    values.push(`%${params.q}%`);
    i++;
  }

  const isPaginated = params?.page !== undefined || params?.limit !== undefined;
  if (isPaginated) {
    const page = Math.max(1, Number(params?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));
    const offset = (page - 1) * limit;

    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM suppliers WHERE ${where.join(' AND ')}`,
      values
    );
    const total = Number(countRes.rows[0]?.total || 0);

    const dataValues = [...values, limit, offset];
    const r = await query(
      `SELECT * FROM suppliers WHERE ${where.join(' AND ')} ORDER BY name LIMIT $${i++} OFFSET $${i++}`,
      dataValues
    );
    return formatPaginatedResponse(r.rows, total, page, limit);
  }

  const r = await query(`SELECT * FROM suppliers WHERE ${where.join(' AND ')} ORDER BY name`, values);
  return r.rows;
}

export async function createSupplier(input: Record<string, unknown>) {
  const r = await query(
    `INSERT INTO suppliers (name, phone, email, address, notes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [input.name, input.phone ?? null, input.email ?? null, input.address ?? null, input.notes ?? null]
  );
  return r.rows[0];
}

export async function updateSupplier(id: string, input: Record<string, unknown>) {
  const r = await query(
    `UPDATE suppliers SET
       name = COALESCE($2, name),
       phone = COALESCE($3, phone),
       email = COALESCE($4, email),
       address = COALESCE($5, address),
       notes = COALESCE($6, notes),
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [id, input.name ?? null, input.phone ?? null, input.email ?? null, input.address ?? null, input.notes ?? null]
  );
  return assertFound(r.rows[0]);
}

export async function listDemands(
  status?: string,
  params?: { page?: number; limit?: number; q?: string }
) {
  const values: unknown[] = [];
  const whereParts = ['1=1'];
  let i = 1;
  if (status) {
    whereParts.push(`d.status = $${i++}`);
    values.push(status);
  }
  const q = params?.q?.trim();
  if (q) {
    whereParts.push(
      `(d.demand_no ILIKE $${i}
        OR d.status ILIKE $${i}
        OR COALESCE(d.notes, '') ILIKE $${i}
        OR COALESCE(s.name, '') ILIKE $${i}
        OR d.id::text ILIKE $${i}
        OR EXISTS (
          SELECT 1
          FROM purchase_demand_items di
          JOIN products p ON p.id = di.product_id
          WHERE di.demand_id = d.id
            AND (p.name ILIKE $${i} OR COALESCE(p.sku, '') ILIKE $${i} OR COALESCE(p.barcode, '') ILIKE $${i})
        ))`
    );
    values.push(`%${q}%`);
    i++;
  }
  const where = whereParts.join(' AND ');
  const fromSql = `purchase_demands d
     LEFT JOIN suppliers s ON s.id = d.preferred_supplier_id
     LEFT JOIN users u ON u.id = d.created_by`;

  const isPaginated = params?.page !== undefined || params?.limit !== undefined;
  if (isPaginated) {
    const page = Math.max(1, Number(params?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));
    const offset = (page - 1) * limit;

    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM ${fromSql} WHERE ${where}`,
      values
    );
    const total = Number(countRes.rows[0]?.total || 0);

    const dataValues = [...values, limit, offset];
    const r = await query(
      `SELECT d.*, s.name AS supplier_name, u.name AS created_by_name,
              (
                SELECT string_agg(p.name, ', ' ORDER BY p.name)
                FROM purchase_demand_items di
                JOIN products p ON p.id = di.product_id
                WHERE di.demand_id = d.id
              ) AS product_names,
              (
                SELECT COUNT(*)::int
                FROM purchase_demand_items di
                WHERE di.demand_id = d.id
              ) AS item_count
       FROM ${fromSql}
       WHERE ${where}
       ORDER BY d.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      dataValues
    );
    return formatPaginatedResponse(r.rows, total, page, limit);
  }

  const r = await query(
    `SELECT d.*, s.name AS supplier_name, u.name AS created_by_name,
            (
              SELECT string_agg(p.name, ', ' ORDER BY p.name)
              FROM purchase_demand_items di
              JOIN products p ON p.id = di.product_id
              WHERE di.demand_id = d.id
            ) AS product_names,
            (
              SELECT COUNT(*)::int
              FROM purchase_demand_items di
              WHERE di.demand_id = d.id
            ) AS item_count
     FROM ${fromSql}
     WHERE ${where}
     ORDER BY d.created_at DESC`,
    values
  );
  return r.rows;
}

export async function getDemand(id: string, client?: PoolClient) {
  const q = client ? client.query.bind(client) : query;
  const d = await q(
    `SELECT d.*, s.name AS supplier_name FROM purchase_demands d
     LEFT JOIN suppliers s ON s.id = d.preferred_supplier_id WHERE d.id = $1`,
    [id]
  );
  const demand = assertFound(d.rows[0]);
  const items = await q(
    `SELECT i.*, p.name AS product_name, p.sku, p.barcode
     FROM purchase_demand_items i JOIN products p ON p.id = i.product_id
     WHERE i.demand_id = $1`,
    [id]
  );
  return { ...demand, items: items.rows };
}

export async function createDemand(
  input: {
    demand_date?: string;
    preferred_supplier_id?: string;
    notes?: string;
    items: { product_id: string; requested_qty: number; last_cost?: number }[];
  },
  userId: string
) {
  if (!input.items?.length) throw new AppError('Demand needs at least one item');
  const demandId = await withTransaction(async (client) => {
    const demandNo = await nextDocumentNo(client, 'demand', 'DEM');
    const d = await client.query(
      `INSERT INTO purchase_demands (demand_no, demand_date, preferred_supplier_id, notes, status, created_by)
       VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, 'draft', $5) RETURNING *`,
      [demandNo, input.demand_date ?? null, input.preferred_supplier_id ?? null, input.notes ?? null, userId]
    );
    const demand = d.rows[0];
    for (const item of input.items) {
      await client.query(
        `INSERT INTO purchase_demand_items (demand_id, product_id, requested_qty, last_cost)
         VALUES ($1,$2,$3,$4)`,
        [demand.id, item.product_id, item.requested_qty, item.last_cost ?? 0]
      );
    }
    await writeAudit(userId, 'demand.create', 'purchase_demand', demand.id, { demandNo }, client);
    return demand.id;
  });
  return getDemand(demandId);
}

export async function updateDemandStatus(id: string, status: string, userId: string) {
  const allowed = ['draft', 'ordered', 'cancelled'];
  if (!allowed.includes(status)) throw new AppError('Invalid status transition');
  const r = await query(
    `UPDATE purchase_demands SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status]
  );
  const demand = assertFound(r.rows[0]);
  await writeAudit(userId, 'demand.status', 'purchase_demand', id, { status });
  return demand;
}

export async function updateDemand(
  id: string,
  input: {
    demand_date?: string;
    preferred_supplier_id?: string | null;
    notes?: string | null;
    items?: { product_id: string; requested_qty: number; last_cost?: number }[];
  },
  userId: string
) {
  const existing = await getDemand(id);
  if (!['draft', 'ordered', 'cancelled'].includes(existing.status)) {
    throw new AppError('Only draft/ordered/cancelled demands can be edited', 400);
  }
  if (input.items !== undefined && !input.items.length) {
    throw new AppError('Demand needs at least one item');
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE purchase_demands SET
         demand_date = COALESCE($2::date, demand_date),
         preferred_supplier_id = COALESCE($3, preferred_supplier_id),
         notes = COALESCE($4, notes),
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        input.demand_date ?? null,
        input.preferred_supplier_id === undefined ? null : input.preferred_supplier_id,
        input.notes === undefined ? null : input.notes,
      ]
    );

    if (input.items) {
      const received = (existing.items || []).some(
        (i: { received_qty?: number }) => Number(i.received_qty || 0) > 0
      );
      if (received) {
        throw new AppError('Cannot edit items after stock has been received', 400);
      }
      await client.query(`DELETE FROM purchase_demand_items WHERE demand_id = $1`, [id]);
      for (const item of input.items) {
        await client.query(
          `INSERT INTO purchase_demand_items (demand_id, product_id, requested_qty, last_cost)
           VALUES ($1,$2,$3,$4)`,
          [id, item.product_id, item.requested_qty, item.last_cost ?? 0]
        );
      }
    }

    await writeAudit(userId, 'demand.update', 'purchase_demand', id, {
      demand_no: existing.demand_no,
    }, client);
  });

  return getDemand(id);
}

export async function deleteDemand(id: string, userId: string) {
  const existing = await getDemand(id);
  if (!['draft', 'cancelled'].includes(existing.status)) {
    throw new AppError('Only draft or cancelled demands can be deleted', 400);
  }
  const linked = await query(`SELECT id FROM purchases WHERE demand_id = $1 LIMIT 1`, [id]);
  if (linked.rows[0]) {
    throw new AppError('Demand is linked to a purchase and cannot be deleted', 400);
  }
  await query(`DELETE FROM purchase_demands WHERE id = $1`, [id]);
  await writeAudit(userId, 'demand.delete', 'purchase_demand', id, { demand_no: existing.demand_no });
  return { ok: true, id };
}

export async function updatePurchase(
  id: string,
  input: {
    supplier_id?: string | null;
    invoice_no?: string | null;
    purchase_date?: string;
    notes?: string | null;
  },
  userId: string
) {
  await getPurchase(id);
  const r = await query(
    `UPDATE purchases SET
       supplier_id = COALESCE($2, supplier_id),
       invoice_no = COALESCE($3, invoice_no),
       purchase_date = COALESCE($4::date, purchase_date),
       notes = COALESCE($5, notes),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      input.supplier_id === undefined ? null : input.supplier_id,
      input.invoice_no === undefined ? null : input.invoice_no,
      input.purchase_date ?? null,
      input.notes === undefined ? null : input.notes,
    ]
  );
  const purchase = assertFound(r.rows[0], 'Purchase not found');
  await writeAudit(userId, 'purchase.update', 'purchase', id, input);
  return getPurchase(purchase.id);
}

export async function deletePurchase(id: string, userId: string) {
  return withTransaction(async (client) => {
    const purchase = await getPurchase(id, client);
    const soldSerial = await client.query(
      `SELECT id FROM serials
       WHERE purchase_id = $1 AND (status = 'sold' OR sale_item_id IS NOT NULL)
       LIMIT 1`,
      [id]
    );
    if (soldSerial.rows[0]) {
      throw new AppError('Cannot delete purchase: one or more serials were already sold', 400);
    }

    for (const item of purchase.items || []) {
      await client.query(
        `UPDATE product_stock
         SET quantity = GREATEST(quantity - $2, 0), updated_at = NOW()
         WHERE product_id = $1`,
        [item.product_id, Number(item.quantity)]
      );
    }

    await client.query(`DELETE FROM serials WHERE purchase_id = $1 AND status = 'in_stock'`, [id]);
    await client.query(`UPDATE serials SET purchase_id = NULL WHERE purchase_id = $1`, [id]);

    if (purchase.supplier_id && Number(purchase.due_amount || 0) > 0) {
      await client.query(
        `UPDATE suppliers
         SET due_balance = GREATEST(due_balance - $2, 0), updated_at = NOW()
         WHERE id = $1`,
        [purchase.supplier_id, Number(purchase.due_amount)]
      );
    }

    await client.query(`DELETE FROM supplier_payments WHERE purchase_id = $1`, [id]);
    await client.query(`DELETE FROM purchases WHERE id = $1`, [id]);
    await writeAudit(
      userId,
      'purchase.delete',
      'purchase',
      id,
      { purchase_no: purchase.purchase_no, total: purchase.total },
      client
    );
    return { ok: true, id };
  });
}

export async function deleteSupplier(id: string, userId: string) {
  const existing = await query(`SELECT * FROM suppliers WHERE id = $1 AND deleted_at IS NULL`, [id]);
  const supplier = assertFound(existing.rows[0], 'Supplier not found');
  if (Number(supplier.due_balance || 0) > 0) {
    throw new AppError('Clear supplier balance before deleting', 400);
  }
  const linked = await query(`SELECT id FROM purchases WHERE supplier_id = $1 LIMIT 1`, [id]);
  if (linked.rows[0]) {
    throw new AppError('Supplier has purchases and cannot be deleted', 400);
  }
  const r = await query(
    `UPDATE suppliers SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  const row = assertFound(r.rows[0], 'Supplier not found');
  await writeAudit(userId, 'supplier.delete', 'supplier', id, { name: supplier.name });
  return row;
}

export async function listPurchases(params?: {
  page?: number;
  limit?: number;
  supplier_id?: string;
}) {
  const where: string[] = ['1=1'];
  const values: unknown[] = [];
  let i = 1;
  if (params?.supplier_id) {
    where.push(`p.supplier_id = $${i++}`);
    values.push(params.supplier_id);
  }

  const isPaginated = params?.page !== undefined || params?.limit !== undefined;
  if (isPaginated) {
    const page = Math.max(1, Number(params?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));
    const offset = (page - 1) * limit;

    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM purchases p WHERE ${where.join(' AND ')}`,
      values
    );
    const total = Number(countRes.rows[0]?.total || 0);

    const dataValues = [...values, limit, offset];
    const r = await query(
      `SELECT p.*, s.name AS supplier_name FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.purchase_date DESC, p.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      dataValues
    );
    return formatPaginatedResponse(r.rows, total, page, limit);
  }

  const r = await query(
    `SELECT p.*, s.name AS supplier_name FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.purchase_date DESC, p.created_at DESC`,
    values
  );
  return r.rows;
}

export async function getPurchase(id: string, client?: PoolClient) {
  const q = client ? client.query.bind(client) : query;
  const p = await q(
    `SELECT p.*, s.name AS supplier_name FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = $1`,
    [id]
  );
  const purchase = assertFound(p.rows[0]);
  const items = await q(
    `SELECT i.*, pr.name AS product_name, pr.sku FROM purchase_items i
     JOIN products pr ON pr.id = i.product_id WHERE i.purchase_id = $1`,
    [id]
  );
  return { ...purchase, items: items.rows };
}

type PurchaseLine = {
  product_id: string;
  quantity: number;
  unit_cost: number;
  serials?: string[];
};

export async function createPurchase(
  input: {
    supplier_id?: string;
    demand_id?: string;
    invoice_no?: string;
    purchase_date?: string;
    notes?: string;
    paid_amount?: number;
    items: PurchaseLine[];
  },
  userId: string
) {
  if (!input.items?.length) throw new AppError('Purchase needs items');
  const purchaseId = await withTransaction(async (client) => {
    const purchaseNo = await nextDocumentNo(client, 'purchase', 'PUR');
    let subtotal = 0;
    for (const item of input.items) {
      subtotal += item.quantity * item.unit_cost;
      if (item.serials?.length && item.serials.length !== item.quantity) {
        throw new AppError(`Serial count must match quantity for product ${item.product_id}`);
      }
    }
    const paid = Number(input.paid_amount || 0);
    const due = Math.max(subtotal - paid, 0);
    const p = await client.query(
      `INSERT INTO purchases
       (purchase_no, supplier_id, demand_id, invoice_no, purchase_date, subtotal, total, paid_amount, due_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,COALESCE($5::date,CURRENT_DATE),$6,$6,$7,$8,$9,$10) RETURNING *`,
      [
        purchaseNo,
        input.supplier_id ?? null,
        input.demand_id ?? null,
        input.invoice_no ?? null,
        input.purchase_date ?? null,
        subtotal,
        paid,
        due,
        input.notes ?? null,
        userId,
      ]
    );
    const purchase = p.rows[0];

    for (const item of input.items) {
      const lineTotal = item.quantity * item.unit_cost;
      await client.query(
        `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, line_total)
         VALUES ($1,$2,$3,$4,$5)`,
        [purchase.id, item.product_id, item.quantity, item.unit_cost, lineTotal]
      );
      await client.query(
        `INSERT INTO product_stock (product_id, quantity) VALUES ($1,$2)
         ON CONFLICT (product_id) DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity, updated_at = NOW()`,
        [item.product_id, item.quantity]
      );
      await client.query(`UPDATE products SET cost = $2, updated_at = NOW() WHERE id = $1`, [
        item.product_id,
        item.unit_cost,
      ]);
      if (item.serials?.length) {
        await addSerials(item.product_id, item.serials, userId, client, purchase.id);
      }
      if (input.demand_id) {
        await client.query(
          `UPDATE purchase_demand_items SET received_qty = received_qty + $3
           WHERE demand_id = $1 AND product_id = $2`,
          [input.demand_id, item.product_id, item.quantity]
        );
      }
    }

    if (input.supplier_id && due > 0) {
      await client.query(`UPDATE suppliers SET due_balance = due_balance + $2, updated_at = NOW() WHERE id = $1`, [
        input.supplier_id,
        due,
      ]);
    }
    if (input.supplier_id && paid > 0) {
      await client.query(
        `INSERT INTO supplier_payments (supplier_id, purchase_id, amount, method, created_by)
         VALUES ($1,$2,$3,'cash',$4)`,
        [input.supplier_id, purchase.id, paid, userId]
      );
    }

    if (input.demand_id) {
      const progress = await client.query(
        `SELECT
           SUM(requested_qty) AS req,
           SUM(received_qty) AS rec
         FROM purchase_demand_items WHERE demand_id = $1`,
        [input.demand_id]
      );
      const req = Number(progress.rows[0].req || 0);
      const rec = Number(progress.rows[0].rec || 0);
      const status = rec <= 0 ? 'ordered' : rec >= req ? 'received' : 'partially_received';
      await client.query(`UPDATE purchase_demands SET status = $2, updated_at = NOW() WHERE id = $1`, [
        input.demand_id,
        status,
      ]);
    }

    await writeAudit(userId, 'purchase.create', 'purchase', purchase.id, { purchaseNo }, client);
    return purchase.id;
  });
  return getPurchase(purchaseId);
}

export async function paySupplier(
  input: { supplier_id: string; amount: number; purchase_id?: string; method?: string; notes?: string },
  userId: string
) {
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO supplier_payments (supplier_id, purchase_id, amount, method, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        input.supplier_id,
        input.purchase_id ?? null,
        input.amount,
        input.method ?? 'cash',
        input.notes ?? null,
        userId,
      ]
    );
    await client.query(
      `UPDATE suppliers SET due_balance = GREATEST(due_balance - $2, 0), updated_at = NOW() WHERE id = $1`,
      [input.supplier_id, input.amount]
    );
    if (input.purchase_id) {
      await client.query(
        `UPDATE purchases SET
           paid_amount = paid_amount + $2,
           due_amount = GREATEST(due_amount - $2, 0),
           updated_at = NOW()
         WHERE id = $1`,
        [input.purchase_id, input.amount]
      );
    }
    await writeAudit(userId, 'supplier.payment', 'supplier', input.supplier_id, input, client);
    return { ok: true };
  });
}
