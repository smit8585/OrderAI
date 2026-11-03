"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, count, children }: { href: string; exact?: boolean; count?: number; children: React.ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={active ? "page" : undefined}>
      <span>{children}</span>
      {count ? <span className="count" aria-label={`${count} need review`}>{count}</span> : null}
    </Link>
  );
}
