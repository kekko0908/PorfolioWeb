import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePortfolioData } from "../hooks/usePortfolioData";
import { createHolding, deleteHolding, updateHolding, upsertSettings } from "../lib/api";
import { DonutChart } from "../components/charts/DonutChart";
import {
  formatCurrency,
  formatCurrencySafe,
  formatPercentSafe
} from "../lib/format";
import { fetchAssetOverview, fetchGlobalQuote } from "../lib/market";
import { buildAccountBalances } from "../lib/metrics";
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
  const { session } = useAuth();
  const { accounts, transactions, holdings, settings, refresh, loading, error } =
    usePortfolioData();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [priceMessage, setPriceMessage] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState<string | null>(null);
  const [tickerMessage, setTickerMessage] = useState<string | null>(null);
  const [tickerLoading, setTickerLoading] = useState<string | null>(null);
  const [tickerInfo, setTickerInfo] = useState<
    Record<
      string,
      {
        name?: string;
        assetType?: string;
        exchange?: string;
        country?: string;
        currency?: string;
      }
    >
  >({});
  const [allocationMessage, setAllocationMessage] = useState<string | null>(null);
  const [targetMessage, setTargetMessage] = useState<string | null>(null);
  const [targetDrafts, setTargetDrafts] = useState<Record<string, number>>({});
  const [cashCapInput, setCashCapInput] = useState("");
  const [useCashCap, setUseCashCap] = useState(false);
  const [rebalanceMonths, setRebalanceMonths] = useState(6);
  const [allocationTargets, setAllocationTargets] = useState({
    cash: 20,
    etf: 50,
    bonds: 20,
    emergency: 10
  });
  const [allocationColors, setAllocationColors] = useState({
    Cash: "#22c55e",
    ETF: "#ef4444",
    Obbligazioni: "#f59e0b",
    "Fondo emergenza": "#60a5fa"
  });

  const currency = settings?.base_currency ?? "EUR";
  const isCash = form.asset_class === "Liquidita";
  const cashCapValue = useMemo(() => {
    if (!useCashCap || !cashCapInput.trim()) return null;
    const parsed = Number(cashCapInput);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }, [cashCapInput, useCashCap]);

  useEffect(() => {
    if (!settings) return;
    setAllocationTargets({
      cash: settings.target_cash_pct ?? 20,
      etf: settings.target_etf_pct ?? 50,
      bonds: settings.target_bond_pct ?? 20,
      emergency: settings.target_emergency_pct ?? 10
    });
    setRebalanceMonths(settings.rebalance_months ?? 6);
    setCashCapInput(
      settings.cash_target_cap !== null && settings.cash_target_cap !== undefined
        ? String(settings.cash_target_cap)
        : ""
    );
    setUseCashCap(settings.cash_target_cap !== null && settings.cash_target_cap !== undefined);
  }, [settings]);

  useEffect(() => {
    setTargetDrafts((prev) => {
      const validIds = new Set(holdings.map((item) => item.id));
      const next: Record<string, number> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validIds.has(key)) next[key] = value;
      });
      return next;
    });
  }, [holdings]);

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
    setTargetMessage(null);
    let customMessage: string | null = null;
    const currentValue = Number(form.current_value);
    const quantity = isCash ? 1 : Number(form.quantity);
    const avgCost = isCash ? currentValue : Number(form.avg_cost);
    const ticker = extractTicker(form.name);
    const payload = {
      name: form.name,
      asset_class: form.asset_class,
      emoji: form.emoji.trim() || null,
      target_pct: editing?.target_pct ?? null,
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
        const match =
          !isCash && ticker
            ? holdings.find(
                (item) =>
                  extractTicker(item.name) === ticker &&
                  item.asset_class === form.asset_class
              )
            : null;
        if (match) {
          if (match.currency !== payload.currency) {
            setMessage(
              "Ticker gia presente con valuta diversa. Aggiorna la holding esistente."
            );
            return;
          }
          const newQuantity = match.quantity + (Number.isFinite(quantity) ? quantity : 0);
          const newTotalCap =
            match.total_cap + (Number.isFinite(totalCap) ? totalCap : 0);
          const avgUnitPrice =
            quantity > 0 && Number.isFinite(currentValue) && currentValue > 0
              ? currentValue / quantity
              : match.quantity > 0
                ? match.current_value / match.quantity
                : 0;
          const newCurrentValue =
            avgUnitPrice > 0
              ? avgUnitPrice * newQuantity
              : match.current_value + (Number.isFinite(currentValue) ? currentValue : 0);
          const newAvgCost = newQuantity > 0 ? newTotalCap / newQuantity : 0;
          const newStartDate =
            match.start_date && form.start_date
              ? match.start_date < form.start_date
                ? match.start_date
                : form.start_date
              : match.start_date || form.start_date;

          await updateHolding(match.id, {
            name: match.name,
            asset_class: match.asset_class,
            emoji: payload.emoji ?? match.emoji,
            target_pct: match.target_pct ?? null,
            quantity: newQuantity,
            avg_cost: newAvgCost,
            total_cap: newTotalCap,
            current_value: newCurrentValue,
            currency: payload.currency,
            start_date: newStartDate,
            note: payload.note || match.note
          });
          customMessage = `Holding unita a ${match.name}.`;
        } else {
          await createHolding(payload);
        }
      }
      await refresh();
      setMessage(customMessage ?? "Salvataggio completato.");
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

  const handleTickerInfo = async (item: Holding) => {
    setTickerMessage(null);
    const ticker = extractTicker(item.name);
    if (!ticker) {
      setTickerMessage("Inserisci il ticker all'inizio del nome (es. MWRD - ETF).");
      return;
    }
    setTickerLoading(item.id);
    try {
      const info = await fetchAssetOverview(ticker);
      setTickerInfo((prev) => ({
        ...prev,
        [item.id]: info
      }));
    } catch (err) {
      setTickerMessage((err as Error).message);
    } finally {
      setTickerLoading(null);
    }
  };

  const handleAllocationChange = (
    key: "cash" | "etf" | "bonds" | "emergency",
    value: number
  ) => {
    setAllocationTargets((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveAllocation = async () => {
    if (!session) return;
    setAllocationMessage(null);
    try {
      await upsertSettings({
        user_id: session.user.id,
        base_currency: settings?.base_currency ?? "EUR",
        emergency_fund: emergencyFund,
        cash_target_cap: useCashCap ? cashCapValue : null,
        target_cash_pct: allocationTargets.cash,
        target_etf_pct: allocationTargets.etf,
        target_bond_pct: allocationTargets.bonds,
        target_emergency_pct: allocationTargets.emergency,
        rebalance_months: rebalanceMonths
      });
      await refresh();
      setAllocationMessage("Asset allocation salvata.");
    } catch (err) {
      setAllocationMessage((err as Error).message);
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

  const accountBalances = useMemo(
    () => buildAccountBalances(accounts, transactions),
    [accounts, transactions]
  );
  const emergencyFund = settings?.emergency_fund ?? 0;
  const cashTotal = accountBalances.reduce((sum, item) => sum + item.balance, 0);
  const cashAvailable = Math.max(cashTotal - emergencyFund, 0);
  const etfValue = holdings
    .filter((item) => item.asset_class === "ETF")
    .reduce((sum, item) => sum + item.current_value, 0);
  const bondValue = holdings
    .filter((item) => item.asset_class === "Obbligazioni")
    .reduce((sum, item) => sum + item.current_value, 0);
  const allocationTotal = cashAvailable + emergencyFund + etfValue + bondValue;
  const targetTotal = allocationTotal > 0 ? allocationTotal : 0;
  const allocationData = [
    { label: "Cash", value: (allocationTargets.cash / 100) * targetTotal },
    { label: "ETF", value: (allocationTargets.etf / 100) * targetTotal },
    {
      label: "Obbligazioni",
      value: (allocationTargets.bonds / 100) * targetTotal
    },
    {
      label: "Fondo emergenza",
      value: (allocationTargets.emergency / 100) * targetTotal
    }
  ];

  const allocationGap = [
    {
      label: "Cash",
      current: cashAvailable,
      target: (allocationTargets.cash / 100) * targetTotal
    },
    {
      label: "ETF",
      current: etfValue,
      target: (allocationTargets.etf / 100) * targetTotal
    },
    {
      label: "Obbligazioni",
      current: bondValue,
      target: (allocationTargets.bonds / 100) * targetTotal
    },
    {
      label: "Fondo emergenza",
      current: emergencyFund,
      target: (allocationTargets.emergency / 100) * targetTotal
    }
  ].map((item) => ({
    ...item,
    delta: item.target - item.current
  }));

  const allocationPercentTotal =
    allocationTargets.cash +
    allocationTargets.etf +
    allocationTargets.bonds +
    allocationTargets.emergency;
  const allocationPercentDisplay = Number(allocationPercentTotal.toFixed(1));
  const allocationPercentWithinRange =
    Math.abs(allocationPercentTotal - 100) <= 0.1;

  useEffect(() => {
    if (!useCashCap || cashCapValue === null || cashCapValue === undefined) return;
    if (targetTotal <= 0) return;
    const maxCashPct = Math.min(100, (cashCapValue / targetTotal) * 100);
    const keys: Array<"etf" | "bonds" | "emergency"> = ["etf", "bonds", "emergency"];
    const otherTotal = keys.reduce((sum, key) => sum + allocationTargets[key], 0);
    const remaining = Math.max(0, 100 - maxCashPct);
    const next = {
      ...allocationTargets,
      cash: Number(maxCashPct.toFixed(1))
    };
    if (otherTotal <= 0) {
      const share = keys.length > 0 ? remaining / keys.length : 0;
      let allocated = 0;
      keys.forEach((key, index) => {
        if (index === keys.length - 1) {
          next[key] = Number((remaining - allocated).toFixed(1));
        } else {
          const value = Number(share.toFixed(1));
          next[key] = value;
          allocated += value;
        }
      });
    } else {
      let allocated = 0;
      keys.forEach((key, index) => {
        if (index === keys.length - 1) {
          next[key] = Number((remaining - allocated).toFixed(1));
        } else {
          const value = (allocationTargets[key] / otherTotal) * remaining;
          const rounded = Number(value.toFixed(1));
          next[key] = rounded;
          allocated += rounded;
        }
      });
    }
    const same =
      keys.every((key) => Math.abs(next[key] - allocationTargets[key]) < 0.05) &&
      Math.abs(next.cash - allocationTargets.cash) < 0.05;
    if (same) return;
    setAllocationTargets(next);
  }, [
    cashCapValue,
    targetTotal,
    useCashCap,
    allocationTargets.cash,
    allocationTargets.etf,
    allocationTargets.bonds,
    allocationTargets.emergency
  ]);

  const getClassTargetTotal = (label: string, fallback: number) => {
    if (targetTotal <= 0) return fallback;
    if (label === "ETF") return (allocationTargets.etf / 100) * targetTotal;
    if (label === "Obbligazioni") return (allocationTargets.bonds / 100) * targetTotal;
    return fallback;
  };

  const buildInternalTargets = (items: Holding[]) => {
    const totalValue = items.reduce((sum, item) => sum + item.current_value, 0);
    const entries = items.map((item) => {
      const raw = targetDrafts[item.id] ?? item.target_pct;
      const target =
        typeof raw === "number" && Number.isFinite(raw)
          ? raw
          : totalValue > 0
            ? (item.current_value / totalValue) * 100
            : 0;
      return { id: item.id, target };
    });
    const total = entries.reduce((sum, item) => sum + item.target, 0);
    return { entries, total };
  };

  const handleSaveGroupTargets = async (
    items: Holding[],
    targetById: Map<string, number>
  ) => {
    setTargetMessage(null);
    if (items.length === 0) return;
    try {
      await Promise.all(
        items.map((item) =>
          updateHolding(item.id, {
            target_pct: Number(targetById.get(item.id) ?? 0)
          })
        )
      );
      await refresh();
      setTargetDrafts((prev) => {
        const next = { ...prev };
        items.forEach((item) => delete next[item.id]);
        return next;
      });
      setTargetMessage("Pesi interni salvati.");
    } catch (err) {
      setTargetMessage((err as Error).message);
    }
  };

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

      <div className="card allocation-card">
        <div className="section-header">
          <div>
            <h3>Asset Allocation Target</h3>
            <p className="section-subtitle">
              Imposta le percentuali e ricevi indicazioni per ribilanciare.
            </p>
          </div>
          <div className="allocation-actions">
            <select
              className="select"
              value={rebalanceMonths}
              onChange={(event) => setRebalanceMonths(Number(event.target.value))}
            >
              {[3, 6, 12].map((value) => (
                <option key={value} value={value}>
                  Ribilancia ogni {value} mesi
                </option>
              ))}
            </select>
            <button className="button secondary" type="button" onClick={handleSaveAllocation}>
              Salva
            </button>
          </div>
        </div>

        <div className="allocation-layout">
          <div className="allocation-chart">
            <DonutChart
              data={allocationData}
              valueFormatter={(value) => formatCurrencySafe(value, currency)}
              colors={allocationColors}
            />
            <div className="allocation-summary">
              <div>
                <span className="stat-label">Totale attuale</span>
                <strong>{formatCurrencySafe(allocationTotal, currency)}</strong>
              </div>
              <div>
                <span className="stat-label">Fondo emergenza</span>
                <strong>{formatCurrencySafe(emergencyFund, currency)}</strong>
              </div>
            </div>
          </div>

          <div className="allocation-controls">
            {[
              { key: "cash", label: "Cash", colorKey: "Cash" },
              { key: "etf", label: "ETF", colorKey: "ETF" },
              { key: "bonds", label: "Obbligazioni", colorKey: "Obbligazioni" },
              {
                key: "emergency",
                label: "Fondo emergenza",
                colorKey: "Fondo emergenza"
              }
            ].map((item) => (
              <div className="allocation-row" key={item.key}>
                <div className="allocation-label">
                  <input
                    className="color-input"
                    type="color"
                    value={allocationColors[item.colorKey]}
                    onChange={(event) =>
                      setAllocationColors((prev) => ({
                        ...prev,
                        [item.colorKey]: event.target.value
                      }))
                    }
                    aria-label={`Colore ${item.label}`}
                  />
                  <strong>{item.label}</strong>
                </div>
                <input
                  className="allocation-slider"
                  type="range"
                  min="0"
                  max="100"
                  disabled={item.key === "cash" && useCashCap}
                  value={allocationTargets[item.key as keyof typeof allocationTargets]}
                  onChange={(event) =>
                    handleAllocationChange(
                      item.key as "cash" | "etf" | "bonds" | "emergency",
                      Number(event.target.value)
                    )
                  }
                />
                <span className="allocation-value">
                  {allocationTargets[item.key as keyof typeof allocationTargets]}%
                </span>
              </div>
            ))}
            <div className="allocation-total">
              Totale percentuali: {allocationPercentDisplay}%
            </div>
            <div className="allocation-cap">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={useCashCap}
                  onChange={(event) => setUseCashCap(event.target.checked)}
                />
                Usa limite massimo Cash
              </label>
              <label>
                Limite Cash (max)
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  placeholder="Nessun limite"
                  value={cashCapInput}
                  onChange={(event) => setCashCapInput(event.target.value)}
                  disabled={!useCashCap}
                />
              </label>
              <span className="section-subtitle">
                Se impostato, la quota cash viene ridotta al massimo e ridistribuita.
              </span>
            </div>
            {!allocationPercentWithinRange && (
              <div className="notice">
                Consiglio: porta il totale al 100% per un ribilanciamento corretto.
              </div>
            )}
          </div>
        </div>

        <div className="allocation-rebalance">
          <h4>Azioni consigliate</h4>
          {allocationTotal === 0 ? (
            <div className="empty">Inserisci dati per calcolare il ribilanciamento.</div>
          ) : (
            <div className="allocation-grid">
              {allocationGap.map((item) => {
                const action =
                  item.delta > 0
                    ? "Compra"
                    : item.delta < 0
                      ? "Vendi"
                      : "Mantieni";
                const value = Math.abs(item.delta);
                const actionClass =
                  item.delta > 0 ? "buy" : item.delta < 0 ? "sell" : "hold";
                const deltaAbs = Math.abs(item.delta);
                const share = targetTotal > 0 ? (deltaAbs / targetTotal) * 100 : 0;
                return (
                  <div className={`allocation-item ${actionClass}`} key={item.label}>
                    <div className="allocation-item-header">
                      <strong>{item.label}</strong>
                      <div className="allocation-item-meta">
                        <span>
                          Target: {formatCurrencySafe(item.target, currency)}
                        </span>
                        <span>
                          Attuale: {formatCurrencySafe(item.current, currency)}
                        </span>
                      </div>
                    </div>
                    <div className={`allocation-action ${actionClass}`}>
                      {action} {formatCurrencySafe(value, currency)}
                      {share > 0 && (
                        <span className="allocation-action-share">
                          ({share.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {allocationMessage && <div className="notice">{allocationMessage}</div>}
      </div>

      <div className="card">
        <h3>{editing ? "Modifica holding" : "Nuova holding"}</h3>
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
        {tickerMessage && <div className="notice">{tickerMessage}</div>}
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
              const targetModel = buildInternalTargets(group.items);
              const targetById = new Map(
                targetModel.entries.map((item) => [item.id, item.target])
              );
              const classTargetTotal = getClassTargetTotal(group.label, group.totalValue);
              const showTargets = group.label !== "Liquidita";
              const hasTargetDrafts = group.items.some(
                (item) => targetDrafts[item.id] !== undefined
              );
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
                    <span>Performance (barra 0-200%)</span>
                    <span>{formatPercentSafe(performance)}</span>
                  </div>
                  <div className="asset-bar">
                    <div className="asset-bar-fill" style={{ width: `${ratioWidth}%` }} />
                    <span className="asset-bar-label">
                      {formatPercentSafe(performance)}
                    </span>
                  </div>
                  <div className="asset-items">
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
                      const ticker = extractTicker(item.name);
                      const info = tickerInfo[item.id];
                      const infoLine = info
                        ? [
                            info.assetType,
                            info.exchange,
                            info.country,
                            info.currency
                          ]
                            .filter(Boolean)
                            .join(" • ")
                        : null;
                      return (
                        <div className="asset-item" key={item.id}>
                          <div className="asset-item-text">
                            <strong>
                              {item.emoji ? `${item.emoji} ` : ""}
                              {item.name}
                            </strong>
                            <span className="section-subtitle">{subtitle}</span>
                            {ticker && (
                              <span className="asset-subinfo">Ticker: {ticker}</span>
                            )}
                            {info?.name && (
                              <span className="asset-subinfo">{info.name}</span>
                            )}
                            {infoLine && (
                              <span className="asset-subinfo">{infoLine}</span>
                            )}
                          </div>
                          <div className="asset-item-metrics">
                            <div className="asset-item-metric">
                              <span className="asset-item-label">Investito</span>
                              <strong className="asset-item-value">
                                {formatCurrencySafe(item.total_cap, item.currency)}
                              </strong>
                            </div>
                            <div className="asset-item-metric">
                              <span className="asset-item-label">Valore</span>
                              <strong className="asset-item-value">
                                {formatCurrencySafe(item.current_value, item.currency)}
                              </strong>
                            </div>
                            <div className="asset-item-metric">
                              <span className="asset-item-label">Peso</span>
                              <strong className="asset-item-value">
                                {formatPercentSafe(allocation)}
                              </strong>
                            </div>
                            <div className="asset-item-metric">
                              <span className="asset-item-label">ROI</span>
                              <strong className="asset-item-value">
                                {formatPercentSafe(itemRoi)}
                              </strong>
                            </div>
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
                              onClick={() => handleTickerInfo(item)}
                              disabled={tickerLoading === item.id}
                            >
                              {tickerLoading === item.id ? "Info..." : "Info"}
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
                  {showTargets && (
                    <div className="holding-targets">
                      <div className="holding-target-header">
                        <div>
                          <strong>Pesi interni e azioni consigliate</strong>
                          <span className="section-subtitle">
                            {group.label === "ETF" || group.label === "Obbligazioni"
                              ? `Target classe: ${formatCurrencySafe(
                                  classTargetTotal,
                                  currency
                                )}`
                              : "Target calcolato sul valore attuale della classe"}
                          </span>
                        </div>
                        <div className="holding-target-actions">
                          <span className="stat-label">Totale target</span>
                          <strong>{targetModel.total.toFixed(1)}%</strong>
                          {hasTargetDrafts && (
                            <button
                              className="button secondary small"
                              type="button"
                              onClick={() =>
                                handleSaveGroupTargets(group.items, targetById)
                              }
                            >
                              Salva pesi
                            </button>
                          )}
                        </div>
                      </div>
                      {Math.abs(targetModel.total - 100) > 0.1 && (
                        <div className="notice">
                          Porta il totale al 100% per un bilanciamento interno corretto.
                        </div>
                      )}
                      <div className="holding-target-grid">
                        {group.items.map((item) => {
                          const targetPct = targetById.get(item.id) ?? 0;
                          const currentShare = group.totalValue
                            ? item.current_value / group.totalValue
                            : 0;
                          const targetValue = (classTargetTotal * targetPct) / 100;
                          const delta = targetValue - item.current_value;
                          const action =
                            delta > 0 ? "Compra" : delta < 0 ? "Vendi" : "Mantieni";
                          const actionClass = delta > 0 ? "buy" : delta < 0 ? "sell" : "hold";
                          const ticker = extractTicker(item.name) || item.name;
                          return (
                            <div
                              className={`holding-target-card ${actionClass}`}
                              key={`target-${item.id}`}
                            >
                              <div className="holding-target-meta">
                                <strong>
                                  {item.emoji ? `${item.emoji} ` : ""}
                                  {ticker}
                                </strong>
                                <span className="section-subtitle">
                                  {formatPercentSafe(currentShare)} attuale
                                </span>
                              </div>
                              <div className="holding-target-slider">
                                <input
                                  className="allocation-slider"
                                  type="range"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={targetPct}
                                  onChange={(event) =>
                                    setTargetDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: Number(event.target.value)
                                    }))
                                  }
                                />
                                <span className="holding-target-value">
                                  {targetPct.toFixed(1)}%
                                </span>
                              </div>
                              <div className="holding-target-values">
                                <span>
                                  Target: {formatCurrencySafe(targetValue, currency)}
                                </span>
                                <span>
                                  Attuale: {formatCurrencySafe(
                                    item.current_value,
                                    currency
                                  )}
                                </span>
                              </div>
                              <div className={`holding-action ${actionClass}`}>
                                {action} {formatCurrencySafe(Math.abs(delta), currency)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {targetMessage && <div className="notice">{targetMessage}</div>}
      </div>
    </div>
  );
};

export default Portfolio;
