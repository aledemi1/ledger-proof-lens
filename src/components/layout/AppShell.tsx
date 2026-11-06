import { Link } from "@tanstack/react-router";
import { LayoutList, Plus, ScanSearch } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Все проверки", Icon: LayoutList, exact: true },
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
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="no-print sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-4 md:flex">
        <Logo />
        <nav className="mt-6 flex flex-col gap-0.5 px-2">
          {nav.map(({ to, label, Icon, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground" }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-4 text-[11px] leading-relaxed text-muted-foreground">
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
