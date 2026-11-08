import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/hooks/useAccount";
import { useCopy } from "@/i18n/messages";
import type { Account } from "@/lib/account";

export function AdminPage() {
  const account = useAccount();
  const t = useCopy();
  const [users, setUsers] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");

  const load = async () => {
    const response = await fetch("/api/admin/users", { credentials: "same-origin" });
    const payload = (await response.json().catch(() => ({}))) as Account[] | { error?: string };
    if (!response.ok) {
      setError("error" in payload && payload.error ? payload.error : t.admin.loadFailed);
      return;
    }
    setUsers(Array.isArray(payload) ? payload : []);
    setError("");
  };

  useEffect(() => {
    if (account?.role === "admin") void load();
  }, [account]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetch("/api/admin/users", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error || t.admin.createFailed);
      return;
    }
    setEmail("");
    setPassword("");
    setRole("user");
    await load();
  };

  const changeRole = async (id: string, next: "user" | "admin") => {
    const response = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error || t.admin.roleFailed);
      return;
    }
    await load();
  };

  const changeOwnPassword = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetch("/api/auth/password", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, nextPassword }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error || t.admin.passwordFailed);
      return;
    }
    setCurrentPassword("");
    setNextPassword("");
    setError("");
  };

  if (account === undefined) return null;
  if (!account || account.role !== "admin") {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">{t.admin.forbidden}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t.admin.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.admin.lead}</p>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <ul className="mt-6 divide-y divide-border border-y border-border">
        {users.map((user) => (
          <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="text-sm font-medium">{user.email}</div>
              <div className="text-xs text-muted-foreground">{user.role === "admin" ? t.admin.admin : t.admin.user}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void changeRole(user.id, user.role === "admin" ? "user" : "admin")}>
              {user.role === "admin" ? t.admin.makeUser : t.admin.makeAdmin}
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void create(event)} className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="new-email">{t.admin.newAccount}</Label>
          <Input id="new-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <Input type="password" minLength={8} placeholder={t.admin.password} value={password} onChange={(event) => setPassword(event.target.value)} required />
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value === "admin" ? "admin" : "user")}>
          <option value="user">{t.admin.user}</option>
          <option value="admin">{t.admin.admin}</option>
        </select>
        <Button type="submit" className="sm:col-span-2">{t.admin.create}</Button>
      </form>
      <form onSubmit={(event) => void changeOwnPassword(event)} className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="current-password">{t.admin.changePassword}</Label>
          <Input id="current-password" type="password" placeholder={t.admin.current} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
        </div>
        <Input type="password" minLength={8} placeholder={t.admin.next} value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} required />
        <Button type="submit" variant="outline">{t.admin.savePassword}</Button>
      </form>
    </div>
  );
}
