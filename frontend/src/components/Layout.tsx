import { NavLink, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', icon: '🏠', label: 'Dashboard' },
  { to: '/inventario', icon: '📦', label: 'Inventario' },
  { to: '/precios', icon: '💰', label: 'Precios' },
  { to: '/importar', icon: '📥', label: 'Importar' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return { title: 'Dashboard', sub: 'Vista general del sistema' };
    if (path === '/inventario') return { title: 'Inventario', sub: 'Gestión de stock por set' };
    if (path === '/precios') return { title: 'Precios', sub: 'Monitoreo y sincronización de precios' };
    if (path === '/importar') return { title: 'Importar', sub: 'Catálogos y stock por CSV' };
    return { title: 'TCG Platform', sub: '' };
  };

  const { title, sub } = getPageTitle();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-title">🃏 Netdecker</div>
          <div className="sidebar-logo-sub">TCG Store Platform</div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `sidebar-nav-item${isActive ? ' active' : ''}`
              }
            >
              <span className="sidebar-nav-icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">v0.1.0 · Internal Tool</div>
      </aside>

      <div className="main-wrapper">
        <header className="page-header">
          <div className="page-header-left">
            <h1>{title}</h1>
            {sub && <p>{sub}</p>}
          </div>
        </header>
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}

// Keep legacy exports for backward compatibility
export function Header() { return null; }
export function Footer() { return null; }
