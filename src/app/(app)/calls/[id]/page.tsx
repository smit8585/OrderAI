import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { OUTCOME_LABEL, dateTime } from "@/lib/format";
import { CallStatusTag, ModeTag } from "@/components/ui";

export default async function CallDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await db.call.findUnique({ where: { id }, include: { order: true } });
  if (!c) notFound();
  const x = (c.extracted ?? {}) as { address1?: string; pincode?: string; statedReason?: string };
  const lines = (c.transcript ?? "").split("\n").filter(Boolean).map((l) => {
    const m = l.match(/^(Agent|Customer):\s*(.*)$/);
    return m ? { who: m[1] === "Agent" ? "agent" : "customer", text: m[2] } : { who: "agent", text: l };
  });
  return (
    <>
      <p style={{ marginBottom: 16 }}><Link href={`/orders/${c.orderId}`} className="linklike">← {c.order.orderName}</Link></p>
      <div className="page-head">
        <div>
          <h1>Call with {c.order.customerName}</h1>
          <p className="sub" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <ModeTag mode={c.mode} /><CallStatusTag status={c.status} />
            {c.outcome && <span className="tag info">{OUTCOME_LABEL[c.outcome]}</span>}
            <span>{dateTime(c.startedAt)}</span>{c.durationSec ? <span>{c.durationSec}s</span> : null}
          </p>
        </div>
      </div>
      <section className="section" style={{ marginTop: 0 }}>
        <header><h2>Summary</h2></header>
        <div className="summary-box">{c.summary ?? "The call has not finished."}</div>
      </section>
      {(x.address1 || x.pincode) && (
        <section className="section">
          <header><h2>What the customer told us</h2></header>
          <dl className="kv">
            {x.address1 && (<><dt>New address</dt><dd>{x.address1}</dd></>)}
            {x.pincode && (<><dt>Pincode</dt><dd>{x.pincode}</dd></>)}
            {x.statedReason && (<><dt>Note</dt><dd>{x.statedReason}</dd></>)}
          </dl>
        </section>
      )}
      <section className="section">
        <header><h2>Conversation</h2></header>
        {lines.length === 0 ? <p className="sub">No transcript.</p> : (
          <div className="chat">
            {lines.map((l, i) => (
              <div key={i} className={`msg ${l.who}`}><span className="who">{l.who === "agent" ? "Agent" : "Customer"}</span>{l.text}</div>
            ))}
          </div>
        )}
        {c.recordingUrl && <p style={{ marginTop: 12 }}><a className="linklike" href={c.recordingUrl}>Listen to the recording</a></p>}
      </section>
    </>
  );
}
