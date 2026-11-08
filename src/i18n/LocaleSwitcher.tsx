import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LOCALE_NAME, LOCALE_REGION, LOCALES, type Locale } from "./locales";
import { stripLocalePrefix, withLocale } from "./path";
import { useLocale } from "./use-locale";
import { copy } from "./messages";

function Flag({ locale }: { locale: Locale }) {
  const common = "block h-full w-full";
  if (locale === "ru") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <rect width="24" height="8" fill="#fff" />
        <rect y="8" width="24" height="8" fill="#0039A6" />
        <rect y="16" width="24" height="8" fill="#D52B1E" />
      </svg>
    );
  }
  if (locale === "en") {
    return (
      <svg viewBox="0 0 60 30" className={common} aria-hidden>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </svg>
    );
  }
  if (locale === "de") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <rect width="24" height="8" fill="#000" />
        <rect y="8" width="24" height="8" fill="#D00" />
        <rect y="16" width="24" height="8" fill="#FFCE00" />
      </svg>
    );
  }
  if (locale === "fr") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <rect width="8" height="24" fill="#002395" />
        <rect x="8" width="8" height="24" fill="#fff" />
        <rect x="16" width="8" height="24" fill="#ED2939" />
      </svg>
    );
  }
  if (locale === "it") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <rect width="8" height="24" fill="#009246" />
        <rect x="8" width="8" height="24" fill="#fff" />
        <rect x="16" width="8" height="24" fill="#CE2B37" />
      </svg>
    );
  }
  if (locale === "es") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <rect width="24" height="6" fill="#AA151B" />
        <rect y="6" width="24" height="12" fill="#F1BF00" />
        <rect y="18" width="24" height="6" fill="#AA151B" />
      </svg>
    );
  }
  if (locale === "tr") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <rect width="24" height="24" fill="#E30A17" />
        <circle cx="10" cy="12" r="5" fill="#fff" />
        <circle cx="11.2" cy="12" r="4" fill="#E30A17" />
        <polygon points="15.2,12 17.6,10.2 16.7,12.9 18.9,11.4 16.1,11.4 17.2,13.8" fill="#fff" />
      </svg>
    );
  }
  if (locale === "pl") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <rect width="24" height="12" fill="#fff" />
        <rect y="12" width="24" height="12" fill="#DC143C" />
      </svg>
    );
  }
  if (locale === "pt") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <rect width="9" height="24" fill="#006600" />
        <rect x="9" width="15" height="24" fill="#FF0000" />
        <circle cx="9" cy="12" r="3.2" fill="#FFCC00" />
        <circle cx="9" cy="12" r="2" fill="#006600" />
      </svg>
    );
  }
  if (locale === "nl") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <rect width="24" height="8" fill="#AE1C28" />
        <rect y="8" width="24" height="8" fill="#fff" />
        <rect y="16" width="24" height="8" fill="#21468B" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} aria-hidden>
      <rect width="24" height="24" fill="#DE2910" />
      <polygon points="4.5,3.5 5.2,5.6 7.4,5.6 5.6,6.9 6.3,9 4.5,7.7 2.7,9 3.4,6.9 1.6,5.6 3.8,5.6" fill="#FFDE00" />
    </svg>
  );
}

/** Плашка с флагом. Родитель ставит её справа сверху. */
export function LocaleSwitcher({ align = "right" }: { align?: "left" | "right" }) {
  const locale = useLocale();
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const label = copy[locale].language;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (next: Locale) => {
    const bare = stripLocalePrefix(location.pathname);
    const hash = location.hash ? `#${location.hash}` : "";
    void router.history.push(withLocale(next, `${bare}${location.searchStr}${hash}`));
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}: ${LOCALE_NAME[locale]}`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-1.5 pr-2 text-foreground shadow-sm hover:border-primary/40"
      >
        <span className="grid size-5 place-items-center overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
          <Flag locale={locale} />
        </span>
        <span className="text-[11px] font-bold tracking-wide">{locale.toUpperCase()}</span>
        <svg viewBox="0 0 20 20" className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      {open && (
        <div role="menu" className={`absolute ${align === "left" ? "left-0" : "right-0"} z-50 mt-2 max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg`}>
          {LOCALES.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitem"
              onClick={() => go(item)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted ${item === locale ? "bg-primary/10 text-primary" : ""}`}
            >
              <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
                <Flag locale={item} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{LOCALE_NAME[item]}</span>
                <span className="block text-[11px] leading-tight text-muted-foreground">{LOCALE_REGION[item]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
