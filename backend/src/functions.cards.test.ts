import test from 'node:test';
import assert from 'node:assert/strict';

const searchModule = await import('../../functions/api/cards/search.js');
const byIdModule = await import('../../functions/api/cards/[id].js');
const editionModule = await import('../../functions/api/cards/edition/[editionId].js');
const tcgModule = await import('../../functions/api/cards/tcg/[tcgId].js');

const searchHandler = searchModule.onRequest || searchModule.default?.onRequest || searchModule.default || searchModule;
const byIdHandler = byIdModule.onRequest || byIdModule.default?.onRequest || byIdModule.default || byIdModule;
const editionHandler = editionModule.onRequest || editionModule.default?.onRequest || editionModule.default || editionModule;
const tcgHandler = tcgModule.onRequest || tcgModule.default?.onRequest || tcgModule.default || tcgModule;

class D1Mock {
  constructor() { this.tables = { card: [] }; }
  prepare(sql) {
    const self = this;
    const sqlStr = String(sql || '').trim();
    const low = sqlStr.toLowerCase();
    return {
      bound: [],
      bind(...args) { this.bound = args || []; return this; },
      async all() {
        if (low.startsWith('pragma table_info')) return { results: [] };
        // select by id
        if (low.includes('from card') && low.includes('where id =')) {
          const id = this.bound && this.bound[0];
          const found = self.tables.card.find((r) => String(r.id) === String(id));
          return { results: found ? [found] : [] };
        }
        // search by name or code using LIKE
        if (low.includes('from card') && low.includes('like')) {
          const pattern = (this.bound && this.bound[0]) || '';
          const like = String(pattern).replace(/%/g, '').toLowerCase();
          const rows = self.tables.card.filter((r) => ((r.cardName || '').toLowerCase().includes(like) || (r.cardCode || '').toLowerCase().includes(like) || (r.cardNumber || '').toLowerCase().includes(like) || (r.editionCode || '').toLowerCase().includes(like)));
          return { results: rows };
        }
        // simple select by editionCode
        if (low.includes('from card') && low.includes('where editioncode =')) {
          const ed = this.bound && this.bound[0];
          const rows = self.tables.card.filter((r) => String(r.editionCode) === String(ed));
          return { results: rows };
        }
        // select by tcg
        if (low.includes('from card') && low.includes('where tcg =')) {
          const tcg = this.bound && this.bound[0];
          const rows = self.tables.card.filter((r) => String(r.tcg) === String(tcg));
          return { results: rows };
        }
        // fallback return all
        return { results: Array.from(self.tables.card) };
      },
      async run() {
        // no-op for DDL/index creation in tests
        return {};
      }
    };
  }
}

function makeHeaders(map) { return { get: (k) => map[k.toLowerCase()] || map[k] || null }; }
function makeRequest(url, method, headers = {}, body = null) { const req = { url, method, headers: makeHeaders(headers) }; req.json = async () => body; return req; }

test('cards endpoints (D1) search/name, search/code, by id, edition, tcg', async () => {
  const db = new D1Mock();
  // seed cards
  db.tables.card.push({ id: 'MAGIC:1', externalId: '1', tcg: 'MAGIC', editionCode: 'ABC', cardCode: '1', cardName: 'Black Lotus', cardNumber: '001' });
  db.tables.card.push({ id: 'POKEMON:25', externalId: '25', tcg: 'POKEMON', editionCode: 'XY', cardCode: '25', cardName: 'Pikachu', cardNumber: '025' });

  // search by name
  const req1 = makeRequest('https://test/api/cards/search?name=Black', 'GET', {}, null);
  const res1 = await searchHandler({ request: req1, env: { TCG_D1: db } });
  const body1 = JSON.parse(await res1.text());
  assert.ok(Array.isArray(body1));
  assert.equal(body1.length, 1);

  // search by code
  const req2 = makeRequest('https://test/api/cards/search?code=25', 'GET', {}, null);
  const res2 = await searchHandler({ request: req2, env: { TCG_D1: db } });
  const body2 = JSON.parse(await res2.text());
  assert.ok(Array.isArray(body2));
  assert.equal(body2.length, 1);

  // get by id
  const req3 = makeRequest('https://test/api/cards/MAGIC:1', 'GET', {}, null);
  const res3 = await byIdHandler({ request: req3, env: { TCG_D1: db }, params: { id: 'MAGIC:1' } });
  const body3 = JSON.parse(await res3.text());
  assert.equal(body3.id, 'MAGIC:1');

  // get by edition
  const req4 = makeRequest('https://test/api/cards/edition/ABC', 'GET', {}, null);
  const res4 = await editionHandler({ request: req4, env: { TCG_D1: db }, params: { editionId: 'ABC' } });
  const body4 = JSON.parse(await res4.text());
  assert.ok(Array.isArray(body4));
  assert.equal(body4.length, 1);

  // get by tcg
  const req5 = makeRequest('https://test/api/cards/tcg/POKEMON', 'GET', {}, null);
  const res5 = await tcgHandler({ request: req5, env: { TCG_D1: db }, params: { tcgId: 'POKEMON' } });
  const body5 = JSON.parse(await res5.text());
  assert.ok(Array.isArray(body5));
  assert.equal(body5.length, 1);
});
