// Scheduled worker to trigger listings price sync on Pages
// Expects env var PAGES_URL (e.g. https://tcg-erp.pages.dev)

async function trigger(env) {
  try {
    const pages = (env && env.PAGES_URL) || (typeof PAGES_URL !== 'undefined' && PAGES_URL) || process?.env?.PAGES_URL;
    if (!pages) {
      console.log('[cron-price-sync] PAGES_URL not configured');
      return { success: false, error: 'PAGES_URL not configured' };
    }

    const url = pages.replace(/\/$/, '') + '/api/listings/sync-prices';
    const maxAttempts = Number((env && env.CRON_MAX_ATTEMPTS) || process?.env?.CRON_MAX_ATTEMPTS || 3);
    const backoffBase = Number((env && env.CRON_BACKOFF_MS) || process?.env?.CRON_BACKOFF_MS || 1000);
    const timeoutMs = Number((env && env.CRON_TIMEOUT_MS) || process?.env?.CRON_TIMEOUT_MS || 30_000);

    function delay(ms) { return new Promise((res) => setTimeout(res, ms)); }

    async function fetchWithTimeout(u, opts = {}, t = 5000) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), t);
      try {
        return await fetch(u, { ...opts, signal: controller.signal });
      } finally { clearTimeout(id); }
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const body = JSON.stringify({ source: 'cron' });
        const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, timeoutMs);
        const text = await res.text().catch(() => null);
        const bodyOut = text ? (text.length > 400 ? text.slice(0, 400) + '...' : text) : 'no-body';
        console.log('[cron-price-sync] called', url, 'attempt', attempt + 1, 'status', res.status, bodyOut);
        if (res.ok) return { success: true, status: res.status, body: bodyOut };
      } catch (err) {
        console.error('[cron-price-sync] error', err && err.message ? err.message : String(err));
      }
      // backoff before retrying
      await delay(backoffBase * Math.pow(2, attempt));
    }
    console.warn('[cron-price-sync] failed after retries');
    return { success: false, error: 'failed after retries' };
  } catch (err) {
    console.error('[cron-price-sync] fatal error', err && err.message ? err.message : String(err));
    return { success: false, error: String(err) };
  }
}

addEventListener('scheduled', (evt) => {
  evt.waitUntil(trigger(self));
});

addEventListener('fetch', (evt) => {
  // allow manual trigger via fetch for testing
  evt.respondWith((async () => {
    const result = await trigger(self);
    return new Response(JSON.stringify(result || { success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  })());
});
