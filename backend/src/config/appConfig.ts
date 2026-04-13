// Runtime application configuration with sensible defaults and an admin-toggle API.

function parseBooleanEnv(raw?: string | null | undefined, defaultValue: boolean = true): boolean {
  if (raw === undefined || raw === null) return defaultValue;
  const v = String(raw).trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return defaultValue;
}

let _defaultImportSetSyncPrices = parseBooleanEnv(process.env.IMPORT_SET_SYNC_PRICES_DEFAULT, true);

export function isImportSetSyncPricesDefault(): boolean {
  return _defaultImportSetSyncPrices;
}

export function setImportSetSyncPricesDefault(value: boolean): void {
  _defaultImportSetSyncPrices = !!value;
  // Keep process.env in sync for visibility in logs and child processes
  process.env.IMPORT_SET_SYNC_PRICES_DEFAULT = _defaultImportSetSyncPrices ? 'true' : 'false';
}

export default {
  isImportSetSyncPricesDefault,
  setImportSetSyncPricesDefault,
};
