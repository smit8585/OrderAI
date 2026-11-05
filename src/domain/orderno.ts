/** The number inside an order name ("#1042", "SR-2231", "1042") so orders can be sorted by order number. */
export function parseOrderSeq(name: string): bigint | null {
  const digits = name.replace(/\D/g, "").slice(0, 18);
  return digits ? BigInt(digits) : null;
}

/** How long to wait after the customer stops talking before the agent answers (ms). Addresses take longer to say. */
export function silenceWaitMs(phase: string): number {
  if (phase === "ASK_ADDRESS") return 3200;
  if (phase === "ASK_PINCODE") return 2600;
  return 1600;
}
