import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const searchModule = await import('../src/functions/api/cards/search.js');
const searchHandler = searchModule.onRequest || searchModule.default?.onRequest || searchModule.default || searchModule;

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
        if (low.includes('from card') && low.includes('where id =')) {
          const id = this.bound && this.bound[0];
          const found = self.tables.card.find((r) => String(r.id) === String(id));
          return { results: found ? [found] : [] };
        }
        if (low.includes('from card') && low.includes('like')) {
          const pattern = (this.bound && this.bound[0]) || '';
          const like = String(pattern).replace(/%/g, '').toLowerCase();
          const rows = self.tables.card.filter((r) => ((r.cardName || '').toLowerCase().includes(like) || (r.cardCode || '').toLowerCase().includes(like) || (r.cardNumber || '').toLowerCase().includes(like) || (r.editionCode || '').toLowerCase().includes(like)));
          return { results: rows };
        }
        return { results: Array.from(self.tables.card) };
      }
    };
  }
}

const db = new D1Mock();
// seed
db.tables.card.push({ id: 'MAGIC:1', externalId: '1', tcg: 'MAGIC', editionCode: 'ABC', cardCode: '1', cardName: 'Black Lotus', cardNumber: '001' });

await (async () => {
  const req = { url: 'https://test/api/cards/search?name=Black', method: 'GET', headers: { get: (k)=>null } };
  const res = await searchHandler({ request: req, env: { TCG_D1: db } });
  const text = await res.text();
  console.log('RESPONSE TEXT:', text);
})();
