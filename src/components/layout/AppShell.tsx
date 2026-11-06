import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutList, Plus, ScanSearch } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Главная", Icon: ScanSearch, exact: true },
  { to: "/audits", label: "Все проверки", Icon: LayoutList, exact: false },
  { to: "/new", label: "Новая проверка", Icon: Plus, exact: true },
] as const;

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 px-2">
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <ScanSearch className="size-4" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Sverko</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const home = pathname === "/";
  const workspace = /^\/audits\/[^/]+\/?$/.test(pathname);
  if (home) return <div className="min-h-screen bg-background"><header className="no-print border-b border-border bg-card"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8"><Logo /><Link to="/audits" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"><LayoutList className="size-4" />Все проверки</Link></div></header><main>{children}</main></div>;
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className={cn("no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-4 md:flex", workspace ? "w-16" : "w-56")}>
        {workspace ? <Link to="/" aria-label="Sverko — главная" className="mx-auto grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><ScanSearch className="size-5" /></Link> : <Logo />}
        <nav className="mt-6 flex flex-col gap-0.5 px-2">
          {nav.map(({ to, label, Icon, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              aria-label={label}
              title={workspace ? label : undefined}
              className={cn("group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent", workspace && "h-10 justify-center")}
              activeProps={{ className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground" }}
            >
              <Icon className="size-4" />
              {workspace ? <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-panel group-hover:block group-focus-visible:block">{label}</span> : label}
            </Link>
          ))}
        </nav>
        <div className={cn("mt-auto px-4 text-[11px] leading-relaxed text-muted-foreground", workspace && "hidden")}>
          Фронтенд-версия. Обработка документов будет доступна после подключения сервера.
        </div>
      </aside>
      <header className="no-print sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-card px-3 md:hidden">
        <Logo />
        <nav className="flex gap-1">
          {nav.map(({ to, label, Icon, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              aria-label={label}
              className={cn("grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent")}
              activeProps={{ className: "bg-accent text-accent-foreground" }}
            >
              <Icon className="size-4" />
            </Link>
          ))}
        </nav>
      </header>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
