import { timingSafeEqual } from "node:crypto";

/** Constant-time compare of a presented secret against the configured one. */
export function secretMatches(presented: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
