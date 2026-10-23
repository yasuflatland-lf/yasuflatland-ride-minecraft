import { describe, expect, it } from "vitest";
import { UseTentFlap } from "../../../src/application/camp/useTentFlap";
import { FLAP_IDS } from "../../../src/domain/camp/flaps";
import { TENT_SPEC } from "../../../src/domain/camp/spec";
import { asTentId } from "../../../src/domain/camp/tent";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeTentFlapWorld } from "./fakeTentFlapWorld";

const TENT = asTentId("tent");
const PLAYER = asPlayerId("player");
const WINDOW = TENT_SPEC.flapSwingTicks;

function setup() {
  const world = new FakeTentFlapWorld();
  const flaps = world.addTent(TENT);
  return { world, flaps, use: new UseTentFlap(world) };
}

describe("UseTentFlap (ADR 0132)", () => {
  it("opens the tapped flap only", () => {
    const { flaps, use } = setup();
    expect(use.execute({ tentId: TENT, flap: "left", tick: 0 })).toBe(true);
    expect(FLAP_IDS.filter((id) => flaps.isOpen(id))).toEqual(["left"]);
  });

  it("ignores the echo of a tap within the window and shows nothing", () => {
    const { world, flaps, use } = setup();
    use.execute({ tentId: TENT, flap: "front", tick: 0, playerId: PLAYER });
    world.blocked.add("front");
    expect(
      use.execute({ tentId: TENT, flap: "front", tick: 3, playerId: PLAYER }),
    ).toBe(false);
    expect(flaps.isOpen("front")).toBe(true);
    expect(world.hints).toEqual([]);
    expect(world.blockedChecks).toEqual([]);
  });

  it("does not close on someone: tells the tapper once, and keeps the window free for the next tap", () => {
    const { world, flaps, use } = setup();
    use.execute({ tentId: TENT, flap: "bedroom", tick: 0 });
    world.blocked.add("bedroom");
    const tick = WINDOW;
    expect(
      use.execute({ tentId: TENT, flap: "bedroom", tick, playerId: PLAYER }),
    ).toBe(false);
    expect(use.execute({ tentId: TENT, flap: "bedroom", tick })).toBe(false);
    expect(world.hints).toEqual([PLAYER]);
    expect(flaps.isOpen("bedroom")).toBe(true);
    world.blocked.clear();
    expect(use.execute({ tentId: TENT, flap: "bedroom", tick: tick + 1 })).toBe(
      true,
    );
    expect(flaps.isOpen("bedroom")).toBe(false);
  });

  it("opens without asking whether someone is in the way", () => {
    const { world, use } = setup();
    world.blocked.add("right");
    expect(use.execute({ tentId: TENT, flap: "right", tick: 0 })).toBe(true);
    expect(world.blockedChecks).toEqual([]);
  });

  it("does nothing for an unknown tent", () => {
    const { use } = setup();
    expect(
      use.execute({ tentId: asTentId("gone"), flap: "front", tick: 0 }),
    ).toBe(false);
  });
});
