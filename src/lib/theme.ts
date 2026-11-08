import { useCallback, useEffect, useState } from "react";

export const THEMES = ["light", "dusk", "night"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "sverko-theme";
const THEME_EVENT = "sverko-theme-change";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Applies a theme to <html>: `data-theme` picks the palette, `.dark` enables dark-mode variants. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset["theme"] = theme;
  root.classList.toggle("dark", theme !== "light");
  root.style.colorScheme = theme === "light" ? "light" : "dark";
}

/** Runs before first paint (inlined in <head>) so a saved dark theme never flashes white. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="dusk"&&t!=="night")t="light";var d=document.documentElement;d.dataset.theme=t;d.classList.toggle("dark",t!=="light");d.style.colorScheme=t==="light"?"light":"dark"}catch(e){}})()`;

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(saved) ? saved : "light";
  } catch {
    return "light";
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(readTheme());
    const sync = () => setThemeState(readTheme());
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable; the theme still applies for this page */
    }
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { theme, setTheme };
}

/** Printed conclusions always use the light palette, whatever theme is on screen. */
export function usePrintInLight() {
  useEffect(() => {
    const before = () => applyTheme("light");
    const after = () => applyTheme(readTheme());
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
}
