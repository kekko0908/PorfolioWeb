import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  buildMonthlySeries,
  calculateCagr,
  calculateNetWorth,
  calculatePeRatio,
  calculateRoi,
  calculateSavingsRate,
  groupExpensesByCategory,
  groupHoldingsByAssetClass
} from "../lib/metrics";
import { formatCurrency, formatPercent, formatRatio } from "../lib/format";
import { BarChart } from "../components/charts/BarChart";
import { DonutChart } from "../components/charts/DonutChart";
import { AreaChart } from "../components/charts/AreaChart";

const Analytics = () => {
  const { categories, transactions, holdings, settings, loading, error } =
    usePortfolioData();
  const currency = settings?.base_currency ?? "EUR";

  const roi = calculateRoi(holdings);
  const cagr = calculateCagr(holdings);
  const peRatio = calculatePeRatio(holdings);
  const savingsRate = calculateSavingsRate(transactions);
  const netWorth = calculateNetWorth(holdings, transactions);

  const cashflowSeries = buildMonthlySeries(transactions, 12);
  const allocation = groupHoldingsByAssetClass(holdings);
  const expenseMix = groupExpensesByCategory(transactions, categories);

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
          <span className="stat-value">{formatPercent(roi)}</span>
          <span className="stat-trend">Rendimento totale</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">CAGR</span>
          <span className="stat-value">{formatPercent(cagr)}</span>
          <span className="stat-trend">Crescita annua composta</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">P/E Ratio medio</span>
          <span className="stat-value">{formatRatio(peRatio)}</span>
          <span className="stat-trend">Multiplo medio holdings</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Savings Rate</span>
          <span className="stat-value">{formatPercent(savingsRate)}</span>
          <span className="stat-trend">Capitale trattenuto</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Net Worth</span>
          <span className="stat-value">{formatCurrency(netWorth, currency)}</span>
          <span className="stat-trend">Patrimonio netto</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="chart-card">
          <div>
            <strong>Cash Flow 12 mesi</strong>
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
            <strong>Asset Allocation</strong>
            <p className="section-subtitle">Classi di asset a confronto</p>
          </div>
          <DonutChart data={allocation} />
        </div>
        <div className="chart-card">
          <div>
            <strong>Spese per categoria</strong>
            <p className="section-subtitle">Distribuzione uscite</p>
          </div>
          {expenseMix.length > 0 ? (
            <div className="grid-2">
              {expenseMix.map((item) => (
                <div className="stat-card" key={item.label}>
                  <span className="stat-label">{item.label}</span>
                  <span className="stat-value">{formatCurrency(item.value, currency)}</span>
                  <span className="stat-trend">Totale periodo</span>
                </div>
              ))}
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
