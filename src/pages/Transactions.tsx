import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { FormEvent } from "react";
import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  createTransaction,
  seedDefaultCategories,
  updateTransaction
} from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { Category, CategoryType, Transaction } from "../types";

const today = new Date().toISOString().slice(0, 10);

const iconByName: Record<string, string> = {
  "Reddito da Lavoro": "\u{1F4BC}",
  "Extra & Side Hustle": "\u{1F6E0}",
  "Regali & Aiuti": "\u{1F381}",
  "Rimborsi & Tecnici": "\u{1F9FE}",
  "Casa & Utenze": "\u{1F3E0}",
  Alimentazione: "\u{1F37D}",
  Trasporti: "\u{1F697}",
  "Salute & Cura Personale": "\u{1FA7A}",
  "Svago & Lifestyle": "\u{1F389}",
  "Finanza & Obblighi": "\u{1F4D1}",
  "Famiglia & Altro": "\u{1F46A}",
  "Versamenti (Input Capitale)": "\u{1F4C8}",
  "Rendita Generata (Flusso Positivo)": "\u{1F4B8}",
  "Disinvestimenti (Output Capitale)": "\u{1F4C9}"
};

type CategoryWithChildren = Category & { children: Category[] };

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
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  const currency = settings?.base_currency ?? "EUR";

  const categoryIcons = useMemo(() => {
    const byId = new Map<string, string>();
    const lookup = new Map(categories.map((category) => [category.id, category]));
    categories.forEach((category) => {
      const parent = category.parent_id ? lookup.get(category.parent_id) : null;
      const icon =
        iconByName[category.name] ??
        (parent ? iconByName[parent.name] : undefined) ??
        "\u{1F4CC}";
      byId.set(category.id, icon);
    });
    return byId;
  }, [categories]);

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.type === form.type),
    [categories, form.type]
  );

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
    if (searchParams.get("edit")) {
      setSearchParams({});
    }
  };

  useEffect(() => {
    setForm((prev) => ({ ...prev, category_id: "" }));
    setCategoryOpen(false);
    setCategorySearch("");
  }, [form.type]);


  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!form.category_id) {
      setMessage("Seleziona una categoria.");
      return;
    }
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

  const selectedCategory = form.category_id
    ? categories.find((category) => category.id === form.category_id)
    : null;
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
      category_id: item.category_id,
      amount: String(item.amount),
      currency: item.currency,
      date: item.date,
      note: item.note ?? ""
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
            <span className="tag">Flusso automatico (entrata/uscita)</span>
          )}
          <div className="category-picker form-span">
            <button
              className="picker-trigger"
              type="button"
              onClick={() => setCategoryOpen((open) => !open)}
              aria-expanded={categoryOpen}
            >
              <span className="picker-label">
                <span className="picker-icon">{selectedIcon}</span>
                {selectedLabel}
              </span>
              <span className="picker-caret">▾</span>
            </button>
            {categoryOpen && (
              <div className="picker-panel">
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
                  <button
                    className="button secondary small"
                    type="button"
                    onClick={() => setCategoryOpen(false)}
                  >
                    Chiudi
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
                            {categoryIcons.get(parent.id) ?? "📌"}
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
                                  {categoryIcons.get(child.id) ?? "📌"}
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
            )}
          </div>
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

    </div>
  );
};

export default Transactions;




