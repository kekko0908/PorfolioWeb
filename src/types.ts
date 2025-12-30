export type Currency = "EUR" | "USD";

export type CategoryType = "income" | "expense" | "investment";

export type TransactionType = "income" | "expense" | "investment" | "transfer";

export type FlowDirection = "in" | "out";

export type AccountType = "cash" | "debit" | "credit" | "paypal" | "bank" | "other";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: CategoryType;
  parent_id: string | null;
  is_fixed: boolean;
  sort_order: number | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string;
  type: TransactionType;
  flow: FlowDirection;
  amount: number;
  currency: Currency;
  date: string;
  note: string | null;
  tags?: string[] | null;
  created_at: string;
}

export interface Holding {
  id: string;
  user_id: string;
  name: string;
  asset_class: string;
  emoji: string | null;
  target_pct: number | null;
  quantity: number;
  avg_cost: number;
  total_cap: number;
  current_value: number;
  currency: Currency;
  start_date: string;
  note: string | null;
  created_at: string;
}

export interface Setting {
  id: string;
  user_id: string;
  base_currency: Currency;
  emergency_fund: number;
  emergency_fund_months: number | null;
  cash_target_cap: number | null;
  target_cash_pct: number | null;
  target_etf_pct: number | null;
  target_bond_pct: number | null;
  target_emergency_pct: number | null;
  rebalance_months: number | null;
  updated_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  emoji: string | null;
  currency: Currency;
  opening_balance: number;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  category_id: string | null;
  title: string;
  emoji: string | null;
  target_amount: number;
  due_date: string;
  created_at: string;
}

export interface MonthlyPoint {
  label: string;
  value: number;
  income: number;
  expense: number;
}

export interface AllocationTarget {
  id: string;
  user_id: string;
  key: string;
  label: string;
  pct: number;
  color: string | null;
  sort_order: number | null;
  created_at: string;
}

export interface CategoryBudget {
  id: string;
  user_id: string;
  category_id: string;
  cap_amount: number | null;
  color: string | null;
  period_key: string;
  created_at: string;
  updated_at: string;
}

export interface Refund {
  id: string;
  user_id: string;
  transaction_id: string;
  account_id: string;
  refund_amount: number;
  currency: Currency;
  date: string;
  note: string | null;
  photo_path: string | null;
  created_at: string;
}
