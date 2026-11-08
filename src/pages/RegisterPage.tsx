import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopy } from "@/i18n/messages";
import { loadAccount } from "@/lib/account";

export function RegisterPage() {
  const navigate = useNavigate();
  const t = useCopy();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/register", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error || t.auth.badRegister);
      setBusy(false);
      return;
    }
    await loadAccount();
    void navigate({ to: "/audits" });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t.auth.registerTitle}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.auth.registerLead}</p>
      <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">{t.auth.email}</Label>
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t.auth.password}</Label>
          <Input id="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? t.auth.creating : t.auth.createAccount}</Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        {t.auth.haveAccount} <Link to="/login" className="text-primary underline-offset-4 hover:underline">{t.auth.signInLink}</Link>
      </p>
    </div>
  );
}
