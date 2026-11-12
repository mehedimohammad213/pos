import { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool';
import { AppError, assertFound } from '../utils/errors';
import { writeAudit } from './auditService';
import { formatPaginatedResponse } from '../utils/pagination';

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
  page?: number;
  limit?: number;
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

  const isPaginated = params.page !== undefined || params.limit !== undefined;

  if (isPaginated) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const offset = (page - 1) * limit;

    const countRes = await query(
      `SELECT COUNT(DISTINCT p.id)::int AS total
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.id
       WHERE ${where.join(' AND ')}`,
      values
    );
    const total = Number(countRes.rows[0]?.total || 0);

    const dataValues = [...values, limit, offset];
    const r = await query(
      `SELECT p.*, c.name AS category_name, b.name AS brand_name,
              COALESCE(ps.quantity,0) AS stock_qty
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN product_stock ps ON ps.product_id = p.id
       WHERE ${where.join(' AND ')}
       ORDER BY p.name
       LIMIT $${i++} OFFSET $${i++}`,
      dataValues
    );
    return formatPaginatedResponse(r.rows, total, page, limit);
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

export interface ImportBulkOptions {
  updateExisting?: boolean;
  autoCreateCategories?: boolean;
  autoCreateBrands?: boolean;
  autoGenerateSku?: boolean;
  autoGenerateBarcode?: boolean;
}

export interface ImportRowError {
  row: number;
  name?: string;
  sku?: string;
  barcode?: string;
  error: string;
}

export function generateEAN13Barcode(): string {
  const prefix = '200';
  let code = prefix;
  while (code.length < 12) {
    code += Math.floor(Math.random() * 10).toString();
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return code + check;
}

export function generateProductSku(name?: string): string {
  const cleanName = (name || '').trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const prefix = cleanName.length >= 3 ? cleanName.slice(0, 3) : 'PRD';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${Date.now().toString(36).slice(-3).toUpperCase()}${rand}`;
}

function normalizeImportRow(raw: Record<string, unknown>): Record<string, unknown> {
  const norm: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const cleanKey = key.trim().toLowerCase().replace(/[\s\-_]+/g, '');
    norm[cleanKey] = typeof value === 'string' ? value.trim() : value;
  }

  const getVal = (...keys: string[]): unknown => {
    for (const k of keys) {
      const cleanK = k.toLowerCase().replace(/[\s\-_]+/g, '');
      if (norm[cleanK] !== undefined && norm[cleanK] !== null && norm[cleanK] !== '') {
        return norm[cleanK];
      }
    }
    return undefined;
  };

  return {
    name: getVal('name', 'productname', 'itemname', 'title', 'product'),
    sku: getVal('sku', 'itemcode', 'code', 'productcode'),
    barcode: getVal('barcode', 'upc', 'ean', 'barcodevalue'),
    category: getVal('category', 'categoryname', 'categoryid'),
    brand: getVal('brand', 'brandname', 'brandid'),
    unit: getVal('unit', 'uom') || 'pcs',
    retail_price: getVal('retailprice', 'price', 'sellingprice', 'mrp', 'retail'),
    wholesale_price: getVal('wholesaleprice', 'wholesale', 'dealerprice', 'tradeprice'),
    cost: getVal('cost', 'costprice', 'purchaseprice', 'buyingprice'),
    initial_qty: getVal('initialqty', 'stock', 'quantity', 'qty', 'stockqty', 'initialstock'),
    reorder_level: getVal('reorderlevel', 'alertqty', 'minstock', 'reorderqty'),
    warranty_months: getVal('warrantymonths', 'warranty', 'warrantyperiod'),
    serial_required: getVal('serialrequired', 'trackserial', 'serialtrack', 'hasserial', 'serial'),
    tax_percent: getVal('taxpercent', 'tax', 'vat'),
  };
}

export async function importProductsBulk(
  rawRows: Record<string, unknown>[],
  options?: ImportBulkOptions,
  userId?: string
) {
  const updateExisting = options?.updateExisting ?? false;
  const autoCreateCategories = options?.autoCreateCategories ?? true;
  const autoCreateBrands = options?.autoCreateBrands ?? true;
  const autoGenerateSku = options?.autoGenerateSku ?? true;
  const autoGenerateBarcode = options?.autoGenerateBarcode ?? true;

  // Pre-fetch categories & brands into lookup maps
  const catRes = await query(`SELECT id, LOWER(TRIM(name)) AS norm_name FROM categories WHERE deleted_at IS NULL`);
  const categoryMap = new Map<string, string>();
  for (const c of catRes.rows) {
    categoryMap.set(c.norm_name, c.id);
    categoryMap.set(c.id, c.id);
  }

  const brandRes = await query(`SELECT id, LOWER(TRIM(name)) AS norm_name FROM brands WHERE deleted_at IS NULL`);
  const brandMap = new Map<string, string>();
  for (const b of brandRes.rows) {
    brandMap.set(b.norm_name, b.id);
    brandMap.set(b.id, b.id);
  }

  const seenSkus = new Set<string>();
  const seenBarcodes = new Set<string>();

  const errors: ImportRowError[] = [];
  const createdProducts: unknown[] = [];
  const updatedProducts: unknown[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 1;
    const raw = rawRows[i];
    const norm = normalizeImportRow(raw);

    const name = norm.name ? String(norm.name).trim() : '';
    if (!name) {
      errors.push({ row: rowNum, error: 'Product name is required' });
      continue;
    }

    let sku = norm.sku ? String(norm.sku).trim() : '';
    if (!sku) {
      if (autoGenerateSku) {
        let attempts = 0;
        while (attempts++ < 10) {
          const candidate = generateProductSku(name);
          if (!seenSkus.has(candidate.toLowerCase())) {
            const exists = await query(`SELECT 1 FROM products WHERE sku = $1 LIMIT 1`, [candidate]);
            if (exists.rowCount === 0) {
              sku = candidate;
              break;
            }
          }
        }
      }
      if (!sku) {
        errors.push({ row: rowNum, name, error: 'SKU is required' });
        continue;
      }
    }

    if (seenSkus.has(sku.toLowerCase())) {
      errors.push({ row: rowNum, name, sku, error: `Duplicate SKU "${sku}" within import file` });
      continue;
    }
    seenSkus.add(sku.toLowerCase());

    let barcode = norm.barcode ? String(norm.barcode).trim() : '';
    if (!barcode) {
      if (autoGenerateBarcode) {
        let attempts = 0;
        while (attempts++ < 10) {
          const candidate = generateEAN13Barcode();
          if (!seenBarcodes.has(candidate)) {
            const exists = await query(`SELECT 1 FROM products WHERE barcode = $1 LIMIT 1`, [candidate]);
            if (exists.rowCount === 0) {
              barcode = candidate;
              break;
            }
          }
        }
      }
      if (!barcode) {
        barcode = sku; // fallback to SKU if barcode couldn't be generated
      }
    }

    if (seenBarcodes.has(barcode.toLowerCase())) {
      errors.push({ row: rowNum, name, barcode, error: `Duplicate barcode "${barcode}" within import file` });
      continue;
    }
    seenBarcodes.add(barcode.toLowerCase());

    const retailPrice = Number(norm.retail_price ?? 0);
    if (isNaN(retailPrice) || retailPrice < 0) {
      errors.push({ row: rowNum, name, sku, error: 'Retail price must be a valid positive number' });
      continue;
    }

    const wholesalePrice = Number(norm.wholesale_price ?? 0);
    if (isNaN(wholesalePrice) || wholesalePrice < 0) {
      errors.push({ row: rowNum, name, sku, error: 'Wholesale price must be a valid number' });
      continue;
    }

    const cost = Number(norm.cost ?? 0);
    if (isNaN(cost) || cost < 0) {
      errors.push({ row: rowNum, name, sku, error: 'Cost price must be a valid number' });
      continue;
    }

    const initialQty = Number(norm.initial_qty ?? 0);
    if (isNaN(initialQty) || initialQty < 0) {
      errors.push({ row: rowNum, name, sku, error: 'Initial quantity must be a valid number' });
      continue;
    }

    const reorderLevel = Number(norm.reorder_level ?? 0);
    const warrantyMonths = parseInt(String(norm.warranty_months ?? 0), 10) || 0;
    const taxPercent = Number(norm.tax_percent ?? 0);
    const unit = norm.unit ? String(norm.unit).trim() : 'pcs';

    const serialRaw = String(norm.serial_required ?? '').toLowerCase().trim();
    const serialRequired =
      serialRaw === 'true' || serialRaw === '1' || serialRaw === 'yes' || norm.serial_required === true;

    try {
      // Resolve Category
      let categoryId: string | null = null;
      if (norm.category) {
        const catName = String(norm.category).trim();
        const catKey = catName.toLowerCase();
        if (categoryMap.has(catKey)) {
          categoryId = categoryMap.get(catKey)!;
        } else if (autoCreateCategories) {
          const ins = await query(
            `INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
            [catName]
          );
          categoryId = ins.rows[0].id;
          categoryMap.set(catKey, categoryId!);
          categoryMap.set(categoryId!, categoryId!);
        }
      }

      // Resolve Brand
      let brandId: string | null = null;
      if (norm.brand) {
        const brName = String(norm.brand).trim();
        const brKey = brName.toLowerCase();
        if (brandMap.has(brKey)) {
          brandId = brandMap.get(brKey)!;
        } else if (autoCreateBrands) {
          const ins = await query(
            `INSERT INTO brands (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
            [brName]
          );
          brandId = ins.rows[0].id;
          brandMap.set(brKey, brandId!);
          brandMap.set(brandId!, brandId!);
        }
      }

      // Check if product exists by SKU or barcode
      const existingRes = await query(
        `SELECT id, sku, barcode FROM products WHERE (sku = $1 OR barcode = $2) AND deleted_at IS NULL LIMIT 1`,
        [sku, barcode]
      );
      const existing = existingRes.rows[0];

      if (existing) {
        if (!updateExisting) {
          errors.push({
            row: rowNum,
            name,
            sku,
            barcode,
            error: `Product with SKU "${existing.sku}" or Barcode "${existing.barcode}" already exists`,
          });
          continue;
        }

        // Update product
        const updated = await withTransaction(async (client) => {
          const upd = await client.query(
            `UPDATE products SET
               name = $1,
               category_id = COALESCE($2, category_id),
               brand_id = COALESCE($3, brand_id),
               unit = COALESCE($4, unit),
               cost = $5,
               retail_price = $6,
               wholesale_price = $7,
               tax_percent = $8,
               reorder_level = $9,
               warranty_months = $10,
               serial_required = $11,
               updated_at = NOW()
             WHERE id = $12
             RETURNING *`,
            [
              name,
              categoryId,
              brandId,
              unit,
              cost,
              retailPrice,
              wholesalePrice,
              taxPercent,
              reorderLevel,
              warrantyMonths,
              serialRequired,
              existing.id,
            ]
          );

          if (initialQty > 0) {
            await client.query(
              `INSERT INTO product_stock (product_id, quantity) VALUES ($1, $2)
               ON CONFLICT (product_id) DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity, updated_at = NOW()`,
              [existing.id, initialQty]
            );
          }

          if (userId) {
            await writeAudit(userId, 'product.bulk_update', 'product', existing.id, { sku, retail_price: retailPrice }, client);
          }
          return upd.rows[0];
        });
        updatedProducts.push(updated);
      } else {
        // Create new product
        const created = await withTransaction(async (client) => {
          const ins = await client.query(
            `INSERT INTO products
               (sku, barcode, name, category_id, brand_id, unit, cost, retail_price, wholesale_price,
                tax_percent, reorder_level, warranty_months, serial_required)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING *`,
            [
              sku,
              barcode,
              name,
              categoryId,
              brandId,
              unit,
              cost,
              retailPrice,
              wholesalePrice,
              taxPercent,
              reorderLevel,
              warrantyMonths,
              serialRequired,
            ]
          );
          const prod = ins.rows[0];
          await client.query(
            `INSERT INTO product_stock (product_id, quantity) VALUES ($1, $2)
             ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
            [prod.id, initialQty]
          );

          if (userId) {
            await writeAudit(userId, 'product.bulk_create', 'product', prod.id, { sku }, client);
          }
          return prod;
        });
        createdProducts.push(created);
      }
    } catch (err) {
      errors.push({
        row: rowNum,
        name,
        sku,
        error: err instanceof Error ? err.message : 'Database error processing row',
      });
    }
  }

  return {
    total: rawRows.length,
    successCount: createdProducts.length + updatedProducts.length,
    createdCount: createdProducts.length,
    updatedCount: updatedProducts.length,
    failedCount: errors.length,
    errors,
    products: [...createdProducts, ...updatedProducts],
  };
}

export const importProductsCsv = (rows: Record<string, string>[], userId?: string) =>
  importProductsBulk(rows as unknown as Record<string, unknown>[], undefined, userId);

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

export async function listSerials(params: {
  product_id?: string;
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}) {
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

  const isPaginated = params.page !== undefined || params.limit !== undefined;
  if (isPaginated) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const offset = (page - 1) * limit;

    const countRes = await query(
      `SELECT COUNT(*)::int AS total
       FROM serials s JOIN products p ON p.id = s.product_id
       WHERE ${where.join(' AND ')}`,
      values
    );
    const total = Number(countRes.rows[0]?.total || 0);

    const dataValues = [...values, limit, offset];
    const r = await query(
      `SELECT s.*, p.name AS product_name, p.sku
       FROM serials s JOIN products p ON p.id = s.product_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      dataValues
    );
    return formatPaginatedResponse(r.rows, total, page, limit);
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
