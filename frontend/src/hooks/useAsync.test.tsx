import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsync } from './useAsync';

describe('useAsync', () => {
  it('runs immediately by default and stores success result', async () => {
    const asyncFn = vi.fn().mockResolvedValueOnce({ id: 'ok-1' });

    const { result } = renderHook(() => useAsync(asyncFn));

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    expect(asyncFn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ id: 'ok-1' });
    expect(result.current.error).toBeNull();
  });

  it('does not run immediately when disabled and transitions to error on execute failure', async () => {
    const asyncFn = vi.fn().mockRejectedValueOnce(new Error('network failed'));

    const { result } = renderHook(() => useAsync(asyncFn, false));

    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();

    await act(async () => {
      const out = await result.current.execute();
      expect(out).toBeUndefined();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(asyncFn).toHaveBeenCalledTimes(1);
    expect(result.current.error?.message).toBe('network failed');
    expect(result.current.data).toBeNull();
  });

  it('does not refetch just because an inline async function gets a new identity on render', async () => {
    const asyncFn = vi.fn().mockResolvedValue({ id: 'ok-1' });

    const { rerender, result } = renderHook(
      ({ marker }) => useAsync(() => asyncFn(marker)),
      { initialProps: { marker: 'first' } },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    expect(asyncFn).toHaveBeenCalledTimes(1);
    expect(asyncFn).toHaveBeenCalledWith('first');

    rerender({ marker: 'second' });

    await new Promise((resolve) => window.setTimeout(resolve, 25));

    expect(result.current.status).toBe('success');
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });
});
