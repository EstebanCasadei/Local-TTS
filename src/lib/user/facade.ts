import { firebaseConfigured, getFirebase } from "../firebase";
import type { FirstSyncEvent, MergeSnapshot, User } from "../../types";
import type { LocalUserStore, UserService } from "./UserService";
import { LocalUserService, defaultLocalUserStore } from "./LocalUserService";
import { FirebaseUserService } from "./FirebaseUserService";

// The only thing the frontend imports. Holds a LocalUserService at startup
// (zero network), and swaps to FirebaseUserService when the user opts into
// sync. Owns the sync-coordination events (firstSync / beforeMerge) so #17
// stays about identity + triggers while #18 stays about data.
export class UserServiceFacade implements UserService {
  private active: UserService;
  private currentSub: (() => void) | null = null;
  private readonly userListeners = new Set<(u: User) => void>();
  private readonly firstSyncListeners = new Set<(e: FirstSyncEvent) => void>();
  private readonly beforeMergeListeners = new Set<(e: MergeSnapshot) => Promise<void>>();
  private localUid: string | null = null;
  private readonly localStore: LocalUserStore;

  // The store is injectable so the facade is unit-testable without IndexedDB
  // (jsdom has none). Production uses the IndexedDB-backed defaultLocalUserStore.
  constructor(localStore: LocalUserStore = defaultLocalUserStore) {
    this.localStore = localStore;
    this.active = new LocalUserService(localStore);
    // LocalUserService.init is async (IndexedDB); subscribe once it resolves.
    (this.active as LocalUserService).init().then((u) => {
      this.localUid = u.uid;
      this.currentSub = this.active.onUserChange((user) => this.emit(user));
    });
  }

  getUser(): User | null {
    return this.active.getUser();
  }

  onUserChange(cb: (user: User) => void): () => void {
    this.userListeners.add(cb);
    const u = this.getUser();
    if (u) cb(u);
    return () => {
      this.userListeners.delete(cb);
    };
  }

  onFirstSync(cb: (e: FirstSyncEvent) => void): () => void {
    this.firstSyncListeners.add(cb);
    return () => {
      this.firstSyncListeners.delete(cb);
    };
  }

  onBeforeMerge(cb: (e: MergeSnapshot) => Promise<void>): () => void {
    this.beforeMergeListeners.add(cb);
    return () => {
      this.beforeMergeListeners.delete(cb);
    };
  }

  async enableSync(): Promise<User> {
    const local = this.active;
    if (!firebaseConfigured) {
      // Sync unavailable — local-only forever. Keep the local user.
      return local.getUser() ?? (await (local as LocalUserService).init());
    }
    const fb = getFirebase();
    if (!fb || !this.localUid)
      throw new Error("enableSync: Firebase missing or local uid not ready");
    const localUid = this.localUid;

    this.currentSub?.();
    const fbService = new FirebaseUserService(fb.auth, (e) => this.runBeforeMerge(e));
    this.active = fbService;
    this.currentSub = fbService.onUserChange((user) => this.emit(user));

    const user = await fbService.enableSync();
    // Backfill trigger for #18: copy local data into the new Firebase uid.
    this.firstSyncListeners.forEach((cb) => cb({ localUid, firebaseUid: user.uid }));
    return user;
  }

  async linkGoogle(): Promise<User> {
    return this.active.linkGoogle();
  }

  async signOut(): Promise<User> {
    await this.active.signOut().catch(() => {});
    // Swap back to local-only mode; local data is retained.
    this.currentSub?.();
    const local = new LocalUserService(this.localStore);
    this.active = local;
    await local.init();
    this.localUid = local.getUser()!.uid;
    this.currentSub = local.onUserChange((user) => this.emit(user));
    return local.getUser()!;
  }

  private async runBeforeMerge(e: MergeSnapshot): Promise<void> {
    await Promise.all(Array.from(this.beforeMergeListeners, (cb) => cb(e)));
  }

  private emit(user: User): void {
    this.userListeners.forEach((cb) => cb(user));
  }
}
