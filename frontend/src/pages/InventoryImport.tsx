import { useMemo, useState } from 'react';
import {
  importInventoryCsv,
  validateInventoryCsv,
} from '../services/catalog';
import { InventoryImportHistory } from '../components/InventoryImportHistory';

type ImportErrorItem = {
  row: number;
  message: string;
};

type ValidationResult = {
  total: number;
  success: number;
  failed: number;
  errors: ImportErrorItem[];
  mode: 'listing-update' | 'full-upsert';
  dryRun: boolean;
  importId?: string;
};

export function InventoryImport() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResponse, setImportResponse] = useState<ValidationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canImport = useMemo(() => {
    return Boolean(selectedFile && validationResult && validationResult.failed === 0);
  }, [selectedFile, validationResult]);

  const selectedFileMeta = selectedFile
    ? `${selectedFile.name} · ${(selectedFile.size / 1024).toFixed(1)} KB`
    : 'CSV o XLSX';

  const onValidate = async () => {
    if (!selectedFile) {
      setErrorMessage('Selecciona un archivo primero.');
      return;
    }

    setErrorMessage(null);
    setImportResponse(null);
    setLoadingValidation(true);

    try {
      const response = await validateInventoryCsv(selectedFile);
      setValidationResult(response.result);
    } catch (error) {
      setValidationResult(null);
      setErrorMessage((error as Error).message);
    } finally {
      setLoadingValidation(false);
    }
  };

  const onConfirmImport = async () => {
    if (!selectedFile) {
      setErrorMessage('Selecciona un archivo primero.');
      return;
    }

    setErrorMessage(null);
    setLoadingImport(true);

    try {
      const response = await importInventoryCsv(selectedFile);
      setImportResponse(response.result);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoadingImport(false);
    }
  };

  const onFilePicked = (file: File | null) => {
    setSelectedFile(file);
    setValidationResult(null);
    setImportResponse(null);
    setErrorMessage(null);
  };

  return (
    <section className="section-card" style={{ marginTop: 24 }}>
      <div className="hero-panel" style={{ marginBottom: 20 }}>
        <span className="badge" style={{ marginBottom: 10 }}>Importación operativa</span>
        <h2 className="hero-title">Sube inventario en CSV o XLSX</h2>
        <p className="hero-subtitle">
          Valida antes de importar para evitar errores en stock, precios o catálogo. El backend detecta automáticamente el formato.
        </p>
      </div>

      <div className="dropzone" style={{ marginBottom: 16 }}>
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => onFilePicked(e.target.files?.[0] || null)}
          style={{ display: 'block', marginBottom: 12 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <strong>{selectedFile ? selectedFile.name : 'Arrastra o selecciona un archivo'}</strong>
            <div className="muted" style={{ marginTop: 4 }}>{selectedFileMeta}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={onValidate} disabled={loadingValidation || !selectedFile}>
              {loadingValidation ? 'Validando...' : 'Prevalidar'}
            </button>

            <button onClick={onConfirmImport} disabled={loadingImport || !canImport}>
              {loadingImport ? 'Importando...' : 'Confirmar importación'}
            </button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Formatos soportados: CSV estándar o XLSX. El sistema crea o actualiza cartas, ediciones y listings según el contenido.
        </p>
      </div>

      {errorMessage && <p style={{ color: '#b42318', marginTop: 12 }}>{errorMessage}</p>}

      {validationResult && (
        <div className="surface-card" style={{ marginTop: 16, padding: 16 }}>
          <h3>Resultado de prevalidacion</h3>
          <p>
            Modo: <strong>{validationResult.mode}</strong>
          </p>
          <p>
            Total: <strong>{validationResult.total}</strong> | OK: <strong>{validationResult.success}</strong> | Error:{' '}
            <strong>{validationResult.failed}</strong>
          </p>

          {validationResult.errors.length > 0 && (
            <div>
              <h4>Errores por fila</h4>
              <ul>
                {validationResult.errors.map((err, idx) => (
                  <li key={`${err.row}-${idx}`}>
                    Fila {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {importResponse && (
        <div className="surface-card" style={{ marginTop: 16, padding: 16, background: '#ecfdf3' }}>
          <h3>Importacion completada</h3>
          <p>
            Import ID: <strong>{importResponse.importId || 'N/A'}</strong>
          </p>
          <p>
            Procesadas: <strong>{importResponse.total}</strong> | OK: <strong>{importResponse.success}</strong> | Error:{' '}
            <strong>{importResponse.failed}</strong>
          </p>
        </div>
      )}

      <InventoryImportHistory />
    </section>
  );
}
