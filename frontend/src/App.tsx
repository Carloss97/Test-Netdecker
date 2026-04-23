import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './App.css';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { PricingPage } from './pages/PricingPage';
import { ImportPage } from './pages/ImportPage';
import { ImportMapper } from './pages/ImportMapper';
import { CardSearchPage } from './pages/CardSearchPage';
import { AdminDashboardPage } from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import StoreInventory from './pages/admin/StoreInventory';
import ThresholdsPage from './pages/admin/ThresholdsPage';
import ApprovalsPage from './pages/admin/ApprovalsPage';
import { LowStockPage } from './pages/LowStockPage';
import { PosPage } from './pages/PosPage';
import { AdminAccountsPage } from './pages/AdminAccountsPage';
import StoresList from './pages/admin/StoresList';
import LocalImportsManager from './pages/LocalImportsManager';
import apiClient from './services/api';

function readAdminToken(): string | null {
  try {
    const localToken = localStorage.getItem('auth_token');
    if (localToken) return localToken;
    const cookieToken = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('auth_token_js='));
    return cookieToken ? decodeURIComponent(cookieToken.slice('auth_token_js='.length)) : null;
  } catch {
    return null;
  }
}

function ProtectedLayout() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function RequireAdmin() {
  const location = useLocation();
  const [status, setStatus] = useState<'pending' | 'ok' | 'denied'>(() => (readAdminToken() ? 'ok' : 'pending'));

  useEffect(() => {
    if (status !== 'pending') return;

    let mounted = true;
    const timeoutId = window.setTimeout(() => {
      if (mounted) setStatus('denied');
    }, 8000);

    apiClient
      .get('/admin/auth/me')
      .then(() => {
        if (mounted) setStatus('ok');
      })
      .catch(() => {
        if (mounted) setStatus('denied');
      });

    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [status]);

  if (status === 'pending') {
    return <div style={{ padding: 24 }}>Validando sesión admin…</div>;
  }

  if (status === 'denied') {
    const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />

        <Route element={<RequireAdmin />}>
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/inventario" element={<InventoryPage />} />
            <Route path="/precios" element={<PricingPage />} />
            <Route path="/importar" element={<ImportPage />} />
            <Route path="/import-mapper" element={<ImportMapper />} />
            <Route path="/buscar" element={<CardSearchPage />} />
            <Route path="/stock-bajo" element={<LowStockPage />} />
            <Route path="/pos" element={<PosPage />} />
            <Route path="/admin/accounts" element={<AdminAccountsPage />} />
            <Route path="/admin/stores" element={<StoresList />} />
            <Route path="/admin/stores/:id/inventory" element={<StoreInventory />} />
            <Route path="/admin/pricing/thresholds" element={<ThresholdsPage />} />
            <Route path="/admin/approvals" element={<ApprovalsPage />} />
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/local-imports" element={<LocalImportsManager />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
