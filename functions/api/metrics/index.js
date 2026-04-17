import { getMetricsText } from '../../_shared/metrics.js';

export async function onRequest() {
  try {
    const text = getMetricsText();
    return new Response(text, { status: 200, headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
  } catch (err) {
    return new Response('error: unable to render metrics', { status: 500 });
  }
}
