import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  beginRotateMode,
  turnRotateMode,
} from "../../../src/domain/build/flow/rotateMode";
import {
  degreesOf,
  type QuarterTurn,
} from "../../../src/domain/build/rotation/quarterTurn";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { asDimensionId } from "../../../src/domain/shared/ids";

const coordinate = fc.integer({ min: -1000, max: 1000 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const turn = fc.integer({ min: 0, max: 3 }).map((n) => n as QuarterTurn);

it("preserves box after two turns and restores the full mode after four turns", () => {
  fc.assert(
    fc.property(cell, cell, turn, (a, b, initialTurn) => {
      const box = boxOf(a, b);
      const initial = beginRotateMode(
        asDimensionId("overworld"),
        box,
        blockStateOf("minecraft:stone"),
        initialTurn,
      );
      let mode = initial;
      for (let step = 1; step <= 4; step++) {
        const previous = mode;
        mode = turnRotateMode(mode, planRotationAboutCenter(mode.box).target);
        expect(mode).not.toBe(previous);
        expect(previous.turn).toBe((initialTurn + step - 1) % 4);
        expect(degreesOf(mode.turn)).toBe(((initialTurn + step) * 90) % 360);
        if (step % 2 === 0) expect(mode.box).toEqual(box);
      }
      expect(mode).toEqual(initial);
    }),
  );
});
