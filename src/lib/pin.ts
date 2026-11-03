import { timingSafeEqual } from "node:crypto";

export const DEFAULT_PIN = "1234";

/** The dashboard PIN. Set APP_PIN in the environment to change it. */
export function configuredPin(): string {
  return process.env.APP_PIN?.trim() || DEFAULT_PIN;
}

export function isDefaultPin(): boolean {
  return configuredPin() === DEFAULT_PIN;
}

export function checkPin(presented: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(configuredPin());
  return a.length === b.length && timingSafeEqual(a, b);
}
