/** Small in-memory limiter for the login route. Per-instance, which is fine for a single web service. */
const hits = new Map<string, { n: number; reset: number }>();

export function limited(key: string, max = 8, windowMs = 10 * 60_000): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  h.n++;
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  return h.n > max;
}

export function clearLimit(key: string) {
  hits.delete(key);
}
