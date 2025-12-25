import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePortfolioData } from "../hooks/usePortfolioData";
import { createHoldings, createTransactions, upsertSettings } from "../lib/api";
import type { CategoryType } from "../types";

const Settings = () => {
  const { session } = useAuth();
  const { categories, transactions, holdings, settings, refresh, loading, error } =
    usePortfolioData();
  const [baseCurrency, setBaseCurrency] = useState("EUR");
  const [emergencyFund, setEmergencyFund] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const categoryNameToId = useMemo(
    () => new Map(categories.map((item) => [item.name.toLowerCase(), item.id])),
    [categories]
  );

  useEffect(() => {
    if (settings) {
      setBaseCurrency(settings.base_currency);
      setEmergencyFund(String(settings.emergency_fund));
    }
  }, [settings]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!session) return;

    try {
      await upsertSettings({
        user_id: session.user.id,
        base_currency: baseCurrency as "EUR" | "USD",
        emergency_fund: Number(emergencyFund)
      });
      await refresh();
      setMessage("Impostazioni aggiornate.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const escapeCsv = (value: string, delimiter: string) => {
    const needsQuotes = value.includes(delimiter) || value.includes("\"") || value.includes("\n");
    const escaped = value.replace(/\"/g, "\"\"");
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const toCsv = (rows: string[][], delimiter = ";") =>
    rows.map((row) => row.map((value) => escapeCsv(value, delimiter)).join(delimiter)).join("\n");

  const downloadCsv = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleExportTransactions = () => {
    const rows = [
      [
        "date",
        "type",
        "flow",
        "category_id",
        "category_name",
        "amount",
        "currency",
        "note"
      ],
      ...transactions.map((item) => [
        item.date,
        item.type,
        item.flow,
        item.category_id,
        categories.find((category) => category.id === item.category_id)?.name ?? "",
        String(item.amount),
        item.currency,
        item.note ?? ""
      ])
    ];
    downloadCsv("transactions.csv", toCsv(rows));
  };

  const handleExportHoldings = () => {
    const rows = [
      [
        "name",
        "asset_class",
        "cost_basis",
        "current_value",
        "currency",
        "pe_ratio",
        "start_date",
        "note"
      ],
      ...holdings.map((item) => [
        item.name,
        item.asset_class,
        String(item.cost_basis),
        String(item.current_value),
        item.currency,
        item.pe_ratio ? String(item.pe_ratio) : "",
        item.start_date,
        item.note ?? ""
      ])
    ];
    downloadCsv("holdings.csv", toCsv(rows));
  };

  const handleExportCategories = () => {
    const rows = [
      ["name", "type", "parent_name", "is_fixed", "sort_order"],
      ...categories.map((item) => [
        item.name,
        item.type,
        item.parent_id
          ? categories.find((category) => category.id === item.parent_id)?.name ?? ""
          : "",
        item.is_fixed ? "true" : "false",
        item.sort_order ? String(item.sort_order) : ""
      ])
    ];
    downloadCsv("categories.csv", toCsv(rows));
  };

  const parseCsv = (text: string, delimiter = ";") => {
    const rows: string[][] = [];
    let current = "";
    let row: string[] = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (char === "\"" && next === "\"") {
        current += "\"";
        i += 1;
        continue;
      }
      if (char === "\"") {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && (char === "\n" || char === "\r")) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(current);
        rows.push(row);
        row = [];
        current = "";
        continue;
      }
      if (!inQuotes && char === delimiter) {
        row.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    if (current.length > 0 || row.length > 0) {
      row.push(current);
      rows.push(row);
    }
    return rows.filter((items) => items.some((value) => value.trim() !== ""));
  };

  const normalizeHeaders = (headers: string[]) =>
    headers.map((header) => header.trim().toLowerCase());

  const handleImportTransactions = async (file: File) => {
    setImportMessage(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setImportMessage("File vuoto o formato non valido.");
        return;
      }
      const headers = normalizeHeaders(rows[0]);
      const payloads = rows.slice(1).map((cells) => {
        const record = headers.reduce<Record<string, string>>((acc, header, index) => {
          acc[header] = cells[index]?.trim() ?? "";
          return acc;
        }, {});
        const type = (record.type as CategoryType) || "expense";
        const flow =
          type === "income"
            ? "in"
            : type === "expense"
              ? "out"
              : record.flow === "in"
                ? "in"
                : "out";
        const categoryId =
          record.category_id ||
          (record.category_name
            ? categoryNameToId.get(record.category_name.toLowerCase())
            : undefined);
        const currency = record.currency === "USD" ? "USD" : "EUR";
        return {
          date: record.date,
          type,
          flow,
          category_id: categoryId ?? "",
          amount: Number(record.amount ?? 0),
          currency,
          note: record.note || null
        };
      });
      const valid = payloads.filter(
        (item) => item.date && item.category_id && !Number.isNaN(item.amount)
      );
      await createTransactions(valid);
      await refresh();
      setImportMessage(`Importate ${valid.length} transazioni.`);
    } catch (err) {
      setImportMessage((err as Error).message);
    }
  };

  const handleImportHoldings = async (file: File) => {
    setImportMessage(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setImportMessage("File vuoto o formato non valido.");
        return;
      }
      const headers = normalizeHeaders(rows[0]);
      const payloads = rows.slice(1).map((cells) => {
        const record = headers.reduce<Record<string, string>>((acc, header, index) => {
          acc[header] = cells[index]?.trim() ?? "";
          return acc;
        }, {});
        const currency = record.currency === "USD" ? "USD" : "EUR";
        return {
          name: record.name,
          asset_class: record.asset_class || "Altro",
          cost_basis: Number(record.cost_basis ?? 0),
          current_value: Number(record.current_value ?? 0),
          currency,
          pe_ratio: record.pe_ratio ? Number(record.pe_ratio) : null,
          start_date: record.start_date,
          note: record.note || null
        };
      });
      const valid = payloads.filter(
        (item) => item.name && item.start_date && !Number.isNaN(item.cost_basis)
      );
      await createHoldings(valid);
      await refresh();
      setImportMessage(`Importate ${valid.length} holdings.`);
    } catch (err) {
      setImportMessage((err as Error).message);
    }
  };

  if (loading) {
    return <div className="card">Caricamento impostazioni...</div>;
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2 className="section-title">Impostazioni</h2>
          <p className="section-subtitle">Valute e configurazioni chiave</p>
        </div>
      </div>

      <div className="card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <select
            className="select"
            value={baseCurrency}
            onChange={(event) => setBaseCurrency(event.target.value)}
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="Fondo emergenza"
            value={emergencyFund}
            onChange={(event) => setEmergencyFund(event.target.value)}
          />
          <button className="button" type="submit">
            Salva impostazioni
          </button>
        </form>
        {message && <div className="notice">{message}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      <div className="card">
        <h3>Import / Export dati (CSV)</h3>
        <div className="info-panel">
          <div className="info-item">
            <strong>Formato CSV</strong>
            <span>
              Delimitatore consigliato: <code>;</code> (compatibile con Excel).
            </span>
          </div>
          <div className="info-item">
            <strong>Transazioni</strong>
            <span>
              Campi: date, type, flow, category_id o category_name, amount, currency,
              note.
            </span>
          </div>
          <div className="info-item">
            <strong>Holdings</strong>
            <span>
              Campi: name, asset_class, cost_basis, current_value, currency, pe_ratio,
              start_date, note.
            </span>
          </div>
        </div>

        <div className="grid-3" style={{ marginTop: "16px" }}>
          <button className="button secondary" type="button" onClick={handleExportTransactions}>
            Esporta transazioni
          </button>
          <button className="button secondary" type="button" onClick={handleExportHoldings}>
            Esporta holdings
          </button>
          <button className="button secondary" type="button" onClick={handleExportCategories}>
            Esporta categorie
          </button>
        </div>

        <div className="grid-2" style={{ marginTop: "16px" }}>
          <label>
            Importa transazioni (CSV)
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleImportTransactions(file);
              }}
            />
          </label>
          <label>
            Importa holdings (CSV)
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleImportHoldings(file);
              }}
            />
          </label>
        </div>

        {importMessage && <div className="notice">{importMessage}</div>}
      </div>
    </div>
  );
};

export default Settings;
