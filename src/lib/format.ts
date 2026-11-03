import type { AddressStatus, CallOutcome, OrderStatus } from "@prisma/client";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "Not called yet",
  CALLING: "On a call",
  CONFIRMED: "Confirmed",
  ADDRESS_UPDATED: "Address updated",
  CANCEL_REQUESTED: "Wants to cancel",
  NO_ANSWER: "No answer",
  NEEDS_REVIEW: "Needs review",
};

export const STATUS_TONE: Record<OrderStatus, string> = {
  NEW: "",
  CALLING: "live",
  CONFIRMED: "good",
  ADDRESS_UPDATED: "good",
  CANCEL_REQUESTED: "bad",
  NO_ANSWER: "attn",
  NEEDS_REVIEW: "attn",
};

export const ADDRESS_LABEL: Record<AddressStatus, string> = { VALID: "Valid", AMBIGUOUS: "Ambiguous", UNKNOWN: "Not checked" };
export const ADDRESS_TONE: Record<AddressStatus, string> = { VALID: "good", AMBIGUOUS: "attn", UNKNOWN: "" };

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  CONFIRMED: "Order and address confirmed",
  ADDRESS_CORRECTED: "Gave a new address",
  CANCEL_ORDER: "Wants to cancel",
  NOT_ANSWERED: "No answer",
  VOICEMAIL: "Voicemail",
  UNCLEAR: "Unclear",
};

export function inr(n: number | string | { toString(): string }): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n.toString()));
}

export function maskPhone(p: string): string {
  const d = p.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 2)}••••••${d.slice(-2)}` : p;
}

// Always format in India time, so the server and the browser render the same text.
const TZ = "Asia/Kolkata";
export const dateTime = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ }).format(d);
export const dateOnly = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(d);
