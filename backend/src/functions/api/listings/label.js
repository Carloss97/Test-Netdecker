export async function onRequest(context) {
  try {
    const { request } = context;
    const url = request.url || '/api/listings/label';
    const html = `<html><body><h3>Labels (stub)</h3><p>Requested: ${url}</p></body></html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
  } catch (err) {
    return new Response('Label stub error', { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}
