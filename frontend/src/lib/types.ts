export type PermissionKey =
  | "discount"
  | "void"
  | "see_cost"
  | "approve_return"
  | "wholesale_price"
  | "backdate_sale"
  | "manage_users"
  | "walkin_exchange";

export type PaginatedResponse<T> = {
  items: T[];
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type AuthUser = {
  id: string;
  role: string;
  email: string;
  name: string;
  permissions: PermissionKey[];
};

export type Product = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: string;
  brand_id?: string;
  category_name?: string;
  brand_name?: string;
  retail_price: number | string;
  wholesale_price?: number | string;
  cost?: number | string;
  stock_qty?: number | string;
  reorder_level?: number | string;
  serial_required?: boolean;
  warranty_months?: number;
  tax_percent?: number | string;
  is_active?: boolean;
  unit?: string;
};

export interface BulkImportRowError {
  row: number;
  name?: string;
  sku?: string;
  barcode?: string;
  error: string;
}

export interface BulkImportResult {
  total: number;
  successCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  errors: BulkImportRowError[];
  products: Product[];
}

export type Category = { id: string; name: string; description?: string };
export type Brand = { id: string; name: string };

export type Serial = {
  id: string;
  serial_number: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  status: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  credit_limit?: number | string;
  due_balance?: number | string;
};

export type SaleLine = {
  id?: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  discount_amount?: number;
  line_total?: number;
  serial_ids?: string[];
  serials?: { serial_id: string; serial_number: string }[];
};

export type Payment = {
  method: string;
  amount: number;
  reference?: string;
};

export type Sale = {
  id: string;
  invoice_no?: string;
  sale_type: string;
  sale_date: string;
  status: string;
  subtotal?: number;
  discount_amount?: number;
  total: number;
  paid_amount?: number;
  due_amount?: number;
  payment_status?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  cashier_name?: string;
  items?: SaleLine[];
  payments?: Payment[];
  hold_name?: string;
  notes?: string;
  is_backdated?: boolean;
  created_at?: string;
  tax_amount?: number | string;
};

export type Supplier = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  due_balance?: number | string;
};

export type PurchaseDemand = {
  id: string;
  demand_no?: string;
  status: string;
  demand_date?: string;
  created_at?: string;
  notes?: string;
  supplier_name?: string;
  preferred_supplier_id?: string;
  items?: {
    product_id: string;
    product_name?: string;
    requested_qty: number;
    last_cost?: number;
    received_qty?: number;
  }[];
};

export type Purchase = {
  id: string;
  purchase_no?: string;
  supplier_id?: string;
  supplier_name?: string;
  purchase_date?: string;
  total?: number;
  due_amount?: number;
  status?: string;
};

export type InstallmentPlan = {
  id: string;
  sale_id: string;
  invoice_no?: string;
  customer_name?: string;
  customer_phone?: string;
  total_amount?: number;
  monthly_amount?: number;
  status?: string;
  dues?: { id: string; due_date: string; amount: number; paid_amount: number; status: string; installment_no?: number }[];
};

export type WarrantyClaim = {
  id: string;
  claim_no?: string;
  customer_name?: string;
  product_name?: string;
  serial_number?: string;
  status: string;
  issue_description?: string;
  resolution?: string;
};

export type Expense = {
  id: string;
  category_id?: string;
  category_name?: string;
  amount: number;
  note?: string;
  expense_date?: string;
};

export type ShopSettings = {
  id?: string;
  name?: string;
  address?: string;
  phone?: string;
  logo_url?: string;
  vat_tin?: string;
  default_tax_percent?: number | string;
  currency?: string;
};

export type Shift = {
  id: string;
  opened_at: string;
  closed_at?: string;
  opening_cash?: number;
  closing_cash?: number;
  expected_cash?: number;
  status?: string;
};

export type DashboardSummary = {
  date: string;
  sales: {
    invoice_count: number;
    total_sales: number;
    retail_sales: number;
    wholesale_sales: number;
    due_today: number;
  };
  payments: { cash: number; card: number; mfs: number; credit: number };
  low_stock_count: number;
  open_demands: number;
  customer_dues: number;
  overdue_emi: number;
};

export type CartItem = {
  product: Product;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  serial_ids: string[];
};

export type LowStockItem = {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  reorder_level: number;
  last_cost: number;
  current_qty: number;
  suggested_qty: number;
};

export const PAYMENT_METHODS = [
  "cash",
  "card",
  "bkash",
  "nagad",
  "rocket",
  "mfs",
  "mixed",
  "credit",
  "installment",
] as const;
