import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { LocalBootstrapService } from './LocalBootstrapService.js';

test('LocalBootstrapService creates default local store idempotently', async () => {
  const first = await LocalBootstrapService.ensureLocalStore();
  const second = await LocalBootstrapService.ensureLocalStore();

  assert.equal(first.slug, 'local-store');
  assert.equal(first.name, 'Tienda Local');
  assert.equal(second.id, first.id);
});

test('LocalBootstrapService creates default TCGs idempotently', async () => {
  const first = await LocalBootstrapService.ensureDefaultTCGs();
  const second = await LocalBootstrapService.ensureDefaultTCGs();

  assert.ok(first.length >= 6);
  assert.deepEqual(
    first.map((tcg: { name: string }) => tcg.name).sort(),
    ['DIGIMON', 'MAGIC', 'ONE_PIECE', 'POKEMON', 'WEISS_SCHWARZ', 'YUGIOH'].sort(),
  );
  assert.equal(second.length, first.length);

  const stored = await prisma.tCG.findMany({});
  assert.equal(stored.length, first.length);
});
