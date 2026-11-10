import { query, withTransaction } from '../db/pool';
import { nextDocumentNo } from '../utils/documents';
import { AppError, assertFound } from '../utils/errors';
import { writeAudit } from './auditService';
import { addSerials } from './catalogService';

export async function listSuppliers() {
  const r = await query(`SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY name`);
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

export async function listDemands(status?: string) {
  const values: unknown[] = [];
  let where = '1=1';
  if (status) {
    where = 'd.status = $1';
    values.push(status);
  }
  const r = await query(
    `SELECT d.*, s.name AS supplier_name, u.name AS created_by_name
     FROM purchase_demands d
     LEFT JOIN suppliers s ON s.id = d.preferred_supplier_id
     LEFT JOIN users u ON u.id = d.created_by
     WHERE ${where}
     ORDER BY d.created_at DESC`,
    values
  );
  return r.rows;
}

export async function getDemand(id: string) {
  const d = await query(
    `SELECT d.*, s.name AS supplier_name FROM purchase_demands d
     LEFT JOIN suppliers s ON s.id = d.preferred_supplier_id WHERE d.id = $1`,
    [id]
  );
  const demand = assertFound(d.rows[0]);
  const items = await query(
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
  return withTransaction(async (client) => {
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
    return getDemand(demand.id);
  });
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

export async function listPurchases() {
  const r = await query(
    `SELECT p.*, s.name AS supplier_name FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     ORDER BY p.purchase_date DESC, p.created_at DESC`
  );
  return r.rows;
}

export async function getPurchase(id: string) {
  const p = await query(
    `SELECT p.*, s.name AS supplier_name FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = $1`,
    [id]
  );
  const purchase = assertFound(p.rows[0]);
  const items = await query(
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
  return withTransaction(async (client) => {
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
    return getPurchase(purchase.id);
  });
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
