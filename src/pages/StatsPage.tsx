import { useEffect, useState } from "react";
import { useAccount } from "@/hooks/useAccount";
import { LOCALE_INTL } from "@/i18n/locales";
import { useCopy } from "@/i18n/messages";
import { useLocale } from "@/i18n/use-locale";

interface Count {
  status: string;
  count: number;
}

interface AdminStats {
  users: number;
  audits: number;
  documents: number;
  checks: number;
  auditsByStatus: Count[];
  checksByStatus: Count[];
  recent: { id: string; title: string; status: string; createdAt: string; ownerEmail: string | null }[];
}

export function StatsPage() {
  const account = useAccount();
  const t = useCopy();
  const locale = useLocale();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (account?.role !== "admin") return;
    void (async () => {
      const response = await fetch("/api/admin/stats", { credentials: "same-origin" });
      const payload = (await response.json().catch(() => ({}))) as AdminStats & { error?: string };
      if (!response.ok) {
        setError(payload.error || t.stats.loadFailed);
        return;
      }
      setStats(payload);
      setError("");
    })();
  }, [account, t.stats.loadFailed]);

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(LOCALE_INTL[locale], { dateStyle: "medium", timeStyle: "short" }).format(date);
  };

  const checkLabel = (status: string) => {
    if (status === "match") return t.status.match;
    if (status === "mismatch") return t.status.mismatch;
    if (status === "not_found") return t.status.notFound;
    if (status === "needs_review") return t.status.needsReview;
    return status;
  };

  const auditLabel = (status: string) => {
    if (status === "awaiting_processing") return t.session.awaiting;
    if (status === "in_review") return t.session.review;
    if (status === "completed") return t.session.completed;
    return status;
  };

  if (account === undefined) return null;
  if (!account || account.role !== "admin") {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">{t.admin.forbidden}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t.stats.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.stats.lead}</p>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {stats && (
        <>
          <dl className="mt-6 grid gap-3 sm:grid-cols-4">
            {[
              [t.stats.users, stats.users],
              [t.stats.audits, stats.audits],
              [t.stats.documents, stats.documents],
              [t.stats.checks, stats.checks],
            ].map(([label, value]) => (
              <div key={String(label)} className="border border-border px-4 py-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <section>
              <h2 className="text-sm font-semibold">{t.stats.audits}</h2>
              <ul className="mt-2 text-sm">
                {stats.auditsByStatus.map((row) => (
                  <li key={row.status} className="flex justify-between border-b border-border py-1.5">
                    <span>{auditLabel(row.status)}</span>
                    <span>{row.count}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="text-sm font-semibold">{t.stats.checks}</h2>
              <ul className="mt-2 text-sm">
                {stats.checksByStatus.map((row) => (
                  <li key={row.status} className="flex justify-between border-b border-border py-1.5">
                    <span>{checkLabel(row.status)}</span>
                    <span>{row.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <h2 className="mt-8 text-sm font-semibold">{t.stats.recent}</h2>
          {stats.recent.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t.stats.empty}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {stats.recent.map((item) => (
                <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.ownerEmail || t.stats.guest} · {auditLabel(item.status)} · {formatDate(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
