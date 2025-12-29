import { supabase } from "./supabaseClient";
import type {
  Account,
  AllocationTarget,
  Category,
  Goal,
  Holding,
  Setting,
  Transaction
} from "../types";

const handleError = (error: unknown) => {
  if (error) {
    throw error;
  }
};

const toNumber = (value: unknown) =>
  value === null || value === undefined ? 0 : Number(value);

const isMissingRelationError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  if (err.code === "42P01") return true;
  if (typeof err.message !== "string") return false;
  if (/does not exist/i.test(err.message)) return true;
  if (/schema cache/i.test(err.message)) return true;
  if (/Could not find the table/i.test(err.message)) return true;
  return false;
};

export const fetchCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name");
  handleError(error);
  return (data ?? []) as Category[];
};

export const fetchAccounts = async (): Promise<Account[]> => {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });
  handleError(error);
  return (data ?? []).map((item) => ({
    ...item,
    opening_balance: toNumber(item.opening_balance)
  })) as Account[];
};

export const createAccount = async (
  payload: Omit<Account, "id" | "created_at" | "user_id">
): Promise<void> => {
  const { error } = await supabase.from("accounts").insert(payload);
  handleError(error);
};

export const updateAccount = async (
  id: string,
  payload: Partial<Account>
): Promise<void> => {
  const { error } = await supabase.from("accounts").update(payload).eq("id", id);
  handleError(error);
};

export const deleteAccount = async (id: string): Promise<void> => {
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  handleError(error);
};

export const createCategory = async (
  payload: Omit<Category, "id" | "created_at" | "user_id">
): Promise<void> => {
  const { error } = await supabase.from("categories").insert(payload);
  handleError(error);
};

export const updateCategory = async (
  id: string,
  payload: Partial<Category>
): Promise<void> => {
  const { error } = await supabase.from("categories").update(payload).eq("id", id);
  handleError(error);
};

export const deleteCategory = async (id: string): Promise<void> => {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  handleError(error);
};

export const seedDefaultCategories = async (): Promise<void> => {
  const { error } = await supabase.rpc("seed_default_categories");
  handleError(error);
};

export const fetchTransactions = async (): Promise<Transaction[]> => {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: false });
  handleError(error);
  return (data ?? []).map((item) => ({
    ...item,
    amount: toNumber(item.amount)
  })) as Transaction[];
};

export const createTransaction = async (
  payload: Omit<Transaction, "id" | "created_at" | "user_id">
): Promise<void> => {
  const { error } = await supabase.from("transactions").insert(payload);
  handleError(error);
};

export const createTransactions = async (
  payloads: Omit<Transaction, "id" | "created_at" | "user_id">[]
): Promise<void> => {
  if (payloads.length === 0) return;
  const { error } = await supabase.from("transactions").insert(payloads);
  handleError(error);
};

export const updateTransaction = async (
  id: string,
  payload: Partial<Transaction>
): Promise<void> => {
  const { error } = await supabase
    .from("transactions")
    .update(payload)
    .eq("id", id);
  handleError(error);
};

export const deleteTransaction = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id);
  handleError(error);
};

export const fetchHoldings = async (): Promise<Holding[]> => {
  const { data, error } = await supabase
    .from("holdings")
    .select("*")
    .order("created_at", { ascending: false });
  handleError(error);
  return (data ?? []).map((item) => ({
    ...item,
    emoji: item.emoji ?? null,
    target_pct: item.target_pct ?? null,
    quantity: toNumber(item.quantity),
    avg_cost: toNumber(item.avg_cost),
    total_cap: toNumber(item.total_cap),
    current_value: toNumber(item.current_value)
  })) as Holding[];
};

export const createHolding = async (
  payload: Omit<Holding, "id" | "created_at" | "user_id">
): Promise<void> => {
  const { error } = await supabase.from("holdings").insert(payload);
  handleError(error);
};

export const createHoldings = async (
  payloads: Omit<Holding, "id" | "created_at" | "user_id">[]
): Promise<void> => {
  if (payloads.length === 0) return;
  const { error } = await supabase.from("holdings").insert(payloads);
  handleError(error);
};

export const updateHolding = async (
  id: string,
  payload: Partial<Holding>
): Promise<void> => {
  const { error } = await supabase.from("holdings").update(payload).eq("id", id);
  handleError(error);
};

export const deleteHolding = async (id: string): Promise<void> => {
  const { error } = await supabase.from("holdings").delete().eq("id", id);
  handleError(error);
};

export const fetchGoals = async (): Promise<Goal[]> => {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .order("created_at", { ascending: false });
  handleError(error);
  return (data ?? []).map((item) => ({
    ...item,
    target_amount: toNumber(item.target_amount)
  })) as Goal[];
};

export const createGoal = async (
  payload: Omit<Goal, "id" | "created_at" | "user_id">
): Promise<void> => {
  const { error } = await supabase.from("goals").insert(payload);
  handleError(error);
};

export const updateGoal = async (
  id: string,
  payload: Partial<Goal>
): Promise<void> => {
  const { error } = await supabase.from("goals").update(payload).eq("id", id);
  handleError(error);
};

export const deleteGoal = async (id: string): Promise<void> => {
  const { error } = await supabase.from("goals").delete().eq("id", id);
  handleError(error);
};

export const fetchSettings = async (): Promise<Setting | null> => {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .maybeSingle();
  handleError(error);
  if (!data) return null;
  return {
    ...data,
    emergency_fund: toNumber(data.emergency_fund),
    cash_target_cap: data.cash_target_cap === null ? null : toNumber(data.cash_target_cap),
    target_cash_pct: data.target_cash_pct ?? null,
    target_etf_pct: data.target_etf_pct ?? null,
    target_bond_pct: data.target_bond_pct ?? null,
    target_emergency_pct: data.target_emergency_pct ?? null,
    rebalance_months: data.rebalance_months ?? null
  } as Setting;
};

export const upsertSettings = async (
  payload: Pick<Setting, "user_id" | "base_currency" | "emergency_fund"> &
    Partial<
      Pick<
        Setting,
        | "cash_target_cap"
        | "target_cash_pct"
        | "target_etf_pct"
        | "target_bond_pct"
        | "target_emergency_pct"
        | "rebalance_months"
      >
    >
): Promise<void> => {
  const { error } = await supabase.from("settings").upsert(payload, {
    onConflict: "user_id"
  });
  handleError(error);
};

export const fetchAllocationTargets = async (): Promise<AllocationTarget[]> => {
  const { data, error } = await supabase
    .from("allocation_targets")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (isMissingRelationError(error)) return [];
  handleError(error);

  return (data ?? []).map((item) => ({
    ...item,
    pct: toNumber(item.pct),
    sort_order: item.sort_order ?? null,
    color: item.color ?? null
  })) as AllocationTarget[];
};

export const replaceAllocationTargets = async (
  payloads: Array<
    Pick<AllocationTarget, "user_id" | "key" | "label"> &
      Partial<Pick<AllocationTarget, "color" | "sort_order">> & { pct: number }
  >
): Promise<boolean> => {
  if (payloads.length === 0) return true;
  const userId = payloads[0].user_id;

  const { error: deleteError } = await supabase
    .from("allocation_targets")
    .delete()
    .eq("user_id", userId);

  if (isMissingRelationError(deleteError)) return false;
  handleError(deleteError);

  const { error: insertError } = await supabase.from("allocation_targets").insert(payloads);
  if (isMissingRelationError(insertError)) return false;
  handleError(insertError);

  return true;
};
