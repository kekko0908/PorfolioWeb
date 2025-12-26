import { supabase } from "./supabaseClient";
import type { Account, Category, Holding, Setting, Transaction } from "../types";

const handleError = (error: unknown) => {
  if (error) {
    throw error;
  }
};

const toNumber = (value: unknown) =>
  value === null || value === undefined ? 0 : Number(value);

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

export const fetchSettings = async (): Promise<Setting | null> => {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .maybeSingle();
  handleError(error);
  if (!data) return null;
  return {
    ...data,
    emergency_fund: toNumber(data.emergency_fund)
  } as Setting;
};

export const upsertSettings = async (
  payload: Pick<Setting, "user_id" | "base_currency" | "emergency_fund">
): Promise<void> => {
  const { error } = await supabase.from("settings").upsert(payload, {
    onConflict: "user_id"
  });
  handleError(error);
};
