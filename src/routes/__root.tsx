import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { THEME_INIT_SCRIPT, usePrintInLight } from "@/lib/theme";
import { LOCALE_HTML_LANG } from "@/i18n/locales";
import { useCopy } from "@/i18n/messages";
import { localeFromPathname, stripLocalePrefix } from "@/i18n/path";
import { useLocale } from "@/i18n/use-locale";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  const t = useCopy();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute right-3 top-3 flex gap-1.5"><ThemeSwitcher /><LocaleSwitcher /></div>
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t.common.notFoundTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.common.notFoundText}</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">{t.common.home}</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const t = useCopy();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute right-3 top-3 flex gap-1.5"><ThemeSwitcher /><LocaleSwitcher /></div>
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t.common.pageFailed}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.common.pageFailedText}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t.common.tryAgain}
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">{t.common.home}</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: ({ location }) => {
    let pathname = location.pathname;
    try {
      pathname = new URL(location.publicHref, "https://sverko.ru").pathname;
    } catch {
      pathname = location.pathname;
    }
    if (pathname === "/ru" || pathname.startsWith("/ru/")) {
      const hash = location.hash ? `#${location.hash}` : "";
      throw redirect({ href: `${stripLocalePrefix(pathname)}${location.searchStr}${hash}`, statusCode: 301 });
    }
    return { locale: localeFromPathname(pathname) };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sverko — проверка достоверности отчётности" },
      { name: "description", content: "Сверка отчётов с первичными документами: расхождения, источники и заключение." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const locale = useLocale();
  return (
    <html lang={LOCALE_HTML_LANG[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  usePrintInLight();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
