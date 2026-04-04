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

  return (
    <section style={{ marginTop: 30, padding: 20, border: '1px solid #ddd', borderRadius: 10 }}>
      <h2>Prevalidacion CSV de Inventario</h2>
      <p>Valida el archivo antes de importar para evitar errores en stock y catalogo.</p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            setSelectedFile(file);
            setValidationResult(null);
            setImportResponse(null);
            setErrorMessage(null);
          }}
        />

        <button onClick={onValidate} disabled={loadingValidation || !selectedFile}>
          {loadingValidation ? 'Validando...' : 'Prevalidar CSV'}
        </button>

        <button onClick={onConfirmImport} disabled={loadingImport || !canImport}>
          {loadingImport ? 'Importando...' : 'Confirmar Importacion'}
        </button>
      </div>

      {errorMessage && <p style={{ color: '#b42318', marginTop: 12 }}>{errorMessage}</p>}

      {validationResult && (
        <div style={{ marginTop: 16 }}>
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
        <div style={{ marginTop: 16, padding: 12, background: '#ecfdf3', border: '1px solid #abefc6' }}>
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
