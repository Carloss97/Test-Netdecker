export interface ExternalSetLike {
  code?: string;
  abbreviation?: string;
  groupId?: number | string | null;
  name?: string;
  editionName?: string;
  totalCards?: number;
  cardCount?: number;
  totalItems?: number;
  productCount?: number;
  numOfCards?: number;
  releaseDate?: string;
  publishedOn?: string;
}

export interface NormalizedExternalSet {
  code: string;
  name: string;
  groupId?: string;
  totalCards?: number;
  releaseDate?: string;
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function firstPositiveNumber(values: unknown[]): number | undefined {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export function normalizeExternalSet(set: ExternalSetLike): NormalizedExternalSet | null {
  const groupId = cleanText(set.groupId);
  const code = cleanText(set.code || set.abbreviation || groupId);
  const name = cleanText(set.name || set.editionName || code);

  if (!code || !name) return null;

  return {
    code,
    name,
    groupId: groupId || undefined,
    totalCards: firstPositiveNumber([
      set.totalCards,
      set.cardCount,
      set.totalItems,
      set.productCount,
      set.numOfCards,
    ]),
    releaseDate: cleanText(set.releaseDate || set.publishedOn) || undefined,
  };
}

export function normalizeExternalSets(sets: ExternalSetLike[]): NormalizedExternalSet[] {
  return sets
    .map((set) => normalizeExternalSet(set))
    .filter((set): set is NormalizedExternalSet => Boolean(set));
}

export function getExternalSetImportCode(set: NormalizedExternalSet): string {
  return set.groupId || set.code;
}

export function getExternalSetRowKey(tcg: string, set: NormalizedExternalSet, index: number): string {
  const stableIdentity = set.groupId
    ? `group:${set.groupId}`
    : `code:${set.code}:name:${set.name}:date:${set.releaseDate || ''}:idx:${index}`;

  return `${tcg || 'UNKNOWN'}:${stableIdentity}`;
}
