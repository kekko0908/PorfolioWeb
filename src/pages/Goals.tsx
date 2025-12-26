import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  createCategory,
  createGoal,
  deleteGoal,
  fetchCategories,
  updateCategory,
  updateGoal
} from "../lib/api";
import { buildAccountBalances } from "../lib/metrics";
import { formatCurrencySafe, formatRatio } from "../lib/format";
import type { CategoryType, Goal } from "../types";

const goalCategoryName = "Obiettivi";
const goalCategoryType: CategoryType = "expense";

const emptyForm = {
  title: "",
  emoji: "",
  account_id: "",
  target_amount: "",
  due_date: ""
};

const Goals = () => {
  const { accounts, categories, goals, transactions, refresh, loading, error } =
    usePortfolioData();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const accountBalances = buildAccountBalances(accounts, transactions);
  const accountMap = useMemo(
    () =>
      new Map(
        accountBalances.map((account) => [
          account.id,
          {
            name: account.name,
            emoji: account.emoji ?? "",
            currency: account.currency,
            balance: account.balance
          }
        ])
      ),
    [accountBalances]
  );

  const ensureGoalParent = async () => {
    const existing = categories.find(
      (category) =>
        !category.parent_id &&
        category.name.toLowerCase() === goalCategoryName.toLowerCase()
    );
    if (existing) return existing.id;
    await createCategory({
      name: goalCategoryName,
      type: goalCategoryType,
      parent_id: null,
      is_fixed: false,
      sort_order: null
    });
    const updated = await fetchCategories();
    const fresh = updated.find(
      (category) =>
        !category.parent_id &&
        category.name.toLowerCase() === goalCategoryName.toLowerCase()
    );
    return fresh?.id ?? null;
  };

  const ensureGoalChild = async (title: string, parentId: string) => {
    const existing = categories.find(
      (category) =>
        category.parent_id === parentId &&
        category.name.toLowerCase() === title.toLowerCase()
    );
    if (existing) return existing.id;
    await createCategory({
      name: title,
      type: goalCategoryType,
      parent_id: parentId,
      is_fixed: false,
      sort_order: null
    });
    const updated = await fetchCategories();
    const fresh = updated.find(
      (category) =>
        category.parent_id === parentId &&
        category.name.toLowerCase() === title.toLowerCase()
    );
    return fresh?.id ?? null;
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!form.account_id) {
      setMessage("Seleziona un conto.");
      return;
    }
    const targetAmount = Number(form.target_amount);
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setMessage("Inserisci un importo obiettivo valido.");
      return;
    }
    if (!form.due_date) {
      setMessage("Seleziona una data di scadenza.");
      return;
    }

    try {
      const parentId = await ensureGoalParent();
      if (!parentId) {
        setMessage("Impossibile creare la categoria Obiettivi.");
        return;
      }
      const childId = await ensureGoalChild(form.title.trim(), parentId);
      const payload = {
        account_id: form.account_id,
        category_id: childId,
        title: form.title.trim(),
        emoji: form.emoji.trim() || null,
        target_amount: targetAmount,
        due_date: form.due_date
      };

      if (editing) {
        await updateGoal(editing.id, payload);
        if (editing.category_id && editing.title !== payload.title) {
          await updateCategory(editing.category_id, { name: payload.title });
        }
      } else {
        await createGoal(payload);
      }

      await refresh();
      setMessage("Obiettivo salvato.");
      resetForm();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const startEdit = (item: Goal) => {
    setEditing(item);
    setForm({
      title: item.title,
      emoji: item.emoji ?? "",
      account_id: item.account_id,
      target_amount: String(item.target_amount),
      due_date: item.due_date
    });
    setShowForm(true);
  };

  const removeItem = async (id: string) => {
    setMessage(null);
    try {
      await deleteGoal(id);
      await refresh();
      setMessage("Obiettivo eliminato.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const goalsWithStats = useMemo(() => {
    const now = new Date();
    return goals.map((goal) => {
      const account = accountMap.get(goal.account_id);
      const balance = account?.balance ?? 0;
      const remaining = Math.max(goal.target_amount - balance, 0);
      const due = new Date(goal.due_date);
      const diffMs = due.getTime() - now.getTime();
      const daysLeft = Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 0);
      const monthsLeft = Math.max(Math.ceil(daysLeft / 30.4), 0);
      const perDay = daysLeft > 0 ? remaining / daysLeft : 0;
      const perMonth = monthsLeft > 0 ? remaining / monthsLeft : 0;
      const progress =
        goal.target_amount > 0
          ? Math.min(balance / goal.target_amount, 1)
          : 0;
      return {
        ...goal,
        account,
        balance,
        remaining,
        daysLeft,
        monthsLeft,
        perDay,
        perMonth,
        progress
      };
    });
  }, [goals, accountMap]);

  if (loading) {
    return <div className="card">Caricamento obiettivi...</div>;
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2 className="section-title">Obiettivi</h2>
          <p className="section-subtitle">
            Pianifica, monitora e raggiungi i tuoi traguardi finanziari.
          </p>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => setShowForm((open) => !open)}
        >
          {showForm ? "Chiudi" : "+ Nuovo obiettivo"}
        </button>
      </div>

      {showForm && (
        <div className="card goal-form-card">
          <h3>{editing ? "Modifica obiettivo" : "Nuovo obiettivo"}</h3>
          <form className="form-grid" onSubmit={handleSubmit}>
            <input
              className="input"
              placeholder="Titolo obiettivo"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
            />
            <input
              className="input"
              placeholder="Emoji (opzionale)"
              value={form.emoji}
              onChange={(event) => setForm({ ...form, emoji: event.target.value })}
            />
            <select
              className="select"
              value={form.account_id}
              onChange={(event) =>
                setForm({ ...form, account_id: event.target.value })
              }
              required
            >
              <option value="">Seleziona conto</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.emoji ? `${account.emoji} ` : ""}
                  {account.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="number"
              step="0.01"
              placeholder="Obiettivo totale"
              value={form.target_amount}
              onChange={(event) =>
                setForm({ ...form, target_amount: event.target.value })
              }
              required
            />
            <input
              className="input"
              type="date"
              value={form.due_date}
              onChange={(event) => setForm({ ...form, due_date: event.target.value })}
              required
            />
            <div style={{ display: "flex", gap: "10px" }}>
              <button className="button" type="submit">
                {editing ? "Aggiorna" : "Aggiungi"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={resetForm}
                >
                  Annulla
                </button>
              )}
            </div>
          </form>
          {accounts.length === 0 && (
            <div className="notice" style={{ marginTop: "12px" }}>
              Crea prima un conto in Impostazioni.
            </div>
          )}
        </div>
      )}

      {message && <div className="notice">{message}</div>}
      {error && <div className="error">{error}</div>}

      {goalsWithStats.length === 0 ? (
        <div className="empty">Nessun obiettivo creato.</div>
      ) : (
        <div className="goal-grid">
          {goalsWithStats.map((goal) => {
            const currency = goal.account?.currency ?? "EUR";
            const status =
              goal.balance >= goal.target_amount ? "Raggiunto" : "In corso";
            return (
              <div className="goal-card" key={goal.id}>
                <div className="goal-header">
                  <div>
                    <strong className="goal-title">
                      {goal.emoji ? `${goal.emoji} ` : ""}
                      {goal.title}
                    </strong>
                    <span className="section-subtitle">
                      {goal.account?.emoji ? `${goal.account.emoji} ` : ""}
                      {goal.account?.name ?? "Conto"}
                    </span>
                  </div>
                  <span className="goal-status">{status}</span>
                </div>
                <div className="goal-progress">
                  <div
                    className="goal-progress-fill"
                    style={{ width: `${goal.progress * 100}%` }}
                  />
                </div>
                <div className="goal-metrics">
                  <div className="goal-metric">
                    <span>Target</span>
                    <strong>{formatCurrencySafe(goal.target_amount, currency)}</strong>
                  </div>
                  <div className="goal-metric">
                    <span>Saldo</span>
                    <strong>{formatCurrencySafe(goal.balance, currency)}</strong>
                  </div>
                  <div className="goal-metric">
                    <span>Residuo</span>
                    <strong>{formatCurrencySafe(goal.remaining, currency)}</strong>
                  </div>
                  <div className="goal-metric">
                    <span>Scadenza</span>
                    <strong>{goal.due_date}</strong>
                  </div>
                </div>
                <div className="goal-breakdown">
                  <div>
                    <span className="stat-label">Al giorno</span>
                    <strong>{formatCurrencySafe(goal.perDay, currency)}</strong>
                  </div>
                  <div>
                    <span className="stat-label">Al mese</span>
                    <strong>{formatCurrencySafe(goal.perMonth, currency)}</strong>
                  </div>
                  <div>
                    <span className="stat-label">Tempo</span>
                    <strong>
                      {goal.daysLeft > 0
                        ? `${formatRatio(goal.daysLeft)}g / ${formatRatio(
                            goal.monthsLeft
                          )}m`
                        : "Scaduto"}
                    </strong>
                  </div>
                </div>
                <div className="goal-actions">
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => startEdit(goal)}
                  >
                    Modifica
                  </button>
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => removeItem(goal.id)}
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
  );
};

export default Goals;
