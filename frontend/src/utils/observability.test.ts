import { afterEach, describe, expect, it, vi } from 'vitest';
import { logClientError, logClientInfo, logClientWarn } from './observability';

describe('observability logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs error events with serialized Error payload', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logClientError({
      area: 'unit-test',
      action: 'error-path',
      message: 'should serialize error instance',
      context: { requestId: 'r1' },
      error: new Error('boom'),
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      '[frontend-observability]',
      expect.objectContaining({
        level: 'error',
        area: 'unit-test',
        action: 'error-path',
        message: 'should serialize error instance',
        context: { requestId: 'r1' },
        error: expect.objectContaining({ message: 'boom' }),
      }),
    );
  });

  it('logs warn and info events and supports string errors', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logClientWarn({
      area: 'unit-test',
      action: 'warn-path',
      message: 'warn event',
      error: 'warn-text',
    });

    logClientInfo({
      area: 'unit-test',
      action: 'info-path',
      message: 'info event',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[frontend-observability]',
      expect.objectContaining({
        level: 'warn',
        action: 'warn-path',
        error: { message: 'warn-text' },
      }),
    );

    expect(infoSpy).toHaveBeenCalledWith(
      '[frontend-observability]',
      expect.objectContaining({
        level: 'info',
        action: 'info-path',
        error: undefined,
      }),
    );
  });
});
