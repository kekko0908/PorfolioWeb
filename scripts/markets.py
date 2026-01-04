import yfinance as yf
import requests

def trova_prezzo_robusto(ticker_input):
    # --- TRUCCO ANTI-BLOCCO ---
    # Creiamo una sessione che finge di essere un browser Chrome
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })

    # Lista suffissi
    possibili_ticker = [
        f"{ticker_input}.MI", # Milano
        f"{ticker_input}.PA", # Parigi (Spesso MWRD è più stabile qui)
        f"{ticker_input}.DE", # Germania
        f"{ticker_input}.AS", # Amsterdam
        f"{ticker_input}.L",  # Londra
        ticker_input          # USA
    ]

    print(f"🔎 Cerco {ticker_input} (modalità sicura)...")

    for simbolo in possibili_ticker:
        try:
            # Passiamo la 'session' al Ticker per evitare il blocco
            etf = yf.Ticker(simbolo, session=session)
            
            # Proviamo a scaricare i dati
            storia = etf.history(period="5d")
            
            if not storia.empty:
                prezzo = storia['Close'].iloc[-1]
                
                # Info
                try:
                    info = etf.info
                    nome = info.get('longName', simbolo)
                    valuta = info.get('currency', 'EUR')
                except:
                    nome = simbolo
                    valuta = "?"

                # Categoria Dedotta
                cat = "Generico"
                n = nome.upper()
                if "MSCI WORLD" in n or "GLOBAL" in n: cat = "🌍 Azionario Mondo"
                elif "S&P 500" in n or "USA" in n: cat = "🇺🇸 Azionario USA"
                elif "BOND" in n: cat = "🏛️ Obbligazionario"
                elif "EMERGING" in n: cat = "🐯 Emergenti"

                return {
                    "trovato": True, 
                    "simbolo": simbolo, 
                    "prezzo": prezzo, 
                    "nome": nome,
                    "cat": cat,
                    "valuta": valuta
                }
                
        except Exception as e:
            # Se errore, continua silenziosamente al prossimo suffisso
            continue

    return {"trovato": False}

if __name__ == "__main__":
    t = input("Ticker (es. MWRD): ").upper().strip()
    res = trova_prezzo_robusto(t)
    
    if res["trovato"]:
        print(f"\n✅ {res['simbolo']}")
        print(f"📄 {res['nome']}")
        print(f"📂 {res['cat']}")
        print(f"💰 {res['prezzo']:.2f} {res['valuta']}")
    else:
        print("\n❌ Nessun dato trovato (Yahoo potrebbe averti bloccato temporaneamente).")