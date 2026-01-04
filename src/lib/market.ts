export type MarketPriceResult = {
  ticker: string;
  price?: number;
  currency?: string;
  name?: string;
  category?: string;
  found?: boolean;
  error?: string;
  source?: string;
};

const MARKET_API_BASE =
  import.meta.env.VITE_MARKET_API_URL?.trim() || "http://localhost:8000";
const MARKET_API_URL = `${MARKET_API_BASE.replace(/\/$/, "")}/api/etf`;

export const fetchMarketPrices = async (
  tickers: string[]
): Promise<MarketPriceResult[]> => {
  const payload = tickers.map((ticker) => ticker.trim()).filter(Boolean);
  if (payload.length === 0) {
    return [];
  }
  const response = await fetch(MARKET_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers: payload })
  });
  if (!response.ok) {
    let message = "Richiesta scraping fallita.";
    try {
      const errorPayload = (await response.json()) as { error?: string };
      if (errorPayload?.error) message = errorPayload.error;
    } catch {
      // ignore error parsing
    }
    throw new Error(message);
  }
  const data = (await response.json()) as unknown;
  if (Array.isArray(data)) {
    return data as MarketPriceResult[];
  }
  if (data && typeof data === "object") {
    return [data as MarketPriceResult];
  }
  throw new Error("Risposta scraping non valida.");
};
