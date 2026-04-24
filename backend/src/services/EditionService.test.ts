import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { EditionService } from './EditionService.js';

test('getEdition delegates to prisma with cards include', async () => {
  const originalFindUnique = prisma.edition.findUnique;
  try {
    let receivedArgs: any = null;
    prisma.edition.findUnique = (async (args: any) => {
      receivedArgs = args;
      return { id: 'ed-1', editionCode: 'SET1' };
    }) as any;

    const result = await EditionService.getEdition('ed-1');

    assert.equal(result?.id, 'ed-1');
    assert.deepEqual(receivedArgs, {
      where: { id: 'ed-1' },
      include: { cards: true },
    });
  } finally {
    prisma.edition.findUnique = originalFindUnique;
  }
});

test('getEditionsByTCG applies active filter by default and orders by release date', async () => {
  const originalFindMany = prisma.edition.findMany;
  try {
    let receivedArgs: any = null;
    prisma.edition.findMany = (async (args: any) => {
      receivedArgs = args;
      return [{ id: 'ed-1' }];
    }) as any;

    const result = await EditionService.getEditionsByTCG('tcg-1');

    assert.equal(result.length, 1);
    assert.deepEqual(receivedArgs, {
      where: {
        tcgId: 'tcg-1',
        isActive: true,
      },
      include: { cards: true },
      orderBy: { releaseDate: 'desc' },
    });
  } finally {
    prisma.edition.findMany = originalFindMany;
  }
});

test('getEditionsByTCG can include inactive editions', async () => {
  const originalFindMany = prisma.edition.findMany;
  try {
    let receivedArgs: any = null;
    prisma.edition.findMany = (async (args: any) => {
      receivedArgs = args;
      return [{ id: 'ed-1' }, { id: 'ed-2' }];
    }) as any;

    const result = await EditionService.getEditionsByTCG('tcg-1', false);

    assert.equal(result.length, 2);
    assert.deepEqual(receivedArgs, {
      where: {
        tcgId: 'tcg-1',
      },
      include: { cards: true },
      orderBy: { releaseDate: 'desc' },
    });
  } finally {
    prisma.edition.findMany = originalFindMany;
  }
});

test('createEdition defaults isActive to true when omitted', async () => {
  const originalCreate = prisma.edition.create;
  try {
    let receivedArgs: any = null;
    prisma.edition.create = (async (args: any) => {
      receivedArgs = args;
      return { id: 'ed-1', ...args.data };
    }) as any;

    const result = await EditionService.createEdition({
      tcgId: 'tcg-1',
      editionCode: 'SET1',
      editionName: 'Set One',
    });

    assert.equal(result.isActive, true);
    assert.equal(receivedArgs.data.isActive, true);
  } finally {
    prisma.edition.create = originalCreate;
  }
});

test('createEdition preserves explicit false isActive', async () => {
  const originalCreate = prisma.edition.create;
  try {
    let receivedArgs: any = null;
    prisma.edition.create = (async (args: any) => {
      receivedArgs = args;
      return { id: 'ed-2', ...args.data };
    }) as any;

    const result = await EditionService.createEdition({
      tcgId: 'tcg-1',
      editionCode: 'SET2',
      editionName: 'Set Two',
      isActive: false,
    });

    assert.equal(result.isActive, false);
    assert.equal(receivedArgs.data.isActive, false);
  } finally {
    prisma.edition.create = originalCreate;
  }
});

test('upsertEdition uses composite unique key and updates display fields', async () => {
  const originalUpsert = prisma.edition.upsert;
  try {
    let receivedArgs: any = null;
    prisma.edition.upsert = (async (args: any) => {
      receivedArgs = args;
      return { id: 'ed-1', ...args.create };
    }) as any;

    const releaseDate = new Date('2024-01-01T00:00:00.000Z');
    const result = await EditionService.upsertEdition('tcg-1', 'SET1', 'Set One', releaseDate);

    assert.equal(result.editionCode, 'SET1');
    assert.deepEqual(receivedArgs.where, {
      tcgId_editionCode: {
        tcgId: 'tcg-1',
        editionCode: 'SET1',
      },
    });
    assert.deepEqual(receivedArgs.update, {
      editionName: 'Set One',
      releaseDate,
    });
  } finally {
    prisma.edition.upsert = originalUpsert;
  }
});

test('updateEdition and deactivateEdition delegate to prisma.update', async () => {
  const originalUpdate = prisma.edition.update;
  try {
    const calls: any[] = [];
    prisma.edition.update = (async (args: any) => {
      calls.push(args);
      return { id: args.where.id, ...args.data };
    }) as any;

    const updated = await EditionService.updateEdition('ed-1', { editionName: 'Updated Set' });
    const deactivated = await EditionService.deactivateEdition('ed-1');

    assert.equal(updated.editionName, 'Updated Set');
    assert.equal(deactivated.isActive, false);
    assert.deepEqual(calls[0], {
      where: { id: 'ed-1' },
      data: { editionName: 'Updated Set' },
    });
    assert.deepEqual(calls[1], {
      where: { id: 'ed-1' },
      data: { isActive: false },
    });
  } finally {
    prisma.edition.update = originalUpdate;
  }
});

test('getCardCount delegates to prisma.card.count', async () => {
  const originalCount = prisma.card.count;
  try {
    let receivedArgs: any = null;
    prisma.card.count = (async (args: any) => {
      receivedArgs = args;
      return 42;
    }) as any;

    const count = await EditionService.getCardCount('ed-1');

    assert.equal(count, 42);
    assert.deepEqual(receivedArgs, {
      where: { editionId: 'ed-1' },
    });
  } finally {
    prisma.card.count = originalCount;
  }
});
