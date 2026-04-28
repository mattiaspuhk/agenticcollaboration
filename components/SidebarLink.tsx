"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function SidebarLink({
  href,
  className,
  activeClassName,
  inactiveClassName,
  children,
  match = "exact",
}: {
  href: string;
  className?: string;
  activeClassName: string;
  inactiveClassName: string;
  children: ReactNode;
  match?: "exact" | "prefix";
}) {
  const pathname = usePathname();
  const active =
    match === "exact" ? pathname === href : pathname?.startsWith(href);
  return (
    <Link
      href={href}
      className={`${className ?? ""} ${active ? activeClassName : inactiveClassName}`}
    >
      {children}
    </Link>
  );
}
