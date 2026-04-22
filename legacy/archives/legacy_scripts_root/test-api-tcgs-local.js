// Simple local test harness for api/tcgs.js
const path = require('path');
const handler = require(path.join('..', 'api', 'tcgs.js'));

const req = { method: 'GET', url: '/api/tcgs', headers: {} };
let status = 200;
let body = '';

const res = {
  setHeader(k, v) {},
  writeHead(s, h) { status = s; },
  write(chunk) { body += chunk; },
  end(chunk) {
    if (chunk) body += chunk;
    try {
      const parsed = JSON.parse(body);
      console.log('STATUS', status);
      console.log(JSON.stringify(parsed, null, 2));
      process.exit(parsed && parsed.success ? 0 : 2);
    } catch (err) {
      console.error('Response not JSON:', body);
      process.exit(3);
    }
  },
  json(obj) {
    console.log('STATUS', status);
    console.log(JSON.stringify(obj, null, 2));
    process.exit(obj && obj.success ? 0 : 2);
  },
  status(s) { status = s; return this; }
};

(async () => {
  try {
    const maybe = handler(req, res);
    if (maybe && typeof maybe.then === 'function') await maybe;
  } catch (err) {
    console.error('Handler error:', err);
    process.exit(4);
  }
})();
