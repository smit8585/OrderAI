import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 10) }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** The settings row is a singleton (id = 1). Created on first read. */
export async function getSettings() {
  return db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
