import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePortfolioData } from "../hooks/usePortfolioData";
import {
  createAccount,
  createTransaction,
  createHoldings,
  createTransactions,
  deleteAccount,
  updateAccount,
  upsertSettings
} from "../lib/api";
import {
  buildStorageAvatarRef,
  getAvatarPathFromRef,
  isStorageAvatarRef,
  resolveAvatarRefUrl,
  uploadAvatarFile
} from "../lib/avatar";
import { buildAccountBalances } from "../lib/metrics";
import { supabase } from "../lib/supabaseClient";
import type {
  Account,
  AccountType,
  Currency,
  FlowDirection,
  Transaction,
  TransactionType
} from "../types";

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

const dicebearStyles = [
  { value: "adventurer", label: "Adventurer" },
  { value: "avataaars", label: "Avataaars" },
  { value: "bottts", label: "Bottts" },
  { value: "croodles", label: "Croodles" }
];

const defaultDicebearSeeds = [
  "Luna",
  "Milo",
  "Nova",
  "Axel",
  "Iris",
  "Leo",
  "Nora",
  "Zoe",
  "Kai",
  "Enea",
  "Maya",
  "Sole"
];
const maxAvatarEntries = 12;
const correctionCategoryName = "Correzione Saldo";
const refundCategoryName = "Rimborso";

const categoryAliasMap: Record<string, string> = {
  regali: "Regali in denaro ricevuti",
  stipendio: "Stipendio Netto",
  shopping: "Shopping (Vestiti, Scarpe, Accessori)",
  cibobevande: "Spesa Supermercato",
  veicoli: "Carburante",
  salute: "Farmacia & Medicine",
  cura: "Igiene Personale & Cosmetica",
  abbonamenti: "Abbonamenti (Streaming, Cloud, App)"
};

type ProfilePayload = {
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_path?: string | null;
  favorite_avatars?: string[];
  recent_avatars?: string[];
};

const Settings = () => {
  const { session } = useAuth();
  const { accounts, categories, transactions, holdings, settings, refresh, loading, error } =
    usePortfolioData();
  const maxHoldingSortOrder = useMemo(
    () => holdings.reduce((max, item) => Math.max(max, item.sort_order ?? 0), 0),
    [holdings]
  );
  const [baseCurrency, setBaseCurrency] = useState("EUR");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingBalanceOriginal, setEditingBalanceOriginal] = useState<number | null>(
    null
  );
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarStyle, setAvatarStyle] = useState("adventurer");
  const [customSeed, setCustomSeed] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [favoriteAvatars, setFavoriteAvatars] = useState<string[]>([]);
  const [recentAvatars, setRecentAvatars] = useState<string[]>([]);
  const [avatarRef, setAvatarRef] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrlMap, setAvatarUrlMap] = useState<Record<string, string>>({});
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [avatarPanelOpen, setAvatarPanelOpen] = useState(false);

  const accountBalances = useMemo(
    () => buildAccountBalances(accounts, transactions),
    [accounts, transactions]
  );

  const isSystemAccount = (account: Account) =>
    /emergenza|emergency/i.test(account.name);

  const normalizeKey = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();

  const getCorrectionCategoryId = async (type: "income" | "expense") => {
    const targetKey = normalizeKey(correctionCategoryName);
    const existing = categories.find(
      (item) => item.type === type && normalizeKey(item.name) === targetKey
    );
    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("categories")
      .insert({ name: correctionCategoryName, type })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };

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
    }
  }, [settings]);

  useEffect(() => {
    setProfileLoaded(false);
    setFavoriteAvatars([]);
    setRecentAvatars([]);
    setAvatarRef("");
    setAvatarPath(null);
    setAvatarUrlMap({});
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user || profileLoaded) return;
    let isActive = true;

    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name, avatar_url, avatar_path, favorite_avatars, recent_avatars")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (error) throw error;
        if (!data || !isActive) return;

        if (typeof data.display_name === "string") {
          setDisplayName(data.display_name);
        }

        const profileAvatarRef = data.avatar_path
          ? buildStorageAvatarRef(data.avatar_path)
          : typeof data.avatar_url === "string"
            ? data.avatar_url
            : "";

        if (profileAvatarRef) {
          setAvatarRef(profileAvatarRef);
          setAvatarPath(data.avatar_path ?? null);
          const resolvedUrl = await resolveAvatarRefUrl(profileAvatarRef);
          if (resolvedUrl && isActive) {
            setAvatarUrl(resolvedUrl);
            setAvatarUrlMap((prev) => ({ ...prev, [profileAvatarRef]: resolvedUrl }));
          }
        }

        const favorites = Array.isArray(data.favorite_avatars)
          ? data.favorite_avatars.filter((item) => typeof item === "string")
          : [];
        const recents = Array.isArray(data.recent_avatars)
          ? data.recent_avatars.filter((item) => typeof item === "string")
          : [];

        setFavoriteAvatars(favorites);
        setRecentAvatars(recents);
      } catch {
        // Profile is optional; keep defaults when missing.
      } finally {
        if (isActive) setProfileLoaded(true);
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, [profileLoaded, session]);

  useEffect(() => {
    if (!session?.user) return;
    const metadata = session.user.user_metadata ?? {};
    if (!profileLoaded) {
      const metadataName =
        typeof metadata.display_name === "string" ? metadata.display_name : "";
      const metadataAvatarUrl =
        typeof metadata.avatar_url === "string" ? metadata.avatar_url : "";
      setDisplayName(metadataName);
      setAvatarUrl(metadataAvatarUrl);
      setAvatarRef(metadataAvatarUrl);
    }
    setEmailDraft(session.user.email ?? "");
  }, [profileLoaded, session]);

  useEffect(() => {
    const refs = Array.from(
      new Set([avatarRef, ...favoriteAvatars, ...recentAvatars])
    ).filter((ref) => typeof ref === "string" && ref.length > 0);
    const pendingRefs = refs.filter(
      (ref) => isStorageAvatarRef(ref) && !avatarUrlMap[ref]
    );
    if (pendingRefs.length === 0) return;
    let isActive = true;

    const resolveRefs = async () => {
      const entries = await Promise.all(
        pendingRefs.map(async (ref) => [ref, await resolveAvatarRefUrl(ref)] as const)
      );
      if (!isActive) return;
      setAvatarUrlMap((prev) => {
        const next = { ...prev };
        entries.forEach(([ref, url]) => {
          if (url) next[ref] = url;
        });
        return next;
      });
    };

    resolveRefs();

    return () => {
      isActive = false;
    };
  }, [avatarRef, avatarUrlMap, favoriteAvatars, recentAvatars]);

  useEffect(() => {
    if (editingAccount) return;
    setAccountForm((prev) => ({
      ...prev,
      currency: baseCurrency
    }));
  }, [baseCurrency, editingAccount]);

  const handleProfileSave = async (event: FormEvent) => {
    event.preventDefault();
    setProfileMessage(null);
    if (!session?.user) return;
    try {
      const trimmedDisplayName = displayName.trim();
      const trimmedAvatarRef = avatarRef.trim();
      const avatarFields = {
        avatar_url: null as string | null,
        avatar_path: null as string | null
      };

      if (trimmedAvatarRef) {
        if (isStorageAvatarRef(trimmedAvatarRef)) {
          avatarFields.avatar_path = getAvatarPathFromRef(trimmedAvatarRef);
        } else {
          avatarFields.avatar_url = trimmedAvatarRef;
        }
      }

      let metadataAvatarUrl = avatarUrl.trim();
      if (!metadataAvatarUrl && trimmedAvatarRef && isStorageAvatarRef(trimmedAvatarRef)) {
        const resolved = await resolveAndCacheAvatarUrl(trimmedAvatarRef);
        if (resolved) {
          metadataAvatarUrl = resolved;
          setAvatarUrl(resolved);
        }
      }

      const nextRecents = trimmedAvatarRef
        ? [trimmedAvatarRef, ...recentAvatars.filter((item) => item !== trimmedAvatarRef)].slice(
            0,
            maxAvatarEntries
          )
        : recentAvatars;

      if (trimmedAvatarRef) {
        setRecentAvatars(nextRecents);
      }

      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: trimmedDisplayName || null,
          avatar_url: metadataAvatarUrl || null
        }
      });
      if (error) throw error;

      await persistProfile(
        {
          display_name: trimmedDisplayName || null,
          ...avatarFields,
          favorite_avatars: favoriteAvatars,
          recent_avatars: nextRecents
        },
        false
      );

      await upsertSettings({
        user_id: session.user.id,
        base_currency: baseCurrency as "EUR" | "USD",
        emergency_fund: settings?.emergency_fund ?? 0
      });
      await refresh();

      setProfileMessage("Profilo e impostazioni aggiornate.");
    } catch (err) {
      setProfileMessage((err as Error).message);
    }
  };

  const handleEmailUpdate = async (event: FormEvent) => {
    event.preventDefault();
    setEmailMessage(null);
    if (!session) return;
    const nextEmail = emailDraft.trim();
    if (!nextEmail) {
      setEmailMessage("Inserisci una email valida.");
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ email: nextEmail });
      if (error) throw error;
      setEmailMessage("Email aggiornata. Controlla la posta per confermare.");
    } catch (err) {
      setEmailMessage((err as Error).message);
    }
  };

  const handlePasswordUpdate = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    if (!session) return;
    if (!passwordDraft || passwordDraft.length < 6) {
      setPasswordMessage("La password deve avere almeno 6 caratteri.");
      return;
    }
    if (passwordDraft !== passwordConfirm) {
      setPasswordMessage("Le password non coincidono.");
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordDraft });
      if (error) throw error;
      setPasswordDraft("");
      setPasswordConfirm("");
      setPasswordMessage("Password aggiornata.");
    } catch (err) {
      setPasswordMessage((err as Error).message);
    }
  };

  const handleAvatarFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !session?.user) return;
    try {
      const upload = await uploadAvatarFile(session.user.id, file);
      if (upload.url) {
        setAvatarUrl(upload.url);
        setAvatarUrlMap((prev) => ({ ...prev, [upload.ref]: upload.url }));
      }
      setAvatarRef(upload.ref);
      setAvatarPath(upload.path);
      pushRecentAvatar(upload.ref);
    } catch (err) {
      setProfileMessage((err as Error).message);
    }
  };

  const buildDicebearUrl = (style: string, seed: string) =>
    `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

  const dicebearSeeds = useMemo(() => {
    const emailSeed = emailDraft.split("@")[0] ?? "";
    const preferredSeed = displayName.trim() || emailSeed.trim();
    const seeds = preferredSeed ? [preferredSeed, ...defaultDicebearSeeds] : defaultDicebearSeeds;
    return Array.from(new Set(seeds.filter((seed) => seed))).slice(0, maxAvatarEntries);
  }, [displayName, emailDraft]);

  const getAvatarLabel = (url: string, fallback: string) => {
    const seedMatch = url.match(/[?&]seed=([^&]+)/);
    if (seedMatch && seedMatch[1]) {
      try {
        return decodeURIComponent(seedMatch[1]);
      } catch {
        return seedMatch[1];
      }
    }
    return fallback;
  };

  const getAvatarDisplayUrl = (ref: string) => {
    if (!ref) return "";
    if (!isStorageAvatarRef(ref)) return ref;
    if (ref === avatarRef && avatarUrl) return avatarUrl;
    return avatarUrlMap[ref] ?? "";
  };

  const resolveAndCacheAvatarUrl = async (ref: string) => {
    if (avatarUrlMap[ref]) return avatarUrlMap[ref];
    const resolved = await resolveAvatarRefUrl(ref);
    if (resolved) {
      setAvatarUrlMap((prev) => (prev[ref] === resolved ? prev : { ...prev, [ref]: resolved }));
    }
    return resolved;
  };

  const selectAvatarRef = async (ref: string) => {
    if (!ref) return;
    setAvatarRef(ref);
    if (isStorageAvatarRef(ref)) {
      const path = getAvatarPathFromRef(ref);
      setAvatarPath(path);
      const resolved = await resolveAndCacheAvatarUrl(ref);
      if (resolved) setAvatarUrl(resolved);
    } else {
      setAvatarPath(null);
      setAvatarUrl(ref);
    }
  };

  const persistProfile = async (payload: ProfilePayload, silent = true) => {
    if (!session?.user) return;
    try {
      const { error } = await supabase.from("profiles").upsert(
        {
          user_id: session.user.id,
          ...payload
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    } catch (err) {
      if (!silent) {
        throw err;
      }
    }
  };

  const pushRecentAvatar = (ref: string) => {
    if (!ref) return;
    setRecentAvatars((prev) => {
      const next = [ref, ...prev.filter((item) => item !== ref)].slice(0, maxAvatarEntries);
      void persistProfile({ recent_avatars: next });
      return next;
    });
  };

  const toggleFavoriteAvatar = (ref: string) => {
    if (!ref) return;
    setFavoriteAvatars((prev) => {
      const exists = prev.includes(ref);
      const next = exists
        ? prev.filter((item) => item !== ref)
        : [ref, ...prev].slice(0, maxAvatarEntries);
      void persistProfile({ favorite_avatars: next });
      return next;
    });
  };

  const handleAvatarPick = (seed: string) => {
    const url = buildDicebearUrl(avatarStyle, seed);
    setAvatarRef(url);
    setAvatarPath(null);
    setAvatarUrl(url);
    pushRecentAvatar(url);
  };

  const handleCustomSeed = () => {
    const seed = customSeed.trim();
    if (!seed) return;
    const url = buildDicebearUrl(avatarStyle, seed);
    setAvatarRef(url);
    setAvatarPath(null);
    setAvatarUrl(url);
    pushRecentAvatar(url);
  };

  const handleRandomSeed = () => {
    const seed = `user-${Math.random().toString(36).slice(2, 7)}`;
    const url = buildDicebearUrl(avatarStyle, seed);
    setAvatarRef(url);
    setAvatarPath(null);
    setAvatarUrl(url);
    pushRecentAvatar(url);
  };

  const resetAccountForm = () => {
    setAccountForm({ ...emptyAccountForm, currency: baseCurrency });
    setEditingAccount(null);
    setEditingBalanceOriginal(null);
  };

  const handleAccountSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAccountMessage(null);
    const isEditingSystem = editingAccount ? isSystemAccount(editingAccount) : false;
    const openingBalanceInput = accountForm.opening_balance.trim();
    const openingBalanceParsed = Number(openingBalanceInput);
    const hasOpeningBalance = openingBalanceInput !== "" && Number.isFinite(openingBalanceParsed);
    const roundedInput = Number.isFinite(openingBalanceParsed)
      ? Number(openingBalanceParsed.toFixed(2))
      : null;
    const hasBalanceChange =
      editingAccount &&
      editingBalanceOriginal !== null &&
      roundedInput !== null &&
      roundedInput !== Number(editingBalanceOriginal.toFixed(2));
    const payload = {
      name: isEditingSystem ? editingAccount?.name ?? "" : accountForm.name.trim(),
      type: accountForm.type,
      emoji: accountForm.emoji.trim() || null,
      currency: accountForm.currency as "EUR" | "USD",
      opening_balance: editingAccount
        ? editingAccount.opening_balance
        : Number(accountForm.opening_balance || 0)
    };

    try {
      if (editingAccount) {
        let correctionDiff = 0;
        if (hasOpeningBalance && hasBalanceChange) {
          const currentBalance =
            accountBalances.find((item) => item.id === editingAccount.id)?.balance ?? 0;
          correctionDiff = Number((openingBalanceParsed - currentBalance).toFixed(2));
        }
        await updateAccount(editingAccount.id, payload);
        if (correctionDiff !== 0) {
          const isPositive = correctionDiff > 0;
          const categoryId = await getCorrectionCategoryId(
            isPositive ? "income" : "expense"
          );
          await createTransaction({
            account_id: editingAccount.id,
            category_id: categoryId,
            type: isPositive ? "income" : "expense",
            flow: isPositive ? "in" : "out",
            amount: Math.abs(correctionDiff),
            currency: accountForm.currency as "EUR" | "USD",
            date: new Date().toISOString().slice(0, 10),
            note: correctionCategoryName
          });
        }
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
    setEditingBalanceOriginal(account.opening_balance ?? 0);
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
    const account = accounts.find((item) => item.id === id);
    if (account && isSystemAccount(account)) {
      setAccountMessage("Non puoi eliminare i conti di sistema.");
      return;
    }
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
        "target_pct",
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
        item.target_pct !== null && item.target_pct !== undefined
          ? String(item.target_pct)
          : "",
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

  const detectDelimiter = (text: string) => {
    const sample = text.split(/\r?\n/)[0] ?? "";
    if (sample.includes(";")) return ";";
    if (sample.includes(",")) return ",";
    return ";";
  };

  const handleImportTransactions = async (file: File) => {
    setImportMessage(null);
    try {
      if (accounts.length === 0) {
        setImportMessage("Crea almeno un conto prima di importare transazioni.");
        return;
      }
      type TransactionInsert = Omit<Transaction, "id" | "created_at" | "user_id">;
      const text = await file.text();
      const delimiter = detectDelimiter(text);
      const rows = parseCsv(text, delimiter);
      if (rows.length < 2) {
        setImportMessage("File vuoto o formato non valido.");
        return;
      }
      const headers = normalizeHeaders(rows[0]);
      const defaultAccountId = accounts[0]?.id ?? "";
      const localAccountMap = new Map(accountNameToId);
      const localCategoryMap = new Map(categoryNameToId);

      const parseAmount = (raw: string) => {
        if (!raw) return Number.NaN;
        const cleaned = raw.replace(/\./g, "").replace(",", ".");
        const value = Number(cleaned);
        return Number.isFinite(value) ? value : Number.NaN;
      };

      const ensureAccountId = async (rawName: string, currency: Currency) => {
        const cleaned = rawName.trim();
        if (!cleaned) return defaultAccountId;
        const existing =
          resolveApprox(localAccountMap, cleaned) ?? localAccountMap.get(normalizeKey(cleaned));
        if (existing) return existing;
        const { data, error } = await supabase
          .from("accounts")
          .insert({
            name: cleaned,
            type: "other",
            currency,
            opening_balance: 0
          })
          .select("id")
          .single();
        if (error) throw error;
        localAccountMap.set(normalizeKey(cleaned), data.id);
        return data.id as string;
      };

      const mapCategoryName = (rawName: string) => {
        const key = normalizeKey(rawName);
        return categoryAliasMap[key] ?? rawName;
      };

      const ensureCategoryId = async (rawName: string, type: TransactionType) => {
        const cleaned = mapCategoryName(rawName.trim());
        if (!cleaned) return "";
        const existing =
          resolveApprox(localCategoryMap, cleaned) ??
          localCategoryMap.get(normalizeKey(cleaned));
        if (existing) return existing;
        const payload = {
          name: cleaned,
          type: type === "income" ? "income" : "expense",
          parent_id: null,
          is_fixed: false,
          sort_order: null
        };
        const { data, error } = await supabase
          .from("categories")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        localCategoryMap.set(normalizeKey(cleaned), data.id);
        return data.id as string;
      };

      const ensureTransferCategoryId = async () => {
        const match = categories.find((category) =>
          category.name.toLowerCase().includes("giroconti")
        );
        if (match) return match.id;
        const { data, error } = await supabase
          .from("categories")
          .insert({ name: "Giroconti", type: "income" })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      };

      const isTransferFile =
        headers.includes("da") && headers.includes("a") && headers.includes("prezzo");
      const isBudgetFile =
        headers.includes("categoria") &&
        headers.includes("conto") &&
        headers.includes("transazione");

      if (isTransferFile) {
        const transferCategoryId = await ensureTransferCategoryId();
        const payloads: TransactionInsert[] = [];
        for (const cells of rows.slice(1)) {
          const record = headers.reduce<Record<string, string>>((acc, header, index) => {
            acc[header] = cells[index]?.trim() ?? "";
            return acc;
          }, {});
          const amountValue = parseAmount(record.prezzo ?? "");
          if (!record.data || Number.isNaN(amountValue)) continue;
          const currency: Currency = record.valuta === "USD" ? "USD" : "EUR";
          const fromAccountId = await ensureAccountId(record.da ?? "", currency);
          const toAccountId = await ensureAccountId(record.a ?? "", currency);
          payloads.push(
            {
              type: "transfer",
              flow: "out",
              account_id: fromAccountId,
              category_id: transferCategoryId,
              amount: Math.abs(amountValue),
              currency,
              date: record.data,
              note: record.nota || null
            },
            {
              type: "transfer",
              flow: "in",
              account_id: toAccountId,
              category_id: transferCategoryId,
              amount: Math.abs(amountValue),
              currency,
              date: record.data,
              note: record.nota || null
            }
          );
        }
        const valid = payloads.filter(
          (item) => item.date && item.account_id && item.category_id && !Number.isNaN(item.amount)
        );
        await createTransactions(valid);
        await refresh();
        setImportMessage(`Importati ${valid.length / 2} trasferimenti.`);
        return;
      }

      if (isBudgetFile) {
        const payloads: TransactionInsert[] = [];
        for (const cells of rows.slice(1)) {
          const record = headers.reduce<Record<string, string>>((acc, header, index) => {
            acc[header] = cells[index]?.trim() ?? "";
            return acc;
          }, {});
          const rawType = normalizeKey(record.transazione ?? "");
          const isRefund = rawType.includes("rimborso");
          const type: TransactionType = rawType.includes("uscite")
            ? "expense"
            : "income";
          const flow: FlowDirection = type === "income" ? "in" : "out";
          const currency: Currency = record.valuta === "USD" ? "USD" : "EUR";
          const amountValue = parseAmount(record.prezzo ?? "");
          if (!record.data || Number.isNaN(amountValue)) continue;
          const accountId = await ensureAccountId(record.conto ?? "", currency);
          const categoryName = isRefund ? refundCategoryName : record.categoria ?? "";
          const categoryId = await ensureCategoryId(categoryName, type);
          const tags = [record.sottocategoria, record.tag]
            .map((value) => value?.trim())
            .filter((value) => value);
          payloads.push({
            date: record.data,
            type,
            flow,
            account_id: accountId,
            category_id: categoryId,
            amount: Math.abs(amountValue),
            currency,
            note: record.nota || null,
            tags: tags.length > 0 ? tags : null
          });
        }
        const valid = payloads.filter(
          (item) => item.date && item.account_id && item.category_id && !Number.isNaN(item.amount)
        );
        await createTransactions(valid);
        await refresh();
        setImportMessage(`Importate ${valid.length} transazioni.`);
        return;
      }

      const payloads: TransactionInsert[] = rows.slice(1).map((cells) => {
        const record = headers.reduce<Record<string, string>>((acc, header, index) => {
          acc[header] = cells[index]?.trim() ?? "";
          return acc;
        }, {});
        const amountRaw = parseAmount(record.amount ?? "0");
        const inferredType = Number.isFinite(amountRaw)
          ? amountRaw < 0
            ? "expense"
            : "income"
          : "expense";
        const type = (record.type as TransactionType) || inferredType;
        const flow: FlowDirection =
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
        const currency: Currency = record.currency === "USD" ? "USD" : "EUR";
        const tags = [record.tags, record.tag]
          .map((value) => value?.trim())
          .filter((value) => value);
        return {
          date: record.date,
          type,
          flow,
          account_id: accountId ?? "",
          category_id: categoryId ?? "",
          amount: Math.abs(amountRaw),
          currency,
          note: record.note || null,
          tags: tags.length > 0 ? tags : null
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
        const target_pct = record.target_pct ? Number(record.target_pct) : null;
        return {
          name: record.name,
          asset_class: record.asset_class || "Altro",
          emoji: record.emoji || null,
          target_pct: Number.isFinite(target_pct) ? target_pct : null,
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
      const ordered = valid.map((item, index) => ({
        ...item,
        sort_order: maxHoldingSortOrder + (index + 1) * 10
      }));
      await createHoldings(ordered);
      await refresh();
      setImportMessage(`Importate ${ordered.length} holdings.`);
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
        <div className="section-header">
          <div>
            <h3>Profilo</h3>
            <p className="section-subtitle">
              Gestisci avatar, nome utente, email e password.
            </p>
          </div>
        </div>
        <form className="profile-grid" onSubmit={handleProfileSave}>
          <div className="profile-avatar">
            {avatarUrl ? (
              <img className="profile-avatar-img" src={avatarUrl} alt="Avatar" />
            ) : (
              <div className="profile-avatar-placeholder">?</div>
            )}
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={handleAvatarFile}
            />
          </div>
          <div className="profile-fields">
            <input
              className="input"
              placeholder="Nome visualizzato"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <input
              className="input"
              placeholder="Avatar URL"
              value={avatarUrl}
              onChange={(event) => {
                const nextValue = event.target.value;
                setAvatarUrl(nextValue);
                setAvatarRef(nextValue);
                setAvatarPath(null);
              }}
            />
            <button className="button" type="submit">
              Salva tutto
            </button>
          </div>
        </form>
        {profileMessage && <div className="notice">{profileMessage}</div>}
        <div className="profile-avatar-toggle">
          <button
            className="avatar-toggle-button"
            type="button"
            onClick={() => setAvatarPanelOpen((prev) => !prev)}
            aria-expanded={avatarPanelOpen}
            aria-controls="avatar-panel"
          >
            {avatarPanelOpen ? "Nascondi avatar" : "Mostra avatar"}
          </button>
        </div>
        {avatarPanelOpen && (
          <div className="profile-avatar-picker" id="avatar-panel">
            <div className="profile-picker-header">
              <div>
                <strong>Avatar DiceBear</strong>
                <p className="section-subtitle">Scegli uno stile e un seed.</p>
              </div>
              <select
                className="select"
                value={avatarStyle}
                onChange={(event) => setAvatarStyle(event.target.value)}
              >
                {dicebearStyles.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="profile-picker-controls">
              <input
                className="input"
                placeholder="Seed personalizzato"
                value={customSeed}
                onChange={(event) => setCustomSeed(event.target.value)}
              />
              <button
                className="button secondary"
                type="button"
                onClick={handleCustomSeed}
              >
                Usa seed
              </button>
              <button className="button ghost" type="button" onClick={handleRandomSeed}>
                Random
              </button>
              <div className="profile-fav-strip">
                <span className="profile-fav-label">Preferiti</span>
                <div className="profile-fav-list">
                  {favoriteAvatars.length === 0 ? (
                    <span className="section-subtitle">Nessuno</span>
                  ) : (
                  favoriteAvatars.slice(0, 4).map((ref, index) => {
                    const displayUrl = getAvatarDisplayUrl(ref);
                    const isActive = avatarRef === ref;
                    return (
                      <div
                        className={`avatar-option compact${isActive ? " active" : ""}`}
                        key={`fav-mini-${ref}-${index}`}
                      >
                        <button
                          className="avatar-select"
                          type="button"
                          onClick={() => {
                            void selectAvatarRef(ref);
                            pushRecentAvatar(ref);
                          }}
                        >
                          <img src={displayUrl} alt="Avatar preferito" loading="lazy" />
                          <span>Pref</span>
                        </button>
                        <button
                          className="avatar-fav active"
                          type="button"
                          onClick={() => toggleFavoriteAvatar(ref)}
                          aria-label="Rimuovi dai preferiti"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M12 21s-6.7-4.3-9.3-7.4C.4 10.9 1.4 6.9 4.9 5.7c2-.7 4 .1 5.1 1.7 1.1-1.6 3.1-2.4 5.1-1.7 3.5 1.2 4.5 5.2 2.2 7.9C18.7 16.7 12 21 12 21z"
                            />
                          </svg>
                        </button>
                      </div>
                    );
                  })
                )}
                </div>
              </div>
            </div>
            <div className="avatar-grid">
            {dicebearSeeds.map((seed) => {
              const url = buildDicebearUrl(avatarStyle, seed);
              const isActive = avatarRef === url;
              const isFavorite = favoriteAvatars.includes(url);
              return (
                <div
                  className={`avatar-option${isActive ? " active" : ""}`}
                    key={`seed-${seed}`}
                  >
                    <button
                      className="avatar-select"
                      type="button"
                      onClick={() => handleAvatarPick(seed)}
                    >
                      <img src={url} alt={`Avatar ${seed}`} loading="lazy" />
                      <span>{seed}</span>
                    </button>
                    <button
                      className={`avatar-fav${isFavorite ? " active" : ""}`}
                      type="button"
                      onClick={() => toggleFavoriteAvatar(url)}
                      aria-label={
                        isFavorite ? "Rimuovi dai preferiti" : "Salva nei preferiti"
                      }
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 21s-6.7-4.3-9.3-7.4C.4 10.9 1.4 6.9 4.9 5.7c2-.7 4 .1 5.1 1.7 1.1-1.6 3.1-2.4 5.1-1.7 3.5 1.2 4.5 5.2 2.2 7.9C18.7 16.7 12 21 12 21z"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
            {favoriteAvatars.length > 0 && (
              <div className="avatar-section">
                <div className="avatar-section-header">
                  <div>
                    <strong>Preferiti</strong>
                    <p className="section-subtitle">I tuoi avatar salvati.</p>
                  </div>
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => setFavoritesOpen((prev) => !prev)}
                  >
                    {favoritesOpen ? "Nascondi" : "Mostra"} ({favoriteAvatars.length})
                  </button>
                </div>
                {favoritesOpen && (
                  <div className="avatar-grid compact">
                  {favoriteAvatars.map((ref, index) => {
                    const displayUrl = getAvatarDisplayUrl(ref);
                    const isActive = avatarRef === ref;
                    return (
                      <div
                        className={`avatar-option compact${isActive ? " active" : ""}`}
                        key={`favorite-${ref}-${index}`}
                      >
                        <button
                          className="avatar-select"
                          type="button"
                          onClick={() => {
                            void selectAvatarRef(ref);
                            pushRecentAvatar(ref);
                          }}
                        >
                          <img src={displayUrl} alt="Avatar preferito" loading="lazy" />
                          <span>{getAvatarLabel(displayUrl, "Preferito")}</span>
                        </button>
                        <button
                          className="avatar-fav active"
                          type="button"
                          onClick={() => toggleFavoriteAvatar(ref)}
                          aria-label="Rimuovi dai preferiti"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M12 21s-6.7-4.3-9.3-7.4C.4 10.9 1.4 6.9 4.9 5.7c2-.7 4 .1 5.1 1.7 1.1-1.6 3.1-2.4 5.1-1.7 3.5 1.2 4.5 5.2 2.2 7.9C18.7 16.7 12 21 12 21z"
                            />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            )}
            {recentAvatars.length > 0 && (
              <div className="avatar-section">
                <div className="avatar-section-header">
                  <div>
                    <strong>Ultimi aggiunti</strong>
                    <p className="section-subtitle">Selezioni recenti.</p>
                  </div>
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => setRecentsOpen((prev) => !prev)}
                  >
                    {recentsOpen ? "Nascondi" : "Mostra"} ({recentAvatars.length})
                  </button>
                </div>
                {recentsOpen && (
                  <div className="avatar-grid compact">
                  {recentAvatars.map((ref, index) => {
                    const displayUrl = getAvatarDisplayUrl(ref);
                    const isActive = avatarRef === ref;
                    const isFavorite = favoriteAvatars.includes(ref);
                    return (
                      <div
                        className={`avatar-option compact${isActive ? " active" : ""}`}
                        key={`recent-${ref}-${index}`}
                      >
                        <button
                          className="avatar-select"
                          type="button"
                          onClick={() => void selectAvatarRef(ref)}
                        >
                          <img src={displayUrl} alt="Avatar recente" loading="lazy" />
                          <span>{getAvatarLabel(displayUrl, "Recente")}</span>
                        </button>
                        <button
                          className={`avatar-fav${isFavorite ? " active" : ""}`}
                          type="button"
                          onClick={() => toggleFavoriteAvatar(ref)}
                          aria-label={
                            isFavorite ? "Rimuovi dai preferiti" : "Salva nei preferiti"
                          }
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M12 21s-6.7-4.3-9.3-7.4C.4 10.9 1.4 6.9 4.9 5.7c2-.7 4 .1 5.1 1.7 1.1-1.6 3.1-2.4 5.1-1.7 3.5 1.2 4.5 5.2 2.2 7.9C18.7 16.7 12 21 12 21z"
                            />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            )}
            <p className="section-subtitle">
              Puoi anche incollare un URL o caricare una foto.
            </p>
          </div>
        )}
        <div className="profile-actions">
          <form className="profile-form" onSubmit={handleEmailUpdate}>
            <label className="profile-label">Email</label>
            <div className="profile-row">
              <input
                className="input"
                type="email"
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
              />
              <button className="button secondary" type="submit">
                Aggiorna
              </button>
            </div>
          </form>
          {emailMessage && <div className="notice">{emailMessage}</div>}
          <form className="profile-form" onSubmit={handlePasswordUpdate}>
            <label className="profile-label">Password</label>
            <div className="profile-row">
              <input
                className="input"
                type="password"
                placeholder="Nuova password"
                value={passwordDraft}
                onChange={(event) => setPasswordDraft(event.target.value)}
              />
              <input
                className="input"
                type="password"
                placeholder="Conferma password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
              />
              <button className="button secondary" type="submit">
                Aggiorna
              </button>
            </div>
          </form>
          {passwordMessage && <div className="notice">{passwordMessage}</div>}
        </div>
      </div>

      <div className="card">
        <div className="form-grid">
          <select
            className="select"
            value={baseCurrency}
            onChange={(event) => setBaseCurrency(event.target.value)}
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
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
            disabled={editingAccount ? isSystemAccount(editingAccount) : false}
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
          <>
            {accounts.some((account) => isSystemAccount(account)) && (
              <div className="account-section">
                <div className="section-header">
                  <div>
                    <h4>Sistema</h4>
                    <p className="section-subtitle">Conti predefiniti del sistema</p>
                  </div>
                </div>
                <div className="account-grid">
                  {accounts
                    .filter((account) => isSystemAccount(account))
                    .map((account) => (
                      <div className="account-card system-account" key={account.id}>
                        <div className="account-meta">
                          <span className="account-emoji">
                            {account.emoji && account.emoji.trim() ? account.emoji : "O"}
                          </span>
                          <div className="account-info">
                            <strong>{account.name}</strong>
                            <span className="section-subtitle">
                              {accountTypeLabels[account.type] ?? account.type}
                            </span>
                          </div>
                        </div>
                        <div className="account-actions">
                          <span className="account-badge">Sistema</span>
                          <button
                            className="button ghost small"
                            type="button"
                            onClick={() => startAccountEdit(account)}
                          >
                            Modifica
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <div className="account-section">
              <div className="section-header">
                <div>
                  <h4>Personali</h4>
                  <p className="section-subtitle">Conti creati manualmente</p>
                </div>
              </div>
              <div className="account-grid">
                {accounts
                  .filter((account) => !isSystemAccount(account))
                  .map((account) => (
                    <div className="account-card" key={account.id}>
                      <div className="account-meta">
                        <span className="account-emoji">
                          {account.emoji && account.emoji.trim() ? account.emoji : "O"}
                        </span>
                        <div className="account-info">
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
            </div>
          </>
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
              Campi: name, asset_class, emoji, target_pct, quantity, avg_cost,
              total_cap, current_value, currency, start_date, note.
            </span>
          </div>
        </div>

        <div className="info-panel" style={{ marginTop: "12px" }}>
          <div className="info-item">
            <strong>Importa dall'app</strong>
            <span>Carica Budget.csv o Budget.Trasferimento.csv.</span>
          </div>
        </div>

        <div style={{ marginTop: "12px" }}>
          <label>
            Importa file app (CSV)
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
