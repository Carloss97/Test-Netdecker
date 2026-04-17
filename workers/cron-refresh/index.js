// Scheduled worker to trigger exchange-rate-refresh endpoint on Pages
// Expects env var PAGES_URL (e.g. https://tcg-erp.pages.dev)

async function trigger(env) {
  try {
    const pages = (env && env.PAGES_URL) || PAGES_URL || process?.env?.PAGES_URL;
    if (!pages) {
      console.log('[cron-refresh] PAGES_URL not configured');
      return;
    }
    const url = pages.replace(/\/$/, '') + '/api/external/exchange-rate-refresh';
    const res = await fetch(url, { method: 'POST' });
    const text = await res.text().catch(() => null);
    console.log('[cron-refresh] called', url, 'status', res.status, text ? (text.length > 400 ? text.slice(0,400) + '...' : text) : 'no-body');
  } catch (err) {
    console.error('[cron-refresh] error', err && err.message ? err.message : String(err));
  }
}

addEventListener('scheduled', (evt) => {
  evt.waitUntil(trigger(self));
});

addEventListener('fetch', (evt) => {
  // allow manual trigger via fetch for testing
  evt.respondWith((async () => {
    await trigger(self);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  })());
});
