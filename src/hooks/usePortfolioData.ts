import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Account,
  Category,
  CategoryBudget,
  Goal,
  Holding,
  Refund,
  Setting,
  Transaction
} from "../types";
import {
  createAccount,
  fetchAccounts,
  fetchCategoryBudgets,
  fetchCategories,
  fetchRefunds,
  fetchGoals,
  fetchHoldings,
  fetchSettings,
  fetchTransactions
} from "../lib/api";

export const usePortfolioData = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [settings, setSettings] = useState<Setting | null>(null);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const creatingEmergencyRef = useRef(false);

  const hasEmergencyAccount = (items: Account[]) =>
    items.some((account) => /emergenza|emergency/i.test(account.name));

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        nextAccounts,
        nextCategories,
        nextGoals,
        nextTransactions,
        nextHoldings,
        nextSettings,
        nextCategoryBudgets,
        nextRefunds
      ] = await Promise.all([
        fetchAccounts(),
        fetchCategories(),
        fetchGoals(),
        fetchTransactions(),
        fetchHoldings(),
        fetchSettings(),
        fetchCategoryBudgets(),
        fetchRefunds()
      ]);
      let accountsToUse = nextAccounts;
      if (!hasEmergencyAccount(nextAccounts) && !creatingEmergencyRef.current) {
        creatingEmergencyRef.current = true;
        try {
          await createAccount({
            name: "Fondo emergenza",
            type: "bank",
            emoji: null,
            currency: nextSettings?.base_currency ?? "EUR",
            opening_balance: 0
          });
          accountsToUse = await fetchAccounts();
        } catch (err) {
          console.error("Impossibile creare il conto Fondo emergenza.", err);
        } finally {
          creatingEmergencyRef.current = false;
        }
      }
      setAccounts(accountsToUse);
      setCategories(nextCategories);
      setCategoryBudgets(nextCategoryBudgets);
      setGoals(nextGoals);
      setTransactions(nextTransactions);
      setHoldings(nextHoldings);
      setSettings(nextSettings);
      setRefunds(nextRefunds);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    accounts,
    categories,
    categoryBudgets,
    refunds,
    goals,
    transactions,
    holdings,
    settings,
    loading,
    error,
    refresh
  };
};
