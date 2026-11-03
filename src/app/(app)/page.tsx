import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ADDRESS_LABEL, dateTime, inr, maskPhone } from "@/lib/format";
import { AddressTag, StatusDot } from "@/components/ui";
import { OrdersToolbar } from "@/components/client";
import { liveStatus } from "@/services/connections";

export const metadata = { title: "Orders" };

const TABS: Array<{ key: string; label: string; where?: Prisma.OrderWhereInput }> = [
  { key: "all", label: "All orders" },
  { key: "check", label: "Address needs checking", where: { addressStatus: "AMBIGUOUS", status: { in: ["NEW", "NO_ANSWER", "NEEDS_REVIEW"] } } },
  { key: "new", label: "Not called yet", where: { status: "NEW" } },
  { key: "done", label: "Confirmed", where: { status: { in: ["CONFIRMED", "ADDRESS_UPDATED"] } } },
  { key: "attn", label: "Needs you", where: { status: { in: ["CANCEL_REQUESTED", "NEEDS_REVIEW", "NO_ANSWER"] } } },
];
const PAGE = 25;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();
  const search: Prisma.OrderWhereInput = q
    ? { OR: [{ orderName: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || "__none__" } }] }
    : {};
  const where: Prisma.OrderWhereInput = { AND: [search, tab.where ?? {}] };

  const [rows, total, live, totalAll, counts] = await Promise.all([
    db.order.findMany({ where, orderBy: { orderedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.order.count({ where }),
    liveStatus(),
    db.order.count(),
    Promise.all(TABS.map((t) => db.order.count({ where: { AND: [search, t.where ?? {}] } }))),
  ]);

  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { tab: tab.key, q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "tab" && v === "all")) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <p className="sub">New orders from Shiprocket. Start a call to confirm the order and fix an unclear address.</p>
        </div>
        <OrdersToolbar shiprocketConnected={live.shiprocket} empty={totalAll === 0} />
      </div>

      <nav className="tabs" aria-label="Order views">
        {TABS.map((t, i) => (
          <Link key={t.key} href={href({ tab: t.key, page: undefined })} aria-current={t.key === tab.key ? "page" : undefined}>
            {t.label}<span className="c">{counts[i]}</span>
          </Link>
        ))}
      </nav>

      <form action="/" style={{ marginBottom: 14 }}>
        {tab.key !== "all" && <input type="hidden" name="tab" value={tab.key} />}
        <input name="q" defaultValue={q} placeholder="Search order, customer or phone" aria-label="Search orders" style={{ padding: "8px 10px", border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", width: 320, maxWidth: "100%" }} />
      </form>

      {rows.length === 0 ? (
        <p className="sub" style={{ padding: "32px 0" }}>
          {totalAll === 0 ? "No orders yet. Fetch them from Shiprocket, or load sample orders to try the call." : "No orders match this view."}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Order</th><th>Customer</th><th>Address</th><th>Payment</th><th className="num">Amount</th><th>Shiprocket</th><th>OrderAI</th><th><span className="sr" style={{ position: "absolute", left: -9999 }}>Action</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const items = (o.items as Array<{ name: string; quantity: number }>).map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ");
                const done = ["CONFIRMED", "ADDRESS_UPDATED"].includes(o.status);
                return (
                  <tr key={o.id}>
                    <td>
                      <Link className="row-link" href={`/orders/${o.id}`}>{o.orderName}</Link>
                      <span className="sec">{dateTime(o.orderedAt)}</span>
                      <span className="sec">{items}</span>
                    </td>
                    <td>{o.customerName}<span className="sec">{maskPhone(o.phone)}</span></td>
                    <td style={{ maxWidth: 280 }}>
                      <span title={ADDRESS_LABEL[o.addressStatus]}><AddressTag status={o.addressStatus} /></span>
                      <span className="sec">{[o.address1, o.city, o.pincode].filter(Boolean).join(", ")}</span>
                    </td>
                    <td>{o.paymentMode === "COD" ? "COD" : "Prepaid"}</td>
                    <td className="num">{inr(o.amount.toString())}</td>
                    <td>{o.channelStatus}</td>
                    <td><StatusDot status={o.status} /></td>
                    <td>
                      <Link className={done ? "btn secondary small" : "btn small"} href={`/orders/${o.id}?call=1`}>{done ? "Call again" : o.status === "NO_ANSWER" ? "Call again" : "Start call"}</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <p style={{ display: "flex", gap: 16, marginTop: 18 }}>
          {page > 1 && <Link className="linklike" href={href({ page: String(page - 1) })}>Previous</Link>}
          <span className="muted">Page {page} of {pages}</span>
          {page < pages && <Link className="linklike" href={href({ page: String(page + 1) })}>Next</Link>}
        </p>
      )}
    </>
  );
}
