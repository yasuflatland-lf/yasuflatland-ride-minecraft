import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { registerLaidBlockGuard } from "../../../src/infrastructure/shared/laidBlockGuard";

const { subscribe } = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: { beforeEvents: { playerBreakBlock: { subscribe } } },
}));

it("subscribes once and cancels only owned blocks without undoing cancellation", () => {
  fc.assert(
    fc.property(
      fc.option(fc.string(), { nil: undefined }),
      fc.boolean(),
      (owner, cancelled) => {
        subscribe.mockClear();
        const lookup = vi.fn(() => owner);
        registerLaidBlockGuard(lookup);
        expect(subscribe).toHaveBeenCalledTimes(1);
        const handler = subscribe.mock.calls[0]?.[0];
        const ev = {
          dimension: { id: "overworld" },
          block: { location: { x: 1, y: 64, z: 2 }, typeId: "test:a" },
          cancel: cancelled,
        };
        handler(ev);
        expect(lookup).toHaveBeenCalledExactlyOnceWith(
          asDimensionId(ev.dimension.id),
          ev.block.location,
          ev.block.typeId,
        );
        expect(ev.cancel).toBe(owner !== undefined || cancelled);
      },
    ),
  );
});
