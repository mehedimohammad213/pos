import { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool';
import { AppError, assertFound } from '../utils/errors';
import { writeAudit } from './auditService';

export async function listCategories() {
  const r = await query(`SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name`);
  return r.rows;
}

export async function createCategory(name: string, description?: string) {
  const r = await query(
    `INSERT INTO categories (name, description) VALUES ($1,$2) RETURNING *`,
    [name, description ?? null]
  );
  return r.rows[0];
}

export async function listBrands() {
  const r = await query(`SELECT * FROM brands WHERE deleted_at IS NULL ORDER BY name`);
  return r.rows;
}

export async function createBrand(name: string) {
  const r = await query(`INSERT INTO brands (name) VALUES ($1) RETURNING *`, [name]);
  return r.rows[0];
}

export async function listProducts(params: {
  q?: string;
  category_id?: string;
  brand_id?: string;
  low_stock?: boolean;
  include_inactive?: boolean;
}) {
  const where: string[] = ['p.deleted_at IS NULL'];
  const values: unknown[] = [];
  let i = 1;
  if (!params.include_inactive) where.push('p.is_active = TRUE');
  if (params.q) {
    where.push(`(p.name ILIKE $${i} OR p.sku ILIKE $${i} OR p.barcode ILIKE $${i})`);
    values.push(`%${params.q}%`);
    i++;
  }
  if (params.category_id) {
    where.push(`p.category_id = $${i++}`);
    values.push(params.category_id);
  }
  if (params.brand_id) {
    where.push(`p.brand_id = $${i++}`);
    values.push(params.brand_id);
  }
  if (params.low_stock) {
    where.push(`COALESCE(ps.quantity,0) <= p.reorder_level`);
  }
  const r = await query(
    `SELECT p.*, c.name AS category_name, b.name AS brand_name,
            COALESCE(ps.quantity,0) AS stock_qty
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN product_stock ps ON ps.product_id = p.id
     WHERE ${where.join(' AND ')}
     ORDER BY p.name`,
    values
  );
  return r.rows;
}

export async function getProductByBarcode(code: string) {
  const r = await query(
    `SELECT p.*, COALESCE(ps.quantity,0) AS stock_qty
     FROM products p
     LEFT JOIN product_stock ps ON ps.product_id = p.id
     WHERE p.barcode = $1 AND p.deleted_at IS NULL AND p.is_active = TRUE`,
    [code]
  );
  return assertFound(r.rows[0], 'Product not found for barcode/QR');
}

export async function getProduct(id: string) {
  const r = await query(
    `SELECT p.*, COALESCE(ps.quantity,0) AS stock_qty, c.name AS category_name, b.name AS brand_name
     FROM products p
     LEFT JOIN product_stock ps ON ps.product_id = p.id
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN brands b ON b.id = p.brand_id
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id]
  );
  return assertFound(r.rows[0]);
}

export async function createProduct(input: Record<string, unknown>, userId?: string) {
  return withTransaction(async (client) => {
    const r = await client.query(
      `INSERT INTO products
       (sku, barcode, name, category_id, brand_id, unit, cost, retail_price, wholesale_price,
        tax_percent, reorder_level, warranty_months, serial_required, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        input.sku,
        input.barcode,
        input.name,
        input.category_id ?? null,
        input.brand_id ?? null,
        input.unit ?? 'pcs',
        input.cost ?? 0,
        input.retail_price ?? 0,
        input.wholesale_price ?? 0,
        input.tax_percent ?? 0,
        input.reorder_level ?? 0,
        input.warranty_months ?? 0,
        input.serial_required ?? false,
        input.image_url ?? null,
      ]
    );
    const product = r.rows[0];
    await client.query(
      `INSERT INTO product_stock (product_id, quantity) VALUES ($1, $2)`,
      [product.id, input.initial_qty ?? 0]
    );
    await writeAudit(userId, 'product.create', 'product', product.id, { sku: product.sku }, client);
    return product;
  });
}

export async function updateProduct(id: string, input: Record<string, unknown>, userId?: string) {
  const allowed = [
    'sku', 'barcode', 'name', 'category_id', 'brand_id', 'unit', 'cost', 'retail_price',
    'wholesale_price', 'tax_percent', 'reorder_level', 'warranty_months', 'serial_required',
    'image_url', 'is_active',
  ];
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const key of allowed) {
    if (input[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(input[key]);
    }
  }
  if (!fields.length) throw new AppError('No fields to update');
  fields.push('updated_at = NOW()');
  values.push(id);
  const r = await query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`,
    values
  );
  const product = assertFound(r.rows[0]);
  if (input.cost !== undefined || input.retail_price !== undefined || input.wholesale_price !== undefined) {
    await writeAudit(userId, 'product.price_change', 'product', id, input);
  }
  return product;
}

export async function importProductsCsv(rows: Record<string, string>[], userId?: string) {
  const created = [];
  for (const row of rows) {
    const product = await createProduct(
      {
        sku: row.sku,
        barcode: row.barcode,
        name: row.name,
        unit: row.unit || 'pcs',
        cost: Number(row.cost || 0),
        retail_price: Number(row.retail_price || 0),
        wholesale_price: Number(row.wholesale_price || 0),
        tax_percent: Number(row.tax_percent || 0),
        reorder_level: Number(row.reorder_level || 0),
        warranty_months: Number(row.warranty_months || 0),
        serial_required: String(row.serial_required || '').toLowerCase() === 'true',
        initial_qty: Number(row.initial_qty || 0),
      },
      userId
    );
    created.push(product);
  }
  return { imported: created.length, products: created };
}

export async function adjustStock(
  productId: string,
  quantityChange: number,
  reason: string,
  notes: string | undefined,
  userId: string
) {
  return withTransaction(async (client) => {
    const stock = await client.query(
      `UPDATE product_stock SET quantity = quantity + $1, updated_at = NOW()
       WHERE product_id = $2 RETURNING *`,
      [quantityChange, productId]
    );
    if (!stock.rows[0]) {
      if (quantityChange < 0) throw new AppError('Product stock not found');
      await client.query(`INSERT INTO product_stock (product_id, quantity) VALUES ($1,$2)`, [
        productId,
        quantityChange,
      ]);
    } else if (Number(stock.rows[0].quantity) < 0) {
      throw new AppError('Insufficient stock for adjustment');
    }
    await client.query(
      `INSERT INTO stock_adjustments (product_id, quantity_change, reason, notes, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [productId, quantityChange, reason, notes ?? null, userId]
    );
    await writeAudit(userId, 'stock.adjust', 'product', productId, { quantityChange, reason }, client);
    return getProduct(productId);
  });
}

export async function listSerials(params: { product_id?: string; status?: string; q?: string }) {
  const where: string[] = ['1=1'];
  const values: unknown[] = [];
  let i = 1;
  if (params.product_id) {
    where.push(`s.product_id = $${i++}`);
    values.push(params.product_id);
  }
  if (params.status) {
    where.push(`s.status = $${i++}`);
    values.push(params.status);
  }
  if (params.q) {
    where.push(`s.serial_number ILIKE $${i++}`);
    values.push(`%${params.q}%`);
  }
  const r = await query(
    `SELECT s.*, p.name AS product_name, p.sku
     FROM serials s JOIN products p ON p.id = s.product_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.created_at DESC LIMIT 500`,
    values
  );
  return r.rows;
}

export async function addSerials(
  productId: string,
  serialNumbers: string[],
  userId?: string,
  client?: PoolClient,
  purchaseId?: string
) {
  const run = async (c: PoolClient) => {
    const inserted = [];
    for (const sn of serialNumbers) {
      const r = await c.query(
        `INSERT INTO serials (product_id, serial_number, status, purchase_id, warranty_months)
         SELECT $1, $2, 'in_stock', $3, warranty_months FROM products WHERE id = $1
         RETURNING *`,
        [productId, sn.trim(), purchaseId ?? null]
      );
      inserted.push(r.rows[0]);
    }
    if (userId) await writeAudit(userId, 'serial.add', 'product', productId, { count: inserted.length }, c);
    return inserted;
  };
  if (client) return run(client);
  return withTransaction(run);
}

export async function lowStockDemandList() {
  const r = await query(
    `SELECT p.id, p.sku, p.barcode, p.name, p.reorder_level, p.cost AS last_cost,
            COALESCE(ps.quantity,0) AS current_qty,
            GREATEST(p.reorder_level * 2 - COALESCE(ps.quantity,0), p.reorder_level) AS suggested_qty
     FROM products p
     LEFT JOIN product_stock ps ON ps.product_id = p.id
     WHERE p.deleted_at IS NULL AND p.is_active = TRUE
       AND COALESCE(ps.quantity,0) <= p.reorder_level
     ORDER BY (COALESCE(ps.quantity,0) / NULLIF(p.reorder_level,0)) NULLS FIRST, p.name`
  );
  return r.rows;
}
