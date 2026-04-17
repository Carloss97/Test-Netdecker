import { useEffect, useState } from 'react';
import { exportInventoryImportsCsv, getInventoryImportById, getInventoryImports, rollbackInventoryImport } from '../services/catalog';

type ImportErrorItem = {
  row: number;
  message: string;
};

type InventoryImportHistoryItem = {
  id: string;
  fileName: string;
  status: string;
  totalRecords: number;
  successCount: number;
  failureCount: number;
  importedBy?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

type ImportDetail = InventoryImportHistoryItem & {
  parsedErrors: ImportErrorItem[];
};

export function InventoryImportHistory() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<'createdAt' | 'status' | 'fileName' | 'totalRecords'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [imports, setImports] = useState<InventoryImportHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingImports, setLoadingImports] = useState(false);

  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [selectedImportDetail, setSelectedImportDetail] = useState<ImportDetail | null>(null);
  const [loadingImportDetail, setLoadingImportDetail] = useState(false);
  const [rollbackDryRun, setRollbackDryRun] = useState(true);
  const [rollbackForce, setRollbackForce] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackResult, setRollbackResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadImports = async () => {
    setLoadingImports(true);
    setErrorMessage(null);

    try {
      const response = await getInventoryImports({
        page,
        pageSize,
        status: statusFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        sortDir,
      });

      setImports(response.items || []);
      setTotal(response.total || 0);
      setTotalPages(response.totalPages || 1);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoadingImports(false);
    }
  };

  const loadImportDetail = async (importId: string) => {
    setLoadingImportDetail(true);
    setSelectedImportId(importId);

    try {
      const response = await getInventoryImportById(importId);
      setSelectedImportDetail(response.import || null);
    } catch (error) {
      setSelectedImportDetail(null);
      setErrorMessage((error as Error).message);
    } finally {
      setLoadingImportDetail(false);
    }
  };

  const handleRollbackEntire = async () => {
    if (!selectedImportId) return;
    setRollbackLoading(true);
    setRollbackResult(null);
    try {
      const res = await rollbackInventoryImport(selectedImportId, { dryRun: rollbackDryRun, force: rollbackForce });
      setRollbackResult(res);
      // refresh details
      await loadImportDetail(selectedImportId);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleRollbackBatch = async (batchId?: string, batchIndex?: number) => {
    if (!selectedImportId) return;
    setRollbackLoading(true);
    setRollbackResult(null);
    try {
      const params: any = { dryRun: rollbackDryRun, force: rollbackForce };
      if (batchId) params.batchId = batchId;
      if (typeof batchIndex !== 'undefined') params.batchIndex = batchIndex;
      const res = await rollbackInventoryImport(selectedImportId, params);
      setRollbackResult(res);
      await loadImportDetail(selectedImportId);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setRollbackLoading(false);
    }
  };

  useEffect(() => {
    loadImports();
  }, [page, pageSize, sortBy, sortDir]);

  const exportCurrentViewToCsv = () => {
    if (!imports.length) {
      return;
    }

    const header = ['id', 'fileName', 'status', 'totalRecords', 'successCount', 'failureCount', 'importedBy', 'createdAt', 'completedAt'];
    const rows = imports.map((item) => [
      item.id,
      item.fileName,
      item.status,
      String(item.totalRecords),
      String(item.successCount),
      String(item.failureCount),
      item.importedBy || '',
      item.createdAt,
      item.completedAt || '',
    ]);

    const csv = [header, ...rows]
      .map((cols) => cols.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory-import-history-page-${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportFilteredDatasetToCsv = async () => {
    try {
      const blob = await exportInventoryImportsCsv({
        status: statusFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        sortDir,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'inventory-import-history-filtered.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  };

  return (
    <section style={{ marginTop: 28, borderTop: '1px solid #e4e7ec', paddingTop: 20 }}>
      <h3>Historial de importaciones</h3>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="processing">processing</option>
          <option value="completed">completed</option>
          <option value="completed_with_errors">completed_with_errors</option>
          <option value="failed">failed</option>
        </select>

        <label>
          Desde:{' '}
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>

        <label>
          Hasta:{' '}
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>

        <label>
          Tamano pagina:{' '}
          <select
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value));
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>

        <label>
          Ordenar por:{' '}
          <select
            value={sortBy}
            onChange={(e) => {
              setPage(1);
              setSortBy(e.target.value as 'createdAt' | 'status' | 'fileName' | 'totalRecords');
            }}
          >
            <option value="createdAt">Fecha</option>
            <option value="status">Estado</option>
            <option value="fileName">Archivo</option>
            <option value="totalRecords">Registros</option>
          </select>
        </label>

        <label>
          Direccion:{' '}
          <select
            value={sortDir}
            onChange={(e) => {
              setPage(1);
              setSortDir(e.target.value as 'asc' | 'desc');
            }}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </label>

        <button
          onClick={() => {
            setPage(1);
            loadImports();
          }}
          disabled={loadingImports}
        >
          {loadingImports ? 'Filtrando...' : 'Aplicar filtros'}
        </button>

        <button
          onClick={() => {
            setStatusFilter('');
            setDateFrom('');
            setDateTo('');
            setPage(1);
          }}
        >
          Limpiar
        </button>

        <button onClick={exportCurrentViewToCsv} disabled={!imports.length}>
          Exportar CSV (vista actual)
        </button>

        <button onClick={exportFilteredDatasetToCsv}>
          Exportar CSV (todo filtrado)
        </button>
      </div>

      {errorMessage && <p style={{ color: '#b42318' }}>{errorMessage}</p>}

      <p>
        Total registros: <strong>{total}</strong>
      </p>

      {imports.length === 0 && !loadingImports && <p>No hay importaciones registradas para el filtro actual.</p>}

      {imports.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' }}>Archivo</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' }}>Estado</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' }}>Registros</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' }}>OK/Error</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' }}>Fecha</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' }}>Accion</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((item) => (
                <tr key={item.id} style={{ background: selectedImportId === item.id ? '#f2f4f7' : 'transparent' }}>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{item.fileName}</td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{item.status}</td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{item.totalRecords}</td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                    {item.successCount}/{item.failureCount}
                  </td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                    <button onClick={() => loadImportDetail(item.id)} disabled={loadingImportDetail}>
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button
          onClick={() => setPage((p) => Math.max(p - 1, 1))}
          disabled={page <= 1 || loadingImports}
        >
          Anterior
        </button>
        <span>
          Pagina <strong>{page}</strong> de <strong>{totalPages}</strong>
        </span>
        <button
          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          disabled={page >= totalPages || loadingImports}
        >
          Siguiente
        </button>
      </div>

      {selectedImportDetail && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
          <h4>Detalle de importacion</h4>
          <p>
            ID: <strong>{selectedImportDetail.id}</strong>
          </p>
          <p>
            Archivo: <strong>{selectedImportDetail.fileName}</strong>
          </p>
          <p>
            Estado: <strong>{selectedImportDetail.status}</strong>
          </p>
          <p>
            Registros: <strong>{selectedImportDetail.totalRecords}</strong> | OK: <strong>{selectedImportDetail.successCount}</strong> | Error:{' '}
            <strong>{selectedImportDetail.failureCount}</strong>
          </p>

          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <label>
              <input type="checkbox" checked={rollbackDryRun} onChange={(e) => setRollbackDryRun(e.target.checked)} /> Dry run
            </label>
            <label>
              <input type="checkbox" checked={rollbackForce} onChange={(e) => setRollbackForce(e.target.checked)} /> Force
            </label>
            <button onClick={handleRollbackEntire} disabled={rollbackLoading}>{rollbackLoading ? 'Procesando...' : (rollbackDryRun ? 'Rollback (dry-run)' : 'Rollback')}</button>
            {rollbackResult && <span style={{ marginLeft: 8 }}>{rollbackResult?.message || 'Resultado disponible'}</span>}
          </div>

          {(selectedImportDetail as any)?.batches && (selectedImportDetail as any).batches.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h5>Batches</h5>
              <ul>
                {(selectedImportDetail as any).batches.map((b: any) => (
                  <li key={b.id} style={{ marginBottom: 6 }}>
                    Batch {b.batchIndex} ({b.startRow ?? '-'} - {b.endRow ?? '-'}){' '}
                    <button onClick={() => handleRollbackBatch(b.id, undefined)} disabled={rollbackLoading} style={{ marginLeft: 8 }}>{rollbackLoading ? '...' : (rollbackDryRun ? 'Rollback batch (dry-run)' : 'Rollback batch')}</button>
                    <button onClick={() => handleRollbackBatch(undefined, b.batchIndex)} disabled={rollbackLoading} style={{ marginLeft: 8 }}>{rollbackLoading ? '...' : (rollbackDryRun ? 'Rollback batchIndex (dry-run)' : 'Rollback batchIndex')}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedImportDetail.parsedErrors?.length > 0 ? (
            <div>
              <h5>Errores por fila</h5>
              <ul>
                {selectedImportDetail.parsedErrors.map((err, idx) => (
                  <li key={`${err.row}-${idx}`}>
                    Fila {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>Sin errores registrados.</p>
          )}
        </div>
      )}
    </section>
  );
}
