import type { AddressStatus } from "@prisma/client";

export type AddressParts = { address1: string; address2?: string | null; city: string; state: string; pincode: string };
export type AddressCheck = { status: AddressStatus; reasons: string[]; source: "shiprocket" | "check" };

const HOUSE_NO = /(\d+\s*[a-z]?\s*[-/,]|\b(flat|house|h\.?\s?no|plot|door|room|shop|unit|block|bldg|building|tower|villa|floor|no\.?)\b|\b\d{1,4}[a-z]?\b)/i;
const LANDMARK = /\b(near|opp|opposite|behind|beside|next to|landmark|chowk|mandir|temple|school|hospital|market|mall|metro|station|bus stop|petrol)\b/i;

/**
 * Our own address check, used when the shipping platform gives no flag.
 * It only catches clear problems, so "valid" means "nothing obviously missing", not "verified on a map".
 */
export function assessAddress(a: AddressParts): AddressCheck {
  const reasons: string[] = [];
  const line = `${a.address1} ${a.address2 ?? ""}`.trim();
  if (!/^[1-9]\d{5}$/.test(a.pincode.trim())) reasons.push("The pincode is not a valid 6-digit pincode.");
  if (line.length < 15) reasons.push("The address is very short.");
  if (!HOUSE_NO.test(line)) reasons.push("There is no house, flat or plot number.");
  if (!LANDMARK.test(line) && line.length < 40) reasons.push("There is no landmark and the address is brief.");
  if (!a.city.trim()) reasons.push("The city is missing.");
  if (!a.state.trim()) reasons.push("The state is missing.");
  if (/\b(test|asdf|xxx|na|n\/a|none)\b/i.test(line)) reasons.push("The address looks like placeholder text.");
  return { status: reasons.length ? "AMBIGUOUS" : "VALID", reasons, source: "check" };
}

const FLAG_KEYS = ["address_validity", "address_status", "address_verified", "is_address_valid", "address_valid", "address_quality", "address_score", "ambiguous_address", "is_address_ambiguous", "address_flag"];

/**
 * Read the shipping platform's own address flag from an order payload, if there is one.
 * The field name is not documented publicly, so this accepts several spellings and values.
 * Returns null when nothing recognisable is present.
 */
export function readPlatformFlag(raw: Record<string, unknown> | null | undefined): { status: AddressStatus; reasons: string[] } | null {
  if (!raw) return null;
  for (const k of FLAG_KEYS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (v === null || v === undefined || v === "") continue;
    const s = String(v).toLowerCase().trim();
    const negativeKey = k.includes("ambiguous");
    const truthy = ["true", "1", "yes", "y"].includes(s);
    const falsy = ["false", "0", "no", "n"].includes(s);
    if (negativeKey) {
      if (truthy) return { status: "AMBIGUOUS", reasons: ["Shiprocket flagged this address as ambiguous."] };
      if (falsy) return { status: "VALID", reasons: [] };
    }
    if (/ambig|invalid|incomplete|unverified|not[_ ]?valid|poor|low|fail/.test(s) || (!negativeKey && falsy)) return { status: "AMBIGUOUS", reasons: [`Shiprocket flagged this address (${k}: ${String(v)}).`] };
    if (/^valid|verified|good|high|ok|pass/.test(s) || (!negativeKey && truthy)) return { status: "VALID", reasons: [] };
  }
  return null;
}

/** The platform's flag wins when present; otherwise our own check. */
export function addressStatusFor(a: AddressParts, raw?: Record<string, unknown> | null): AddressCheck {
  const flag = readPlatformFlag(raw);
  if (flag) return { ...flag, source: "shiprocket" };
  return assessAddress(a);
}
