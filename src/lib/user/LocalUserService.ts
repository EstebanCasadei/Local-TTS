import type { User } from "../../types/user.ts";
import type { LocalUserStore, UserService } from "./UserService";
import { kvGet, kvSet } from "../localDb";

const LOCAL_USER_KEY = "local-user";

// IndexedDB-backed store. Lives in IndexedDB (not localStorage) so it shares
// durability semantics with the rest of the local-first data layer (#6 audio in
// OPFS, book metadata coming later) and survives the same lifecycle.
export const defaultLocalUserStore: LocalUserStore = {
  async getLocalUser() {
    return (await kvGet<{ uid: string }>(LOCAL_USER_KEY)) ?? null;
  },
  async setLocalUser(uid) {
    await kvSet(LOCAL_USER_KEY, { uid });
  },
};

// The default, zero-network strategy. Generates a UUID on first run, persists
// it, and reuses it across sessions. enableSync/linkGoogle/signOut are no-ops
// here — the facade intercepts those and swaps to FirebaseUserService. This
// class only exists to give the app a stable identity before opt-in and to be
// the fallback after sign-out.
export class LocalUserService implements UserService {
  private user: User | null = null;
  private readonly listeners = new Set<(u: User) => void>();
  private initPromise: Promise<User> | null = null;
  private readonly store: LocalUserStore;

  constructor(store: LocalUserStore = defaultLocalUserStore) {
    this.store = store;
  }

  /** Loads (or generates) the local uid. Idempotent. Called once by the facade. */
  init(): Promise<User> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const record = await this.store.getLocalUser();
      let uid = record?.uid;
      if (!uid) {
        uid = crypto.randomUUID();
        await this.store.setLocalUser(uid);
      }
      this.user = { uid, displayName: null, isAnonymous: true, syncStatus: "local" };
      this.emit();
      return this.user;
    })();
    return this.initPromise;
  }

  getUser(): User | null {
    return this.user;
  }

  onUserChange(cb: (user: User) => void): () => void {
    this.listeners.add(cb);
    if (this.user) cb(this.user);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // No-ops: the facade handles the real opt-in flow. Kept on the interface so
  // the facade can delegate generically when Firebase isn't configured.
  async enableSync(): Promise<User> {
    return this.requireUser();
  }
  async linkGoogle(): Promise<User> {
    return this.requireUser();
  }
  async signOut(): Promise<User> {
    return this.requireUser();
  }

  private requireUser(): User {
    if (!this.user) throw new Error("LocalUserService used before init()");
    return this.user;
  }

  private emit(): void {
    // Capture into a local: inside the forEach callback, TS can't narrow
    // this.user (a property could change between the guard and the call).
    const u = this.user;
    if (u) this.listeners.forEach((cb) => cb(u));
  }
}
