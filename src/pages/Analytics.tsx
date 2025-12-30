import { useMemo, useState } from "react";
import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  buildMonthlySeries,
  calculateCagr,
  calculateRoi,
  filterBalanceCorrectionTransactions,
  groupExpensesByCategory,
  sumHoldingsCost,
  sumHoldingsValue
} from "../lib/metrics";
import { formatCurrencySafe, formatPercentSafe } from "../lib/format";
import { BarChart } from "../components/charts/BarChart";
import { AreaChart } from "../components/charts/AreaChart";

const Analytics = () => {
  const { categories, transactions, holdings, settings, loading, error } =
    usePortfolioData();
  const currency = settings?.base_currency ?? "EUR";
  const [range, setRange] = useState(12);

  const roi = calculateRoi(holdings);
  const cagr = calculateCagr(holdings);
  const totalCap = sumHoldingsCost(holdings);
  const capitalGain = sumHoldingsValue(holdings) - totalCap;

  const cashflowSeries = buildMonthlySeries(transactions, range, categories);
  const expenseMix = groupExpensesByCategory(transactions, categories);
  const expenseTotal = expenseMix.reduce((sum, item) => sum + item.value, 0);
  const filteredTransactions = useMemo(
    () => filterBalanceCorrectionTransactions(transactions, categories),
    [transactions, categories]
  );
  const expenseCount = filteredTransactions.filter((item) => item.type === "expense").length;
  const expenseAvg = expenseCount > 0 ? expenseTotal / expenseCount : 0;

  if (loading) {
    return <div className="card">Caricamento analytics...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2 className="section-title">Analytics Avanzate</h2>
          <p className="section-subtitle">
            Indicatori strategici pensati per investitori e controllo cash flow.
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">ROI</span>
          <span className="stat-value">{formatPercentSafe(roi)}</span>
          <span className="stat-trend">Rendimento totale</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">CAGR</span>
          <span className="stat-value">{formatPercentSafe(cagr)}</span>
          <span className="stat-trend">Crescita annua composta</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Capitale investito</span>
          <span className="stat-value">{formatCurrencySafe(totalCap, currency)}</span>
          <span className="stat-trend">Totale allocato</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Capital Gain</span>
          <span
            className={`stat-value ${
              capitalGain >= 0 ? "positive" : "negative"
            }`}
          >
            {formatCurrencySafe(capitalGain, currency)}
          </span>
          <span className="stat-trend">Differenza valore vs capitale</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Spesa media</span>
          <span className="stat-value">{formatCurrencySafe(expenseAvg, currency)}</span>
          <span className="stat-trend">Media per transazione</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="chart-card">
          <div>
            <strong>Cash Flow {range} mesi</strong>
            <p className="section-subtitle">Entrate vs uscite mese per mese</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <span className="tag">
                <span className="tag-dot" style={{ background: "#1f6f5c" }} />
                Entrate
              </span>
              <span className="tag">
                <span className="tag-dot" style={{ background: "#c8782b" }} />
                Uscite
              </span>
            </div>
            <div className="range-toggle">
              {[6, 12, 24].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`chip ${range === value ? "active" : ""}`}
                  onClick={() => setRange(value)}
                >
                  {value} mesi
                </button>
              ))}
            </div>
          </div>
          <BarChart data={cashflowSeries} />
        </div>
        <div className="chart-card">
          <div>
            <strong>Net Flow</strong>
            <p className="section-subtitle">Risultato netto mensile</p>
          </div>
          <AreaChart data={cashflowSeries} color="#c8782b" />
        </div>
      </div>

      <div className="notice">
        Le analisi di dettaglio (allocazione e top spese) sono disponibili in
        Dashboard per una vista rapida.
      </div>
    </div>
  );
};

export default Analytics;
