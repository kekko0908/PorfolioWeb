import { useCallback, useEffect, useState } from "react";
import type { Account, Category, Goal, Holding, Setting, Transaction } from "../types";
import {
  fetchAccounts,
  fetchCategories,
  fetchGoals,
  fetchHoldings,
  fetchSettings,
  fetchTransactions
} from "../lib/api";

export const usePortfolioData = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [settings, setSettings] = useState<Setting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        nextSettings
      ] =
        await Promise.all([
          fetchAccounts(),
          fetchCategories(),
          fetchGoals(),
          fetchTransactions(),
          fetchHoldings(),
          fetchSettings()
        ]);
      setAccounts(nextAccounts);
      setCategories(nextCategories);
      setGoals(nextGoals);
      setTransactions(nextTransactions);
      setHoldings(nextHoldings);
      setSettings(nextSettings);
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
    goals,
    transactions,
    holdings,
    settings,
    loading,
    error,
    refresh
  };
};
