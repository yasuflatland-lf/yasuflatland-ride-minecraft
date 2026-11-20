import { describe, expect, it } from "vitest";
import { PaintRoofTent } from "../../../src/application/camp/paintRoofTent";
import { asRoofTentId } from "../../../src/domain/camp/ids";
import { FakeRoofTentWorld, PLAYER } from "./fakeRoofTentWorld";

const TENT = asRoofTentId("tent");
describe("PaintRoofTent (ADR 0031, 0036, 0037, 0076)", () => {
  it("restores variant 0 (khaki) with brown dye on a blue tent", () => {
    const world = new FakeRoofTentWorld();
    world.paints.set(TENT, "blue");
    const paintRoofTent = new PaintRoofTent(world);
    expect(
      paintRoofTent.execute({
        playerId: PLAYER,
        tentId: TENT,
        paint: "khaki",
        tick: 1,
      }),
    ).toBe(true);
    expect(world.paints.get(TENT)).toBe("khaki");
  });
});
