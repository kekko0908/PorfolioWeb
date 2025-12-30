import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { FormEvent } from "react";
import { usePortfolioData } from "../hooks/usePortfolioData";
import { useAuth } from "../contexts/AuthContext";
import {
  createTransaction,
  createTransactions,
  createRefund,
  seedDefaultCategories,
  updateTransaction
} from "../lib/api";
import { formatCurrency, formatCurrencySafe, formatDate, formatPercent } from "../lib/format";
import { buildCategoryIcons } from "../lib/categoryIcons";
import {
  buildAccountBalances,
  filterBalanceCorrectionTransactions,
  isBalanceCorrectionTransaction
} from "../lib/metrics";
import { uploadRefundPhoto } from "../lib/refunds";
import { supabase } from "../lib/supabaseClient";
import type { Category, Currency, Transaction, TransactionType } from "../types";

const today = new Date().toISOString().slice(0, 10);

type CategoryWithChildren = Category & { children: Category[] };

const emptyForm = {
  type: "expense" as TransactionType,
  flow: "out" as "in" | "out",
  account_id: "",
  transfer_from_id: "",
  transfer_to_id: "",
  category_id: "",
  amount: "",
  currency: "EUR",
  date: today,
  note: "",
  tags: ""
};

const correctionCategoryName = "Correzione Saldo";
const refundCategoryName = "Rimborso";

const normalizeKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

const correctionKey = normalizeKey(correctionCategoryName);
const refundKey = normalizeKey(refundCategoryName);

const isCorrectionCategory = (category: Category) =>
  normalizeKey(category.name) === correctionKey;

const parseTags = (raw: string) =>
  raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

const Transactions = () => {
  const {
    accounts,
    categories,
    categoryBudgets,
    transactions,
    refunds,
    settings,
    refresh,
    loading,
    error
  } = usePortfolioData();
  const { session } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [refundTarget, setRefundTarget] = useState<Transaction | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundForm, setRefundForm] = useState({
    amount: "",
    account_id: "",
    date: today,
    note: "",
    photo: null as File | null
  });

  const currency = settings?.base_currency ?? "EUR";
  const activeMonthKey = (form.date || today).slice(0, 7);

  const categoryIcons = useMemo(() => buildCategoryIcons(categories), [categories]);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const categoryKeyById = useMemo(
    () => new Map(categories.map((category) => [category.id, normalizeKey(category.name)])),
    [categories]
  );
  const accountMap = useMemo(
    () =>
      new Map(
        accounts.map((account) => [
          account.id,
          `${account.emoji ? `${account.emoji} ` : ""}${account.name}`
        ])
      ),
    [accounts]
  );

  const getRefundCategoryId = async () => {
    const existing = categories.find(
      (item) => item.type === "income" && normalizeKey(item.name) === refundKey
    );
    if (existing) return existing.id;
    const { data, error } = await supabase
      .from("categories")
      .insert({ name: refundCategoryName, type: "income" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };

  const transferCategoryId = useMemo(() => {
    const match = categories.find((category) =>
      category.name.toLowerCase().includes("giroconti")
    );
    return match?.id ?? "";
  }, [categories]);

  const isTransfer = form.type === "transfer";

  const filteredCategories = useMemo(
    () =>
      form.type === "transfer"
        ? []
        : categories.filter(
            (category) =>
              category.type === form.type && !isCorrectionCategory(category)
          ),
    [categories, form.type]
  );

  const budgetCapsByCategory = useMemo(() => {
    const map = new Map<string, number | null>();
    const matches = categoryBudgets.filter(
      (budget) => budget.period_key === activeMonthKey
    );
    const scoped = matches.length > 0
      ? matches
      : categoryBudgets.filter((budget) => !budget.period_key);
    scoped.forEach((budget) => {
      map.set(budget.category_id, budget.cap_amount ?? null);
    });
    return map;
  }, [categoryBudgets, activeMonthKey]);

  const tagSuggestions = useMemo(() => {
    const all = new Map<string, string>();
    const byCategory = new Map<string, Map<string, string>>();
    transactions.forEach((transaction) => {
      const tags = transaction.tags ?? [];
      if (tags.length === 0) return;
      tags.forEach((tag) => {
        const cleaned = tag.trim();
        const key = normalizeKey(cleaned);
        if (!key) return;
        if (!all.has(key)) all.set(key, cleaned);
        if (transaction.category_id) {
          const bucket = byCategory.get(transaction.category_id) ?? new Map();
          if (!bucket.has(key)) bucket.set(key, cleaned);
          byCategory.set(transaction.category_id, bucket);
        }
      });
    });
    return {
      all: Array.from(all.values()),
      byCategory
    };
  }, [transactions]);

  const refundsByTransaction = useMemo(() => {
    const map = new Map<string, { amount: number; currency: Currency }>();
    refunds.forEach((refund) => {
      const current = map.get(refund.transaction_id);
      map.set(refund.transaction_id, {
        amount: (current?.amount ?? 0) + refund.refund_amount,
        currency: current?.currency ?? refund.currency
      });
    });
    return map;
  }, [refunds]);

  const accountBalances = useMemo(
    () => buildAccountBalances(accounts, transactions),
    [accounts, transactions]
  );

  const filteredTransactions = useMemo(
    () => filterBalanceCorrectionTransactions(transactions, categories),
    [transactions, categories]
  );

  const expenseSpendByCategory = useMemo(() => {
    const spend = new Map<string, number>();
    categories.forEach((category) => {
      spend.set(category.id, 0);
    });
    filteredTransactions.forEach((transaction) => {
      if (transaction.type !== "expense") return;
      if (!transaction.date.startsWith(activeMonthKey)) return;
      if (editing && transaction.id === editing.id) return;
      const category = categoryById.get(transaction.category_id);
      if (!category) return;
      let cursor: Category | undefined = category;
      while (cursor) {
        spend.set(cursor.id, (spend.get(cursor.id) ?? 0) + transaction.amount);
        cursor = cursor.parent_id ? categoryById.get(cursor.parent_id) : undefined;
      }
    });
    return spend;
  }, [filteredTransactions, categories, categoryById, activeMonthKey, editing]);

  const categoryOptions = useMemo<CategoryWithChildren[]>(() => {
    const parents = filteredCategories.filter((category) => !category.parent_id);
    return parents.map((parent) => ({
      ...parent,
      children: filteredCategories.filter((child) => child.parent_id === parent.id)
    }));
  }, [filteredCategories]);

  const filteredCategoryOptions = useMemo<CategoryWithChildren[]>(() => {
    const query = categorySearch.trim().toLowerCase();
    if (!query) return categoryOptions;
    return categoryOptions
      .map((parent) => {
        const parentMatch = parent.name.toLowerCase().includes(query);
        const children = parent.children.filter((child) =>
          child.name.toLowerCase().includes(query)
        );
        if (!parentMatch && children.length === 0) return null;
        return {
          ...parent,
          children: parentMatch ? parent.children : children
        };
      })
      .filter((item): item is CategoryWithChildren => item !== null);
  }, [categoryOptions, categorySearch]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === form.category_id),
    [categories, form.category_id]
  );

  const categoryBudget = useMemo(() => {
    if (!selectedCategory) return null;
    const directCap = budgetCapsByCategory.get(selectedCategory.id) ?? null;
    const parentCap = selectedCategory.parent_id
      ? budgetCapsByCategory.get(selectedCategory.parent_id) ?? null
      : null;
    if (directCap !== null && parentCap !== null) {
      return Math.min(directCap, parentCap);
    }
    return directCap ?? parentCap;
  }, [budgetCapsByCategory, selectedCategory]);

  const budgetStatus = useMemo(() => {
    if (!selectedCategory || form.type !== "expense") return null;
    if (categoryBudget === null || categoryBudget <= 0) return null;
    const currentSpent = expenseSpendByCategory.get(selectedCategory.id) ?? 0;
    const pendingAmount = Number(form.amount) || 0;
    const projected = currentSpent + Math.max(pendingAmount, 0);
    const ratio = projected / categoryBudget;
    if (ratio >= 1) return "over";
    if (ratio >= 0.8) return "warn";
    return "ok";
  }, [selectedCategory, form.type, categoryBudget, expenseSpendByCategory, form.amount]);

  const budgetInfo = useMemo(() => {
    if (!selectedCategory || form.type !== "expense") return null;
    const currentSpent = expenseSpendByCategory.get(selectedCategory.id) ?? 0;
    const pendingAmount = Number(form.amount) || 0;
    const projected = currentSpent + Math.max(pendingAmount, 0);
    if (categoryBudget === null || categoryBudget <= 0) {
      return {
        cap: null,
        projected,
        currentSpent,
        remaining: null,
        percentSpent: null,
        overAmount: null,
        overPercent: null
      };
    }
    const remaining = categoryBudget - projected;
    const percentSpent = projected / categoryBudget;
    const overAmount = remaining < 0 ? Math.abs(remaining) : 0;
    const overPercent = overAmount > 0 ? overAmount / categoryBudget : 0;
    return {
      cap: categoryBudget,
      projected,
      currentSpent,
      remaining,
      percentSpent,
      overAmount,
      overPercent
    };
  }, [selectedCategory, form.type, categoryBudget, expenseSpendByCategory, form.amount]);

  const recentTransactions = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
    return sorted.slice(0, 6);
  }, [transactions]);

  const summary = useMemo(() => {
    const limit = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return filteredTransactions.reduce(
      (acc, item) => {
        if (new Date(item.date).getTime() < limit) return acc;
        if (item.type === "income") {
          acc.income += item.amount;
        } else if (item.type === "expense") {
          acc.expense += item.amount;
        } else if (item.type === "investment") {
          if (item.flow === "in") acc.investmentIn += item.amount;
          if (item.flow === "out") acc.investmentOut += item.amount;
        }
        return acc;
      },
      { income: 0, expense: 0, investmentIn: 0, investmentOut: 0 }
    );
  }, [filteredTransactions]);

  const netFlow =
    summary.income -
    summary.expense +
    summary.investmentIn -
    summary.investmentOut;

  const resetForm = () => {
    setForm({ ...emptyForm, currency });
    setEditing(null);
    if (searchParams.get("edit")) {
      setSearchParams({});
    }
  };

  const selectedTags = useMemo(() => parseTags(form.tags), [form.tags]);

  const addTagToForm = (tag: string) => {
    setForm((prev) => {
      const existing = parseTags(prev.tags);
      const lowerExisting = existing.map((value) => normalizeKey(value));
      const tagKey = normalizeKey(tag);
      if (!tagKey || lowerExisting.includes(tagKey)) {
        return prev;
      }
      const nextTags = [...existing, tag];
      return { ...prev, tags: nextTags.join(", ") };
    });
  };

  const openRefundModal = (item: Transaction) => {
    if (isBalanceCorrectionTransaction(item, categoryKeyById)) {
      setMessage("Il rimborso non è disponibile per la Correzione Saldo.");
      return;
    }
    setRefundTarget(item);
    setRefundForm({
      amount: String(item.amount),
      account_id: item.account_id,
      date: today,
      note: "",
      photo: null
    });
    setRefundMessage(null);
    setRefundOpen(true);
  };

  const closeRefundModal = () => {
    setRefundOpen(false);
    setRefundTarget(null);
    setRefundMessage(null);
  };

  const handleRefundSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!refundTarget || !session?.user) return;
    setRefundMessage(null);
    const amountValue = Number(refundForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setRefundMessage("Inserisci un importo valido.");
      return;
    }
    if (!refundForm.account_id) {
      setRefundMessage("Seleziona il conto di accredito.");
      return;
    }
    const account = accounts.find((item) => item.id === refundForm.account_id);
    const refundCurrency = account?.currency ?? currency;
    let photoPath: string | null = null;

    setRefundSaving(true);
    try {
      if (refundForm.photo) {
        const upload = await uploadRefundPhoto(session.user.id, refundForm.photo);
        photoPath = upload.path;
      }
      const categoryId = await getRefundCategoryId();
      const originalCategory =
        categoryMap.get(refundTarget.category_id) ?? "Transazione";
      const refundNote =
        refundForm.note.trim() || `Rimborso: ${originalCategory}`;

      await createRefund({
        transaction_id: refundTarget.id,
        account_id: refundForm.account_id,
        refund_amount: amountValue,
        currency: refundCurrency as Currency,
        date: refundForm.date,
        note: refundForm.note.trim() || null,
        photo_path: photoPath
      });

      await createTransaction({
        type: "income",
        flow: "in",
        account_id: refundForm.account_id,
        category_id: categoryId,
        amount: amountValue,
        currency: refundCurrency as "EUR" | "USD",
        date: refundForm.date,
        note: refundNote,
        tags: refundTarget.tags ?? null
      });

      await refresh();
      setMessage("Rimborso registrato.");
      closeRefundModal();
    } catch (err) {
      setRefundMessage((err as Error).message);
    } finally {
      setRefundSaving(false);
    }
  };

  useEffect(() => {
    if (accounts.length === 0) return;
    setForm((prev) => {
      if (prev.type === "transfer") {
        const fromId = prev.transfer_from_id || accounts[0].id;
        const toId = prev.transfer_to_id || accounts[1]?.id || accounts[0].id;
        const fromAccount = accounts.find((item) => item.id === fromId) ?? accounts[0];
        return {
          ...prev,
          transfer_from_id: fromId,
          transfer_to_id: toId,
          currency: fromAccount.currency
        };
      }
      if (prev.account_id) return prev;
      return {
        ...prev,
        account_id: accounts[0].id,
        currency: accounts[0].currency
      };
    });
  }, [accounts, form.account_id, form.transfer_from_id, form.transfer_to_id, form.type]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, category_id: "" }));
    setCategoryOpen(false);
    setCategorySearch("");
  }, [form.type]);

  useEffect(() => {
    const accountId = form.type === "transfer" ? form.transfer_from_id : form.account_id;
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;
    setForm((prev) => ({ ...prev, currency: account.currency }));
  }, [accounts, form.account_id, form.transfer_from_id, form.type]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (form.type === "transfer") {
      if (!form.transfer_from_id || !form.transfer_to_id) {
        setMessage("Seleziona il conto di origine e destinazione.");
        return;
      }
      if (form.transfer_from_id === form.transfer_to_id) {
        setMessage("Seleziona due conti diversi.");
        return;
      }
      if (!transferCategoryId) {
        setMessage("Categoria giroconti non trovata. Importa le categorie base.");
        return;
      }
    } else {
      if (!form.account_id) {
        setMessage("Seleziona un conto.");
        return;
      }
      if (!form.category_id) {
        setMessage("Seleziona una categoria.");
        return;
      }
    }
    const amountValue = Number(form.amount);
    const parsedTags = parseTags(form.tags);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setMessage("Inserisci un importo valido.");
      return;
    }

    const resolveAvailableBalance = (accountId: string) => {
      const balance =
        accountBalances.find((item) => item.id === accountId)?.balance ?? 0;
      if (editing && editing.account_id === accountId) {
        const delta = editing.flow === "in" ? editing.amount : -editing.amount;
        return balance - delta;
      }
      return balance;
    };

    const ensureSufficientFunds = (accountId: string) => {
      const available = resolveAvailableBalance(accountId);
      if (amountValue > available) {
        setMessage(
          `Saldo insufficiente. Disponibile: ${formatCurrencySafe(
            available,
            form.currency as Currency
          )}`
        );
        return false;
      }
      return true;
    };

    try {
      if (form.type === "transfer") {
        if (!ensureSufficientFunds(form.transfer_from_id)) return;
        const fromAccount = accounts.find((item) => item.id === form.transfer_from_id);
        const toAccount = accounts.find((item) => item.id === form.transfer_to_id);
        const note = form.note
          ? `Trasferimento: ${form.note}`
          : `Trasferimento da ${fromAccount?.name ?? "conto"} a ${
              toAccount?.name ?? "conto"
            }`;
        await createTransactions([
          {
            type: "transfer",
            flow: "out",
            account_id: form.transfer_from_id,
            category_id: transferCategoryId,
            amount: amountValue,
            currency: form.currency as "EUR" | "USD",
            date: form.date,
            note
          },
          {
            type: "transfer",
            flow: "in",
            account_id: form.transfer_to_id,
            category_id: transferCategoryId,
            amount: amountValue,
            currency: form.currency as "EUR" | "USD",
            date: form.date,
            note
          }
        ]);
      } else {
        const flowDirection =
          form.type === "income" ? "in" : form.type === "expense" ? "out" : form.flow;
        if (flowDirection === "out" && !ensureSufficientFunds(form.account_id)) {
          return;
        }
        const payload = {
          type: form.type,
          flow: flowDirection,
          account_id: form.account_id,
          category_id: form.category_id,
          amount: amountValue,
          currency: form.currency as "EUR" | "USD",
          date: form.date,
          note: form.note || null,
          tags: parsedTags.length > 0 ? parsedTags : null
        };
        if (editing) {
          await updateTransaction(editing.id, payload);
        } else {
          await createTransaction(payload);
        }
      }
      await refresh();
      setMessage("Transazione salvata.");
      resetForm();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const selectedLabel = selectedCategory?.name ?? "Seleziona categoria";
  const selectedIcon = selectedCategory
    ? categoryIcons.get(selectedCategory.id) ?? "\u{1F4CC}"
    : "\u{1F50E}";

  const pickCategory = (categoryId: string) => {
    setForm((prev) => ({ ...prev, category_id: categoryId }));
    setCategoryOpen(false);
    setCategorySearch("");
  };

  const handleSeedCategories = async () => {
    try {
      await seedDefaultCategories();
      await refresh();
      setMessage("Categorie base importate.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const startEdit = (item: Transaction) => {
    setEditing(item);
    setForm({
      type: item.type,
      flow: item.flow,
      account_id: item.account_id,
      transfer_from_id:
        item.type === "transfer" && item.flow === "out" ? item.account_id : "",
      transfer_to_id:
        item.type === "transfer" && item.flow === "in" ? item.account_id : "",
      category_id: item.category_id,
      amount: String(item.amount),
      currency: item.currency,
      date: item.date,
      note: item.note ?? "",
      tags: item.tags ? item.tags.join(", ") : ""
    });
  };

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    const item = transactions.find((entry) => entry.id === editId);
    if (!item) return;
    startEdit(item);
  }, [searchParams, transactions]);

  if (loading) {
    return <div className="card">Caricamento transazioni...</div>;
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2 className="section-title">Transazioni</h2>
          <p className="section-subtitle">Entrate, uscite e trasferimenti</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Entrate 30g</span>
          <span className="stat-value">{formatCurrency(summary.income, currency)}</span>
          <span className="stat-trend">Ultimi 30 giorni</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Uscite 30g</span>
          <span className="stat-value">{formatCurrency(summary.expense, currency)}</span>
          <span className="stat-trend">Spesa corrente</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Investimenti netti</span>
          <span className="stat-value">
            {formatCurrency(summary.investmentIn - summary.investmentOut, currency)}
          </span>
          <span className="stat-trend">Input vs output</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Net Flow</span>
          <span className="stat-value">{formatCurrency(netFlow, currency)}</span>
          <span className="stat-trend">Saldo finale 30g</span>
        </div>
      </div>

      <div className="card transaction-panel">
        <div className="section-header">
          <div>
            <h3>{editing ? "Modifica transazione" : "Nuova transazione"}</h3>
            <p className="section-subtitle">Registrazione rapida e pulita</p>
          </div>
          <span className="pill">Workflow rapido</span>
        </div>
        <form className="form-grid transaction-form" onSubmit={handleSubmit}>
          <select
            className="select"
            value={form.type}
            onChange={(event) =>
              setForm({ ...form, type: event.target.value as TransactionType })
            }
          >
            <option value="income">Entrata</option>
            <option value="expense">Uscita</option>
            <option value="transfer">Trasferimento</option>
            <option value="investment" hidden>
              Investimento
            </option>
          </select>
          {isTransfer ? (
            <>
              <select
                className="select"
                value={form.transfer_from_id}
                onChange={(event) =>
                  setForm({ ...form, transfer_from_id: event.target.value })
                }
              >
                <option value="">Da (conto)</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.emoji ? `${account.emoji} ` : ""}
                    {account.name}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={form.transfer_to_id}
                onChange={(event) =>
                  setForm({ ...form, transfer_to_id: event.target.value })
                }
              >
                <option value="">A (conto)</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.emoji ? `${account.emoji} ` : ""}
                    {account.name}
                  </option>
                ))}
              </select>
              <span className="tag">Trasferimento interno tra conti</span>
            </>
          ) : (
            <>
              <select
                className="select"
                value={form.account_id}
                onChange={(event) =>
                  setForm({ ...form, account_id: event.target.value })
                }
              >
                <option value="">Seleziona conto</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.emoji ? `${account.emoji} ` : ""}
                    {account.name}
                  </option>
                ))}
              </select>
              {form.type === "investment" ? (
                <select
                  className="select"
                  value={form.flow}
                  onChange={(event) =>
                    setForm({ ...form, flow: event.target.value as "in" | "out" })
                  }
                >
                  <option value="out">Output capitale</option>
                  <option value="in">Ritorno / rendita</option>
                </select>
              ) : (
                <span className="tag">Flusso automatico: entrata = IN, uscita = OUT</span>
              )}
            </>
          )}
          {!isTransfer && (
            <div
              className={`category-budget-row form-span${
                form.type !== "expense" ? " single" : ""
              }`}
            >
              <div className="category-picker">
                <button
                  className="picker-trigger"
                  type="button"
                  onClick={() => setCategoryOpen(true)}
                  aria-expanded={categoryOpen}
                >
                  <span className="picker-label">
                    <span className="picker-icon">{selectedIcon}</span>
                    {selectedLabel}
                  </span>
                  <span className="picker-caret">v</span>
                </button>
              </div>
              {form.type === "expense" && (
                <div className={`budget-indicator ${budgetStatus ?? "idle"}`}>
                  {!selectedCategory && (
                    <div className="budget-indicator-empty">
                      <strong>Seleziona una categoria</strong>
                      <span className="section-subtitle">
                        Vedrai il CAP appena scegli la categoria.
                      </span>
                    </div>
                  )}
                  {selectedCategory && budgetInfo?.cap === null && (
                    <div className="budget-indicator-empty">
                      <strong>Nessun CAP impostato</strong>
                      <span className="section-subtitle">
                        Imposta un CAP nella sezione Budget.
                      </span>
                    </div>
                  )}
                    {selectedCategory && budgetInfo?.cap !== null && budgetInfo && (
                      <>
                        <div className="budget-indicator-block">
                          <span className="budget-indicator-label">Speso / CAP</span>
                          <strong>
                          {formatCurrencySafe(budgetInfo.projected, currency)} /{" "}
                          {formatCurrencySafe(budgetInfo.cap, currency)}
                        </strong>
                        <span className="budget-indicator-sub">
                          {budgetInfo.overAmount && budgetInfo.overAmount > 0
                            ? `Superamento: ${formatCurrencySafe(
                                budgetInfo.overAmount,
                                currency
                              )} (${formatPercent(budgetInfo.overPercent ?? 0)})`
                            : `Residuo: ${formatCurrencySafe(
                                budgetInfo.remaining ?? 0,
                                currency
                              )}`}
                        </span>
                      </div>
                        <div className="budget-indicator-block">
                          <span className="budget-indicator-label">Totale speso</span>
                          <strong>{formatCurrencySafe(budgetInfo.projected, currency)}</strong>
                          <span className="budget-indicator-sub">
                            {budgetInfo.percentSpent !== null
                              ? `${formatPercent(budgetInfo.percentSpent)} del CAP`
                              : "N/D"}
                          </span>
                        </div>
                        <div className="budget-indicator-bar">
                          <span
                            className="budget-indicator-fill"
                            style={{
                              width: `${Math.min(
                                (budgetInfo.percentSpent ?? 0) * 100,
                                100
                              )}%`
                            }}
                          />
                        </div>
                      </>
                    )}
                </div>
              )}
            </div>
          )}
          {isTransfer && (
            <div className="notice form-span">
              Categoria impostata automaticamente su giroconti.
            </div>
          )}
          {!isTransfer && filteredCategories.length === 0 && (
            <div className="notice form-span">
              Nessuna categoria disponibile per questo tipo.
              <button
                className="button ghost small"
                type="button"
                onClick={handleSeedCategories}
              >
                Importa categorie base
              </button>
            </div>
          )}
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="Importo"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            required
          />
          <select
            className="select"
            value={form.currency}
            onChange={(event) =>
              setForm({ ...form, currency: event.target.value as Currency })
            }
            disabled={isTransfer || Boolean(form.account_id)}
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
          <input
            className="input"
            type="date"
            value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
          />
          <input
            className="input"
            placeholder="Note"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
          <input
            className="input"
            placeholder="Tag (separati da virgola)"
            value={form.tags}
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
          />
          <div className="form-span tag-suggestions">
            <span className="section-subtitle">
              Tag salvati {selectedCategory ? "per categoria" : ""}
            </span>
            <div className="tag-suggestion-list">
              {(selectedCategory
                ? Array.from(
                    tagSuggestions.byCategory.get(selectedCategory.id) ?? new Map()
                  ).map(([, value]) => value)
                : tagSuggestions.all
              )
                .filter((tag) => tag)
                .map((tag) => {
                  const isActive = selectedTags.some(
                    (selected) => normalizeKey(selected) === normalizeKey(tag)
                  );
                  return (
                    <button
                      className={`tag tag-suggestion${isActive ? " active" : ""}`}
                      type="button"
                      key={`tag-${tag}`}
                      onClick={() => addTagToForm(tag)}
                      disabled={isActive}
                    >
                      #{tag}
                    </button>
                  );
                })}
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="button" type="submit">
              {editing ? "Aggiorna" : "Aggiungi"}
            </button>
            {editing && (
              <button
                className="button secondary"
                type="button"
                onClick={resetForm}
              >
                Annulla
              </button>
            )}
          </div>
        </form>
        {categoryOpen && !isTransfer && (
          <div className="modal-backdrop" onClick={() => setCategoryOpen(false)}>
            <div
              className="modal-card picker-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <h3>Scegli categoria</h3>
                  <p className="section-subtitle">Seleziona la categoria corretta</p>
                </div>
                <button
                  className="button ghost small"
                  type="button"
                  onClick={() => setCategoryOpen(false)}
                >
                  Chiudi
                </button>
              </div>
              <div className="picker-panel picker-panel-modal">
                <div className="picker-search">
                  <input
                    className="input"
                    placeholder="Cerca categoria"
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                  />
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => setCategorySearch("")}
                  >
                    Reset
                  </button>
                </div>
                <div className="picker-groups">
                  {filteredCategoryOptions.length === 0 ? (
                    <div className="empty">Nessuna categoria trovata.</div>
                  ) : (
                    filteredCategoryOptions.map((parent) => (
                      <div className="picker-group" key={parent.id}>
                        <button
                          className="picker-parent"
                          type="button"
                          onClick={() => pickCategory(parent.id)}
                        >
                          <span className="picker-icon">
                            {categoryIcons.get(parent.id) ?? "\u{1F4CC}"}
                          </span>
                          {parent.name}
                        </button>
                        {parent.children.length > 0 && (
                          <div className="picker-children">
                            {parent.children.map((child) => (
                              <button
                                className="picker-child"
                                type="button"
                                key={child.id}
                                onClick={() => pickCategory(child.id)}
                              >
                                <span className="picker-icon">
                                  {categoryIcons.get(child.id) ?? "\u{1F4CC}"}
                                </span>
                                {child.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {refundOpen && refundTarget && (
          <div className="modal-backdrop centered" onClick={closeRefundModal}>
            <div
              className="modal-card refund-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <h3>Rimborso</h3>
                  <p className="section-subtitle">Registra un rimborso legato alla transazione.</p>
                </div>
                <button
                  className="button ghost small"
                  type="button"
                  onClick={closeRefundModal}
                >
                  Chiudi
                </button>
              </div>
              <div className="info-panel refund-summary" style={{ marginBottom: "12px" }}>
                <div className="info-item">
                  <strong>Originale</strong>
                  <span>
                    {categoryMap.get(refundTarget.category_id) ?? "Categoria"} •{" "}
                    {formatCurrencySafe(refundTarget.amount, refundTarget.currency)}
                  </span>
                  <span className="section-subtitle">
                    {formatDate(refundTarget.date)} •{" "}
                    {accountMap.get(refundTarget.account_id) ?? "Conto"}
                  </span>
                </div>
              </div>
              <form className="form-grid" onSubmit={handleRefundSave}>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  placeholder="Rimborso (€)"
                  value={refundForm.amount}
                  onChange={(event) =>
                    setRefundForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  required
                />
                <select
                  className="select"
                  value={refundForm.account_id}
                  onChange={(event) =>
                    setRefundForm((prev) => ({
                      ...prev,
                      account_id: event.target.value
                    }))
                  }
                  required
                >
                  <option value="">Conto accredito</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.emoji ? `${account.emoji} ` : ""}
                      {account.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  type="date"
                  value={refundForm.date}
                  onChange={(event) =>
                    setRefundForm((prev) => ({ ...prev, date: event.target.value }))
                  }
                  required
                />
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setRefundForm((prev) => ({
                      ...prev,
                      photo: event.target.files?.[0] ?? null
                    }))
                  }
                />
                <input
                  className="input"
                  placeholder="Note"
                  value={refundForm.note}
                  onChange={(event) =>
                    setRefundForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                />
                <div style={{ display: "flex", gap: "10px" }}>
                  <button className="button" type="submit" disabled={refundSaving}>
                    {refundSaving ? "Salvataggio..." : "Salva rimborso"}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={closeRefundModal}
                  >
                    Annulla
                  </button>
                </div>
              </form>
              {refundMessage && <div className="notice">{refundMessage}</div>}
            </div>
          </div>
        )}
        {message && <div className="notice">{message}</div>}
        {error && <div className="error">{error}</div>}
        <div className="transaction-list">
          <div className="section-header">
            <div>
              <h4>Ultime transazioni</h4>
              <p className="section-subtitle">Lista rapida senza filtri</p>
            </div>
          </div>
          {recentTransactions.length === 0 ? (
            <div className="empty">Nessuna transazione registrata.</div>
          ) : (
            recentTransactions.map((item) => {
              const category = categoryMap.get(item.category_id) ?? "Categoria";
              const account = accountMap.get(item.account_id) ?? "Conto";
              const refundInfo = refundsByTransaction.get(item.id);
              const isCorrection = isBalanceCorrectionTransaction(item, categoryKeyById);
              const isOut =
                item.type === "expense" ||
                (item.type === "investment" && item.flow === "out") ||
                (item.type === "transfer" && item.flow === "out");
              const amount = isOut ? -item.amount : item.amount;
              const typeLabel =
                item.type === "income"
                  ? "Entrata"
                  : item.type === "expense"
                    ? "Uscita"
                    : item.type === "investment"
                      ? item.flow === "in"
                        ? "Ritorno"
                        : "Output capitale"
                      : "Trasferimento";
              return (
                <div className="transaction-row" key={item.id}>
                  <div className="transaction-meta">
                    <span className="transaction-date">{formatDate(item.date)}</span>
                    <strong className="transaction-category">{category}</strong>
                    <span className="transaction-note">
                      {item.note ?? "Nessuna nota"}
                    </span>
                  </div>
                  <div className="transaction-tags">
                    <span className={`chip ${item.type}`}>{typeLabel}</span>
                    <span className="chip">{account}</span>
                    <span
                      className={`transaction-amount ${
                        isOut ? "negative" : "positive"
                      }`}
                    >
                      {formatCurrency(amount, item.currency)}
                    </span>
                    {refundInfo && (
                      <span className="chip refund">
                        {"\u2705"} Rimborsata{" "}
                        {formatCurrencySafe(
                          refundInfo.amount,
                          refundInfo.currency ?? item.currency
                        )}
                      </span>
                    )}
                    {item.type === "expense" && !isCorrection && (
                      <button
                        className="button ghost small"
                        type="button"
                        onClick={() => openRefundModal(item)}
                      >
                        {"\u{1F4B8}"} Rimborso
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="notice">
          Nessun conto disponibile. Crea un conto in Impostazioni prima di
          inserire transazioni.
        </div>
      )}
    </div>
  );
};

export default Transactions;
