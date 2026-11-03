import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { LogoutButton } from "@/components/client";
import { isDefaultPin } from "@/lib/pin";
import { NavLink } from "@/components/nav-link";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  const attention = await db.order.count({ where: { status: { in: ["CANCEL_REQUESTED", "NEEDS_REVIEW"] } } });
  return (
    <div className="shell">
      <aside className="rail">
        <div>
          <Link href="/" className="mark">Order<span>.</span>AI</Link>
          <nav className="nav" aria-label="Main">
            <NavLink href="/" exact count={attention}>Orders</NavLink>
            <NavLink href="/calls">Calls</NavLink>
            <NavLink href="/connections">Connections</NavLink>
            <NavLink href="/settings">Settings</NavLink>
          </nav>
        </div>
        <div className="who">
          <strong>Signed in</strong>
          <LogoutButton />
        </div>
      </aside>
      <main className="main">
        {isDefaultPin() && (
          <div className="banner" role="alert">
            <span>This dashboard uses the default PIN. Set <code>APP_PIN</code> in Railway to change it.</span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
