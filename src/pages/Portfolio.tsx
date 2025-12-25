import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { usePortfolioData } from "../hooks/usePortfolioData";
import { createHolding, deleteHolding, updateHolding } from "../lib/api";
import { formatCurrency, formatPercent, formatRatio } from "../lib/format";
import type { Holding } from "../types";

const assetClasses = [
  "Azioni",
  "ETF",
  "Obbligazioni",
  "Crypto",
  "Oro",
  "Real Estate",
  "Liquidita",
  "Private Equity",
  "Altro"
];

const emptyForm = {
  name: "",
  asset_class: "ETF",
  cost_basis: "",
  current_value: "",
  currency: "EUR",
  pe_ratio: "",
  start_date: "",
  note: ""
};

const Portfolio = () => {
  const { holdings, settings, refresh, loading, error } = usePortfolioData();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pePrice, setPePrice] = useState("");
  const [peEps, setPeEps] = useState("");

  const currency = settings?.base_currency ?? "EUR";

  const resetForm = () => {
    setForm({ ...emptyForm, currency });
    setEditing(null);
    setPePrice("");
    setPeEps("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const payload = {
      name: form.name,
      asset_class: form.asset_class,
      cost_basis: Number(form.cost_basis),
      current_value: Number(form.current_value),
      currency: form.currency as "EUR" | "USD",
      pe_ratio: form.pe_ratio ? Number(form.pe_ratio) : null,
      start_date: form.start_date,
      note: form.note || null
    };

    try {
      if (editing) {
        await updateHolding(editing.id, payload);
      } else {
        await createHolding(payload);
      }
      await refresh();
      setMessage("Salvataggio completato.");
      resetForm();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const startEdit = (item: Holding) => {
    setEditing(item);
    setForm({
      name: item.name,
      asset_class: item.asset_class,
      cost_basis: String(item.cost_basis),
      current_value: String(item.current_value),
      currency: item.currency,
      pe_ratio: item.pe_ratio ? String(item.pe_ratio) : "",
      start_date: item.start_date,
      note: item.note ?? ""
    });
    setPePrice("");
    setPeEps("");
  };

  const removeItem = async (id: string) => {
    try {
      await deleteHolding(id);
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const enriched = useMemo(() => {
    return holdings.map((item) => {
      const roi = item.cost_basis
        ? (item.current_value - item.cost_basis) / item.cost_basis
        : 0;
      return { ...item, roi };
    });
  }, [holdings]);

  if (loading) {
    return <div className="card">Caricamento portafoglio...</div>;
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2 className="section-title">Portafoglio</h2>
          <p className="section-subtitle">Holdings, performance e metriche chiave</p>
        </div>
      </div>

      <div className="card">
        <h3>{editing ? "Modifica holding" : "Nuova holding"}</h3>
        <div className="info-panel">
          <div className="info-item">
            <strong>Cost Basis</strong>
            <span>Prezzo di carico totale (capitale investito).</span>
          </div>
          <div className="info-item">
            <strong>Valore attuale</strong>
            <span>Valore di mercato oggi, usato per ROI e CAGR.</span>
          </div>
          <div className="info-item">
            <strong>P/E Ratio</strong>
            <span>Prezzo/Utili medio. Inseriscilo solo per azioni o ETF.</span>
          </div>
          <div className="info-item">
            <strong>Calcolo P/E automatico</strong>
            <div className="info-form">
              <input
                className="input"
                type="number"
                step="0.01"
                placeholder="Prezzo per quota"
                value={pePrice}
                onChange={(event) => setPePrice(event.target.value)}
              />
              <input
                className="input"
                type="number"
                step="0.01"
                placeholder="EPS (utili per quota)"
                value={peEps}
                onChange={(event) => setPeEps(event.target.value)}
              />
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  const price = Number(pePrice);
                  const eps = Number(peEps);
                  if (!price || !eps) return;
                  setForm((prev) => ({
                    ...prev,
                    pe_ratio: (price / eps).toFixed(2)
                  }));
                }}
              >
                Calcola P/E
              </button>
            </div>
            <span>Il valore viene inserito nel campo P/E Ratio.</span>
          </div>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          <input
            className="input"
            placeholder="Nome asset"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          <select
            className="select"
            value={form.asset_class}
            onChange={(event) =>
              setForm({ ...form, asset_class: event.target.value })
            }
          >
            {assetClasses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="Cost Basis"
            value={form.cost_basis}
            onChange={(event) =>
              setForm({ ...form, cost_basis: event.target.value })
            }
            required
          />
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="Valore attuale"
            value={form.current_value}
            onChange={(event) =>
              setForm({ ...form, current_value: event.target.value })
            }
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
            type="number"
            step="0.01"
            placeholder="P/E Ratio"
            value={form.pe_ratio}
            onChange={(event) => setForm({ ...form, pe_ratio: event.target.value })}
          />
          <input
            className="input"
            type="date"
            value={form.start_date}
            onChange={(event) => setForm({ ...form, start_date: event.target.value })}
            required
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

      <div className="card">
        <h3>Holdings attive</h3>
        {enriched.length === 0 ? (
          <div className="empty">Nessuna holding presente.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Classe</th>
                  <th>Valore</th>
                  <th>ROI</th>
                  <th>P/E</th>
                  <th>Azione</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.asset_class}</td>
                    <td>{formatCurrency(item.current_value, item.currency)}</td>
                    <td>{formatPercent(item.roi)}</td>
                    <td>{formatRatio(item.pe_ratio ?? 0)}</td>
                    <td>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => startEdit(item)}
                        >
                          Modifica
                        </button>
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => removeItem(item.id)}
                        >
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Portfolio;
