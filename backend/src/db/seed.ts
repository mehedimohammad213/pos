import bcrypt from 'bcryptjs';
import { pool, query } from './pool';

async function seed() {
  await query(`INSERT INTO shop_settings (id, name, address, phone, default_tax_percent, vat_tin)
    VALUES (1, 'Mehedi Hardware', 'Dhaka, Bangladesh', '01700000000', 0, 'TIN-DEMO')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`);

  const passwordHash = await bcrypt.hash('admin123', 10);
  await query(
    `INSERT INTO users (name, email, phone, password_hash, role, permissions)
     VALUES ('Admin', 'admin@shop.local', '01700000001', $1, 'admin', '{}')
     ON CONFLICT (email) DO NOTHING`,
    [passwordHash]
  );
  await query(
    `INSERT INTO users (name, email, phone, password_hash, role, permissions)
     VALUES ('Cashier', 'cashier@shop.local', '01700000002', $1, 'cashier', '{}')
     ON CONFLICT (email) DO NOTHING`,
    [passwordHash]
  );
  await query(
    `INSERT INTO users (name, email, phone, password_hash, role, permissions)
     VALUES ('Manager', 'manager@shop.local', '01700000003', $1, 'manager', '{}')
     ON CONFLICT (email) DO NOTHING`,
    [passwordHash]
  );

  const categories = ['TV', 'Monitor', 'Laptop', 'CCTV', 'Accessory', 'Cable'];
  for (const name of categories) {
    await query(`INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  }
  const brands = ['Samsung', 'LG', 'Dell', 'HP', 'Hikvision', 'Xiaomi'];
  for (const name of brands) {
    await query(`INSERT INTO brands (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  }

  const cat = await query(`SELECT id, name FROM categories`);
  const brand = await query(`SELECT id, name FROM brands`);
  const catId = (n: string) => cat.rows.find((r) => r.name === n)?.id;
  const brandId = (n: string) => brand.rows.find((r) => r.name === n)?.id;

  const products = [
    {
      sku: 'TV-SAM-43',
      barcode: '8801234567890',
      name: 'Samsung 43" Smart TV',
      category: 'TV',
      brand: 'Samsung',
      cost: 32000,
      retail: 39900,
      wholesale: 37000,
      reorder: 2,
      warranty: 24,
      serial: true,
      qty: 5,
    },
    {
      sku: 'MON-LG-24',
      barcode: '8801234567891',
      name: 'LG 24" Monitor',
      category: 'Monitor',
      brand: 'LG',
      cost: 12000,
      retail: 15500,
      wholesale: 14000,
      reorder: 3,
      warranty: 12,
      serial: true,
      qty: 8,
    },
    {
      sku: 'LAP-HP-15',
      barcode: '8801234567892',
      name: 'HP 15s Laptop',
      category: 'Laptop',
      brand: 'HP',
      cost: 52000,
      retail: 62500,
      wholesale: 58000,
      reorder: 2,
      warranty: 12,
      serial: true,
      qty: 4,
    },
    {
      sku: 'CCTV-HIK-2MP',
      barcode: '8801234567893',
      name: 'Hikvision 2MP Dome Camera',
      category: 'CCTV',
      brand: 'Hikvision',
      cost: 1800,
      retail: 2500,
      wholesale: 2200,
      reorder: 10,
      warranty: 12,
      serial: true,
      qty: 20,
    },
    {
      sku: 'CAB-HDMI-2M',
      barcode: '8801234567894',
      name: 'HDMI Cable 2m',
      category: 'Cable',
      brand: 'Xiaomi',
      cost: 120,
      retail: 250,
      wholesale: 180,
      reorder: 20,
      warranty: 0,
      serial: false,
      qty: 50,
    },
    {
      sku: 'ACC-MOUSE-WL',
      barcode: '8801234567895',
      name: 'Wireless Mouse',
      category: 'Accessory',
      brand: 'Dell',
      cost: 450,
      retail: 750,
      wholesale: 600,
      reorder: 15,
      warranty: 6,
      serial: false,
      qty: 30,
    },
  ];

  for (const p of products) {
    const existing = await query(`SELECT id FROM products WHERE sku = $1`, [p.sku]);
    if (existing.rows[0]) continue;
    const r = await query(
      `INSERT INTO products
       (sku, barcode, name, category_id, brand_id, cost, retail_price, wholesale_price, reorder_level, warranty_months, serial_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        p.sku,
        p.barcode,
        p.name,
        catId(p.category),
        brandId(p.brand),
        p.cost,
        p.retail,
        p.wholesale,
        p.reorder,
        p.warranty,
        p.serial,
      ]
    );
    await query(`INSERT INTO product_stock (product_id, quantity) VALUES ($1,$2)`, [r.rows[0].id, p.qty]);
    if (p.serial) {
      for (let i = 1; i <= Math.min(p.qty, 5); i++) {
        await query(
          `INSERT INTO serials (product_id, serial_number, status, warranty_months)
           VALUES ($1,$2,'in_stock',$3) ON CONFLICT DO NOTHING`,
          [r.rows[0].id, `${p.sku}-SN${String(i).padStart(3, '0')}`, p.warranty]
        );
      }
    }
  }

  const expenseCats = ['Rent', 'Salary', 'Utility', 'Transport', 'Misc'];
  for (const name of expenseCats) {
    await query(`INSERT INTO expense_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  }

  const supplierExists = await query(`SELECT id FROM suppliers WHERE phone = $1`, ['01800000001']);
  if (!supplierExists.rows[0]) {
    await query(
      `INSERT INTO suppliers (name, phone, address)
       VALUES ('Dhaka Distributors', '01800000001', 'Motijheel')`
    );
  }

  await query(
    `INSERT INTO customers (name, phone, address, credit_limit)
     VALUES ('Walk-in Demo', '01900000001', 'Dhaka', 100000)
     ON CONFLICT (phone) DO NOTHING`
  );

  console.log('Seed complete');
  console.log('Login: admin@shop.local / admin123');
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
