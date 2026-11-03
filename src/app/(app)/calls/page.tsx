import Link from "next/link";
import { db } from "@/lib/db";
import { OUTCOME_LABEL, dateTime } from "@/lib/format";
import { CallStatusTag, ModeTag } from "@/components/ui";

export const metadata = { title: "Calls" };

export default async function CallsPage() {
  const calls = await db.call.findMany({ orderBy: { startedAt: "desc" }, take: 100, include: { order: true } });
  return (
    <>
      <div className="page-head"><div><h1>Calls</h1><p className="sub">Every call, with what the customer said.</p></div></div>
      {calls.length === 0 ? <p className="sub">No calls yet.</p> : (
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>When</th><th>Order</th><th>How</th><th>Result</th><th>Summary</th></tr></thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id}>
                  <td>{dateTime(c.startedAt)}<span className="sec">{c.durationSec ? `${c.durationSec}s` : ""}</span></td>
                  <td><Link className="row-link" href={`/calls/${c.id}`}>{c.order.orderName}</Link><span className="sec">{c.order.customerName}</span></td>
                  <td><ModeTag mode={c.mode} /></td>
                  <td><CallStatusTag status={c.status} />{c.outcome && <span className="sec">{OUTCOME_LABEL[c.outcome]}</span>}</td>
                  <td style={{ maxWidth: 380 }}>{c.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
