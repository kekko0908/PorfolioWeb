const API_KEY = import.meta.env.VITE_ALPHA_VANTAGE_KEY;
const BASE_URL = "https://www.alphavantage.co/query";

export const fetchGlobalQuote = async (symbol: string) => {
  if (!API_KEY) {
    throw new Error("API key Alpha Vantage mancante.");
  }
  const params = new URLSearchParams({
    function: "GLOBAL_QUOTE",
    symbol,
    apikey: API_KEY
  });
  const response = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Richiesta Alpha Vantage fallita.");
  }
  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data["Note"] === "string") {
    throw new Error("Rate limit Alpha Vantage raggiunto. Riprova tra 1 minuto.");
  }
  if (typeof data["Error Message"] === "string") {
    throw new Error("Ticker non valido su Alpha Vantage.");
  }
  const quote = data["Global Quote"] as Record<string, string> | undefined;
  const priceRaw = quote?.["05. price"];
  const price = priceRaw ? Number(priceRaw) : Number.NaN;
  if (!Number.isFinite(price)) {
    throw new Error("Prezzo non disponibile per questo ticker.");
  }
  return price;
};
