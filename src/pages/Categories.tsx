import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  createCategory,
  deleteCategory,
  seedDefaultCategories,
  updateCategory
} from "../lib/api";
import type { Category, CategoryType } from "../types";

const emptyForm = {
  name: "",
  type: "expense" as CategoryType,
  parent_id: "",
  is_fixed: false,
  sort_order: ""
};

const Categories = () => {
  const { categories, refresh, loading, error } = usePortfolioData();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Category | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const parentOptions = useMemo(
    () =>
      categories.filter(
        (category) => !category.parent_id && category.type === form.type
      ),
    [categories, form.type]
  );

  const grouped = useMemo(() => {
    const byType: Record<CategoryType, Category[]> = {
      income: [],
      expense: [],
      investment: []
    };
    categories.forEach((category) => {
      byType[category.type].push(category);
    });
    return byType;
  }, [categories]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const payload = {
      name: form.name,
      type: form.type,
      parent_id: form.parent_id ? form.parent_id : null,
      is_fixed: form.is_fixed,
      sort_order: form.sort_order ? Number(form.sort_order) : null
    };

    try {
      if (editing) {
        await updateCategory(editing.id, payload);
      } else {
        await createCategory(payload);
      }
      await refresh();
      setMessage("Categoria salvata.");
      resetForm();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const startEdit = (item: Category) => {
    setEditing(item);
    setForm({
      name: item.name,
      type: item.type,
      parent_id: item.parent_id ?? "",
      is_fixed: item.is_fixed,
      sort_order: item.sort_order ? String(item.sort_order) : ""
    });
  };

  const removeItem = async (id: string) => {
    try {
      await deleteCategory(id);
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const importDefaults = async () => {
    try {
      await seedDefaultCategories();
      await refresh();
      setMessage("Categorie base importate.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  if (loading) {
    return <div className="card">Caricamento categorie...</div>;
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2 className="section-title">Categorie</h2>
          <p className="section-subtitle">Struttura gerarchica completa</p>
        </div>
        <button className="button secondary" onClick={importDefaults}>
          Importa categorie base
        </button>
      </div>

      <div className="card">
        <h3>{editing ? "Modifica categoria" : "Nuova categoria"}</h3>
        <div className="info-panel">
          <div className="info-item">
            <strong>Genitore</strong>
            <span>Assegna un genitore per creare una sottocategoria ordinata.</span>
          </div>
          <div className="info-item">
            <strong>Ordine</strong>
            <span>Numero piu basso = categoria mostrata prima.</span>
          </div>
          <div className="info-item">
            <strong>Spesa fissa</strong>
            <span>Segna le spese ricorrenti usate nel burn rate.</span>
          </div>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          <input
            className="input"
            placeholder="Nome categoria"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          <select
            className="select"
            value={form.type}
            onChange={(event) =>
              setForm({ ...form, type: event.target.value as CategoryType })
            }
          >
            <option value="income">Entrate</option>
            <option value="expense">Uscite</option>
            <option value="investment">Investimenti</option>
          </select>
          <select
            className="select"
            value={form.parent_id}
            onChange={(event) => setForm({ ...form, parent_id: event.target.value })}
          >
            <option value="">Nessun genitore</option>
            {parentOptions.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            placeholder="Ordine (priorita)"
            value={form.sort_order}
            onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
          />
          <label className="tag">
            <input
              type="checkbox"
              checked={form.is_fixed}
              onChange={(event) => setForm({ ...form, is_fixed: event.target.checked })}
            />
            Spesa fissa (ricorrente)
          </label>
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
        {message && <div className="notice">{message}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      <div className="grid-3">
        {(Object.keys(grouped) as CategoryType[]).map((type) => (
          <div className="card" key={type}>
            <h3>{type.toUpperCase()}</h3>
            {grouped[type].length === 0 ? (
              <div className="empty">Nessuna categoria.</div>
            ) : (
              grouped[type]
                .filter((category) => !category.parent_id)
                .map((parent) => (
                  <div key={parent.id} style={{ marginBottom: "12px" }}>
                    <strong>{parent.name}</strong>
                    <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                      <button
                        className="button ghost"
                        type="button"
                        onClick={() => startEdit(parent)}
                      >
                        Modifica
                      </button>
                      <button
                        className="button ghost"
                        type="button"
                        onClick={() => removeItem(parent.id)}
                      >
                        Elimina
                      </button>
                    </div>
                    <div style={{ marginTop: "8px", paddingLeft: "12px" }}>
                      {grouped[type]
                        .filter((child) => child.parent_id === parent.id)
                        .map((child) => (
                          <div key={child.id} style={{ marginBottom: "6px" }}>
                            <span>{child.name}</span>
                            <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                              <button
                                className="button ghost"
                                type="button"
                                onClick={() => startEdit(child)}
                              >
                                Modifica
                              </button>
                              <button
                                className="button ghost"
                                type="button"
                                onClick={() => removeItem(child.id)}
                              >
                                Elimina
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Categories;
