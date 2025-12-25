import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/portfolio", label: "Portafoglio" },
  { to: "/transactions", label: "Transazioni" },
  { to: "/categories", label: "Categorie" },
  { to: "/analytics", label: "Analytics" },
  { to: "/settings", label: "Impostazioni" }
];

export const Layout = () => {
  const { session, signOut } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">PP</div>
          <div className="brand-text">
            <strong>Portfolio Pro</strong>
            <span>Control room</span>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              <span className="nav-dot" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="content">
        <header className="topbar">
          <div>
            <strong>{session?.user.email ?? "Utente"}</strong>
            <div className="pill">EUR / USD</div>
          </div>
          <div className="topbar-actions">
            <button className="button secondary" onClick={signOut}>
              Esci
            </button>
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
