import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { selectionOf } from "../../../src/domain/build/selection";
import { BuildSession } from "../../../src/domain/build/session";
import { type Cell, cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { OVERWORLD_RANGE } from "../../helpers/buildHeightRange";

const dimension = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone");
const origin = fc.record({
  x: fc.integer({ min: -100, max: 100 }),
  y: fc.integer({ min: 0, max: 100 }),
  z: fc.integer({ min: -100, max: 100 }),
});
const span = fc.integer({ min: 1, max: 20 });
const nonLine = fc.oneof(
  fc.constant({ x: 0, y: 0, z: 0 }),
  fc.record({ x: span, y: fc.integer({ min: 0, max: 20 }), z: span }),
  fc.record({ x: span, y: span, z: fc.constant(0) }),
  fc.record({ x: fc.constant(0), y: span, z: span }),
);
const line = fc.oneof(
  span.map((x) => ({ x, y: 0, z: 0 })),
  span.map((y) => ({ x: 0, y, z: 0 })),
  span.map((z) => ({ x: 0, y: 0, z })),
);

const corners = (offset: typeof nonLine) =>
  fc.tuple(origin, offset).map(([start, delta]) => ({
    from: cellOf(start),
    to: cellOf({
      x: start.x + delta.x,
      y: start.y + delta.y,
      z: start.z + delta.z,
    }),
  }));

function tapCorners({ from, to }: { from: Cell; to: Cell }) {
  const session = new BuildSession(asPlayerId("p1"));
  session.tapBlock(dimension, from, stone, OVERWORLD_RANGE);
  session.tapBlock(dimension, to, stone, OVERWORLD_RANGE);
  return session;
}

function openRoot(session: BuildSession) {
  return session.openSelectionMenu().map(({ id }) => id);
}

it("starts with Fill on the first root and Edit height again on the second", () => {
  fc.assert(
    fc.property(corners(nonLine), (taps) => {
      const session = tapCorners(taps);
      expect(session.confirmLiveHeight()).toBe(true);
      const first = openRoot(session);
      expect(first[0]).toBe("fill");
      expect(first).not.toContain("adjustHeight");
      expect(openRoot(session).slice(0, 2)).toEqual(["adjustHeight", "fill"]);
    }),
  );
});

it("preserves Edit height again when returning from Build shape", () => {
  fc.assert(
    fc.property(corners(nonLine), (taps) => {
      const session = tapCorners(taps);
      expect(session.confirmLiveHeight()).toBe(true);
      openRoot(session);
      expect(session.openBuildMenu()).toBe(true);
      expect(session.closeBuildMenu()).toBe(true);
      expect(openRoot(session)[0]).toBe("adjustHeight");
    }),
  );
});

it("offers Edit height again on the next root of a kept selection", () => {
  fc.assert(
    fc.property(corners(nonLine), (taps) => {
      const session = new BuildSession(asPlayerId("p1"));
      const selection = selectionOf(
        dimension,
        boxOf(taps.from, taps.to),
        stone,
      );
      session.confirmBox(selection, "selected", taps);
      expect(openRoot(session)[0]).toBe("adjustHeight");
    }),
  );
});

it("hides Edit height again on the first root after reconfirming height", () => {
  fc.assert(
    fc.property(corners(nonLine), (taps) => {
      const session = tapCorners(taps);
      expect(session.confirmLiveHeight()).toBe(true);
      openRoot(session);
      expect(openRoot(session)[0]).toBe("adjustHeight");
      expect(session.adjustHeight(OVERWORLD_RANGE)).toBe(true);
      expect(session.confirmLiveHeight()).toBe(true);
      expect(openRoot(session)).not.toContain("adjustHeight");
    }),
  );
});

it("never offers Edit height again for lines", () => {
  fc.assert(
    fc.property(corners(line), (taps) => {
      const session = tapCorners(taps);
      for (let open = 0; open < 2; open++) {
        const entries = openRoot(session);
        expect(entries[0]).toBe("fill");
        expect(entries).not.toContain("adjustHeight");
      }
    }),
  );
});
