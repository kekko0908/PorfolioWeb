import yfinance as yf

def analizza_etf(ticker_input):
    # 1. Pulisci l'input
    ticker_base = ticker_input.upper().strip()
    
    # 2. Lista di borse da provare (Milano, Germania, Olanda, Parigi, Londra, USA)
    suffissi = [".MI", ".DE", ".AS", ".PA", ".L", ""]
    
    print(f"🔄 Analizzo {ticker_base}...")

    for suffisso in suffissi:
        simbolo = f"{ticker_base}{suffisso}"
        
        try:
            # Scarica i dati veloci (solo ultimo giorno)
            etf = yf.Ticker(simbolo)
            history = etf.history(period="5d")
            
            if not history.empty:
                # ABBIAMO TROVATO I DATI!
                prezzo = history['Close'].iloc[-1]
                info = etf.info
                
                # Prendi il nome completo (es. Amundi MSCI World UCITS ETF)
                nome_completo = info.get('longName', simbolo)
                valuta = info.get('currency', 'EUR')
                
                # --- CERVELLO DEL PROGRAMMA (DEDUZIONE CATEGORIA) ---
                categoria = deduci_categoria(nome_completo)
                
                return {
                    "trovato": True,
                    "ticker": simbolo,
                    "nome": nome_completo,
                    "prezzo": prezzo,
                    "valuta": valuta,
                    "categoria": categoria
                }
        except:
            continue # Prova la prossima borsa

    return {"trovato": False}

def deduci_categoria(nome):
    """
    Analizza il nome dell'ETF e capisce cos'è basandosi su parole chiave standard.
    """
    n = nome.upper()
    
    # REGOLE DI RICONOSCIMENTO
    if "S&P 500" in n or "NASDAQ" in n or "USA" in n:
        return "🇺🇸 Azionario USA"
    
    elif "MSCI WORLD" in n or "GLOBAL" in n or "ALL WORLD" in n or "ALL-WORLD" in n:
        return "🌍 Azionario Mondo (Globale)"
    
    elif "EMERGING" in n or "EMI" in n:
        return "🐯 Azionario Mercati Emergenti"
    
    elif "EUROPE" in n or "STOXX 600" in n or "DAX" in n:
        return "🇪🇺 Azionario Europa"
    
    elif "JAPAN" in n or "TOPIX" in n:
        return "🇯🇵 Azionario Giappone"
        
    elif "BOND" in n or "TREASURY" in n or "GILT" in n or "AGGREGATE" in n or "GOVT" in n:
        return "🏛️ Obbligazionario / Bond"
    
    elif "GOLD" in n or "SILVER" in n or "COMMODITY" in n:
        return "⚱️ Materie Prime / Oro"
    
    elif "TECHNOLOGY" in n or "DIGITAL" in n or "ROBOTICS" in n:
        return "🤖 Azionario Settoriale (Tech)"
    
    elif "HEALTH" in n or "PHARMA" in n:
        return "💊 Azionario Settoriale (Salute)"
        
    else:
        return "📊 ETF Generico (Altro)"

# --- AVVIO ---
if __name__ == "__main__":
    while True:
        print("\n" + "-"*40)
        t = input("Inserisci Ticker (es. MWRD, SWDA) o 'q' per uscire: ")
        
        if t.lower() == 'q': break
        
        ris = analizza_etf(t)
        
        if ris["trovato"]:
            print(f"\n✅ TROVATO: {ris['ticker']}")
            print(f"📄 Nome:    {ris['nome']}")
            print(f"📂 Tipo:    {ris['categoria']}")  # <--- Ora questo funzionerà sempre
            print(f"💰 Prezzo:  {ris['prezzo']:.2f} {ris['valuta']}")
        else:
            print("\n❌ Ticker non trovato. Controlla la sigla.")