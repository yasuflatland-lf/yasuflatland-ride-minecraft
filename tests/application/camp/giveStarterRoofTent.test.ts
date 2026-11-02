import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { GiveStarterRoofTent } from "../../../src/application/camp/giveStarterRoofTent";
import type { RoofTentStarterWorld } from "../../../src/application/camp/ports/roofTentStarter";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";

class FakeWorld implements RoofTentStarterWorld {
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

describe("GiveStarterRoofTent (ADR 0200)", () => {
  it("gives each player once on their first Survival join across any join sequence", () => {
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
          const starter = new GiveStarterRoofTent(world);
          const expected = new Set<string>();
          for (const join of joins) {
            const id = asPlayerId(join.id);
            if (join.creative) world.creative.add(id);
            else world.creative.delete(id);
            const shouldGive = !join.creative && !expected.has(id);
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
  });

  it("gives Creative nothing and leaves them eligible for a later Survival join", () => {
    const world = new FakeWorld();
    const starter = new GiveStarterRoofTent(world);
    world.creative.add(player);
    expect(starter.execute(player)).toBe(false);
    expect(world.calls).toEqual([]);
    expect(world.flags.has(player)).toBe(false);
    world.creative.delete(player);
    expect(starter.execute(player)).toBe(true);
  });

  it("gives one item on the first Survival join and marks it before later joins", () => {
    const world = new FakeWorld();
    const starter = new GiveStarterRoofTent(world);
    expect(starter.execute(player)).toBe(true);
    expect(world.flags.has(player)).toBe(true);
    expect(starter.execute(player)).toBe(false);
    expect(world.calls).toEqual(["give:p", "mark:p"]);
  });

  it("gives an existing player with no flag one item", () => {
    const world = new FakeWorld();
    expect(world.flags.has(player)).toBe(false);
    expect(new GiveStarterRoofTent(world).execute(player)).toBe(true);
    expect(world.calls).toEqual(["give:p", "mark:p"]);
  });

  it("leaves the flag unset when giving throws and retries on the next join", () => {
    const world = new FakeWorld();
    const starter = new GiveStarterRoofTent(world);
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
    expect(new GiveStarterRoofTent(world).execute(player)).toBe(false);
    expect(world.calls).toEqual([]);
    expect(world.flags.has(player)).toBe(false);
  });
});
