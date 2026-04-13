import PosService from '../src/services/PosService.js';

(async () => {
  try {
    const s = await PosService.createSession({ userId: 'script-user' });
    console.log('created session:', s);
    process.exit(0);
  } catch (err) {
    console.error('error creating session:', err);
    process.exit(1);
  }
})();
