import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { WARP_SPEC } from "../../../src/domain/warp/spec";
import { WarpFormGuard } from "../../../src/infrastructure/warp/handlers/formGuard";

it("rejects busy players and presses inside the debounce window independently", () => {
  fc.assert(
    fc.property(
      fc.nat({ max: 100000 }),
      fc.integer({ min: 0, max: WARP_SPEC.pressDebounceTicks - 1 }),
      (tick, delta) => {
        const guard = new WarpFormGuard();
        const a = asPlayerId("a");
        const b = asPlayerId("b");
        expect(guard.tryOpen(a, tick)).toBe(true);
        expect(guard.tryOpen(a, tick + WARP_SPEC.pressDebounceTicks)).toBe(
          false,
        );
        expect(guard.tryOpen(b, tick)).toBe(true);
        guard.close(a);
        expect(guard.tryOpen(a, tick + delta)).toBe(false);
        expect(guard.tryOpen(a, tick + WARP_SPEC.pressDebounceTicks)).toBe(
          true,
        );
      },
    ),
  );
});

it("keeps overlapping placement flows busy until all finish", () => {
  const guard = new WarpFormGuard();
  const id = asPlayerId("a");
  guard.hold(id, 0);
  guard.hold(id, 0);
  guard.close(id);
  expect(guard.tryOpen(id, 100)).toBe(false);
  guard.close(id);
  expect(guard.tryOpen(id, 100)).toBe(true);
});

it("reports rejected flows and releases their guard", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const guard = new WarpFormGuard();
  const id = asPlayerId("a");
  guard.tryOpen(id, 0);
  await guard.run(id, async () => {
    throw Error("failed");
  });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("failed"));
  expect(guard.tryOpen(id, 100)).toBe(true);
  warn.mockRestore();
});
