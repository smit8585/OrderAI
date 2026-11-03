import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const material = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!material || material.length < 32) throw new Error("SESSION_SECRET (or ENCRYPTION_KEY) must be at least 32 characters");
  return createHash("sha256").update(`orderai:connections:${material}`).digest();
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

export function decrypt(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}
