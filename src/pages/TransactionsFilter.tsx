import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePortfolioData } from "../hooks/usePortfolioData";
import { deleteTransaction } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import { filterBalanceCorrectionTransactions } from "../lib/metrics";
import type { Category, TransactionType } from "../types";

const weekdayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const correctionCategoryName = "Correzione Saldo";

const normalizeKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

const correctionKey = normalizeKey(correctionCategoryName);

const isCorrectionCategory = (category: Category) =>
  normalizeKey(category.name) === correctionKey;

type CategoryWithChildren = Category & { children: Category[] };
type CalendarView = "month" | "week" | "year";
type CalendarDay = { label: string; key: string };

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const getISOWeek = (date: Date) => {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: temp.getUTCFullYear(), week: weekNo };
};

const formatWeekInput = (date: Date) => {
  const { year, week } = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
};

const getWeekStart = (weekValue: string) => {
  const match = weekValue.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return new Date();
  const year = Number(match[1]);
  const week = Number(match[2]);
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const day = simple.getDay();
  const diff = day <= 4 ? 1 - day : 8 - day;
  const monday = new Date(simple);
  monday.setDate(simple.getDate() + diff);
  return monday;
};

const TransactionsFilter = () => {
  const { accounts, categories, transactions, settings, refresh, loading, error } =
    usePortfolioData();
  const navigate = useNavigate();
  const [filterType, setFilterType] = useState<"all" | TransactionType>("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [calendarWeek, setCalendarWeek] = useState(() => formatWeekInput(new Date()));
  const [calendarYear, setCalendarYear] = useState(
    () => String(new Date().getFullYear())
  );
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());

  const currency = settings?.base_currency ?? "EUR";

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );
  const accountMap = useMemo(
    () =>
      new Map(
        accounts.map((account) => [
          account.id,
          `${account.emoji ? `${account.emoji} ` : ""}${account.name}`
        ])
      ),
    [accounts]
  );

  const filterCategoryOptions = useMemo<CategoryWithChildren[]>(() => {
    const candidates =
      filterType === "all" || filterType === "transfer"
        ? categories
        : categories.filter((category) => category.type === filterType);
    const visible = candidates.filter((category) => !isCorrectionCategory(category));
    const parents = visible.filter((category) => !category.parent_id);
    return parents.map((parent) => ({
      ...parent,
      children: visible.filter((child) => child.parent_id === parent.id)
    }));
  }, [categories, filterType]);

  const filteredTransactions = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    const tagQuery = filterTag.trim().toLowerCase();
    const tagTokens = tagQuery
      ? tagQuery.split(",").map((value) => value.trim()).filter(Boolean)
      : [];
    return transactions.filter((item) => {
      if (filterType !== "all" && item.type !== filterType) return false;
      if (filterCategory !== "all" && item.category_id !== filterCategory) return false;
      if (filterStart && item.date < filterStart) return false;
      if (filterEnd && item.date > filterEnd) return false;
      if (query) {
        const categoryName = categoryMap.get(item.category_id)?.toLowerCase() ?? "";
        const note = item.note?.toLowerCase() ?? "";
        if (!categoryName.includes(query) && !note.includes(query)) return false;
      }
      if (tagTokens.length > 0) {
        const tags = item.tags ?? [];
        const lowerTags = tags.map((tag) => tag.toLowerCase());
        const hasTag = tagTokens.some((token) =>
          lowerTags.some((tag) => tag.includes(token))
        );
        if (!hasTag) return false;
      }
      return true;
    });
  }, [
    transactions,
    filterType,
    filterCategory,
    filterStart,
    filterEnd,
    filterQuery,
    filterTag,
    categoryMap
  ]);

  const totalTransactions = useMemo(
    () => filterBalanceCorrectionTransactions(filteredTransactions, categories),
    [filteredTransactions, categories]
  );

  const monthMeta = useMemo(() => {
    const [yearRaw, monthRaw] = calendarMonth.split("-");
    const year = Number(yearRaw);
    const monthIndex = Number(monthRaw) - 1;
    const monthLabel = new Intl.DateTimeFormat("it-IT", {
      month: "long",
      year: "numeric"
    }).format(new Date(year, monthIndex, 1));
    return {
      year,
      monthIndex,
      monthStr: String(monthIndex + 1).padStart(2, "0"),
      monthLabel
    };
  }, [calendarMonth]);

  const monthLabels = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) =>
        new Intl.DateTimeFormat("it-IT", { month: "short" }).format(
          new Date(2020, index, 1)
        )
      ),
    []
  );

  const weekMeta = useMemo(() => {
    const weekStart = getWeekStart(calendarWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekNumber = calendarWeek.split("-W")[1] ?? "";
    const rangeFormatter = new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "short"
    });
    const label = `Settimana ${weekNumber} - ${rangeFormatter.format(
      weekStart
    )} / ${rangeFormatter.format(weekEnd)}`;
    return {
      weekStart,
      weekEnd,
      weekStartKey: formatDateKey(weekStart),
      weekEndKey: formatDateKey(weekEnd),
      label
    };
  }, [calendarWeek]);

  const yearMeta = useMemo(() => {
    const yearValue = Number(calendarYear);
    const safeYear =
      Number.isFinite(yearValue) && calendarYear !== ""
        ? yearValue
        : new Date().getFullYear();
    return {
      year: safeYear,
      label: `Anno ${safeYear}`
    };
  }, [calendarYear]);

  const calendarLabel =
    calendarView === "month"
      ? monthMeta.monthLabel
      : calendarView === "week"
        ? weekMeta.label
        : yearMeta.label;

  const calendarDays = useMemo(() => {
    if (calendarView === "year") {
      const formatter = new Intl.DateTimeFormat("it-IT", { month: "short" });
      return Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, "0");
        const date = new Date(yearMeta.year, index, 1);
        return {
          label: formatter.format(date),
          key: `${yearMeta.year}-${month}`
        };
      });
    }
    if (calendarView === "week") {
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekMeta.weekStart);
        date.setDate(weekMeta.weekStart.getDate() + index);
        return {
          label: String(date.getDate()),
          key: formatDateKey(date)
        };
      });
    }
    const firstDay = new Date(monthMeta.year, monthMeta.monthIndex, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(monthMeta.year, monthMeta.monthIndex + 1, 0).getDate();
    const days: Array<CalendarDay | null> = [];
    for (let i = 0; i < startOffset; i += 1) days.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${monthMeta.year}-${monthMeta.monthStr}-${String(day).padStart(2, "0")}`;
      days.push({ label: String(day), key });
    }
    return days;
  }, [calendarView, monthMeta, weekMeta, yearMeta]);

  const calendarTotals = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number }>();
    totalTransactions.forEach((item) => {
      if (calendarView === "month") {
        if (!item.date.startsWith(`${monthMeta.year}-${monthMeta.monthStr}`)) {
          return;
        }
      } else if (calendarView === "week") {
        if (item.date < weekMeta.weekStartKey || item.date > weekMeta.weekEndKey) {
          return;
        }
      } else if (!item.date.startsWith(`${yearMeta.year}-`)) {
        return;
      }
      const key = calendarView === "year" ? item.date.slice(0, 7) : item.date;
      const current = totals.get(key) ?? { income: 0, expense: 0 };
      if (item.type === "income") current.income += item.amount;
      if (item.type === "expense") current.expense += item.amount;
      totals.set(key, current);
    });
    return totals;
  }, [totalTransactions, calendarView, monthMeta, weekMeta, yearMeta]);

  const calendarSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    calendarTotals.forEach((value) => {
      income += value.income;
      expense += value.expense;
    });
    return { income, expense };
  }, [calendarTotals]);

  useEffect(() => {
    setFilterCategory("all");
  }, [filterType]);

  useEffect(() => {
    if (!monthPickerOpen) return;
    setPickerYear(monthMeta.year);
  }, [monthPickerOpen, monthMeta.year]);

  const shiftCalendar = (delta: number) => {
    if (calendarView === "month") {
      const date = new Date(monthMeta.year, monthMeta.monthIndex + delta, 1);
      setCalendarMonth(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      );
      return;
    }
    if (calendarView === "week") {
      const date = new Date(weekMeta.weekStart);
      date.setDate(weekMeta.weekStart.getDate() + delta * 7);
      setCalendarWeek(formatWeekInput(date));
      return;
    }
    const nextYear = yearMeta.year + delta;
    setCalendarYear(String(nextYear));
  };

  const selectMonth = (year: number, index: number) => {
    const nextKey = `${year}-${String(index + 1).padStart(2, "0")}`;
    setCalendarMonth(nextKey);
    setMonthPickerOpen(false);
  };

  const resetFilters = () => {
    setFilterType("all");
    setFilterCategory("all");
    setFilterStart("");
    setFilterEnd("");
    setFilterQuery("");
    setFilterTag("");
  };

  const handleEdit = (id: string) => {
    navigate(`/transactions?edit=${id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
      await refresh();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="card">Caricamento filtri...</div>;
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2 className="section-title">Filtra per</h2>
          <p className="section-subtitle">
            Calendario, filtri e ricerca avanzata sulle transazioni
          </p>
        </div>
        <span className="pill">{filteredTransactions.length} risultati</span>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card search-panel">
        <div className="filter-group">
          <div className="filter-subheader">
            <strong>Calendario</strong>
            <span className="section-subtitle">Verde entrate, rosso uscite</span>
          </div>
          <div className="calendar-header">
            <button
              className="button ghost small"
              type="button"
              onClick={() => shiftCalendar(-1)}
            >
              {"<"}
            </button>
            <div className="calendar-title">
              {calendarView === "month" ? (
                <button
                  className="budget-month-label"
                  type="button"
                  onClick={() => setMonthPickerOpen(true)}
                >
                  {calendarLabel}
                </button>
              ) : (
                <strong>{calendarLabel}</strong>
              )}
              <div className="calendar-summary">
                <span className="calendar-income">
                  +{formatCurrency(calendarSummary.income, currency)}
                </span>
                <span className="calendar-expense">
                  -{formatCurrency(calendarSummary.expense, currency)}
                </span>
              </div>
            </div>
            <div className="calendar-actions">
              <div className="calendar-view-toggle">
                {[
                  { key: "month", label: "Mese" },
                  { key: "week", label: "Settimana" },
                  { key: "year", label: "Anno" }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`filter-chip ${
                      calendarView === item.key ? "active" : ""
                    }`}
                    onClick={() => setCalendarView(item.key as CalendarView)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {calendarView === "week" && (
                <input
                  className="input"
                  type="week"
                  value={calendarWeek}
                  onChange={(event) => setCalendarWeek(event.target.value)}
                />
              )}
              {calendarView === "year" && (
                <div className="budget-year-row calendar-year-row">
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => setCalendarYear(String(yearMeta.year - 1))}
                  >
                    {"<"}
                  </button>
                  <span className="budget-year-label">{yearMeta.year}</span>
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => setCalendarYear(String(yearMeta.year + 1))}
                  >
                    {">"}
                  </button>
                </div>
              )}
              <button
                className="button ghost small"
                type="button"
                onClick={() => shiftCalendar(1)}
              >
                {">"}
              </button>
            </div>
          </div>

          <div className={`calendar-grid ${calendarView}`}>
            {calendarView !== "year" &&
              weekdayLabels.map((label) => (
                <div className="calendar-weekday" key={label}>
                  {label}
                </div>
              ))}
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div className="calendar-day empty" key={`empty-${index}`} />;
              }
              const totals = calendarTotals.get(day.key);
              return (
                <div
                  className={`calendar-day ${calendarView === "year" ? "year" : ""}`}
                  key={day.key}
                >
                  <span className="calendar-date">{day.label}</span>
                  <div className="calendar-values">
                    <span className="calendar-income">
                      {totals?.income
                        ? `+${formatCurrency(totals.income, currency)}`
                        : "-"}
                    </span>
                    <span className="calendar-expense">
                      {totals?.expense
                        ? `-${formatCurrency(totals.expense, currency)}`
                        : "-"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-subheader">
            <strong>Filtri</strong>
            <span className="section-subtitle">Tipo, categoria, date e testo</span>
          </div>
          <div className="filter-bar">
            <div className="filter-tabs">
              {[
                { key: "all", label: "Tutte" },
                { key: "income", label: "Entrate" },
                { key: "expense", label: "Uscite" },
                { key: "investment", label: "Investimenti" },
                { key: "transfer", label: "Trasferimenti" }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`filter-chip ${filterType === item.key ? "active" : ""}`}
                  onClick={() => setFilterType(item.key as "all" | TransactionType)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="filter-controls">
              <select
                className="select"
                value={filterCategory}
                onChange={(event) => setFilterCategory(event.target.value)}
                disabled={filterType === "transfer"}
              >
                <option value="all">Tutte le categorie</option>
                {filterCategoryOptions.map((parent) => (
                  <optgroup key={parent.id} label={parent.name}>
                    {parent.children.length > 0 ? (
                      parent.children.map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.name}
                        </option>
                      ))
                    ) : (
                      <option value={parent.id}>{parent.name}</option>
                    )}
                  </optgroup>
                ))}
              </select>
              <input
                className="input"
                type="date"
                value={filterStart}
                onChange={(event) => setFilterStart(event.target.value)}
              />
              <input
                className="input"
                type="date"
                value={filterEnd}
                onChange={(event) => setFilterEnd(event.target.value)}
              />
              <input
                className="input"
                type="search"
                placeholder="Cerca note o categoria"
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.target.value)}
              />
              <input
                className="input"
                type="search"
                placeholder="Tag (comma)"
                value={filterTag}
                onChange={(event) => setFilterTag(event.target.value)}
              />
              <button className="button ghost small" type="button" onClick={resetFilters}>
                Reset filtri
              </button>
            </div>
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-subheader">
            <strong>Risultati</strong>
            <span className="section-subtitle">Lista transazioni filtrata</span>
          </div>
          {filteredTransactions.length === 0 ? (
            <div className="empty">Nessuna transazione per questi filtri.</div>
          ) : (
            <div className="transaction-list">
              {filteredTransactions.map((item) => {
                const category = categoryMap.get(item.category_id) ?? "-";
                const account = accountMap.get(item.account_id) ?? "Conto";
                const isOut =
                  item.type === "expense" ||
                  (item.type === "investment" && item.flow === "out") ||
                  (item.type === "transfer" && item.flow === "out");
                const amount = isOut ? -item.amount : item.amount;
                const typeLabel =
                  item.type === "income"
                    ? "Entrata"
                    : item.type === "expense"
                      ? "Uscita"
                      : item.type === "investment"
                        ? item.flow === "in"
                          ? "Ritorno"
                          : "Output capitale"
                        : "Trasferimento";

                return (
                  <div className="transaction-row" key={item.id}>
                    <div className="transaction-meta">
                      <span className="transaction-date">{formatDate(item.date)}</span>
                      <strong className="transaction-category">{category}</strong>
                      <span className="transaction-note">
                        {item.note ?? "Nessuna nota"}
                      </span>
                    </div>
                    <div className="transaction-tags">
                      <span className={`chip ${item.type}`}>{typeLabel}</span>
                      <span className="chip">{account}</span>
                      <span
                        className={`transaction-amount ${
                          isOut ? "negative" : "positive"
                        }`}
                      >
                        {formatCurrency(amount, item.currency)}
                      </span>
                    </div>
                    <div className="transaction-actions">
                      {item.type !== "transfer" && (
                        <button
                          className="button ghost small"
                          type="button"
                          onClick={() => handleEdit(item.id)}
                        >
                          Modifica
                        </button>
                      )}
                      <button
                        className="button ghost small"
                        type="button"
                        onClick={() => handleDelete(item.id)}
                      >
                        Elimina
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                const isActive = key === calendarMonth;
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

export default TransactionsFilter;
