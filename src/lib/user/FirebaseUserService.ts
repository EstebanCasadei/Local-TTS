import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut as fbSignOut,
  type Auth,
  type User as FbUser,
} from "firebase/auth";
import type { MergeSnapshot, User } from "../../types";
import type { UserService } from "./UserService";

function toUser(fbUser: FbUser): User {
  return {
    uid: fbUser.uid,
    displayName: fbUser.displayName ?? fbUser.email ?? null,
    isAnonymous: fbUser.isAnonymous,
    syncStatus: "synced",
  };
}

// The opt-in strategy, activated by the facade once the user enables sync.
// Construction is cheap; it wires onAuthStateChanged. enableSync performs the
// first anonymous sign-in. linkGoogle handles the credential-already-in-use
// collision by awaiting any registered beforeMerge snapshot (so #18 can copy
// the soon-to-be-inaccessible anonymous uid's data) BEFORE switching accounts.
export class FirebaseUserService implements UserService {
  private user: User | null = null;
  private readonly listeners = new Set<(u: User) => void>();
  private readonly auth: Auth;
  // Fired (and awaited) before a credential-collision account switch, so #18
  // can snapshot from fromUid → toUid while the old path is still readable.
  private readonly beforeMerge: (e: MergeSnapshot) => Promise<void>;

  constructor(auth: Auth, beforeMerge: (e: MergeSnapshot) => Promise<void> = async () => {}) {
    this.auth = auth;
    this.beforeMerge = beforeMerge;
    onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        this.user = toUser(fbUser);
        this.emit();
      }
    });
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

  /** First sign-in of the opt-in flow: anonymous session. */
  async enableSync(): Promise<User> {
    if (!this.auth.currentUser) {
      await signInAnonymously(this.auth);
    }
    const fbUser = this.auth.currentUser;
    if (!fbUser) throw new Error("enableSync: no Firebase user after sign-in");
    this.user = toUser(fbUser);
    this.emit();
    return this.user;
  }

  /** Link Google to the anonymous account (uid preserved on success). */
  async linkGoogle(): Promise<User> {
    const provider = new GoogleAuthProvider();
    const current = this.auth.currentUser;
    if (!current) {
      await signInWithPopup(this.auth, provider);
    } else {
      try {
        await linkWithPopup(current, provider);
      } catch (err) {
        if ((err as { code?: string }).code !== "auth/credential-already-in-use") throw err;
        // That Google account already exists with its own books. After switching
        // we can no longer read current.uid's path, so let #18 snapshot first.
        const cred = GoogleAuthProvider.credentialFromError(
          err as Parameters<typeof GoogleAuthProvider.credentialFromError>[0],
        );
        const toUid = (err as { uid?: string }).uid;
        if (!cred || !toUid) throw err;
        await this.beforeMerge({ fromUid: current.uid, toUid });
        await signInWithCredential(this.auth, cred);
      }
    }
    const fbUser = this.auth.currentUser;
    if (!fbUser) throw new Error("linkGoogle: no Firebase user after sign-in");
    this.user = toUser(fbUser);
    this.emit();
    return this.user;
  }

  async signOut(): Promise<User> {
    await fbSignOut(this.auth);
    // The facade swaps back to LocalUserService after this; return last known
    // user so the interface contract holds (facade ignores this return).
    if (!this.user) throw new Error("signOut: no user");
    return this.user;
  }

  private emit(): void {
    const u = this.user;
    if (u) this.listeners.forEach((cb) => cb(u));
  }
}
