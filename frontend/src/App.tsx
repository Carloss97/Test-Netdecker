import { useState } from 'react';
import './App.css';
import { Catalog } from './pages/Catalog';
import { InventoryImport } from './pages/InventoryImport';
import { PricingAdmin } from './pages/PricingAdmin';
import { ExternalCardSearch } from './pages/ExternalCardSearch';
import { AdminDashboardPage } from './pages/AdminDashboard';
import { Header, Footer } from './components/Layout';

type ActiveView = 'catalog' | 'admin-imports' | 'admin-pricing' | 'external-cards' | 'admin-dashboard';

function App() {
  const [activeView, setActiveView] = useState<ActiveView>('admin-imports');
  const [selectedListingDebugId, setSelectedListingDebugId] = useState<string>('');

  const openPriceDebugFromCatalog = (listingId: string) => {
    setSelectedListingDebugId(listingId);
    setActiveView('admin-pricing');
  };

  return (
    <div className="app">
      <Header />
      <main>
        <section className="top-nav-tabs">
          <button
            className={activeView === 'catalog' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveView('catalog')}
          >
            Catálogo
          </button>
          <button
            className={activeView === 'external-cards' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveView('external-cards')}
          >
            Buscar Cartas Externas
          </button>
          <button
            className={activeView === 'admin-imports' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveView('admin-imports')}
          >
            Admin Importaciones
          </button>
          <button
            className={activeView === 'admin-pricing' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveView('admin-pricing')}
          >
            Admin Precios
          </button>
          <button
            className={activeView === 'admin-dashboard' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveView('admin-dashboard')}
          >
            Dashboard
          </button>
        </section>

        {activeView === 'catalog' && <Catalog onOpenPriceDebug={openPriceDebugFromCatalog} />}
        {activeView === 'external-cards' && <ExternalCardSearch />}
        {activeView === 'admin-imports' && <InventoryImport />}
        {activeView === 'admin-pricing' && <PricingAdmin initialListingId={selectedListingDebugId} />}
        {activeView === 'admin-dashboard' && <AdminDashboardPage />}
      </main>
      <Footer />
    </div>
  );
}

export default App;
