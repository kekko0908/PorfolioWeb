import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  createHolding,
  deleteHolding,
  fetchAllocationTargets,
  replaceAllocationTargets,
  updateHolding,
  upsertSettings
} from "../lib/api";
import { DonutChart } from "../components/charts/DonutChart";
import {
  formatCurrency,
  formatCurrencySafe,
  formatPercentSafe
} from "../lib/format";
import { fetchAssetOverview, fetchGlobalQuote } from "../lib/market";
import { buildAccountBalances, resolveEmergencyFundBalance } from "../lib/metrics";
import type { Holding } from "../types";

type AllocationTargetItem = {
  key: string;
  label: string;
  pct: number;
  kind: "reserve" | "asset";
};

type AllocationCap = {
  enabled: boolean;
  value: string;
  pct: string;
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

const investmentOnlyLabels = new Set(["ETF", "Obbligazioni", "Crypto"]);

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
  const { accounts, transactions, holdings, settings, refresh, loading, error } =
    usePortfolioData();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [priceMessage, setPriceMessage] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState<string | null>(null);
  const [tickerMessage, setTickerMessage] = useState<string | null>(null);
  const [tickerLoading, setTickerLoading] = useState<string | null>(null);
  const [tickerInfo, setTickerInfo] = useState<
    Record<
      string,
      {
        name?: string;
        assetType?: string;
        exchange?: string;
        country?: string;
        currency?: string;
      }
    >
  >({});
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
    cash: { enabled: false, value: "", pct: "" }
  });
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const autoSaveReadyRef = useRef(false);
  const [capsModalOpen, setCapsModalOpen] = useState(false);
  const [allocationTargetsLoaded, setAllocationTargetsLoaded] = useState(false);
  const [allocationTargetItems, setAllocationTargetItems] = useState<
    AllocationTargetItem[]
  >([
    { key: "cash", label: "Cash", pct: 20, kind: "reserve" },
    { key: "investments", label: "Asset Investimento", pct: 70, kind: "asset" },
    { key: "emergency", label: "Fondo emergenza", pct: 10, kind: "reserve" }
  ]);
  const [addTargetOpen, setAddTargetOpen] = useState(false);
  const [newTargetKey, setNewTargetKey] = useState("");
  const [allocationColors, setAllocationColors] = useState({
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
    if (!cashCap?.enabled || !cashCap.value.trim()) return null;
    const parsed = Number(cashCap.value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }, [allocationCaps]);

  useEffect(() => {
    if (!settings) return;
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
    setAllocationCaps((prev) => ({
      ...prev,
      cash: {
        enabled: settings.cash_target_cap !== null && settings.cash_target_cap !== undefined,
        value:
          settings.cash_target_cap !== null && settings.cash_target_cap !== undefined
            ? String(settings.cash_target_cap)
            : "",
        pct: prev.cash?.pct ?? ""
      }
    }));

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
        }
      | null => {
      if (!stored || typeof stored !== "string") return null;
      try {
        const parsed = JSON.parse(stored) as {
          items?: AllocationTargetItem[];
          colors?: Record<string, string>;
          caps?: Record<string, AllocationCap>;
        };
        if (!Array.isArray(parsed.items)) return null;
        return { items: parsed.items, colors: parsed.colors, caps: parsed.caps };
      } catch {
        return null;
      }
    };

    const normalizeCaps = (caps?: Record<string, AllocationCap>) => {
      if (!caps) return undefined;
      const next: Record<string, AllocationCap> = {};
      Object.entries(caps).forEach(([key, cap]) => {
        next[key] = {
          enabled: Boolean(cap?.enabled),
          value: typeof cap?.value === "string" ? cap.value : "",
          pct: typeof cap?.pct === "string" ? cap.pct : ""
        };
      });
      return next;
    };

    const normalizeTargets = (items: AllocationTargetItem[]) => {
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
        .map((item) => ({
          ...item,
          kind: item.key === "cash" || item.key === "emergency" ? "reserve" : "asset"
        }));

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
          storedTargets.map((item) => ({
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
        setAllocationTargetsLoaded(true);
        return;
      }

      if (local?.items?.length) {
        setAllocationTargetItems(normalizeTargets(local.items));
        if (local.colors) {
          setAllocationColors((prev) => ({ ...prev, ...local.colors }));
        }
        if (localCaps) setAllocationCaps(localCaps);
        setAllocationTargetsLoaded(true);
        return;
      }

      if (localCaps) setAllocationCaps(localCaps);
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
          next[item.key] = { enabled: false, value: "", pct: "" };
          return;
        }
        if (typeof next[item.key].pct !== "string") {
          next[item.key] = { ...next[item.key], pct: "" };
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
    const token = trimmed.split(/[^A-Za-z0-9.]/)[0] ?? "";
    return token.toUpperCase();
  };

  const resetForm = () => {
    setForm({ ...emptyForm, currency });
    setEditing(null);
  };

  const closeEdit = () => {
    resetForm();
    setMessage(null);
    setPriceMessage(null);
    setTickerMessage(null);
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setTargetMessage(null);
    let customMessage: string | null = null;
    const currentValue = Number(form.current_value);
    const quantity = isCash ? 1 : Number(form.quantity);
    const avgCost = isCash ? currentValue : Number(form.avg_cost);
    const ticker = extractTicker(form.name);
    const payload = {
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
        await updateHolding(editing.id, payload);
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
          if (match.currency !== payload.currency) {
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
            emoji: payload.emoji ?? match.emoji,
            target_pct: match.target_pct ?? null,
            quantity: newQuantity,
            avg_cost: newAvgCost,
            total_cap: newTotalCap,
            current_value: newCurrentValue,
            currency: payload.currency,
            start_date: newStartDate,
            note: payload.note || match.note
          });
          customMessage = `Holding unita a ${match.name}.`;
        } else {
          await createHolding(payload);
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

  const handleLivePrice = async (item: Holding) => {
    setPriceMessage(null);
    if (item.asset_class === "Liquidita") {
      setPriceMessage("Prezzo live non disponibile per liquidita.");
      return;
    }
    const ticker = extractTicker(item.name);
    if (!ticker) {
      setPriceMessage("Inserisci il ticker nel nome (es. MWRD - ETF).");
      return;
    }
    setPriceLoading(item.id);
    try {
      const price = await fetchGlobalQuote(ticker);
      const currentValue = price * (item.quantity || 0);
      await updateHolding(item.id, { current_value: currentValue });
      await refresh();
      setPriceMessage(`Prezzo ${ticker} aggiornato.`);
    } catch (err) {
      setPriceMessage((err as Error).message);
    } finally {
      setPriceLoading(null);
    }
  };

  const handleTickerInfo = async (item: Holding) => {
    setTickerMessage(null);
    const ticker = extractTicker(item.name);
    if (!ticker) {
      setTickerMessage("Inserisci il ticker all'inizio del nome (es. MWRD - ETF).");
      return;
    }
    setTickerLoading(item.id);
    try {
      const info = await fetchAssetOverview(ticker);
      setTickerInfo((prev) => ({
        ...prev,
        [item.id]: info
      }));
    } catch (err) {
      setTickerMessage((err as Error).message);
    } finally {
      setTickerLoading(null);
    }
  };

  const handleAllocationChange = (key: string, value: number) => {
    if (!Number.isFinite(value)) return;
    const nextValue = Math.max(0, Math.min(100, value));
    setAllocationTargetItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, pct: nextValue } : item
      )
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

  useEffect(() => {
    if (!session || !allocationTargetsLoaded) return;
    const snapshot = JSON.stringify({
      allocationTargetItems,
      investmentTargets,
      allocationCaps,
      allocationColors
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
          caps: allocationCaps
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

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        items: Holding[];
        totalCap: number;
        totalValue: number;
      }
    >();
    holdings.forEach((item) => {
      const key = item.asset_class || "Altro";
      const current = map.get(key) ?? { items: [], totalCap: 0, totalValue: 0 };
      current.items.push(item);
      current.totalCap += item.total_cap;
      current.totalValue += item.current_value;
      map.set(key, current);
    });
    return Array.from(map.entries()).map(([label, data]) => ({
      label,
      ...data,
      roi: data.totalCap ? (data.totalValue - data.totalCap) / data.totalCap : 0
    }));
  }, [holdings]);

  const accountBalances = useMemo(
    () => buildAccountBalances(accounts, transactions),
    [accounts, transactions]
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
  const capPctByKey = useMemo(() => {
    const caps = new Map<string, number>();
    Object.entries(allocationCaps).forEach(([key, cap]) => {
      if (!cap.enabled) return;
      const pctRaw = Number(cap.pct);
      const pctCap =
        Number.isFinite(pctRaw) && pctRaw > 0 ? Math.min(100, pctRaw) : null;
      const valueRaw = Number(cap.value);
      const valueCap =
        targetTotal > 0 && Number.isFinite(valueRaw) && valueRaw > 0
          ? Math.min(100, (valueRaw / targetTotal) * 100)
          : null;
      const maxPct =
        pctCap !== null && valueCap !== null
          ? Math.min(pctCap, valueCap)
          : pctCap ?? valueCap;
      if (maxPct === null) return;
      caps.set(key, maxPct);
    });
    return caps;
  }, [allocationCaps, targetTotal]);

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

  const effectiveTargetPctByKey = useMemo(() => {
    const round1 = (value: number) => Number(value.toFixed(1));
    const items = allocationTargetItems.map((item) => {
      const raw = Number.isFinite(item.pct) ? item.pct : 0;
      const cap = capPctByKey.get(item.key);
      const max = cap ?? 100;
      return {
        key: item.key,
        pct: Math.min(raw, max),
        max
      };
    });

    let total = items.reduce((sum, item) => sum + item.pct, 0);
    if (total > 100 && total > 0) {
      const factor = 100 / total;
      items.forEach((item) => {
        item.pct = item.pct * factor;
      });
      total = 100;
    }

    items.forEach((item) => {
      item.pct = round1(item.pct);
    });

    let remaining = 100 - items.reduce((sum, item) => sum + item.pct, 0);
    if (remaining > 0.05) {
      for (let i = 0; i < 3; i += 1) {
        const adjustable = items.filter((item) => item.pct + 0.05 < item.max);
        if (adjustable.length === 0) break;
        const adjustableTotal = adjustable.reduce((sum, item) => sum + item.pct, 0);
        let allocated = 0;
        adjustable.forEach((item, index) => {
          const share =
            adjustableTotal > 0
              ? (item.pct / adjustableTotal) * remaining
              : remaining / adjustable.length;
          if (index === adjustable.length - 1) {
            const next = Math.min(item.pct + (remaining - allocated), item.max);
            item.pct = round1(next);
          } else {
            const next = Math.min(item.pct + share, item.max);
            allocated += Math.max(0, next - item.pct);
            item.pct = round1(next);
          }
        });
        remaining = 100 - items.reduce((sum, item) => sum + item.pct, 0);
        if (remaining <= 0.05) break;
      }
    }

    return new Map(items.map((item) => [item.key, item.pct]));
  }, [allocationTargetItems, capPctByKey]);

  const generalGap = allocationTargetItems
    .map((item) => {
      const current =
        item.key === "cash"
          ? cashAvailable
          : item.key === "emergency"
            ? emergencyFund
            : item.key === "investments"
              ? investmentTotalCurrent
              : holdingsByClass.get(item.key) ?? 0;
      const effectivePct = effectiveTargetPctByKey.get(item.key) ?? item.pct;
      const target = targetTotal > 0 ? (effectivePct / 100) * targetTotal : 0;
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

  const allocationPercentTotal = allocationTargetItems.reduce(
    (sum, item) => sum + (Number.isFinite(item.pct) ? item.pct : 0),
    0
  );
  const allocationPercentDisplay = Number(allocationPercentTotal.toFixed(1));
  const allocationPercentWithinRange =
    Math.abs(allocationPercentTotal - 100) <= 0.1;
  const activeCapsCount = useMemo(
    () => Object.values(allocationCaps).filter((cap) => cap.enabled).length,
    [allocationCaps]
  );


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
    if (targetTotal <= 0) return fallback;
    const pct = effectiveTargetPctByKey.get(label) ?? allocationPctByKey.get(label);
    if (pct !== undefined) return (pct / 100) * targetTotal;
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
            target_pct: Number(targetById.get(item.id) ?? 0)
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
      </div>

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
                  <strong>Target</strong>
                  <p className="section-subtitle">ETF + Obbligazioni</p>
                  <DonutChart
                    data={investmentTargetData}
                    valueFormatter={(value) => `${value.toFixed(1)}%`}
                    colors={allocationColors}
                  />
                </div>
                <div className="allocation-subchart">
                  <strong>Attuale</strong>
                  <p className="section-subtitle">Valori correnti ETF + Obbligazioni</p>
                  <DonutChart
                    data={investmentCurrentData}
                    valueFormatter={(value) => formatCurrencySafe(value, currency)}
                    colors={allocationColors}
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
                ].map((item) => (
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
                      max="100"
                      step="0.1"
                      value={allocationPctByKey.get(item.key) ?? 0}
                      onChange={(event) =>
                        handleAllocationChange(item.key, Number(event.target.value))
                      }
                    />
                    <div className="allocation-input">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={(allocationPctByKey.get(item.key) ?? 0).toFixed(1)}
                        onChange={(event) =>
                          handleAllocationChange(item.key, Number(event.target.value))
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
                ))}
                <div className="allocation-total">
                  Totale percentuali: {allocationPercentDisplay}%
                </div>
                <div className="allocation-cap">
                  <button
                    className="cap-trigger"
                    type="button"
                    onClick={() => setCapsModalOpen(true)}
                  >
                    <div>
                      <strong>Limiti massimi per asset</strong>
                      <span className="section-subtitle">
                        Gestisci i tetti in valore o percentuale.
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
                    Consiglio: porta il totale al 100% per un ribilanciamento corretto.
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
                return (
                  <div className={`allocation-item ${actionClass}`} key={item.label}>
                    <div className="allocation-item-header">
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
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Limiti massimi per asset</h3>
                <p className="section-subtitle">
                  Imposta un tetto in valore o percentuale per ogni classe.
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
            <div className="cap-grid">
              {allocationTargetItems.map((item) => {
                const cap = allocationCaps[item.key] ?? {
                  enabled: false,
                  value: "",
                  pct: ""
                };
                return (
                  <div className="cap-row" key={`cap-${item.key}`}>
                    <div className="cap-label">
                      <span>{item.label}</span>
                    </div>
                    <label className="cap-toggle">
                      <input
                        type="checkbox"
                        checked={cap.enabled}
                        onChange={(event) =>
                          setAllocationCaps((prev) => ({
                            ...prev,
                            [item.key]: {
                              enabled: event.target.checked,
                              value: prev[item.key]?.value ?? "",
                              pct: prev[item.key]?.pct ?? ""
                            }
                          }))
                        }
                      />
                      <span className="cap-switch" />
                    </label>
                    <div className="cap-input">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Max valore"
                        value={cap.value}
                        onChange={(event) =>
                          setAllocationCaps((prev) => ({
                            ...prev,
                            [item.key]: {
                              enabled: prev[item.key]?.enabled ?? false,
                              value: event.target.value,
                              pct: prev[item.key]?.pct ?? ""
                            }
                          }))
                        }
                        disabled={!cap.enabled}
                      />
                      <span>{currency}</span>
                    </div>
                    <div className="cap-input cap-input-pct">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Max %"
                        value={cap.pct}
                        onChange={(event) =>
                          setAllocationCaps((prev) => ({
                            ...prev,
                            [item.key]: {
                              enabled: prev[item.key]?.enabled ?? false,
                              value: prev[item.key]?.value ?? "",
                              pct: event.target.value
                            }
                          }))
                        }
                        disabled={!cap.enabled}
                      />
                      <span>%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={closeEdit}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
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
            {tickerMessage && <div className="notice">{tickerMessage}</div>}
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
          {tickerMessage && <div className="notice">{tickerMessage}</div>}
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
                <div className="asset-group card" key={group.label}>
                  <div className="asset-group-header">
                    <div>
                      <h4>{group.label}</h4>
                      <span className="section-subtitle">
                        {group.items.length} holdings attive
                      </span>
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
                      const allocation = group.totalValue
                        ? item.current_value / group.totalValue
                        : 0;
                      const subtitle =
                        item.asset_class === "Liquidita"
                          ? "Liquidita disponibile"
                          : `${item.quantity} x ${formatCurrency(
                              item.avg_cost,
                              item.currency
                            )}`;
                      const ticker = extractTicker(item.name);
                      const info = tickerInfo[item.id];
                      const infoLine = info
                        ? [
                            info.assetType,
                            info.exchange,
                            info.country,
                            info.currency
                          ]
                            .filter(Boolean)
                            .join(" • ")
                        : null;
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
                            {info?.name && (
                              <span className="asset-subinfo">{info.name}</span>
                            )}
                            {infoLine && (
                              <span className="asset-subinfo">{infoLine}</span>
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
                              <span className="asset-item-label">Peso</span>
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
                            <button
                              className="button ghost small"
                              type="button"
                              onClick={() => handleLivePrice(item)}
                              disabled={priceLoading === item.id}
                            >
                              {priceLoading === item.id ? "Live..." : "Live"}
                            </button>
                            <button
                              className="button ghost small"
                              type="button"
                              onClick={() => handleTickerInfo(item)}
                              disabled={tickerLoading === item.id}
                            >
                              {tickerLoading === item.id ? "Info..." : "Info"}
                            </button>
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
