import bcrypt from 'bcryptjs';
import { pool, query } from './pool';

async function seed() {
  // Clear all application data (keep schema_migrations)
  await query(`
    TRUNCATE TABLE
      invoice_templates,
      audit_logs,
      stock_adjustments,
      shifts,
      warranty_claims,
      exchange_items,
      exchanges,
      return_items,
      returns,
      installment_payments,
      installment_dues,
      installment_plans,
      customer_ledger,
      payments,
      sale_serials,
      sale_items,
      sales,
      supplier_payments,
      purchase_items,
      purchases,
      purchase_demand_items,
      purchase_demands,
      expenses,
      expense_categories,
      serials,
      product_stock,
      products,
      brands,
      categories,
      customers,
      suppliers,
      document_counters,
      shop_settings,
      users
    RESTART IDENTITY CASCADE
  `);

  // shop_settings allows only id=1
  await query(`INSERT INTO shop_settings (id, name, address, phone, default_tax_percent, vat_tin)
    VALUES (1, 'Mehedi Hardware', 'Dhaka, Bangladesh', '01700000000', 0, 'TIN-DEMO')`);

  const passwordHash = await bcrypt.hash('admin123', 10);

  const users = [
    { name: 'Admin', email: 'admin@shop.local', phone: '01700000001', role: 'admin' },
    { name: 'Cashier', email: 'cashier@shop.local', phone: '01700000002', role: 'cashier' },
    { name: 'Manager', email: 'manager@shop.local', phone: '01700000003', role: 'manager' },
    { name: 'Stock Keeper', email: 'stock@shop.local', phone: '01700000004', role: 'stock' },
    { name: 'Cashier Two', email: 'cashier2@shop.local', phone: '01700000005', role: 'cashier' },
  ];
  for (const u of users) {
    await query(
      `INSERT INTO users (name, email, phone, password_hash, role, permissions)
       VALUES ($1,$2,$3,$4,$5,'{}')`,
      [u.name, u.email, u.phone, passwordHash, u.role]
    );
  }

  const categories = ['TV', 'Monitor', 'Laptop', 'CCTV', 'Accessory'];
  for (const name of categories) {
    await query(`INSERT INTO categories (name) VALUES ($1)`, [name]);
  }

  const brands = ['Samsung', 'LG', 'Dell', 'HP', 'Hikvision'];
  for (const name of brands) {
    await query(`INSERT INTO brands (name) VALUES ($1)`, [name]);
  }

  const cat = await query(`SELECT id, name FROM categories ORDER BY name`);
  const brand = await query(`SELECT id, name FROM brands ORDER BY name`);
  const catId = (n: string) => cat.rows.find((r) => r.name === n)?.id as string;
  const brandId = (n: string) => brand.rows.find((r) => r.name === n)?.id as string;

  const products = [
    { sku: 'TV-SAM-43', barcode: '8801234567890', name: 'Samsung 43" Smart TV', category: 'TV', brand: 'Samsung', cost: 32000, retail: 39900, wholesale: 37000, reorder: 2, warranty: 24, serial: true, qty: 12 },
    { sku: 'MON-LG-24', barcode: '8801234567891', name: 'LG 24" Monitor', category: 'Monitor', brand: 'LG', cost: 12000, retail: 15500, wholesale: 14000, reorder: 3, warranty: 12, serial: true, qty: 15 },
    { sku: 'LAP-HP-15', barcode: '8801234567892', name: 'HP 15s Laptop', category: 'Laptop', brand: 'HP', cost: 52000, retail: 62500, wholesale: 58000, reorder: 2, warranty: 12, serial: true, qty: 10 },
    { sku: 'CCTV-HIK-2MP', barcode: '8801234567893', name: 'Hikvision 2MP Dome Camera', category: 'CCTV', brand: 'Hikvision', cost: 1800, retail: 2500, wholesale: 2200, reorder: 10, warranty: 12, serial: true, qty: 25 },
    { sku: 'ACC-MOUSE-WL', barcode: '8801234567894', name: 'Wireless Mouse', category: 'Accessory', brand: 'Dell', cost: 450, retail: 750, wholesale: 600, reorder: 15, warranty: 6, serial: false, qty: 40 },
  ];

  const productIds: string[] = [];
  for (const p of products) {
    const r = await query(
      `INSERT INTO products
       (sku, barcode, name, category_id, brand_id, cost, retail_price, wholesale_price, reorder_level, warranty_months, serial_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [p.sku, p.barcode, p.name, catId(p.category), brandId(p.brand), p.cost, p.retail, p.wholesale, p.reorder, p.warranty, p.serial]
    );
    const id = r.rows[0].id as string;
    productIds.push(id);
    await query(`INSERT INTO product_stock (product_id, quantity) VALUES ($1,$2)`, [id, p.qty]);
  }

  // Exactly 5 serials (one per product that needs it; mouse gets one optional serial skipped — use first 4 serial products + one more for first)
  const serialProductSpecs = products.filter((p) => p.serial).slice(0, 5);
  // We have 4 serial products; add a 5th serial on the first product
  const serialInserts = [
    ...serialProductSpecs.map((p, i) => ({ sku: p.sku, warranty: p.warranty, sn: `${p.sku}-SN001`, productIndex: products.indexOf(p) })),
    { sku: products[0].sku, warranty: products[0].warranty, sn: `${products[0].sku}-SN002`, productIndex: 0 },
  ].slice(0, 5);

  const serialIds: string[] = [];
  for (const s of serialInserts) {
    const r = await query(
      `INSERT INTO serials (product_id, serial_number, status, warranty_months)
       VALUES ($1,$2,'in_stock',$3) RETURNING id`,
      [productIds[s.productIndex], s.sn, s.warranty]
    );
    serialIds.push(r.rows[0].id as string);
  }

  const expenseCats = ['Rent', 'Salary', 'Utility', 'Transport', 'Misc'];
  for (const name of expenseCats) {
    await query(`INSERT INTO expense_categories (name) VALUES ($1)`, [name]);
  }

  const suppliers = [
    { name: 'Dhaka Distributors', phone: '01800000001', address: 'Motijheel', email: 'dhaka@dist.local' },
    { name: 'Tech Trade BD', phone: '01800000002', address: 'Gulshan', email: 'tech@trade.local' },
    { name: 'Digital Hub', phone: '01800000003', address: 'Banani', email: 'hub@digital.local' },
    { name: 'Electro Source', phone: '01800000004', address: 'Mirpur', email: 'electro@src.local' },
    { name: 'CCTV World', phone: '01800000005', address: 'Elephant Road', email: 'cctv@world.local' },
  ];
  for (const s of suppliers) {
    await query(
      `INSERT INTO suppliers (name, phone, email, address, due_balance)
       VALUES ($1,$2,$3,$4,$5)`,
      [s.name, s.phone, s.email, s.address, 5000 + Math.floor(Math.random() * 20000)]
    );
  }

  const customers = [
    { name: 'Walk-in Demo', phone: '01900000001', address: 'Dhaka', credit: 100000 },
    { name: 'Rahim Enterprise', phone: '01900000002', address: 'Motijheel', credit: 200000 },
    { name: 'Karim Traders', phone: '01900000003', address: 'Chittagong', credit: 150000 },
    { name: 'Fatima Store', phone: '01900000004', address: 'Sylhet', credit: 80000 },
    { name: 'Nila Electronics', phone: '01900000005', address: 'Khulna', credit: 120000 },
  ];
  for (const c of customers) {
    await query(
      `INSERT INTO customers (name, phone, address, credit_limit)
       VALUES ($1,$2,$3,$4)`,
      [c.name, c.phone, c.address, c.credit]
    );
  }

  const admin = (await query(`SELECT id FROM users WHERE email = 'admin@shop.local'`)).rows[0];
  const cashier = (await query(`SELECT id FROM users WHERE email = 'cashier@shop.local'`)).rows[0];
  const supplierRows = (await query(`SELECT id FROM suppliers ORDER BY phone`)).rows;
  const customerRows = (await query(`SELECT id FROM customers ORDER BY phone`)).rows;
  const expenseCatRows = (await query(`SELECT id FROM expense_categories ORDER BY name`)).rows;
  const productRows = (
    await query(
      `SELECT p.id, p.sku, p.cost, p.retail_price, p.wholesale_price, p.serial_required
       FROM products p ORDER BY p.sku`
    )
  ).rows;
  const userRows = (await query(`SELECT id FROM users ORDER BY email`)).rows;

  for (let i = 0; i < 5; i++) {
    await query(
      `INSERT INTO expenses (category_id, amount, expense_date, note, created_by)
       VALUES ($1,$2, CURRENT_DATE - ($3 || ' days')::interval, $4, $5)`,
      [expenseCatRows[i].id, 1000 + i * 350, i, `SEED-EXP-0${i + 1}`, admin.id]
    );
  }

  const demandIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await query(
      `INSERT INTO purchase_demands
       (demand_no, demand_date, preferred_supplier_id, notes, status, created_by)
       VALUES ($1, CURRENT_DATE - ($2 || ' days')::interval, $3, $4, $5, $6)
       RETURNING id`,
      [
        `DEM-SEED-00${i + 1}`,
        i,
        supplierRows[i].id,
        `Seed demand ${i + 1}`,
        i === 0 ? 'draft' : i === 1 ? 'ordered' : i === 2 ? 'partially_received' : i === 3 ? 'received' : 'cancelled',
        admin.id,
      ]
    );
    demandIds.push(r.rows[0].id as string);
    const prod = productRows[i];
    await query(
      `INSERT INTO purchase_demand_items (demand_id, product_id, requested_qty, last_cost, received_qty)
       VALUES ($1,$2,$3,$4,$5)`,
      [r.rows[0].id, prod.id, 5 + i, prod.cost, i >= 2 ? 3 : 0]
    );
  }

  const purchaseIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const prod = productRows[i];
    const qty = 4 + i;
    const unitCost = Number(prod.cost);
    const lineTotal = unitCost * qty;
    const paid = i % 3 === 0 ? lineTotal : Math.round(lineTotal * 0.6);
    const due = lineTotal - paid;
    const r = await query(
      `INSERT INTO purchases
       (purchase_no, supplier_id, demand_id, invoice_no, purchase_date, subtotal, tax_amount, total, paid_amount, due_amount, notes, created_by)
       VALUES ($1,$2,$3,$4, CURRENT_DATE - ($5 || ' days')::interval, $6,0,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        `PUR-SEED-00${i + 1}`,
        supplierRows[i].id,
        demandIds[i],
        `SINV-${1000 + i}`,
        i + 1,
        lineTotal,
        paid,
        due,
        `Seed purchase ${i + 1}`,
        admin.id,
      ]
    );
    purchaseIds.push(r.rows[0].id as string);
    await query(
      `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, line_total)
       VALUES ($1,$2,$3,$4,$5)`,
      [r.rows[0].id, prod.id, qty, unitCost, lineTotal]
    );
    await query(
      `INSERT INTO supplier_payments (supplier_id, purchase_id, amount, method, notes, created_by)
       VALUES ($1,$2,$3,'cash',$4,$5)`,
      [supplierRows[i].id, r.rows[0].id, paid, `SEED-SPAY-${i + 1}`, admin.id]
    );
  }

  const saleIds: { id: string; customerId: string; itemId: string; productId: string; total: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const prod = productRows[i];
    const customer = customerRows[i];
    const qty = 1;
    const unitPrice = i % 2 === 0 ? Number(prod.retail_price) : Number(prod.wholesale_price);
    const lineTotal = unitPrice * qty;
    const paid = i % 4 === 0 ? lineTotal * 0.5 : lineTotal;
    const due = lineTotal - paid;
    const paymentStatus = due > 0 ? 'partial' : i === 4 ? 'installment' : 'paid';
    const saleType = i % 2 === 0 ? 'retail' : 'wholesale';

    const sale = await query(
      `INSERT INTO sales
       (invoice_no, customer_id, cashier_id, sale_type, sale_date, status, subtotal, discount_amount, tax_amount, total, paid_amount, due_amount, payment_status, notes)
       VALUES ($1,$2,$3,$4, CURRENT_DATE - ($5 || ' days')::interval, 'completed', $6,0,0,$6,$7,$8,$9,$10)
       RETURNING id`,
      [`INV-SEED-00${i + 1}`, customer.id, cashier.id, saleType, i, lineTotal, paid, due, paymentStatus, `Seed sale ${i + 1}`]
    );
    const saleId = sale.rows[0].id as string;
    const item = await query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_at_sale, discount_amount, tax_amount, line_total)
       VALUES ($1,$2,$3,$4,$5,0,0,$6) RETURNING id`,
      [saleId, prod.id, qty, unitPrice, prod.cost, lineTotal]
    );
    const itemId = item.rows[0].id as string;

    // Link one serial per sale (5 sale_serials)
    if (serialIds[i]) {
      await query(`UPDATE serials SET status = 'sold', sale_item_id = $1, updated_at = NOW() WHERE id = $2`, [
        itemId,
        serialIds[i],
      ]);
      await query(`INSERT INTO sale_serials (sale_item_id, serial_id) VALUES ($1,$2)`, [itemId, serialIds[i]]);
      await query(`UPDATE product_stock SET quantity = GREATEST(quantity - 1, 0), updated_at = NOW() WHERE product_id = $1`, [
        prod.id,
      ]);
    } else {
      await query(`UPDATE product_stock SET quantity = GREATEST(quantity - $2, 0), updated_at = NOW() WHERE product_id = $1`, [
        prod.id,
        qty,
      ]);
    }

    const pay = await query(
      `INSERT INTO payments (sale_id, customer_id, method, amount, reference, created_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [saleId, customer.id, i % 3 === 0 ? 'bkash' : i % 3 === 1 ? 'card' : 'cash', paid, `SEED-PAY-${i + 1}`, cashier.id, `Seed payment ${i + 1}`]
    );

    await query(
      `INSERT INTO customer_ledger (customer_id, sale_id, payment_id, entry_type, amount, balance_after, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        customer.id,
        saleId,
        pay.rows[0].id,
        due > 0 ? 'debit' : 'credit',
        due > 0 ? due : paid,
        due > 0 ? due : 0,
        `Seed ledger ${i + 1}`,
        cashier.id,
      ]
    );
    if (due > 0) {
      await query(`UPDATE customers SET due_balance = due_balance + $2, updated_at = NOW() WHERE id = $1`, [
        customer.id,
        due,
      ]);
    }

    saleIds.push({ id: saleId, customerId: customer.id as string, itemId, productId: prod.id as string, total: lineTotal });
  }

  // 5 installment plans, 1 due each, 1 payment each
  for (let i = 0; i < 5; i++) {
    const sale = saleIds[i];
    const monthly = Math.max(Math.round(sale.total / 6), 100);
    const plan = await query(
      `INSERT INTO installment_plans
       (sale_id, customer_id, down_payment, total_amount, months, monthly_amount, start_date, status)
       VALUES ($1,$2,0,$3,1,$4, CURRENT_DATE, 'active')
       RETURNING id`,
      [sale.id, sale.customerId, sale.total, monthly]
    );
    const planId = plan.rows[0].id as string;
    const due = await query(
      `INSERT INTO installment_dues (plan_id, installment_no, due_date, amount, paid_amount, status)
       VALUES ($1,1, CURRENT_DATE, $2, $2, 'paid')
       RETURNING id`,
      [planId, monthly]
    );
    await query(
      `INSERT INTO installment_payments (plan_id, due_id, amount, method, created_by, notes)
       VALUES ($1,$2,$3,'cash',$4,$5)`,
      [planId, due.rows[0].id, monthly, cashier.id, `SEED-IPAY-${i + 1}`]
    );
  }

  for (let i = 0; i < 5; i++) {
    const sale = saleIds[i];
    const r = await query(
      `INSERT INTO returns
       (return_no, sale_id, customer_id, return_date, refund_amount, restock, reason, status, created_by, approved_by)
       VALUES ($1,$2,$3, CURRENT_DATE - ($4 || ' days')::interval, $5, TRUE, $6, 'completed', $7, $7)
       RETURNING id`,
      [`RET-SEED-00${i + 1}`, sale.id, sale.customerId, i, Math.round(sale.total * 0.2), `Seed return ${i + 1}`, admin.id]
    );
    await query(
      `INSERT INTO return_items (return_id, sale_item_id, product_id, quantity, unit_price, line_total, condition)
       VALUES ($1,$2,$3,1,$4,$4,'restock')`,
      [r.rows[0].id, sale.itemId, sale.productId, Math.round(sale.total * 0.2)]
    );
  }

  for (let i = 0; i < 5; i++) {
    const sale = saleIds[i];
    const newSale = saleIds[(i + 1) % 5];
    const returnedValue = Math.round(sale.total * 0.5);
    const newValue = Math.round(newSale.total * 0.5);
    const r = await query(
      `INSERT INTO exchanges
       (exchange_no, original_sale_id, new_sale_id, customer_id, exchange_date, returned_value, new_value, fee_amount, discount_amount, net_payable, notes, created_by)
       VALUES ($1,$2,$3,$4, CURRENT_DATE - ($5 || ' days')::interval, $6,$7,100,0,$8,$9,$10)
       RETURNING id`,
      [
        `EXC-SEED-00${i + 1}`,
        sale.id,
        newSale.id,
        sale.customerId,
        i,
        returnedValue,
        newValue,
        Math.max(newValue - returnedValue + 100, 0),
        `Seed exchange ${i + 1}`,
        admin.id,
      ]
    );
    // One exchange_item per exchange to keep exactly 5 rows
    await query(
      `INSERT INTO exchange_items (exchange_id, direction, product_id, sale_item_id, quantity, unit_price, line_total, condition)
       VALUES ($1,'return',$2,$3,1,$4,$4,'restock')`,
      [r.rows[0].id, sale.productId, sale.itemId, returnedValue]
    );
  }

  for (let i = 0; i < 5; i++) {
    await query(
      `INSERT INTO warranty_claims
       (claim_no, serial_id, sale_id, customer_id, claim_date, issue_description, resolution, status, notes, created_by)
       VALUES ($1,$2,$3,$4, CURRENT_DATE - ($5 || ' days')::interval, $6, $7, $8, $9, $10)`,
      [
        `WRN-SEED-00${i + 1}`,
        serialIds[i],
        saleIds[i].id,
        saleIds[i].customerId,
        i,
        `Seed warranty issue ${i + 1}`,
        i % 3 === 0 ? 'repair' : i % 3 === 1 ? 'replace' : 'reject',
        i % 4 === 0 ? 'open' : i % 4 === 1 ? 'in_progress' : i % 4 === 2 ? 'resolved' : 'rejected',
        `Seed claim ${i + 1}`,
        admin.id,
      ]
    );
  }

  for (let i = 0; i < 5; i++) {
    const closed = i < 4;
    await query(
      `INSERT INTO shifts
       (user_id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, cash_sales, card_sales, mfs_sales, notes, status)
       VALUES ($1, NOW() - (($2+1) || ' days')::interval, $3, 5000, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userRows[i].id,
        i,
        closed ? new Date() : null,
        closed ? 8000 + i * 100 : null,
        closed ? 7800 + i * 100 : null,
        2000 + i * 50,
        1000 + i * 20,
        500 + i * 10,
        `SEED-SHIFT-0${i + 1}`,
        closed ? 'closed' : 'open',
      ]
    );
  }

  for (let i = 0; i < 5; i++) {
    const prod = productRows[i];
    const change = i % 2 === 0 ? 2 : -1;
    await query(
      `INSERT INTO stock_adjustments (product_id, quantity_change, reason, notes, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [prod.id, change, i % 2 === 0 ? 'Found stock' : 'Damaged', `SEED-ADJ-0${i + 1}`, admin.id]
    );
    await query(`UPDATE product_stock SET quantity = GREATEST(quantity + $2, 0), updated_at = NOW() WHERE product_id = $1`, [
      prod.id,
      change,
    ]);
  }

  for (let i = 0; i < 5; i++) {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [admin.id, `SEED_AUDIT_${i + 1}`, 'seed', String(i + 1), JSON.stringify({ seed: true, n: i + 1 })]
    );
  }

  const year = new Date().getFullYear();
  const counterNames = ['invoice', 'demand', 'purchase', 'return', 'exchange'];
  for (const name of counterNames) {
    await query(`INSERT INTO document_counters (name, year, last_value) VALUES ($1,$2,5)`, [name, year]);
  }

  const invoiceTemplates = [
    { name: 'Default A4 Invoice', paper: 'a4', isDefault: true },
    { name: 'Compact A4 Invoice', paper: 'a4', isDefault: false },
    { name: 'Default POS Receipt', paper: 'pos80', isDefault: true },
    { name: 'Compact POS Receipt', paper: 'pos80', isDefault: false },
    { name: 'Gift Receipt A4', paper: 'a4', isDefault: false },
  ];
  for (const t of invoiceTemplates) {
    await query(
      `INSERT INTO invoice_templates (name, paper, content_html, content_json, is_default)
       VALUES ($1,$2,$3,'{}'::jsonb,$4)`,
      [
        t.name,
        t.paper,
        `<p><strong>{{shop.name}}</strong></p><p>Invoice #: {{invoice_no}}</p><p>{{items_table}}</p><p>Total: {{currency}}{{total}}</p>`,
        t.isDefault,
      ]
    );
  }

  const counts = await query(`
    SELECT 'users' AS t, COUNT(*)::int AS c FROM users
    UNION ALL SELECT 'categories', COUNT(*)::int FROM categories
    UNION ALL SELECT 'brands', COUNT(*)::int FROM brands
    UNION ALL SELECT 'products', COUNT(*)::int FROM products
    UNION ALL SELECT 'product_stock', COUNT(*)::int FROM product_stock
    UNION ALL SELECT 'serials', COUNT(*)::int FROM serials
    UNION ALL SELECT 'suppliers', COUNT(*)::int FROM suppliers
    UNION ALL SELECT 'customers', COUNT(*)::int FROM customers
    UNION ALL SELECT 'expense_categories', COUNT(*)::int FROM expense_categories
    UNION ALL SELECT 'expenses', COUNT(*)::int FROM expenses
    UNION ALL SELECT 'purchase_demands', COUNT(*)::int FROM purchase_demands
    UNION ALL SELECT 'purchase_demand_items', COUNT(*)::int FROM purchase_demand_items
    UNION ALL SELECT 'purchases', COUNT(*)::int FROM purchases
    UNION ALL SELECT 'purchase_items', COUNT(*)::int FROM purchase_items
    UNION ALL SELECT 'supplier_payments', COUNT(*)::int FROM supplier_payments
    UNION ALL SELECT 'sales', COUNT(*)::int FROM sales
    UNION ALL SELECT 'sale_items', COUNT(*)::int FROM sale_items
    UNION ALL SELECT 'sale_serials', COUNT(*)::int FROM sale_serials
    UNION ALL SELECT 'payments', COUNT(*)::int FROM payments
    UNION ALL SELECT 'customer_ledger', COUNT(*)::int FROM customer_ledger
    UNION ALL SELECT 'installment_plans', COUNT(*)::int FROM installment_plans
    UNION ALL SELECT 'installment_dues', COUNT(*)::int FROM installment_dues
    UNION ALL SELECT 'installment_payments', COUNT(*)::int FROM installment_payments
    UNION ALL SELECT 'returns', COUNT(*)::int FROM returns
    UNION ALL SELECT 'return_items', COUNT(*)::int FROM return_items
    UNION ALL SELECT 'exchanges', COUNT(*)::int FROM exchanges
    UNION ALL SELECT 'exchange_items', COUNT(*)::int FROM exchange_items
    UNION ALL SELECT 'warranty_claims', COUNT(*)::int FROM warranty_claims
    UNION ALL SELECT 'shifts', COUNT(*)::int FROM shifts
    UNION ALL SELECT 'stock_adjustments', COUNT(*)::int FROM stock_adjustments
    UNION ALL SELECT 'audit_logs', COUNT(*)::int FROM audit_logs
    UNION ALL SELECT 'document_counters', COUNT(*)::int FROM document_counters
    UNION ALL SELECT 'invoice_templates', COUNT(*)::int FROM invoice_templates
    UNION ALL SELECT 'shop_settings', COUNT(*)::int FROM shop_settings
    ORDER BY 1`);

  console.log('Seed complete — row counts:');
  for (const row of counts.rows) {
    console.log(`  ${row.t}: ${row.c}`);
  }
  console.log('Login: admin@shop.local / admin123');
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
