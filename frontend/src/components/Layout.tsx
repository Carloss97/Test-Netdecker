import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import { logout } from '../services/adminAuth';

const NAV_ITEMS = [
  { to: '/', icon: '🏠', label: 'Dashboard' },
  { to: '/pos', icon: '💳', label: 'POS' },
  { to: '/inventario', icon: '📦', label: 'Inventario' },
  { to: '/precios', icon: '💰', label: 'Precios' },
  { to: '/stock-bajo', icon: '🚨', label: 'Stock Bajo' },
  { to: '/importar', icon: '📥', label: 'Importar' },
  { to: '/buscar', icon: '🔍', label: 'Buscar Carta' },
  { to: '/storefront', icon: '🛍️', label: 'Demo Tienda' },
  { to: '/admin', icon: '⚙️', label: 'Admin' },
  { to: '/local-imports', icon: '🗂️', label: 'Importaciones locales' },
];

type AdminStore = {
  id: string;
  slug?: string;
  name?: string;
};

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string>('');
  const [lockedStoreId, setLockedStoreId] = useState<string>('');

  useEffect(() => {
    try {
      const fromStorage = localStorage.getItem('auth_store') || '';
      setActiveStoreId(fromStorage);
    } catch {
      setActiveStoreId('');
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    apiClient
      .get('/admin/auth/me')
      .then((resp) => {
        if (!mounted) return;
        const sessionStoreId = resp?.data?.data?.storeId ? String(resp.data.data.storeId).trim() : '';
        if (!sessionStoreId) return;

        setLockedStoreId(sessionStoreId);
        setActiveStoreId((prev) => (prev === sessionStoreId ? prev : sessionStoreId));

        try {
          const current = localStorage.getItem('auth_store') || '';
          if (current !== sessionStoreId) {
            localStorage.setItem('auth_store', sessionStoreId);
            window.dispatchEvent(new Event('netdecker:store-changed'));
          }
        } catch {
          // ignore storage failures
        }
      })
      .catch(() => {
        if (!mounted) return;
        setLockedStoreId('');
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    apiClient
      .get('/admin/stores')
      .then((resp) => {
        if (!mounted) return;
        const payload = resp?.data;
        const items = Array.isArray(payload?.stores) ? payload.stores : [];
        setStores(items as AdminStore[]);

        if (!lockedStoreId && !activeStoreId && items.length > 0) {
          const firstStore = String(items[0].id || '');
          if (firstStore) {
            try {
              localStorage.setItem('auth_store', firstStore);
            } catch {
              // ignore storage failures
            }
            setActiveStoreId(firstStore);
          }
        }
      })
      .catch(() => {
        if (mounted) {
          setStores([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, [activeStoreId, lockedStoreId]);

  const activeStoreName = useMemo(() => {
    if (!activeStoreId) return 'Sin tienda seleccionada';
    const match = stores.find((store) => store.id === activeStoreId);
    if (!match) return `Store ${activeStoreId.slice(0, 8)}...`;
    return match.name || match.slug || match.id;
  }, [stores, activeStoreId]);

  const handleStoreChange = (nextStoreId: string) => {
    if (lockedStoreId && nextStoreId !== lockedStoreId) {
      return;
    }

    setActiveStoreId(nextStoreId);
    try {
      if (nextStoreId) {
        localStorage.setItem('auth_store', nextStoreId);
      } else {
        localStorage.removeItem('auth_store');
      }
      window.dispatchEvent(
        new CustomEvent('netdecker:store-changed', {
          detail: { storeId: nextStoreId || null },
        }),
      );
    } catch {
      // ignore storage failures
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Continue with local cleanup even when remote logout fails.
    }

    try {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_store');
    } catch {
      // ignore storage failures
    }

    try {
      document.cookie = 'auth_token_js=; Path=/; Max-Age=0; SameSite=Lax';
    } catch {
      // ignore cookie failures
    }

    try {
      delete apiClient.defaults.headers.common.Authorization;
      delete apiClient.defaults.headers.common['x-admin-token'];
      delete apiClient.defaults.headers.common['x-store-id'];
    } catch {
      // ignore cleanup failures
    }

    navigate('/login', { replace: true });
  };

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return { title: 'Dashboard', sub: 'Vista general del sistema' };
    if (path === '/inventario') return { title: 'Inventario', sub: 'Gestión de stock por set' };
    if (path === '/precios') return { title: 'Precios', sub: 'Monitoreo y sincronización de precios' };
    if (path === '/stock-bajo') return { title: 'Stock Bajo', sub: 'Alertas de listings activos con stock crítico' };
    if (path === '/importar') return { title: 'Importar', sub: 'Catálogos y stock por CSV' };
    if (path === '/buscar') return { title: 'Buscar Carta', sub: 'Busca por nombre o código · Ve todas las rarezas' };
    if (path.startsWith('/storefront')) return { title: 'Demo Tienda', sub: 'Showcase público tipo e-commerce para TCG' };
    if (path === '/admin') return { title: 'Admin', sub: 'Parámetros avanzados de catálogo y precios' };
    if (path === '/local-imports') return { title: 'Importaciones locales', sub: 'Respaldo y edición de listings guardados en el navegador' };
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
          <div className="page-header-actions">
            <div className="store-chip" title={activeStoreId || 'No store selected'}>
              <span className="store-chip-label">Tienda:</span>
              <span className="store-chip-value">{activeStoreName}</span>
            </div>
            <select
              className="store-switcher"
              value={activeStoreId}
              onChange={(e) => handleStoreChange(e.target.value)}
              disabled={Boolean(lockedStoreId)}
              title={lockedStoreId ? 'Tu sesión está limitada a una sola tienda' : undefined}
            >
              {!lockedStoreId && <option value="">Sin filtro de tienda</option>}
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name || store.slug || store.id}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary" type="button" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="page-content" key={activeStoreId || 'no-store'}>
          {children}
        </main>
      </div>
    </div>
  );
}

// Keep legacy exports for backward compatibility
export function Header() { return null; }
export function Footer() { return null; }
