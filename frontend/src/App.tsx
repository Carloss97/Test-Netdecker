import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { PricingPage } from './pages/PricingPage';
import { ImportPage } from './pages/ImportPage';
import { CardSearchPage } from './pages/CardSearchPage';
import { AdminDashboardPage } from './pages/AdminDashboard';
import { LowStockPage } from './pages/LowStockPage';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/inventario" element={<InventoryPage />} />
          <Route path="/precios" element={<PricingPage />} />
          <Route path="/importar" element={<ImportPage />} />
          <Route path="/buscar" element={<CardSearchPage />} />
          <Route path="/stock-bajo" element={<LowStockPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
