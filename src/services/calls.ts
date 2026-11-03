import type { CallOutcome, CallStatus, Prisma } from "@prisma/client";
import { db, getSettings } from "@/lib/db";
import { log, errMessage } from "@/lib/logger";
import { addressStatusFor } from "@/domain/address";
import { opening, step, summarise, initialState, type AgentCtx, type ScriptState, type Turn, type Lang } from "@/domain/agent";
import { updateAddress } from "@/integrations/shiprocket";
import { placePhoneCall } from "@/integrations/voice";
import { liveStatus } from "./connections";
import { addEvent } from "./events";

const CALLABLE = ["NEW", "NO_ANSWER", "NEEDS_REVIEW", "CONFIRMED", "ADDRESS_UPDATED", "CANCEL_REQUESTED"] as const;

function toE164(phone: string): string | null {
  const last10 = phone.replace(/\D/g, "").slice(-10);
  return /^[6-9]\d{9}$/.test(last10) ? `+91${last10}` : null;
}

const fullAddress = (o: { address1: string; address2: string | null; city: string; state: string; pincode: string }) => [o.address1, o.address2, o.city, o.state, o.pincode].filter(Boolean).join(", ");

async function claim(orderId: string) {
  const r = await db.order.updateMany({ where: { id: orderId, status: { in: [...CALLABLE] } }, data: { status: "CALLING" } });
  if (r.count === 0) throw new Error("This order is already on a call.");
  return db.order.findUniqueOrThrow({ where: { id: orderId } });
}

function ctxFor(o: Awaited<ReturnType<typeof claim>>, lang: Lang): AgentCtx {
  const items = (o.items as Array<{ name: string; quantity: number }>).map((i) => (i.quantity > 1 ? `${i.quantity} ${i.name}` : i.name)).join(" and ") || "your items";
  return {
    lang,
    firstName: o.customerName.split(" ")[0],
    orderName: o.orderName,
    items,
    amount: Number(o.amount),
    paymentMode: o.paymentMode,
    address: fullAddress(o),
    addressAmbiguous: o.addressStatus === "AMBIGUOUS",
    pincode: o.pincode,
  };
}

// ---------- browser voice call (demo, and the same script a phone call can follow) ----------

type Session = { state: ScriptState; turns: Turn[]; ctx: AgentCtx };
const key = (id: string) => `call:${id}`;

async function load(callId: string): Promise<Session | null> {
  const row = await db.keyValue.findUnique({ where: { key: key(callId) } });
  return (row?.value as unknown as Session) ?? null;
}
const save = (callId: string, s: Session) =>
  db.keyValue.upsert({ where: { key: key(callId) }, update: { value: s as unknown as Prisma.InputJsonValue }, create: { key: key(callId), value: s as unknown as Prisma.InputJsonValue } });

export async function startBrowserCall(orderId: string): Promise<{ callId: string; text: string; lang: Lang }> {
  const o = await claim(orderId);
  const settings = await getSettings();
  const lang: Lang = settings.language === "hi" ? "hi" : "en";
  const ctx = ctxFor(o, lang);
  const call = await db.call.create({ data: { orderId, provider: "web", mode: "WEB", status: "RINGING", language: lang } });
  const text = opening(ctx);
  await save(call.id, { state: initialState(), turns: [{ who: "agent", text }], ctx });
  await addEvent(orderId, "CALL_PLACED", "Voice call started in the browser.");
  return { callId: call.id, text, lang };
}

export async function browserCallTurn(callId: string, text: string): Promise<{ reply: string; done: boolean }> {
  const s = await load(callId);
  if (!s) throw new Error("This call is not active.");
  const r = step(s.state, text, s.ctx);
  s.turns.push({ who: "customer", text }, { who: "agent", text: r.reply });
  s.state = r.state;
  await save(callId, s);
  if (r.done) await endBrowserCall(callId);
  return { reply: r.reply, done: !!r.done };
}

export async function endBrowserCall(callId: string): Promise<{ outcome: CallOutcome; summary: string }> {
  const s = await load(callId);
  const call = await db.call.findUnique({ where: { id: callId } });
  if (!s || !call) throw new Error("This call is not active.");
  const r = summarise(s.state, s.turns);
  const spoke = s.turns.some((t) => t.who === "customer");
  await ingestCallResult({
    callId,
    status: spoke ? "COMPLETED" : "NO_ANSWER",
    outcome: r.outcome,
    summary: r.summary,
    extracted: r.extracted,
    durationSec: Math.max(1, Math.round((Date.now() - call.startedAt.getTime()) / 1000)),
    transcript: s.turns.map((t) => `${t.who === "agent" ? "Agent" : "Customer"}: ${t.text}`).join("\n"),
  });
  return { outcome: r.outcome, summary: r.summary };
}

// ---------- phone call through the sponsor's voice agent ----------

export async function startPhoneCall(orderId: string): Promise<void> {
  const live = await liveStatus();
  if (!live.voice) throw new Error("The voice agent is not connected. Add it on the Connections page, or use the browser call.");
  const o = await claim(orderId);
  const settings = await getSettings();
  const lang: Lang = settings.language === "hi" ? "hi" : "en";
  const to = toE164(o.phone);
  const call = await db.call.create({ data: { orderId, provider: "voice", mode: "PHONE", status: "INITIATED", toNumber: to, language: lang } });
  try {
    if (!to) throw new Error("The phone number on the order is not a valid Indian mobile number.");
    const ctx = ctxFor(o, lang);
    const { providerCallId } = await placePhoneCall({
      callId: call.id,
      to,
      language: lang,
      variables: { customer_name: ctx.firstName, order_name: ctx.orderName, items: ctx.items, amount: ctx.amount, payment_mode: ctx.paymentMode, address: ctx.address, address_ambiguous: ctx.addressAmbiguous, pincode: ctx.pincode },
    });
    await db.call.update({ where: { id: call.id }, data: { providerCallId } });
    await addEvent(orderId, "CALL_PLACED", `Phone call placed to ${to.slice(0, 5)}•••${to.slice(-4)}.`);
  } catch (e) {
    await db.call.update({ where: { id: call.id }, data: { status: "FAILED", endedAt: new Date(), summary: errMessage(e) } });
    await db.order.update({ where: { id: orderId }, data: { status: o.status === "CALLING" ? "NEEDS_REVIEW" : o.status } });
    await addEvent(orderId, "CALL_RESULT", `Could not place the call: ${errMessage(e)}`);
    throw e;
  }
}

// ---------- handling a finished call ----------

export type CallResultInput = {
  callId: string;
  status: CallStatus;
  outcome?: CallOutcome;
  summary?: string;
  transcript?: string;
  recordingUrl?: string;
  durationSec?: number;
  extracted?: { address1?: string; pincode?: string; statedReason?: string };
};

/** Store the call and apply what the customer said to the order. Safe to call twice for the same call. */
export async function ingestCallResult(r: CallResultInput): Promise<{ handled: boolean }> {
  const call = await db.call.findUnique({ where: { id: r.callId }, include: { order: true } });
  if (!call) return { handled: false };
  if (["COMPLETED", "NO_ANSWER", "BUSY", "FAILED"].includes(call.status)) return { handled: false };

  let outcome = r.outcome ?? (r.status === "COMPLETED" ? "UNCLEAR" : "NOT_ANSWERED");
  if (r.status !== "COMPLETED" && outcome !== "NOT_ANSWERED" && outcome !== "VOICEMAIL") outcome = "NOT_ANSWERED";
  const settings = await getSettings();
  let applyNow = false;

  await db.$transaction(async (tx) => {
    const claimed = await tx.call.updateMany({
      where: { id: call.id, status: { in: ["INITIATED", "RINGING"] } },
      data: { status: r.status, outcome, endedAt: new Date(), durationSec: r.durationSec, transcript: r.transcript, summary: r.summary, recordingUrl: r.recordingUrl, extracted: (r.extracted ?? {}) as Prisma.InputJsonValue },
    });
    if (claimed.count === 0) return;
    const o = call.order;
    await tx.orderEvent.create({ data: { orderId: o.id, type: "CALL_RESULT", message: r.summary ?? `Call ended: ${outcome}.` } });

    if (outcome === "CONFIRMED") {
      await tx.order.update({ where: { id: o.id }, data: { status: "CONFIRMED", addressStatus: "VALID", addressSource: "customer", addressReasons: [] } });
    } else if (outcome === "ADDRESS_CORRECTED" && r.extracted?.address1 && r.extracted.pincode) {
      const next = { address1: r.extracted.address1, address2: null, city: o.city, state: o.state, pincode: r.extracted.pincode };
      // The customer's own words are the best source we have, so the address is marked valid.
      await tx.order.update({
        where: { id: o.id },
        data: { ...next, status: "ADDRESS_UPDATED", addressStatus: "VALID", addressSource: "customer", addressReasons: [], syncState: "PENDING", syncError: null, originalAddress: { address1: o.address1, address2: o.address2, city: o.city, state: o.state, pincode: o.pincode } },
      });
      await tx.orderEvent.create({ data: { orderId: o.id, type: "ADDRESS_UPDATED", message: `Address changed to: ${next.address1}, ${o.city}, ${o.state} ${next.pincode}.` } });
      applyNow = settings.autoUpdate && !o.isSample;
    } else if (outcome === "CANCEL_ORDER") {
      await tx.order.update({ where: { id: o.id }, data: { status: "CANCEL_REQUESTED" } });
    } else if (outcome === "NOT_ANSWERED" || outcome === "VOICEMAIL") {
      await tx.order.update({ where: { id: o.id }, data: { status: "NO_ANSWER" } });
    } else {
      await tx.order.update({ where: { id: o.id }, data: { status: "NEEDS_REVIEW" } });
    }
  });

  if (applyNow) await pushAddressToShiprocket(call.orderId).catch((e) => log.error("auto address update failed", { error: errMessage(e) }));
  return { handled: true };
}

/** Write the corrected address to Shiprocket. Records the result on the order either way. */
export async function pushAddressToShiprocket(orderId: string): Promise<string> {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (o.isSample) {
    await db.order.update({ where: { id: o.id }, data: { syncState: "APPLIED", syncError: null } });
    await addEvent(o.id, "SHIPROCKET", "Sample order: marked as updated in Shiprocket (nothing was sent).");
    return "Sample order: nothing was sent to Shiprocket.";
  }
  const live = await liveStatus();
  if (!live.shiprocket) throw new Error("Connect Shiprocket first.");
  try {
    const msg = await updateAddress({ orderId: o.externalId, customerName: o.customerName, phone: o.phone, address1: o.address1, address2: o.address2 ?? undefined, city: o.city, state: o.state, pincode: o.pincode });
    await db.order.update({ where: { id: o.id }, data: { syncState: "APPLIED", syncError: null } });
    await addEvent(o.id, "SHIPROCKET", `Address updated in Shiprocket. ${msg}`);
    return msg;
  } catch (e) {
    const message = e instanceof Error && "body" in e ? `${e.message}: ${JSON.stringify((e as { body: unknown }).body).slice(0, 300)}` : errMessage(e);
    await db.order.update({ where: { id: o.id }, data: { syncState: "FAILED", syncError: message } });
    await addEvent(o.id, "SHIPROCKET", `Shiprocket did not accept the address: ${message}`);
    throw new Error(message);
  }
}

/** Re-run the address check on an order (used after edits). */
export async function recheckAddress(orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const c = addressStatusFor(o, o.raw as Record<string, unknown> | null);
  await db.order.update({ where: { id: orderId }, data: { addressStatus: c.status, addressReasons: c.reasons, addressSource: c.source } });
}
