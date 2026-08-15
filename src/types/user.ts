// The single user shape the frontend ever sees. There is no LocalUser vs
// FirebaseUser union on purpose: the frontend must not branch on where the
// identity/data lives. `syncStatus` exists only so the settings UI can show the
// "Enable sync" affordance and so #18 knows when to backfill — not for
// read-path branching.

export type SyncStatus = "local" | "synced";

export interface User {
  /** Stable identifier. Local = generated UUID; Firebase = auth uid. */
  uid: string;
  /** null until the user links Google. */
  displayName: string | null;
  /** True for local users AND Firebase anonymous users. */
  isAnonymous: boolean;
  /** "local" = data lives on this device only; "synced" = mirrors Firestore. */
  syncStatus: SyncStatus;
}

// --- Sync-coordination events (internal to the sync layer, #18) ---

// Fired once when the user opts into sync: #18 backfills local books/chunks/
// progress (keyed by localUid) into Firestore under firebaseUid.
export interface FirstSyncEvent {
  localUid: string;
  firebaseUid: string;
}

// Fired before a Google-link credential collision switches uids: the anonymous
// account is about to be abandoned for an existing Google account. After the
// switch, firestore rules block reads of the old uid's path, so #18 must
// snapshot/copy from fromUid → toUid BEFORE this resolves. The callback #18
// registers is awaited before the switch completes.
export interface MergeSnapshot {
  fromUid: string;
  toUid: string;
}
