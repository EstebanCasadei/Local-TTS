import { useEffect, useState } from "react";
import { getUserService } from "../lib/user";
import type { User } from "../lib/user";

// The frontend's only entry point for the user. It never imports firebase/auth
// and never branches on where the data lives — it just reads `user` and, when
// syncStatus is "local", shows the "Enable sync" affordance wired to enableSync.
export interface UseUser {
  user: User | null;
  /** null while the opt-in sign-in is in flight. */
  syncing: boolean | null;
  enableSync: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useUser(): UseUser {
  const service = getUserService();
  const [user, setUser] = useState<User | null>(service.getUser());
  const [syncing, setSyncing] = useState<boolean | null>(null);

  useEffect(() => service.onUserChange(setUser), [service]);

  const run = (fn: () => Promise<User>) => async () => {
    setSyncing(true);
    try {
      await fn();
    } finally {
      setSyncing(false);
    }
  };

  return {
    user,
    syncing,
    enableSync: run(() => service.enableSync()),
    linkGoogle: run(() => service.linkGoogle()),
    signOut: run(() => service.signOut()),
  };
}
