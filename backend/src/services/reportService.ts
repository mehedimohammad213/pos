import { query } from '../db/pool';

function localISODate(d = new Date()) {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

export type DashboardSummaryOptions = {
  from?: string;
  to?: string;
  canSeeCost?: boolean;
};

export async function dashboardSummary(optsOrDate?: string | DashboardSummaryOptions) {
  let from: string;
  let to: string;
  let canSeeCost = false;

  if (typeof optsOrDate === 'string') {
    from = optsOrDate;
    to = optsOrDate;
  } else if (optsOrDate && typeof optsOrDate === 'object') {
    from = optsOrDate.from || optsOrDate.to || localISODate();
    to = optsOrDate.to || from;
    canSeeCost = Boolean(optsOrDate.canSeeCost);
  } else {
    from = localISODate();
    to = from;
  }

  const sales = await query(
    `SELECT
       COUNT(*)::int AS invoice_count,
       COALESCE(SUM(total),0) AS total_sales,
       COALESCE(SUM(CASE WHEN sale_type='retail' THEN total ELSE 0 END),0) AS retail_sales,
       COALESCE(SUM(CASE WHEN sale_type='wholesale' THEN total ELSE 0 END),0) AS wholesale_sales,
       COALESCE(SUM(due_amount),0) AS due_today,
       COALESCE(SUM(due_amount),0) AS due_amount,
       COALESCE(SUM(tax_amount),0) AS total_tax,
       COALESCE(SUM(discount_amount),0) AS total_discount
     FROM sales
     WHERE sale_date BETWEEN $1::date AND $2::date AND status = 'completed'`,
    [from, to]
  );

  const pay = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN p.method='cash' THEN p.amount ELSE 0 END),0) AS cash,
       COALESCE(SUM(CASE WHEN p.method='card' THEN p.amount ELSE 0 END),0) AS card,
       COALESCE(SUM(CASE WHEN p.method IN ('bkash','nagad','rocket','mfs') THEN p.amount ELSE 0 END),0) AS mfs,
       COALESCE(SUM(CASE WHEN p.method='credit' THEN p.amount ELSE 0 END),0) AS credit
     FROM payments p
     JOIN sales s ON s.id = p.sale_id
     WHERE s.sale_date BETWEEN $1::date AND $2::date AND s.status = 'completed'`,
    [from, to]
  );

  const exp = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total_expenses, COUNT(*)::int AS expense_count
     FROM expenses
     WHERE expense_date BETWEEN $1::date AND $2::date`,
    [from, to]
  );

  let profitData = null;
  if (canSeeCost) {
    const profitQ = await query(
      `SELECT COALESCE(SUM(si.line_total),0) AS revenue,
              COALESCE(SUM(si.cost_at_sale * si.quantity),0) AS cost,
              COALESCE(SUM(si.line_total - si.cost_at_sale * si.quantity),0) AS gross_profit
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.sale_date BETWEEN $1::date AND $2::date AND s.status='completed'`,
      [from, to]
    );
    const row = profitQ.rows[0];
    const totalExp = Number(exp.rows[0]?.total_expenses || 0);
    const gross = Number(row?.gross_profit || 0);
    profitData = {
      revenue: Number(row?.revenue || 0),
      cost: Number(row?.cost || 0),
      gross_profit: gross,
      net_profit: gross - totalExp,
    };
  }

  const recentSales = await query(
    `SELECT s.id, s.invoice_no, s.sale_date, s.created_at, s.sale_type,
            s.total, s.paid_amount, s.due_amount, s.payment_status,
            c.name AS customer_name, u.name AS cashier_name
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN users u ON u.id = s.cashier_id
     WHERE s.status = 'completed'
     ORDER BY s.sale_date DESC, s.created_at DESC
     LIMIT 8`
  );

  const topProducts = await query(
    `SELECT p.id, p.name, p.sku, p.unit,
            SUM(si.quantity)::numeric AS qty_sold,
            SUM(si.line_total)::numeric AS total_amount
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN products p ON p.id = si.product_id
     WHERE s.sale_date BETWEEN $1::date AND $2::date AND s.status = 'completed'
     GROUP BY p.id, p.name, p.sku, p.unit
     ORDER BY total_amount DESC
     LIMIT 5`,
    [from, to]
  );

  const lowStockItems = await query(
    `SELECT p.id, p.name, p.sku, p.unit, p.reorder_level, COALESCE(ps.quantity, 0) AS current_stock
     FROM products p
     LEFT JOIN product_stock ps ON ps.product_id = p.id
     WHERE p.deleted_at IS NULL AND p.is_active AND COALESCE(ps.quantity, 0) <= p.reorder_level
     ORDER BY (COALESCE(ps.quantity, 0) - p.reorder_level) ASC
     LIMIT 5`
  );

  const trends = await query(
    `SELECT
       to_char(d::date, 'YYYY-MM-DD') AS date,
       to_char(d::date, 'Dy, DD Mon') AS label,
       COALESCE(SUM(s.total), 0) AS total,
       COUNT(s.id)::int AS invoice_count
     FROM generate_series(($1::date - 6)::timestamp, $1::date::timestamp, '1 day'::interval) d
     LEFT JOIN sales s ON s.sale_date = d::date AND s.status = 'completed'
     GROUP BY d
     ORDER BY d ASC`,
    [to]
  );

  const lowStock = await query(
    `SELECT COUNT(*)::int AS cnt FROM products p
     LEFT JOIN product_stock ps ON ps.product_id = p.id
     WHERE p.deleted_at IS NULL AND p.is_active AND COALESCE(ps.quantity,0) <= p.reorder_level`
  );

  const openDemands = await query(
    `SELECT COUNT(*)::int AS cnt FROM purchase_demands WHERE status IN ('draft','ordered','partially_received')`
  );

  const customerDues = await query(`SELECT COALESCE(SUM(due_balance),0) AS total FROM customers WHERE deleted_at IS NULL`);
  const overdueEmi = await query(
    `SELECT COUNT(*)::int AS cnt FROM installment_dues
     WHERE status IN ('overdue','pending','partial') AND due_date < CURRENT_DATE AND paid_amount < amount`
  );

  return {
    date: from === to ? from : `${from} to ${to}`,
    from,
    to,
    sales: sales.rows[0],
    payments: pay.rows[0],
    expenses: exp.rows[0],
    profit: profitData,
    recent_sales: recentSales.rows,
    top_products: topProducts.rows,
    low_stock_items: lowStockItems.rows,
    trends: trends.rows,
    low_stock_count: lowStock.rows[0].cnt,
    open_demands: openDemands.rows[0].cnt,
    customer_dues: customerDues.rows[0].total,
    overdue_emi: overdueEmi.rows[0].cnt,
  };
}

export async function salesReport(from: string, to: string, groupBy: 'product' | 'category' | 'brand' | 'cashier' = 'product') {
  if (groupBy === 'cashier') {
    const r = await query(
      `SELECT u.name AS label, COUNT(s.id)::int AS invoices, COALESCE(SUM(s.total),0) AS total
       FROM sales s LEFT JOIN users u ON u.id = s.cashier_id
       WHERE s.sale_date BETWEEN $1::date AND $2::date AND s.status='completed'
       GROUP BY u.name ORDER BY total DESC`,
      [from, to]
    );
    return r.rows;
  }
  if (groupBy === 'category') {
    const r = await query(
      `SELECT COALESCE(c.name,'(none)') AS label,
              SUM(si.quantity) AS qty, SUM(si.line_total) AS total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE s.sale_date BETWEEN $1::date AND $2::date AND s.status='completed'
       GROUP BY c.name ORDER BY total DESC`,
      [from, to]
    );
    return r.rows;
  }
  if (groupBy === 'brand') {
    const r = await query(
      `SELECT COALESCE(b.name,'(none)') AS label,
              SUM(si.quantity) AS qty, SUM(si.line_total) AS total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE s.sale_date BETWEEN $1::date AND $2::date AND s.status='completed'
       GROUP BY b.name ORDER BY total DESC`,
      [from, to]
    );
    return r.rows;
  }
  const r = await query(
    `SELECT p.name AS label, p.sku,
            SUM(si.quantity) AS qty, SUM(si.line_total) AS total,
            SUM(si.line_total - si.cost_at_sale * si.quantity) AS profit
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN products p ON p.id = si.product_id
     WHERE s.sale_date BETWEEN $1::date AND $2::date AND s.status='completed'
     GROUP BY p.id, p.name, p.sku ORDER BY total DESC`,
    [from, to]
  );
  return r.rows;
}

export async function profitReport(from: string, to: string) {
  const r = await query(
    `SELECT COALESCE(SUM(si.line_total),0) AS revenue,
            COALESCE(SUM(si.cost_at_sale * si.quantity),0) AS cost,
            COALESCE(SUM(si.line_total - si.cost_at_sale * si.quantity),0) AS profit
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.sale_date BETWEEN $1::date AND $2::date AND s.status='completed'`,
    [from, to]
  );
  return r.rows[0];
}

export async function stockValuation() {
  const r = await query(
    `SELECT COALESCE(SUM(COALESCE(ps.quantity,0) * p.cost),0) AS valuation,
            COUNT(p.id)::int AS products
     FROM products p
     LEFT JOIN product_stock ps ON ps.product_id = p.id
     WHERE p.deleted_at IS NULL AND p.is_active`
  );
  return r.rows[0];
}

export async function exchangesSummary(from: string, to: string) {
  const r = await query(
    `SELECT COUNT(*)::int AS count,
            COALESCE(SUM(returned_value),0) AS returned_value,
            COALESCE(SUM(new_value),0) AS new_value,
            COALESCE(SUM(net_payable),0) AS net_payable
     FROM exchanges WHERE exchange_date BETWEEN $1::date AND $2::date`,
    [from, to]
  );
  return r.rows[0];
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = row[h];
          const s = v == null ? '' : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(',')
    );
  }
  return lines.join('\n');
}
