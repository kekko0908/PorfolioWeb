import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const Register = () => {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signUp(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="sidebar-brand">
          <div className="brand-mark">PP</div>
          <div className="brand-text">
            <strong>Portfolio Pro</strong>
            <span>Nuovo account</span>
          </div>
        </div>
        <h1>Registrati</h1>
        <div className="notice">
          Dopo la registrazione riceverai una email di conferma.
        </div>
        <label>
          Email
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="button" type="submit" disabled={loading}>
          {loading ? "Creazione..." : "Crea account"}
        </button>
        <div className="auth-toggle">
          Hai gia un account? <Link to="/login">Accedi</Link>
        </div>
      </form>
    </div>
  );
};

export default Register;
