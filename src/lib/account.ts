export interface Account {
  id: string;
  email: string;
  role: "admin" | "user";
}

let current: Account | null | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadAccount(): Promise<Account | null> {
  const response = await fetch("/api/auth/me", { credentials: "same-origin" });
  current = response.ok ? ((await response.json()) as Account) : null;
  emit();
  return current;
}

export function cachedAccount(): Account | null | undefined {
  return current;
}
