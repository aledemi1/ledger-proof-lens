import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Moon, Sun, Sunset } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEMES, useTheme, type Theme } from "@/lib/theme";
import { useCopy } from "@/i18n/messages";

const ICONS = { light: Sun, dusk: Sunset, night: Moon } as const;

/** Swatch shows each palette as it looks: page, surface and accent. */
function Swatch({ theme }: { theme: Theme }) {
  return (
    <span data-theme-preview={theme} className="theme-swatch grid h-6 w-9 shrink-0 grid-cols-[1fr_10px] gap-0.5 overflow-hidden rounded border border-border p-0.5">
      <span className="theme-swatch-card rounded-[2px]" />
      <span className="theme-swatch-accent rounded-[2px]" />
    </span>
  );
}

export function ThemeSwitcher({ align = "right", compact = false }: { align?: "left" | "right"; compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const t = useCopy();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const Icon = ICONS[theme];

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

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t.theme.label}: ${t.theme[theme]}`}
        title={`${t.theme.label}: ${t.theme[theme]}`}
        onClick={() => setOpen((value) => !value)}
        className={cn("inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card text-foreground shadow-sm hover:border-primary/40", compact ? "w-8 justify-center" : "px-2")}
      >
        <Icon className="size-4" />
        {!compact && <ChevronDown className={cn("size-3 text-muted-foreground transition-transform", open && "rotate-180")} />}
      </button>
      {open && (
        <div role="menu" className={cn("absolute z-50 mt-2 w-48 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg", align === "left" ? "left-0" : "right-0")}>
          <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.theme.label}</div>
          {THEMES.map((item) => {
            const ItemIcon = ICONS[item];
            return (
              <button
                key={item}
                type="button"
                role="menuitemradio"
                aria-checked={item === theme}
                onClick={() => {
                  setTheme(item);
                  setOpen(false);
                }}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted", item === theme && "bg-primary/10 text-primary")}
              >
                <Swatch theme={item} />
                <ItemIcon className="size-4 shrink-0 opacity-70" />
                <span className="flex-1 font-medium">{t.theme[item]}</span>
                {item === theme && <Check className="size-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
