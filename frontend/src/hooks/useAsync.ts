import { useState, useEffect, useCallback, useRef } from 'react';

export function useAsync<T>(
  asyncFunction: () => Promise<T>,
  immediate: boolean = true,
  deps: any[] = []
) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const asyncFunctionRef = useRef(asyncFunction);
  const runIdRef = useRef(0);

  useEffect(() => {
    asyncFunctionRef.current = asyncFunction;
  });

  const execute = useCallback(async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    setStatus('pending');
    // We don't clear data immediately to avoid flickering if not desired, 
    // but the user can check 'status === pending'
    setError(null);
    try {
      const response = await asyncFunctionRef.current();
      if (runIdRef.current === runId) {
        setData(response);
        setStatus('success');
      }
      return response;
    } catch (err) {
      if (runIdRef.current === runId) {
        setError(err as Error);
        setStatus('error');
      }
    }
  }, deps);

  useEffect(() => {
    if (immediate) {
      void execute();
    }
  }, [immediate, execute]);

  return { execute, status, data, error };
}
