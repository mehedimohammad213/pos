import bcrypt from 'bcryptjs';
import { pool, query } from './pool';

async function seed() {
  await query(`INSERT INTO shop_settings (id, name, address, phone, default_tax_percent, vat_tin)
    VALUES (1, 'Mehedi Hardware', 'Dhaka, Bangladesh', '01700000000', 0, 'TIN-DEMO')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`);

  const passwordHash = await bcrypt.hash('admin123', 10);

  const users = [
    { name: 'Admin', email: 'admin@shop.local', phone: '01700000001', role: 'admin' },
    { name: 'Cashier', email: 'cashier@shop.local', phone: '01700000002', role: 'cashier' },
    { name: 'Manager', email: 'manager@shop.local', phone: '01700000003', role: 'manager' },
    { name: 'Stock Keeper', email: 'stock@shop.local', phone: '01700000004', role: 'stock' },
    { name: 'Cashier Two', email: 'cashier2@shop.local', phone: '01700000005', role: 'cashier' },
    { name: 'Cashier Three', email: 'cashier3@shop.local', phone: '01700000006', role: 'cashier' },
    { name: 'Manager Two', email: 'manager2@shop.local', phone: '01700000007', role: 'manager' },
    { name: 'Sales Lead', email: 'sales@shop.local', phone: '01700000008', role: 'cashier' },
    { name: 'Floor Staff', email: 'floor@shop.local', phone: '01700000009', role: 'cashier' },
    { name: 'Accounts', email: 'accounts@shop.local', phone: '01700000010', role: 'manager' },
  ];
  for (const u of users) {
    await query(
      `INSERT INTO users (name, email, phone, password_hash, role, permissions)
       VALUES ($1,$2,$3,$4,$5,'{}')
       ON CONFLICT (email) DO NOTHING`,
      [u.name, u.email, u.phone, passwordHash, u.role]
    );
  }

  const categories = [
    'TV',
    'Monitor',
    'Laptop',
    'CCTV',
    'Accessory',
    'Cable',
    'Router',
    'Printer',
    'Storage',
    'UPS',
  ];
  for (const name of categories) {
    await query(`INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  }

  const brands = [
    'Samsung',
    'LG',
    'Dell',
    'HP',
    'Hikvision',
    'Xiaomi',
    'Asus',
    'Lenovo',
    'Canon',
    'APC',
  ];
  for (const name of brands) {
    await query(`INSERT INTO brands (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  }

  const cat = await query(`SELECT id, name FROM categories`);
  const brand = await query(`SELECT id, name FROM brands`);
  const catId = (n: string) => cat.rows.find((r) => r.name === n)?.id as string;
  const brandId = (n: string) => brand.rows.find((r) => r.name === n)?.id as string;

  const products = [
    { sku: 'TV-SAM-43', barcode: '8801234567890', name: 'Samsung 43" Smart TV', category: 'TV', brand: 'Samsung', cost: 32000, retail: 39900, wholesale: 37000, reorder: 2, warranty: 24, serial: true, qty: 12 },
    { sku: 'MON-LG-24', barcode: '8801234567891', name: 'LG 24" Monitor', category: 'Monitor', brand: 'LG', cost: 12000, retail: 15500, wholesale: 14000, reorder: 3, warranty: 12, serial: true, qty: 15 },
    { sku: 'LAP-HP-15', barcode: '8801234567892', name: 'HP 15s Laptop', category: 'Laptop', brand: 'HP', cost: 52000, retail: 62500, wholesale: 58000, reorder: 2, warranty: 12, serial: true, qty: 10 },
    { sku: 'CCTV-HIK-2MP', barcode: '8801234567893', name: 'Hikvision 2MP Dome Camera', category: 'CCTV', brand: 'Hikvision', cost: 1800, retail: 2500, wholesale: 2200, reorder: 10, warranty: 12, serial: true, qty: 25 },
    { sku: 'CAB-HDMI-2M', barcode: '8801234567894', name: 'HDMI Cable 2m', category: 'Cable', brand: 'Xiaomi', cost: 120, retail: 250, wholesale: 180, reorder: 20, warranty: 0, serial: false, qty: 80 },
    { sku: 'ACC-MOUSE-WL', barcode: '8801234567895', name: 'Wireless Mouse', category: 'Accessory', brand: 'Dell', cost: 450, retail: 750, wholesale: 600, reorder: 15, warranty: 6, serial: false, qty: 40 },
    { sku: 'RTR-ASUS-AX', barcode: '8801234567896', name: 'Asus AX3000 Router', category: 'Router', brand: 'Asus', cost: 6500, retail: 8500, wholesale: 7800, reorder: 4, warranty: 12, serial: true, qty: 12 },
    { sku: 'PRT-CAN-LBP', barcode: '8801234567897', name: 'Canon LBP Printer', category: 'Printer', brand: 'Canon', cost: 14000, retail: 17500, wholesale: 16000, reorder: 3, warranty: 12, serial: true, qty: 8 },
    { sku: 'SSD-LEN-1TB', barcode: '8801234567898', name: 'Lenovo 1TB SSD', category: 'Storage', brand: 'Lenovo', cost: 7200, retail: 9500, wholesale: 8600, reorder: 5, warranty: 36, serial: true, qty: 18 },
    { sku: 'UPS-APC-650', barcode: '8801234567899', name: 'APC 650VA UPS', category: 'UPS', brand: 'APC', cost: 4800, retail: 6200, wholesale: 5600, reorder: 5, warranty: 24, serial: true, qty: 14 },
  ];

  const productIds: string[] = [];
  for (const p of products) {
    let id = (await query(`SELECT id FROM products WHERE sku = $1`, [p.sku])).rows[0]?.id as string | undefined;
    if (!id) {
      const r = await query(
        `INSERT INTO products
         (sku, barcode, name, category_id, brand_id, cost, retail_price, wholesale_price, reorder_level, warranty_months, serial_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [p.sku, p.barcode, p.name, catId(p.category), brandId(p.brand), p.cost, p.retail, p.wholesale, p.reorder, p.warranty, p.serial]
      );
      id = r.rows[0].id as string;
      await query(`INSERT INTO product_stock (product_id, quantity) VALUES ($1,$2)`, [id, p.qty]);
    } else {
      await query(
        `INSERT INTO product_stock (product_id, quantity) VALUES ($1,$2)
         ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
        [id, p.qty]
      );
    }
    productIds.push(id);

    if (p.serial) {
      for (let i = 1; i <= 10; i++) {
        await query(
          `INSERT INTO serials (product_id, serial_number, status, warranty_months)
           VALUES ($1,$2,'in_stock',$3) ON CONFLICT DO NOTHING`,
          [id, `${p.sku}-SN${String(i).padStart(3, '0')}`, p.warranty]
        );
      }
    }
  }

  const expenseCats = [
    'Rent',
    'Salary',
    'Utility',
    'Transport',
    'Misc',
    'Marketing',
    'Maintenance',
    'Internet',
    'Packaging',
    'Training',
  ];
  for (const name of expenseCats) {
    await query(`INSERT INTO expense_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  }

  const suppliers = [
    { name: 'Dhaka Distributors', phone: '01800000001', address: 'Motijheel', email: 'dhaka@dist.local' },
    { name: 'Tech Trade BD', phone: '01800000002', address: 'Gulshan', email: 'tech@trade.local' },
    { name: 'Digital Hub', phone: '01800000003', address: 'Banani', email: 'hub@digital.local' },
    { name: 'Electro Source', phone: '01800000004', address: 'Mirpur', email: 'electro@src.local' },
    { name: 'CCTV World', phone: '01800000005', address: 'Elephant Road', email: 'cctv@world.local' },
    { name: 'Laptop Point', phone: '01800000006', address: 'IDB Bhaban', email: 'lp@point.local' },
    { name: 'Cable House', phone: '01800000007', address: 'Nawabpur', email: 'cable@house.local' },
    { name: 'Power Solutions', phone: '01800000008', address: 'Mohakhali', email: 'power@sol.local' },
    { name: 'Office Gear', phone: '01800000009', address: 'Farmgate', email: 'office@gear.local' },
    { name: 'Network Pro', phone: '01800000010', address: 'Uttara', email: 'net@pro.local' },
  ];
  for (const s of suppliers) {
    const exists = await query(`SELECT id FROM suppliers WHERE phone = $1`, [s.phone]);
    if (!exists.rows[0]) {
      await query(
        `INSERT INTO suppliers (name, phone, email, address, due_balance)
         VALUES ($1,$2,$3,$4,$5)`,
        [s.name, s.phone, s.email, s.address, 5000 + Math.floor(Math.random() * 20000)]
      );
    }
  }

  const customers = [
    { name: 'Walk-in Demo', phone: '01900000001', address: 'Dhaka', credit: 100000 },
    { name: 'Rahim Enterprise', phone: '01900000002', address: 'Motijheel', credit: 200000 },
    { name: 'Karim Traders', phone: '01900000003', address: 'Chittagong', credit: 150000 },
    { name: 'Fatima Store', phone: '01900000004', address: 'Sylhet', credit: 80000 },
    { name: 'Nila Electronics', phone: '01900000005', address: 'Khulna', credit: 120000 },
    { name: 'City Computers', phone: '01900000006', address: 'Rajshahi', credit: 175000 },
    { name: 'Green Tech', phone: '01900000007', address: 'Barisal', credit: 90000 },
    { name: 'Smart Home BD', phone: '01900000008', address: 'Gazipur', credit: 110000 },
    { name: 'Office Needs', phone: '01900000009', address: 'Savar', credit: 250000 },
    { name: 'Campus IT', phone: '01900000010', address: 'Dhanmondi', credit: 70000 },
  ];
  for (const c of customers) {
    await query(
      `INSERT INTO customers (name, phone, address, credit_limit)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (phone) DO NOTHING`,
      [c.name, c.phone, c.address, c.credit]
    );
  }

  const admin = (await query(`SELECT id FROM users WHERE email = 'admin@shop.local'`)).rows[0];
  const cashier = (await query(`SELECT id FROM users WHERE email = 'cashier@shop.local'`)).rows[0];
  const supplierRows = (await query(`SELECT id, name FROM suppliers ORDER BY phone`)).rows;
  const customerRows = (await query(`SELECT id, name FROM customers ORDER BY phone`)).rows;
  const expenseCatRows = (await query(`SELECT id, name FROM expense_categories ORDER BY name`)).rows;
  const productRows = (
    await query(
      `SELECT p.id, p.sku, p.cost, p.retail_price, p.wholesale_price, p.serial_required, COALESCE(ps.quantity,0) AS qty
       FROM products p LEFT JOIN product_stock ps ON ps.product_id = p.id
       ORDER BY p.sku`
    )
  ).rows;

  // Expenses (10)
  for (let i = 0; i < 10; i++) {
    const note = `SEED-EXP-${String(i + 1).padStart(2, '0')}`;
    const exists = await query(`SELECT id FROM expenses WHERE note = $1`, [note]);
    if (exists.rows[0]) continue;
    await query(
      `INSERT INTO expenses (category_id, amount, expense_date, note, created_by)
       VALUES ($1,$2, CURRENT_DATE - ($3 || ' days')::interval, $4, $5)`,
      [expenseCatRows[i % expenseCatRows.length].id, 1000 + i * 350, i, note, admin.id]
    );
  }

  // Purchase demands + items (10)
  const demandIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const demandNo = `DEM-SEED-${String(i + 1).padStart(3, '0')}`;
    let demandId = (await query(`SELECT id FROM purchase_demands WHERE demand_no = $1`, [demandNo])).rows[0]?.id as
      | string
      | undefined;
    if (!demandId) {
      const r = await query(
        `INSERT INTO purchase_demands
         (demand_no, demand_date, preferred_supplier_id, notes, status, created_by)
         VALUES ($1, CURRENT_DATE - ($2 || ' days')::interval, $3, $4, $5, $6)
         RETURNING id`,
        [
          demandNo,
          i,
          supplierRows[i % supplierRows.length].id,
          `Seed demand ${i + 1}`,
          i % 5 === 0 ? 'draft' : i % 5 === 1 ? 'ordered' : i % 5 === 2 ? 'partially_received' : i % 5 === 3 ? 'received' : 'cancelled',
          admin.id,
        ]
      );
      demandId = r.rows[0].id as string;
      const prod = productRows[i % productRows.length];
      await query(
        `INSERT INTO purchase_demand_items (demand_id, product_id, requested_qty, last_cost, received_qty)
         VALUES ($1,$2,$3,$4,$5)`,
        [demandId, prod.id, 5 + (i % 5), prod.cost, i % 5 >= 2 ? 3 : 0]
      );
    }
    demandIds.push(demandId);
  }

  // Purchases + items + supplier payments (10)
  const purchaseIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const purchaseNo = `PUR-SEED-${String(i + 1).padStart(3, '0')}`;
    let purchaseId = (await query(`SELECT id FROM purchases WHERE purchase_no = $1`, [purchaseNo])).rows[0]?.id as
      | string
      | undefined;
    if (!purchaseId) {
      const prod = productRows[i % productRows.length];
      const qty = 4 + (i % 4);
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
          purchaseNo,
          supplierRows[i % supplierRows.length].id,
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
      purchaseId = r.rows[0].id as string;
      await query(
        `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, line_total)
         VALUES ($1,$2,$3,$4,$5)`,
        [purchaseId, prod.id, qty, unitCost, lineTotal]
      );
      await query(
        `INSERT INTO supplier_payments (supplier_id, purchase_id, amount, method, notes, created_by)
         VALUES ($1,$2,$3,'cash',$4,$5)`,
        [supplierRows[i % supplierRows.length].id, purchaseId, paid, `SEED-SPAY-${i + 1}`, admin.id]
      );
    }
    purchaseIds.push(purchaseId);
  }

  // Sales + items + payments + ledger (+ some serial links) (10)
  const saleIds: { id: string; customerId: string; itemId: string; productId: string; total: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const invoiceNo = `INV-SEED-${String(i + 1).padStart(3, '0')}`;
    const existing = await query(`SELECT id FROM sales WHERE invoice_no = $1`, [invoiceNo]);
    if (existing.rows[0]) {
      const saleId = existing.rows[0].id as string;
      const item = (await query(`SELECT id, product_id FROM sale_items WHERE sale_id = $1 LIMIT 1`, [saleId])).rows[0];
      const sale = (await query(`SELECT customer_id, total FROM sales WHERE id = $1`, [saleId])).rows[0];
      saleIds.push({
        id: saleId,
        customerId: sale.customer_id,
        itemId: item.id,
        productId: item.product_id,
        total: Number(sale.total),
      });
      continue;
    }

    const prod = productRows[i % productRows.length];
    const customer = customerRows[i % customerRows.length];
    const qty = 1;
    const unitPrice = i % 2 === 0 ? Number(prod.retail_price) : Number(prod.wholesale_price);
    const lineTotal = unitPrice * qty;
    const paid = i % 4 === 0 ? lineTotal * 0.5 : lineTotal;
    const due = lineTotal - paid;
    const paymentStatus = due > 0 ? (paid > 0 ? 'partial' : 'due') : i === 9 ? 'installment' : 'paid';
    const saleType = i % 2 === 0 ? 'retail' : 'wholesale';

    const sale = await query(
      `INSERT INTO sales
       (invoice_no, customer_id, cashier_id, sale_type, sale_date, status, subtotal, discount_amount, tax_amount, total, paid_amount, due_amount, payment_status, notes)
       VALUES ($1,$2,$3,$4, CURRENT_DATE - ($5 || ' days')::interval, 'completed', $6,0,0,$6,$7,$8,$9,$10)
       RETURNING id`,
      [invoiceNo, customer.id, cashier.id, saleType, i, lineTotal, paid, due, paymentStatus, `Seed sale ${i + 1}`]
    );
    const saleId = sale.rows[0].id as string;
    const item = await query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_at_sale, discount_amount, tax_amount, line_total)
       VALUES ($1,$2,$3,$4,$5,0,0,$6) RETURNING id`,
      [saleId, prod.id, qty, unitPrice, prod.cost, lineTotal]
    );
    const itemId = item.rows[0].id as string;

    if (prod.serial_required) {
      const serial = await query(
        `SELECT id FROM serials WHERE product_id = $1 AND status = 'in_stock' ORDER BY serial_number LIMIT 1`,
        [prod.id]
      );
      if (serial.rows[0]) {
        await query(`UPDATE serials SET status = 'sold', sale_item_id = $1, updated_at = NOW() WHERE id = $2`, [
          itemId,
          serial.rows[0].id,
        ]);
        await query(`INSERT INTO sale_serials (sale_item_id, serial_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
          itemId,
          serial.rows[0].id,
        ]);
        await query(`UPDATE product_stock SET quantity = GREATEST(quantity - 1, 0), updated_at = NOW() WHERE product_id = $1`, [
          prod.id,
        ]);
      }
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

    if (due > 0) {
      await query(
        `UPDATE customers SET due_balance = due_balance + $2, updated_at = NOW() WHERE id = $1`,
        [customer.id, due]
      );
      await query(
        `INSERT INTO customer_ledger (customer_id, sale_id, payment_id, entry_type, amount, balance_after, description, created_by)
         VALUES ($1,$2,NULL,'debit',$3,$4,$5,$6)`,
        [customer.id, saleId, due, due, `Seed debit ${invoiceNo}`, cashier.id]
      );
      await query(
        `INSERT INTO customer_ledger (customer_id, sale_id, payment_id, entry_type, amount, balance_after, description, created_by)
         VALUES ($1,$2,$3,'credit',$4,0,$5,$6)`,
        [customer.id, saleId, pay.rows[0].id, paid, `Seed credit ${invoiceNo}`, cashier.id]
      );
    } else {
      await query(
        `INSERT INTO customer_ledger (customer_id, sale_id, payment_id, entry_type, amount, balance_after, description, created_by)
         VALUES ($1,$2,$3,'credit',$4,0,$5,$6)`,
        [customer.id, saleId, pay.rows[0].id, paid, `Seed paid ${invoiceNo}`, cashier.id]
      );
    }

    saleIds.push({ id: saleId, customerId: customer.id, itemId, productId: prod.id as string, total: lineTotal });
  }

  // Ensure 10 ledger rows if some sales were fully paid earlier
  const ledgerCount = Number((await query(`SELECT COUNT(*)::int AS c FROM customer_ledger`)).rows[0].c);
  for (let i = ledgerCount; i < 10; i++) {
    const c = customerRows[i % customerRows.length];
    const desc = `SEED-LEDGER-${i + 1}`;
    const exists = await query(`SELECT id FROM customer_ledger WHERE description = $1`, [desc]);
    if (exists.rows[0]) continue;
    await query(
      `INSERT INTO customer_ledger (customer_id, entry_type, amount, balance_after, description, created_by)
       VALUES ($1,'debit',$2,$2,$3,$4)`,
      [c.id, 500 + i * 100, desc, admin.id]
    );
  }

  // Installment plans (1 per sale = 10) + dues/payments
  for (let i = 0; i < saleIds.length; i++) {
    const sale = saleIds[i];
    const existingPlan = await query(`SELECT id FROM installment_plans WHERE sale_id = $1`, [sale.id]);
    if (existingPlan.rows[0]) continue;
    const months = i === 0 ? 10 : 6;
    const monthly = Math.max(Math.round(sale.total / months), 100);
    const plan = await query(
      `INSERT INTO installment_plans
       (sale_id, customer_id, down_payment, total_amount, months, monthly_amount, start_date, status)
       VALUES ($1,$2,0,$3,$4,$5, CURRENT_DATE, 'active')
       RETURNING id`,
      [sale.id, sale.customerId, sale.total, months, monthly]
    );
    const planId = plan.rows[0].id as string;
    for (let n = 1; n <= months; n++) {
      const paidFirst = i === 0 && n <= 2;
      const due = await query(
        `INSERT INTO installment_dues (plan_id, installment_no, due_date, amount, paid_amount, status)
         VALUES ($1,$2, CURRENT_DATE + (($3-1) || ' months')::interval, $4, $5, $6)
         RETURNING id`,
        [planId, n, n, monthly, paidFirst ? monthly : 0, paidFirst ? 'paid' : 'pending']
      );
      if (paidFirst) {
        await query(
          `INSERT INTO installment_payments (plan_id, due_id, amount, method, created_by, notes)
           VALUES ($1,$2,$3,'cash',$4,$5)`,
          [planId, due.rows[0].id, monthly, cashier.id, `SEED-IPAY-${i + 1}-${n}`]
        );
      }
    }
  }

  // Ensure at least 10 installment payments
  {
    const payCount = Number((await query(`SELECT COUNT(*)::int AS c FROM installment_payments`)).rows[0].c);
    const dues = (
      await query(`SELECT d.id AS due_id, d.plan_id FROM installment_dues d ORDER BY d.due_date LIMIT 20`)
    ).rows;
    for (let n = payCount; n < 10; n++) {
      const due = dues[n % dues.length];
      if (!due) break;
      const note = `SEED-IPAY-EXTRA-${n + 1}`;
      const exists = await query(`SELECT id FROM installment_payments WHERE notes = $1`, [note]);
      if (exists.rows[0]) continue;
      await query(
        `INSERT INTO installment_payments (plan_id, due_id, amount, method, created_by, notes)
         VALUES ($1,$2,100,'bkash',$3,$4)`,
        [due.plan_id, due.due_id, cashier.id, note]
      );
    }
  }

  // Ensure at least 10 sale_serials
  {
    let ss = Number((await query(`SELECT COUNT(*)::int AS c FROM sale_serials`)).rows[0].c);
    const items = (
      await query(`
        SELECT si.id AS sale_item_id, si.product_id
        FROM sale_items si
        ORDER BY si.id`)
    ).rows;
    for (const item of items) {
      if (ss >= 10) break;
      const linked = await query(`SELECT 1 FROM sale_serials WHERE sale_item_id = $1 LIMIT 1`, [item.sale_item_id]);
      if (linked.rows[0]) continue;
      const serial = (
        await query(
          `SELECT id FROM serials
           WHERE status = 'in_stock' AND id NOT IN (SELECT serial_id FROM sale_serials)
           ORDER BY serial_number LIMIT 1`
        )
      ).rows[0];
      if (!serial) break;
      await query(`INSERT INTO sale_serials (sale_item_id, serial_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
        item.sale_item_id,
        serial.id,
      ]);
      await query(`UPDATE serials SET status = 'sold', sale_item_id = $1, updated_at = NOW() WHERE id = $2`, [
        item.sale_item_id,
        serial.id,
      ]);
      ss++;
    }
  }

  // Returns + return items (10)
  for (let i = 0; i < 10; i++) {
    const returnNo = `RET-SEED-${String(i + 1).padStart(3, '0')}`;
    const exists = await query(`SELECT id FROM returns WHERE return_no = $1`, [returnNo]);
    if (exists.rows[0]) continue;
    const sale = saleIds[i % saleIds.length];
    const r = await query(
      `INSERT INTO returns
       (return_no, sale_id, customer_id, return_date, refund_amount, restock, reason, status, created_by, approved_by)
       VALUES ($1,$2,$3, CURRENT_DATE - ($4 || ' days')::interval, $5, TRUE, $6, 'completed', $7, $7)
       RETURNING id`,
      [returnNo, sale.id, sale.customerId, i, Math.round(sale.total * 0.2), `Seed return ${i + 1}`, admin.id]
    );
    await query(
      `INSERT INTO return_items (return_id, sale_item_id, product_id, quantity, unit_price, line_total, condition)
       VALUES ($1,$2,$3,1,$4,$4,'restock')`,
      [r.rows[0].id, sale.itemId, sale.productId, Math.round(sale.total * 0.2)]
    );
  }

  // Exchanges + exchange items (10)
  for (let i = 0; i < 10; i++) {
    const exchangeNo = `EXC-SEED-${String(i + 1).padStart(3, '0')}`;
    const exists = await query(`SELECT id FROM exchanges WHERE exchange_no = $1`, [exchangeNo]);
    if (exists.rows[0]) continue;
    const sale = saleIds[i % saleIds.length];
    const newSale = saleIds[(i + 1) % saleIds.length];
    const returnedValue = Math.round(sale.total * 0.5);
    const newValue = Math.round(newSale.total * 0.5);
    const r = await query(
      `INSERT INTO exchanges
       (exchange_no, original_sale_id, new_sale_id, customer_id, exchange_date, returned_value, new_value, fee_amount, discount_amount, net_payable, notes, created_by)
       VALUES ($1,$2,$3,$4, CURRENT_DATE - ($5 || ' days')::interval, $6,$7,100,0,$8,$9,$10)
       RETURNING id`,
      [
        exchangeNo,
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
    await query(
      `INSERT INTO exchange_items (exchange_id, direction, product_id, sale_item_id, quantity, unit_price, line_total, condition)
       VALUES ($1,'return',$2,$3,1,$4,$4,'restock')`,
      [r.rows[0].id, sale.productId, sale.itemId, returnedValue]
    );
    await query(
      `INSERT INTO exchange_items (exchange_id, direction, product_id, sale_item_id, quantity, unit_price, line_total)
       VALUES ($1,'new',$2,$3,1,$4,$4)`,
      [r.rows[0].id, newSale.productId, newSale.itemId, newValue]
    );
  }

  // Warranty claims (10)
  const soldSerials = (
    await query(`SELECT id, sale_item_id FROM serials WHERE status = 'sold' ORDER BY serial_number LIMIT 10`)
  ).rows;
  for (let i = 0; i < 10; i++) {
    const claimNo = `WRN-SEED-${String(i + 1).padStart(3, '0')}`;
    const exists = await query(`SELECT id FROM warranty_claims WHERE claim_no = $1`, [claimNo]);
    if (exists.rows[0]) continue;
    const serial =
      soldSerials[i] ||
      (await query(`SELECT id FROM serials ORDER BY serial_number LIMIT 1 OFFSET $1`, [i])).rows[0];
    if (!serial) continue;
    const sale = saleIds[i % saleIds.length];
    await query(
      `INSERT INTO warranty_claims
       (claim_no, serial_id, sale_id, customer_id, claim_date, issue_description, resolution, status, notes, created_by)
       VALUES ($1,$2,$3,$4, CURRENT_DATE - ($5 || ' days')::interval, $6, $7, $8, $9, $10)`,
      [
        claimNo,
        serial.id,
        sale.id,
        sale.customerId,
        i,
        `Seed warranty issue ${i + 1}`,
        i % 3 === 0 ? 'repair' : i % 3 === 1 ? 'replace' : 'reject',
        i % 4 === 0 ? 'open' : i % 4 === 1 ? 'in_progress' : i % 4 === 2 ? 'resolved' : 'rejected',
        `Seed claim ${i + 1}`,
        admin.id,
      ]
    );
  }

  // Shifts (10)
  const userRows = (await query(`SELECT id FROM users ORDER BY email`)).rows;
  for (let i = 0; i < 10; i++) {
    const notes = `SEED-SHIFT-${String(i + 1).padStart(2, '0')}`;
    const exists = await query(`SELECT id FROM shifts WHERE notes = $1`, [notes]);
    if (exists.rows[0]) continue;
    const closed = i < 9;
    await query(
      `INSERT INTO shifts
       (user_id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, cash_sales, card_sales, mfs_sales, notes, status)
       VALUES ($1, NOW() - (($2+1) || ' days')::interval, $3, 5000, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userRows[i % userRows.length].id,
        i,
        closed ? new Date() : null,
        closed ? 8000 + i * 100 : null,
        closed ? 7800 + i * 100 : null,
        2000 + i * 50,
        1000 + i * 20,
        500 + i * 10,
        notes,
        closed ? 'closed' : 'open',
      ]
    );
  }

  // Stock adjustments (10)
  for (let i = 0; i < 10; i++) {
    const notes = `SEED-ADJ-${String(i + 1).padStart(2, '0')}`;
    const exists = await query(`SELECT id FROM stock_adjustments WHERE notes = $1`, [notes]);
    if (exists.rows[0]) continue;
    const prod = productRows[i % productRows.length];
    const change = i % 2 === 0 ? 2 : -1;
    await query(
      `INSERT INTO stock_adjustments (product_id, quantity_change, reason, notes, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [prod.id, change, i % 2 === 0 ? 'Found stock' : 'Damaged', notes, admin.id]
    );
    await query(`UPDATE product_stock SET quantity = GREATEST(quantity + $2, 0), updated_at = NOW() WHERE product_id = $1`, [
      prod.id,
      change,
    ]);
  }

  // Audit logs (10)
  for (let i = 0; i < 10; i++) {
    const action = `SEED_AUDIT_${i + 1}`;
    const exists = await query(`SELECT id FROM audit_logs WHERE action = $1`, [action]);
    if (exists.rows[0]) continue;
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [admin.id, action, 'seed', String(i + 1), JSON.stringify({ seed: true, n: i + 1 })]
    );
  }

  // Document counters (10 names for current year)
  const year = new Date().getFullYear();
  const counterNames = [
    'invoice',
    'demand',
    'purchase',
    'return',
    'exchange',
    'warranty',
    'payment',
    'expense',
    'shift',
    'adjustment',
  ];
  for (const name of counterNames) {
    await query(
      `INSERT INTO document_counters (name, year, last_value)
       VALUES ($1,$2,10)
       ON CONFLICT (name, year) DO UPDATE SET last_value = GREATEST(document_counters.last_value, 10)`,
      [name, year]
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
