# Portfolio Pro

Web app React + Supabase per gestire portafoglio, spese e investimenti con dashboard avanzata.

## Setup locale

1. Installa le dipendenze
   ```bash
   npm install
   ```
2. Configura Supabase
   - Copia `.env.example` in `.env` e inserisci le chiavi.
   - Esegui `supabase/schema.sql` nel SQL editor del progetto Supabase.
   - Abilita Auth (email/password) e imposta la Site URL se necessario.
3. Avvio
   ```bash
   npm run dev
   ```

## Funzionalita principali
- Login/Registrazione con Supabase Auth
- CRUD categorie (con livelli e flag spese fisse)
- CRUD transazioni con flussi in/out e valute EUR/USD
- CRUD holdings con ROI, CAGR, P/E Ratio
- Dashboard con metriche e grafici

## Seed categorie
Dal pannello `Categorie` usa il pulsante **Importa categorie base**.

## Note
- Metriche: ROI, CAGR, P/E Ratio, Asset Allocation
- Finanza personale: Savings Rate, Net Worth, Burn Rate mensile, Runway
- Valute: EUR/USD senza conversione automatica
