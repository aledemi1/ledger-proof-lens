import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/useAccount";
import { LOCALE_INTL } from "@/i18n/locales";
import { useCopy } from "@/i18n/messages";
import { useLocale } from "@/i18n/use-locale";
import { cn } from "@/lib/utils";

interface InboxMessage {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

interface InboxList {
  configured: boolean;
  mailbox: string;
  unseen: number;
  messages: InboxMessage[];
}

interface InboxLetter extends InboxMessage {
  to: string;
  text: string;
  attachments: string[];
  tooLarge: boolean;
}

export function InboxPage() {
  const account = useAccount();
  const t = useCopy();
  const locale = useLocale();
  const [box, setBox] = useState<InboxList | null>(null);
  const [letter, setLetter] = useState<InboxLetter | null>(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [mounted, setMounted] = useState(false);

  const load = async () => {
    const response = await fetch("/api/admin/inbox", { credentials: "same-origin" });
    const payload = (await response.json().catch(() => ({}))) as InboxList & { error?: string };
    if (!response.ok) {
      setError(payload.error || t.inbox.loadFailed);
      return;
    }
    setBox(payload);
    setError("");
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (account?.role === "admin") void load();
  }, [account]);

  const open = async (uid: number) => {
    setOpening(true);
    setError("");
    const response = await fetch(`/api/admin/inbox/${uid}`, { credentials: "same-origin" });
    const payload = (await response.json().catch(() => ({}))) as InboxLetter & { error?: string };
    setOpening(false);
    if (!response.ok) {
      setError(payload.error || t.inbox.openFailed);
      return;
    }
    setLetter(payload);
    setBox((current) => {
      if (!current) return current;
      const previous = current.messages.find((item) => item.uid === uid);
      return {
        ...current,
        unseen: previous && !previous.seen ? Math.max(0, current.unseen - 1) : current.unseen,
        messages: current.messages.map((item) =>
          item.uid === uid ? { ...item, seen: true } : item,
        ),
      };
    });
  };

  const formatDate = (value: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(LOCALE_INTL[locale], {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  if (!mounted || account === undefined) return null;
  if (!account || account.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">
        {t.admin.forbidden}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.inbox.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.inbox.lead}</p>
          {box?.mailbox && (
            <p className="mt-1 text-sm">
              {box.mailbox}
              {box.unseen > 0 ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {box.unseen} {t.inbox.unread}
                </span>
              ) : null}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          {t.inbox.refresh}
        </Button>
      </div>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {box && !box.configured && (
        <p className="mt-6 text-sm text-muted-foreground">{t.inbox.notConfigured}</p>
      )}
      {box?.configured && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className={cn("min-w-0 border-y border-border", letter && "hidden lg:block")}>
            {box.messages.length === 0 && (
              <p className="py-6 text-sm text-muted-foreground">{t.inbox.empty}</p>
            )}
            <ul>
              {box.messages.map((message) => (
                <li key={message.uid} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => void open(message.uid)}
                    className={cn(
                      "w-full px-2 py-3 text-left hover:bg-accent",
                      letter?.uid === message.uid && "bg-accent",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cn("truncate text-sm", !message.seen && "font-semibold")}>
                        {message.from || message.subject || "—"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(message.date)}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "truncate text-sm text-muted-foreground",
                        !message.seen && "text-foreground",
                      )}
                    >
                      {message.subject || "—"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className={cn("min-w-0", !letter && "hidden lg:block")}>
            {!letter && <p className="text-sm text-muted-foreground">{t.inbox.pick}</p>}
            {letter && (
              <article>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-3 lg:hidden"
                  onClick={() => setLetter(null)}
                >
                  {t.inbox.back}
                </Button>
                <h2 className="text-lg font-semibold">{letter.subject || "—"}</h2>
                <p className="mt-1 text-sm">{letter.from || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(letter.date)}
                  {letter.to ? ` · ${letter.to}` : ""}
                </p>
                {letter.attachments.length > 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t.inbox.attachments}: {letter.attachments.join(", ")}
                  </p>
                )}
                <div className="mt-4 whitespace-pre-wrap text-sm leading-6">
                  {opening
                    ? t.common.loading
                    : letter.tooLarge
                      ? t.inbox.tooLarge
                      : letter.text || t.inbox.noText}
                </div>
              </article>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
