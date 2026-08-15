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
