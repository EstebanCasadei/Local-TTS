import type { User } from "../../types";

// The public contract the frontend consumes. The frontend imports this
// interface (and useUser), never firebase/auth directly — the "where is the
// data hosted" question is answered once, inside the facade.
export interface UserService {
  /** Current user, or null before first init resolves. */
  getUser(): User | null;
  /** Subscribe to user changes. Returns unsubscribe. Immediately calls back with the current user if any. */
  onUserChange(cb: (user: User) => void): () => void;
  /** The opt-in trigger. Signs in (anonymous→optional Google), emits firstSync. No-op when Firebase isn't configured. */
  enableSync(): Promise<User>;
  /** Link Google to the existing anonymous Firebase account (uid preserved). */
  linkGoogle(): Promise<User>;
  /** Sign out → returns to local-only mode. */
  signOut(): Promise<User>;
}

// Narrow storage port for the local user identity. IndexedDB-backed in
// production (defaultLocalUserStore), in-memory in tests. Keeping this as an
// interface means LocalUserService is unit-testable without IndexedDB.
export interface LocalUserStore {
  getLocalUser(): Promise<{ uid: string } | null>;
  setLocalUser(uid: string): Promise<void>;
}
