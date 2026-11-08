import { useEffect, useState } from "react";
import { cachedAccount, loadAccount, subscribeAccount, type Account } from "@/lib/account";

/** undefined while the first request is in flight, null for a guest. */
export function useAccount(): Account | null | undefined {
  const [account, setAccount] = useState<Account | null | undefined>(cachedAccount());
  useEffect(() => {
    const stop = subscribeAccount(() => setAccount(cachedAccount() ?? null));
    if (cachedAccount() === undefined) void loadAccount();
    return stop;
  }, []);
  return account;
}
