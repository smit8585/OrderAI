import { db } from "@/lib/db";

export async function addEvent(orderId: string, type: string, message: string) {
  await db.orderEvent.create({ data: { orderId, type, message } });
}
