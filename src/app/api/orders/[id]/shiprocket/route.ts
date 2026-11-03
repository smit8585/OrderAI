import { NextResponse } from "next/server";
import { errMessage } from "@/lib/logger";
import { pushAddressToShiprocket } from "@/services/calls";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ message: await pushAddressToShiprocket(id) });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 502 });
  }
}
