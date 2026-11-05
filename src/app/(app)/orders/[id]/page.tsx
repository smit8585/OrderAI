import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { OUTCOME_LABEL, dateOnly, dateTime, inr } from "@/lib/format";
import { AddressTag, CallStatusTag, ModeTag, StatusDot } from "@/components/ui";
import { CallPanel, PushAddressButton } from "@/components/client";
import { liveStatus } from "@/services/connections";

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const autoOpen = (await searchParams).call === "1";
  const o = await db.order.findUnique({ where: { id }, include: { calls: { orderBy: { startedAt: "asc" } }, events: { orderBy: { createdAt: "asc" } } } });
  if (!o) notFound();
  const live = await liveStatus();
  const items = o.items as Array<{ name: string; quantity: number; price?: number }>;
  const reasons = o.addressReasons as string[];
  const orig = o.originalAddress as { address1: string; address2: string | null; city: string; state: string; pincode: string } | null;
  const busy = o.status === "CALLING";
  const called = o.calls.length > 0;

  return (
    <>
      <p style={{ marginBottom: 16 }}><Link href="/" className="linklike">← Orders</Link></p>
      <div className="page-head">
        <div>
          <h1>{o.orderName} <span className="muted" style={{ fontWeight: 500 }}>· {o.customerName}</span></h1>
          <p className="sub" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <StatusDot status={o.status} />
            <span>{o.channelStatus} in Shiprocket</span>
            <span>{dateTime(o.orderedAt)}</span>
            {o.isSample && <span className="tag">Sample order</span>}
          </p>
        </div>
      </div>

      <div className="detail">
        <div>
          <section className="section" style={{ marginTop: 0 }} aria-labelledby="addr">
            <header><h2 id="addr">Delivery address</h2><AddressTag status={o.addressStatus} /></header>
            <p>{[o.address1, o.address2, o.city, o.state, o.pincode].filter(Boolean).join(", ")}</p>
            {reasons.length > 0 && (
              <ul style={{ margin: "10px 0 0 18px" }}>
                {reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
            <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              {o.addressSource === "shiprocket" ? "Flag from Shiprocket." : o.addressSource === "customer" ? "Confirmed by the customer on a call." : "Checked by OrderAI (Shiprocket gave no flag)."}
            </p>
            {orig && (
              <p className="sub" style={{ marginTop: 10 }}>Before the call: {[orig.address1, orig.address2, orig.city, orig.state, orig.pincode].filter(Boolean).join(", ")}</p>
            )}
            {o.status === "ADDRESS_UPDATED" && (
              <div style={{ marginTop: 14 }}>
                <PushAddressButton orderId={o.id} state={o.syncState} error={o.syncError} />
                {!live.shiprocket && !o.isSample && o.syncState !== "APPLIED" && <p className="muted" style={{ marginTop: 6 }}>Connect Shiprocket on the Connections page to send this.</p>}
              </div>
            )}
          </section>

          <section className="section" aria-labelledby="order">
            <header><h2 id="order">Order</h2></header>
            <dl className="kv">
              <dt>Customer</dt><dd>{o.customerName}</dd>
              <dt>Phone</dt><dd><a href={`tel:+91${o.phone.replace(/\D/g, "").slice(-10)}`}>{o.phone.replace(/\D/g, "").slice(-10) || o.phone}</a></dd>
              {o.email && (<><dt>Email</dt><dd>{o.email}</dd></>)}
              <dt>Items</dt><dd>{items.map((i) => `${i.name} × ${i.quantity}`).join(", ") || "–"}</dd>
              <dt>Payment</dt><dd>{o.paymentMode === "COD" ? "Cash on delivery" : "Prepaid"} · {inr(o.amount.toString())}</dd>
              <dt>Ordered</dt><dd>{dateOnly(o.orderedAt)}</dd>
            </dl>
          </section>

          {o.calls.length > 0 && (
            <section className="section" aria-labelledby="calls">
              <header><h2 id="calls">Calls</h2></header>
              {o.calls.map((c, i) => (
                <div key={c.id} style={{ marginBottom: 22 }}>
                  <p style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>Call {i + 1}</strong>
                    <ModeTag mode={c.mode} />
                    <CallStatusTag status={c.status} />
                    <span className="muted">{dateTime(c.startedAt)}{c.durationSec ? ` · ${c.durationSec}s` : ""}</span>
                    {c.outcome && <span className="tag info">{OUTCOME_LABEL[c.outcome]}</span>}
                  </p>
                  {c.summary && <p className="sub">{c.summary}</p>}
                  <p style={{ marginTop: 6 }}><Link href={`/calls/${c.id}`} className="linklike">View call details</Link></p>
                </div>
              ))}
            </section>
          )}

          <section className="section" aria-labelledby="story">
            <header><h2 id="story">What happened</h2></header>
            {o.events.length === 0 ? <p className="sub">Nothing yet. Start a call to confirm this order.</p> : (
              <ol className="timeline">
                {o.events.map((e) => (
                  <li key={e.id} className={e.type.startsWith("CALL") ? "call" : e.type === "SHIPROCKET" || e.type === "ADDRESS_UPDATED" ? "good" : ""}>
                    <time dateTime={e.createdAt.toISOString()}>{dateTime(e.createdAt)}</time>
                    {e.message}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside style={{ display: "grid", gap: 20 }}>
          {!busy ? (
            <CallPanel orderId={o.id} phoneReady={live.voice} label={called ? "Call again" : "Start call"} autoOpen={autoOpen} />
          ) : (
            <div className="panel"><h3>On a call</h3><p className="sub">A call is in progress for this order. This page updates when it ends.</p></div>
          )}
          {o.addressStatus === "AMBIGUOUS" && o.status === "NEW" && (
            <p className="sub">The address looks unclear, so the call will ask the customer for the full address.</p>
          )}
        </aside>
      </div>
    </>
  );
}
