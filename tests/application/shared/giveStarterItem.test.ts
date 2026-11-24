import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { GiveStarterItem } from "../../../src/application/shared/giveStarterItem";
import type { StarterItemWorld } from "../../../src/application/shared/ports/starterItem";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";

class FakeWorld implements StarterItemWorld {
  readonly flags = new Set<PlayerId>();
  readonly creative = new Set<PlayerId>();
  readonly calls: string[] = [];
  isCreative(id: PlayerId): boolean {
    return this.creative.has(id);
  }
  received(id: PlayerId): boolean | undefined {
    return this.flags.has(id);
  }
  give(id: PlayerId): void {
    this.calls.push(`give:${id}`);
  }
  markReceived(id: PlayerId): void {
    this.calls.push(`mark:${id}`);
    this.flags.add(id);
  }
}
const player = asPlayerId("p");

describe("GiveStarterItem (ADRs 0023 and 0200)", () => {
  it.each([undefined, { skipCreative: true }, { skipCreative: false }])(
    "gives each player once on their first eligible join (options: %j)",
    (options) => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.constantFrom("a", "b", "c"),
              creative: fc.boolean(),
            }),
            { maxLength: 50 },
          ),
          (joins) => {
            const world = new FakeWorld();
            const starter = new GiveStarterItem(world, options);
            const expected = new Set<string>();
            for (const join of joins) {
              const id = asPlayerId(join.id);
              if (join.creative) world.creative.add(id);
              else world.creative.delete(id);
              const eligible =
                !join.creative || options?.skipCreative === false;
              const shouldGive = eligible && !expected.has(id);
              expect(starter.execute(id)).toBe(shouldGive);
              if (shouldGive) expected.add(id);
              expect([...world.flags]).toEqual([...expected]);
            }
            expect(world.calls).toEqual(
              [...expected].flatMap((id) => [`give:${id}`, `mark:${id}`]),
            );
          },
        ),
      );
    },
  );

  it("leaves the flag unset when giving throws and retries on the next join", () => {
    const world = new FakeWorld();
    const starter = new GiveStarterItem(world);
    vi.spyOn(world, "give").mockImplementationOnce(() => {
      throw new Error("inventory unavailable");
    });
    expect(() => starter.execute(player)).toThrow("inventory unavailable");
    expect(world.flags.has(player)).toBe(false);
    expect(world.calls).toEqual([]);
    expect(starter.execute(player)).toBe(true);
    expect(world.calls).toEqual(["give:p", "mark:p"]);
  });

  it("skips an unresolved player without marking them", () => {
    const world = new FakeWorld();
    vi.spyOn(world, "received").mockReturnValue(undefined);
    expect(new GiveStarterItem(world).execute(player)).toBe(false);
    expect(world.calls).toEqual([]);
    expect(world.flags.has(player)).toBe(false);
  });
});
