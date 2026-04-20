// Local smoke test for the newly added API stubs.
const path = require('path');

const handlers = [
  { name: '/api/admin/price-volatility', file: path.join('..', 'api', 'admin', 'price-volatility.js'), req: { method: 'GET', url: '/api/admin/price-volatility?limit=2&window=7d' } },
  { name: '/api/listings/available', file: path.join('..', 'api', 'listings', 'available.js'), req: { method: 'GET', url: '/api/listings/available' } },
  { name: '/api/inventory/imports', file: path.join('..', 'api', 'inventory', 'imports.js'), req: { method: 'GET', url: '/api/inventory/imports?pageSize=10' } },
  { name: '/api/external/sets', file: path.join('..', 'api', 'external', 'sets.js'), req: { method: 'GET', url: '/api/external/sets?tcg=YUGIOH' } },
  { name: '/api/tcgs', file: path.join('..', 'api', 'tcgs.js'), req: { method: 'GET', url: '/api/tcgs' } },
  { name: '/api/external/import/set', file: path.join('..', 'api', 'external', 'import', 'set.js'), req: { method: 'POST', url: '/api/external/import/set', body: { tcg: 'YUGIOH', set: 'RA05' } } },
];

function makeRes(doneCb) {
  let status = 200;
  let body = '';
  return {
    setHeader() {},
    writeHead(s) { status = s; },
    write(chunk) { body += chunk; },
    end(chunk) {
      if (chunk) body += chunk;
      try {
        const parsed = JSON.parse(body);
        doneCb(null, { status, body: parsed });
      } catch (err) {
        doneCb(new Error('Response not JSON: ' + body));
      }
    },
    json(obj) {
      doneCb(null, { status, body: obj });
    },
    status(s) { status = s; return this; }
  };
}

(async () => {
  for (const h of handlers) {
    process.stdout.write(`Testing ${h.name} ... `);
    try {
      const handler = require(h.file);
      const req = h.req;
      const result = await new Promise((resolve, reject) => {
        const res = makeRes((err, out) => err ? reject(err) : resolve(out));
        try {
          const maybe = handler(req, res);
          if (maybe && typeof maybe.then === 'function') maybe.then(() => {}).catch(() => {});
        } catch (err) { reject(err); }
      });

      if (!result.body || result.body.success === false) {
        console.error('FAIL');
        console.error(JSON.stringify(result.body, null, 2));
        process.exit(2);
      }
      console.log('OK');
    } catch (err) {
      console.error('ERROR');
      console.error(err && err.stack ? err.stack : String(err));
      process.exit(3);
    }
  }
  console.log('All stubs responded OK');
  process.exit(0);
})();
