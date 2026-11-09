import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DUTCH_OVEN_FOOTPRINT_PX,
  GAS_LANTERN_FOOTPRINT_PX,
} from "../../../src/domain/camp/spec";
import {
  type BeachChairPose,
  beachChairCells,
  beachChairClearCells,
  beachChairOrigin,
  beachChairPose,
  beachChairPoseAt,
  beachChairSupportCells,
  CHAIR_MENU_CHOICES,
  type ChairForm,
  type ChairState,
  canTakeBack,
  fold,
  unfold,
} from "../../../src/domain/resort/beachChair";
import { asBeachChairId } from "../../../src/domain/resort/ids";
import { BEACH_CHAIR_SPEC } from "../../../src/domain/resort/spec";
import { placeOnTop, type TopItem } from "../../../src/domain/shared/tableTop";
import { forward } from "../../../src/domain/shared/vec";

const cellArb = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -1000, max: 1000 }),
});
const yawArb = fc.double({ min: -720, max: 720, noNaN: true });
const stateArb: fc.Arbitrary<ChairState> = fc.record({
  form: fc.constantFrom<ChairForm>("chair", "table"),
  occupied: fc.boolean(),
  somethingOnTop: fc.boolean(),
});
const poseArb = fc
  .tuple(cellArb, yawArb)
  .map(([pressed, yaw]): BeachChairPose => beachChairPose(pressed, yaw));

describe("beachChairPose", () => {
  it("lays two adjacent cells above the pressed block, the head beyond the foot from the player", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        const pose = beachChairPose(pressed, yaw);
        expect(pose.foot).toEqual({
          x: pressed.x,
          y: pressed.y + 1,
          z: pressed.z,
        });
        expect(pose.head.y).toBe(pose.foot.y);
        const dx = pose.head.x - pose.foot.x;
        const dz = pose.head.z - pose.foot.z;
        expect(Math.abs(dx) + Math.abs(dz)).toBe(1);
        const toFoot = forward(pose.yaw);
        expect(dx).toBe(-Math.round(toFoot.x) || 0);
        expect(dz).toBe(-Math.round(toFoot.z) || 0);
        const facing = forward(yaw);
        expect(dx * facing.x + dz * facing.z).toBeGreaterThanOrEqual(-1e-9);
      }),
    );
  });

  it("restores the pose from its origin and yaw", () => {
    fc.assert(
      fc.property(poseArb, (pose) => {
        expect(beachChairPoseAt(beachChairOrigin(pose), pose.yaw)).toEqual(
          pose,
        );
      }),
    );
  });

  it("puts the origin on the cell boundary at floor height", () => {
    fc.assert(
      fc.property(poseArb, (pose) => {
        const o = beachChairOrigin(pose);
        expect(o.y).toBe(pose.foot.y);
        const mid = {
          x: (pose.foot.x + pose.head.x) / 2 + 0.5,
          z: (pose.foot.z + pose.head.z) / 2 + 0.5,
        };
        expect(o.x).toBe(mid.x);
        expect(o.z).toBe(mid.z);
      }),
    );
  });
});

describe("beach chair cells", () => {
  it("clear cells are the floor cells and the layers above, exactly", () => {
    fc.assert(
      fc.property(poseArb, (pose) => {
        const clear = beachChairClearCells(pose);
        expect(clear).toHaveLength(2 * BEACH_CHAIR_SPEC.headroom);
        const keys = new Set(clear.map((c) => `${c.x},${c.y},${c.z}`));
        expect(keys.size).toBe(clear.length);
        for (const f of beachChairCells(pose))
          for (let up = 0; up < BEACH_CHAIR_SPEC.headroom; up++)
            expect(keys.has(`${f.x},${f.y + up},${f.z}`)).toBe(true);
      }),
    );
  });

  it("supports lie directly below the floor cells", () => {
    fc.assert(
      fc.property(poseArb, (pose) => {
        const floor = beachChairCells(pose);
        expect(beachChairSupportCells(pose)).toEqual(
          floor.map((c) => ({ ...c, y: c.y - 1 })),
        );
      }),
    );
  });
});

describe("folded table top", () => {
  const { topHalf, topLimit } = BEACH_CHAIR_SPEC;
  const items = [GAS_LANTERN_FOOTPRINT_PX, DUTCH_OVEN_FOOTPRINT_PX];
  const aimArb = fc.record({
    x: fc.double({ min: -topHalf.halfX, max: topHalf.halfX, noNaN: true }),
    z: fc.double({ min: -topHalf.halfZ, max: topHalf.halfZ, noNaN: true }),
  });

  it("holds an oven or a lantern, and two lanterns end to end", () => {
    for (const footprint of items)
      expect(
        placeOnTop(topHalf, topLimit, [], { x: 0, z: 0 }, footprint).ok,
      ).toBe(true);
    const first = placeOnTop(
      topHalf,
      topLimit,
      [],
      { x: 0, z: -topHalf.halfZ },
      GAS_LANTERN_FOOTPRINT_PX,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = placeOnTop(
      topHalf,
      topLimit,
      [{ at: first.at, footprint: GAS_LANTERN_FOOTPRINT_PX }],
      { x: 0, z: topHalf.halfZ },
      GAS_LANTERN_FOOTPRINT_PX,
    );
    expect(second.ok).toBe(true);
  });

  it("never fits more items than the limit, whatever the aims", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(aimArb, fc.constantFrom(...items)), {
          maxLength: 6,
        }),
        (tries) => {
          const placed: TopItem[] = [];
          for (const [aim, footprint] of tries) {
            const result = placeOnTop(
              topHalf,
              Number.POSITIVE_INFINITY,
              placed,
              aim,
              footprint,
            );
            if (result.ok) placed.push({ at: result.at, footprint });
          }
          expect(placed.length).toBeLessThanOrEqual(topLimit);
        },
      ),
    );
  });
});

describe("form rules", () => {
  it("folds a free chair and unfolds a clear table", () => {
    expect(
      fold({ form: "chair", occupied: false, somethingOnTop: false }),
    ).toEqual({ ok: true, to: "table" });
    expect(
      unfold({ form: "table", occupied: false, somethingOnTop: false }),
    ).toEqual({ ok: true, to: "chair" });
  });

  it("fold and unfold undo each other and refuse for the stated reasons", () => {
    fc.assert(
      fc.property(stateArb, (s) => {
        const folded = fold(s);
        if (s.form !== "chair") {
          expect(folded).toEqual({ ok: false, reason: "wrongForm" });
        } else if (s.occupied) {
          expect(folded).toEqual({ ok: false, reason: "occupied" });
        } else {
          expect(folded).toEqual({ ok: true, to: "table" });
          expect(
            unfold({ ...s, form: "table", somethingOnTop: false }),
          ).toEqual({ ok: true, to: "chair" });
        }
        const unfolded = unfold(s);
        if (s.form !== "table") {
          expect(unfolded).toEqual({ ok: false, reason: "wrongForm" });
        } else if (s.somethingOnTop) {
          expect(unfolded).toEqual({ ok: false, reason: "somethingOnTop" });
        } else {
          expect(unfolded).toEqual({ ok: true, to: "chair" });
        }
      }),
    );
  });

  it("refuses to take back while occupied or loaded, in either form", () => {
    fc.assert(
      fc.property(stateArb, (s) => {
        const result = canTakeBack(s);
        if (s.occupied)
          expect(result).toEqual({ ok: false, reason: "occupied" });
        else if (s.somethingOnTop)
          expect(result).toEqual({ ok: false, reason: "somethingOnTop" });
        else expect(result).toEqual({ ok: true });
      }),
    );
  });

  it("lists the menu choices in display order", () => {
    expect(CHAIR_MENU_CHOICES).toEqual(["lie_down", "fold"]);
  });

  it("brands chair ids without changing them", () => {
    expect(asBeachChairId("abc")).toBe("abc");
  });
});

describe("BEACH_CHAIR_SPEC", () => {
  it("matches the model's measured seat, top, and bed outline", () => {
    expect(BEACH_CHAIR_SPEC.seatOffset).toEqual({ x: 0, y: 0.4375, z: 0.125 });
    expect(BEACH_CHAIR_SPEC.topPx).toBe(7);
    expect(BEACH_CHAIR_SPEC.bedOutlinePx).toEqual({
      minX: -6,
      maxX: 6,
      minZ: -16,
      maxZ: 16,
    });
  });

  it("sizes the folded table as wide as the bed and centred inside it", () => {
    const { topHalf, bedOutlinePx } = BEACH_CHAIR_SPEC;
    expect(topHalf).toEqual({ halfX: 6, halfZ: 7.25 });
    expect(topHalf.halfX * 2).toBe(bedOutlinePx.maxX - bedOutlinePx.minX);
    expect(-topHalf.halfZ).toBeGreaterThan(bedOutlinePx.minZ);
    expect(topHalf.halfZ).toBeLessThan(bedOutlinePx.maxZ);
  });

  it("puts the seat inside the bed outline", () => {
    const { seatOffset, bedOutlinePx } = BEACH_CHAIR_SPEC;
    const px = 16;
    expect(seatOffset.x * px).toBeGreaterThanOrEqual(bedOutlinePx.minX);
    expect(seatOffset.x * px).toBeLessThanOrEqual(bedOutlinePx.maxX);
    expect(seatOffset.z * px).toBeGreaterThanOrEqual(bedOutlinePx.minZ);
    expect(seatOffset.z * px).toBeLessThanOrEqual(bedOutlinePx.maxZ);
  });
});
