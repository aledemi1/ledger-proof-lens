import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadAccount } from "@/lib/account";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error || "Не удалось войти");
      setBusy(false);
      return;
    }
    await loadAccount();
    void navigate({ to: "/audits" });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Вход</h1>
      <p className="mt-1 text-sm text-muted-foreground">Проверки привязаны к аккаунту. Демонстрационный комплект открывается без входа.</p>
      <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Почта</Label>
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Пароль</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Входим…" : "Войти"}</Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        Нет аккаунта? <Link to="/register" className="text-primary underline-offset-4 hover:underline">Создать</Link>
      </p>
    </div>
  );
}
