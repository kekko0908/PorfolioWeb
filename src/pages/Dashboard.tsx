import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  buildMonthlySeries,
  buildPortfolioSeries,
  calculateCagr,
  calculateMonthlyBurnRate,
  calculateNetWorth,
  calculatePeRatio,
  calculateRoi,
  calculateSavingsRate,
  groupExpensesByCategory,
  groupHoldingsByAssetClass
} from "../lib/metrics";
import { formatCurrency, formatPercent, formatRatio } from "../lib/format";
import { BarChart } from "../components/charts/BarChart";
import { AreaChart } from "../components/charts/AreaChart";
import { DonutChart } from "../components/charts/DonutChart";

const Dashboard = () => {
  const { categories, transactions, holdings, settings, loading, error } =
    usePortfolioData();
  const currency = settings?.base_currency ?? "EUR";
  const netWorth = calculateNetWorth(holdings, transactions);
  const savingsRate = calculateSavingsRate(transactions);
  const burnRate = calculateMonthlyBurnRate(transactions, categories);
  const runway = burnRate > 0 ? (settings?.emergency_fund ?? 0) / burnRate : 0;
  const roi = calculateRoi(holdings);
  const cagr = calculateCagr(holdings);
  const peRatio = calculatePeRatio(holdings);

  const cashflowSeries = buildMonthlySeries(transactions, 6);
  const portfolioSeries = buildPortfolioSeries(holdings, 12);
  const allocation = groupHoldingsByAssetClass(holdings);
  const expenseMix = groupExpensesByCategory(transactions, categories).slice(0, 6);

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
          <span className="stat-value">{formatCurrency(netWorth, currency)}</span>
          <span className="stat-trend">Valore patrimoniale totale</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Savings Rate</span>
          <span className="stat-value">{formatPercent(savingsRate)}</span>
          <span className="stat-trend">(Entrate - Uscite) / Entrate</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Burn Rate Mensile</span>
          <span className="stat-value">{formatCurrency(burnRate, currency)}</span>
          <span className="stat-trend">Spese fisse ultime 4 settimane</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Runway</span>
          <span className="stat-value">
            {runway > 0 ? `${formatRatio(runway)} mesi` : "N/D"}
          </span>
          <span className="stat-trend">Copertura fondo emergenza</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">ROI</span>
          <span className="stat-value">{formatPercent(roi)}</span>
          <span className="stat-trend">Rendimento totale holdings</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">CAGR + P/E</span>
          <span className="stat-value">
            {formatPercent(cagr)} | {formatRatio(peRatio)}
          </span>
          <span className="stat-trend">Crescita annua + multipli</span>
        </div>
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
            <strong>Asset Allocation</strong>
            <p className="section-subtitle">Distribuzione percentuale attuale</p>
          </div>
          <DonutChart data={allocation} />
        </div>
        <div className="chart-card">
          <div>
            <strong>Top Spese</strong>
            <p className="section-subtitle">Categorie piu rilevanti</p>
          </div>
          {expenseMix.length > 0 ? (
            <div className="grid-2">
              {expenseMix.map((item) => (
                <div className="stat-card" key={item.label}>
                  <span className="stat-label">{item.label}</span>
                  <span className="stat-value">
                    {formatCurrency(item.value, currency)}
                  </span>
                  <span className="stat-trend">Totale uscita</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Nessuna spesa registrata.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
