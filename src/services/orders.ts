import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addressStatusFor } from "@/domain/address";
import { listOrders } from "@/integrations/shiprocket";
import { liveStatus } from "./connections";

const SAMPLES = [
  { name: "Priya Sharma", phone: "9876543210", a1: "Flat 4B, Green Heights, near City Mall, Baner", a2: "", city: "Pune", state: "Maharashtra", pin: "411045", pay: "COD", amt: 1299, items: [["Blue cotton kurta", 1, 1299]] },
  { name: "Rahul Verma", phone: "9811122233", a1: "Main road", a2: "", city: "Lucknow", state: "Uttar Pradesh", pin: "22600", pay: "COD", amt: 799, items: [["Running shoes", 1, 799]] },
  { name: "Anita Desai", phone: "9822001122", a1: "House 12 Shivaji Nagar", a2: "", city: "Nashik", state: "Maharashtra", pin: "422002", pay: "PREPAID", amt: 2450, items: [["Handloom saree", 1, 2450]] },
  { name: "Mohit Gupta", phone: "9899887766", a1: "B-27, Sector 15, near Metro Station, Rohini", a2: "Delhi", city: "New Delhi", state: "Delhi", pin: "110085", pay: "COD", amt: 1899, items: [["Wireless earbuds", 1, 1899]] },
  { name: "Sunita Reddy", phone: "9848012345", a1: "near temple", a2: "", city: "Hyderabad", state: "Telangana", pin: "500081", pay: "COD", amt: 599, items: [["Cotton bedsheet", 2, 299]] },
  { name: "Arjun Nair", phone: "9847001234", a1: "Plot 8, Palm Grove Road, opp. Lulu Mall, Edappally", a2: "", city: "Kochi", state: "Kerala", pin: "682024", pay: "PREPAID", amt: 3200, items: [["Smart watch", 1, 3200]] },
] as const;

/** Sample orders so the dashboard and the call can be tried before anything is connected. */
export async function loadSampleOrders(): Promise<number> {
  let made = 0;
  for (const [i, s] of SAMPLES.entries()) {
    const externalId = `SAMPLE-${i + 1}`;
    if (await db.order.findUnique({ where: { externalId } })) continue;
    const check = addressStatusFor({ address1: s.a1, address2: s.a2, city: s.city, state: s.state, pincode: s.pin });
    await db.order.create({
      data: {
        externalId,
        orderName: `#${1040 + i}`,
        customerName: s.name,
        phone: s.phone,
        address1: s.a1,
        address2: s.a2 || null,
        city: s.city,
        state: s.state,
        pincode: s.pin,
        paymentMode: s.pay,
        amount: s.amt,
        items: s.items.map(([name, quantity, price]) => ({ name, quantity, price })),
        channelStatus: "New",
        orderedAt: new Date(Date.now() - i * 3_600_000),
        addressStatus: check.status,
        addressReasons: check.reasons,
        addressSource: check.source,
        isSample: true,
      },
    });
    made++;
  }
  return made;
}

/** Pull recent orders from Shiprocket. New ones are added; existing ones keep their call state. */
export async function syncOrders(): Promise<{ created: number; updated: number }> {
  const live = await liveStatus();
  if (!live.shiprocket) throw new Error("Connect Shiprocket first, or load the sample orders.");
  const rows = await listOrders();
  let created = 0;
  let updated = 0;
  for (const o of rows) {
    const check = addressStatusFor(o, o.raw);
    const existing = await db.order.findUnique({ where: { externalId: o.externalId } });
    const base = {
      orderName: o.orderName,
      customerName: o.customerName,
      phone: o.phone,
      email: o.email ?? null,
      paymentMode: o.paymentMode,
      amount: o.amount,
      items: o.items as unknown as Prisma.InputJsonValue,
      channelStatus: o.channelStatus,
      raw: o.raw as Prisma.InputJsonValue,
    };
    if (!existing) {
      await db.order.create({
        data: {
          ...base,
          externalId: o.externalId,
          address1: o.address1,
          address2: o.address2 ?? null,
          city: o.city,
          state: o.state,
          pincode: o.pincode,
          orderedAt: o.orderedAt,
          addressStatus: check.status,
          addressReasons: check.reasons,
          addressSource: check.source,
        },
      });
      created++;
    } else {
      // Once the customer has given a new address, our copy is the newer one: do not overwrite it.
      const keepAddress = existing.status === "ADDRESS_UPDATED";
      await db.order.update({
        where: { id: existing.id },
        data: keepAddress ? base : { ...base, address1: o.address1, address2: o.address2 ?? null, city: o.city, state: o.state, pincode: o.pincode, addressStatus: check.status, addressReasons: check.reasons, addressSource: check.source },
      });
      updated++;
    }
  }
  return { created, updated };
}
