import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePortfolioData } from "../hooks/usePortfolioData";
import { upsertSettings } from "../lib/api";

const Settings = () => {
  const { session } = useAuth();
  const { settings, refresh, loading, error } = usePortfolioData();
  const [baseCurrency, setBaseCurrency] = useState("EUR");
  const [emergencyFund, setEmergencyFund] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setBaseCurrency(settings.base_currency);
      setEmergencyFund(String(settings.emergency_fund));
    }
  }, [settings]);

  const handleSubmit = async (event: React.FormEvent) => {
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
    </div>
  );
};

export default Settings;
