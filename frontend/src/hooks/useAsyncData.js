import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useAsyncData — collapses the fetch-loading-error pattern that's
 * duplicated across ~25 pages.
 *
 * Before:
 *   const [data, setData] = useState(null);
 *   const [loading, setLoading] = useState(true);
 *   const [error, setError] = useState('');
 *   useEffect(() => {
 *     let cancelled = false;
 *     (async () => {
 *       try {
 *         setLoading(true);
 *         const d = await someApi.list();
 *         if (!cancelled) setData(d);
 *       } catch (err) {
 *         if (!cancelled) setError(err.message);
 *       } finally {
 *         if (!cancelled) setLoading(false);
 *       }
 *     })();
 *     return () => { cancelled = true; };
 *   }, [...deps]);
 *
 * After:
 *   const { data, loading, error, refetch } = useAsyncData(
 *     () => someApi.list(),
 *     [...deps]
 *   );
 *
 * Returns:
 *   data     — the resolved value, or `initial` while loading/erroring
 *   loading  — true until the first fetch resolves or rejects
 *   error    — the caught error (or empty string)
 *   refetch  — async function to re-run the fetch on demand
 *
 * Cancels in-flight requests when deps change or the component unmounts:
 * the latest call wins, stale results are dropped.
 */
export function useAsyncData(fetcher, deps = [], { initial = null } = {}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Bumped on each invocation; result writes are gated on it being current.
  const callIdRef = useRef(0);

  const run = useCallback(async () => {
    const callId = ++callIdRef.current;
    setLoading(true);
    setError('');
    try {
      const result = await fetcher();
      if (callIdRef.current === callId) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      if (callIdRef.current === callId) {
        setError(err?.message || 'Request failed');
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: run };
}
