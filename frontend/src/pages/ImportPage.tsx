import { useEffect, useRef, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import {
  getTCGs,
  getEditions,
  listExternalSets,
  importExternalSet,
  validateInventoryCsv,
  importInventoryCsv,
  getInventoryImports,
  exportInventoryCsv,
  resetCatalog,
} from '../services/catalog';
import type { EditionWithCounts } from '../types';
import { logClientError } from '../utils/observability';
import {
  getExternalSetImportCode,
  getExternalSetRowKey,
  normalizeExternalSets,
  type ExternalSetLike,
  type NormalizedExternalSet,
} from '../utils/externalSets';

type TcgCode = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';

interface ImportRecord {
  id: string;
  fileName: string;
  status: string;
  totalRecords: number;
  successCount: number;
  failureCount: number;
  createdAt: string;
}

interface PaginatedImports {
  items: ImportRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function ImportPage() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'csv'>('catalog');

  // ── Catalog tab state ──
  const [catalogTcg, setCatalogTcg] = useState('');
  const [loadingSets, setLoadingSets] = useState(false);
  const [externalSets, setExternalSets] = useState<NormalizedExternalSet[]>([]);
  const [importingSet, setImportingSet] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [localEditions, setLocalEditions] = useState<EditionWithCounts[]>([]);
  const [loadingLocalEditions, setLoadingLocalEditions] = useState(false);
  const [exportTcg, setExportTcg] = useState('');
  const [selectedExportEditionId, setSelectedExportEditionId] = useState('');
  const [exportingScope, setExportingScope] = useState<'edition' | 'tcg' | 'all' | null>(null);
  const [setSearch, setSetSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<'code' | 'name' | 'cards' | 'releaseDate'>('code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // ── CSV tab state ──
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors?: string[]; totalRows?: number } | null>(null);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Reset state ──
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const tcgsQuery = useAsync(() => getTCGs());
  const importsQuery = useAsync(() => getInventoryImports({ pageSize: 10 }));

  const { data: tcgs, status: tcgsStatus, error: tcgsLoadError, execute: reloadTcgs } = tcgsQuery;
  const { data: imports, status: importsStatus, error: importsLoadError, execute: reloadImports } = importsQuery;

  const tcgList = (tcgs as { id: string; name: string; displayName: string }[] | null) ?? [];
  const selectedCatalogTcgDisplay = tcgList.find((t) => t.id === catalogTcg)?.displayName;

  useEffect(() => {
    const selected = tcgList.find((t) => t.id === exportTcg);
    if (!selected) {
      setLocalEditions([]);
      setSelectedExportEditionId('');
      return;
    }

    setLoadingLocalEditions(true);
    getEditions({ tcgId: selected.id, activeOnly: false })
      .then((data) => {
        setLocalEditions(data);
        setSelectedExportEditionId('');
      })
      .catch(() => {
        setLocalEditions([]);
        logClientError({
          area: 'import-page',
          action: 'load-local-editions',
          message: 'Failed loading local editions for selected TCG',
          context: { exportTcg },
        });
      })
      .finally(() => setLoadingLocalEditions(false));
  }, [exportTcg, tcgs]);

  useEffect(() => {
    // Prevent mixing set lists across TCGs and reset table controls.
    setExternalSets([]);
    setSetSearch('');
    setSortColumn('code');
    setSortDirection('asc');
  }, [catalogTcg]);

  useEffect(() => {
    if (!catalogTcg) return;
    setLoadingSets(true);
    setImportMsg(null);
    setImportError(null);
    listExternalSets(catalogTcg as TcgCode)
      .then((result) => {
        const sets = (result as { sets?: ExternalSetLike[] }).sets ?? [];
        setExternalSets(normalizeExternalSets(sets));
      })
      .catch((err) => {
        setImportError('Error al cargar sets externos');
        logClientError({
          area: 'import-page',
          action: 'load-external-sets',
          message: 'Failed loading external sets',
          context: { catalogTcg },
          error: err,
        });
      })
      .finally(() => setLoadingSets(false));
  }, [catalogTcg]);

  const handleLoadSets = async () => {
    if (!catalogTcg) return;
    setLoadingSets(true);
    setImportMsg(null);
    setImportError(null);
    try {
      const result = await listExternalSets(catalogTcg as TcgCode);
      const sets = (result as { sets?: ExternalSetLike[] }).sets ?? [];
      setExternalSets(normalizeExternalSets(sets));
    } catch (err) {
      setImportError('Error al cargar sets externos');
      logClientError({
        area: 'import-page',
        action: 'manual-reload-external-sets',
        message: 'Failed manually reloading external sets',
        context: { catalogTcg },
        error: err,
      });
    } finally {
      setLoadingSets(false);
    }
  };

  const handleImportSet = async (set: NormalizedExternalSet) => {
    const importCode = getExternalSetImportCode(set);
    setImportingSet(importCode);
    setImportMsg(null);
    setImportError(null);
    try {
      await importExternalSet({ tcg: catalogTcg as TcgCode, setCode: importCode });
      setImportMsg(`Set "${set.code}" importado correctamente`);
    } catch (err) {
      setImportError(`Error al importar set "${set.code}"`);
      logClientError({
        area: 'import-page',
        action: 'import-external-set',
        message: 'Failed importing external set',
        context: { catalogTcg, setCode: set.code, importCode },
        error: err,
      });
    } finally {
      setImportingSet(null);
    }
  };

  const handleExportInventory = async (scope: 'edition' | 'tcg' | 'all') => {
    setExportingScope(scope);
    setImportError(null);
    setImportMsg(null);

    try {
      const selected = tcgList.find((t) => t.id === exportTcg);

      if (scope === 'tcg' && !selected?.id) {
        setImportError('Selecciona un TCG para exportar por TCG');
        return;
      }

      if (scope === 'edition' && !selectedExportEditionId) {
        setImportError('Selecciona una edición para exportar por set/edición');
        return;
      }

      const blob = await exportInventoryCsv({
        scope,
        tcgId: scope === 'tcg' ? selected?.id : undefined,
        editionId: scope === 'edition' ? selectedExportEditionId : undefined,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        scope === 'edition'
          ? `inventory-edition-${selectedExportEditionId}.csv`
          : scope === 'tcg'
            ? `inventory-tcg-${selected?.name || 'unknown'}.csv`
            : 'inventory-all.csv';
      a.click();
      URL.revokeObjectURL(url);
      setImportMsg('CSV de inventario exportado correctamente');
    } catch (err) {
      setImportError('Error al exportar inventario');
      logClientError({
        area: 'import-page',
        action: 'export-inventory',
        message: 'Failed exporting inventory CSV',
        context: { scope, exportTcg, selectedExportEditionId },
        error: err,
      });
    } finally {
      setExportingScope(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setValidationResult(null);
    setCsvMsg(null);
    setCsvError(null);
    setValidating(true);
    try {
      const result = await validateInventoryCsv(file);
      // Backend returns { success: true, validationOnly: true, result: { total, success, failed, errors } }
      const apiResult = (result as { result?: { total?: number; success?: number; failed?: number; errors?: Array<{ row: number; message: string }> } }).result;
      const hasErrors = (apiResult?.errors?.length ?? 0) > 0 || (apiResult?.failed ?? 0) > 0;
      setValidationResult({
        valid: !hasErrors,
        totalRows: apiResult?.total,
        errors: apiResult?.errors?.map((e) => `Fila ${e.row}: ${e.message}`) ?? [],
      });
    } catch (err) {
      setCsvError('Error al validar archivo CSV');
      logClientError({
        area: 'import-page',
        action: 'validate-csv',
        message: 'Failed validating CSV file',
        context: { fileName: file.name, size: file.size },
        error: err,
      });
    } finally {
      setValidating(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvFile) return;
    setImporting(true);
    setCsvMsg(null);
    setCsvError(null);
    try {
      await importInventoryCsv(csvFile);
      setCsvMsg('CSV importado correctamente');
      setCsvFile(null);
      setValidationResult(null);
      if (fileRef.current) fileRef.current.value = '';
      reloadImports();
    } catch (err) {
      setCsvError('Error al importar CSV');
      logClientError({
        area: 'import-page',
        action: 'import-csv',
        message: 'Failed importing CSV file',
        context: { fileName: csvFile?.name },
        error: err,
      });
    } finally {
      setImporting(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('⚠️ ¿Seguro que quieres BORRAR todos los datos del catálogo (cartas, ediciones, listings, historial de precios e importaciones)? Esta acción NO se puede deshacer.')) return;
    setResetting(true);
    setResetMsg(null);
    setResetError(null);
    try {
      const res = await resetCatalog();
      setResetMsg(res.message);
    } catch (err) {
      setResetError('Error al resetear catálogo');
      logClientError({
        area: 'import-page',
        action: 'reset-catalog',
        message: 'Failed resetting catalog from import page',
        error: err,
      });
    } finally {
      setResetting(false);
    }
  };

  const importList = ((imports as PaginatedImports | null)?.items ?? []);

  const filteredSortedSets = [...externalSets]
    .filter((s) => {
      if (!setSearch.trim()) return true;
      const q = setSearch.toLowerCase();
      return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const mult = sortDirection === 'asc' ? 1 : -1;
      switch (sortColumn) {
        case 'code':
          return mult * a.code.localeCompare(b.code);
        case 'name':
          return mult * a.name.localeCompare(b.name);
        case 'cards':
          return mult * ((a.totalCards ?? 0) - (b.totalCards ?? 0));
        case 'releaseDate':
          return mult * String(a.releaseDate ?? '').localeCompare(String(b.releaseDate ?? ''));
        default:
          return 0;
      }
    });

  const handleSort = (column: 'code' | 'name' | 'cards' | 'releaseDate') => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortColumn(column);
    setSortDirection('asc');
  };

  return (
    <div>
      <div className="tabs">
        <button
          className={`tab-btn${activeTab === 'catalog' ? ' active' : ''}`}
          onClick={() => setActiveTab('catalog')}
        >
          🌐 Importar / Exportar
        </button>
        <button
          className={`tab-btn${activeTab === 'csv' ? ' active' : ''}`}
          onClick={() => setActiveTab('csv')}
        >
          📋 CSV de Stock
        </button>
      </div>

      {/* ── Catalog Tab ── */}
      {activeTab === 'catalog' && (
        <div>
          {tcgsStatus === 'pending' && (
            <div className="surface-card" style={{ padding: 12, marginBottom: 12 }}>
              ⏳ Cargando lista de TCGs...
            </div>
          )}
          {tcgsStatus === 'error' && (
            <div className="error-message" style={{ marginBottom: 12 }}>
              ⚠ No se pudo cargar la lista de TCGs.
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: 8 }}
                onClick={() => { void reloadTcgs(); }}
                title="Reintentar carga de juegos"
              >
                Reintentar
              </button>
              {tcgsLoadError?.message ? <div style={{ marginTop: 6, fontSize: '0.8rem' }}>{tcgsLoadError.message}</div> : null}
            </div>
          )}

          {importMsg && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, color: '#15803d', fontSize: '0.875rem' }}>
              ✓ {importMsg}
            </div>
          )}
          {importError && (
            <div className="error-message" style={{ marginBottom: 16 }}>⚠ {importError}</div>
          )}

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Seleccionar Juego</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <select
                  className="input"
                  value={catalogTcg}
                  onChange={(e) => setCatalogTcg(e.target.value)}
                  style={{ maxWidth: 300 }}
                >
                  <option value="">-- Selecciona un TCG --</option>
                  {((tcgs as { id: string; name: string; displayName: string }[] | null) ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.displayName}</option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleLoadSets}
                disabled={!catalogTcg || loadingSets}
                title="Recarga los sets disponibles del TCG seleccionado"
              >
                {loadingSets ? '⏳ Cargando sets…' : '🔄 Recargar Sets'}
              </button>
            </div>
            <p style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Flujo recomendado: selecciona TCG, recarga sets y luego importa el set que necesites.
            </p>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Exportar Inventario (Re-importable)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 10, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>TCG para exportar por juego/set</label>
                <select
                  className="input"
                  value={exportTcg}
                  onChange={(e) => setExportTcg(e.target.value)}
                  title="Selecciona el juego para exportar por TCG o por set"
                >
                  <option value="">-- Selecciona un TCG --</option>
                  {((tcgs as { id: string; name: string; displayName: string }[] | null) ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.displayName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Set / Edición</label>
                <select
                  className="input"
                  value={selectedExportEditionId}
                  onChange={(e) => setSelectedExportEditionId(e.target.value)}
                  disabled={!exportTcg || loadingLocalEditions}
                  title="Selecciona la edición específica para exportación por set"
                >
                  <option value="">-- Selecciona una edición --</option>
                  {localEditions.map((ed) => (
                    <option key={ed.id} value={ed.id}>{ed.editionCode} · {ed.editionName}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-secondary" onClick={() => handleExportInventory('edition')} disabled={exportingScope !== null} title="Exporta solo la edición seleccionada">
                {exportingScope === 'edition' ? '⏳ Exportando…' : '⬇ Exportar Set'}
              </button>
              <button className="btn btn-secondary" onClick={() => handleExportInventory('tcg')} disabled={exportingScope !== null} title="Exporta todas las ediciones del TCG seleccionado">
                {exportingScope === 'tcg' ? '⏳ Exportando…' : '⬇ Exportar TCG'}
              </button>
              <button className="btn btn-primary" onClick={() => handleExportInventory('all')} disabled={exportingScope !== null} title="Exporta el inventario completo de todos los TCG">
                {exportingScope === 'all' ? '⏳ Exportando…' : '⬇ Exportar Total'}
              </button>
            </div>
            <p style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Exporta CSV para restaurar inventario o mover datos entre entornos. El flujo especial de Yu-Gi-Oh fue retirado.
            </p>
          </div>

          {externalSets.length > 0 && (
            <div className="card">
              <div className="section-title" style={{ marginBottom: 12 }}>
                Sets Disponibles ({externalSets.length})
              </div>
              <div style={{ marginBottom: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Mostrando sets de: <strong>{selectedCatalogTcgDisplay || catalogTcg}</strong>
              </div>
              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  className="input"
                  value={setSearch}
                  onChange={(e) => setSetSearch(e.target.value)}
                  placeholder="Buscar set por código o nombre..."
                  style={{ maxWidth: 420 }}
                  title="Filtra los sets por código o nombre"
                />
              </div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('code')}>Código {sortColumn === 'code' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Nombre {sortColumn === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('cards')}>Cartas {sortColumn === 'cards' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleSort('releaseDate')}>Lanzamiento {sortColumn === 'releaseDate' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedSets.map((s, idx) => {
                      const importCode = getExternalSetImportCode(s);
                      return (
                        <tr key={getExternalSetRowKey(catalogTcg || 'UNKNOWN', s, idx)}>
                          <td><span className="badge badge-gray" title={s.groupId ? `TCGCSV groupId: ${s.groupId}` : undefined}>{s.code}</span></td>
                          <td style={{ fontWeight: 500 }}>{s.name}</td>
                          <td>{s.totalCards ?? '—'}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.releaseDate ?? '—'}</td>
                          <td>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleImportSet(s)}
                              disabled={importingSet === importCode}
                              title={`Importar catálogo completo del set ${s.code}${s.groupId ? ` (grupo ${s.groupId})` : ''}`}
                            >
                              {importingSet === importCode ? '⏳ Importando…' : '⬇ Importar Set'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CSV Tab ── */}
      {activeTab === 'csv' && (
        <div>
          {importsStatus === 'pending' && (
            <div className="surface-card" style={{ padding: 12, marginBottom: 12 }}>
              ⏳ Cargando historial de importaciones...
            </div>
          )}
          {importsStatus === 'error' && (
            <div className="error-message" style={{ marginBottom: 12 }}>
              ⚠ No se pudo cargar el historial de importaciones.
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: 8 }}
                onClick={() => { void reloadImports(); }}
                title="Reintentar carga del historial"
              >
                Reintentar
              </button>
              {importsLoadError?.message ? <div style={{ marginTop: 6, fontSize: '0.8rem' }}>{importsLoadError.message}</div> : null}
            </div>
          )}

          {csvMsg && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, color: '#15803d', fontSize: '0.875rem' }}>
              ✓ {csvMsg}
            </div>
          )}
          {csvError && (
            <div className="error-message" style={{ marginBottom: 16 }}>⚠ {csvError}</div>
          )}

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title" style={{ marginBottom: 16 }}>Subir CSV de Stock</div>
            <div className="upload-area" onClick={() => fileRef.current?.click()}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>📁</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {csvFile ? csvFile.name : 'Arrastra o haz clic para seleccionar'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Formato CSV · máx. 5MB
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>

            {validating && (
              <div className="loading-spinner" style={{ marginTop: 16 }}>⏳ Validando CSV…</div>
            )}

            {validationResult && (
              <div style={{ marginTop: 16 }}>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius)',
                  background: validationResult.valid ? '#dcfce7' : '#fee2e2',
                  border: `1px solid ${validationResult.valid ? '#86efac' : '#fca5a5'}`,
                  color: validationResult.valid ? '#15803d' : 'var(--danger)',
                  fontSize: '0.875rem',
                  marginBottom: 12,
                }}>
                  {validationResult.valid
                    ? `✓ Archivo válido · ${validationResult.totalRows ?? 0} registros`
                    : `✗ Archivo inválido · ${validationResult.errors?.length ?? 0} error(es)`
                  }
                </div>
                {validationResult.errors && validationResult.errors.length > 0 && (
                  <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: '0.8rem', color: 'var(--danger)' }}>
                    {validationResult.errors.map((err, i) => (
                      <div key={i} style={{ padding: '2px 0' }}>• {err}</div>
                    ))}
                  </div>
                )}
                {validationResult.valid && (
                  <button className="btn btn-primary" onClick={handleImportCsv} disabled={importing} title="Confirma la carga del CSV validado">
                    {importing ? '⏳ Importando…' : '✓ Confirmar Importación'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-title" style={{ marginBottom: 12 }}>Historial de Importaciones</div>
            {importsStatus !== 'error' && importList.length === 0 ? (
              <div className="empty-state" style={{ padding: '20px 0' }}>
                <div>Sin importaciones previas</div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Archivo</th>
                      <th>Estado</th>
                      <th>Total</th>
                      <th>OK</th>
                      <th>Errores</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importList.map((imp) => (
                      <tr key={imp.id}>
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {imp.fileName}
                        </td>
                        <td>
                          <span className={`badge ${imp.status === 'completed' ? 'badge-green' : imp.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>
                            {imp.status}
                          </span>
                        </td>
                        <td>{imp.totalRecords}</td>
                        <td style={{ color: 'var(--success)' }}>{imp.successCount}</td>
                        <td style={{ color: imp.failureCount > 0 ? 'var(--danger)' : 'inherit' }}>{imp.failureCount}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {new Date(imp.createdAt).toLocaleDateString('es-CL')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Danger Zone ── */}
          <div className="card" style={{ marginTop: 20, border: '1px solid #fca5a5' }}>
            <div className="section-title" style={{ marginBottom: 8, color: 'var(--danger)' }}>⚠ Zona de Peligro</div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              Elimina TODOS los datos del catálogo (cartas, ediciones, listings, historial de precios e importaciones).
              Los registros de TCG y el tipo de cambio se conservan.
            </p>
            {resetMsg && (
              <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 12, color: '#15803d', fontSize: '0.875rem' }}>
                ✓ {resetMsg}
              </div>
            )}
            {resetError && (
              <div className="error-message" style={{ marginBottom: 12 }}>⚠ {resetError}</div>
            )}
            <button
              className="btn btn-sm"
              style={{ background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' }}
              onClick={handleReset}
              disabled={resetting}
            >
              {resetting ? '⏳ Reseteando…' : '🗑 Resetear Catálogo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
