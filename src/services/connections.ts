import type { Provider } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decrypt, encrypt } from "@/lib/crypto";

export type ShiprocketCreds = { email: string; password: string };
/** The sponsor's voice agent API. Field names are generic until their docs are wired in. */
export type VoiceCreds = { baseUrl: string; apiKey: string; agentId: string; callerId?: string };

type Stored = { config: Record<string, string>; secrets: Record<string, string> };

const cache = new Map<Provider, { at: number; value: Stored | null }>();
const TTL = 15_000;

async function load(provider: Provider): Promise<Stored | null> {
  const hit = cache.get(provider);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const row = await db.connection.findUnique({ where: { provider } });
  let value: Stored | null = null;
  if (row) {
    try {
      value = { config: row.config as Record<string, string>, secrets: JSON.parse(decrypt(row.secretEnc)) };
    } catch {
      value = null;
    }
  }
  cache.set(provider, { at: Date.now(), value });
  return value;
}

export function clearConnectionCache() {
  cache.clear();
}

export async function saveConnection(
  provider: Provider,
  config: Record<string, string>,
  secrets: Record<string, string>,
  meta: { verified: boolean; accountLabel?: string; error?: string },
) {
  const data = {
    config,
    secretEnc: encrypt(JSON.stringify(secrets)),
    verified: meta.verified,
    accountLabel: meta.accountLabel ?? null,
    lastCheckedAt: new Date(),
    lastError: meta.error ?? null,
  };
  await db.connection.upsert({ where: { provider }, update: data, create: { provider, ...data } });
  clearConnectionCache();
}

export async function removeConnection(provider: Provider) {
  await db.connection.deleteMany({ where: { provider } });
  clearConnectionCache();
}

export async function markChecked(provider: Provider, ok: boolean, error?: string, label?: string) {
  await db.connection.updateMany({
    where: { provider },
    data: { verified: ok, lastCheckedAt: new Date(), lastError: ok ? null : (error ?? "Check failed"), ...(label ? { accountLabel: label } : {}) },
  });
  clearConnectionCache();
}

export async function shiprocketCreds(): Promise<ShiprocketCreds | null> {
  const s = await load("SHIPROCKET");
  if (s?.secrets.password && s.config.email) return { email: s.config.email, password: s.secrets.password };
  const e = env();
  if (e.SHIPROCKET_EMAIL && e.SHIPROCKET_PASSWORD) return { email: e.SHIPROCKET_EMAIL, password: e.SHIPROCKET_PASSWORD };
  return null;
}

export async function voiceCreds(): Promise<VoiceCreds | null> {
  const s = await load("VOICE");
  if (s?.secrets.apiKey && s.config.baseUrl) return { baseUrl: s.config.baseUrl, apiKey: s.secrets.apiKey, agentId: s.config.agentId ?? "", callerId: s.config.callerId || undefined };
  return null;
}

export async function liveStatus() {
  const [shiprocket, voice] = await Promise.all([shiprocketCreds(), voiceCreds()]);
  return { shiprocket: Boolean(shiprocket), voice: Boolean(voice) };
}

export async function connectionRows() {
  const rows = await db.connection.findMany();
  return new Map(rows.map((r) => [r.provider, r]));
}
