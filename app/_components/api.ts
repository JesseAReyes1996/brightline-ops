import { useCallback, useEffect, useState } from "react";

/** GETs `url`, or POSTs `body` as JSON when given. Throws the server's `error` message on failure. */
export async function api<T>(url: string, options: { body?: unknown } = {}): Promise<T> {
  const init: RequestInit =
    options.body === undefined
      ? { cache: "no-store" }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) };
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Loads `url` and re-loads it when `url` changes or `reload()` is called.
 * Keeps showing the previous data while a reload is in flight.
 */
export function useApi<T>(url: string) {
  const [reloads, setReloads] = useState(0);
  const key = `${url}#${reloads}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null);

  useEffect(() => {
    let current = true;
    api<T>(url).then(
      (data) => {
        if (current) setResult({ key, data });
      },
      (err) => {
        if (current) setResult({ key, error: errorMessage(err) });
      },
    );
    return () => {
      current = false;
    };
  }, [url, key]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);
  return {
    data: result?.data,
    error: result?.key === key ? result.error : undefined,
    loading: result?.key !== key,
    reload,
  };
}
