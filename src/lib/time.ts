const IST_OFFSET_MIN = 330;

/** Hour of day (0-23) in India Standard Time. */
export function istHour(d: Date = new Date()): number {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60_000).getUTCHours();
}

export function withinCallWindow(startHour: number, endHour: number, d: Date = new Date()): boolean {
  const h = istHour(d);
  return h >= startHour && h < endHour;
}

/** Next moment (UTC Date) that falls at the start of the call window in IST. */
export function nextWindowOpen(startHour: number, endHour: number, from: Date = new Date()): Date {
  if (withinCallWindow(startHour, endHour, from)) return from;
  const ist = new Date(from.getTime() + IST_OFFSET_MIN * 60_000);
  const next = new Date(ist);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(startHour);
  if (ist.getUTCHours() >= endHour) next.setUTCDate(next.getUTCDate() + 1);
  return new Date(next.getTime() - IST_OFFSET_MIN * 60_000);
}

export function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60_000);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** yyyy-mm-dd in IST */
export function istDateString(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}
