import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/api/auth/login", "/api/webhooks/", "/api/health", "/_next/", "/favicon"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get("orderai_session")?.value;
  let ok = false;
  if (token && process.env.SESSION_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
