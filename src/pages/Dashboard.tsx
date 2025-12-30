import { useMemo, useState } from "react";
import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  buildAccountBalances,
  buildMonthlySeries,
  buildPortfolioSeries,
  calculateCagr,
  calculateMonthlyBurnRate,
  calculateRoi,
  calculateSavingsRate,
  filterBalanceCorrectionTransactions,
  groupExpensesByCategory,
  groupHoldingsByAssetClass,
  resolveEmergencyFundBalance,
  sumHoldingsCost,
  sumHoldingsValue
} from "../lib/metrics";
import {
  formatCurrencySafe,
  formatPercentSafe,
  formatRatio
} from "../lib/format";
import { BarChart } from "../components/charts/BarChart";
import { AreaChart } from "../components/charts/AreaChart";
import { DonutChart } from "../components/charts/DonutChart";

const accountTypeLabels: Record<string, string> = {
  bank: "Banca",
  debit: "Carta debito",
  credit: "Carta credito",
  cash: "Cash",
  paypal: "PayPal",
  other: "Altro"
};

const Dashboard = () => {
  const { accounts, categories, transactions, holdings, settings, loading, error } =
    usePortfolioData();
  const [allocationFocus, setAllocationFocus] = useState<string | null>(null);
  const currency = settings?.base_currency ?? "EUR";
  const savingsRate = calculateSavingsRate(transactions, categories);
  const burnRate = calculateMonthlyBurnRate(transactions, categories);
  const roi = calculateRoi(holdings);
  const cagr = calculateCagr(holdings);
  const totalCap = sumHoldingsCost(holdings);
  const capitalGain = sumHoldingsValue(holdings) - totalCap;

  const cashflowSeries = buildMonthlySeries(transactions, 6, categories);
  const portfolioSeries = buildPortfolioSeries(holdings, 12);
  const accountBalances = buildAccountBalances(accounts, transactions);
  const netWorth =
    sumHoldingsValue(holdings) +
    accountBalances
      .filter((account) => account.type !== "credit")
      .reduce((sum, account) => sum + account.balance, 0);
  const emergencyFund = resolveEmergencyFundBalance(
    accountBalances,
    settings?.emergency_fund ?? 0
  );
  const runway = burnRate > 0 ? emergencyFund / burnRate : 0;
  const runwayLabel =
    burnRate > 0
      ? `${formatRatio(runway)} mesi`
      : emergencyFund > 0
        ? "Illimitato"
        : "N/D";
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
  const topExpenses = expenseMix.slice(0, 4);
  const expenseTotal = expenseMix.reduce((sum, item) => sum + item.value, 0);
  const filteredTransactions = useMemo(
    () => filterBalanceCorrectionTransactions(transactions, categories),
    [transactions, categories]
  );
  const expenseCount = filteredTransactions.filter((item) => item.type === "expense").length;

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthTransactions = filteredTransactions.filter((item) =>
    item.date.startsWith(monthKey)
  );
  const monthIncome = monthTransactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
  const monthExpense = monthTransactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
  const monthNet = monthIncome - monthExpense;
  const avgDailyExpense = now.getDate() > 0 ? monthExpense / now.getDate() : 0;
  const topExpense = expenseMix[0];

  if (loading) {
    return <div className="card">Caricamento dashboard...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2 className="section-title">Dashboard Strategica</h2>
          <p className="section-subtitle">
            Vista completa del portafoglio e del cash flow in tempo reale.
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Net Worth</span>
          <span className="stat-value">{formatCurrencySafe(netWorth, currency)}</span>
          <span className="stat-trend">Valore patrimoniale totale</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Savings Rate</span>
          <span className="stat-value">{formatPercentSafe(savingsRate)}</span>
          <span className="stat-trend">(Entrate - Uscite) / Entrate</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Burn Rate Mensile</span>
          <span className="stat-value">{formatCurrencySafe(burnRate, currency)}</span>
          <span className="stat-trend">Spese fisse ultime 4 settimane</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Runway</span>
          <span className="stat-value">{runwayLabel}</span>
          <span className="stat-trend">Copertura fondo emergenza</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">ROI</span>
          <span className="stat-value">{formatPercentSafe(roi)}</span>
          <span className="stat-trend">Rendimento totale holdings</span>
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
          <span className="stat-trend">Differenza tra valore e capitale</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">CAGR</span>
          <span className="stat-value">{formatPercentSafe(cagr)}</span>
          <span className="stat-trend">Crescita annua composta</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Capitale Investito</span>
          <span className="stat-value">{formatCurrencySafe(totalCap, currency)}</span>
          <span className="stat-trend">Totale capitale allocato</span>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <div>
            <h3>Conti attivi</h3>
            <p className="section-subtitle">Saldo aggiornato per ogni conto</p>
          </div>
        </div>
        {accountBalances.length === 0 ? (
          <div className="empty">Nessun conto creato.</div>
        ) : (
          <div className="account-grid">
            {accountBalances.map((account) => (
              <div className="account-card" key={account.id}>
                <div className="account-meta">
                  <span className="account-emoji">
                    {account.emoji && account.emoji.trim() ? account.emoji : "O"}
                  </span>
                  <div className="account-info">
                    <strong>{account.name}</strong>
                    <span className="section-subtitle">
                      {accountTypeLabels[account.type] ?? account.type}
                    </span>
                  </div>
                </div>
                <div className="account-balance">
                  {formatCurrencySafe(account.balance, account.currency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="chart-card">
          <div>
            <strong>Cash Flow (6 mesi)</strong>
            <p className="section-subtitle">Entrate vs uscite</p>
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
          </div>
          <BarChart data={cashflowSeries} />
        </div>
        <div className="chart-card">
          <div>
            <strong>Valore Portafoglio (12 mesi)</strong>
            <p className="section-subtitle">Trend stimato basato su holdings</p>
          </div>
          <AreaChart data={portfolioSeries} />
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
                : "Distribuzione percentuale attuale"}
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
            <strong>Top Spese</strong>
            <p className="section-subtitle">Categorie piu rilevanti</p>
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
                  <span className="stat-trend">Transazioni registrate</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Top categoria</span>
                  <span className="stat-value">
                    {topExpense ? topExpense.label : "N/D"}
                  </span>
                  <span className="stat-trend">
                    {topExpense
                      ? formatCurrencySafe(topExpense.value, currency)
                      : "N/D"}
                  </span>
                </div>
              </div>
              <div className="expense-bars">
                {topExpenses.map((item) => {
                  const ratio = expenseTotal ? (item.value / expenseTotal) * 100 : 0;
                  return (
                    <div className="expense-bar" key={item.label}>
                      <div className="expense-meta">
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
            <div className="empty">Nessuna spesa registrata.</div>
          )}
        </div>
      </div>

      <div className="grid-3">
        <div className="card impact-card">
          <h3>Snapshot mese</h3>
          <div className="impact-values">
            <div>
              <span className="stat-label">Entrate</span>
              <strong>{formatCurrencySafe(monthIncome, currency)}</strong>
            </div>
            <div>
              <span className="stat-label">Uscite</span>
              <strong>{formatCurrencySafe(monthExpense, currency)}</strong>
            </div>
            <div>
              <span className="stat-label">Netto</span>
              <strong>{formatCurrencySafe(monthNet, currency)}</strong>
            </div>
          </div>
        </div>
        <div className="card impact-card">
          <h3>Spesa media giornaliera</h3>
          <p className="impact-value">
            {formatCurrencySafe(avgDailyExpense, currency)}
          </p>
          <span className="section-subtitle">Calcolata sul mese corrente</span>
        </div>
        <div className="card impact-card">
          <h3>Categoria dominante</h3>
          <p className="impact-value">{topExpense ? topExpense.label : "N/D"}</p>
          <span className="section-subtitle">
            {topExpense ? formatCurrencySafe(topExpense.value, currency) : "N/D"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
