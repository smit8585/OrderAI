import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { checkPin } from "@/lib/pin";
import { clearLimit, limited } from "@/lib/rate-limit";

const body = z.object({ pin: z.string().min(1).max(64) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your PIN." }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // A short PIN is easy to guess, so attempts are capped per visitor and across all visitors.
  if (limited(`ip:${ip}`, 5, 15 * 60_000) || limited("global", 30, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }

  if (!checkPin(parsed.data.pin)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.json({ error: "That PIN is not right." }, { status: 401 });
  }

  clearLimit(`ip:${ip}`);
  await createSession({ uid: "owner", email: "owner", name: "Owner" });
  return NextResponse.json({ ok: true });
}
