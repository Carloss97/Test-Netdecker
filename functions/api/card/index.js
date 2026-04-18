// Proxy shim: translate /api/card/* -> /api/cards/* so legacy callers work.
export async function onRequest(context) {
  const { request } = context;
  try {
    const url = new URL(request.url);
    const targetPath = url.pathname.replace(/^\/api\/card(\/|$)/, '/api/cards$1') + url.search;
    const targetUrl = url.origin + targetPath;

    const headers = new Headers(request.headers);
    headers.delete('host');

    const init = {
      method: request.method,
      headers,
      body: /^(GET|HEAD)$/.test(request.method) ? undefined : await request.text(),
    };

    const res = await fetch(targetUrl, init);
    const respHeaders = new Headers(res.headers);
    const body = await res.arrayBuffer();
    return new Response(body, { status: res.status, headers: respHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export default onRequest;
