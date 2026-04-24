type LogLevel = 'info' | 'warn' | 'error';

type ErrorDetails = {
  name?: string;
  message: string;
  status?: number;
};

type ClientLogEvent = {
  area: string;
  action: string;
  message: string;
  context?: Record<string, unknown>;
  error?: unknown;
};

function serializeError(error: unknown): ErrorDetails | undefined {
  if (!error) return undefined;

  if (typeof error === 'string') {
    return { message: error };
  }

  const err = error as {
    name?: string;
    message?: string;
    response?: { status?: number };
    status?: number;
  };

  return {
    name: err.name,
    message: err.message || 'Unknown error',
    status: err.response?.status ?? err.status,
  };
}

function log(level: LogLevel, event: ClientLogEvent): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    area: event.area,
    action: event.action,
    message: event.message,
    context: event.context,
    error: serializeError(event.error),
  };

  if (level === 'error') {
    console.error('[frontend-observability]', payload);
    return;
  }

  if (level === 'warn') {
    console.warn('[frontend-observability]', payload);
    return;
  }

  console.info('[frontend-observability]', payload);
}

export function logClientError(event: ClientLogEvent): void {
  log('error', event);
}

export function logClientWarn(event: ClientLogEvent): void {
  log('warn', event);
}

export function logClientInfo(event: ClientLogEvent): void {
  log('info', event);
}
