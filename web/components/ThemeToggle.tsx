"use client";

import { useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/theme";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {}
    setTheme(next);
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark theme"
      onClick={toggle}
      className="group relative inline-flex h-9 w-[4.6rem] shrink-0 items-center rounded-full border-[3px] border-[var(--ink)] bg-[var(--card)] shadow-[2px_2px_0_0_var(--ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
    >
      <span className="absolute left-2 text-xs" aria-hidden>
        ☀
      </span>
      <span className="absolute right-2 text-xs" aria-hidden>
        ☾
      </span>
      <span
        className="absolute top-[3px] grid h-[1.45rem] w-[1.45rem] place-items-center rounded-full border-2 border-[var(--ink)] bg-[var(--red)] text-[0.65rem] font-extrabold text-white transition-[left] duration-200 ease-out"
        style={{ left: dark ? "calc(100% - 1.45rem - 3px)" : "3px", opacity: theme ? 1 : 0 }}
        aria-hidden
      >
        {dark ? "☾" : "☀"}
      </span>
    </button>
  );
}
