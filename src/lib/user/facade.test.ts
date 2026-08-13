import { describe, it, expect, vi } from "vitest";

// Force the "Firebase not configured" path so the facade stays local-only and
// makes NO network calls. Without this, the repo's real .env would make
// firebaseConfigured true and enableSync would hit the live Firebase project.
vi.mock("../firebase", () => ({
  firebaseConfigured: false,
  getFirebase: () => null,
}));

import { UserServiceFacade } from "./facade";
import type { LocalUserStore } from "./UserService";

// In-memory store so the facade is tested without IndexedDB (jsdom has none).
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

// The facade starts with a LocalUserService (zero network). When Firebase env
// vars are absent (the default test env, no .env in CI), enableSync is a no-op
// and firstSync never fires — proving the "no Firebase network call until
// opt-in" guarantee holds at the facade level too.
describe("UserServiceFacade (unconfigured — local-only)", () => {
  it("exposes a local user after init, no Firebase calls", async () => {
    const facade = new UserServiceFacade(memoryStore());
    const user = await waitForUser(facade);
    expect(user.syncStatus).toBe("local");
    expect(user.isAnonymous).toBe(true);
    expect(user.displayName).toBeNull();
  });

  it("enableSync is a no-op and does not fire firstSync when unconfigured", async () => {
    const facade = new UserServiceFacade(memoryStore());
    await waitForUser(facade);
    let fired = false;
    facade.onFirstSync(() => {
      fired = true;
    });
    const user = await facade.enableSync();
    expect(fired).toBe(false);
    expect(user.syncStatus).toBe("local");
  });

  it("signOut returns a local user (round-trips back to local)", async () => {
    const facade = new UserServiceFacade(memoryStore());
    await waitForUser(facade);
    const user = await facade.signOut();
    expect(user.syncStatus).toBe("local");
  });
});

// LocalUserService.init is async in the facade constructor; poll onUserChange.
function waitForUser(
  facade: UserServiceFacade,
): Promise<NonNullable<ReturnType<UserServiceFacade["getUser"]>>> {
  return new Promise((resolve) => {
    const u = facade.getUser();
    if (u) return resolve(u);
    facade.onUserChange((user) => resolve(user));
  });
}
