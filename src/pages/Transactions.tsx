import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  createTransaction,
  deleteTransaction,
  seedDefaultCategories,
  updateTransaction
} from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import type { CategoryType, Transaction } from "../types";

const today = new Date().toISOString().slice(0, 10);

const emptyForm = {
  type: "expense" as CategoryType,
  flow: "out" as "in" | "out",
  category_id: "",
  amount: "",
  currency: "EUR",
  date: today,
  note: ""
};

const Transactions = () => {
  const { categories, transactions, settings, refresh, loading, error } =
    usePortfolioData();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const currency = settings?.base_currency ?? "EUR";

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.type === form.type),
    [categories, form.type]
  );

  const categoryOptions = useMemo(() => {
    const parents = filteredCategories.filter((category) => !category.parent_id);
    return parents.map((parent) => ({
      ...parent,
      children: filteredCategories.filter((child) => child.parent_id === parent.id)
    }));
  }, [filteredCategories]);

  const summary = useMemo(() => {
    const limit = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return transactions.reduce(
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
  }, [transactions]);

  const netFlow =
    summary.income -
    summary.expense +
    summary.investmentIn -
    summary.investmentOut;

  const resetForm = () => {
    setForm({ ...emptyForm, currency });
    setEditing(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const payload = {
      type: form.type,
      flow:
        form.type === "income" ? "in" : form.type === "expense" ? "out" : form.flow,
      category_id: form.category_id,
      amount: Number(form.amount),
      currency: form.currency as "EUR" | "USD",
      date: form.date,
      note: form.note || null
    };

    try {
      if (editing) {
        await updateTransaction(editing.id, payload);
      } else {
        await createTransaction(payload);
      }
      await refresh();
      setMessage("Transazione salvata.");
      resetForm();
    } catch (err) {
      setMessage((err as Error).message);
    }
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
      category_id: item.category_id,
      amount: String(item.amount),
      currency: item.currency,
      date: item.date,
      note: item.note ?? ""
    });
  };

  const removeItem = async (id: string) => {
    try {
      await deleteTransaction(id);
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  if (loading) {
    return <div className="card">Caricamento transazioni...</div>;
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2 className="section-title">Transazioni</h2>
          <p className="section-subtitle">Entrate, uscite e movimenti investimento</p>
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

      <div className="grid-2 transaction-grid">
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
                setForm({ ...form, type: event.target.value as CategoryType })
              }
            >
              <option value="income">Entrata</option>
              <option value="expense">Uscita</option>
              <option value="investment">Investimento</option>
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
              <input className="input" value="Flusso automatico" readOnly />
            )}
            <select
              className="select"
              value={form.category_id}
              onChange={(event) =>
                setForm({ ...form, category_id: event.target.value })
              }
              required
            >
              <option value="">Seleziona categoria</option>
              {categoryOptions.map((parent) => (
                <optgroup key={parent.id} label={parent.name}>
                  {parent.children.length > 0 ? (
                    parent.children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.name}
                      </option>
                    ))
                  ) : (
                    <option value={parent.id}>{parent.name}</option>
                  )}
                </optgroup>
              ))}
            </select>
          {filteredCategories.length === 0 && (
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
            onChange={(event) => setForm({ ...form, currency: event.target.value })}
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
          {message && <div className="notice">{message}</div>}
          {error && <div className="error">{error}</div>}
        </div>

        <div className="card transaction-panel">
          <div className="section-header">
            <div>
              <h3>Lista transazioni</h3>
              <p className="section-subtitle">Controllo completo degli ultimi movimenti</p>
            </div>
            <span className="pill">{transactions.length} movimenti</span>
          </div>
          {transactions.length === 0 ? (
            <div className="empty">Nessuna transazione presente.</div>
          ) : (
            <div className="transaction-list">
              {transactions.map((item) => {
                const category = categoryMap.get(item.category_id) ?? "-";
                const isOut =
                  item.type === "expense" ||
                  (item.type === "investment" && item.flow === "out");
                const amount = isOut ? -item.amount : item.amount;
                const typeLabel =
                  item.type === "income"
                    ? "Entrata"
                    : item.type === "expense"
                      ? "Uscita"
                      : item.flow === "in"
                        ? "Ritorno"
                        : "Output capitale";

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
                      <span
                        className={`transaction-amount ${
                          isOut ? "negative" : "positive"
                        }`}
                      >
                        {formatCurrency(amount, item.currency)}
                      </span>
                    </div>
                    <div className="transaction-actions">
                      <button
                        className="button ghost small"
                        type="button"
                        onClick={() => startEdit(item)}
                      >
                        Modifica
                      </button>
                      <button
                        className="button ghost small"
                        type="button"
                        onClick={() => removeItem(item.id)}
                      >
                        Elimina
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Transactions;
