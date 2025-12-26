import { useCallback, useEffect, useState } from "react";
import type { Account, Category, Holding, Setting, Transaction } from "../types";
import {
  fetchAccounts,
  fetchCategories,
  fetchHoldings,
  fetchSettings,
  fetchTransactions
} from "../lib/api";

export const usePortfolioData = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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
        nextTransactions,
        nextHoldings,
        nextSettings
      ] =
        await Promise.all([
          fetchAccounts(),
          fetchCategories(),
          fetchTransactions(),
          fetchHoldings(),
          fetchSettings()
        ]);
      setAccounts(nextAccounts);
      setCategories(nextCategories);
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
    transactions,
    holdings,
    settings,
    loading,
    error,
    refresh
  };
};
