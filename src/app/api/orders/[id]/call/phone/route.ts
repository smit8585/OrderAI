import { NextResponse } from "next/server";
import { errMessage } from "@/lib/logger";
import { startPhoneCall } from "@/services/calls";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await startPhoneCall(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 409 });
  }
}
