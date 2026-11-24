import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  confirmLiveHeight,
  setHeight,
} from "../../../src/domain/build/flow/heightFlow";
import { tapsForBox } from "../../../src/domain/build/flow/taps";
import { chooseTerrain } from "../../../src/domain/build/flow/terrainFlow";
import { BuildSession } from "../../../src/domain/build/session";
import { terrainAreaOf } from "../../../src/domain/build/terrain/area";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { tapAir } from "../../support/buildSelection";

const dim = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone", {});
const cellArb = fc.record({
  x: fc.integer({ min: -6, max: 6 }),
  y: fc.integer({ min: 55, max: 70 }),
  z: fc.integer({ min: -6, max: 6 }),
});

it("places rotated terrain taps on opposite footprint corners and preserves their height limits", () => {
  fc.assert(
    fc.property(cellArb, cellArb, cellArb, cellArb, (from, to, a, b) => {
      const box = boxOf(a, b);
      const taps = tapsForBox(box, { from, to });
      expect(taps).toEqual({
        from: { ...box.min, y: Math.min(from.y, to.y) },
        to: { ...box.max, y: Math.max(from.y, to.y) },
      });
      expect(terrainAreaOf(box, taps.from, taps.to)).toMatchObject({
        lowerY: Math.min(from.y, to.y),
        higherY: Math.max(from.y, to.y),
        minX: box.min.x,
        maxX: box.max.x,
        minZ: box.min.z,
        maxZ: box.max.z,
      });
    }),
  );
});

it("fills the pit only up to the tapped edge even after a raised live height and a repeated Fill below", () => {
  const session = new BuildSession(asPlayerId("p1"));
  const edge = { x: 0, y: 64, z: 0 };
  const pitBottom = { x: 4, y: 60, z: 4 };
  const aimed = setHeight(
    tapAir(
      {
        kind: "point1",
        start: { dimensionId: dim, cell: edge, material: stone },
      },
      pitBottom,
    ),
    7,
  );
  if (aimed.kind !== "baseHeight") throw new Error("expected live height");
  const selected = confirmLiveHeight(aimed);
  session.setFlowForTest(selected);
  expect(selected.selection.box.max.y).toBe(66);
  for (let run = 0; run < 2; run++) {
    const terrain = chooseTerrain(session.flow, "fillBelow");
    if (terrain.kind !== "terrainConfirm")
      throw new Error("Expected terrain confirmation");
    session.confirmBox(terrain.selection, "selected", terrain.taps);
    const flow = session.flow;
    if (flow.kind !== "selected") throw new Error("Expected selection");
    expect(
      terrainAreaOf(flow.selection.box, flow.taps.from, flow.taps.to).higherY,
    ).toBe(64);
  }
});
