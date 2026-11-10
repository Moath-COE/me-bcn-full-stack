"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { useAccount } from "@/lib/auth/client";
import { CloseIcon, MenuIcon } from "./icons";

type NavLink = { href: string; label: string };

const PUBLIC_LINKS: NavLink[] = [
  { href: "/courses", label: "Courses" },
  { href: "/plans", label: "Plans" },
];
const SIGNED_IN_LINKS: NavLink[] = [
  { href: "/dashboard", label: "My courses" },
  { href: "/account", label: "Account" },
];
const SIGNED_OUT_LINKS: NavLink[] = [
  { href: "/sign-in", label: "Sign in" },
  { href: "/join", label: "Create account" },
];

const isCurrent = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** The site's one navigation: a row of links from `md` up, a slide-in menu below it. */
export function SiteNav() {
  const pathname = usePathname();
  const { account, isPending } = useAccount();
  const [open, setOpen] = useState(false);
  // While the session loads, show only the public links so the row does not flip from one state to the other.
  const links = [...PUBLIC_LINKS, ...(isPending ? [] : account ? SIGNED_IN_LINKS : SIGNED_OUT_LINKS)];
  const emphasized = account ? null : "/join";

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
            className={
              link.href === emphasized
                ? "ms-2 inline-flex min-h-11 items-center rounded-pill border border-aubergine-mid px-4 font-semibold text-aubergine-base"
                : "inline-flex min-h-11 items-center px-3 font-semibold text-ink-2 hover:text-ink aria-[current=page]:text-ink"
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            aria-label="Menu"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-pill border border-line text-ink transition-colors hover:bg-surface-2 md:hidden"
          >
            <MenuIcon />
          </button>
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="becan-menu-overlay fixed inset-0 z-40 bg-ground/80" />
          <Dialog.Content
            aria-describedby={undefined}
            className="becan-menu-panel fixed inset-y-0 end-0 z-50 flex w-[min(20rem,calc(100%_-_3rem))] flex-col gap-2 overflow-y-auto border-s border-line bg-ground p-4 shadow-lift"
          >
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="ps-2 font-display text-xl font-bold text-ink">Menu</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill border border-line text-ink transition-colors hover:bg-surface-2"
                >
                  <CloseIcon />
                </button>
              </Dialog.Close>
            </div>

            <nav aria-label="Main" className="mt-2 flex flex-col border-t border-line pt-2">
              {links.map((link) => (
                // Closing on click keeps the panel from staying open over the next page.
                <Dialog.Close asChild key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
                    className="inline-flex min-h-11 items-center rounded-md px-2 text-lg font-semibold text-ink hover:bg-surface-2"
                  >
                    {link.label}
                  </Link>
                </Dialog.Close>
              ))}
            </nav>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
