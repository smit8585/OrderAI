import { log } from "@/lib/logger";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
  get retryable() {
    return this.status === 429 || this.status >= 500;
  }
}

type Opts = RequestInit & { timeoutMs?: number; retries?: number };

/** fetch with a timeout and bounded retries on 429 / 5xx / network errors. */
export async function http<T = unknown>(url: string, opts: Opts = {}): Promise<T> {
  const { timeoutMs = 20_000, retries = 2, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const text = await res.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        /* non-JSON body is fine */
      }
      if (!res.ok) {
        const err = new HttpError(`${init.method ?? "GET"} ${new URL(url).pathname} failed with ${res.status}`, res.status, body);
        if (err.retryable && attempt < retries) {
          lastErr = err;
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw err;
      }
      return body as T;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      lastErr = e;
      if (attempt < retries) {
        log.warn("http retry", { url: new URL(url).pathname, attempt: attempt + 1 });
        await sleep(500 * 2 ** attempt);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Request failed");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read the first present key from an object. Courier payloads are inconsistent. */
export function pick<T = unknown>(obj: Record<string, unknown> | null | undefined, ...keys: string[]): T | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}
