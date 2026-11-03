import { NextResponse } from "next/server";
import { loadSampleOrders } from "@/services/orders";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ created: await loadSampleOrders() });
}
