import type { ExternalCard } from '../types';
import * as tcgcsvClient from './tcgcsv';
const ALLOW_DIRECT_TCGCSV = String(import.meta.env.VITE_ALLOW_TCGCSV_DIRECT || '').toLowerCase() === 'true';
import * as scryfallClient from './scryfall';
import * as pokemonClient from './pokemontcg';
import * as ygoproClient from './ygopro';
import * as optcgClient from './optcg';

const STORAGE_KEY_LISTINGS = 'netdecker.local_listings_v1';
const STORAGE_KEY_IMPORTS = 'netdecker.local_import_jobs_v1';

export interface LocalListing {
  id: string;
  createdAt: string;
  tcg: string;
  card: ExternalCard;
  quantity: number;
  condition?: string;
  referencePrice?: number;
  marginMultiplier?: number;
}

function readListings(): LocalListing[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LISTINGS);
    if (!raw) return [];
    return JSON.parse(raw) as LocalListing[];
  } catch {
    return [];
  }
}

function writeListings(list: LocalListing[]) {
  localStorage.setItem(STORAGE_KEY_LISTINGS, JSON.stringify(list));
}

function saveListing(listing: LocalListing) {
  const all = readListings();
  all.push(listing);
  writeListings(all);
}

function genId(prefix = 'local'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function resolveCard(tcg: string, cardId: string): Promise<ExternalCard | null> {
  // Try TCGCSV first, then fallbacks per tcg
  try {
    if (ALLOW_DIRECT_TCGCSV) {
      const c = await tcgcsvClient.getCardById(tcg as any, cardId);
      if (c) return c;
    }
  } catch (_) {}

  try {
    switch (tcg) {
      case 'MAGIC':
        return await scryfallClient.getCardById(cardId);
      case 'POKEMON':
        return await pokemonClient.getCardById(cardId);
      case 'YUGIOH':
        return await ygoproClient.getCardById(cardId);
      case 'ONE_PIECE':
        return await optcgClient.getCardById(cardId);
      default:
        return null;
    }
  } catch (_) {
    return null;
  }
}

export interface ImportOptions {
  createListing?: boolean;
  referencePrice?: number;
  marginMultiplier?: number;
  quantity?: number;
  condition?: string;
}

export interface ImportResult {
  cardId: string;
  listingId?: string;
  action: 'created' | 'updated' | 'skipped';
  card: { cardName: string; editionCode: string; externalId: string };
}

export interface BulkImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ externalId: string; message: string }>;
  results: ImportResult[];
}

export async function importCardLocal(tcg: string, cardId: string, options: ImportOptions = {}): Promise<{ result: ImportResult }> {
  const card = await resolveCard(tcg, cardId);
  if (!card) throw new Error('Card not found in external sources');

  const action: ImportResult['action'] = 'created';
  let listingId: string | undefined;

  if (options.createListing) {
    listingId = genId('listing');
    const listing = {
      id: listingId,
      createdAt: new Date().toISOString(),
      tcg,
      card,
      quantity: options.quantity ?? 0,
      condition: options.condition,
      referencePrice: options.referencePrice,
      marginMultiplier: options.marginMultiplier,
    };
    saveListing(listing);
  }

  const result: ImportResult = {
    cardId: card.externalId,
    listingId,
    action,
    card: { cardName: card.cardName, editionCode: card.editionCode, externalId: card.externalId },
  };

  // persist import job metadata
  try {
    const jobsRaw = localStorage.getItem(STORAGE_KEY_IMPORTS);
    const jobs = jobsRaw ? JSON.parse(jobsRaw) : [];
    jobs.push({ id: genId('import'), type: 'card', tcg, cardId: card.externalId, options, result, createdAt: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY_IMPORTS, JSON.stringify(jobs));
  } catch (_) {}

  return { result };
}

export async function importSearchLocal(tcg: string, query: string, options: ImportOptions & { setCode?: string; page?: number } = {}): Promise<BulkImportResult> {
  // Search via TCGCSV primary, then fallbacks if needed
  let cards: ExternalCard[] = [];
  try {
    if (ALLOW_DIRECT_TCGCSV) cards = await tcgcsvClient.searchCards(tcg as any, query, 100);
  } catch (_) { /* ignore */ }

  if (!cards || cards.length === 0) {
    try {
      switch (tcg) {
        case 'MAGIC':
          cards = await scryfallClient.searchCards(query, 1, 100);
          break;
        case 'POKEMON':
          cards = await pokemonClient.searchCards(query, options.setCode, 100);
          break;
        case 'YUGIOH':
          cards = await ygoproClient.searchCards(query, options.setCode);
          break;
        case 'ONE_PIECE':
          cards = await optcgClient.searchCards(query);
          break;
        default:
          cards = [];
      }
    } catch (_) {
      cards = [];
    }
  }

  const result: BulkImportResult = { total: cards.length, created: 0, updated: 0, skipped: 0, errors: [], results: [] };

  for (const card of cards) {
    try {
      const r = await importCardLocal(tcg, card.externalId, options);
      result.results.push(r.result);
      if (r.result.action === 'created') result.created += 1;
      else if (r.result.action === 'updated') result.updated += 1;
      else result.skipped += 1;
    } catch (err: any) {
      result.errors.push({ externalId: card.externalId, message: err?.message ?? 'unknown' });
      result.skipped += 1;
    }
  }

  return result;
}

export async function importSetLocal(tcg: string, setCode: string, options: ImportOptions = {}): Promise<BulkImportResult> {
  let cards: ExternalCard[] = [];
  try {
    if (ALLOW_DIRECT_TCGCSV) cards = await tcgcsvClient.getSetCards(tcg as any, setCode);
  } catch (_) { cards = []; }

  if (!cards || cards.length === 0) {
    // Try fallbacks
    try {
      switch (tcg) {
        case 'MAGIC':
          cards = await scryfallClient.getSetCards(setCode);
          break;
        case 'POKEMON':
          cards = await pokemonClient.getSetCards(setCode);
          break;
        case 'YUGIOH':
          cards = await ygoproClient.getSetCards(setCode);
          break;
        case 'ONE_PIECE':
          cards = await optcgClient.getSetCards(setCode);
          break;
        default:
          cards = [];
      }
    } catch (_) { cards = []; }
  }

  const result: BulkImportResult = { total: cards.length, created: 0, updated: 0, skipped: 0, errors: [], results: [] };

  for (const card of cards) {
    try {
      const r = await importCardLocal(tcg, card.externalId, options);
      result.results.push(r.result);
      if (r.result.action === 'created') result.created += 1;
      else if (r.result.action === 'updated') result.updated += 1;
      else result.skipped += 1;
    } catch (err: any) {
      result.errors.push({ externalId: card.externalId, message: err?.message ?? 'unknown' });
      result.skipped += 1;
    }
  }

  return result;
}

export function listLocalListings(): LocalListing[] {
  return readListings();
}

export function clearLocalListings() {
  localStorage.removeItem(STORAGE_KEY_LISTINGS);
}

export function exportLocalListingsJson(): string {
  const all = readListings();
  return JSON.stringify(all, null, 2);
}

export function exportLocalListingsCsv(): string {
  const all = readListings();
  const rows = [
    ['id', 'createdAt', 'tcg', 'externalId', 'cardName', 'editionCode', 'quantity', 'condition', 'referencePrice', 'marginMultiplier'],
  ];
  for (const r of all) {
    rows.push([
      r.id,
      r.createdAt,
      r.tcg,
      r.card.externalId,
      r.card.cardName.replace(/\n/g, ' '),
      r.card.editionCode,
      String(r.quantity),
      r.condition ?? '',
      r.referencePrice?.toString() ?? '',
      r.marginMultiplier?.toString() ?? '',
    ]);
  }
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function deleteListing(id: string) {
  const all = readListings();
  const filtered = all.filter((l) => l.id !== id);
  writeListings(filtered);
}

export function updateListing(updated: Partial<LocalListing> & { id: string }) {
  const all = readListings();
  const idx = all.findIndex((l) => l.id === updated.id);
  if (idx === -1) throw new Error('Listing not found');
  const merged = { ...all[idx], ...updated } as LocalListing;
  all[idx] = merged;
  writeListings(all);
  return merged;
}

export function importLocalListingsFromJson(items: any[]): number {
  if (!Array.isArray(items)) return 0;
  const all = readListings();
  let added = 0;
  for (const it of items) {
    try {
      const listing: LocalListing = {
        id: genId('listing'),
        createdAt: new Date().toISOString(),
        tcg: it.tcg ?? 'MAGIC',
        card: it.card as ExternalCard,
        quantity: typeof it.quantity === 'number' ? it.quantity : parseInt(it.quantity, 10) || 0,
        condition: it.condition ?? 'NM',
        referencePrice: typeof it.referencePrice === 'number' ? it.referencePrice : (it.referencePrice ? parseFloat(it.referencePrice) : undefined),
        marginMultiplier: typeof it.marginMultiplier === 'number' ? it.marginMultiplier : (it.marginMultiplier ? parseFloat(it.marginMultiplier) : undefined),
      };
      all.push(listing);
      added += 1;
    } catch (_) {
      continue;
    }
  }
  writeListings(all);
  return added;
}

export default {
  importCardLocal,
  importSearchLocal,
  importSetLocal,
  listLocalListings,
  exportLocalListingsJson,
  exportLocalListingsCsv,
  clearLocalListings,
  deleteListing,
  updateListing,
  importLocalListingsFromJson,
};
