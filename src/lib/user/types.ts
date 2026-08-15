// Sync-coordination events. The user shape itself lives in src/types/user.ts —
// it is consumed by the UI; these two are internal to the sync layer (#18).

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
