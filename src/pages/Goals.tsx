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
import { formatCurrencySafe, formatRatio } from "../lib/format";
import type { CategoryType, Goal } from "../types";

const goalCategoryName = "Obiettivi";
const goalCategoryType: CategoryType = "expense";

const emptyForm = {
  title: "",
  emoji: "",
  target_amount: "",
  due_date: ""
};

const Goals = () => {
  const { categories, goals, transactions, settings, refresh, loading, error } =
    usePortfolioData();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const currency = settings?.base_currency ?? "EUR";

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
      const contributions = transactions
        .filter((item) => item.category_id === goal.category_id && item.flow === "out")
        .reduce((sum, item) => sum + item.amount, 0);
      const remaining = Math.max(goal.target_amount - contributions, 0);
      const due = new Date(goal.due_date);
      const diffMs = due.getTime() - now.getTime();
      const daysLeft = Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 0);
      const monthsLeft = Math.max(Math.ceil(daysLeft / 30.4), 0);
      const perDay = daysLeft > 0 ? remaining / daysLeft : 0;
      const perMonth = monthsLeft > 0 ? remaining / monthsLeft : 0;
      const progress =
        goal.target_amount > 0
          ? Math.min(contributions / goal.target_amount, 1)
          : 0;
      return {
        ...goal,
        contributions,
        remaining,
        daysLeft,
        monthsLeft,
        perDay,
        perMonth,
        progress
      };
    });
  }, [goals, transactions]);

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
        </div>
      )}

      {message && <div className="notice">{message}</div>}
      {error && <div className="error">{error}</div>}

      {goalsWithStats.length === 0 ? (
        <div className="empty">Nessun obiettivo creato.</div>
      ) : (
        <div className="goal-grid">
          {goalsWithStats.map((goal) => {
            const currency = settings?.base_currency ?? "EUR";
            const status =
              goal.contributions >= goal.target_amount ? "Raggiunto" : "In corso";
            return (
              <div className="goal-card" key={goal.id}>
                <div className="goal-header">
                  <div>
                    <strong className="goal-title">
                      {goal.emoji ? `${goal.emoji} ` : ""}
                      {goal.title}
                    </strong>
                    <span className="section-subtitle">Categoria Obiettivi</span>
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
                    <span>Versato</span>
                    <strong>{formatCurrencySafe(goal.contributions, currency)}</strong>
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
