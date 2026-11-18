import { Link, useRouterState } from "@tanstack/react-router";
import { FolderOpen, LogIn, Mail, Plus, ScanSearch, Users, BarChart3, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/useAccount";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import type { Copy } from "@/i18n/copy";
import { AccessRequest } from "@/components/audit/AccessRequest";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useCopy } from "@/i18n/messages";
import { loadAccount } from "@/lib/account";
import sverkoIcon from "@/assets/sverko-icon.jpg";

const nav = [
  { to: "/", label: "Главная", Icon: ScanSearch, exact: true },
  { to: "/audits", label: "Проверки", Icon: FolderOpen, exact: false },
  { to: "/new", label: "Новая проверка", Icon: Plus, exact: true },
] as const;

type NavTo = "/" | "/audits" | "/new" | "/admin" | "/admin/mail" | "/admin/stats";

function navLabel(to: NavTo, t: Copy): string {
  if (to === "/") return t.nav.home;
  if (to === "/audits") return t.nav.audits;
  if (to === "/new") return t.nav.new;
  if (to === "/admin/mail") return t.nav.inbox;
  if (to === "/admin/stats") return t.nav.stats;
  return t.nav.users;
}

function Logo({ shortOnPhone = false }: { shortOnPhone?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 px-2">
      <img src={sverkoIcon} width={32} height={32} alt="" className="size-8 rounded-md" />
      <span className={cn("text-xl font-semibold", shortOnPhone && "hidden min-[420px]:inline")}>Sverko</span>
    </Link>
  );
}

function AccountLinks({ compact = false, adminLinks = true }: { compact?: boolean; adminLinks?: boolean }) {
  const account = useAccount();
  const t = useCopy();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    await loadAccount();
  };
  if (account === undefined) return null;
  if (!account) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link to="/login"><LogIn className="size-4" />{compact ? null : t.nav.login}</Link>
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {adminLinks && account.role === "admin" && (
        <>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/stats"><BarChart3 className="size-4" />{compact ? null : t.nav.stats}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/mail"><Mail className="size-4" />{compact ? null : t.nav.inbox}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin"><Users className="size-4" />{compact ? null : t.nav.users}</Link>
          </Button>
        </>
      )}
      {!compact && account.email ? <span className="max-w-40 truncate px-2 text-xs text-muted-foreground">{account.email}</span> : null}
      <Button variant="ghost" size="sm" onClick={() => void logout()}>{compact ? t.nav.exit : t.nav.logout}</Button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const account = useAccount();
  const t = useCopy();
  const home = pathname === "/";
  const workspace = /^\/audits\/[^/]+\/?$/.test(pathname);
  const items: { to: NavTo; label: string; Icon: LucideIcon; exact: boolean }[] = [
    ...nav,
    ...(account?.role === "admin"
      ? [
          { to: "/admin/stats" as const, label: t.nav.stats, Icon: BarChart3, exact: true },
          { to: "/admin/mail" as const, label: t.nav.inbox, Icon: Mail, exact: true },
          { to: "/admin" as const, label: t.nav.users, Icon: Users, exact: true },
        ]
      : []),
  ];
  if (home) return <div className="min-h-screen bg-background"><header className="no-print border-b border-border bg-card"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 lg:px-8"><Logo /><div className="flex items-center gap-1"><Button asChild variant="ghost" size="sm"><Link to="/audits"><FolderOpen className="size-4" />{t.nav.audits}</Link></Button><AccountLinks /><ThemeSwitcher /><LocaleSwitcher /></div></div></header><main>{children}</main></div>;
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className={cn("no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-4 md:flex", workspace ? "w-16" : "w-56")}>
        {workspace ? <Link to="/" aria-label="Sverko — главная" className="mx-auto grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><ScanSearch className="size-5" /></Link> : <Logo />}
        {!workspace && <div className="mt-4 flex gap-1.5 px-2"><ThemeSwitcher align="left" /><LocaleSwitcher align="left" /></div>}
        <nav className={cn(workspace ? "mt-6" : "mt-4", "flex flex-col gap-0.5 px-2")}>
          {items.map(({ to, Icon, exact }) => {
            const label = navLabel(to, t);
            const className = cn("group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent", workspace && "h-10 justify-center");
            const body = (
              <>
                <Icon className="size-4" />
                {workspace ? <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-panel group-hover:block group-focus-visible:block">{label}</span> : label}
              </>
            );
            if (to === "/new") {
              return (
                <AccessRequest key={to}>
                  <button type="button" aria-label={label} title={workspace ? label : undefined} className={className}>{body}</button>
                </AccessRequest>
              );
            }
            return (
              <Link key={to} to={to} activeOptions={{ exact }} aria-label={label} title={workspace ? label : undefined} className={className} activeProps={{ className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground" }}>
                {body}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2"><AccountLinks compact={workspace} adminLinks={false} /></div>
      </aside>
      <header className="no-print sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-card px-3 md:hidden">
        <Logo shortOnPhone />
        <nav className="flex gap-1">
          {items.map(({ to, Icon, exact }) => {
            const label = navLabel(to, t);
            const className = "grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent";
            if (to === "/new") {
              return (
                <AccessRequest key={to}>
                  <button type="button" aria-label={label} className={className}><Icon className="size-4" /></button>
                </AccessRequest>
              );
            }
            return (
              <Link key={to} to={to} activeOptions={{ exact }} aria-label={label} className={className} activeProps={{ className: "bg-accent text-accent-foreground" }}>
                <Icon className="size-4" />
              </Link>
            );
          })}
          <AccountLinks compact adminLinks={false} />
          <ThemeSwitcher compact />
          <LocaleSwitcher />
        </nav>
      </header>
      {workspace && <div className="no-print fixed right-3 top-2 z-50 hidden gap-1.5 md:flex"><ThemeSwitcher /><LocaleSwitcher /></div>}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
