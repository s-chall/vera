"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, FilePenLine, Landmark, Newspaper, Search } from "lucide-react";
import { useVera } from "@/lib/vera";

const links = [
  { href: "/", label: "Briefing", icon: Newspaper },
  { href: "/fund", label: "Fund", icon: Landmark },
  { href: "/write", label: "Write", icon: FilePenLine },
  { href: "/profile", label: "Profile", icon: CircleUserRound },
];

const initials = (alias: string) => alias.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export function SiteHeader() {
  const pathname = usePathname();
  const { me } = useVera();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/articles") : pathname.startsWith(href);

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link className="wordmark" href="/" aria-label="Vera home">Vera<span aria-hidden="true">.</span></Link>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {links.map(({ href, label, icon: Icon }) => (
              <Link href={href} key={href} aria-current={isActive(href) ? "page" : undefined}>
                <Icon aria-hidden="true" />{label}
              </Link>
            ))}
          </nav>
          <Link className="sidebar-write" href="/write">Write securely</Link>
          <button className="sidebar-search"><Search aria-hidden="true" />Search reports</button>
          <Link className="profile-pill" href="/profile">
            <b aria-hidden="true">{me ? initials(me.alias) : "··"}</b>
            <span><strong>{me ? me.alias : "Signed out"}</strong><small>Private profile</small></span>
          </Link>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Primary navigation">
        {links.map(({ href, label, icon: Icon }) => (
          <Link href={href} key={href} aria-current={isActive(href) ? "page" : undefined}>
            <Icon aria-hidden="true" /><span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
