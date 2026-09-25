"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVera } from "@/lib/vera";
import type { AccountType } from "@/lib/types";
import { CircleUserRound, FilePenLine, HandCoins, Newspaper, Search } from "lucide-react";
import { VeraMark } from "@/components/vera-mark";

const links = [
  { href: "/", label: "News", icon: Newspaper },
  { href: "/fund", label: "Fund", icon: HandCoins },
  { href: "/write", label: "Write", icon: FilePenLine },
  { href: "/profile", label: "Profile", icon: CircleUserRound },
];

const TYPE_LABEL: Record<AccountType, string> = {
  journalist: "Journalist",
  media_org: "Media organisation",
  funder: "Funder",
};

const initials = (alias: string) =>
  alias
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function SiteHeader() {
  const pathname = usePathname();
  const { me, accountType } = useVera();
  if (pathname.startsWith("/signup")) return null;
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link className="wordmark" href="/" aria-label="Vera home">
            <VeraMark className="wordmark-mark" />
            <span className="wordmark-text">
              Vera<span aria-hidden="true">.</span>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {links.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/" ? pathname === "/" || pathname.startsWith("/articles") : pathname.startsWith(href);
              return (
                <Link href={href} key={href} aria-current={active ? "page" : undefined}>
                  <Icon aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <Link className="sidebar-write" href="/write">
            Write securely
          </Link>
          <button className="sidebar-search">
            <Search aria-hidden="true" />
            Search reports
          </button>
          <Link className="profile-pill" href="/profile">
            <b aria-hidden="true" className={me ? `identity-seal ${me.seal}` : undefined}>
              {me ? initials(me.alias) : "··"}
            </b>
            <span>
              <strong>{me ? me.alias : "Signed out"}</strong>
              <small>{me && accountType ? TYPE_LABEL[accountType] : "Private profile"}</small>
            </span>
          </Link>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Primary navigation">
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" || pathname.startsWith("/articles") : pathname.startsWith(href);
          return (
            <Link href={href} key={href} aria-current={active ? "page" : undefined}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
