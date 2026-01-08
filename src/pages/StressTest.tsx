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
  shape: "slow-bleed" | "shock" | "slump";
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
    ],
    shape: "slow-bleed"
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
    ],
    shape: "shock"
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
    ],
    shape: "slump"
  }
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash);
};

const createRng = (seed: number) => {
  let t = seed || 1;
  return () => {
    t += 0x6d2b79f5;
    let result = Math.imul(t ^ (t >>> 15), 1 | t);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

const buildNoise = (seed: number, steps: number) => {
  const rng = createRng(seed);
  return Array.from({ length: steps }, () => rng() * 2 - 1);
};

const buildStressCurve = (steps: number, shape: Scenario["shape"]) => {
  const curve: number[] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1 || 1);
    let value = 0;
    if (shape === "shock") {
      if (t <= 0.25) {
        value = lerp(0, 1, t / 0.25);
      } else if (t <= 0.7) {
        value = lerp(1, 0.55, (t - 0.25) / 0.45);
      } else {
        value = lerp(0.55, 0.45, (t - 0.7) / 0.3);
      }
      if (t >= 0.5 && t <= 0.65) {
        value += 0.08 * Math.sin(((t - 0.5) / 0.15) * Math.PI);
      }
    } else if (shape === "slump") {
      if (t <= 0.4) {
        value = lerp(0, 1, t / 0.4);
      } else if (t <= 0.8) {
        value = lerp(1, 0.9, (t - 0.4) / 0.4);
      } else {
        value = lerp(0.9, 0.8, (t - 0.8) / 0.2);
      }
    } else {
      if (t <= 0.7) {
        value = lerp(0, 1, t / 0.7);
      } else {
        value = lerp(1, 0.7, (t - 0.7) / 0.3);
      }
    }
    curve.push(clamp(value, 0, 1.1));
  }
  return curve;
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

  const portfolioVolatility = useMemo(() => {
    const volatilityByClass: Record<string, number> = {
      Cash: 0.02,
      ETF: 0.12,
      Azioni: 0.2,
      Obbligazioni: 0.08,
      Crypto: 0.4,
      Oro: 0.1,
      "Real Estate": 0.18,
      "Private Equity": 0.22,
      Altro: 0.14
    };
    return Array.from(allocationWeights.entries()).reduce((sum, [label, weight]) => {
      const volatility = volatilityByClass[label] ?? 0.14;
      return sum + weight * volatility;
    }, 0.12);
  }, [allocationWeights]);

  const stressSeries = useMemo(() => {
    const labels = Array.from({ length: 12 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() + index);
      return new Intl.DateTimeFormat("it-IT", { month: "short" }).format(date);
    });
    return scenarios.map((scenario) => {
      const portfolioShock = Array.from(allocationWeights.entries()).reduce(
        (sum, [label, weight]) => {
          const shock =
            scenario.shocks[label] ?? scenario.shocks.Altro ?? scenario.benchmarkShock;
          return sum + weight * shock;
        },
        0
      );
      const seedInput = Array.from(allocationWeights.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, weight]) => `${label}:${weight.toFixed(3)}`)
        .join("|");
      const seed = hashString(`${scenario.id}|${seedInput}`);
      const curve = buildStressCurve(labels.length, scenario.shape);
      const benchmarkNoise = buildNoise(seed + 11, labels.length);
      const portfolioNoise = buildNoise(seed + 29, labels.length);
      const benchmarkWiggle = 0.04;
      const portfolioWiggle = clamp(0.06 + portfolioVolatility * 0.35, 0.08, 0.2);
      const data = labels.map((label, index) => {
        const base = curve[index];
        const benchmarkFactor = clamp(
          base * (1 + benchmarkNoise[index] * benchmarkWiggle),
          0,
          1.15
        );
        const portfolioFactor = clamp(
          base * (1 + portfolioNoise[index] * portfolioWiggle),
          0,
          1.2
        );
        return {
          label,
          benchmark: scenario.benchmarkShock * benchmarkFactor,
          portfolio: portfolioShock * portfolioFactor
        };
      });
      return {
        scenario,
        portfolioShock,
        data
      };
    });
  }, [allocationWeights, portfolioVolatility]);

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
