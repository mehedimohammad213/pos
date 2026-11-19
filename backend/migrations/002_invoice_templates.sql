CREATE TABLE IF NOT EXISTS invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  paper TEXT NOT NULL DEFAULT 'a4' CHECK (paper IN ('a4', 'pos80')),
  content_html TEXT NOT NULL DEFAULT '',
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_templates_one_default_per_paper
  ON invoice_templates (paper)
  WHERE is_default = TRUE;

INSERT INTO invoice_templates (name, paper, content_html, content_json, is_default)
VALUES
(
  'Default A4 Invoice',
  'a4',
  $html$
<p><strong>{{shop.name}}</strong></p>
<p>{{shop.address}}</p>
<p>Phone: {{shop.phone}}</p>
<p></p>
<h2 style="text-align: center">INVOICE</h2>
<p>Invoice #: {{invoice_no}}</p>
<p>Date: {{sale_date}} · Time: {{sale_time}}</p>
<p>Customer: {{customer_name}} ({{customer_phone}})</p>
<p>Cashier: {{cashier_name}}</p>
<p></p>
<p>{{items_table}}</p>
<p></p>
<p style="text-align: right">Subtotal: {{currency}}{{subtotal}}</p>
<p style="text-align: right">Discount: {{currency}}{{discount}}</p>
<p style="text-align: right">Tax: {{currency}}{{tax}}</p>
<p style="text-align: right"><strong>Total: {{currency}}{{total}}</strong></p>
<p style="text-align: right">Paid: {{currency}}{{paid}}</p>
<p style="text-align: right">Due: {{currency}}{{due}}</p>
<p></p>
<p style="text-align: center">Thank you for your business!</p>
$html$,
  '{}'::jsonb,
  TRUE
),
(
  'Default POS Receipt',
  'pos80',
  $html$
<p style="text-align: center"><strong>{{shop.name}}</strong></p>
<p style="text-align: center">{{shop.address}}</p>
<p style="text-align: center">{{shop.phone}}</p>
<p style="text-align: center"><strong>INVOICE</strong></p>
<p>Invoice #: {{invoice_no}}</p>
<p>Date: {{sale_date}}</p>
<p>Time: {{sale_time}}</p>
<p>Customer: {{customer_name}}</p>
<p>{{items_table}}</p>
<p><strong>Total: {{currency}}{{total}}</strong></p>
<p>Paid: {{currency}}{{paid}}</p>
<p>Due: {{currency}}{{due}}</p>
<p style="text-align: center">Thank you for your purchase!</p>
$html$,
  '{}'::jsonb,
  TRUE
);
