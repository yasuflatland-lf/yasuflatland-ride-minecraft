import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DUTCH_OVEN_FOOTPRINT_PX,
  GAS_LANTERN_FOOTPRINT_PX,
} from "../../../src/domain/camp/spec";
import {
  type Footprint,
  placeOnTop,
  type TopItem,
} from "../../../src/domain/camp/tabletop";
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
import type { Facing4 } from "../../../src/domain/shared/facing";
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

const facingArb = fc.constantFrom<Facing4>(0, 90, 180, 270);

describe("beachChairPose", () => {
  it("lays three cells in a line above the pressed block, the head farthest from the player", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        const pose = beachChairPose(pressed, yaw);
        const [foot, middle, head] = beachChairCells(pose);
        expect(foot).toEqual({ x: pressed.x, y: pressed.y + 1, z: pressed.z });
        expect(middle.y).toBe(foot.y);
        expect(head.y).toBe(foot.y);
        const dx = middle.x - foot.x;
        const dz = middle.z - foot.z;
        expect(Math.abs(dx) + Math.abs(dz)).toBe(1);
        expect(head).toEqual({
          x: middle.x + dx,
          y: middle.y,
          z: middle.z + dz,
        });
        const toFoot = forward(pose.yaw);
        // 0 - n keeps a zero step +0, which unary minus would make -0 for Object.is.
        expect(dx).toBe(0 - Math.round(toFoot.x));
        expect(dz).toBe(0 - Math.round(toFoot.z));
        const facing = forward(yaw);
        expect(dx * facing.x + dz * facing.z).toBeGreaterThanOrEqual(-1e-9);
      }),
    );
  });

  it("lies along the player's facing at each of the four quarter turns", () => {
    const along: Record<Facing4, { x: number; z: number }> = {
      0: { x: 0, z: 1 },
      90: { x: -1, z: 0 },
      180: { x: 0, z: -1 },
      270: { x: 1, z: 0 },
    };
    fc.assert(
      fc.property(cellArb, facingArb, (pressed, facing) => {
        const pose = beachChairPose(pressed, facing);
        const step = along[facing];
        const foot = { x: pressed.x, y: pressed.y + 1, z: pressed.z };
        expect(beachChairCells(pose)).toEqual(
          [0, 1, 2].map((k) => ({
            x: foot.x + k * step.x,
            y: foot.y,
            z: foot.z + k * step.z,
          })),
        );
        expect(pose.yaw).toBe(((facing + 180) % 360) as Facing4);
      }),
    );
  });

  it("restores the pose from its origin and yaw at all four facings", () => {
    fc.assert(
      fc.property(cellArb, facingArb, (pressed, facing) => {
        const pose = beachChairPose(pressed, facing);
        expect(beachChairPoseAt(beachChairOrigin(pose), pose.yaw)).toEqual(
          pose,
        );
      }),
    );
  });

  it("puts the origin at the middle cell's centre at floor height", () => {
    fc.assert(
      fc.property(poseArb, (pose) => {
        expect(beachChairOrigin(pose)).toEqual({
          x: pose.middle.x + 0.5,
          y: pose.foot.y,
          z: pose.middle.z + 0.5,
        });
      }),
    );
  });
});

describe("beach chair cells", () => {
  it("clear cells are the three floor cells times the headroom, exactly", () => {
    fc.assert(
      fc.property(poseArb, (pose) => {
        const clear = beachChairClearCells(pose);
        expect(clear).toHaveLength(3 * BEACH_CHAIR_SPEC.headroom);
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

  it("keeps the bed outline inside the three cells around the origin", () => {
    const { bedOutline } = BEACH_CHAIR_SPEC;
    expect(bedOutline.maxX - bedOutline.minX).toBe(16);
    expect(-bedOutline.minZ).toBe(bedOutline.maxZ);
    expect(bedOutline.maxZ).toBeLessThanOrEqual(1.5 * 16);
    expect(bedOutline.maxZ).toBeGreaterThan(0.5 * 16);
  });
});

describe("folded table top", () => {
  const { topHalf, topLimit } = BEACH_CHAIR_SPEC;
  const items = [GAS_LANTERN_FOOTPRINT_PX, DUTCH_OVEN_FOOTPRINT_PX];
  const aimArb = fc.record({
    x: fc.double({ min: -topHalf.halfX, max: topHalf.halfX, noNaN: true }),
    z: fc.double({ min: -topHalf.halfZ, max: topHalf.halfZ, noNaN: true }),
  });
  const placeAll = (
    tries: readonly [{ x: number; z: number }, Footprint][],
    limit: number,
  ): TopItem[] => {
    const placed: TopItem[] = [];
    for (const [aim, footprint] of tries) {
      const result = placeOnTop(topHalf, limit, placed, aim, footprint);
      if (result.ok) placed.push({ at: result.at, footprint });
    }
    return placed;
  };

  it("sits inside the bed outline at the bed height", () => {
    const { bedOutline, topPx } = BEACH_CHAIR_SPEC;
    expect(topHalf.halfX).toBe(bedOutline.maxX);
    expect(topHalf.halfZ).toBeLessThan(bedOutline.maxZ);
    expect(topPx).toBe(9);
  });

  it("holds two ovens end to end, or an oven and two lanterns", () => {
    const oven = DUTCH_OVEN_FOOTPRINT_PX;
    const lantern = GAS_LANTERN_FOOTPRINT_PX;
    const ends: [{ x: number; z: number }, Footprint][] = [
      [{ x: 0, z: -topHalf.halfZ }, oven],
      [{ x: 0, z: topHalf.halfZ }, oven],
    ];
    expect(placeAll(ends, topLimit)).toHaveLength(2);
    const mixed: [{ x: number; z: number }, Footprint][] = [
      [{ x: 0, z: -topHalf.halfZ }, oven],
      [{ x: -topHalf.halfX, z: topHalf.halfZ }, lantern],
      [{ x: topHalf.halfX, z: topHalf.halfZ }, lantern],
    ];
    expect(placeAll(mixed, topLimit)).toHaveLength(3);
  });

  it("never holds more than the limit, whatever the aims", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(aimArb, fc.constantFrom(...items)), {
          maxLength: 8,
        }),
        (tries) => {
          expect(placeAll(tries, topLimit).length).toBeLessThanOrEqual(
            topLimit,
          );
        },
      ),
    );
  });

  it("fits as many lanterns as the limit allows in a grid", () => {
    const lantern = GAS_LANTERN_FOOTPRINT_PX;
    const grid: [{ x: number; z: number }, Footprint][] = [];
    for (const x of [-topHalf.halfX, topHalf.halfX])
      for (const z of [-topHalf.halfZ, 0, topHalf.halfZ])
        grid.push([{ x, z }, lantern]);
    expect(placeAll(grid, Number.POSITIVE_INFINITY)).toHaveLength(6);
    expect(placeAll(grid, topLimit)).toHaveLength(topLimit);
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
    expect(BEACH_CHAIR_SPEC.seatOffset).toEqual({ x: 0, y: 0.5625, z: 0.3125 });
    expect(BEACH_CHAIR_SPEC.topPx).toBe(9);
    expect(BEACH_CHAIR_SPEC.bedOutline).toEqual({
      minX: -8,
      maxX: 8,
      minZ: -23,
      maxZ: 23,
    });
  });

  it("sizes the folded table as wide as the bed and centred inside it", () => {
    const { topHalf, bedOutline } = BEACH_CHAIR_SPEC;
    expect(topHalf).toEqual({ halfX: 8, halfZ: 10.5 });
    expect(topHalf.halfX * 2).toBe(bedOutline.maxX - bedOutline.minX);
    expect(-topHalf.halfZ).toBeGreaterThan(bedOutline.minZ);
    expect(topHalf.halfZ).toBeLessThan(bedOutline.maxZ);
  });

  it("puts the seat inside the bed outline", () => {
    const { seatOffset, bedOutline } = BEACH_CHAIR_SPEC;
    const px = 16;
    expect(seatOffset.x * px).toBeGreaterThanOrEqual(bedOutline.minX);
    expect(seatOffset.x * px).toBeLessThanOrEqual(bedOutline.maxX);
    expect(seatOffset.z * px).toBeGreaterThanOrEqual(bedOutline.minZ);
    expect(seatOffset.z * px).toBeLessThanOrEqual(bedOutline.maxZ);
  });
});
