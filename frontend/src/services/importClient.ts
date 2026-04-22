import { buildApiUrl } from './api';

export type ColumnMapping = { [expectedField: string]: string };

function splitCsvHeader(line: string): string[] {
  const headers: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      headers.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.length > 0) headers.push(current.trim());
  return headers.map((h) => h.replace(/^\uFEFF/, '').trim());
}

async function readFileText(file: File): Promise<string> {
  return await file.text();
}

export async function transformFileHeaders(file: File, mapping: ColumnMapping): Promise<File> {
  const text = await readFileText(file);
  const firstNewline = text.indexOf('\n');
  if (firstNewline === -1) {
    throw new Error('CSV inválido: no se encontró una línea de encabezado');
  }

  const headerLine = text.slice(0, firstNewline).replace(/\r$/, '');
  const rest = text.slice(firstNewline + 1);
  const originalHeaders = splitCsvHeader(headerLine);

  // build reverse mapping: csvHeader -> expectedField
  const reverseMap: Record<string, string> = {};
  Object.keys(mapping).forEach((expected) => {
    const csvHeader = mapping[expected];
    if (csvHeader) reverseMap[csvHeader] = expected;
  });

  const newHeaders = originalHeaders.map((h) => (reverseMap[h] ? reverseMap[h] : h));
  const newHeaderLine = newHeaders.map((v) => {
    // quote if contains comma or quote
    if (v.includes(',') || v.includes('"')) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }).join(',');

  const newText = newHeaderLine + '\n' + rest;

  const newFile = new File([newText], file.name, { type: file.type });
  return newFile;
}

async function postMultipart(url: string, file: File, apiKey?: string) {
  const fd = new FormData();
  fd.append('file', file);
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  return res.json();
}

export async function validateWithMapping(file: File, mapping: ColumnMapping, apiKey?: string) {
  const transformed = await transformFileHeaders(file, mapping);
  return postMultipart(buildApiUrl('/inventory/import-csv/validate'), transformed, apiKey);
}

export async function importWithMapping(file: File, mapping: ColumnMapping, apiKey?: string) {
  const transformed = await transformFileHeaders(file, mapping);
  return postMultipart(buildApiUrl('/inventory/import-csv'), transformed, apiKey);
}

export async function precheckImport(file: File, mapping: ColumnMapping | undefined, apiKey?: string) {
  const transformed = mapping ? await transformFileHeaders(file, mapping) : file;
  const fd = new FormData();
  fd.append('file', transformed);
  if (mapping) fd.append('mapping', JSON.stringify(mapping));
  fd.append('precheck', 'true');
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(buildApiUrl('/inventory/import-csv'), { method: 'POST', headers, body: fd });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function importWithMappingAutoCheck(file: File, mapping: ColumnMapping | undefined, apiKey?: string) {
  // run precheck automatically and then upload (server also auto-chunks)
  const pre = await precheckImport(file, mapping, apiKey).catch(() => null);
  const transformed = mapping ? await transformFileHeaders(file, mapping) : file;
  const result = await postMultipart(buildApiUrl('/inventory/import-csv'), transformed, apiKey);
  return { precheck: pre, result };
}

async function postMultipartWithMapping(url: string, file: File, mapping: ColumnMapping | undefined, apiKey?: string) {
  const fd = new FormData();
  fd.append('file', file);
  if (mapping) fd.append('mapping', JSON.stringify(mapping));
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  return res.json();
}

export async function validateWithMappingServer(file: File, mapping: ColumnMapping | undefined, apiKey?: string) {
  return postMultipartWithMapping(buildApiUrl('/inventory/import-with-mapping'), file, mapping, apiKey + '' );
}

export async function importWithMappingServer(file: File, mapping: ColumnMapping | undefined, apiKey?: string) {
  return postMultipartWithMapping(buildApiUrl('/inventory/import-with-mapping'), file, mapping, apiKey + '' );
}

export default { transformFileHeaders, validateWithMapping, importWithMapping };
