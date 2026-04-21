import { ensureSchema } from './d1.js';
import PriceService from './priceService.js';

function mkId(prefix) {
  return (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `${prefix || 'id'}-${Date.now()}-${Math.floor(Math.random()*10000)}`;
}

export async function runPriceSync(db, env, input = {}) {
  if (!db) throw new Error('No DB provided');
  await ensureSchema(db);

  const startedAt = new Date().toISOString();
  const runId = mkId('run');

  // Create run record
  try {
    await db.prepare('INSERT INTO priceSyncRun (id, source, status, notes, total, updated, volatile, failed, roundingMultiple, errors, startedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(runId, input.source || 'manual', 'running', input.notes || null, 0, 0, 0, 0, input.roundingMultiple || null, null, startedAt, startedAt).run();
  } catch (_) {}

  let total = 0;
  let updated = 0;
  let volatile = 0;
  let failed = 0;
  const errors = [];

  const updates = Array.isArray(input.updates) ? input.updates : [];
  total = updates.length;

  for (const u of updates) {
    try {
      if (u.listingId) {
        await PriceService.updateListingPrice(db, env, u.listingId, u.referencePrice, u.marginMultiplier || 1.0, u.source || 'sync', input.changedBy || null, input.notes || null, input.roundingMultiple);
        updated += 1;
        continue;
      }

      if (u.cardId) {
        // Create a basic listing for the cardId if none exists
        const listingId = mkId('L');
        const ref = Number(u.referencePrice || 0);
        const margin = Number(u.marginMultiplier || 1.0);
        const calc = await PriceService.calculateFinalPrice(env, { referencePrice: ref, marginMultiplier: margin, roundingMultiple: input.roundingMultiple });
        try {
          await db.prepare('INSERT OR IGNORE INTO listing (id, cardId, editionCode, referencePrice, marginMultiplier, finalPrice, quantity, status, lastSyncedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(listingId, u.cardId, u.editionId || '', ref, margin, calc.finalPrice, 0, 'active', new Date().toISOString(), new Date().toISOString()).run();
        } catch (_) {}

        // Insert history
        const phId = mkId('PH');
        try {
          await db.prepare('INSERT INTO priceHistory (id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, oldExchangeRate, newExchangeRate, reason, percentChange, changedBy, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(phId, listingId, 0, calc.finalPrice, null, ref, null, calc.exchangeRate, 'initial_import', 100, input.changedBy || null, input.notes || null, new Date().toISOString()).run();
        } catch (_) {}

        updated += 1;
        continue;
      }

      throw new Error('Sync target missing listingId or cardId');
    } catch (err) {
      failed += 1;
      errors.push({ listingId: u.listingId || u.cardId || 'N/A', message: String(err) });
    }
  }

  const completedAt = new Date().toISOString();
  try {
    await db.prepare('UPDATE priceSyncRun SET status = ?, total = ?, updated = ?, volatile = ?, failed = ?, errors = ?, completedAt = ? WHERE id = ?')
      .bind(failed > 0 && updated === 0 ? 'failed' : 'completed', total, updated, volatile, failed, errors.length ? JSON.stringify(errors) : null, completedAt, runId).run();
  } catch (_) {}

  return {
    runId,
    source: input.source || 'manual',
    total,
    updated,
    volatile,
    failed,
    errors,
    startedAt,
    completedAt,
  };
}

export default { runPriceSync };
