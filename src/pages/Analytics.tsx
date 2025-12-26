import { useState } from "react";
import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  buildAccountBalances,
  buildMonthlySeries,
  calculateCagr,
  calculateNetWorth,
  calculateRoi,
  calculateSavingsRate,
  groupExpensesByCategory,
  groupHoldingsByAssetClass,
  sumHoldingsCost
} from "../lib/metrics";
import { formatCurrencySafe, formatPercentSafe } from "../lib/format";
import { BarChart } from "../components/charts/BarChart";
import { DonutChart } from "../components/charts/DonutChart";
import { AreaChart } from "../components/charts/AreaChart";

const Analytics = () => {
  const { accounts, categories, transactions, holdings, settings, loading, error } =
    usePortfolioData();
  const currency = settings?.base_currency ?? "EUR";
  const [range, setRange] = useState(12);
  const [allocationFocus, setAllocationFocus] = useState<string | null>(null);

  const roi = calculateRoi(holdings);
  const cagr = calculateCagr(holdings);
  const savingsRate = calculateSavingsRate(transactions);
  const netWorth = calculateNetWorth(holdings, transactions);
  const totalCap = sumHoldingsCost(holdings);

  const cashflowSeries = buildMonthlySeries(transactions, range);
  const accountBalances = buildAccountBalances(accounts, transactions);
  const cashTotal = accountBalances.reduce((sum, item) => sum + item.balance, 0);
  const allocationBase = groupHoldingsByAssetClass(holdings);
  const allocation =
    cashTotal > 0
      ? [...allocationBase, { label: "Cash", value: cashTotal }]
      : allocationBase;
  const allocationDetail = allocationFocus
    ? holdings
        .filter((item) => item.asset_class === allocationFocus)
        .map((item) => ({
          label: `${item.emoji ? `${item.emoji} ` : ""}${item.name}`,
          value: item.current_value
        }))
    : [];
  const allocationCashDetail =
    allocationFocus === "Cash"
      ? accountBalances.map((account) => ({
          label: `${account.emoji ? `${account.emoji} ` : ""}${account.name}`,
          value: account.balance
        }))
      : [];
  const expenseMix = groupExpensesByCategory(transactions, categories);
  const expenseTotal = expenseMix.reduce((sum, item) => sum + item.value, 0);
  const expenseCount = transactions.filter((item) => item.type === "expense").length;
  const expenseAvg = expenseCount > 0 ? expenseTotal / expenseCount : 0;
  const topExpenses = expenseMix.slice(0, 5);

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
          <span className="stat-label">Savings Rate</span>
          <span className="stat-value">{formatPercentSafe(savingsRate)}</span>
          <span className="stat-trend">Capitale trattenuto</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Net Worth</span>
          <span className="stat-value">{formatCurrencySafe(netWorth, currency)}</span>
          <span className="stat-trend">Patrimonio netto</span>
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

      <div className="grid-2">
        <div className="chart-card">
          <div>
            <strong>
              {allocationFocus
                ? `Asset Allocation - ${allocationFocus}`
                : "Asset Allocation"}
            </strong>
            <p className="section-subtitle">
              {allocationFocus
                ? "Dettaglio percentuale per singolo asset"
                : "Classi di asset a confronto"}
            </p>
            {allocationFocus && (
              <button
                className="button ghost small"
                type="button"
                onClick={() => setAllocationFocus(null)}
              >
                Torna indietro
              </button>
            )}
          </div>
          <DonutChart
            data={
              allocationFocus === "Cash"
                ? allocationCashDetail
                : allocationFocus
                  ? allocationDetail
                  : allocation
            }
            onSelect={
              allocationFocus ? undefined : (label) => setAllocationFocus(label)
            }
            valueFormatter={(value) => formatCurrencySafe(value, currency)}
          />
        </div>
        <div className="chart-card">
          <div>
            <strong>Spese per categoria</strong>
            <p className="section-subtitle">Distribuzione uscite</p>
          </div>
          {expenseMix.length > 0 ? (
            <div className="expense-panel">
              <div className="grid-3">
                <div className="stat-card">
                  <span className="stat-label">Totale spese</span>
                  <span className="stat-value">
                    {formatCurrencySafe(expenseTotal, currency)}
                  </span>
                  <span className="stat-trend">Periodo complessivo</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Numero spese</span>
                  <span className="stat-value">{expenseCount}</span>
                  <span className="stat-trend">Transazioni</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Top categoria</span>
                  <span className="stat-value">
                    {topExpenses[0]?.label ?? "N/D"}
                  </span>
                  <span className="stat-trend">
                    {topExpenses[0]
                      ? formatCurrencySafe(topExpenses[0].value, currency)
                      : "N/D"}
                  </span>
                </div>
              </div>
              <div className="expense-bars">
                {topExpenses.map((item) => {
                  const ratio = expenseTotal ? (item.value / expenseTotal) * 100 : 0;
                  return (
                    <div className="expense-bar" key={item.label}>
                      <div>
                        <strong>{item.label}</strong>
                        <span className="section-subtitle">
                          {formatCurrencySafe(item.value, currency)}
                        </span>
                      </div>
                      <div className="expense-track">
                        <div
                          className="expense-fill"
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="empty">Nessuna spesa disponibile.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
