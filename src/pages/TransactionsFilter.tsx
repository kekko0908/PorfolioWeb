import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePortfolioData } from "../hooks/usePortfolioData";
import { deleteTransaction } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import type { Category, CategoryType, TransactionType } from "../types";

const weekdayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

type CategoryWithChildren = Category & { children: Category[] };

const TransactionsFilter = () => {
  const { accounts, categories, transactions, settings, refresh, loading, error } =
    usePortfolioData();
  const navigate = useNavigate();
  const [filterType, setFilterType] = useState<"all" | TransactionType>("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

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
    const parents = candidates.filter((category) => !category.parent_id);
    return parents.map((parent) => ({
      ...parent,
      children: candidates.filter((child) => child.parent_id === parent.id)
    }));
  }, [categories, filterType]);

  const filteredTransactions = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
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
      return true;
    });
  }, [
    transactions,
    filterType,
    filterCategory,
    filterStart,
    filterEnd,
    filterQuery,
    categoryMap
  ]);

  const calendarMeta = useMemo(() => {
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

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarMeta.year, calendarMeta.monthIndex, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(
      calendarMeta.year,
      calendarMeta.monthIndex + 1,
      0
    ).getDate();
    const days: Array<{ label: number; key: string } | null> = [];
    for (let i = 0; i < startOffset; i += 1) days.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${calendarMeta.year}-${calendarMeta.monthStr}-${String(day).padStart(2, "0")}`;
      days.push({ label: day, key });
    }
    return days;
  }, [calendarMeta]);

  const calendarTotals = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number }>();
    filteredTransactions.forEach((item) => {
      if (!item.date.startsWith(`${calendarMeta.year}-${calendarMeta.monthStr}`)) {
        return;
      }
      const current = totals.get(item.date) ?? { income: 0, expense: 0 };
      if (item.type === "income") current.income += item.amount;
      if (item.type === "expense") current.expense += item.amount;
      totals.set(item.date, current);
    });
    return totals;
  }, [filteredTransactions, calendarMeta]);

  const monthSummary = useMemo(() => {
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

  const shiftMonth = (delta: number) => {
    const date = new Date(calendarMeta.year, calendarMeta.monthIndex + delta, 1);
    setCalendarMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    );
  };

  const resetFilters = () => {
    setFilterType("all");
    setFilterCategory("all");
    setFilterStart("");
    setFilterEnd("");
    setFilterQuery("");
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
              onClick={() => shiftMonth(-1)}
            >
              {"<"}
            </button>
            <div className="calendar-title">
              <strong>{calendarMeta.monthLabel}</strong>
              <div className="calendar-summary">
                <span className="calendar-income">
                  +{formatCurrency(monthSummary.income, currency)}
                </span>
                <span className="calendar-expense">
                  -{formatCurrency(monthSummary.expense, currency)}
                </span>
              </div>
            </div>
            <div className="calendar-actions">
              <input
                className="input"
                type="month"
                value={calendarMonth}
                onChange={(event) => setCalendarMonth(event.target.value)}
              />
              <button
                className="button ghost small"
                type="button"
                onClick={() => shiftMonth(1)}
              >
                {">"}
              </button>
            </div>
          </div>

          <div className="calendar-grid">
            {weekdayLabels.map((label) => (
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
                <div className="calendar-day" key={day.key}>
                  <span className="calendar-date">{day.label}</span>
                  <div className="calendar-values">
                    <span className="calendar-income">
                      {totals?.income
                        ? `+${formatCurrency(totals.income, currency)}`
                        : "n/d"}
                    </span>
                    <span className="calendar-expense">
                      {totals?.expense
                        ? `-${formatCurrency(totals.expense, currency)}`
                        : "n/d"}
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
    </div>
  );
};

export default TransactionsFilter;
