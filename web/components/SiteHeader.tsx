"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Playground", match: (p: string) => p === "/" },
  { href: "/evaluate", label: "Evaluate", match: (p: string) => p.startsWith("/evaluate") },
  { href: "/console", label: "Console", match: (p: string) => p.startsWith("/console") },
];

/** Universal top bar: brand, the three areas of the app, and the theme switch. */
export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-[var(--ink)] bg-[var(--card)]">
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="FairMod home">
          <span className="display grid h-9 w-9 place-items-center rounded-lg border-[3px] border-[var(--ink)] bg-[var(--red)] text-lg font-extrabold text-white shadow-[2px_2px_0_0_var(--ink)]">
            F
          </span>
          <span className="display hidden text-2xl font-extrabold tracking-tight sm:inline">FairMod</span>
        </Link>

        <nav aria-label="Main" className="ml-2 flex min-w-0 items-center gap-1 overflow-x-auto sm:ml-6">
          {LINKS.map((l) => {
            const active = l.match(pathname);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-lg border-[3px] px-3 py-1.5 text-sm font-bold transition-all duration-150 ${
                  active
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] shadow-[3px_3px_0_0_var(--red)]"
                    : "border-transparent hover:border-[var(--ink)] hover:bg-[var(--paper)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[0.65rem] font-extrabold uppercase tracking-[0.18em] text-[var(--ink-muted)] lg:inline">
            Theme
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
