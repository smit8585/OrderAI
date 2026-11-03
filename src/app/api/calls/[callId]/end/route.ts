import { NextResponse } from "next/server";
import { errMessage } from "@/lib/logger";
import { endBrowserCall } from "@/services/calls";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ callId: string }> }) {
  const { callId } = await ctx.params;
  try {
    return NextResponse.json(await endBrowserCall(callId));
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 409 });
  }
}
