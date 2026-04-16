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
import ThresholdsPage from './pages/admin/ThresholdsPage';
import { LowStockPage } from './pages/LowStockPage';
import { PosPage } from './pages/PosPage';
import { AdminAccountsPage } from './pages/AdminAccountsPage';
import StoresList from './pages/admin/StoresList';

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
          <Route path="/admin/pricing/thresholds" element={<ThresholdsPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
