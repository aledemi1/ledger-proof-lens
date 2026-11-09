import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/i18n/messages";
import { loadAccount } from "@/lib/account";

export function VerifyEmailPage({ token }: { token: string }) {
  const t = useCopy();
  const navigate = useNavigate();
  const [state, setState] = useState<"pending" | "ok" | "error">("pending");
  const [message, setMessage] = useState(t.auth.verifyPending);

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage(t.auth.verifyFail);
      return;
    }
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (cancelled) return;
      if (!response.ok) {
        setState("error");
        setMessage(payload.error || t.auth.verifyFail);
        return;
      }
      await loadAccount();
      setState("ok");
      setMessage(t.auth.verifyOk);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t.auth.verifyFail, t.auth.verifyOk, t.auth.verifyPending]);

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t.auth.verifyTitle}</h1>
      <p className={`mt-3 text-sm ${state === "error" ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>
      {state === "ok" && (
        <Button className="mt-6" onClick={() => void navigate({ to: "/audits" })}>
          {t.auth.toAudits}
        </Button>
      )}
      {state === "error" && (
        <p className="mt-6 text-sm text-muted-foreground">
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">{t.auth.signInLink}</Link>
        </p>
      )}
    </div>
  );
}
