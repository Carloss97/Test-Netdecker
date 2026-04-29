import { useState, useEffect, useCallback } from 'react';

export function useAsync<T>(
  asyncFunction: () => Promise<T>,
  immediate: boolean = true,
  deps: any[] = []
) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async () => {
    setStatus('pending');
    // We don't clear data immediately to avoid flickering if not desired, 
    // but the user can check 'status === pending'
    setError(null);
    try {
      const response = await asyncFunction();
      setData(response);
      setStatus('success');
      return response;
    } catch (err) {
      setError(err as Error);
      setStatus('error');
    }
  }, [asyncFunction]);

  useEffect(() => {
    if (immediate) {
      void execute();
    }
  }, [execute, ...deps]);

  return { execute, status, data, error };
}
