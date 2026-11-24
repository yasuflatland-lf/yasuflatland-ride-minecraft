import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import {
  adjustHeight,
  confirmLiveHeight,
  confirmTappedSpan,
  setHeight,
} from "../../../src/domain/build/flow/heightFlow";
import { beginPasteAim } from "../../../src/domain/build/flow/paste";
import {
  chooseStairs,
  fixStairGoal,
} from "../../../src/domain/build/flow/stairFlow";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import {
  stepBackSelection,
  withoutStepBack,
} from "../../../src/domain/build/flow/stepBack";
import { chooseTerrain } from "../../../src/domain/build/flow/terrainFlow";
import { staircaseToward } from "../../../src/domain/build/stairs/staircase";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { OVERWORLD_RANGE } from "../../helpers/buildHeightRange";
import {
  chooseHeightedFlow,
  tapAir,
  tapBlock,
} from "../../support/buildSelection";

const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const material = blockStateOf("minecraft:stone");
const dimension = asDimensionId("minecraft:nether");

it("reverses every fresh end tap to the exact original first point", () => {
  fc.assert(
    fc.property(cell, cell, (start, end) => {
      const point = tapBlock({ kind: "idle" }, dimension, start, material);
      const flow = tapAir(point, end);
      const result = stepBackSelection(flow);
      expect(result).toEqual({ flow: point, cleared: "end" });
      expect(result?.flow).toBe(point);
      expect(stepBackSelection(point)).toEqual({
        flow: { kind: "idle" },
        cleared: "start",
      });
      const stripped = withoutStepBack(flow);
      expect(stripped).not.toHaveProperty("stepBackTo");
      expect(withoutStepBack(stripped)).toBe(stripped);
      expect(stepBackSelection(stripped)).toBeUndefined();
      expect(stepBackSelection(withoutStepBack(point))).toEqual(
        stepBackSelection(point),
      );
    }),
  );
});

it("does not step back confirmed heights, adjusted heights or operation flows", () => {
  fc.assert(
    fc.property(cell, fc.integer({ min: 1, max: 20 }), (start, size) => {
      const point = tapBlock({ kind: "idle" }, dimension, start, material);
      const base = tapAir(point, {
        ...start,
        x: start.x + size,
        z: start.z + size,
      });
      expect(base.kind).toBe("baseHeight");
      if (base.kind !== "baseHeight") throw new Error("Expected base height");
      const selected = confirmLiveHeight(base);
      const line = tapAir(point, { ...start, x: start.x + size });
      const stairAim = chooseStairs(line, "stairs");
      if (stairAim.kind !== "stairAim") throw new Error("Expected stair aim");
      const stairs = staircaseToward(stairAim.row, {
        ...start,
        y: start.y + 2,
        z: start.z + 3,
      });
      if (!stairs) throw new Error("Expected staircase");
      const flows: BuildFlow[] = [
        { kind: "idle" },
        beginPasteAim(),
        selected,
        confirmTappedSpan(base, OVERWORLD_RANGE),
        adjustHeight(selected, OVERWORLD_RANGE),
        chooseHeightedFlow(selected, "gable"),
        chooseTerrain(selected, "fillBelow"),
        stairAim,
        fixStairGoal(stairAim, stairs),
      ];
      for (const flow of flows) expect(stepBackSelection(flow)).toBeUndefined();
      expect(stepBackSelection(setHeight(base, size))?.flow).toBe(point);
    }),
  );
});
