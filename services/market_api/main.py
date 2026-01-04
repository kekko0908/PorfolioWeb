import os
import re
import subprocess
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TickerRequest(BaseModel):
    tickers: list[str]


ROOT_DIR = Path(__file__).resolve().parents[2]
SCRAPER_PATH = ROOT_DIR / "scripts" / "scrape_prices.py"
PYTHON_BIN = os.environ.get("PYTHON_BIN", "python")


def run_scraper_text(ticker: str) -> str:
    command = [PYTHON_BIN, "-X", "utf8", str(SCRAPER_PATH)]
    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8:ignore"
        env["PYTHONUTF8"] = "1"
        result = subprocess.run(
            command,
            input=f"{ticker}\nq\n",
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=30,
            check=False,
            env=env,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("Python non disponibile sul server.") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Timeout scraper.") from exc

    if result.returncode != 0:
        error = (result.stderr or "").strip()
        raise RuntimeError(error or "Scraper fallito.")

    output = (result.stdout or "").strip()
    if not output:
        raise RuntimeError("Output scraper vuoto.")
    return output


def parse_price(value: str) -> float | None:
    cleaned = value.replace(",", ".")
    cleaned = re.sub(r"[^0-9.]", "", cleaned)
    try:
        parsed = float(cleaned)
    except ValueError:
        return None
    return parsed if parsed == parsed else None


def parse_scraper_output(output: str, input_ticker: str) -> dict:
    found = bool(re.search(r"TROVATO\s*:", output, re.IGNORECASE))
    if re.search(r"ticker non trovato", output, re.IGNORECASE):
        return {
            "ticker": input_ticker,
            "found": False,
            "error": "Ticker non trovato.",
            "source": "scrape_prices.py",
        }

    resolved_match = re.search(r"TROVATO\s*:\s*([A-Z0-9.:\-_]+)", output)
    name_match = re.search(r"Nome\s*:\s*(.+)", output)
    type_match = re.search(r"Tipo\s*:\s*(.+)", output)
    price_match = re.search(r"Prezzo\s*:\s*([0-9.,]+)\s*([A-Z]{3})?", output)

    price = parse_price(price_match.group(1)) if price_match else None
    currency = price_match.group(2) if price_match and price_match.group(2) else None

    result = {
        "ticker": input_ticker,
        "resolved_ticker": resolved_match.group(1) if resolved_match else None,
        "price": price,
        "currency": currency,
        "name": name_match.group(1).strip() if name_match else None,
        "category": type_match.group(1).strip() if type_match else None,
        "found": found or price is not None,
        "source": "scrape_prices.py",
    }
    if not result["found"]:
        result["error"] = "Output scraper non riconosciuto."
    return result


@app.get("/api/etf/{ticker}")
def get_etf_data(ticker: str):
    output = run_scraper_text(ticker)
    return parse_scraper_output(output, ticker)


@app.post("/api/etf")
def get_etf_batch(payload: TickerRequest):
    results: list[dict[str, Any]] = []
    for ticker in payload.tickers:
        try:
            output = run_scraper_text(ticker)
            results.append(parse_scraper_output(output, ticker))
        except Exception as exc:
            results.append(
                {
                    "ticker": ticker,
                    "found": False,
                    "error": str(exc),
                    "source": "scrape_prices.py",
                }
            )
    return results
