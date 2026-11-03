import { NextResponse } from "next/server";
import { z } from "zod";
import { errMessage } from "@/lib/logger";
import { removeConnection, saveConnection } from "@/services/connections";
import { resetShiprocketToken, testShiprocket } from "@/integrations/shiprocket";

export const dynamic = "force-dynamic";

const shiprocket = z.object({ email: z.string().trim().email("Enter the API user's email."), password: z.string().min(1, "Enter the API user's password.") });
const voice = z.object({
  baseUrl: z.string().trim().url("Enter the API base URL, for example https://api.inferexai.in."),
  apiKey: z.string().trim().min(8, "Enter the API key."),
  agentId: z.string().trim().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const raw = await req.json().catch(() => null);
  try {
    if (provider === "shiprocket") {
      const p = shiprocket.safeParse(raw);
      if (!p.success) return NextResponse.json({ error: p.error.issues[0].message }, { status: 400 });
      try {
        const label = await testShiprocket(p.data.email, p.data.password);
        resetShiprocketToken();
        await saveConnection("SHIPROCKET", { email: p.data.email }, { password: p.data.password }, { verified: true, accountLabel: label });
      } catch (e) {
        return NextResponse.json({ error: `Shiprocket did not accept these details. Use an API user (Settings, then API). ${errMessage(e)}` }, { status: 422 });
      }
      return NextResponse.json({ ok: true });
    }
    if (provider === "voice") {
      const p = voice.safeParse(raw);
      if (!p.success) return NextResponse.json({ error: p.error.issues[0].message }, { status: 400 });
      await saveConnection("VOICE", { baseUrl: p.data.baseUrl.replace(/\/$/, ""), agentId: p.data.agentId ?? "" }, { apiKey: p.data.apiKey }, { verified: false, accountLabel: p.data.baseUrl });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown connection." }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (provider === "shiprocket") await removeConnection("SHIPROCKET");
  else if (provider === "voice") await removeConnection("VOICE");
  else return NextResponse.json({ error: "Unknown connection." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
