import { NextResponse } from "next/server";
import { z } from "zod";
import { errMessage } from "@/lib/logger";
import { browserCallTurn } from "@/services/calls";

export const dynamic = "force-dynamic";
const body = z.object({ text: z.string().trim().min(1).max(1000) });

export async function POST(req: Request, ctx: { params: Promise<{ callId: string }> }) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Say something first." }, { status: 400 });
  const { callId } = await ctx.params;
  try {
    return NextResponse.json(await browserCallTurn(callId, p.data.text));
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 409 });
  }
}
