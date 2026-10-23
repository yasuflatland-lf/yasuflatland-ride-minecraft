import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PitchTent } from "../../../src/application/camp/pitchTent";
import {
  type PitchRefusal,
  type TentPose,
  tentClearCells,
  tentPose,
} from "../../../src/domain/camp/tent";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { FakeTentWorld, fineSurvey } from "./fakeTentWorld";

const DIM = asDimensionId("overworld");
const PLAYER = asPlayerId("p");
const CLICKED = { x: 10, y: 63, z: -4 };
const cmd = {
  playerId: PLAYER,
  dimensionId: DIM,
  clicked: CLICKED,
  yaw: 30,
  slot: 2,
};
const POSE = tentPose(CLICKED, 30);

const REFUSALS: [
  PitchRefusal,
  (pose: TentPose) => ReturnType<typeof fineSurvey>,
][] = [
  ["limit", (p) => ({ ...fineSurvey(p), tents: 4 })],
  ["vehicle", (p) => ({ ...fineSurvey(p), vehicleSpace: true })],
  ["crowded", (p) => ({ ...fineSurvey(p), occupants: 1 })],
  [
    "blocked",
    (p) => ({
      ...fineSurvey(p),
      clear: fineSurvey(p).clear.map((t, i) =>
        i === 5 ? "minecraft:stone" : t,
      ),
    }),
  ],
  [
    "ground",
    (p) => ({
      ...fineSurvey(p),
      ground: fineSurvey(p).ground.map((g, i) => (i === 5 ? undefined : g)),
    }),
  ],
];

describe("PitchTent (ADR 0131)", () => {
  it("takes the item outside Creative, clears the decorations top first, then pitches once", () => {
    const world = new FakeTentWorld();
    const cells = tentClearCells(POSE);
    world.surveyOf = (p) => ({
      ...fineSurvey(p),
      clear: fineSurvey(p).clear.map((t, i) =>
        i === 0 || i === 3 ? "minecraft:short_grass" : t,
      ),
    });
    expect(new PitchTent(world).execute(cmd)).toBe(true);
    expect(world.calls).toEqual([
      ["consumeTentItem", PLAYER, 2],
      ["clearDecorations", [cells[3], cells[0]]],
      ["pitch", POSE],
    ]);
  });

  it("takes nothing in Creative", () => {
    const world = new FakeTentWorld();
    world.creative = true;
    expect(new PitchTent(world).execute(cmd)).toBe(true);
    expect(world.names()).toEqual(["clearDecorations", "pitch"]);
  });

  it("keeps the item, pitches nothing, and shows the reason of each refusal", () => {
    for (const [reason, survey] of REFUSALS) {
      const world = new FakeTentWorld();
      world.surveyOf = survey;
      expect(new PitchTent(world).execute(cmd)).toBe(false);
      expect(world.calls).toEqual([["showPitchRefusal", PLAYER, reason]]);
    }
  });

  it("does nothing, silently, when the slot lost the item", () => {
    const world = new FakeTentWorld();
    world.consumeResult = false;
    expect(new PitchTent(world).execute(cmd)).toBe(false);
    expect(world.names()).toEqual(["consumeTentItem"]);
  });

  it("gives the item back when the spawn fails", () => {
    const world = new FakeTentWorld();
    world.pitchResult = undefined;
    expect(new PitchTent(world).execute(cmd)).toBe(false);
    expect(world.names()).toEqual([
      "consumeTentItem",
      "clearDecorations",
      "pitch",
      "giveTentItem",
    ]);
  });

  it("pitches from the test event without taking an item or showing a message", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom(...REFUSALS),
        (fails, [, survey]) => {
          const world = new FakeTentWorld();
          if (fails) world.surveyOf = survey;
          world.pitchResult = undefined;
          const { playerId: _, ...test } = cmd;
          expect(new PitchTent(world).execute(test)).toBe(false);
          expect(world.names()).toEqual(
            fails ? [] : ["clearDecorations", "pitch"],
          );
        },
      ),
    );
    const world = new FakeTentWorld();
    const { playerId: _, ...test } = cmd;
    expect(new PitchTent(world).execute(test)).toBe(true);
    expect(world.names()).toEqual(["clearDecorations", "pitch"]);
  });

  it("leaves a press on our own blocks to the block", () => {
    const world = new FakeTentWorld();
    world.ownBlocks.add("10,63,-4");
    const pitch = new PitchTent(world);
    expect(pitch.accepts(DIM, CLICKED)).toBe(false);
    expect(pitch.accepts(DIM, { ...CLICKED, x: 11 })).toBe(true);
  });
});
