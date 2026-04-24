import { memo } from 'react';
import type { StorefrontFilters } from '../../hooks/useStorefront';

interface FilterSidebarProps {
  filters: StorefrontFilters;
  setFilters: (next: StorefrontFilters) => void;
  tcgOptions: string[];
  rarityOptions: string[];
  suggestions: string[];
}

function FilterSidebar({
  filters,
  setFilters,
  tcgOptions,
  rarityOptions,
  suggestions,
}: FilterSidebarProps) {
  return (
    <aside className="sf-filter-card">
      <h3>Filtros</h3>
      <label>Buscar carta</label>
      <input
        value={filters.query}
        onChange={(e) => setFilters({ ...filters, query: e.target.value })}
        list="sf-autocomplete"
        placeholder="Ej: Lightning Bolt"
      />
      <datalist id="sf-autocomplete">
        {suggestions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      <label>TCG</label>
      <select value={filters.tcgId} onChange={(e) => setFilters({ ...filters, tcgId: e.target.value })}>
        {tcgOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <label>Rareza</label>
      <select value={filters.rarity} onChange={(e) => setFilters({ ...filters, rarity: e.target.value })}>
        {rarityOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <label>Precio mínimo (CLP)</label>
      <input
        inputMode="numeric"
        value={filters.minPrice}
        onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
        placeholder="0"
      />

      <label>Precio máximo (CLP)</label>
      <input
        inputMode="numeric"
        value={filters.maxPrice}
        onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
        placeholder="Sin límite"
      />

      <button
        type="button"
        className="sf-ghost-btn"
        onClick={() =>
          setFilters({
            query: '',
            tcgId: 'ALL',
            rarity: 'ALL',
            minPrice: '',
            maxPrice: '',
          })
        }
      >
        Limpiar filtros
      </button>
    </aside>
  );
}

export default memo(FilterSidebar);
