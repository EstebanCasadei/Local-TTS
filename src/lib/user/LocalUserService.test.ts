import { describe, it, expect } from "vitest";
import { LocalUserService } from "./LocalUserService";
import type { LocalUserStore } from "./UserService";

// In-memory store so LocalUserService is tested without IndexedDB (jsdom has
// none). Validates the same contract the IndexedDB-backed store implements.
function memoryStore(): LocalUserStore {
  let stored: { uid: string } | null = null;
  return {
    async getLocalUser() {
      return stored;
    },
    async setLocalUser(uid) {
      stored = { uid };
    },
  };
}

describe("LocalUserService", () => {
  it("is null before init resolves", () => {
    const svc = new LocalUserService(memoryStore());
    expect(svc.getUser()).toBeNull();
  });

  it("generates and persists a uid on first init", async () => {
    const store = memoryStore();
    const svc = new LocalUserService(store);
    const user = await svc.init();
    expect(user.uid).toMatch(/^[0-9a-f-]{36}$/); // UUID v4
    expect(user.isAnonymous).toBe(true);
    expect(user.syncStatus).toBe("local");
    expect(user.displayName).toBeNull();
    // Persisted so a new service with the same store reuses it.
    const again = new LocalUserService(store);
    const reused = await again.init();
    expect(reused.uid).toBe(user.uid);
  });

  it("reuses the persisted uid across instances", async () => {
    const store = memoryStore();
    const first = await new LocalUserService(store).init();
    const second = await new LocalUserService(store).init();
    expect(second.uid).toBe(first.uid);
  });

  it("init is idempotent within one instance", async () => {
    const svc = new LocalUserService(memoryStore());
    const a = await svc.init();
    const b = await svc.init();
    expect(a.uid).toBe(b.uid);
  });

  it("onUserChange fires with the user and unsubscribes", async () => {
    const svc = new LocalUserService(memoryStore());
    const seen: string[] = [];
    const unsub = svc.onUserChange((u) => seen.push(u.uid));
    await svc.init();
    expect(seen).toHaveLength(1);
    unsub();
    // A second init would emit again, but we've unsubscribed.
    await svc.init();
    expect(seen).toHaveLength(1);
  });

  it("enableSync/linkGoogle/signOut are no-ops returning the local user", async () => {
    const svc = new LocalUserService(memoryStore());
    const user = await svc.init();
    await expect(svc.enableSync()).resolves.toEqual(user);
    await expect(svc.linkGoogle()).resolves.toEqual(user);
    await expect(svc.signOut()).resolves.toEqual(user);
    expect(svc.getUser()?.syncStatus).toBe("local");
  });
});
