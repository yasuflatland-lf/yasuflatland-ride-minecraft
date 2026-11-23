import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { cornerMarkerPoints } from "../../../src/domain/build/cornerMarker";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import { previewPoints } from "../../../src/domain/build/preview/preview";
import { selectionOf } from "../../../src/domain/build/selection";
import { tapTargetCell } from "../../../src/domain/build/tapTarget";
import { asDimensionId } from "../../../src/domain/shared/ids";

const coord = fc.integer({ min: -32, max: 32 });
const cell = fc.record({ x: coord, y: coord, z: coord });
const aim = fc.option(cell, { nil: undefined });
const dimensionId = asDimensionId("minecraft:overworld");
const material = blockStateOf("minecraft:stone");

it("follows the aimed end at point one and the fixed end at either menu level and during height adjustment", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      aim,
      fc.boolean(),
      (from, other, aimedEnd, coincident) => {
        const to = coincident ? from : other;
        const baseBox = boxOf(from, to);
        const fixed = {
          from,
          to,
          selection: selectionOf(dimensionId, baseBox, material),
        };
        const flows: BuildFlow[] = [
          { kind: "point1", cell: from, dimensionId, material },
          { kind: "baseHeight", ...fixed, baseBox, previous: 5 },
          { kind: "selected", ...fixed, menuLevel: "root" },
          { kind: "selected", ...fixed, menuLevel: "build" },
        ];
        for (const flow of flows) {
          const target = tapTargetCell(flow, aimedEnd);
          expect(target).toEqual(flow.kind === "point1" ? aimedEnd : to);
          const { endMarker, sharedMarker } = previewPoints(flow, {
            end: aimedEnd,
            blink: true,
          });
          expect([...endMarker, ...sharedMarker]).toEqual(
            target ? cornerMarkerPoints(target) : [],
          );
        }
      },
    ),
  );
});

it("has no tap target in the remaining flows, even with an aimed cell", () => {
  fc.assert(
    fc.property(cell, cell, aim, (from, to, aimedEnd) => {
      const base = boxOf(from, to);
      const row = { y: from.y, along: undefined, min: from, max: from };
      const stairs = {
        op: "stairs" as const,
        dimensionId,
        material,
        selectionBefore: base,
        taps: { from, to: from },
      };
      const flows: BuildFlow[] = [
        { kind: "idle" },
        { kind: "pasteAim", manualTurn: 0 },
        {
          kind: "heightStep",
          dimensionId,
          material,
          from,
          to: base.max,
          base,
          previous: 1,
          heightedKind: "hip",
          heightLocked: false,
        },
        {
          kind: "terrainConfirm",
          from,
          to,
          selection: selectionOf(dimensionId, base, material),
          op: "removeAbove",
        },
        { kind: "stairAim", ...stairs, row },
        {
          kind: "stairContents",
          ...stairs,
          staircase: { row, toward: "north", run: 1, rise: 1 },
        },
      ];
      for (const flow of flows)
        expect(tapTargetCell(flow, aimedEnd)).toBeUndefined();
    }),
  );
});
