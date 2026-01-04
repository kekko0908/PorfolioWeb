import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  createHolding,
  deleteHolding,
  fetchAllocationTargets,
  replaceAllocationTargets,
  updateHolding,
  updateHoldingsOrder,
  upsertSettings
} from "../lib/api";
import { DonutChart } from "../components/charts/DonutChart";
import {
  formatCurrency,
  formatCurrencySafe,
  formatPercentSafe
} from "../lib/format";
import {
  buildAccountBalances,
  calculateMonthlyBurnRate,
  resolveEmergencyFundBalance
} from "../lib/metrics";
import { fetchMarketPrices } from "../lib/market";
import type { Holding } from "../types";

type AllocationTargetItem = {
  key: string;
  label: string;
  pct: number;
  kind: "reserve" | "asset";
};

type AllocationCap = {
  mode: "rel" | "set" | "off" | "burn";
  value: string;
  pct: string;
};

const parseNumberInput = (value: string) => {
  if (!value) return Number.NaN;
  return Number(value.trim().replace(",", "."));
};

const assetClasses = [
  "Azioni",
  "ETF",
  "Obbligazioni",
  "Crypto",
  "Oro",
  "Real Estate",
  "Liquidita",
  "Private Equity",
  "Altro"
];

const investmentOnlyLabels = new Set(["ETF", "Obbligazioni"]);

const emptyForm = {
  name: "",
  asset_class: "ETF",
  emoji: "",
  quantity: "",
  avg_cost: "",
  current_value: "",
  currency: "EUR",
  start_date: "",
  note: ""
};

const Portfolio = () => {
  const { session } = useAuth();
  const { accounts, categories, transactions, holdings, settings, refresh, loading, error } =
    usePortfolioData();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [priceMessage, setPriceMessage] = useState<string | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketMessage, setMarketMessage] = useState<string | null>(null);
  const autoMarketAttemptedRef = useRef<Set<string>>(new Set());
  const [allocationMessage, setAllocationMessage] = useState<string | null>(null);
  const [targetMessage, setTargetMessage] = useState<string | null>(null);
  const [targetDrafts, setTargetDrafts] = useState<Record<string, number>>({});
  const [allocationView, setAllocationView] = useState<"general" | "investment">(
    "general"
  );
  const [investmentTargets, setInvestmentTargets] = useState({
    etf: 80,
    bonds: 20
  });
  const [allocationCaps, setAllocationCaps] = useState<Record<string, AllocationCap>>({
    cash: { mode: "rel", value: "", pct: "" }
  });
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const autoSaveReadyRef = useRef(false);
  const [capsModalOpen, setCapsModalOpen] = useState(false);
  const [investmentFocusTarget, setInvestmentFocusTarget] = useState<string | null>(
    null
  );
  const [investmentFocusCurrent, setInvestmentFocusCurrent] = useState<string | null>(
    null
  );
  const [tradeHolding, setTradeHolding] = useState<Holding | null>(null);
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tradeForm, setTradeForm] = useState({
    quantity: "",
    price: "",
    fees: ""
  });
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [allocationTargetsLoaded, setAllocationTargetsLoaded] = useState(false);
  const [emergencyFundMonths, setEmergencyFundMonths] = useState(6);
  const [allocationTargetItems, setAllocationTargetItems] = useState<
    AllocationTargetItem[]
  >([
    { key: "cash", label: "Cash", pct: 20, kind: "reserve" },
    { key: "investments", label: "Asset Investimento", pct: 70, kind: "asset" },
    { key: "emergency", label: "Fondo emergenza", pct: 10, kind: "reserve" }
  ]);
  const [addTargetOpen, setAddTargetOpen] = useState(false);
  const [newTargetKey, setNewTargetKey] = useState("");
  const [allocationColors, setAllocationColors] = useState<Record<string, string>>({
    Cash: "#22c55e",
    ETF: "#ef4444",
    Obbligazioni: "#f59e0b",
    "Fondo emergenza": "#60a5fa",
    "Asset Investimento": "#38bdf8",
    Crypto: "#14b8a6"
  });

  const currency = settings?.base_currency ?? "EUR";
  const isCash = form.asset_class === "Liquidita";
  const cashCapValue = useMemo(() => {
    const cashCap = allocationCaps.cash;
    if (!cashCap || cashCap.mode !== "set" || !cashCap.value.trim()) return null;
    const parsed = parseNumberInput(cashCap.value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }, [allocationCaps]);

  useEffect(() => {
    if (!settings) return;
    setEmergencyFundMonths(settings.emergency_fund_months ?? 6);
    if (!allocationTargetsLoaded) {
      setAllocationTargetItems((prev) => {
        const next = [...prev];
        const upsert = (item: AllocationTargetItem) => {
          const index = next.findIndex((existing) => existing.key === item.key);
          if (index === -1) next.push(item);
          else next[index] = { ...next[index], ...item };
        };

        upsert({
          key: "cash",
          label: "Cash",
          pct: settings.target_cash_pct ?? 20,
          kind: "reserve"
        });
        upsert({
          key: "emergency",
          label: "Fondo emergenza",
          pct: settings.target_emergency_pct ?? 10,
          kind: "reserve"
        });
        if (!next.some((item) => item.key === "investments")) {
          next.push({
            key: "investments",
            label: "Asset Investimento",
            pct: 70,
            kind: "asset"
          });
        }
        return next;
      });
    }
    setAllocationCaps((prev) => {
      const next = { ...prev };
      const hasCashTarget =
        settings.cash_target_cap !== null && settings.cash_target_cap !== undefined;
      if (hasCashTarget) {
        next.cash = {
          mode: "set",
          value: String(settings.cash_target_cap),
          pct: prev.cash?.pct ?? ""
        };
      } else if (!next.cash) {
        next.cash = { mode: "rel", value: "", pct: "" };
      }
      return next;
    });

    const clampPct = (value: number) => Math.max(0, Math.min(100, value));
    const etfRaw = settings.target_etf_pct ?? 80;
    const bondRaw = settings.target_bond_pct ?? 20;
    const etfClamped = clampPct(etfRaw);
    const bondClamped = clampPct(bondRaw);
    const total = etfClamped + bondClamped;
    const normalizedEtf = total > 0 ? (etfClamped / total) * 100 : 80;
    const normalizedBonds = 100 - normalizedEtf;
    setInvestmentTargets({
      etf: Number(normalizedEtf.toFixed(1)),
      bonds: Number(normalizedBonds.toFixed(1))
    });
  }, [settings]);

  useEffect(() => {
    if (allocationView === "general") {
      setInvestmentFocusTarget(null);
      setInvestmentFocusCurrent(null);
    }
  }, [allocationView]);

  useEffect(() => {
    if (!session || allocationTargetsLoaded) return;
    let cancelled = false;
    const localKey = "portfolio_allocation_targets_v1";

    const hydrateFromStorage = (
      stored: unknown
    ):
      | {
          items: AllocationTargetItem[];
          colors?: Record<string, string>;
          caps?: Record<string, AllocationCap>;
          emergencyFundMonths?: number;
        }
      | null => {
      if (!stored || typeof stored !== "string") return null;
      try {
        const parsed = JSON.parse(stored) as {
          items?: AllocationTargetItem[];
          colors?: Record<string, string>;
          caps?: Record<string, AllocationCap>;
          emergencyFundMonths?: number;
        };
        if (!Array.isArray(parsed.items)) return null;
        return {
          items: parsed.items,
          colors: parsed.colors,
          caps: parsed.caps,
          emergencyFundMonths: parsed.emergencyFundMonths
        };
      } catch {
        return null;
      }
    };

    const normalizeCaps = (
      caps?: Record<string, AllocationCap | { enabled?: boolean; value?: string; pct?: string }>
    ) => {
      if (!caps) return undefined;
      const next: Record<string, AllocationCap> = {};
      const isLegacyCap = (
        value: AllocationCap | { enabled?: boolean; value?: string; pct?: string }
      ): value is { enabled?: boolean; value?: string; pct?: string } =>
        typeof value === "object" && value !== null && "enabled" in value;
      Object.entries(caps).forEach(([key, cap]) => {
        const rawMode = (cap as AllocationCap)?.mode;
        const rawValue = typeof cap?.value === "string" ? cap.value : "";
        const parsedValue = parseNumberInput(rawValue);
        const hasValue = rawValue.trim() !== "" && Number.isFinite(parsedValue);
        const legacyEnabled = isLegacyCap(cap) && Boolean(cap.enabled);
        const mode =
          rawMode === "set" || rawMode === "off" || rawMode === "rel" || rawMode === "burn"
            ? rawMode
            : legacyEnabled && hasValue
              ? "set"
              : "rel";
        next[key] = {
          mode,
          value: rawValue,
          pct: typeof cap?.pct === "string" ? cap.pct : ""
        };
      });
      return next;
    };

    const normalizeTargets = (
      items: AllocationTargetItem[]
    ): AllocationTargetItem[] => {
      const legacyInvestmentPct = items.reduce((sum, item) => {
        if (item.key === "ETF" || item.key === "Obbligazioni") {
          return sum + (Number.isFinite(item.pct) ? item.pct : 0);
        }
        return sum;
      }, 0);

      const rawInvestment = items.find(
        (item) => item.key === "investments" || item.label === "Asset Investimento"
      );
      const investmentItem: AllocationTargetItem = rawInvestment
        ? {
            ...rawInvestment,
            key: "investments",
            label: "Asset Investimento",
            kind: "asset"
          }
        : {
            key: "investments",
            label: "Asset Investimento",
            pct: legacyInvestmentPct > 0 ? legacyInvestmentPct : 70,
            kind: "asset"
          };

      const normalized = items
        .filter(
          (item) =>
            item.key !== "ETF" &&
            item.key !== "Obbligazioni" &&
            item.key !== "investments" &&
            item.label !== "Asset Investimento"
        )
        .map(
          (item): AllocationTargetItem => ({
            ...item,
            kind: item.key === "cash" || item.key === "emergency" ? "reserve" : "asset"
          })
        );

      const cashItem =
        normalized.find((item) => item.key === "cash") ??
        ({
          key: "cash",
          label: "Cash",
          pct: 20,
          kind: "reserve"
        } as AllocationTargetItem);

      const emergencyItem =
        normalized.find((item) => item.key === "emergency") ??
        ({
          key: "emergency",
          label: "Fondo emergenza",
          pct: 10,
          kind: "reserve"
        } as AllocationTargetItem);

      const filtered = normalized.filter(
        (item) => item.key !== "cash" && item.key !== "emergency"
      );

      return [
        cashItem,
        investmentItem,
        emergencyItem,
        ...filtered.filter((item) => item.key !== investmentItem.key)
      ];
    };

    (async () => {
      const storedTargets = await fetchAllocationTargets();
      if (cancelled) return;

      const local = hydrateFromStorage(localStorage.getItem(localKey));
      const localCaps = normalizeCaps(local?.caps);

      if (storedTargets.length > 0) {
        const normalizedTargets = normalizeTargets(
          storedTargets.map<AllocationTargetItem>((item) => ({
            key: item.key,
            label: item.label,
            pct: item.pct,
            kind: item.key === "cash" || item.key === "emergency" ? "reserve" : "asset"
          }))
        );
        setAllocationTargetItems(normalizedTargets);
        setAllocationColors((prev) => {
          const next = { ...prev };
          storedTargets.forEach((item) => {
            if (item.color) {
              next[item.label] = item.color;
            }
          });
          if (local?.colors) {
            const dbKeys = new Set(storedTargets.map((item) => item.label));
            Object.entries(local.colors).forEach(([key, value]) => {
              if (!dbKeys.has(key) && value) {
                next[key] = value;
              }
            });
          }
          return next;
        });
        if (localCaps) setAllocationCaps(localCaps);
        if (typeof local?.emergencyFundMonths === "number") {
          setEmergencyFundMonths(local.emergencyFundMonths);
        }
        setAllocationTargetsLoaded(true);
        return;
      }

      if (local?.items?.length) {
        setAllocationTargetItems(normalizeTargets(local.items));
        if (local.colors) {
          setAllocationColors((prev) => ({ ...prev, ...local.colors }));
        }
        if (localCaps) setAllocationCaps(localCaps);
        if (typeof local.emergencyFundMonths === "number") {
          setEmergencyFundMonths(local.emergencyFundMonths);
        }
        setAllocationTargetsLoaded(true);
        return;
      }

      if (localCaps) setAllocationCaps(localCaps);
      if (typeof local?.emergencyFundMonths === "number") {
        setEmergencyFundMonths(local.emergencyFundMonths);
      }
      setAllocationTargetsLoaded(true);
    })().catch(() => {
      setAllocationTargetsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [allocationTargetsLoaded, session]);

  useEffect(() => {
    setAllocationCaps((prev) => {
      const next = { ...prev };
      const allowedKeys = new Set(allocationTargetItems.map((item) => item.key));
      allocationTargetItems.forEach((item) => {
        if (!next[item.key]) {
          next[item.key] = { mode: "rel", value: "", pct: "" };
          return;
        }
        if (
          next[item.key].mode !== "rel" &&
          next[item.key].mode !== "set" &&
          next[item.key].mode !== "off" &&
          next[item.key].mode !== "burn"
        ) {
          next[item.key].mode = "rel";
        }
        if (typeof next[item.key].value !== "string") {
          next[item.key].value = "";
        }
        if (typeof next[item.key].pct !== "string") {
          next[item.key].pct = "";
        }
      });
      Object.keys(next).forEach((key) => {
        if (!allowedKeys.has(key)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [allocationTargetItems]);

  useEffect(() => {
    setTargetDrafts((prev) => {
      const validIds = new Set(holdings.map((item) => item.id));
      const next: Record<string, number> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validIds.has(key)) next[key] = value;
      });
      return next;
    });
  }, [holdings]);

  const allocationPctByKey = useMemo(() => {
    const map = new Map<string, number>();
    allocationTargetItems.forEach((item) => map.set(item.key, item.pct));
    return map;
  }, [allocationTargetItems]);

  const extractTicker = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return "";
    const match = trimmed.match(/^[A-Za-z0-9:._-]+/);
    return (match?.[0] ?? "").toUpperCase();
  };

  const formatHoldingLabel = (item: Holding) =>
    `${item.emoji ? `${item.emoji} ` : ""}${item.name}`;
  const formatQuantity = (value: number) =>
    new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 }).format(
      Number.isFinite(value) ? value : 0
    );

  const resetForm = () => {
    setForm({ ...emptyForm, currency });
    setEditing(null);
  };

  const closeEdit = () => {
    resetForm();
    setMessage(null);
    setPriceMessage(null);
  };

  const totalCap = useMemo(() => {
    if (isCash) {
      const current = Number(form.current_value);
      return Number.isFinite(current) ? current : 0;
    }
    const quantity = Number(form.quantity);
    const avgCost = Number(form.avg_cost);
    if (!Number.isFinite(quantity) || !Number.isFinite(avgCost)) return 0;
    return quantity * avgCost;
  }, [form.quantity, form.avg_cost, form.current_value, isCash]);

  const maxSortOrder = useMemo(
    () => holdings.reduce((max, item) => Math.max(max, item.sort_order ?? 0), 0),
    [holdings]
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setTargetMessage(null);
    let customMessage: string | null = null;
    const currentValue = Number(form.current_value);
    const quantity = isCash ? 1 : Number(form.quantity);
    const avgCost = isCash ? currentValue : Number(form.avg_cost);
    const ticker = extractTicker(form.name);
    const basePayload = {
      name: form.name,
      asset_class: form.asset_class,
      emoji: form.emoji.trim() || null,
      target_pct: editing?.target_pct ?? null,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      avg_cost: Number.isFinite(avgCost) ? avgCost : 0,
      total_cap: Number.isFinite(totalCap) ? totalCap : 0,
      current_value: Number.isFinite(currentValue) ? currentValue : 0,
      currency: form.currency as "EUR" | "USD",
      start_date: form.start_date,
      note: form.note || null
    };

    try {
      if (editing) {
        await updateHolding(editing.id, {
          ...basePayload,
          sort_order: editing.sort_order ?? null
        });
      } else {
        const match =
          !isCash && ticker
            ? holdings.find(
                (item) =>
                  extractTicker(item.name) === ticker &&
                  item.asset_class === form.asset_class
              )
            : null;
        if (match) {
          if (match.currency !== basePayload.currency) {
            setMessage(
              "Ticker gia presente con valuta diversa. Aggiorna la holding esistente."
            );
            return;
          }
          const newQuantity = match.quantity + (Number.isFinite(quantity) ? quantity : 0);
          const newTotalCap =
            match.total_cap + (Number.isFinite(totalCap) ? totalCap : 0);
          const avgUnitPrice =
            quantity > 0 && Number.isFinite(currentValue) && currentValue > 0
              ? currentValue / quantity
              : match.quantity > 0
                ? match.current_value / match.quantity
                : 0;
          const newCurrentValue =
            avgUnitPrice > 0
              ? avgUnitPrice * newQuantity
              : match.current_value + (Number.isFinite(currentValue) ? currentValue : 0);
          const newAvgCost = newQuantity > 0 ? newTotalCap / newQuantity : 0;
          const newStartDate =
            match.start_date && form.start_date
              ? match.start_date < form.start_date
                ? match.start_date
                : form.start_date
              : match.start_date || form.start_date;

          await updateHolding(match.id, {
            name: match.name,
            asset_class: match.asset_class,
            emoji: basePayload.emoji ?? match.emoji,
            target_pct: match.target_pct ?? null,
            quantity: newQuantity,
            avg_cost: newAvgCost,
            total_cap: newTotalCap,
            current_value: newCurrentValue,
            currency: basePayload.currency,
            start_date: newStartDate,
            note: basePayload.note || match.note,
            sort_order: match.sort_order ?? null
          });
          customMessage = `Holding unita a ${match.name}.`;
        } else {
          await createHolding({
            ...basePayload,
            sort_order: maxSortOrder + 10
          });
        }
      }
      await refresh();
      setMessage(customMessage ?? "Salvataggio completato.");
      resetForm();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const startEdit = (item: Holding) => {
    setEditing(item);
    setForm({
      name: item.name,
      asset_class: item.asset_class,
      emoji: item.emoji ?? "",
      quantity: String(item.quantity),
      avg_cost: String(item.avg_cost),
      current_value: String(item.current_value),
      currency: item.currency,
      start_date: item.start_date,
      note: item.note ?? ""
    });
  };

  const removeItem = async (id: string) => {
    try {
      await deleteHolding(id);
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const runMarketUpdate = useCallback(
    async (items: Holding[], notify = true) => {
      if (marketLoading) return;
      if (notify) setMarketMessage(null);
      const activeHoldings = items.filter(
        (item) =>
          item.asset_class !== "Liquidita" &&
          item.asset_class !== "Crypto" &&
          Number(item.quantity) > 0
      );
      if (activeHoldings.length === 0) {
        if (notify) setMarketMessage("Nessuna holding da aggiornare.");
        return;
      }

      const tickerMap = new Map<string, Holding[]>();
      const missingTickers: string[] = [];

      activeHoldings.forEach((item) => {
        const ticker = extractTicker(item.name);
        if (!ticker) {
          missingTickers.push(item.name);
          return;
        }
        const key = ticker.toUpperCase();
        const existing = tickerMap.get(key);
        if (existing) {
          existing.push(item);
        } else {
          tickerMap.set(key, [item]);
        }
      });

      if (tickerMap.size === 0) {
        if (notify) setMarketMessage("Nessun ticker valido trovato.");
        return;
      }

      setMarketLoading(true);
      try {
        const results = await fetchMarketPrices(Array.from(tickerMap.keys()));
        const priceByTicker = new Map<string, number>();
        const scrapeErrors: string[] = [];

        results.forEach((result) => {
          const rawTicker = typeof result.ticker === "string" ? result.ticker : "";
          const ticker = rawTicker.trim().toUpperCase();
          if (!ticker) {
            return;
          }
          const price = typeof result.price === "number" ? result.price : Number.NaN;
          if (Number.isFinite(price)) {
            priceByTicker.set(ticker, price);
          } else if (result.error) {
            scrapeErrors.push(`${ticker}: ${result.error}`);
          }
        });

        let updatedCount = 0;
        const updateErrors: string[] = [];

        for (const [ticker, itemsForTicker] of tickerMap) {
          const price = priceByTicker.get(ticker);
          if (!price) {
            updateErrors.push(`${ticker}: prezzo non trovato.`);
            continue;
          }
          for (const item of itemsForTicker) {
            const quantity = Number(item.quantity);
            const currentValue = Number.isFinite(quantity) ? price * quantity : 0;
            try {
              await updateHolding(item.id, { current_value: currentValue });
              updatedCount += 1;
            } catch (err) {
              updateErrors.push(`${ticker}: ${(err as Error).message}`);
            }
          }
        }

        if (updatedCount > 0) {
          await refresh();
        }

        if (notify || scrapeErrors.length || updateErrors.length || missingTickers.length) {
          const parts = [`Aggiornate ${updatedCount} holdings.`];
          if (missingTickers.length) {
            parts.push(`${missingTickers.length} senza ticker.`);
          }
          if (scrapeErrors.length) {
            parts.push(`${scrapeErrors.length} errori scraping.`);
          }
          if (updateErrors.length) {
            parts.push(`${updateErrors.length} errori update.`);
          }
          const detailErrors = [...scrapeErrors, ...updateErrors].slice(0, 3);
          if (detailErrors.length) {
            parts.push(`Dettagli: ${detailErrors.join(" | ")}`);
          }
          setMarketMessage(parts.join(" "));
        }
      } catch (err) {
        if (notify) setMarketMessage((err as Error).message);
      } finally {
        setMarketLoading(false);
      }
    },
    [fetchMarketPrices, marketLoading, refresh]
  );

  const handleMarketUpdate = async () => {
    await runMarketUpdate(holdings, true);
  };

  useEffect(() => {
    if (marketLoading) return;
    const autoCandidates = holdings.filter((item) => {
      if (item.asset_class === "Liquidita" || item.asset_class === "Crypto") {
        return false;
      }
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
        return false;
      }
      return !Number.isFinite(item.current_value) || item.current_value <= 0;
    });
    const pending = autoCandidates.filter(
      (item) => !autoMarketAttemptedRef.current.has(item.id)
    );
    if (pending.length === 0) return;
    pending.forEach((item) => autoMarketAttemptedRef.current.add(item.id));
    void runMarketUpdate(pending, false);
  }, [holdings, marketLoading, runMarketUpdate]);

  const openTradeModal = (item: Holding, side: "buy" | "sell") => {
    setTradeHolding(item);
    setTradeSide(side);
    setTradeForm({ quantity: "", price: "", fees: "" });
    setTradeMessage(null);
  };

  const closeTradeModal = () => {
    setTradeHolding(null);
    setTradeMessage(null);
  };

  const handleTradeSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!tradeHolding) return;
    setTradeMessage(null);

    const quantity = Number(tradeForm.quantity);
    const price = Number(tradeForm.price);
    const fees = tradeForm.fees ? Number(tradeForm.fees) : 0;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setTradeMessage("Inserisci una quantita valida.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setTradeMessage("Inserisci un prezzo valido.");
      return;
    }
    if (!Number.isFinite(fees) || fees < 0) {
      setTradeMessage("Le commissioni devono essere positive.");
      return;
    }
    if (tradeSide === "sell" && quantity > tradeHolding.quantity) {
      setTradeMessage("Quantita superiore a quella disponibile.");
      return;
    }

    const signed = tradeSide === "buy" ? 1 : -1;
    const newQuantity = tradeHolding.quantity + signed * quantity;
    const tradeValue = quantity * price + fees;
    const costReduction = tradeHolding.avg_cost * quantity;
    const newTotalCap =
      tradeSide === "buy"
        ? tradeHolding.total_cap + tradeValue
        : Math.max(tradeHolding.total_cap - costReduction, 0);
    const newAvgCost = newQuantity > 0 ? newTotalCap / newQuantity : 0;
    const newCurrentValue = newQuantity > 0 ? newQuantity * price : 0;

    setTradeLoading(true);
    try {
      await updateHolding(tradeHolding.id, {
        quantity: newQuantity,
        total_cap: newTotalCap,
        avg_cost: newAvgCost,
        current_value: newCurrentValue
      });
      await refresh();
      closeTradeModal();
    } catch (err) {
      setTradeMessage((err as Error).message);
    } finally {
      setTradeLoading(false);
    }
  };

  const handleTargetPercentChange = (key: string, value: number) => {
    if (!Number.isFinite(value)) return;
    const mode = allocationCaps[key]?.mode ?? "rel";
    if (mode !== "rel") return;
    const remainingPctTotal =
      targetTotal > 0
        ? (allocationTargetsMeta.remainingTotal / targetTotal) * 100
        : 0;
    if (remainingPctTotal <= 0) return;

    const relItems = allocationTargetItems.filter(
      (item) => (allocationCaps[item.key]?.mode ?? "rel") === "rel"
    );
    if (relItems.length <= 1) return;

    const relTotal = relItems.reduce(
      (sum, item) => sum + (Number.isFinite(item.pct) ? item.pct : 0),
      0
    );
    if (relTotal <= 0) return;

    const desiredEff = Math.max(0, Math.min(remainingPctTotal, value));
    const targetRatio = desiredEff / remainingPctTotal;
    const otherItems = relItems.filter((item) => item.key !== key);
    const otherTotal = otherItems.reduce(
      (sum, item) => sum + (Number.isFinite(item.pct) ? item.pct : 0),
      0
    );

    let newCurrentWeight = 0;
    let scale = 0;

    if (targetRatio <= 0) {
      newCurrentWeight = 0;
      scale = otherTotal > 0 ? relTotal / otherTotal : 0;
    } else if (targetRatio >= 1 || otherTotal <= 0) {
      newCurrentWeight = relTotal;
      scale = 0;
    } else {
      newCurrentWeight = targetRatio * relTotal;
      const newOtherTotal = relTotal - newCurrentWeight;
      scale = otherTotal > 0 ? newOtherTotal / otherTotal : 0;
    }

    setAllocationTargetItems((prev) =>
      prev.map((item) => {
        if ((allocationCaps[item.key]?.mode ?? "rel") !== "rel") return item;
        if (item.key === key) {
          return { ...item, pct: Number(newCurrentWeight.toFixed(1)) };
        }
        const raw = Number.isFinite(item.pct) ? item.pct : 0;
        const next = scale > 0 ? raw * scale : 0;
        return { ...item, pct: Number(next.toFixed(1)) };
      })
    );
  };

  const handleInvestmentChange = (key: "etf" | "bonds", value: number) => {
    if (!Number.isFinite(value)) return;
    const nextValue = Math.max(0, Math.min(100, value));
    setInvestmentTargets((prev) => {
      if (key === "etf") {
        return { etf: nextValue, bonds: Number((100 - nextValue).toFixed(1)) };
      }
      return { etf: Number((100 - nextValue).toFixed(1)), bonds: nextValue };
    });
  };

  const handleInvestmentTargetSelect = (label: string) => {
    if (label === "ETF" || label === "Obbligazioni") {
      setInvestmentFocusTarget(label);
    }
  };

  const handleInvestmentCurrentSelect = (label: string) => {
    if (label === "ETF" || label === "Obbligazioni") {
      setInvestmentFocusCurrent(label);
    }
  };

  useEffect(() => {
    if (!session || !allocationTargetsLoaded) return;
    const snapshot = JSON.stringify({
      allocationTargetItems,
      investmentTargets,
      allocationCaps,
      allocationColors,
      emergencyFundMonths
    });

    if (!autoSaveReadyRef.current) {
      autoSaveReadyRef.current = true;
      lastSavedRef.current = snapshot;
      return;
    }

    if (snapshot === lastSavedRef.current) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      saveAllocation(snapshot, true);
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    allocationTargetItems,
    allocationCaps,
    allocationColors,
    allocationTargetsLoaded,
    investmentTargets,
    emergencyFundMonths,
    session
  ]);

  const saveAllocation = async (snapshot?: string, silent = false) => {
    if (!session) return;
    if (!silent) setAllocationMessage(null);
    const localKey = "portfolio_allocation_targets_v1";
    const getPct = (key: string) => allocationPctByKey.get(key) ?? 0;
    try {
      await upsertSettings({
        user_id: session.user.id,
        base_currency: settings?.base_currency ?? "EUR",
        emergency_fund: emergencyFund,
        cash_target_cap: cashCapValue ?? null,
        target_cash_pct: getPct("cash"),
        target_etf_pct: investmentTargets.etf,
        target_bond_pct: investmentTargets.bonds,
        target_emergency_pct: getPct("emergency"),
        emergency_fund_months: emergencyFundMonths,
        rebalance_months: settings?.rebalance_months ?? 6
      });

      const itemsWithOrder = allocationTargetItems.map((item, index) => ({
        user_id: session.user.id,
        key: item.key,
        label: item.label,
        pct: item.pct,
        color: allocationColors[item.label] ?? null,
        sort_order: index
      }));

      const saved = await replaceAllocationTargets(itemsWithOrder);
        localStorage.setItem(
          localKey,
          JSON.stringify({
            items: allocationTargetItems,
            colors: allocationColors,
            caps: allocationCaps,
            emergencyFundMonths
          })
        );

      if (!silent) {
        await refresh();
        setAllocationMessage(
          saved
            ? "Asset allocation salvata."
            : "Asset allocation salvata in locale (tabella Supabase non trovata)."
        );
      }
      lastSavedRef.current = snapshot ?? null;
    } catch (err) {
      setAllocationMessage((err as Error).message);
    }
  };

  const sortedHoldings = useMemo(() => {
    return [...holdings].sort((a, b) => {
      const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [holdings]);

  const defaultGroupOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    sortedHoldings.forEach((item) => {
      const key = item.asset_class || "Altro";
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    });
    return order;
  }, [sortedHoldings]);

  useEffect(() => {
    setGroupOrder((prev) => {
      if (prev.length === 0) return defaultGroupOrder;
      const next = prev.filter((label) => defaultGroupOrder.includes(label));
      defaultGroupOrder.forEach((label) => {
        if (!next.includes(label)) next.push(label);
      });
      return next;
    });
  }, [defaultGroupOrder]);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        items: Holding[];
        totalCap: number;
        totalValue: number;
      }
    >();
    sortedHoldings.forEach((item) => {
      const key = item.asset_class || "Altro";
      const current = map.get(key) ?? { items: [], totalCap: 0, totalValue: 0 };
      current.items.push(item);
      current.totalCap += item.total_cap;
      current.totalValue += item.current_value;
      map.set(key, current);
    });
    const items = Array.from(map.entries()).map(([label, data]) => ({
      label,
      ...data,
      roi: data.totalCap ? (data.totalValue - data.totalCap) / data.totalCap : 0
    }));
    if (groupOrder.length === 0) return items;
    const orderIndex = new Map(groupOrder.map((label, index) => [label, index]));
    return items.sort(
      (a, b) =>
        (orderIndex.get(a.label) ?? Number.MAX_SAFE_INTEGER) -
        (orderIndex.get(b.label) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [sortedHoldings, groupOrder]);

  const persistHoldingsOrder = async (nextOrder: string[]) => {
    if (ordering) return;
    const ordered = nextOrder.flatMap((label) =>
      sortedHoldings.filter((item) => (item.asset_class || "Altro") === label)
    );
    const known = new Set(ordered.map((item) => item.id));
    const remaining = sortedHoldings.filter((item) => !known.has(item.id));
    const finalOrder = [...ordered, ...remaining];
    const updates = finalOrder.map((item, index) => ({
      id: item.id,
      sort_order: (index + 1) * 10
    }));
    try {
      setOrdering(true);
      await updateHoldingsOrder(updates);
      await refresh();
      setMessage("Ordine holdings aggiornato.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setOrdering(false);
    }
  };

  const handleGroupDrop = async (targetLabel: string) => {
    if (!draggedGroup || draggedGroup === targetLabel) return;
    const currentOrder = groupOrder.length > 0 ? [...groupOrder] : defaultGroupOrder;
    const fromIndex = currentOrder.indexOf(draggedGroup);
    const toIndex = currentOrder.indexOf(targetLabel);
    if (fromIndex === -1 || toIndex === -1) return;
    currentOrder.splice(fromIndex, 1);
    currentOrder.splice(toIndex, 0, draggedGroup);
    setGroupOrder(currentOrder);
    await persistHoldingsOrder(currentOrder);
    setDraggedGroup(null);
  };

  const accountBalances = useMemo(
    () => buildAccountBalances(accounts, transactions),
    [accounts, transactions]
  );
  const burnRate = useMemo(
    () => calculateMonthlyBurnRate(transactions, categories),
    [transactions, categories]
  );
  const emergencyFund = resolveEmergencyFundBalance(
    accountBalances,
    settings?.emergency_fund ?? 0
  );
  const creditTotal = accountBalances
    .filter((account) => account.type === "credit")
    .reduce((sum, account) => sum + account.balance, 0);
  const cashTotal = accountBalances
    .filter((account) => account.type !== "credit")
    .reduce((sum, account) => sum + account.balance, 0);
  const cashAvailable = Math.max(cashTotal - emergencyFund, 0);
  const holdingsByClass = useMemo(() => {
    const map = new Map<string, number>();
    holdings.forEach((item) => {
      const key = item.asset_class || "Altro";
      map.set(key, (map.get(key) ?? 0) + item.current_value);
    });
    return map;
  }, [holdings]);
  const etfValue = holdingsByClass.get("ETF") ?? 0;
  const bondValue = holdingsByClass.get("Obbligazioni") ?? 0;
  const cryptoValue = holdingsByClass.get("Crypto") ?? 0;
  const holdingsTotal = Array.from(holdingsByClass.values()).reduce((sum, value) => sum + value, 0);
  const allocationTotal = cashAvailable + emergencyFund + holdingsTotal;
  const targetTotal = allocationTotal > 0 ? allocationTotal : 0;
  const investmentTotalCurrent = Math.max(holdingsTotal - cryptoValue, 0);
  const generalCurrentData = [
    { label: "Cash", value: cashAvailable },
    { label: "Fondo emergenza", value: emergencyFund },
    { label: "Crypto", value: cryptoValue },
    { label: "Asset Investimento", value: investmentTotalCurrent }
  ].filter((item) => Number.isFinite(item.value) && item.value > 0);
  const allocationTargetsMeta = useMemo(() => {
    const currentByKey = new Map<string, number>();
    allocationTargetItems.forEach((item) => {
      const current =
        item.key === "cash"
          ? cashAvailable
          : item.key === "emergency"
            ? emergencyFund
            : item.key === "investments"
              ? investmentTotalCurrent
              : holdingsByClass.get(item.key) ?? 0;
      currentByKey.set(item.key, current);
    });

    const emergencyAutoTarget =
      emergencyFundMonths > 0 && burnRate > 0 ? burnRate * emergencyFundMonths : null;
    const overrideByKey = new Map<
      string,
      { mode: "rel" | "set" | "off"; value: number }
    >();
    Object.entries(allocationCaps).forEach(([key, cap]) => {
      const mode = cap.mode ?? "rel";
      if (mode === "burn") {
        if (key === "emergency" && emergencyAutoTarget !== null) {
          overrideByKey.set(key, { mode: "set", value: emergencyAutoTarget });
        } else {
          overrideByKey.set(key, { mode: "set", value: 0 });
        }
        return;
      }
      const parsed = parseNumberInput(cap.value ?? "");
      const value = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      overrideByKey.set(key, { mode, value });
    });

    const relTotal = allocationTargetItems.reduce((sum, item) => {
      const mode = overrideByKey.get(item.key)?.mode ?? "rel";
      if (mode !== "rel") return sum;
      return sum + (Number.isFinite(item.pct) ? item.pct : 0);
    }, 0);

    let setTotal = 0;
    let offTotal = 0;
    allocationTargetItems.forEach((item) => {
      const override = overrideByKey.get(item.key);
      if (override?.mode === "set") {
        setTotal += override.value;
      } else if (override?.mode === "off") {
        offTotal += currentByKey.get(item.key) ?? 0;
      }
    });

    const remainingTotal = Math.max(targetTotal - setTotal - offTotal, 0);
    const targetByKey = new Map<string, number>();

    allocationTargetItems.forEach((item) => {
      const override = overrideByKey.get(item.key);
      const mode = override?.mode ?? "rel";
      const current = currentByKey.get(item.key) ?? 0;
      if (mode === "set") {
        targetByKey.set(item.key, override?.value ?? 0);
        return;
      }
      if (mode === "off") {
        targetByKey.set(item.key, current);
        return;
      }
      const rawPct = Number.isFinite(item.pct) ? item.pct : 0;
      const normalizedPct = relTotal > 0 ? (rawPct / relTotal) * 100 : 0;
      const target = (normalizedPct / 100) * remainingTotal;
      targetByKey.set(item.key, target);
    });

    const effectivePctByKey = new Map<string, number>();
    if (targetTotal > 0) {
      targetByKey.forEach((target, key) => {
        effectivePctByKey.set(key, (target / targetTotal) * 100);
      });
    } else {
      allocationTargetItems.forEach((item) => effectivePctByKey.set(item.key, 0));
    }

    return {
      currentByKey,
      targetByKey,
      effectivePctByKey,
      relativePercentTotal: relTotal,
      remainingTotal,
      setTotal,
      offTotal,
      emergencyAutoTarget
    };
  }, [
    allocationTargetItems,
    allocationCaps,
    targetTotal,
    cashAvailable,
    emergencyFund,
    investmentTotalCurrent,
    holdingsByClass,
    burnRate,
    emergencyFundMonths
  ]);

  useEffect(() => {
    if (!allocationTargetsLoaded) return;
    setAllocationTargetItems((prev) => {
      const existing = new Set(prev.map((item) => item.key));
      const assetKeys = new Set(Array.from(holdingsByClass.keys()));
      const reserved = new Set(["cash", "emergency", "investments"]);
      const next = [...prev];

      assetKeys.forEach((key) => {
        if (reserved.has(key)) return;
        if (key === "ETF" || key === "Obbligazioni") return;
        if (existing.has(key)) return;
        next.push({ key, label: key, pct: 0, kind: "asset" });
      });

      return next;
    });
  }, [allocationTargetsLoaded, holdingsByClass]);

  const investmentTargetData = [
    { label: "ETF", value: investmentTargets.etf },
    { label: "Obbligazioni", value: investmentTargets.bonds }
  ];
  const investmentCurrentData = [
    { label: "ETF", value: etfValue },
    { label: "Obbligazioni", value: bondValue }
  ];
  const coreInvestmentTotal = etfValue + bondValue;

  const generalGap = allocationTargetItems
    .map((item) => {
      const current = allocationTargetsMeta.currentByKey.get(item.key) ?? 0;
      const target = allocationTargetsMeta.targetByKey.get(item.key) ?? 0;
      return {
        label: item.label,
        current,
        target,
        delta: target - current
      };
    })
    .filter((item) => item.current !== 0 || item.target !== 0);

  const investmentGap = [
    {
      label: "ETF",
      current: etfValue,
      target: (investmentTargets.etf / 100) * coreInvestmentTotal,
      delta: (investmentTargets.etf / 100) * coreInvestmentTotal - etfValue
    },
    {
      label: "Obbligazioni",
      current: bondValue,
      target: (investmentTargets.bonds / 100) * coreInvestmentTotal,
      delta: (investmentTargets.bonds / 100) * coreInvestmentTotal - bondValue
    }
  ].filter((item) => item.current !== 0 || item.target !== 0);

  const effectivePercentTotal = allocationTargetItems.reduce((sum, item) => {
    const pct = allocationTargetsMeta.effectivePctByKey.get(item.key) ?? 0;
    return sum + (Number.isFinite(pct) ? pct : 0);
  }, 0);
  const allocationPercentDisplay = Number(effectivePercentTotal.toFixed(1));
  const allocationPercentWithinRange =
    targetTotal > 0 ? Math.abs(effectivePercentTotal - 100) <= 0.1 : true;
  const allocationOverflow =
    allocationTargetsMeta.setTotal + allocationTargetsMeta.offTotal - targetTotal;
  const relativeItemCount = useMemo(
    () =>
      allocationTargetItems.filter(
        (item) => (allocationCaps[item.key]?.mode ?? "rel") === "rel"
      ).length,
    [allocationTargetItems, allocationCaps]
  );
  const remainingPctTotal =
    targetTotal > 0
      ? (allocationTargetsMeta.remainingTotal / targetTotal) * 100
      : 0;
  const activeCapsCount = useMemo(
    () => Object.values(allocationCaps).filter((cap) => cap.mode !== "rel").length,
    [allocationCaps]
  );
  const tradePreview = useMemo(() => {
    if (!tradeHolding) return null;
    const quantity = Number(tradeForm.quantity);
    const price = Number(tradeForm.price);
    const fees = tradeForm.fees ? Number(tradeForm.fees) : 0;
    if (!Number.isFinite(quantity) || !Number.isFinite(price)) {
      return {
        quantity: 0,
        price: 0,
        fees: Number.isFinite(fees) ? fees : 0,
        tradeValue: 0,
        newQuantity: tradeHolding.quantity,
        newTotalCap: tradeHolding.total_cap,
        newAvgCost: tradeHolding.avg_cost,
        newCurrentValue: tradeHolding.current_value
      };
    }
    const safeFees = Number.isFinite(fees) ? Math.max(fees, 0) : 0;
    const tradeValue = quantity * price;
    const signed = tradeSide === "buy" ? 1 : -1;
    const newQuantity = Math.max(tradeHolding.quantity + signed * quantity, 0);
    const costReduction = tradeHolding.avg_cost * quantity;
    const newTotalCap =
      tradeSide === "buy"
        ? tradeHolding.total_cap + tradeValue + safeFees
        : Math.max(tradeHolding.total_cap - costReduction, 0);
    const newAvgCost = newQuantity > 0 ? newTotalCap / newQuantity : 0;
    const newCurrentValue = newQuantity > 0 ? newQuantity * price : 0;
    return {
      quantity,
      price,
      fees: safeFees,
      tradeValue,
      newQuantity,
      newTotalCap,
      newAvgCost,
      newCurrentValue
    };
  }, [tradeForm.fees, tradeForm.price, tradeForm.quantity, tradeHolding, tradeSide]);


  const getClassTargetTotal = (label: string, fallback: number) => {
    const coreInvestmentTotal = etfValue + bondValue;
    if (label === "ETF") {
      return coreInvestmentTotal > 0
        ? (investmentTargets.etf / 100) * coreInvestmentTotal
        : fallback;
    }
    if (label === "Obbligazioni") {
      return coreInvestmentTotal > 0
        ? (investmentTargets.bonds / 100) * coreInvestmentTotal
        : fallback;
    }
    const target = allocationTargetsMeta.targetByKey.get(label);
    if (target !== undefined) return target;
    return fallback;
  };

  const buildInternalTargets = (items: Holding[]) => {
    const totalValue = items.reduce((sum, item) => sum + item.current_value, 0);
    const entries = items.map((item) => {
      const raw = targetDrafts[item.id] ?? item.target_pct;
      const target =
        typeof raw === "number" && Number.isFinite(raw)
          ? raw
          : totalValue > 0
            ? (item.current_value / totalValue) * 100
            : 0;
      return { id: item.id, target };
    });
    const total = entries.reduce((sum, item) => sum + item.target, 0);
    return { entries, total };
  };

  const investmentTargetDetailData = useMemo(() => {
    if (!investmentFocusTarget) return [];
    const items = holdings.filter(
      (item) => item.asset_class === investmentFocusTarget
    );
    if (items.length === 0) return [];
    const targetModel = buildInternalTargets(items);
    const byId = new Map(items.map((item) => [item.id, item]));
    return targetModel.entries.map((entry) => {
      const holding = byId.get(entry.id);
      return {
        label: holding ? formatHoldingLabel(holding) : entry.id,
        value: entry.target
      };
    });
  }, [holdings, investmentFocusTarget, targetDrafts]);
  const investmentCurrentDetailData = useMemo(() => {
    if (!investmentFocusCurrent) return [];
    const items = holdings.filter(
      (item) => item.asset_class === investmentFocusCurrent
    );
    const total = items.reduce((sum, item) => sum + item.current_value, 0);
    return items.map((item) => ({
      label: formatHoldingLabel(item),
      value: total > 0 ? (item.current_value / total) * 100 : 0
    }));
  }, [holdings, investmentFocusCurrent]);

  const handleSaveGroupTargets = async (
    items: Holding[],
    targetById: Map<string, number>
  ) => {
    setTargetMessage(null);
    if (items.length === 0) return;
    try {
      await Promise.all(
        items.map((item) =>
          updateHolding(item.id, {
            target_pct: Number.isFinite(targetById.get(item.id))
              ? Number(targetById.get(item.id))
              : 0
          })
        )
      );
      await refresh();
      setTargetDrafts((prev) => {
        const next = { ...prev };
        items.forEach((item) => delete next[item.id]);
        return next;
      });
      setTargetMessage("Pesi interni salvati.");
    } catch (err) {
      setTargetMessage((err as Error).message);
    }
  };

  const renderHoldingForm = (
    submitLabel: string,
    showCancel: boolean,
    onCancel?: () => void
  ) => (
    <form className="form-grid" onSubmit={handleSubmit}>
      <input
        className="input"
        placeholder="Nome asset"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
        required
      />
      <input
        className="input"
        placeholder="Emoji (opzionale)"
        value={form.emoji}
        onChange={(event) => setForm({ ...form, emoji: event.target.value })}
      />
      <select
        className="select"
        value={form.asset_class}
        onChange={(event) => setForm({ ...form, asset_class: event.target.value })}
      >
        {assetClasses.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      {!isCash && (
        <input
          className="input"
          type="number"
          step="0.01"
          placeholder="Costo medio"
          value={form.avg_cost}
          onChange={(event) => setForm({ ...form, avg_cost: event.target.value })}
          required
        />
      )}
      {!isCash && (
        <input
          className="input"
          type="number"
          step="0.01"
          placeholder="Quantita"
          value={form.quantity}
          onChange={(event) => setForm({ ...form, quantity: event.target.value })}
          required
        />
      )}
      <input
        className="input"
        type="number"
        step="0.01"
        placeholder="Total Cap"
        value={Number.isFinite(totalCap) ? totalCap.toFixed(2) : ""}
        readOnly
      />
      <select
        className="select"
        value={form.currency}
        onChange={(event) => setForm({ ...form, currency: event.target.value })}
      >
        <option value="EUR">EUR</option>
        <option value="USD">USD</option>
      </select>
      <input
        className="input"
        type="number"
        step="0.01"
        placeholder={isCash ? "Importo liquidita" : "Valore attuale"}
        value={form.current_value}
        onChange={(event) => setForm({ ...form, current_value: event.target.value })}
        required
      />
      <input
        className="input"
        type="date"
        value={form.start_date}
        onChange={(event) => setForm({ ...form, start_date: event.target.value })}
        required
      />
      <input
        className="input"
        placeholder="Note"
        value={form.note}
        onChange={(event) => setForm({ ...form, note: event.target.value })}
      />
      <div style={{ display: "flex", gap: "10px" }}>
        <button className="button" type="submit">
          {submitLabel}
        </button>
        {showCancel && onCancel && (
          <button type="button" className="button secondary" onClick={onCancel}>
            Annulla
          </button>
        )}
      </div>
    </form>
  );

  if (loading) {
    return <div className="card">Caricamento portafoglio...</div>;
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2 className="section-title">Portafoglio</h2>
          <p className="section-subtitle">Holdings, performance e metriche chiave</p>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={handleMarketUpdate}
          disabled={marketLoading}
        >
          {marketLoading ? "Aggiorno..." : "Aggiorna Markets"}
        </button>
      </div>
      {marketMessage && <div className="notice">{marketMessage}</div>}

      <div className="card allocation-card">
        <div className="section-header">
          <div>
            <h3>Asset Allocation Target</h3>
            <p className="section-subtitle">
              Imposta le percentuali e ricevi indicazioni per ribilanciare.
            </p>
          </div>
          <div className="allocation-actions">
            <div className="allocation-view-toggle">
              <button
                className={`view-toggle ${allocationView === "general" ? "active" : ""}`}
                type="button"
                onClick={() => setAllocationView("general")}
              >
                Generale
              </button>
              <button
                className={`view-toggle ${allocationView === "investment" ? "active" : ""}`}
                type="button"
                onClick={() => setAllocationView("investment")}
              >
                Investimento
              </button>
            </div>
            <span className="allocation-autosave">Salvataggio automatico</span>
          </div>
        </div>

        <div
          className={`allocation-layout ${
            allocationView === "investment" ? "investment" : ""
          }`}
        >
          <div className="allocation-chart">
            {allocationView === "general" ? (
              <>
                <DonutChart
                  data={generalCurrentData}
                  valueFormatter={(value) => formatCurrencySafe(value, currency)}
                  colors={allocationColors}
                />
                <div className="allocation-summary">
                  <div>
                    <span className="stat-label">Totale attuale</span>
                    <strong>{formatCurrencySafe(allocationTotal, currency)}</strong>
                  </div>
                  <div>
                    <span className="stat-label">Fondo emergenza</span>
                    <strong>{formatCurrencySafe(emergencyFund, currency)}</strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="allocation-investment-grid">
                <div className="allocation-subchart">
                  <div className="allocation-subchart-header">
                    <div>
                      <strong>
                        {investmentFocusTarget
                          ? `Target - ${investmentFocusTarget}`
                          : "Target"}
                      </strong>
                      <p className="section-subtitle">
                        {investmentFocusTarget
                          ? "Pesi interni target"
                          : "ETF + Obbligazioni"}
                      </p>
                    </div>
                    {investmentFocusTarget && (
                      <button
                        className="button ghost small"
                        type="button"
                        onClick={() => setInvestmentFocusTarget(null)}
                      >
                        Indietro
                      </button>
                    )}
                  </div>
                  <DonutChart
                    data={
                      investmentFocusTarget
                        ? investmentTargetDetailData
                        : investmentTargetData
                    }
                    valueFormatter={(value) => `${value.toFixed(1)}%`}
                    colors={allocationColors}
                    onSelect={
                      investmentFocusTarget ? undefined : handleInvestmentTargetSelect
                    }
                  />
                </div>
                <div className="allocation-subchart">
                  <div className="allocation-subchart-header">
                    <div>
                      <strong>
                        {investmentFocusCurrent
                          ? `Attuale - ${investmentFocusCurrent}`
                          : "Attuale"}
                      </strong>
                      <p className="section-subtitle">
                        {investmentFocusCurrent
                          ? "Valori correnti per holding"
                          : "Valori correnti ETF + Obbligazioni"}
                      </p>
                    </div>
                    {investmentFocusCurrent && (
                      <button
                        className="button ghost small"
                        type="button"
                        onClick={() => setInvestmentFocusCurrent(null)}
                      >
                        Indietro
                      </button>
                    )}
                  </div>
                  <DonutChart
                    data={
                      investmentFocusCurrent
                        ? investmentCurrentDetailData
                        : investmentCurrentData
                    }
                    valueFormatter={(value) =>
                      investmentFocusCurrent
                        ? `${value.toFixed(1)}%`
                        : formatCurrencySafe(value, currency)
                    }
                    colors={allocationColors}
                    onSelect={
                      investmentFocusCurrent ? undefined : handleInvestmentCurrentSelect
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="allocation-controls">
            {allocationView === "general" ? (
              <>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => setAddTargetOpen((prev) => !prev)}
                  >
                    + Aggiungi asset
                  </button>
                  {addTargetOpen && (
                    <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                      <select
                        className="select"
                        value={newTargetKey}
                        onChange={(event) => setNewTargetKey(event.target.value)}
                      >
                        <option value="">Scegli asset...</option>
                        {assetClasses
                          .filter(
                            (item) =>
                              item !== "ETF" &&
                              item !== "Obbligazioni" &&
                              !allocationTargetItems.some(
                                (target) => target.key === item
                              )
                          )
                          .map((item) => (
                            <option key={`target-${item}`} value={item}>
                              {item}
                            </option>
                          ))}
                      </select>
                      <button
                        className="button secondary small"
                        type="button"
                        disabled={!newTargetKey.trim()}
                        onClick={() => {
                          const key = newTargetKey.trim();
                          if (!key) return;
                          setAllocationTargetItems((prev) => [
                            ...prev,
                            { key, label: key, pct: 0, kind: "asset" }
                          ]);
                          setAllocationColors((prev) => ({
                            ...prev,
                            [key]: prev[key] ?? "#94a3b8"
                          }));
                          setNewTargetKey("");
                          setAddTargetOpen(false);
                        }}
                      >
                        Aggiungi
                      </button>
                    </div>
                  )}
                </div>
                {[
                  ...allocationTargetItems.map((item) => ({
                    key: item.key,
                    label: item.label,
                    colorKey: item.label,
                    kind: item.kind
                  }))
                ].map((item) => {
                  const mode = allocationCaps[item.key]?.mode ?? "rel";
                  const isRelative = mode === "rel";
                  const maxPct = isRelative ? remainingPctTotal : 100;
                  const displayPct =
                    allocationTargetsMeta.effectivePctByKey.get(item.key) ?? 0;
                  const canEdit =
                    isRelative && relativeItemCount > 1 && remainingPctTotal > 0;
                  return (
                    <div className="allocation-row" key={`allocation-${item.key}`}>
                      <div className="allocation-label">
                        <input
                          className="color-input"
                          type="color"
                          value={allocationColors[item.colorKey] ?? "#94a3b8"}
                          onChange={(event) =>
                            setAllocationColors((prev) => ({
                              ...prev,
                              [item.colorKey]: event.target.value
                            }))
                          }
                          aria-label={`Colore ${item.label}`}
                        />
                        <strong>{item.label}</strong>
                      </div>
                      <input
                        className="allocation-slider"
                        type="range"
                        min="0"
                        max={maxPct}
                        step="0.1"
                        value={displayPct}
                        disabled={!canEdit}
                        onChange={(event) =>
                          handleTargetPercentChange(item.key, Number(event.target.value))
                        }
                      />
                      <div className="allocation-input">
                        <input
                          type="number"
                          min="0"
                          max={maxPct}
                          step="0.1"
                          value={displayPct.toFixed(1)}
                          disabled={!canEdit}
                          onChange={(event) =>
                            handleTargetPercentChange(item.key, Number(event.target.value))
                          }
                        />
                        <span>%</span>
                      </div>
                      {item.kind === "asset" &&
                        item.key !== "ETF" &&
                        item.key !== "Obbligazioni" &&
                        item.key !== "investments" && (
                          <button
                            className="button ghost small"
                            type="button"
                            onClick={() =>
                              setAllocationTargetItems((prev) =>
                                prev.filter((target) => target.key !== item.key)
                              )
                            }
                          >
                            Rimuovi
                          </button>
                        )}
                    </div>
                  );
                })}
                <div className="allocation-total">
                  Totale percentuali (effettive): {allocationPercentDisplay}%
                </div>
                {relativeItemCount <= 1 && remainingPctTotal > 0 && (
                  <span className="section-subtitle">
                    Con un solo asset in Rel, il target prende il restante.
                  </span>
                )}
                <div className="allocation-cap">
                  <button
                    className="cap-trigger"
                    type="button"
                    onClick={() => setCapsModalOpen(true)}
                  >
                    <div>
                      <strong>Stato target per asset</strong>
                      <span className="section-subtitle">
                        Rel, Set, Off e Burn rate per il fondo emergenza.
                      </span>
                    </div>
                    <span className="cap-badge">
                      {activeCapsCount > 0 ? `${activeCapsCount} attivi` : "Nessuno"}
                    </span>
                  </button>
                  {creditTotal !== 0 && (
                    <span className="section-subtitle">
                      Nota: conti <code>credit</code> esclusi dal calcolo Cash:{" "}
                      {formatCurrencySafe(creditTotal, currency)}.
                    </span>
                  )}
                </div>
                {!allocationPercentWithinRange && (
                  <div className="notice">
                    {allocationOverflow > 0
                      ? `I valori Set/Off superano il totale di ${formatCurrencySafe(
                          allocationOverflow,
                          currency
                        )}.`
                      : "Consiglio: porta le percentuali effettive al 100% per un ribilanciamento corretto."}
                  </div>
                )}
              </>
            ) : (
              <>
                {(["etf", "bonds"] as const).map((key) => {
                  const label = key === "etf" ? "ETF" : "Obbligazioni";
                  const value = key === "etf" ? investmentTargets.etf : investmentTargets.bonds;
                  return (
                    <div className="allocation-row" key={`investment-${key}`}>
                      <div className="allocation-label">
                        <input
                          className="color-input"
                          type="color"
                          value={allocationColors[label] ?? "#94a3b8"}
                          onChange={(event) =>
                            setAllocationColors((prev) => ({
                              ...prev,
                              [label]: event.target.value
                            }))
                          }
                          aria-label={`Colore ${label}`}
                        />
                        <strong>{label}</strong>
                      </div>
                      <input
                        className="allocation-slider"
                        type="range"
                        min="0"
                        max="100"
                        step="0.1"
                        value={value}
                        onChange={(event) =>
                          handleInvestmentChange(key, Number(event.target.value))
                        }
                      />
                      <div className="allocation-input">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={value.toFixed(1)}
                          onChange={(event) =>
                            handleInvestmentChange(key, Number(event.target.value))
                          }
                        />
                        <span>%</span>
                      </div>
                    </div>
                  );
                })}
                <div className="allocation-total">
                  Totale investito: {(investmentTargets.etf + investmentTargets.bonds).toFixed(1)}%
                </div>
                <span className="section-subtitle">
                  Queste percentuali influenzano solo la vista investimento.
                </span>
              </>
            )}
          </div>
        </div>

        <div className="allocation-rebalance">
          <h4>Azioni consigliate</h4>
          {allocationTotal === 0 ? (
            <div className="empty">Inserisci dati per calcolare il ribilanciamento.</div>
          ) : (
            <div className="allocation-grid">
              {(allocationView === "investment"
                ? investmentGap
                : generalGap.filter((item) => !investmentOnlyLabels.has(item.label))
              ).map((item) => {
                const action =
                  item.delta > 0
                    ? "Compra"
                    : item.delta < 0
                      ? "Vendi"
                      : "Mantieni";
                const value = Math.abs(item.delta);
                const actionClass =
                  item.delta > 0 ? "buy" : item.delta < 0 ? "sell" : "hold";
                const deltaAbs = Math.abs(item.delta);
                const shareBase =
                  allocationView === "investment" ? coreInvestmentTotal : targetTotal;
                const share = shareBase > 0 ? (deltaAbs / shareBase) * 100 : 0;
                const stackMeta = item.label === "Cash" || item.label === "Crypto";
                return (
                  <div className={`allocation-item ${actionClass}`} key={item.label}>
                    <div
                      className={`allocation-item-header${stackMeta ? " stacked" : ""}`}
                    >
                      <strong>{item.label}</strong>
                      <div className="allocation-item-meta">
                        <span>
                          Target: {formatCurrencySafe(item.target, currency)}
                        </span>
                        <span>
                          Attuale: {formatCurrencySafe(item.current, currency)}
                        </span>
                      </div>
                    </div>
                    <div className={`allocation-action ${actionClass}`}>
                      {action} {formatCurrencySafe(value, currency)}
                      {share > 0 && (
                        <span className="allocation-action-share">
                          ({share.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {allocationMessage && <div className="notice">{allocationMessage}</div>}
      </div>

      {capsModalOpen && (
        <div className="modal-backdrop" onClick={() => setCapsModalOpen(false)}>
          <div className="modal-card modal-dark" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Target avanzati per asset</h3>
                <p className="section-subtitle">
                  Rel usa le percentuali, Set blocca un valore fisso, Off congela
                  l'asset al valore attuale. Burn rate usa il tasso di spesa mensile.
                </p>
              </div>
              <button
                className="button ghost small"
                type="button"
                onClick={() => setCapsModalOpen(false)}
              >
                Chiudi
              </button>
            </div>
            <div className="cap-emergency-config">
              <div>
                <strong>Fondo emergenza</strong>
                <span className="section-subtitle">
                  Target automatico = burn rate x mesi selezionati.
                </span>
              </div>
              <select
                className="select cap-months"
                value={emergencyFundMonths}
                onChange={(event) => setEmergencyFundMonths(Number(event.target.value))}
              >
                <option value={6}>6 mesi</option>
                <option value={9}>9 mesi</option>
                <option value={12}>12 mesi</option>
              </select>
              <div className="cap-emergency-meta">
                {burnRate > 0 && allocationTargetsMeta.emergencyAutoTarget !== null ? (
                  <span className="section-subtitle">
                    Burn rate: {formatCurrencySafe(burnRate, currency)} • Target:{" "}
                    {formatCurrencySafe(
                      allocationTargetsMeta.emergencyAutoTarget,
                      currency
                    )}
                  </span>
                ) : (
                  <span className="section-subtitle">
                    Burn rate assente: scegli Set o Rel per impostare manualmente.
                  </span>
                )}
              </div>
            </div>
            <div className="cap-grid">
              {allocationTargetItems.map((item) => {
                const cap = allocationCaps[item.key] ?? {
                  mode: "rel",
                  value: "",
                  pct: ""
                };
                const isEmergency = item.key === "emergency";
                const rawMode = cap.mode ?? "rel";
                const mode = !isEmergency && rawMode === "burn" ? "rel" : rawMode;
                const isBurnMode = isEmergency && mode === "burn";
                const burnValue =
                  allocationTargetsMeta.emergencyAutoTarget !== null
                    ? String(Number(allocationTargetsMeta.emergencyAutoTarget.toFixed(2)))
                    : "";
                const value = isBurnMode ? burnValue : cap.value;
                return (
                  <div className="cap-row" key={`cap-${item.key}`}>
                    <div className="cap-label">
                      <span>{item.label}</span>
                    </div>
                    <select
                      className="select cap-mode"
                      value={mode}
                      onChange={(event) => {
                        const mode = event.target.value as AllocationCap["mode"];
                        setAllocationCaps((prev) => ({
                          ...prev,
                          [item.key]: {
                            mode,
                            value: prev[item.key]?.value ?? "",
                            pct: prev[item.key]?.pct ?? ""
                          }
                        }));
                      }}
                    >
                      <option value="rel">Rel %</option>
                      <option value="set">Set</option>
                      <option value="off">Off</option>
                      {isEmergency && <option value="burn">Burn rate</option>}
                    </select>
                    <div className="cap-input">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Valore fisso"
                        value={value}
                        onChange={(event) =>
                          setAllocationCaps((prev) => ({
                            ...prev,
                            [item.key]: {
                              mode: prev[item.key]?.mode ?? "rel",
                              value: event.target.value,
                              pct: prev[item.key]?.pct ?? ""
                            }
                          }))
                        }
                        disabled={mode !== "set"}
                      />
                      <span>{isBurnMode ? "EUR" : currency}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tradeHolding && (
        <div className="modal-backdrop" onClick={closeTradeModal}>
          <div className="modal-card trade-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>
                  {tradeSide === "buy" ? "Acquisto" : "Vendita"} -{" "}
                  {formatHoldingLabel(tradeHolding)}
                </h3>
                <p className="section-subtitle">
                  Aggiorna quantita e costo medio senza uscire dalla pagina.
                </p>
              </div>
              <button
                className="button ghost small"
                type="button"
                onClick={closeTradeModal}
              >
                Chiudi
              </button>
            </div>
            <div className="trade-tabs">
              <button
                type="button"
                className={`trade-tab ${tradeSide === "buy" ? "active buy" : ""}`}
                onClick={() => setTradeSide("buy")}
              >
                Buy
              </button>
              <button
                type="button"
                className={`trade-tab ${tradeSide === "sell" ? "active sell" : ""}`}
                onClick={() => setTradeSide("sell")}
              >
                Sell
              </button>
            </div>
            <div className="trade-body">
              <div className={`trade-panel ${tradeSide}`}>
                <div className="trade-summary">
                  <div>
                    <span className="stat-label">Quantita attuale</span>
                    <strong>{formatQuantity(tradeHolding.quantity)}</strong>
                  </div>
                  <div>
                    <span className="stat-label">Valore attuale</span>
                    <strong>
                      {formatCurrencySafe(
                        tradeHolding.current_value,
                        tradeHolding.currency
                      )}
                    </strong>
                  </div>
                  <div>
                    <span className="stat-label">Prezzo medio</span>
                    <strong>
                      {formatCurrencySafe(
                        tradeHolding.avg_cost,
                        tradeHolding.currency
                      )}
                    </strong>
                  </div>
                </div>
                <form className="trade-form" onSubmit={handleTradeSubmit}>
                  <div className="trade-field">
                    <label>Quantita</label>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={tradeForm.quantity}
                      onChange={(event) =>
                        setTradeForm((prev) => ({
                          ...prev,
                          quantity: event.target.value
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="trade-field">
                    <label>Prezzo</label>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={tradeForm.price}
                      onChange={(event) =>
                        setTradeForm((prev) => ({
                          ...prev,
                          price: event.target.value
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="trade-field">
                    <label>Commissioni</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tradeForm.fees}
                      onChange={(event) =>
                        setTradeForm((prev) => ({
                          ...prev,
                          fees: event.target.value
                        }))
                      }
                    />
                  </div>
                  {tradePreview && (
                    <div className="trade-preview">
                      <div>
                        <span className="stat-label">Totale operazione</span>
                        <strong>
                          {formatCurrencySafe(
                            tradePreview.tradeValue +
                              (tradeSide === "buy" ? tradePreview.fees : -tradePreview.fees),
                            tradeHolding.currency
                          )}
                        </strong>
                      </div>
                      <div>
                        <span className="stat-label">Nuova quantita</span>
                        <strong>{formatQuantity(tradePreview.newQuantity)}</strong>
                      </div>
                      <div>
                        <span className="stat-label">Nuovo costo medio</span>
                        <strong>
                          {formatCurrencySafe(
                            tradePreview.newAvgCost,
                            tradeHolding.currency
                          )}
                        </strong>
                      </div>
                      <div>
                        <span className="stat-label">Nuovo valore</span>
                        <strong>
                          {formatCurrencySafe(
                            tradePreview.newCurrentValue,
                            tradeHolding.currency
                          )}
                        </strong>
                      </div>
                    </div>
                  )}
                  <button
                    className={`button ${tradeSide === "buy" ? "buy" : "sell"}`}
                    type="submit"
                    disabled={tradeLoading}
                  >
                    {tradeLoading
                      ? "Salvataggio..."
                      : tradeSide === "buy"
                        ? "Conferma acquisto"
                        : "Conferma vendita"}
                  </button>
                </form>
              </div>
              {tradeMessage && <div className="notice">{tradeMessage}</div>}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={closeEdit}>
          <div className="modal-card modal-dark" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Modifica holding</h3>
                <p className="section-subtitle">
                  Aggiorna i dati senza scorrere la pagina.
                </p>
              </div>
              <button className="button ghost small" type="button" onClick={closeEdit}>
                Chiudi
              </button>
            </div>
            {renderHoldingForm("Aggiorna", true, closeEdit)}
            {message && <div className="notice">{message}</div>}
            {priceMessage && <div className="notice">{priceMessage}</div>}
            {error && <div className="error">{error}</div>}
          </div>
        </div>
      )}

      {!editing && (
        <div className="card">
          <h3>Nuova holding</h3>
          {renderHoldingForm("Aggiungi", false)}
          {message && <div className="notice">{message}</div>}
          {priceMessage && <div className="notice">{priceMessage}</div>}
          {error && <div className="error">{error}</div>}
        </div>
      )}

      <div className="card">
        <h3>Holdings attive</h3>
        {holdings.length === 0 ? (
          <div className="empty">Nessuna holding presente.</div>
        ) : (
          <div className="asset-groups">
            {grouped.map((group) => {
              const ratio =
                group.totalCap > 0 ? group.totalValue / group.totalCap : 0;
              const performance =
                group.totalCap > 0 ? group.totalValue / group.totalCap - 1 : Number.NaN;
              const cappedRatio = Math.min(ratio, 2);
              const ratioWidth = (cappedRatio / 2) * 100;
              const targetModel = buildInternalTargets(group.items);
              const targetById = new Map(
                targetModel.entries.map((item) => [item.id, item.target])
              );
              const classTargetTotal = getClassTargetTotal(group.label, group.totalValue);
              const showTargets = group.label !== "Liquidita";
              const hasTargetDrafts = group.items.some(
                (item) => targetDrafts[item.id] !== undefined
              );
              return (
                <div
                  className="asset-group card"
                  key={group.label}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleGroupDrop(group.label);
                  }}
                >
                  <div className="asset-group-header">
                    <div className="asset-group-title">
                      <button
                        className="drag-handle"
                        type="button"
                        draggable={!ordering}
                        onDragStart={(event) => {
                          setDraggedGroup(group.label);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", group.label);
                        }}
                        onDragEnd={() => setDraggedGroup(null)}
                        aria-label={`Sposta ${group.label}`}
                        title="Trascina per riordinare"
                        disabled={ordering}
                      >
                        |||
                      </button>
                      <div>
                        <h4>{group.label}</h4>
                        <span className="section-subtitle">
                          {group.items.length} holdings attive
                        </span>
                      </div>
                    </div>
                    <div className="asset-group-metrics">
                      <div className="asset-metric">
                        <span>Investito</span>
                        <strong>
                          {formatCurrencySafe(group.totalCap, currency)}
                        </strong>
                      </div>
                      <div className="asset-metric">
                        <span>Valore</span>
                        <strong>
                          {formatCurrencySafe(group.totalValue, currency)}
                        </strong>
                      </div>
                      <div className="asset-metric">
                        <span>ROI</span>
                        <strong>{formatPercentSafe(group.roi)}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="asset-bar-meta">
                    <span>Performance (barra 0-200%)</span>
                    <span>{formatPercentSafe(performance)}</span>
                  </div>
                  <div className="asset-bar">
                    <div className="asset-bar-fill" style={{ width: `${ratioWidth}%` }} />
                    <span className="asset-bar-label">
                      {formatPercentSafe(performance)}
                    </span>
                  </div>
                  <div className="asset-items">
                    {group.items.map((item) => {
                      const itemRoi = item.total_cap
                        ? (item.current_value - item.total_cap) / item.total_cap
                        : Number.NaN;
                      const unitPrice =
                        item.current_value > 0 && item.quantity > 0
                          ? item.current_value / item.quantity
                          : Number.NaN;
                      const allocation = group.totalValue
                        ? item.current_value / group.totalValue
                        : 0;
                      const totalShare = holdingsTotal
                        ? item.current_value / holdingsTotal
                        : 0;
                      const subtitle =
                        item.asset_class === "Liquidita"
                          ? "Liquidita disponibile"
                          : `${item.quantity} x ${formatCurrency(
                              item.avg_cost,
                              item.currency
                            )}`;
                      const ticker = extractTicker(item.name);
                      return (
                        <div className="asset-item" key={item.id}>
                          <div className="asset-item-text">
                            <strong>
                              {item.emoji ? `${item.emoji} ` : ""}
                              {item.name}
                            </strong>
                            <span className="section-subtitle">{subtitle}</span>
                            {ticker && (
                              <span className="asset-subinfo">Ticker: {ticker}</span>
                            )}
                          </div>
                          <div className="asset-item-metrics">
                            <div className="asset-item-metric">
                              <span className="asset-item-label">Investito</span>
                              <strong className="asset-item-value">
                                {formatCurrencySafe(item.total_cap, item.currency)}
                              </strong>
                            </div>
                            <div className="asset-item-metric">
                              <span className="asset-item-label">Valore</span>
                              <strong className="asset-item-value">
                                {formatCurrencySafe(item.current_value, item.currency)}
                              </strong>
                            </div>
                            <div className="asset-item-metric">
                              <span className="asset-item-label">Prezzo</span>
                              <strong className="asset-item-value">
                                {formatCurrencySafe(unitPrice, item.currency)}
                              </strong>
                            </div>
                            <div className="asset-item-metric">
                              <span className="asset-item-label">Peso totale</span>
                              <strong className="asset-item-value">
                                {formatPercentSafe(totalShare)}
                              </strong>
                            </div>
                            <div className="asset-item-metric">
                              <span className="asset-item-label">Peso classe</span>
                              <strong className="asset-item-value">
                                {formatPercentSafe(allocation)}
                              </strong>
                            </div>
                            <div className="asset-item-metric">
                              <span className="asset-item-label">ROI</span>
                              <strong className="asset-item-value">
                                {formatPercentSafe(itemRoi)}
                              </strong>
                            </div>
                          </div>
                          <div className="asset-item-actions">
                            {item.asset_class !== "Liquidita" && (
                              <button
                                className="button ghost small"
                                type="button"
                                onClick={() => openTradeModal(item, "buy")}
                              >
                                Buy/Sell
                              </button>
                            )}
                            <button
                              className="button ghost small"
                              type="button"
                              onClick={() => startEdit(item)}
                            >
                              Modifica
                            </button>
                            <button
                              className="button ghost small"
                              type="button"
                              onClick={() => removeItem(item.id)}
                            >
                              Elimina
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {showTargets && (
                    <div className="holding-targets">
                      <div className="holding-target-header">
                        <div>
                          <strong>Pesi interni e azioni consigliate</strong>
                          <span className="section-subtitle">
                            {group.label === "ETF" || group.label === "Obbligazioni"
                              ? `Target classe: ${formatCurrencySafe(
                                  classTargetTotal,
                                  currency
                                )}`
                              : "Target calcolato sul valore attuale della classe"}
                          </span>
                        </div>
                        <div className="holding-target-actions">
                          <span className="stat-label">Totale target</span>
                          <strong>{targetModel.total.toFixed(1)}%</strong>
                          {hasTargetDrafts && (
                            <button
                              className="button secondary small"
                              type="button"
                              onClick={() =>
                                handleSaveGroupTargets(group.items, targetById)
                              }
                            >
                              Salva pesi
                            </button>
                          )}
                        </div>
                      </div>
                      {Math.abs(targetModel.total - 100) > 0.1 && (
                        <div className="notice">
                          Porta il totale al 100% per un bilanciamento interno corretto.
                        </div>
                      )}
                      <div className="holding-target-grid">
                        {group.items.map((item) => {
                          const targetPct = targetById.get(item.id) ?? 0;
                          const currentShare = group.totalValue
                            ? item.current_value / group.totalValue
                            : 0;
                          const targetValue = (classTargetTotal * targetPct) / 100;
                          const delta = targetValue - item.current_value;
                          const action =
                            delta > 0 ? "Compra" : delta < 0 ? "Vendi" : "Mantieni";
                          const actionClass = delta > 0 ? "buy" : delta < 0 ? "sell" : "hold";
                          const ticker = extractTicker(item.name) || item.name;
                          return (
                            <div
                              className={`holding-target-card ${actionClass}`}
                              key={`target-${item.id}`}
                            >
                              <div className="holding-target-meta">
                                <strong>
                                  {item.emoji ? `${item.emoji} ` : ""}
                                  {ticker}
                                </strong>
                                <span className="section-subtitle">
                                  {formatPercentSafe(currentShare)} attuale
                                </span>
                              </div>
                              <div className="holding-target-slider">
                                <input
                                  className="allocation-slider"
                                  type="range"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={targetPct}
                                  onChange={(event) =>
                                    setTargetDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: Number(event.target.value)
                                    }))
                                  }
                                />
                                <div className="holding-target-input">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={targetPct.toFixed(1)}
                                    onChange={(event) =>
                                      setTargetDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: Number(event.target.value)
                                      }))
                                    }
                                  />
                                  <span>%</span>
                                </div>
                              </div>
                              <div className="holding-target-values">
                                <span>
                                  Target: {formatCurrencySafe(targetValue, currency)}
                                </span>
                                <span>
                                  Attuale: {formatCurrencySafe(
                                    item.current_value,
                                    currency
                                  )}
                                </span>
                              </div>
                              <div className={`holding-action ${actionClass}`}>
                                {action} {formatCurrencySafe(Math.abs(delta), currency)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {targetMessage && <div className="notice">{targetMessage}</div>}
      </div>
    </div>
  );
};

export default Portfolio;
