import type { PaymentMode } from "@prisma/client";
import { shiprocketCreds } from "@/services/connections";
import { http, HttpError, pick } from "./http";

const BASE = "https://apiv2.shiprocket.in/v1/external";

let token: { value: string; email: string; expiresAt: number } | null = null;

export async function shiprocketLogin(email: string, password: string): Promise<string> {
  const res = await http<{ token?: string }>(`${BASE}/auth/login`, {
    method: "POST",
    retries: 0,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res?.token) throw new Error("Shiprocket login returned no token");
  return res.token;
}

async function getToken(force = false): Promise<string> {
  const c = await shiprocketCreds();
  if (!c) throw new Error("Shiprocket is not connected");
  if (!force && token && token.email === c.email && token.expiresAt > Date.now() + 60_000) return token.value;
  const value = await shiprocketLogin(c.email, c.password);
  token = { value, email: c.email, expiresAt: Date.now() + 24 * 3600_000 };
  return value;
}

export function resetShiprocketToken() {
  token = null;
}

async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const run = async (force: boolean) => {
    const t = await getToken(force);
    return http<T>(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, ...(init.headers ?? {}) } });
  };
  try {
    return await run(false);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) return run(true);
    throw e;
  }
}

export type ShiprocketOrder = {
  externalId: string;
  orderName: string;
  customerName: string;
  phone: string;
  email?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
  paymentMode: PaymentMode;
  amount: number;
  items: Array<{ name: string; quantity: number; price?: number }>;
  channelStatus: string;
  orderedAt: Date;
  raw: Record<string, unknown>;
};

/**
 * Shiprocket's order rows. All field guessing lives here, so a different response shape is a one-file fix.
 * Returns null when the row has no id or no usable phone and address.
 */
export function normalizeShiprocketOrder(r: Record<string, unknown>): ShiprocketOrder | null {
  const id = pick<string | number>(r, "id", "order_id");
  if (id === undefined) return null;
  const phone = String(pick(r, "customer_phone", "billing_phone", "shipping_phone", "phone") ?? "");
  const address1 = String(pick(r, "customer_address", "shipping_address", "billing_address") ?? "");
  if (!address1 && !phone) return null;
  const payment = String(pick(r, "payment_method", "payment_mode") ?? "").toLowerCase();
  const products = (pick<unknown[]>(r, "products", "order_items") ?? []) as Array<Record<string, unknown>>;
  const created = String(pick(r, "created_at", "order_date") ?? "");
  const orderedAt = created ? new Date(created.includes("T") ? created : created.replace(" ", "T") + "+05:30") : new Date();
  return {
    externalId: String(id),
    orderName: String(pick(r, "channel_order_id", "order_id", "id") ?? id),
    customerName: String(pick(r, "customer_name", "billing_customer_name", "shipping_customer_name") ?? "Customer"),
    phone,
    email: pick<string>(r, "customer_email", "billing_email"),
    address1,
    address2: pick<string>(r, "customer_address_2", "shipping_address_2"),
    city: String(pick(r, "customer_city", "shipping_city", "billing_city") ?? ""),
    state: String(pick(r, "customer_state", "shipping_state", "billing_state") ?? ""),
    pincode: String(pick(r, "customer_pincode", "shipping_pincode", "billing_pincode") ?? ""),
    paymentMode: payment.includes("cod") || payment.includes("cash") ? "COD" : "PREPAID",
    amount: Number(pick(r, "total", "sub_total", "order_total") ?? 0),
    items: products.map((p) => ({ name: String(pick(p, "name", "product_name") ?? "Item"), quantity: Number(pick(p, "quantity", "units") ?? 1), price: Number(pick(p, "price", "selling_price") ?? 0) || undefined })),
    channelStatus: String(pick(r, "status", "status_code") ?? "New"),
    orderedAt: isNaN(orderedAt.getTime()) ? new Date() : orderedAt,
    raw: r,
  };
}

/** Recent orders, newest first. */
export async function listOrders(pages = 2, perPage = 50): Promise<ShiprocketOrder[]> {
  const out: ShiprocketOrder[] = [];
  for (let page = 1; page <= pages; page++) {
    const res = await authed<{ data?: Array<Record<string, unknown>>; meta?: { pagination?: { total_pages?: number } } }>(`/orders?per_page=${perPage}&page=${page}&sort=DESC&sort_by=created_at`);
    for (const row of res?.data ?? []) {
      const o = normalizeShiprocketOrder(row);
      if (o) out.push(o);
    }
    const totalPages = res?.meta?.pagination?.total_pages ?? 1;
    if (page >= totalPages) break;
  }
  return out;
}

export type AddressUpdate = {
  orderId: string;
  customerName: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
};

/** Change the delivery address on a Shiprocket order (before it ships). */
export async function updateAddress(u: AddressUpdate): Promise<string> {
  const res = await authed<{ message?: string }>("/orders/address/update", {
    method: "POST",
    body: JSON.stringify({
      order_id: Number(u.orderId),
      shipping_customer_name: u.customerName,
      shipping_phone: u.phone.replace(/\D/g, "").slice(-10),
      shipping_address: u.address1,
      shipping_address_2: u.address2 ?? "",
      shipping_city: u.city,
      shipping_state: u.state,
      shipping_country: "India",
      shipping_pincode: Number(u.pincode),
    }),
  });
  return res?.message ?? "Updated";
}

export async function testShiprocket(email: string, password: string): Promise<string> {
  await shiprocketLogin(email, password);
  return email;
}
