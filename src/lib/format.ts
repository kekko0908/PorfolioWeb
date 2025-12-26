import type { Currency } from "../types";

export const formatCurrency = (value: number, currency: Currency) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);

export const formatCurrencySafe = (value: number, currency: Currency) => {
  if (!Number.isFinite(value)) return "N/D";
  return formatCurrency(value, currency);
};

export const formatCompact = (value: number) =>
  new Intl.NumberFormat("it-IT", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);

export const formatPercent = (value: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value);

export const formatPercentSafe = (value: number, maxAbs = 9.99) => {
  if (!Number.isFinite(value)) return "N/D";
  if (Math.abs(value) > maxAbs) return "N/D";
  return formatPercent(value);
};

export const formatRatio = (value: number) =>
  new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 2
  }).format(value);

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
