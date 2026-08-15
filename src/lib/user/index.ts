import type { FirstSyncEvent, MergeSnapshot } from "./types";
import type { UserService } from "./UserService";
import { UserServiceFacade } from "./facade";

// Public API (frontend + #18):
//   useUser()                       — React hook (frontend)
//   getUserService()                — the singleton facade (#18 subscribes)
//   onFirstSync / onBeforeMerge     — sync-coordination events (#18)
//
// The singleton is created once and shared, so the frontend's useUser and
// #18's data layer see the same user transitions.

export type { User, SyncStatus } from "../../types/user.ts";
export type { FirstSyncEvent, MergeSnapshot } from "./types";
export type { UserService, LocalUserStore } from "./UserService";
export type { UserServiceFacade } from "./facade";

let _service: UserServiceFacade | null = null;

export function getUserService(): UserServiceFacade {
  if (!_service) _service = new UserServiceFacade();
  return _service;
}

/** #18 subscribes to backfill local data after opt-in. Returns unsubscribe. */
export function onFirstSync(cb: (e: FirstSyncEvent) => void): () => void {
  return getUserService().onFirstSync(cb);
}

/** #18 subscribes to snapshot a credential-collision merge before the uid switch. */
export function onBeforeMerge(cb: (e: MergeSnapshot) => Promise<void>): () => void {
  return getUserService().onBeforeMerge(cb);
}

// Convenience type guard for callers that only need the base interface.
export function asUserService(): UserService {
  return getUserService();
}
