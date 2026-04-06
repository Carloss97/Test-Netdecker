export const DEFAULT_MARGIN_MULTIPLIER = 1.0;

export const SUPPORTED_TCGS = [
  'MAGIC',
  'POKEMON',
  'YUGIOH',
  'ONE_PIECE',
  'DIGIMON',
  'WEISS_SCHWARZ',
] as const;

export type SupportedTcg = (typeof SUPPORTED_TCGS)[number];

export function resolveMarginMultiplier(input?: number | null): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0) {
    return DEFAULT_MARGIN_MULTIPLIER;
  }
  return input;
}

export function parseOptionalPositiveNumber(raw?: string): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}