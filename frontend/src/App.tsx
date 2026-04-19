import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
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
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/stores/:id/inventory" element={<StoreInventory />} />
          <Route path="/admin/pricing/thresholds" element={<ThresholdsPage />} />
          <Route path="/admin/approvals" element={<ApprovalsPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/local-imports" element={<LocalImportsManager />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
