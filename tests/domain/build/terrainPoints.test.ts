import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import {
  adjustHeight,
  type BuildFlow,
  backToAiming,
  chooseTerrain,
  confirmLiveHeight,
  setHeight,
  tapAir,
} from "../../../src/domain/build/flow/flow";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { withBox } from "../../../src/domain/build/selection";
import { BuildSession } from "../../../src/domain/build/session";
import { terrainAreaOf } from "../../../src/domain/build/terrain/area";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

const dim = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone", {});
const cellArb = fc.record({
  x: fc.integer({ min: -6, max: 6 }),
  y: fc.integer({ min: 55, max: 70 }),
  z: fc.integer({ min: -6, max: 6 }),
});

// Each step stands for an application operation that keeps the selection:
// live height, Rotate, Place/Fill/Frame, and a terrain confirm.
const stepArb = fc.oneof(
  fc.record({
    kind: fc.constant("height" as const),
    height: fc.integer({ min: 1, max: 20 }),
  }),
  fc.record({ kind: fc.constant("rotate" as const) }),
  fc.record({ kind: fc.constant("shape" as const) }),
  fc.record({
    kind: fc.constant("terrain" as const),
    op: fc.constantFrom("fillBelow" as const, "removeAbove" as const),
  }),
);
type Step = typeof stepArb extends fc.Arbitrary<infer T> ? T : never;

function selectedFlow(
  session: BuildSession,
): Extract<BuildFlow, { kind: "selected" }> {
  const flow = session.flow;
  if (flow.kind !== "selected") throw new Error(`unexpected ${flow.kind}`);
  return flow;
}

function apply(session: BuildSession, step: Step): void {
  const flow = selectedFlow(session);
  switch (step.kind) {
    case "height": {
      const aiming = setHeight(adjustHeight(flow), step.height);
      if (aiming.kind === "baseHeight")
        session.setFlow(confirmLiveHeight(aiming));
      return;
    }
    case "rotate":
      session.replaceSelection(
        withBox(
          flow.selection,
          planRotationAboutCenter(flow.selection.box).target,
        ),
      );
      return;
    case "shape":
      session.confirmBox(flow.selection, "selected");
      return;
    case "terrain":
      session.setFlow(chooseTerrain(flow, step.op));
      session.confirmBox(flow.selection, "selected");
  }
}

it("keeps the tapped points for terrain heights and Cancel through any sequence of selection-keeping operations", () => {
  fc.assert(
    fc.property(
      cellArb,
      cellArb,
      fc.array(stepArb, { maxLength: 8 }),
      (first, second, steps) => {
        const session = new BuildSession(asPlayerId("p1"));
        const aimed = tapAir(
          { kind: "point1", dimensionId: dim, cell: first, material: stone },
          second,
        );
        session.setFlow(
          aimed.kind === "baseHeight" ? confirmLiveHeight(aimed) : aimed,
        );
        for (const step of steps) {
          apply(session, step);
          const flow = selectedFlow(session);
          const area = terrainAreaOf(flow.selection.box, flow.from, flow.to);
          expect(area.higherY).toBe(Math.max(first.y, second.y));
          expect(area.lowerY).toBe(Math.min(first.y, second.y));
          const { box } = flow.selection;
          expect(area).toMatchObject({
            minX: box.min.x,
            maxX: box.max.x,
            minZ: box.min.z,
            maxZ: box.max.z,
          });
          const back = backToAiming(chooseTerrain(flow, "fillBelow"));
          if (back.kind !== "point1") throw new Error("Cancel must aim");
          expect(back.cell).toEqual(first);
        }
      },
    ),
  );
});

it("fills the pit only up to the tapped edge even after a raised live height and a repeated Fill below", () => {
  const session = new BuildSession(asPlayerId("p1"));
  const edge = { x: 0, y: 64, z: 0 };
  const pitBottom = { x: 4, y: 60, z: 4 };
  const aimed = setHeight(
    tapAir(
      { kind: "point1", dimensionId: dim, cell: edge, material: stone },
      pitBottom,
    ),
    7,
  );
  if (aimed.kind !== "baseHeight") throw new Error("expected live height");
  session.setFlow(confirmLiveHeight(aimed));
  expect(selectedFlow(session).selection.box.max.y).toBe(66);
  for (let run = 0; run < 2; run++) {
    apply(session, { kind: "terrain", op: "fillBelow" });
    const flow = selectedFlow(session);
    expect(terrainAreaOf(flow.selection.box, flow.from, flow.to).higherY).toBe(
      64,
    );
  }
});
