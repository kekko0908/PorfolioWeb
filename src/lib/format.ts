import type { Currency } from "../types";

export const formatCurrency = (value: number, currency: Currency) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);

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
