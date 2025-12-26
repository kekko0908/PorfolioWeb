import { useMemo } from "react";
import { usePortfolioData } from "../hooks/usePortfolioData";
import { buildAccountBalances, groupHoldingsByAssetClass } from "../lib/metrics";
import { WaveChart } from "../components/charts/WaveChart";

type Scenario = {
  id: string;
  title: string;
  description: string;
  benchmarkShock: number;
  shocks: Record<string, number>;
  advice: string[];
};

const scenarios: Scenario[] = [
  {
    id: "inflation-euro",
    title: "Inflazione Euro + energia",
    description: "Aumento prezzi energia e inflazione persistente in area Euro.",
    benchmarkShock: -12,
    shocks: {
      Cash: -3,
      ETF: -8,
      Azioni: -10,
      Obbligazioni: -14,
      Crypto: -18,
      Oro: 6,
      "Real Estate": -7,
      "Private Equity": -12,
      Altro: -6
    },
    advice: [
      "Aumenta exposure a oro/commodity difensive.",
      "Valuta ETF inflation-linked o indicizzati.",
      "Riduci duration obbligazionaria."
    ]
  },
  {
    id: "rate-hike",
    title: "Rialzo tassi aggressivo",
    description: "Tassi in salita, compressione multipli e credito piu caro.",
    benchmarkShock: -16,
    shocks: {
      Cash: 1,
      ETF: -12,
      Azioni: -15,
      Obbligazioni: -10,
      Crypto: -22,
      Oro: 2,
      "Real Estate": -12,
      "Private Equity": -15,
      Altro: -8
    },
    advice: [
      "Favorisci cash e strumenti a breve durata.",
      "Ribilancia verso quality e low leverage.",
      "Riduci asset ad alta volatilita."
    ]
  },
  {
    id: "global-slowdown",
    title: "Rallentamento globale + USD forte",
    description: "Domanda in calo, export sotto pressione, dollaro dominante.",
    benchmarkShock: -18,
    shocks: {
      Cash: 0,
      ETF: -14,
      Azioni: -18,
      Obbligazioni: -6,
      Crypto: -25,
      Oro: 4,
      "Real Estate": -10,
      "Private Equity": -18,
      Altro: -9
    },
    advice: [
      "Proteggi equity con asset decorrelati.",
      "Mantieni liquidita per opportunita.",
      "Diversifica esposizione geografica."
    ]
  }
];

const buildWave = (labelCount: number) => {
  const points: number[] = [];
  for (let i = 0; i < labelCount; i += 1) {
    const t = i / (labelCount - 1 || 1);
    const wave = Math.sin(Math.PI * t);
    points.push(wave);
  }
  return points;
};

const StressTest = () => {
  const { accounts, transactions, holdings, loading, error } = usePortfolioData();
  const accountBalances = useMemo(
    () => buildAccountBalances(accounts, transactions),
    [accounts, transactions]
  );

  const cashTotal = accountBalances.reduce((sum, item) => sum + item.balance, 0);
  const allocationBase = groupHoldingsByAssetClass(holdings);
  const holdingsTotal = allocationBase.reduce((sum, item) => sum + item.value, 0);
  const portfolioTotal = holdingsTotal + cashTotal;

  const allocationWeights = useMemo(() => {
    const weights = new Map<string, number>();
    allocationBase.forEach((item) => {
      weights.set(item.label, portfolioTotal > 0 ? item.value / portfolioTotal : 0);
    });
    if (cashTotal > 0) {
      weights.set("Cash", portfolioTotal > 0 ? cashTotal / portfolioTotal : 0);
    }
    return weights;
  }, [allocationBase, cashTotal, portfolioTotal]);

  const stressSeries = useMemo(() => {
    const labels = Array.from({ length: 12 }, (_, index) => `M${index + 1}`);
    const wave = buildWave(labels.length);
    return scenarios.map((scenario) => {
      const portfolioShock = Array.from(allocationWeights.entries()).reduce(
        (sum, [label, weight]) => {
          const shock =
            scenario.shocks[label] ?? scenario.shocks.Altro ?? scenario.benchmarkShock;
          return sum + weight * shock;
        },
        0
      );
      const data = labels.map((label, index) => ({
        label,
        benchmark: scenario.benchmarkShock * wave[index],
        portfolio: portfolioShock * wave[index]
      }));
      return {
        scenario,
        portfolioShock,
        data
      };
    });
  }, [allocationWeights]);

  if (loading) {
    return <div className="card">Caricamento stress test...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2 className="section-title">Stress Test</h2>
          <p className="section-subtitle">
            Simulazioni realistiche con benchmark vs portafoglio.
          </p>
        </div>
      </div>

      <div className="stress-grid">
        {stressSeries.map(({ scenario, portfolioShock, data }) => (
          <div className="card stress-card" key={scenario.id}>
            <div className="stress-header">
              <div>
                <strong>{scenario.title}</strong>
                <p className="section-subtitle">{scenario.description}</p>
              </div>
              <div className="stress-metrics">
                <span className="tag">
                  Benchmark: {scenario.benchmarkShock.toFixed(1)}%
                </span>
                <span className="tag">
                  Portafoglio: {portfolioShock.toFixed(1)}%
                </span>
              </div>
            </div>
            <WaveChart data={data} />
            <div className="stress-advice">
              {scenario.advice.map((item) => (
                <span className="chip" key={item}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StressTest;
