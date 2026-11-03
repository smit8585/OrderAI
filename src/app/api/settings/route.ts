import { NextResponse } from "next/server";
import { z } from "zod";
import { db, getSettings } from "@/lib/db";

export const dynamic = "force-dynamic";
const body = z.object({ language: z.enum(["en", "hi"]), autoUpdate: z.boolean() });

export async function PUT(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
  await getSettings();
  await db.setting.update({ where: { id: 1 }, data: p.data });
  return NextResponse.json({ ok: true });
}
