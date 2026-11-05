import Link from "next/link";
import type { AddressStatus, OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ADDRESS_LABEL, STATUS_LABEL, dateTime, inr } from "@/lib/format";
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
    ? { OR: [{ orderName: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || "__none__" } }, { pincode: { contains: q } }, { city: { contains: q, mode: "insensitive" } }] }
    : {};
  const statusF = sp.status && sp.status in STATUS_LABEL ? (sp.status as OrderStatus) : undefined;
  const addressF = sp.address && sp.address in ADDRESS_LABEL ? (sp.address as AddressStatus) : undefined;
  const paymentF = sp.payment === "COD" || sp.payment === "PREPAID" ? sp.payment : undefined;
  const channelF = sp.sr || undefined;
  const stateF = sp.state || undefined;
  const dayStart = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00+05:30`) : undefined);
  const from = dayStart(sp.from ?? "");
  const toRaw = dayStart(sp.to ?? "");
  const to = toRaw ? new Date(toRaw.getTime() + 86_400_000) : undefined;
  const filters: Prisma.OrderWhereInput = {
    ...(statusF ? { status: statusF } : {}),
    ...(addressF ? { addressStatus: addressF } : {}),
    ...(paymentF ? { paymentMode: paymentF } : {}),
    ...(channelF ? { channelStatus: channelF } : {}),
    ...(stateF ? { state: stateF } : {}),
    ...(from || to ? { orderedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
  const SORTS: Record<string, { label: string; by: Prisma.OrderOrderByWithRelationInput[] }> = {
    num_desc: { label: "Order number, high to low", by: [{ orderSeq: { sort: "desc", nulls: "last" } }, { orderedAt: "desc" }] },
    num_asc: { label: "Order number, low to high", by: [{ orderSeq: { sort: "asc", nulls: "last" } }, { orderedAt: "asc" }] },
    new: { label: "Newest first", by: [{ orderedAt: "desc" }] },
    old: { label: "Oldest first", by: [{ orderedAt: "asc" }] },
    amount: { label: "Amount, high to low", by: [{ amount: "desc" }] },
  };
  const sortKey = sp.sort && sp.sort in SORTS ? sp.sort : "num_desc";
  const where: Prisma.OrderWhereInput = { AND: [search, filters, tab.where ?? {}] };
  const activeFilters = [statusF, addressF, paymentF, channelF, stateF, sp.from, sp.to].filter(Boolean).length;

  const [rows, total, live, totalAll, counts, channels, states] = await Promise.all([
    db.order.findMany({ where, orderBy: SORTS[sortKey].by, skip: (page - 1) * PAGE, take: PAGE }),
    db.order.count({ where }),
    liveStatus(),
    db.order.count(),
    Promise.all(TABS.map((t) => db.order.count({ where: { AND: [search, filters, t.where ?? {}] } }))),
    db.order.findMany({ distinct: ["channelStatus"], select: { channelStatus: true }, orderBy: { channelStatus: "asc" } }),
    db.order.findMany({ distinct: ["state"], select: { state: true }, orderBy: { state: "asc" } }),
  ]);

  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { tab: tab.key, q, status: statusF, address: addressF, payment: paymentF, sr: channelF, state: stateF, from: sp.from, to: sp.to, sort: sortKey, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "tab" && v === "all") && !(k === "sort" && v === "num_desc")) p.set(k, v);
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

      <form action="/" className="filters" aria-label="Filter orders">
        {tab.key !== "all" && <input type="hidden" name="tab" value={tab.key} />}
        <div className="field"><label htmlFor="f-q">Search</label><input id="f-q" name="q" defaultValue={q} placeholder="Order, customer, phone, city, pincode" /></div>
        <div className="field"><label htmlFor="f-status">OrderAI status</label>
          <select id="f-status" name="status" defaultValue={statusF ?? ""}><option value="">Any</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="f-address">Address</label>
          <select id="f-address" name="address" defaultValue={addressF ?? ""}><option value="">Any</option>{Object.entries(ADDRESS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="f-payment">Payment</label>
          <select id="f-payment" name="payment" defaultValue={paymentF ?? ""}><option value="">Any</option><option value="COD">Cash on delivery</option><option value="PREPAID">Prepaid</option></select></div>
        <div className="field"><label htmlFor="f-sr">Shiprocket status</label>
          <select id="f-sr" name="sr" defaultValue={channelF ?? ""}><option value="">Any</option>{channels.map((c) => <option key={c.channelStatus} value={c.channelStatus}>{c.channelStatus}</option>)}</select></div>
        <div className="field"><label htmlFor="f-state">State</label>
          <select id="f-state" name="state" defaultValue={stateF ?? ""}><option value="">Any</option>{states.map((c) => <option key={c.state} value={c.state}>{c.state}</option>)}</select></div>
        <div className="field"><label htmlFor="f-from">Ordered from</label><input id="f-from" name="from" type="date" defaultValue={sp.from ?? ""} /></div>
        <div className="field"><label htmlFor="f-to">Ordered to</label><input id="f-to" name="to" type="date" defaultValue={sp.to ?? ""} /></div>
        <div className="field"><label htmlFor="f-sort">Sort by</label>
          <select id="f-sort" name="sort" defaultValue={sortKey}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <div className="filters-actions">
          <button className="btn small">Apply</button>
          {(activeFilters > 0 || q) && <Link className="linklike" href={tab.key === "all" ? "/" : `/?tab=${tab.key}`}>Clear filters</Link>}
        </div>
      </form>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>{total} {total === 1 ? "order" : "orders"}{activeFilters > 0 ? ` match ${activeFilters} ${activeFilters === 1 ? "filter" : "filters"}` : ""}. Sorted by {SORTS[sortKey].label.toLowerCase()}.</p>

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
                    <td>{o.customerName}<span className="sec"><a href={`tel:+91${o.phone.replace(/\D/g, "").slice(-10)}`}>{o.phone.replace(/\D/g, "").slice(-10) || o.phone}</a></span></td>
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
