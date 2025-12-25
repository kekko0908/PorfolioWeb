import type { Category, Holding, MonthlyPoint, Transaction } from "../types";

const toNumber = (value: number | null | undefined) => (value ? value : 0);

export const sumHoldingsValue = (holdings: Holding[]) =>
  holdings.reduce((sum, item) => sum + toNumber(item.current_value), 0);

export const sumHoldingsCost = (holdings: Holding[]) =>
  holdings.reduce((sum, item) => sum + toNumber(item.cost_basis), 0);

export const calculateRoi = (holdings: Holding[]) => {
  const cost = sumHoldingsCost(holdings);
  if (cost === 0) return 0;
  return (sumHoldingsValue(holdings) - cost) / cost;
};

export const calculateCagr = (holdings: Holding[]) => {
  let weighted = 0;
  let totalWeight = 0;
  const now = new Date();

  holdings.forEach((holding) => {
    const cost = toNumber(holding.cost_basis);
    const current = toNumber(holding.current_value);
    if (cost <= 0 || current <= 0) return;
    const start = new Date(holding.start_date);
    const years = (now.getTime() - start.getTime()) / (365 * 24 * 60 * 60 * 1000);
    if (years <= 0) return;
    const cagr = Math.pow(current / cost, 1 / years) - 1;
    weighted += cagr * cost;
    totalWeight += cost;
  });

  if (totalWeight === 0) return 0;
  return weighted / totalWeight;
};

export const calculatePeRatio = (holdings: Holding[]) => {
  const valid = holdings.filter(
    (holding) => holding.pe_ratio !== null && holding.pe_ratio !== undefined
  );
  if (valid.length === 0) return 0;
  const total = valid.reduce((sum, holding) => sum + (holding.pe_ratio ?? 0), 0);
  return total / valid.length;
};

export const calculateCashBalance = (transactions: Transaction[]) =>
  transactions.reduce(
    (sum, item) => sum + (item.flow === "in" ? item.amount : -item.amount),
    0
  );

export const calculateSavingsRate = (transactions: Transaction[]) => {
  const income = transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
  if (income === 0) return 0;
  const expense = transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
  return (income - expense) / income;
};

export const calculateMonthlyBurnRate = (
  transactions: Transaction[],
  categories: Category[]
) => {
  const fixedCategoryIds = new Set(
    categories.filter((category) => category.is_fixed).map((category) => category.id)
  );
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return transactions
    .filter(
      (item) =>
        item.type === "expense" &&
        fixedCategoryIds.has(item.category_id) &&
        new Date(item.date) >= last30
    )
    .reduce((sum, item) => sum + item.amount, 0);
};

export const calculateNetWorth = (
  holdings: Holding[],
  transactions: Transaction[]
) => sumHoldingsValue(holdings) + calculateCashBalance(transactions);

const monthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}`;

const formatMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat("it-IT", {
    month: "short",
    year: "2-digit"
  }).format(date);

export const buildMonthlySeries = (
  transactions: Transaction[],
  months = 6
): MonthlyPoint[] => {
  const series: MonthlyPoint[] = [];
  const keyed = new Map<string, MonthlyPoint>();
  const now = new Date();

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const point = {
      label: formatMonthLabel(date),
      value: 0,
      income: 0,
      expense: 0
    };
    series.push(point);
    keyed.set(monthKey(date), point);
  }

  transactions.forEach((item) => {
    const target = keyed.get(monthKey(new Date(item.date)));
    if (!target) return;
    if (item.type === "income") {
      target.income += item.amount;
      target.value += item.amount;
    } else if (item.type === "expense") {
      target.expense += item.amount;
      target.value -= item.amount;
    } else {
      target.value += item.flow === "in" ? item.amount : -item.amount;
    }
  });

  return series;
};

export const buildPortfolioSeries = (
  holdings: Holding[],
  months = 12
): MonthlyPoint[] => {
  const series: MonthlyPoint[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    series.push({
      label: formatMonthLabel(date),
      value: 0,
      income: 0,
      expense: 0
    });
  }

  series.forEach((point, index) => {
    const currentDate = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);
    holdings.forEach((holding) => {
      const startDate = new Date(holding.start_date);
      const totalMonths =
        (now.getFullYear() - startDate.getFullYear()) * 12 +
        (now.getMonth() - startDate.getMonth());
      if (totalMonths <= 0) {
        if (index === series.length - 1) {
          point.value += holding.current_value;
        }
        return;
      }
      const elapsedMonths =
        (currentDate.getFullYear() - startDate.getFullYear()) * 12 +
        (currentDate.getMonth() - startDate.getMonth());
      if (elapsedMonths < 0) return;
      const progress = Math.min(elapsedMonths / totalMonths, 1);
      const value = holding.cost_basis + (holding.current_value - holding.cost_basis) * progress;
      point.value += value;
    });
  });

  return series;
};

export const groupExpensesByCategory = (
  transactions: Transaction[],
  categories: Category[]
) => {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, number>();

  transactions
    .filter((item) => item.type === "expense")
    .forEach((item) => {
      const name = categoryMap.get(item.category_id)?.name ?? "Altro";
      totals.set(name, (totals.get(name) ?? 0) + item.amount);
    });

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
};

export const groupHoldingsByAssetClass = (holdings: Holding[]) => {
  const totals = new Map<string, number>();
  holdings.forEach((holding) => {
    const key = holding.asset_class || "Altro";
    totals.set(key, (totals.get(key) ?? 0) + holding.current_value);
  });
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
};
