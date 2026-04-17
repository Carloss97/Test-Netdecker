// Scheduled worker to trigger exchange-rate-refresh endpoint on Pages
// Expects env var PAGES_URL (e.g. https://tcg-erp.pages.dev)

async function trigger(env) {
  try {
    const pages = (env && env.PAGES_URL) || (typeof PAGES_URL !== 'undefined' && PAGES_URL) || process?.env?.PAGES_URL;
    if (!pages) {
      console.log('[cron-refresh] PAGES_URL not configured');
      return { success: false, error: 'PAGES_URL not configured' };
    }

    const url = pages.replace(/\/$/, '') + '/api/external/exchange-rate-refresh';
    const maxAttempts = Number((env && env.CRON_MAX_ATTEMPTS) || process?.env?.CRON_MAX_ATTEMPTS || 3);
    const backoffBase = Number((env && env.CRON_BACKOFF_MS) || process?.env?.CRON_BACKOFF_MS || 1000);
    const timeoutMs = Number((env && env.CRON_TIMEOUT_MS) || process?.env?.CRON_TIMEOUT_MS || 5000);

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
        const res = await fetchWithTimeout(url, { method: 'POST' }, timeoutMs);
        const text = await res.text().catch(() => null);
        const body = text ? (text.length > 400 ? text.slice(0, 400) + '...' : text) : 'no-body';
        console.log('[cron-refresh] called', url, 'attempt', attempt + 1, 'status', res.status, body);
        if (res.ok) return { success: true, status: res.status, body: body };
      } catch (err) {
        console.error('[cron-refresh] error', err && err.message ? err.message : String(err));
      }
      await delay(backoffBase * Math.pow(2, attempt));
    }
    console.warn('[cron-refresh] failed after retries');
    return { success: false, error: 'failed after retries' };
  } catch (err) {
    console.error('[cron-refresh] error', err && err.message ? err.message : String(err));
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
