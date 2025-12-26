import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { usePortfolioData } from "../hooks/usePortfolioData";
import { createHolding, deleteHolding, updateHolding } from "../lib/api";
import {
  formatCurrency,
  formatCurrencySafe,
  formatPercentSafe
} from "../lib/format";
import { fetchGlobalQuote } from "../lib/market";
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
  emoji: "",
  quantity: "",
  avg_cost: "",
  current_value: "",
  currency: "EUR",
  start_date: "",
  note: ""
};

const Portfolio = () => {
  const { holdings, settings, refresh, loading, error } = usePortfolioData();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [priceMessage, setPriceMessage] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState<string | null>(null);

  const currency = settings?.base_currency ?? "EUR";
  const isCash = form.asset_class === "Liquidita";

  const extractTicker = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return "";
    const token = trimmed.split(/[^A-Za-z0-9.]/)[0] ?? "";
    return token.toUpperCase();
  };

  const resetForm = () => {
    setForm({ ...emptyForm, currency });
    setEditing(null);
  };

  const totalCap = useMemo(() => {
    if (isCash) {
      const current = Number(form.current_value);
      return Number.isFinite(current) ? current : 0;
    }
    const quantity = Number(form.quantity);
    const avgCost = Number(form.avg_cost);
    if (!Number.isFinite(quantity) || !Number.isFinite(avgCost)) return 0;
    return quantity * avgCost;
  }, [form.quantity, form.avg_cost, form.current_value, isCash]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const currentValue = Number(form.current_value);
    const quantity = isCash ? 1 : Number(form.quantity);
    const avgCost = isCash ? currentValue : Number(form.avg_cost);
    const payload = {
      name: form.name,
      asset_class: form.asset_class,
      emoji: form.emoji.trim() || null,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      avg_cost: Number.isFinite(avgCost) ? avgCost : 0,
      total_cap: Number.isFinite(totalCap) ? totalCap : 0,
      current_value: Number.isFinite(currentValue) ? currentValue : 0,
      currency: form.currency as "EUR" | "USD",
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
      emoji: item.emoji ?? "",
      quantity: String(item.quantity),
      avg_cost: String(item.avg_cost),
      current_value: String(item.current_value),
      currency: item.currency,
      start_date: item.start_date,
      note: item.note ?? ""
    });
  };

  const removeItem = async (id: string) => {
    try {
      await deleteHolding(id);
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const handleLivePrice = async (item: Holding) => {
    setPriceMessage(null);
    if (item.asset_class === "Liquidita") {
      setPriceMessage("Prezzo live non disponibile per liquidita.");
      return;
    }
    const ticker = extractTicker(item.name);
    if (!ticker) {
      setPriceMessage("Inserisci il ticker nel nome (es. MWRD - ETF).");
      return;
    }
    setPriceLoading(item.id);
    try {
      const price = await fetchGlobalQuote(ticker);
      const currentValue = price * (item.quantity || 0);
      await updateHolding(item.id, { current_value: currentValue });
      await refresh();
      setPriceMessage(`Prezzo ${ticker} aggiornato.`);
    } catch (err) {
      setPriceMessage((err as Error).message);
    } finally {
      setPriceLoading(null);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        items: Holding[];
        totalCap: number;
        totalValue: number;
      }
    >();
    holdings.forEach((item) => {
      const key = item.asset_class || "Altro";
      const current = map.get(key) ?? { items: [], totalCap: 0, totalValue: 0 };
      current.items.push(item);
      current.totalCap += item.total_cap;
      current.totalValue += item.current_value;
      map.set(key, current);
    });
    return Array.from(map.entries()).map(([label, data]) => ({
      label,
      ...data,
      roi: data.totalCap ? (data.totalValue - data.totalCap) / data.totalCap : 0
    }));
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
            <strong>Costo medio</strong>
            <span>Prezzo medio pagato per ogni quota.</span>
          </div>
          <div className="info-item">
            <strong>Quantita</strong>
            <span>Numero di quote o pezzi acquistati.</span>
          </div>
          <div className="info-item">
            <strong>Total Cap</strong>
            <span>Calcolato automaticamente: quantita x costo medio.</span>
          </div>
          <div className="info-item">
            <strong>Valore attuale</strong>
            <span>Valore di mercato oggi, usato per ROI e CAGR.</span>
          </div>
          <div className="info-item">
            <strong>Liquidita</strong>
            <span>
              Seleziona Liquidita per inserire solo l'importo: costo medio e
              quantita non servono.
            </span>
          </div>
          <div className="info-item">
            <strong>Ticker per prezzi live</strong>
            <span>Scrivi il ticker all'inizio del nome (es. MWRD - ETF).</span>
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
          <input
            className="input"
            placeholder="Emoji (opzionale)"
            value={form.emoji}
            onChange={(event) => setForm({ ...form, emoji: event.target.value })}
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
          {!isCash && (
            <input
              className="input"
              type="number"
              step="0.01"
              placeholder="Costo medio"
              value={form.avg_cost}
              onChange={(event) => setForm({ ...form, avg_cost: event.target.value })}
              required
            />
          )}
          {!isCash && (
            <input
              className="input"
              type="number"
              step="0.01"
              placeholder="Quantita"
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: event.target.value })}
              required
            />
          )}
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="Total Cap"
            value={Number.isFinite(totalCap) ? totalCap.toFixed(2) : ""}
            readOnly
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
            placeholder={isCash ? "Importo liquidita" : "Valore attuale"}
            value={form.current_value}
            onChange={(event) =>
              setForm({ ...form, current_value: event.target.value })
            }
            required
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
        {priceMessage && <div className="notice">{priceMessage}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      <div className="card">
        <h3>Holdings attive</h3>
        {holdings.length === 0 ? (
          <div className="empty">Nessuna holding presente.</div>
        ) : (
          <div className="asset-groups">
            {grouped.map((group) => {
              const ratio =
                group.totalCap > 0 ? group.totalValue / group.totalCap : 0;
              const performance =
                group.totalCap > 0 ? group.totalValue / group.totalCap - 1 : Number.NaN;
              const cappedRatio = Math.min(ratio, 2);
              const ratioWidth = (cappedRatio / 2) * 100;
              return (
                <div className="asset-group card" key={group.label}>
                  <div className="asset-group-header">
                    <div>
                      <h4>{group.label}</h4>
                      <span className="section-subtitle">
                        {group.items.length} holdings attive
                      </span>
                    </div>
                    <div className="asset-group-metrics">
                      <div className="asset-metric">
                        <span>Investito</span>
                        <strong>
                          {formatCurrencySafe(group.totalCap, currency)}
                        </strong>
                      </div>
                      <div className="asset-metric">
                        <span>Valore</span>
                        <strong>
                          {formatCurrencySafe(group.totalValue, currency)}
                        </strong>
                      </div>
                      <div className="asset-metric">
                        <span>ROI</span>
                        <strong>{formatPercentSafe(group.roi)}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="asset-bar-meta">
                    <span>Performance (valore vs investito)</span>
                    <span>{formatPercentSafe(performance)}</span>
                  </div>
                  <div className="asset-bar">
                    <div className="asset-bar-fill" style={{ width: `${ratioWidth}%` }} />
                    <span className="asset-bar-label">
                      {formatPercentSafe(performance)}
                    </span>
                  </div>
                  <div className="asset-items">
                    <div className="asset-item asset-item-header">
                      <span className="asset-item-title">Asset</span>
                      <div className="asset-item-metrics">
                        <span>Investito</span>
                        <span>Valore</span>
                        <span>Peso</span>
                        <span>ROI</span>
                      </div>
                      <span className="asset-item-actions">Azioni</span>
                    </div>
                    {group.items.map((item) => {
                      const itemRoi = item.total_cap
                        ? (item.current_value - item.total_cap) / item.total_cap
                        : Number.NaN;
                      const allocation = group.totalValue
                        ? item.current_value / group.totalValue
                        : 0;
                      const subtitle =
                        item.asset_class === "Liquidita"
                          ? "Liquidita disponibile"
                          : `${item.quantity} x ${formatCurrency(
                              item.avg_cost,
                              item.currency
                            )}`;
                      return (
                        <div className="asset-item" key={item.id}>
                          <div>
                            <strong>
                              {item.emoji ? `${item.emoji} ` : ""}
                              {item.name}
                            </strong>
                            <span className="section-subtitle">{subtitle}</span>
                          </div>
                          <div className="asset-item-metrics">
                            <span>
                              {formatCurrencySafe(item.total_cap, item.currency)}
                            </span>
                            <span>
                              {formatCurrencySafe(item.current_value, item.currency)}
                            </span>
                            <span>{formatPercentSafe(allocation)}</span>
                            <span>{formatPercentSafe(itemRoi)}</span>
                          </div>
                          <div className="asset-item-actions">
                            <button
                              className="button ghost small"
                              type="button"
                              onClick={() => handleLivePrice(item)}
                              disabled={priceLoading === item.id}
                            >
                              {priceLoading === item.id ? "Live..." : "Live"}
                            </button>
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Portfolio;
