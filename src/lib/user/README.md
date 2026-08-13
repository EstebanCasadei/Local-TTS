# `lib/user` — User identity & sync opt-in

One `User`, one entry point. The frontend never imports `firebase/auth` and never
branches on where the data lives. The "local-first vs synced" complexity lives
behind a facade.

## Pattern

Strategy + Facade:

- **`UserService`** — the public interface the frontend depends on.
- **`LocalUserService`** — zero-network strategy. UUID in IndexedDB. Default at
  startup and after sign-out.
- **`FirebaseUserService`** — opt-in strategy. Anonymous → Google link, activated
  only when the user enables sync.
- **`UserServiceFacade`** — holds `LocalUserService` at startup, swaps to
  `FirebaseUserService` on `enableSync()`, swaps back on `signOut()`. Owns the
  sync-coordination events.

```
Frontend ──> useUser() ──> UserServiceFacade ──> LocalUserService  (default)
                                          └──> FirebaseUserService (after opt-in)
```

## Public API

### Frontend (React)

```ts
import { useUser } from "@/hooks/useUser";

function SettingsScreen() {
  const { user, enableSync, linkGoogle, signOut, syncing } = useUser();

  if (!user) return <Loading />;

  return (
    <>
      <p>UID: {user.uid}</p>
      {user.displayName && <p>{user.displayName}</p>}

      {/* Show only when local — the opt-in affordance. */}
      {user.syncStatus === "local" && (
        <button onClick={enableSync} disabled={syncing}>
          Enable cloud sync
        </button>
      )}

      {/* After opt-in: anonymous user can link Google to preserve their uid. */}
      {user.syncStatus === "synced" && user.isAnonymous && (
        <button onClick={linkGoogle}>Sign in with Google</button>
      )}

      {user.syncStatus === "synced" && (
        <button onClick={signOut}>Sign out</button>
      )}
    </>
  );
}
```

### Data layer / #18 (sync subscription)

```ts
import { onFirstSync, onBeforeMerge } from "@/lib/user";

// Fires once when the user opts in: backfill local data into Firestore.
onFirstSync(({ localUid, firebaseUid }) => {
  backfill(localUid, firebaseUid);
});

// Fires (and is awaited) before a credential-collision account switch — after
// the switch, firestore rules block reads of fromUid's path, so copy first.
onBeforeMerge(async ({ fromUid, toUid }) => {
  await copyBooks(fromUid, toUid);
});
```

### Direct service access (non-React)

```ts
import { getUserService } from "@/lib/user";

const svc = getUserService();
const user = svc.getUser();
const unsub = svc.onUserChange((u) => console.log(u));
```

## The `User` shape

```ts
interface User {
  uid: string; // local UUID, or Firebase auth uid after opt-in
  displayName: string | null; // null until Google is linked
  isAnonymous: boolean; // true for local AND Firebase-anonymous users
  syncStatus: "local" | "synced";
}
```

`syncStatus` is for **UI affordances and sync triggers only** — not for read-path
branching. Code that keys data by `user.uid` works identically in both modes.

## The local-first opt-in guarantee

- **On launch:** facade constructs `LocalUserService` → reads/generates a UUID
  from IndexedDB. No Firebase import on the hot path, no network call.
- **On `enableSync()`:** swaps to `FirebaseUserService`, runs
  `signInAnonymously()`, emits `firstSync({ localUid, firebaseUid })`.
- **On `linkGoogle()` collision:** awaits `beforeMerge` so #18 can copy the
  soon-to-be-inaccessible anonymous uid's data _before_ the account switch.
- **On `signOut()`:** swaps back to `LocalUserService`; local data retained.

The gate is the **user's opt-in action**, not the presence of env vars. When
Firebase env vars are absent, `enableSync` is a no-op and the sync affordance
stays hidden — but the app still works fully offline.

## Files

| File                     | Role                                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| `types.ts`               | `User`, `SyncStatus`, `FirstSyncEvent`, `MergeSnapshot`              |
| `UserService.ts`         | The public interface + `LocalUserStore` port                         |
| `LocalUserService.ts`    | Local-first strategy (UUID in IndexedDB, no-op sync)                 |
| `FirebaseUserService.ts` | Opt-in strategy (anonymous → Google link)                            |
| `facade.ts`              | Strategy swap + sync-coordination events                             |
| `index.ts`               | Singleton, `getUserService()`, `onFirstSync`, `onBeforeMerge`        |
| `../localDb.ts`          | Reusable IndexedDB key-value store (user identity + future metadata) |
| `../../hooks/useUser.ts` | React hook — the frontend's only entry point                         |

## Testing

- `LocalUserService.test.ts` — uid generation/persistence/reuse, idempotent init,
  no-op sync methods. Uses an in-memory `LocalUserStore` (no IndexedDB needed).
- `facade.test.ts` — local user after init, `enableSync` no-op + no `firstSync`
  when unconfigured, `signOut` round-trip. Mocks `../firebase` to force the
  unconfigured path so no live Firebase calls occur.
- Firebase auth round-trip: `pnpm verify:firebase` (existing smoke test).
