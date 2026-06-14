import prisma from '../utils/db.js';

export type LocalStoreSummary = { id: string; slug: string; name: string };

const DEFAULT_LOCAL_STORE = {
  slug: 'local-store',
  name: 'Tienda Local',
  description: 'Tienda local creada automáticamente para desarrollo offline',
  currency: 'CLP',
  taxRate: 0,
};

const DEFAULT_TCGS = [
  { name: 'MAGIC', displayName: 'Magic: The Gathering' },
  { name: 'POKEMON', displayName: 'Pokémon Trading Card Game' },
  { name: 'YUGIOH', displayName: 'Yu-Gi-Oh!' },
  { name: 'ONE_PIECE', displayName: 'One Piece Trading Card Game' },
  { name: 'DIGIMON', displayName: 'Digimon Card Game' },
  { name: 'WEISS_SCHWARZ', displayName: 'Weiss Schwarz' },
] as const;

function toStoreSummary(store: any): LocalStoreSummary {
  return {
    id: String(store.id),
    slug: String(store.slug),
    name: String(store.name),
  };
}

function isUniqueConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Unique constraint failed') || message.includes('UNIQUE constraint failed');
}

export class LocalBootstrapService {
  static readonly localStoreSlug = DEFAULT_LOCAL_STORE.slug;

  static async ensureLocalStore(): Promise<LocalStoreSummary> {
    const existing = await prisma.store.findUnique({
      where: { slug: DEFAULT_LOCAL_STORE.slug },
      select: { id: true, slug: true, name: true },
    } as any);

    if (existing) return toStoreSummary(existing);

    try {
      const created = await prisma.store.create({
        data: DEFAULT_LOCAL_STORE,
        select: { id: true, slug: true, name: true },
      } as any);
      return toStoreSummary(created);
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const store = await prisma.store.findUnique({
        where: { slug: DEFAULT_LOCAL_STORE.slug },
        select: { id: true, slug: true, name: true },
      } as any);
      if (!store) throw error;
      return toStoreSummary(store);
    }
  }

  static async ensureDefaultTCGs() {
    for (const tcg of DEFAULT_TCGS) {
      await prisma.tCG.upsert({
        where: { name: tcg.name },
        update: { displayName: tcg.displayName, isActive: true },
        create: { name: tcg.name, displayName: tcg.displayName, isActive: true },
      } as any);
    }

    return prisma.tCG.findMany({
      where: { name: { in: DEFAULT_TCGS.map((tcg) => tcg.name) } },
      orderBy: { displayName: 'asc' },
    } as any);
  }
}

export default LocalBootstrapService;
