export type Currency = "EUR" | "USD";

export type CategoryType = "income" | "expense" | "investment";

export type FlowDirection = "in" | "out";

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
  category_id: string;
  type: CategoryType;
  flow: FlowDirection;
  amount: number;
  currency: Currency;
  date: string;
  note: string | null;
  created_at: string;
}

export interface Holding {
  id: string;
  user_id: string;
  name: string;
  asset_class: string;
  cost_basis: number;
  current_value: number;
  currency: Currency;
  pe_ratio: number | null;
  start_date: string;
  note: string | null;
  created_at: string;
}

export interface Setting {
  id: string;
  user_id: string;
  base_currency: Currency;
  emergency_fund: number;
  updated_at: string;
}

export interface MonthlyPoint {
  label: string;
  value: number;
  income: number;
  expense: number;
}
