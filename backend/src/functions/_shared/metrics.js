// Lightweight Prometheus-style metrics collector for Cloudflare Functions
// Stores counters and summaries on globalThis for worker-lifetime aggregation.
const METRICS_KEY = '__tcg_erp_metrics_v1__';

function ensureStore() {
  if (!globalThis[METRICS_KEY]) {
    globalThis[METRICS_KEY] = { counters: {}, summaries: {} };
  }
  return globalThis[METRICS_KEY];
}

function labelsToKey(labels) {
  if (!labels || Object.keys(labels).length === 0) return '';
  return Object.keys(labels).sort().map(k => `${k}=${String(labels[k]).replace(/"/g,'\\"')}`).join('|');
}

function keyToLabelObj(key) {
  if (!key) return {};
  const obj = {};
  for (const part of key.split('|')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    obj[k] = v;
  }
  return obj;
}

export function incr(name, labels = {}, value = 1) {
  const s = ensureStore();
  const key = labelsToKey(labels);
  if (!s.counters[name]) s.counters[name] = {};
  s.counters[name][key] = (s.counters[name][key] || 0) + value;
}

export function observe(name, seconds, labels = {}) {
  const s = ensureStore();
  const key = labelsToKey(labels);
  if (!s.summaries[name]) s.summaries[name] = {};
  const cur = s.summaries[name][key] || { count: 0, sum: 0 };
  cur.count += 1;
  cur.sum += Number(seconds) || 0;
  s.summaries[name][key] = cur;
}

export function startTimer(name, labels = {}) {
  const t0 = Date.now();
  return () => {
    const dt = (Date.now() - t0) / 1000;
    observe(name, dt, labels);
  };
}

export function getMetricsText() {
  const s = ensureStore();
  const lines = [];

  // Counters
  for (const [name, map] of Object.entries(s.counters)) {
    lines.push(`# TYPE ${name} counter`);
    for (const [key, val] of Object.entries(map)) {
      const labels = keyToLabelObj(key);
      const labelStr = Object.keys(labels).length ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}' : '';
      lines.push(`${name}${labelStr} ${Number(val)}`);
    }
  }

  // Summaries (export as _sum and _count)
  for (const [name, map] of Object.entries(s.summaries)) {
    lines.push(`# TYPE ${name} summary`);
    for (const [key, val] of Object.entries(map)) {
      const labels = keyToLabelObj(key);
      const labelStr = Object.keys(labels).length ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}' : '';
      lines.push(`${name}_sum${labelStr} ${Number(val.sum)}`);
      lines.push(`${name}_count${labelStr} ${Number(val.count)}`);
    }
  }

  return lines.join('\n') + '\n';
}

export function resetMetrics() {
  globalThis[METRICS_KEY] = { counters: {}, summaries: {} };
}

export default { incr, observe, startTimer, getMetricsText, resetMetrics };
