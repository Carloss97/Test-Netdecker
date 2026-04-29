import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import { logout } from '../services/adminAuth';

const NAV_GROUPS = [
  {
    title: 'Centro de Control',
    items: [
      { to: '/', icon: '🏠', label: 'Dashboard' },
      { to: '/pedidos', icon: '🚚', label: 'Pedidos' },
    ]
  },
  {
    title: 'Gestión de Stock',
    items: [
      { to: '/catalog', icon: '💎', label: 'Catálogo Maestro' },
      { to: '/pos', icon: '💳', label: 'Punto de Venta' },
    ]
  },
  {
    title: 'Finanzas y Estrategia',
    items: [
      { to: '/admin/expenses', icon: '💸', label: 'Egresos y Facturas' },
    ]
  },
  {
    title: 'Configuración',
    items: [
      { to: '/admin', icon: '🛠️', label: 'Sistema y Ajustes' },
      { to: '/admin/multi-tenant', icon: '🏢', label: 'Multi-tienda', globalOnly: true },
      { to: '/storefront', icon: '🛍️', label: 'Demo Tienda' },
    ]
  }
];

type AdminStore = {
  id: string;
  slug?: string;
  name?: string;
};

type SessionIdentity = {
  id?: string;
  email?: string;
  role?: 'ADMIN' | 'MANAGER' | 'STAFF' | string;
  storeId?: string | null;
  resolvedStoreId?: string | null;
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
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);

  useEffect(() => {
    const fromStorage = localStorage.getItem('auth_store') || '';
    setActiveStoreId(fromStorage);
  }, []);

  const refreshIdentity = async () => {
    try {
      const resp = await apiClient.get('/admin/auth/me');
      const data = resp?.data?.data as SessionIdentity;
      setIdentity(data);
      if (data?.storeId) setLockedStoreId(data.storeId);
    } catch {
      setIdentity(null);
    }
  };

  useEffect(() => {
    void refreshIdentity();
    apiClient.get('/admin/stores').then(r => setStores(r.data.stores || [])).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_store');
    navigate('/login', { replace: true });
  };

  const activeStoreName = useMemo(() => {
    const match = stores.find(s => s.id === activeStoreId);
    return match ? (match.name || match.slug) : 'Seleccionar Tienda';
  }, [stores, activeStoreId]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-title">🃏 Netdecker</div>
        </div>
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="sidebar-nav-group">
              <div className="sidebar-nav-header">{group.title}</div>
              {group.items.filter(item => {
                if ((item as any).globalOnly && identity?.storeId) return false;
                return true;
              }).map(({ to, icon, label }) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}>
                  <span className="sidebar-nav-icon">{icon}</span> {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main-wrapper">
        <header className="page-header">
          <div className="page-header-left">
            <h1>Panel de Gestión</h1>
            <p>{identity?.email} · {identity?.role}</p>
          </div>
          <div className="page-header-actions">
            <div className="store-chip">{activeStoreName}</div>
            <button className="btn btn-secondary" onClick={handleLogout}>Cerrar sesión</button>
          </div>
        </header>
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}

export function Header() { return null; }
export function Footer() { return null; }
