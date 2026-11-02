import type { Player } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { createExclusiveGuard } from "../../../src/infrastructure/shared/exclusiveForm";

const player = (id: string, isValid = true) => ({ id, isValid }) as Player;

it("blocks a pending player, allows another, and releases after resolution", async () => {
  const guard = createExclusiveGuard("Menu");
  const first = player("a");
  let resolve!: () => void;
  const pending = guard(
    first,
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const show = vi.fn(async () => {});
  await guard(first, show);
  expect(show).not.toHaveBeenCalled();
  await guard(player("b"), show);
  expect(show).toHaveBeenCalledTimes(1);
  resolve();
  await pending;
  await guard(first, show);
  expect(show).toHaveBeenCalledTimes(2);
});
it("never shows for an invalid player", async () => {
  const show = vi.fn(async () => {});
  await createExclusiveGuard("Menu")(player("a", false), show);
  expect(show).not.toHaveBeenCalled();
});
it.each([true, false])(
  "releases on error and warns only when valid: %s",
  async (valid) => {
    const guard = createExclusiveGuard("Menu");
    const subject = player("a");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await guard(subject, async () => {
        Object.assign(subject, { isValid: valid });
        throw new Error("unavailable");
      });
      if (valid)
        expect(warn).toHaveBeenCalledExactlyOnceWith(
          "Menu failed: Error: unavailable",
        );
      else expect(warn).not.toHaveBeenCalled();
      Object.assign(subject, { isValid: true });
      const show = vi.fn(async () => {});
      await guard(subject, show);
      expect(show).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  },
);
