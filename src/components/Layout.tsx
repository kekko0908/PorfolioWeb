import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/portfolio", label: "Portafoglio" },
  {
    to: "/transactions",
    label: "Transazioni",
    children: [{ to: "/transactions/filter", label: "Filtra per" }]
  },
  { to: "/categories", label: "Categorie" },
  { to: "/analytics", label: "Analytics" },
  { to: "/settings", label: "Impostazioni" }
];

const maskEmail = (email?: string) => {
  if (!email) return "Utente";
  const local = email.split("@")[0];
  if (local.length <= 2) return `${local.charAt(0)}**`;
  return `${local.slice(0, Math.min(5, local.length))}**`;
};

export const Layout = () => {
  const { session, signOut } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden>
            <span className="brand-ring" />
            <span className="brand-letter">P</span>
          </div>
          <div className="brand-text">
            <strong>Portfolio Pro</strong>
            <span>Control room</span>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <div className="nav-group" key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                <span className="nav-dot" />
                {item.label}
              </NavLink>
              {item.children && (
                <div className="nav-sublist">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      className={({ isActive }) =>
                        isActive ? "nav-sublink active" : "nav-sublink"
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>
      <div className="content">
        <header className="topbar">
          <div>
            <strong>{maskEmail(session?.user.email)}</strong>
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
