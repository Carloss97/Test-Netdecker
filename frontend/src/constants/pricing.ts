export const DEFAULT_MARGIN_MULTIPLIER = 1.0;
export const DEFAULT_MARGIN_INPUT = DEFAULT_MARGIN_MULTIPLIER.toFixed(1);

export function parsePositiveNumberInput(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}
