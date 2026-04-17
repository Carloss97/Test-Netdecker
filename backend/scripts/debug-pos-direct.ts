import 'dotenv/config';
import PosService from '../src/services/PosService.js';

async function run() {
  try {
    const s = await PosService.createSession({ userId: 'u1', items: [{ listingId: 'L1', qty: 2 }], subtotal: 100, tax: 19, total: 119 });
    console.log('createSession result:', s);
  } catch (err) {
    console.error('createSession error:', err);
    process.exit(1);
  }
}

run();
