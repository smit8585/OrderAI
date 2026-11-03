import { NextResponse } from "next/server";
import { errMessage } from "@/lib/logger";
import { syncOrders } from "@/services/orders";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await syncOrders());
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 502 });
  }
}
