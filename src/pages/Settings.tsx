import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  createAccount,
  createHoldings,
  createTransactions,
  deleteAccount,
  updateAccount,
  upsertSettings
} from "../lib/api";
import type { Account, AccountType, CategoryType, TransactionType } from "../types";

const accountTypes: { value: AccountType; label: string }[] = [
  { value: "bank", label: "Banca" },
  { value: "debit", label: "Carta debito" },
  { value: "credit", label: "Carta credito" },
  { value: "cash", label: "Cash" },
  { value: "paypal", label: "PayPal" },
  { value: "other", label: "Altro" }
];

const emptyAccountForm = {
  name: "",
  type: "bank" as AccountType,
  emoji: "",
  currency: "EUR",
  opening_balance: ""
};

const accountTypeLabels: Record<string, string> = {
  bank: "Banca",
  debit: "Carta debito",
  credit: "Carta credito",
  cash: "Cash",
  paypal: "PayPal",
  other: "Altro"
};

const Settings = () => {
  const { session } = useAuth();
  const { accounts, categories, transactions, holdings, settings, refresh, loading, error } =
    usePortfolioData();
  const [baseCurrency, setBaseCurrency] = useState("EUR");
  const [emergencyFund, setEmergencyFund] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  const normalizeKey = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();

  const categoryNameToId = useMemo(
    () => new Map(categories.map((item) => [normalizeKey(item.name), item.id])),
    [categories]
  );
  const accountNameToId = useMemo(
    () => new Map(accounts.map((item) => [normalizeKey(item.name), item.id])),
    [accounts]
  );

  const resolveApprox = (map: Map<string, string>, raw?: string) => {
    if (!raw) return undefined;
    const key = normalizeKey(raw);
    if (!key) return undefined;
    if (map.has(key)) return map.get(key);
    for (const [candidate, value] of map.entries()) {
      if (candidate.includes(key) || key.includes(candidate)) {
        return value;
      }
    }
    return undefined;
  };

  useEffect(() => {
    if (settings) {
      setBaseCurrency(settings.base_currency);
      setEmergencyFund(String(settings.emergency_fund));
    }
  }, [settings]);

  useEffect(() => {
    if (editingAccount) return;
    setAccountForm((prev) => ({
      ...prev,
      currency: baseCurrency
    }));
  }, [baseCurrency, editingAccount]);

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

  const resetAccountForm = () => {
    setAccountForm({ ...emptyAccountForm, currency: baseCurrency });
    setEditingAccount(null);
  };

  const handleAccountSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAccountMessage(null);
    const payload = {
      name: accountForm.name.trim(),
      type: accountForm.type,
      emoji: accountForm.emoji.trim() || null,
      currency: accountForm.currency as "EUR" | "USD",
      opening_balance: Number(accountForm.opening_balance || 0)
    };

    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, payload);
      } else {
        await createAccount(payload);
      }
      await refresh();
      setAccountMessage("Conto salvato.");
      resetAccountForm();
    } catch (err) {
      setAccountMessage((err as Error).message);
    }
  };

  const startAccountEdit = (account: Account) => {
    setEditingAccount(account);
    setAccountForm({
      name: account.name,
      type: account.type,
      emoji: account.emoji ?? "",
      currency: account.currency,
      opening_balance: String(account.opening_balance ?? 0)
    });
  };

  const removeAccount = async (id: string) => {
    setAccountMessage(null);
    try {
      await deleteAccount(id);
      await refresh();
      setAccountMessage("Conto eliminato.");
    } catch (err) {
      setAccountMessage((err as Error).message);
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
        "account_id",
        "account_name",
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
        item.account_id,
        accounts.find((account) => account.id === item.account_id)?.name ?? "",
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
        "emoji",
        "quantity",
        "avg_cost",
        "total_cap",
        "current_value",
        "currency",
        "start_date",
        "note"
      ],
      ...holdings.map((item) => [
        item.name,
        item.asset_class,
        item.emoji ?? "",
        String(item.quantity),
        String(item.avg_cost),
        String(item.total_cap),
        String(item.current_value),
        item.currency,
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
      if (accounts.length === 0) {
        setImportMessage("Crea almeno un conto prima di importare transazioni.");
        return;
      }
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setImportMessage("File vuoto o formato non valido.");
        return;
      }
      const headers = normalizeHeaders(rows[0]);
      const defaultAccountId = accounts[0]?.id ?? "";
      const payloads = rows.slice(1).map((cells) => {
        const record = headers.reduce<Record<string, string>>((acc, header, index) => {
          acc[header] = cells[index]?.trim() ?? "";
          return acc;
        }, {});
        const amountRaw = Number(record.amount ?? 0);
        const inferredType = Number.isFinite(amountRaw)
          ? amountRaw < 0
            ? "expense"
            : "income"
          : "expense";
        const type = (record.type as TransactionType) || inferredType;
        const flow =
          type === "income"
            ? "in"
            : type === "expense"
              ? "out"
              : record.flow === "in"
                ? "in"
                : "out";
        const accountId =
          record.account_id ||
          resolveApprox(accountNameToId, record.account_name) ||
          defaultAccountId;
        const categoryId =
          record.category_id || resolveApprox(categoryNameToId, record.category_name);
        const currency = record.currency === "USD" ? "USD" : "EUR";
        return {
          date: record.date,
          type,
          flow,
          account_id: accountId ?? "",
          category_id: categoryId ?? "",
          amount: Math.abs(amountRaw),
          currency,
          note: record.note || null
        };
      });
      const valid = payloads.filter(
        (item) =>
          item.date && item.account_id && item.category_id && !Number.isNaN(item.amount)
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
        const quantity = Number(record.quantity ?? 0);
        const avg_cost = Number(record.avg_cost ?? 0);
        const total_cap = record.total_cap
          ? Number(record.total_cap)
          : quantity * avg_cost;
        return {
          name: record.name,
          asset_class: record.asset_class || "Altro",
          emoji: record.emoji || null,
          quantity,
          avg_cost,
          total_cap,
          current_value: Number(record.current_value ?? 0),
          currency,
          start_date: record.start_date,
          note: record.note || null
        };
      });
      const valid = payloads.filter(
        (item) => item.name && item.start_date && !Number.isNaN(item.total_cap)
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
        <div className="section-header">
          <div>
            <h3>Conti</h3>
            <p className="section-subtitle">Carte, contanti, PayPal e altro</p>
          </div>
        </div>
        <form className="form-grid" onSubmit={handleAccountSubmit}>
          <input
            className="input"
            placeholder="Nome conto"
            value={accountForm.name}
            onChange={(event) =>
              setAccountForm({ ...accountForm, name: event.target.value })
            }
            required
          />
          <select
            className="select"
            value={accountForm.type}
            onChange={(event) =>
              setAccountForm({ ...accountForm, type: event.target.value as AccountType })
            }
          >
            {accountTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Emoji (opzionale)"
            value={accountForm.emoji}
            onChange={(event) =>
              setAccountForm({ ...accountForm, emoji: event.target.value })
            }
          />
          <select
            className="select"
            value={accountForm.currency}
            onChange={(event) =>
              setAccountForm({ ...accountForm, currency: event.target.value })
            }
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="Saldo iniziale"
            value={accountForm.opening_balance}
            onChange={(event) =>
              setAccountForm({ ...accountForm, opening_balance: event.target.value })
            }
          />
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="button" type="submit">
              {editingAccount ? "Aggiorna" : "Aggiungi"}
            </button>
            {editingAccount && (
              <button
                type="button"
                className="button secondary"
                onClick={resetAccountForm}
              >
                Annulla
              </button>
            )}
          </div>
        </form>
        {accountMessage && <div className="notice">{accountMessage}</div>}

        {accounts.length === 0 ? (
          <div className="empty">Nessun conto creato.</div>
        ) : (
          <div className="account-grid" style={{ marginTop: "16px" }}>
            {accounts.map((account) => (
              <div className="account-card" key={account.id}>
                <div className="account-meta">
                  <span className="account-emoji">
                    {account.emoji && account.emoji.trim() ? account.emoji : "O"}
                  </span>
                  <div>
                    <strong>{account.name}</strong>
                    <span className="section-subtitle">
                      {accountTypeLabels[account.type] ?? account.type}
                    </span>
                  </div>
                </div>
                <div className="account-actions">
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => startAccountEdit(account)}
                  >
                    Modifica
                  </button>
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => removeAccount(account.id)}
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
              Campi: date, type, flow, account_id o account_name, category_id o
              category_name, amount, currency, note.
            </span>
          </div>
          <div className="info-item">
            <strong>Holdings</strong>
            <span>
              Campi: name, asset_class, emoji, quantity, avg_cost, total_cap,
              current_value, currency, start_date, note.
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
