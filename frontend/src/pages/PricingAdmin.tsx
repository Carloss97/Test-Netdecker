import { useEffect, useState } from 'react';
import { getListingPriceDebug, getPriceSyncRunById, getPriceSyncRuns, previewAdminPricing, syncListingPrices } from '../services/catalog';
import { DEFAULT_MARGIN_INPUT } from '../constants/pricing';

type AdminPricePreviewResponse = {
  success: boolean;
  listing: {
    id: string;
    cardId: string;
    cardName: string;
    cardCode: string;
    editionCode: string;
    editionName: string;
    currentReferencePrice: number;
    currentMarginMultiplier: number;
    currentFinalPrice: number;
  } | null;
  preview: {
    referencePrice: number;
    marginMultiplier: number;
    exchangeRate: number;
    exchangeRateRetrievalSource: string;
    exchangeRateProvider: string | null;
    exchangeRateFetchedAt: string | null;
    exchangeRateExpiresAt: string | null;
    finalPrice: number;
    formula: string;
    roundedFinalPrice: number;
    rawFinalPrice: number;
    roundingMultiple: number;
    currency: string;
  };
  diff: {
    delta: number | null;
    deltaPercent: number | null;
    isVolatile: boolean | null;
  };
};

type ListingPriceDebugResponse = {
  listingId: string;
  cardName: string;
  condition: string;
  quantity: number;
  pricing: {
    storedReferencePrice: number;
    storedMarginMultiplier: number;
    storedExchangeRate: number;
    storedFinalPrice: number;
    storedLastSyncedAt: string | null;
  };
  currentExchangeRate: {
    rate: number;
    retrievalSource: string;
    provider: string | null;
    fetchedAt: string | null;
    expiresAt: string | null;
  };
  recalculation: {
    formula: string;
    rawRecalculatedFinalPrice: number;
    recalculatedFinalPrice: number;
    roundedRecalculatedFinalPrice: number;
    roundingMultiple: number;
    delta: number;
    deltaPercent: number;
    isVolatile: boolean;
  };
};

type PriceSyncRun = {
  id: string;
  source: string;
  status: string;
  total: number;
  updated: number;
  volatile: number;
  failed: number;
  roundingMultiple: number;
  startedAt: string;
  completedAt: string | null;
  parsedErrors?: Array<{ listingId: string; message: string }>;
};

interface PricingAdminProps {
  initialListingId?: string;
}

export function PricingAdmin({ initialListingId }: PricingAdminProps) {
  const [referencePrice, setReferencePrice] = useState('5.5');
  const [marginMultiplier, setMarginMultiplier] = useState(DEFAULT_MARGIN_INPUT);
  const [roundingMultiple, setRoundingMultiple] = useState('1');
  const [listingId, setListingId] = useState('');
  const [previewResult, setPreviewResult] = useState<AdminPricePreviewResponse | null>(null);
  const [debugResult, setDebugResult] = useState<ListingPriceDebugResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingDebug, setLoadingDebug] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [runningSync, setRunningSync] = useState(false);
  const [runs, setRuns] = useState<PriceSyncRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PriceSyncRun | null>(null);
  const [syncNotes, setSyncNotes] = useState('Manual sync from Admin Precios');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runDebug = async (id: string) => {
    const cleanId = id.trim();
    if (!cleanId) {
      setErrorMessage('Ingresa un listingId para revisar.');
      return;
    }

    setErrorMessage(null);
    setDebugResult(null);
    setLoadingDebug(true);

    try {
      const data = await getListingPriceDebug(cleanId);
      setDebugResult(data);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoadingDebug(false);
    }
  };

  useEffect(() => {
    if (!initialListingId) return;
    setListingId(initialListingId);
    void runDebug(initialListingId);
  }, [initialListingId]);

  const onPreview = async () => {
    setErrorMessage(null);
    setPreviewResult(null);

    const ref = Number(referencePrice);
    const margin = Number(marginMultiplier);
    const rounding = Number(roundingMultiple);

    if (
      !Number.isFinite(ref) ||
      ref <= 0 ||
      !Number.isFinite(margin) ||
      margin <= 0 ||
      !Number.isFinite(rounding) ||
      rounding < 1
    ) {
      setErrorMessage('Ingresa referencePrice, marginMultiplier y roundingMultiple validos.');
      return;
    }

    setLoadingPreview(true);
    try {
      const data = await previewAdminPricing({
        listingId: listingId.trim() || undefined,
        referencePrice: ref,
        marginMultiplier: margin,
        roundingMultiple: rounding,
      });
      setPreviewResult(data);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const onDebug = async () => {
    await runDebug(listingId);
  };

  const loadRuns = async () => {
    setLoadingRuns(true);
    try {
      const data = await getPriceSyncRuns(10);
      setRuns(data.runs || []);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoadingRuns(false);
    }
  };

  const runManualSync = async () => {
    const rounding = Number(roundingMultiple);

    if (!Number.isFinite(rounding) || rounding < 1) {
      setErrorMessage('Ingresa un redondeo valido para sync manual.');
      return;
    }

    setRunningSync(true);
    setErrorMessage(null);
    try {
      await syncListingPrices(undefined, rounding, syncNotes);
      await loadRuns();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setRunningSync(false);
    }
  };

  const openRunDetails = async (runId: string) => {
    try {
      const run = await getPriceSyncRunById(runId);
      setSelectedRun(run);
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  };

  return (
    <section style={{ marginTop: 30, padding: 20, border: '1px solid #ddd', borderRadius: 10 }}>
      <h2>Inspector de Precios</h2>
      <p>Comprueba como se calcula el precio CLP y revisa si un listing quedo desfasado respecto al tipo de cambio actual.</p>

      <div style={{ marginTop: 12, padding: 12, border: '1px solid #e4e7ec', borderRadius: 8 }}>
        <h3>Preview de formula</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label>
            USD referencia
            <input
              type="number"
              step="0.01"
              value={referencePrice}
              onChange={(e) => setReferencePrice(e.target.value)}
              style={{ marginLeft: 8 }}
            />
          </label>
          <label>
            Margen
            <input
              type="number"
              step="0.01"
              value={marginMultiplier}
              onChange={(e) => setMarginMultiplier(e.target.value)}
              style={{ marginLeft: 8 }}
            />
          </label>
          <label>
            Redondeo CLP
            <input
              type="number"
              step="1"
              min="1"
              value={roundingMultiple}
              onChange={(e) => setRoundingMultiple(e.target.value)}
              style={{ marginLeft: 8 }}
            />
          </label>
          <button onClick={onPreview} disabled={loadingPreview}>
            {loadingPreview ? 'Calculando...' : 'Calcular Precio'}
          </button>
        </div>

        {previewResult && (
          <div style={{ marginTop: 12 }}>
            {previewResult.listing && (
              <p>
                Listing: <strong>{previewResult.listing.cardName}</strong> ({previewResult.listing.cardCode}) [{previewResult.listing.editionCode}]
              </p>
            )}
            <p>
              Formula: <strong>{previewResult.preview.formula}</strong>
            </p>
            <p>
              Tipo de cambio: <strong>{previewResult.preview.exchangeRate}</strong> ({previewResult.preview.exchangeRateRetrievalSource})
            </p>
            <p>
              Precio base (sin redondeo): <strong>{Number(previewResult.preview.rawFinalPrice ?? 0).toFixed(2)} CLP</strong>
            </p>
            <p>
              Precio final: <strong>{Number(previewResult.preview.finalPrice ?? 0).toFixed(2)} CLP</strong> (multiplo: {previewResult.preview.roundingMultiple})
            </p>
            {previewResult.diff.delta !== null && previewResult.diff.deltaPercent !== null && (
              <p>
                Delta vs actual: <strong>{Number(previewResult.diff.delta ?? 0).toFixed(2)} CLP</strong> ({Number(previewResult.diff.deltaPercent ?? 0).toFixed(2)}%)
                {previewResult.diff.isVolatile !== null && (
                  <> | Volatil: <strong>{previewResult.diff.isVolatile ? 'SI' : 'NO'}</strong></>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, padding: 12, border: '1px solid #e4e7ec', borderRadius: 8 }}>
        <h3>Debug por listingId</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            placeholder="cm... listing id"
            style={{ minWidth: 320 }}
          />
          <button onClick={onDebug} disabled={loadingDebug}>
            {loadingDebug ? 'Revisando...' : 'Revisar Listing'}
          </button>
        </div>

        {debugResult && (
          <div style={{ marginTop: 12 }}>
            <p>
              Carta: <strong>{debugResult.cardName}</strong> ({debugResult.condition}) | Stock: {debugResult.quantity}
            </p>
            <p>
              Guardado: ref USD {debugResult.pricing.storedReferencePrice} * margen {debugResult.pricing.storedMarginMultiplier} * fx {debugResult.pricing.storedExchangeRate}
            </p>
            <p>
              Precio guardado: <strong>{Number(debugResult.pricing.storedFinalPrice ?? 0).toFixed(2)} CLP</strong>
            </p>
            <p>
              Recalculo actual: <strong>{Number(debugResult.recalculation.recalculatedFinalPrice ?? 0).toFixed(2)} CLP</strong> ({debugResult.recalculation.formula})
            </p>
            <p>
              Recalculo base (sin redondeo): <strong>{Number(debugResult.recalculation.rawRecalculatedFinalPrice ?? 0).toFixed(2)} CLP</strong> | Multiplo aplicado: {debugResult.recalculation.roundingMultiple}
            </p>
            <p>
              Delta: <strong>{Number(debugResult.recalculation.delta ?? 0).toFixed(2)} CLP</strong> ({Number(debugResult.recalculation.deltaPercent ?? 0).toFixed(2)}%)
            </p>
            <p>
              Volatil: <strong>{debugResult.recalculation.isVolatile ? 'SI' : 'NO'}</strong>
            </p>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, padding: 12, border: '1px solid #e4e7ec', borderRadius: 8 }}>
        <h3>Trazabilidad Sync de Precios</h3>
        <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={syncNotes}
            onChange={(e) => setSyncNotes(e.target.value)}
            placeholder="Notas de corrida"
            style={{ minWidth: 260 }}
          />
          <button onClick={runManualSync} disabled={runningSync}>
            {runningSync ? 'Ejecutando sync...' : 'Ejecutar Sync Manual (todos los activos)'}
          </button>
        </div>
        <button onClick={loadRuns} disabled={loadingRuns}>
          {loadingRuns ? 'Cargando corridas...' : 'Ver ultimas corridas'}
        </button>

        {runs.length > 0 && (
          <ul style={{ marginTop: 10 }}>
            {runs.map((run) => (
              <li key={run.id}>
                {run.source.toUpperCase()} | {run.status} | total {run.total} | ok {run.updated} | fail {run.failed} | volatil {run.volatile} | redondeo {run.roundingMultiple}
                <button type="button" style={{ marginLeft: 8 }} onClick={() => openRunDetails(run.id)}>
                  Ver errores
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedRun && (
          <div style={{ marginTop: 10 }}>
            <h4>Detalle corrida {selectedRun.id}</h4>
            {selectedRun.parsedErrors?.length ? (
              <ul>
                {selectedRun.parsedErrors.map((err, idx) => (
                  <li key={`${err.listingId}-${idx}`}>
                    {err.listingId}: {err.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Sin errores registrados.</p>
            )}
          </div>
        )}
      </div>

      {errorMessage && <p style={{ color: '#b42318', marginTop: 12 }}>{errorMessage}</p>}
    </section>
  );
}
