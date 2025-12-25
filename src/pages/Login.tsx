import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const Login = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
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
            <span>Accesso sicuro</span>
          </div>
        </div>
        <h1>Accedi</h1>
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
          {loading ? "Accesso..." : "Entra"}
        </button>
        <div className="auth-toggle">
          Non hai un account? <Link to="/register">Registrati</Link>
        </div>
      </form>
    </div>
  );
};

export default Login;
