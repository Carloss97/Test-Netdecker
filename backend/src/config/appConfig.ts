// Runtime application configuration with sensible defaults and an admin-toggle API.

export function parseBooleanEnv(raw?: string | null | undefined, defaultValue: boolean = true): boolean {
  if (raw === undefined || raw === null) return defaultValue;
  const v = String(raw).trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return defaultValue;
}

function parsePositiveNumberEnv(raw?: string | null | undefined): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const LOCAL_ONLY_DEFAULT = true;

export function isLocalOnlyMode(): boolean {
  return parseBooleanEnv(
    process.env.LOCAL_ONLY_MODE ?? process.env.TCGCSV_ONLY_MODE,
    LOCAL_ONLY_DEFAULT,
  );
}

export function getManualUsdToClpRate(defaultValue = 1000): number {
  return (
    parsePositiveNumberEnv(process.env.MANUAL_USD_TO_CLP) ??
    parsePositiveNumberEnv(process.env.VITE_MANUAL_USD_TO_CLP) ??
    parsePositiveNumberEnv(process.env.USD_TO_CLP) ??
    parsePositiveNumberEnv(process.env.EXCHANGE_RATE_FALLBACK) ??
    defaultValue
  );
}

let _defaultImportSetSyncPrices = parseBooleanEnv(
  process.env.IMPORT_SET_SYNC_PRICES_DEFAULT,
  !isLocalOnlyMode(),
);

export function isImportSetSyncPricesDefault(): boolean {
  return _defaultImportSetSyncPrices;
}

export function setImportSetSyncPricesDefault(value: boolean): void {
  _defaultImportSetSyncPrices = !!value;
  // Keep process.env in sync for visibility in logs and child processes
  process.env.IMPORT_SET_SYNC_PRICES_DEFAULT = _defaultImportSetSyncPrices ? 'true' : 'false';
}

export default {
  isLocalOnlyMode,
  getManualUsdToClpRate,
  isImportSetSyncPricesDefault,
  setImportSetSyncPricesDefault,
};
