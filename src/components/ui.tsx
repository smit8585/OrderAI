import type { AddressStatus, CallStatus, OrderStatus } from "@prisma/client";
import { ADDRESS_LABEL, ADDRESS_TONE, STATUS_LABEL, STATUS_TONE } from "@/lib/format";

export function StatusDot({ status }: { status: OrderStatus }) {
  return <span className={`status ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function AddressTag({ status }: { status: AddressStatus }) {
  return <span className={`tag ${ADDRESS_TONE[status]}`}>{ADDRESS_LABEL[status]}</span>;
}

export function CallStatusTag({ status }: { status: CallStatus }) {
  const tone = status === "COMPLETED" ? "good" : status === "FAILED" ? "bad" : status === "NO_ANSWER" || status === "BUSY" ? "attn" : "info";
  const label = { INITIATED: "Dialing", RINGING: "Live", COMPLETED: "Answered", NO_ANSWER: "No answer", BUSY: "Busy", FAILED: "Failed" }[status];
  return <span className={`tag ${tone}`}>{label}</span>;
}

export function ModeTag({ mode }: { mode: string }) {
  return <span className="tag">{mode === "PHONE" ? "Phone call" : "Voice call (browser)"}</span>;
}
