import { useMemo, useState, useEffect, useRef } from "react";
import { DonutChart } from "../components/charts/DonutChart";
import { buildCategoryIcons } from "../lib/categoryIcons";
import { formatCurrencySafe, formatPercent } from "../lib/format";
import { upsertCategoryBudgets } from "../lib/api";
import { filterBalanceCorrectionTransactions } from "../lib/metrics";
import { useAuth } from "../contexts/AuthContext";
import { usePortfolioData } from "../hooks/usePortfolioData";
import type { Category } from "../types";

const parseCapValue = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(parsed, 0);
};

const normalizeKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

const correctionKey = normalizeKey("Correzione Saldo");

const isCorrectionCategory = (category: Category) =>
  normalizeKey(category.name) === correctionKey;

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
};

const hslToHex = (hue: number, saturation: number, lightness: number) => {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const h = hue / 60;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r1, g1, b1] =
    h >= 0 && h < 1
      ? [c, x, 0]
      : h >= 1 && h < 2
        ? [x, c, 0]
        : h >= 2 && h < 3
          ? [0, c, x]
          : h >= 3 && h < 4
            ? [0, x, c]
            : h >= 4 && h < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  const toHex = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
};

const Budget = () => {
  const { session } = useAuth();
  const {
    categories,
    transactions,
    settings,
    categoryBudgets,
    loading,
    error,
    refresh
  } = usePortfolioData();
  const [capDrafts, setCapDrafts] = useState<Record<string, string>>({});
  const [colorDrafts, setColorDrafts] = useState<Record<string, string>>({});
  const [budgetMessage, setBudgetMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>(
    {}
  );
  const [activeMonth, setActiveMonth] = useState(
    () => new Date().toISOString().slice(0, 7)
  );
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const lastAutoCopiedMonth = useRef<string | null>(null);

  const currency = settings?.base_currency ?? "EUR";
  const monthKey = activeMonth;
  const monthParts = activeMonth.split("-");
  const monthYear = Number(monthParts[0]);
  const monthIndex = Number(monthParts[1]) - 1;
  const monthDate = new Date(monthYear, monthIndex, 1);
  const monthLabel = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric"
  }).format(monthDate);
  const formattedMonthLabel = monthLabel
    ? `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)}`
    : activeMonth;
  const monthLabels = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) =>
        new Intl.DateTimeFormat("it-IT", { month: "short" }).format(
          new Date(2020, index, 1)
        )
      ),
    []
  );

  const getPreviousMonthKey = (value: string) => {
    const parts = value.split("-");
    if (parts.length !== 2) return value;
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(month)) return value;
    const prevDate = new Date(year, month - 1, 1);
    return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
  };

  const expenseCategories = useMemo(
    () =>
      categories.filter(
        (category) => category.type === "expense" && !isCorrectionCategory(category)
      ),
    [categories]
  );

  const expenseCategoryIds = useMemo(
    () => new Set(expenseCategories.map((category) => category.id)),
    [expenseCategories]
  );

  const categoryById = useMemo(
    () => new Map(expenseCategories.map((category) => [category.id, category])),
    [expenseCategories]
  );

  const categoryIcons = useMemo(
    () => buildCategoryIcons(expenseCategories),
    [expenseCategories]
  );

  const getCategoryLabel = (category: Category) => {
    const icon = categoryIcons.get(category.id);
    return `${icon ? `${icon} ` : ""}${category.name}`.trim();
  };

  const filteredTransactions = useMemo(
    () => filterBalanceCorrectionTransactions(transactions, categories),
    [transactions, categories]
  );

  const monthBudgets = useMemo(() => {
    const matches = categoryBudgets.filter(
      (budget) => budget.period_key === monthKey
    );
    if (matches.length > 0) return matches;
    const previousKey = getPreviousMonthKey(monthKey);
    const previousBudgets = categoryBudgets.filter(
      (budget) => budget.period_key === previousKey
    );
    if (previousBudgets.length > 0) return previousBudgets;
    return categoryBudgets.filter((budget) => !budget.period_key);
  }, [categoryBudgets, monthKey]);

  const capById = useMemo(() => {
    const map = new Map<string, number | null>();
    monthBudgets.forEach((budget) => {
      map.set(budget.category_id, budget.cap_amount ?? null);
    });
    return map;
  }, [monthBudgets]);

  const colorById = useMemo(() => {
    const map = new Map<string, string | null>();
    monthBudgets.forEach((budget) => {
      map.set(
        budget.category_id,
        typeof budget.color === "string" && budget.color.trim()
          ? budget.color
          : null
      );
    });
    return map;
  }, [monthBudgets]);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    monthBudgets.forEach((budget) => {
      if (budget.cap_amount !== null && budget.cap_amount !== undefined) {
        nextDrafts[budget.category_id] = String(budget.cap_amount);
      }
    });
    setCapDrafts(nextDrafts);
  }, [monthBudgets, monthKey]);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    monthBudgets.forEach((budget) => {
      if (typeof budget.color === "string" && budget.color.trim()) {
        nextDrafts[budget.category_id] = budget.color;
      }
    });
    setColorDrafts(nextDrafts);
  }, [monthBudgets, monthKey]);

  useEffect(() => {
    if (!monthPickerOpen) return;
    setPickerYear(monthYear);
  }, [monthPickerOpen, monthYear]);

  const spendMaps = useMemo(() => {
    const spendSelf = new Map<string, number>();
    const spendTotal = new Map<string, number>();
    expenseCategories.forEach((category) => {
      spendSelf.set(category.id, 0);
      spendTotal.set(category.id, 0);
    });

    filteredTransactions.forEach((transaction) => {
      if (transaction.type !== "expense") return;
      if (!transaction.date.startsWith(monthKey)) return;
      const category = categoryById.get(transaction.category_id);
      if (!category) return;
      spendSelf.set(
        category.id,
        (spendSelf.get(category.id) ?? 0) + transaction.amount
      );
      let cursor: Category | undefined = category;
      while (cursor) {
        spendTotal.set(
          cursor.id,
          (spendTotal.get(cursor.id) ?? 0) + transaction.amount
        );
        cursor = cursor.parent_id ? categoryById.get(cursor.parent_id) : undefined;
      }
    });

    return { spendSelf, spendTotal };
  }, [filteredTransactions, expenseCategories, categoryById, monthKey]);

  const parentCategories = useMemo(
    () => expenseCategories.filter((category) => !category.parent_id),
    [expenseCategories]
  );

  const defaultColorById = useMemo(() => {
    const map = new Map<string, string>();
    expenseCategories.forEach((category) => {
      const hue = hashString(category.id || category.name);
      map.set(category.id, hslToHex(hue, 62, 52));
    });
    return map;
  }, [expenseCategories]);

  const getCategoryColor = (category: Category) => {
    const draft = colorDrafts[category.id];
    if (draft) return draft;
    const saved = colorById.get(category.id);
    if (saved) return saved;
    return defaultColorById.get(category.id) ?? "#1f6f5c";
  };

  const categoryColors = useMemo(() => {
    const map: Record<string, string> = {};
    parentCategories.forEach((category) => {
      map[getCategoryLabel(category)] = getCategoryColor(category);
    });
    return map;
  }, [parentCategories, colorDrafts, colorById, defaultColorById, categoryIcons]);


  const totalExpense = useMemo(() => {
    return parentCategories.reduce(
      (sum, category) => sum + (spendMaps.spendTotal.get(category.id) ?? 0),
      0
    );
  }, [parentCategories, spendMaps]);

  const donutData = useMemo(
    () =>
      parentCategories.map((category) => ({
        label: getCategoryLabel(category),
        value: spendMaps.spendTotal.get(category.id) ?? 0
      })),
    [parentCategories, spendMaps, categoryIcons]
  );

  const getParentCapValue = (category: Category) => {
    if (!category.parent_id) return null;
    const draft = capDrafts[category.parent_id];
    const parsed = draft !== undefined ? parseCapValue(draft) : null;
    if (parsed !== null) return parsed;
    return capById.get(category.parent_id) ?? null;
  };

  const enforceChildCap = (category: Category, rawValue: string) => {
    if (!category.parent_id) return rawValue;
    const parentCap = getParentCapValue(category);
    const parsed = parseCapValue(rawValue);
    if (parentCap !== null && parsed !== null && parsed > parentCap) {
      setBudgetMessage(
        `Il CAP di "${category.name}" non puo superare quello della categoria madre.`
      );
      return String(parentCap);
    }
    return rawValue;
  };

  const handleCapBlur = (category: Category) => {
    const current = capDrafts[category.id];
    if (current === undefined) return;
    const nextValue = enforceChildCap(category, current);
    if (nextValue !== current) {
      setCapDrafts((prev) => ({ ...prev, [category.id]: nextValue }));
    }
  };

  const handleSaveBudgets = async () => {
    if (!session?.user) return;
    setBudgetMessage(null);
    setSaving(true);
    try {
      const payloads = expenseCategories.map((category) => {
        const draft = capDrafts[category.id] ?? "";
        let parsed = parseCapValue(draft);
        if (category.parent_id) {
          const parentCap = getParentCapValue(category);
          if (parentCap !== null && parsed !== null && parsed > parentCap) {
            parsed = parentCap;
            setCapDrafts((prev) => ({
              ...prev,
              [category.id]: String(parentCap)
            }));
          }
        }
        const colorDraft = colorDrafts[category.id];
        const storedColor = colorById.get(category.id) ?? null;
        const colorValue = colorDraft ? colorDraft : storedColor;
        return {
          user_id: session.user.id,
          category_id: category.id,
          cap_amount: parsed,
          color: colorValue,
          period_key: monthKey
        };
      });
      await upsertCategoryBudgets(payloads);
      await refresh();
      setBudgetMessage("Budget salvato.");
    } catch (err) {
      setBudgetMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!session?.user) return;
    if (!monthKey) return;
    if (lastAutoCopiedMonth.current === monthKey) return;
    const hasCurrent = categoryBudgets.some(
      (budget) => budget.period_key === monthKey
    );
    if (hasCurrent) return;
    const previousKey = getPreviousMonthKey(monthKey);
    const previousBudgets = categoryBudgets.filter(
      (budget) => budget.period_key === previousKey
    );
    if (previousBudgets.length === 0) return;
    const payloads = previousBudgets
      .filter((budget) => expenseCategoryIds.has(budget.category_id))
      .map((budget) => ({
        user_id: session.user.id,
        category_id: budget.category_id,
        cap_amount: budget.cap_amount ?? null,
        color: budget.color ?? null,
        period_key: monthKey
      }));
    if (payloads.length === 0) return;
    lastAutoCopiedMonth.current = monthKey;
    const syncCopy = async () => {
      try {
        await upsertCategoryBudgets(payloads);
        await refresh();
      } catch {
        lastAutoCopiedMonth.current = null;
      }
    };
    void syncCopy();
  }, [categoryBudgets, expenseCategoryIds, monthKey, refresh, session?.user]);

  const shiftMonth = (delta: number) => {
    const nextDate = new Date(monthYear, monthIndex + delta, 1);
    const nextKey = `${nextDate.getFullYear()}-${String(
      nextDate.getMonth() + 1
    ).padStart(2, "0")}`;
    setActiveMonth(nextKey);
  };

  const goToCurrentMonth = () => {
    const now = new Date();
    const nextKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    setActiveMonth(nextKey);
    setMonthPickerOpen(false);
  };

  const selectMonth = (year: number, index: number) => {
    const nextKey = `${year}-${String(index + 1).padStart(2, "0")}`;
    setActiveMonth(nextKey);
    setMonthPickerOpen(false);
  };

  const toggleParent = (id: string) => {
    setExpandedParents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return <div className="card">Caricamento budget...</div>;
  }

  return (
    <div className="page">
      <div className="budget-month-bar">
        <div className="budget-month-switcher">
          <button
            className="button ghost small budget-month-arrow"
            type="button"
            onClick={() => shiftMonth(-1)}
          >
            {"<"}
          </button>
          <button
            className="budget-month-label"
            type="button"
            onClick={() => setMonthPickerOpen(true)}
          >
            {formattedMonthLabel}
          </button>
          <button
            className="button ghost small budget-month-arrow"
            type="button"
            onClick={() => shiftMonth(1)}
          >
            {">"}
          </button>
        </div>
        <button
          className="button ghost small"
          type="button"
          onClick={goToCurrentMonth}
        >
          Oggi
        </button>
      </div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Budget</h2>
          <p className="section-subtitle">Spese del mese selezionato</p>
        </div>
        <span className="pill">{monthKey}</span>
      </div>

      <div className="card budget-overview">
        <div className="budget-chart">
          <DonutChart
            data={donutData}
            valueFormatter={(value) => formatCurrencySafe(value, currency)}
            colors={categoryColors}
          />
        </div>
        <div className="budget-summary">
          {parentCategories.length === 0 ? (
            <div className="empty">Nessuna categoria di spesa disponibile.</div>
          ) : (
            parentCategories.map((category) => {
              const spent = spendMaps.spendTotal.get(category.id) ?? 0;
              const percent = totalExpense > 0 ? spent / totalExpense : 0;
              const capValue = capById.get(category.id);
              const capLabel =
                capValue !== null && capValue !== undefined && capValue > 0
                  ? ` su ${formatCurrencySafe(capValue, currency)}`
                  : "";
              return (
                <div className="budget-summary-row" key={category.id}>
                  <div className="budget-summary-label">
                    <span className="budget-emoji">
                      {categoryIcons.get(category.id) ?? "\u{1F4CC}"}
                    </span>
                    <span>{category.name}</span>
                  </div>
                  <div className="budget-summary-metrics">
                    <span>
                      {formatCurrencySafe(spent, currency)}
                      {capLabel}
                    </span>
                    <span className="section-subtitle">
                      {totalExpense > 0 ? formatPercent(percent) : "0%"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="card budget-caps-card">
        <div className="section-header">
          <div>
            <h3>CAP massimi per categoria</h3>
            <p className="section-subtitle">
              Le sottocategorie non possono superare il CAP della categoria madre.
            </p>
          </div>
          <button className="button" type="button" onClick={handleSaveBudgets}>
            {saving ? "Salvataggio..." : "Salva budget"}
          </button>
        </div>
        {budgetMessage && <div className="notice">{budgetMessage}</div>}
        {error && <div className="error">{error}</div>}
        <div className="budget-caps">
          {parentCategories.map((parent) => {
            const children = expenseCategories.filter(
              (child) => child.parent_id === parent.id
            );
            const isExpanded = expandedParents[parent.id] ?? false;
            const parentSpent = spendMaps.spendTotal.get(parent.id) ?? 0;
            const parentCapValue =
              parseCapValue(capDrafts[parent.id] ?? "") ?? capById.get(parent.id);
            const parentOver =
              parentCapValue !== null && parentCapValue > 0
                ? parentSpent / parentCapValue
                : null;
            return (
              <div className="budget-group" key={parent.id}>
                <div
                  className={`budget-cap-row${
                    parentOver !== null && parentOver >= 1 ? " over" : ""
                  }`}
                >
                  <div className="budget-cap-label">
                    <span className="budget-emoji">
                      {categoryIcons.get(parent.id) ?? "\u{1F4CC}"}
                    </span>
                    <div className="budget-cap-text">
                      <strong>{parent.name}</strong>
                      <span className="section-subtitle">
                        Speso: {formatCurrencySafe(parentSpent, currency)}
                      </span>
                      {children.length > 0 && (
                        <button
                          className="button ghost small budget-toggle"
                          type="button"
                          onClick={() => toggleParent(parent.id)}
                        >
                          {isExpanded ? "Nascondi" : "Mostra"} sottocategorie
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="budget-cap-input">
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      placeholder="CAP massimo"
                      value={capDrafts[parent.id] ?? ""}
                      onChange={(event) =>
                        setCapDrafts((prev) => ({
                          ...prev,
                          [parent.id]: event.target.value
                        }))
                      }
                    />
                    <span>{currency}</span>
                    <input
                      className="budget-color-input"
                      type="color"
                      value={getCategoryColor(parent)}
                      onChange={(event) =>
                        setColorDrafts((prev) => ({
                          ...prev,
                          [parent.id]: event.target.value
                        }))
                      }
                      aria-label={`Colore categoria ${parent.name}`}
                    />
                  </div>
                </div>
                {children.length > 0 && isExpanded && (
                  <div className="budget-children">
                    {children.map((child) => {
                      const childSpent = spendMaps.spendSelf.get(child.id) ?? 0;
                      const childCapValue =
                        parseCapValue(capDrafts[child.id] ?? "") ??
                        capById.get(child.id);
                      const childOver =
                        childCapValue !== null && childCapValue > 0
                          ? childSpent / childCapValue
                          : null;
                      return (
                        <div
                          className={`budget-cap-row child${
                            childOver !== null && childOver >= 1 ? " over" : ""
                          }`}
                          key={child.id}
                        >
                        <div className="budget-cap-label">
                          <span className="budget-emoji">
                            {categoryIcons.get(child.id) ?? "\u{1F4CC}"}
                          </span>
                          <div className="budget-cap-text">
                            <strong>{child.name}</strong>
                            <span className="section-subtitle">
                              Speso: {formatCurrencySafe(childSpent, currency)}
                            </span>
                          </div>
                          </div>
                          <div className="budget-cap-input">
                            <input
                              className="input"
                              type="number"
                              step="0.01"
                              placeholder="CAP massimo"
                              value={capDrafts[child.id] ?? ""}
                              onChange={(event) =>
                                setCapDrafts((prev) => ({
                                  ...prev,
                                  [child.id]: event.target.value
                                }))
                              }
                              onBlur={() => handleCapBlur(child)}
                            />
                            <span>{currency}</span>
                            <input
                              className="budget-color-input"
                              type="color"
                              value={getCategoryColor(child)}
                              onChange={(event) =>
                                setColorDrafts((prev) => ({
                                  ...prev,
                                  [child.id]: event.target.value
                                }))
                              }
                              aria-label={`Colore categoria ${child.name}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {monthPickerOpen && (
        <div className="modal-backdrop" onClick={() => setMonthPickerOpen(false)}>
          <div
            className="modal-card budget-month-picker"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Seleziona mese</h3>
                <p className="section-subtitle">Scegli mese e anno rapidamente.</p>
              </div>
              <button
                className="button ghost small"
                type="button"
                onClick={() => setMonthPickerOpen(false)}
              >
                Chiudi
              </button>
            </div>
            <div className="budget-year-row">
              <button
                className="button ghost small"
                type="button"
                onClick={() => setPickerYear((prev) => prev - 1)}
              >
                {"<"}
              </button>
              <span className="budget-year-label">{pickerYear}</span>
              <button
                className="button ghost small"
                type="button"
                onClick={() => setPickerYear((prev) => prev + 1)}
              >
                {">"}
              </button>
            </div>
            <div className="budget-month-grid">
              {monthLabels.map((label, index) => {
                const key = `${pickerYear}-${String(index + 1).padStart(2, "0")}`;
                const isActive = key === activeMonth;
                return (
                  <button
                    className={`budget-month-item${isActive ? " active" : ""}`}
                    type="button"
                    key={key}
                    onClick={() => selectMonth(pickerYear, index)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Budget;
