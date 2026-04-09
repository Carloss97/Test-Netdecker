import React, { useState } from 'react';
import importClient, { ColumnMapping } from '../services/importClient';

const EXPECTED_FIELDS = [
  'tcg',
  'editionCode',
  'editionName',
  'cardCode',
  'cardName',
  'cardNumber',
  'rarity',
  'tags',
  'imageUrl',
  'condition',
  'quantity',
  'referencePrice',
  'marginMultiplier',
];

function splitCsvHeader(line: string): string[] {
  const headers: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      headers.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.length > 0) headers.push(current.trim());
  return headers.map((h) => h.replace(/^\uFEFF/, '').trim());
}

export function ImportMapper() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [apiKey, setApiKey] = useState('');
  const [useServerMapping, setUseServerMapping] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (f: File | null) => {
    setFile(f);
    setHeaders([]);
    setMapping({});
    setResult(null);
    setError(null);

    if (!f) return;
    const text = await f.text();
    const firstNewline = text.indexOf('\n');
    const headerLine = firstNewline === -1 ? text : text.slice(0, firstNewline).replace(/\r$/, '');
    const parsed = splitCsvHeader(headerLine);
    setHeaders(parsed);
  };

  const setMap = (expected: string, csvHeader: string) => {
    setMapping((prev) => ({ ...prev, [expected]: csvHeader }));
  };

  const handleValidate = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = useServerMapping
        ? await importClient.validateWithMappingServer(file, mapping, apiKey || undefined)
        : await importClient.validateWithMapping(file, mapping, apiKey || undefined);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    if (!window.confirm('¿Importar CSV transformado al inventario?')) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = useServerMapping
        ? await importClient.importWithMappingServer(file, mapping, apiKey || undefined)
        : await importClient.importWithMapping(file, mapping, apiKey || undefined);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3>Importador con mapeo de columnas</h3>

      <div style={{ marginBottom: 12 }}>
        <label>Archivo CSV/XLSX (solo CSV en esta versión):</label>
        <input type="file" accept=".csv" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
      </div>

      {headers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 8 }}>Encabezados detectados:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {headers.map((h) => (
              <div key={h} style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6 }}>{h}</div>
            ))}
          </div>
        </div>
      )}

      {headers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 8 }}>Mapea las columnas del CSV a los campos esperados (dejar vacío si no aplica):</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            {EXPECTED_FIELDS.map((field) => (
              <React.Fragment key={field}>
                <div style={{ alignSelf: 'center' }}>{field}</div>
                <div>
                  <select
                    className="input"
                    value={mapping[field] || ''}
                    onChange={(e) => setMap(field, e.target.value)}
                  >
                    <option value="">-- No mapear --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label>API Key (si el servidor requiere `x-api-key`):</label>
        <input className="input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ marginRight: 8 }}><input type="checkbox" checked={useServerMapping} onChange={(e) => setUseServerMapping(e.target.checked)} /> Usar mapeo en servidor</label>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Si tu CSV es muy grande o no quieres que el navegador reescriba el archivo, activa el mapeo en servidor.</div>
      </div>

      {error && <div className="error-message">⚠ {error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={handleValidate} disabled={!file || loading}> {loading ? '⏳ Validando…' : 'Validar (dry-run)'} </button>
        <button className="btn" onClick={handleImport} disabled={!file || loading}> {loading ? '⏳ Importando…' : 'Importar CSV'} </button>
      </div>

      {result && (
        <pre style={{ marginTop: 12, maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(result, null, 2)}</pre>
      )}
    </div>
  );
}

export default ImportMapper;
