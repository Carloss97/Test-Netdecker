import { useState } from 'react';
import './App.css';
import { Catalog } from './pages/Catalog';
import { InventoryImport } from './pages/InventoryImport';
import { PricingAdmin } from './pages/PricingAdmin';
import { Header, Footer } from './components/Layout';

function App() {
  const [activeView, setActiveView] = useState<'catalog' | 'admin-imports' | 'admin-pricing'>('admin-imports');
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
            Catalogo
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
        </section>

        {activeView === 'catalog' && <Catalog onOpenPriceDebug={openPriceDebugFromCatalog} />}
        {activeView === 'admin-imports' && <InventoryImport />}
        {activeView === 'admin-pricing' && <PricingAdmin initialListingId={selectedListingDebugId} />}
      </main>
      <Footer />
    </div>
  );
}

export default App;
