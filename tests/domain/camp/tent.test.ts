import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FLAP_IDS } from "../../../src/domain/camp/flaps";
import { TENT_SPEC } from "../../../src/domain/camp/spec";
import {
  flapAt,
  flapCells,
  type GroundReading,
  insideTent,
  inTentFootprint,
  PITCHED_STATE,
  type PitchSurvey,
  planPitch,
  TENT_FLAPS,
  TENT_MATTRESSES,
  type TentFace,
  type TentLocalCell,
  type TentPose,
  type TentYaw,
  tentBlockAt,
  tentCellAt,
  tentCells,
  tentClearCells,
  tentEntityLocation,
  tentFootprintBox,
  tentGround,
  tentGroundCells,
  tentPose,
} from "../../../src/domain/camp/tent";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import { CLEARABLE_DECORATIONS } from "../../../src/domain/shared/decorations";
import { dot, forward, normalizeYaw } from "../../../src/domain/shared/vec";
import { defined } from "../../support/defined";

const AIR = "minecraft:air";
const YAWS: readonly TentYaw[] = [0, 90, 180, -90];
const arbYaw = fc.constantFrom(...YAWS);
const arbPose: fc.Arbitrary<TentPose> = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -1000, max: 1000 }),
  yaw: arbYaw,
});

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Every local cell of the clear space, keyed by its world cell. */
function locals(pose: TentPose): Map<string, TentLocalCell> {
  const map = new Map<string, TentLocalCell>();
  for (const x of range(-3, 3))
    for (const depth of range(0, 11))
      for (const layer of range(-1, 4)) {
        const local = { x, depth, layer };
        map.set(cellKey(tentCellAt(pose, local)), local);
      }
  return map;
}

const FACE_STEP: Record<TentFace, { x: number; z: number }> = {
  0: { x: 0, z: -1 },
  1: { x: 0, z: 1 },
  2: { x: -1, z: 0 },
  3: { x: 1, z: 0 },
};

// A quarter turn of the yaw turns the world offsets (a, b) into (-b, a).
const turned = (pose: TentPose, c: Cell): Cell => ({
  x: pose.x - (c.z - pose.z) + 0,
  y: c.y,
  z: pose.z + (c.x - pose.x) + 0,
});
const TURNED_FACE: Record<TentFace, TentFace> = { 0: 3, 1: 2, 2: 0, 3: 1 };

describe("tentPose (ADR 0131)", () => {
  it("stands on the clicked block, snapped to a quarter turn, facing the player", () => {
    fc.assert(
      fc.property(
        fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() }),
        fc.double({ min: -720, max: 720, noNaN: true }),
        (clicked, playerYaw) => {
          const pose = tentPose(clicked, playerYaw);
          expect({ x: pose.x, y: pose.y, z: pose.z }).toEqual({
            ...clicked,
            y: clicked.y + 1,
          });
          expect(YAWS).toContain(pose.yaw);
          expect(pose.yaw).toBe(
            normalizeYaw(Math.round((playerYaw + 180) / 90) * 90) + 0,
          );
          expect(
            dot(forward(pose.yaw), forward(playerYaw)),
          ).toBeLessThanOrEqual(-Math.SQRT1_2 + 1e-9);
        },
      ),
    );
  });
});

describe("tentCells (ADR 0130, 0131)", () => {
  it("lays 137 unique cells in the footprint: 79 walls, 8 flap cells, 35 room and 15 tarp ceiling cells", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const cells = tentCells(pose, PITCHED_STATE);
        expect(cells).toHaveLength(137);
        const walls = cells.filter((c) => c.block.type === "wall");
        const flaps = cells.filter((c) => c.block.type === "flap");
        const ceilings = cells.filter((c) => c.block.type === "ceiling");
        expect(walls).toHaveLength(79);
        expect(new Set(flaps.map(cellKey))).toEqual(
          new Set(
            Object.values(TENT_FLAPS)
              .flat()
              .map((c) => cellKey(tentCellAt(pose, c))),
          ),
        );
        expect(ceilings).toHaveLength(50);
        expect(ceilings.filter((c) => c.y === pose.y + 3)).toHaveLength(35);
        expect(ceilings.filter((c) => c.y === pose.y + 2)).toHaveLength(15);
        expect(new Set(cells.map(cellKey)).size).toBe(137);
        for (const c of cells) expect(inTentFootprint(pose, c)).toBe(true);
      }),
    );
  });

  it("turns every wall plate toward an open room cell", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const byKey = new Map(
          tentCells(pose, PITCHED_STATE).map((c) => [cellKey(c), c]),
        );
        const local = locals(pose);
        for (const c of byKey.values()) {
          if (c.block.type !== "wall") continue;
          const step = FACE_STEP[c.block.face];
          const n = { x: c.x + step.x, y: c.y, z: c.z + step.z };
          expect(insideTent(pose, { x: n.x + 0.5, y: n.y, z: n.z + 0.5 })).toBe(
            true,
          );
          const there = byKey.get(cellKey(n))?.block;
          expect(there?.type).not.toBe("ceiling");
          if (there?.type === "wall") {
            const l = defined(local.get(cellKey(n)), "neighbor");
            expect([Math.abs(l.x), l.depth]).toEqual([2, 8]);
          }
        }
      }),
    );
  });

  it("turns with the yaw about the pose", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const next: TentPose = {
          ...pose,
          yaw: (normalizeYaw(pose.yaw + 90) + 0) as TentYaw,
        };
        const mapped = tentCells(pose, PITCHED_STATE).map((c) => ({
          ...turned(pose, c),
          block:
            c.block.type === "wall"
              ? { type: "wall", face: TURNED_FACE[c.block.face] }
              : c.block,
        }));
        const sort = (cs: { x: number; y: number; z: number }[]) =>
          [...cs].sort((a, b) => cellKey(a).localeCompare(cellKey(b)));
        expect(sort(mapped)).toEqual(sort(tentCells(next, PITCHED_STATE)));
      }),
    );
  });

  it("puts the 180-yaw test tent where the in-game tests expect it", () => {
    const pose = tentPose({ x: 110, y: -61, z: 46 }, 0);
    expect(pose).toEqual({ x: 110, y: -60, z: 46, yaw: 180 });
    expect(tentEntityLocation(pose)).toEqual({ x: 110.5, y: -60, z: 57.5 });
    expect(tentBlockAt(pose, { x: 110, y: -60, z: 49 })).toEqual({
      type: "flap",
      id: "front",
      open: false,
    });
    expect(tentBlockAt(pose, { x: 111, y: -60, z: 49 })).toEqual({
      type: "wall",
      face: 1,
    });
    expect(tentBlockAt(pose, { x: 113, y: -60, z: 50 })?.type).toBe("wall");
  });
});

describe("tentBlockAt (ADR 0131)", () => {
  it("agrees with tentCells and finds nothing elsewhere", () => {
    fc.assert(
      fc.property(
        arbPose,
        fc.record({
          dx: fc.integer({ min: -14, max: 14 }),
          dy: fc.integer({ min: -2, max: 6 }),
          dz: fc.integer({ min: -14, max: 14 }),
        }),
        (pose, d) => {
          const cells = tentCells(pose, PITCHED_STATE);
          for (const c of cells) expect(tentBlockAt(pose, c)).toEqual(c.block);
          const probe = {
            x: pose.x + d.dx,
            y: pose.y + d.dy,
            z: pose.z + d.dz,
          };
          const laid = cells.find((c) => cellKey(c) === cellKey(probe));
          expect(tentBlockAt(pose, probe)).toEqual(laid?.block);
        },
      ),
    );
  });
});

describe("clear and ground cells (ADR 0131)", () => {
  it("covers 336 clear cells over 84 ground cells, and the footprint box holds exactly them", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const clear = tentClearCells(pose);
        const ground = tentGroundCells(pose);
        expect(new Set(clear.map(cellKey)).size).toBe(336);
        expect(new Set(ground.map(cellKey)).size).toBe(84);
        ground.forEach((g, i) => {
          const base = defined(clear[i * 4], "column base");
          expect(g).toEqual({ ...base, y: pose.y - 1 });
        });
        const { min, size } = tentFootprintBox(pose);
        expect([
          [7, 4, 12],
          [12, 4, 7],
        ]).toContainEqual([size.x, size.y, size.z]);
        const keys = new Set(clear.map(cellKey));
        for (let x = min.x - 1; x <= min.x + size.x; x++)
          for (let y = min.y - 1; y <= min.y + size.y; y++)
            for (let z = min.z - 1; z <= min.z + size.z; z++) {
              const c = { x, y, z };
              const inBox =
                x >= min.x &&
                x < min.x + size.x &&
                y >= min.y &&
                y < min.y + size.y &&
                z >= min.z &&
                z < min.z + size.z;
              expect(keys.has(cellKey(c))).toBe(inBox);
              expect(inTentFootprint(pose, c)).toBe(inBox);
            }
      }),
    );
  });
});

describe("insideTent (ADR 0131)", () => {
  const frac = fc.double({ min: 0, max: 0.999, noNaN: true });

  it("holds in both rooms and the inner wall, and not in the outer walls, under the tarp, on the roof, or outside", () => {
    fc.assert(
      fc.property(
        arbPose,
        fc.integer({ min: -4, max: 4 }),
        fc.integer({ min: -1, max: 12 }),
        fc.integer({ min: -1, max: 4 }),
        frac,
        frac,
        frac,
        (pose, x, depth, layer, fx, fy, fz) => {
          const c = tentCellAt(pose, { x, depth, layer });
          const feet = { x: c.x + fx, y: c.y + fy, z: c.z + fz };
          const inside =
            Math.abs(x) <= 2 &&
            depth >= 4 &&
            depth <= 10 &&
            layer >= 0 &&
            layer <= 2;
          expect(insideTent(pose, feet)).toBe(inside);
        },
      ),
    );
  });
});

describe("tentGround (ADR 0131)", () => {
  const decorations = [...CLEARABLE_DECORATIONS];
  const arbCell = fc.record({
    x: fc.integer({ min: -1000, max: 1000 }),
    y: fc.integer({ min: -60, max: 300 }),
    z: fc.integer({ min: -1000, max: 1000 }),
  });

  it("steps down through the decorations on top of the ground, and keeps any other clicked block", () => {
    fc.assert(
      fc.property(
        arbCell,
        fc.array(fc.constantFrom(...decorations), { maxLength: 3 }),
        fc.constantFrom("minecraft:stone", "minecraft:grass_block", AIR),
        (clicked, layers, groundType) => {
          const typeIdAt = (at: { y: number }) => {
            const above = clicked.y - at.y;
            return above < layers.length ? layers[above] : groundType;
          };
          expect(tentGround(clicked, typeIdAt)).toEqual({
            ...clicked,
            y: clicked.y - layers.length,
          });
        },
      ),
    );
  });

  it("rests a tent clicked on a snow layer on the block under it, with the snow in its clear cells", () => {
    const clicked = { x: 4, y: 70, z: -2 };
    const ground = tentGround(clicked, (at) =>
      at.y === 70 ? "minecraft:snow_layer" : "minecraft:dirt",
    );
    const pose = tentPose(ground, 0);
    expect(pose.y).toBe(70);
    expect(tentClearCells(pose).map(cellKey)).toContain(cellKey(clicked));
  });

  it("stops when the column cannot be read", () => {
    const clicked = { x: 0, y: 64, z: 0 };
    expect(tentGround(clicked, () => undefined)).toEqual(clicked);
  });
});

describe("tentEntityLocation (ADR 0130)", () => {
  it("is the bottom middle of the rear wall's middle cell", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const at = tentEntityLocation(pose);
        const cell = tentCellAt(pose, { x: 0, depth: 11, layer: 0 });
        expect({
          x: Math.floor(at.x),
          y: Math.floor(at.y),
          z: Math.floor(at.z),
        }).toEqual(cell);
        expect([at.x - cell.x, at.y - cell.y, at.z - cell.z]).toEqual([
          0.5, 0, 0.5,
        ]);
      }),
    );
  });
});

describe("flaps and mattresses (ADR 0130)", () => {
  it("lays four disjoint two-cell flaps as closed flap cells", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const all = Object.values(TENT_FLAPS).flat();
        for (const flap of Object.values(TENT_FLAPS))
          expect(flap).toHaveLength(2);
        const keys = all.map((c) => cellKey(tentCellAt(pose, c)));
        expect(new Set(keys).size).toBe(8);
        for (const [id, flap] of Object.entries(TENT_FLAPS))
          for (const c of flap)
            expect(tentBlockAt(pose, tentCellAt(pose, c))).toEqual({
              type: "flap",
              id,
              open: false,
            });
      }),
    );
  });

  it("leaves each two-cell mattress inside and unlaid", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        for (const mattress of TENT_MATTRESSES) {
          expect(mattress).toHaveLength(2);
          for (const local of mattress) {
            const c = tentCellAt(pose, local);
            expect(tentBlockAt(pose, c)).toBeUndefined();
            expect(
              insideTent(pose, { x: c.x + 0.5, y: c.y, z: c.z + 0.5 }),
            ).toBe(true);
          }
        }
      }),
    );
  });
});

describe("tent flap cells (ADR 0132)", () => {
  it("lays the same cells in the same order for any open flaps, a flap cell open iff its flap is", () => {
    fc.assert(
      fc.property(arbPose, fc.subarray([...FLAP_IDS]), (pose, open) => {
        const openFlaps = new Set(open);
        const closed = tentCells(pose, PITCHED_STATE);
        const cells = tentCells(pose, { openFlaps });
        expect(cells.map(cellKey)).toEqual(closed.map(cellKey));
        cells.forEach((c, i) => {
          const before = defined(closed[i], "closed cell").block;
          if (c.block.type !== "flap") {
            expect(c.block).toEqual(before);
            return;
          }
          expect(before).toEqual({ ...c.block, open: false });
          expect(c.block.open).toBe(openFlaps.has(c.block.id));
        });
      }),
    );
  });

  it("finds each flap's cells and nothing else, from TENT_FLAPS at the pose", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const seen = new Set<string>();
        for (const id of FLAP_IDS) {
          const cells = flapCells(pose, id);
          expect(cells.length).toBeGreaterThan(0);
          expect(cells).toEqual(TENT_FLAPS[id].map((c) => tentCellAt(pose, c)));
          for (const c of cells) {
            expect(flapAt(pose, c)).toBe(id);
            expect(seen.has(cellKey(c))).toBe(false);
            seen.add(cellKey(c));
          }
        }
        for (const c of tentCells(pose, PITCHED_STATE))
          if (!seen.has(cellKey(c))) expect(flapAt(pose, c)).toBeUndefined();
      }),
    );
  });
});

describe("planPitch (ADR 0131)", () => {
  const STONE: GroundReading = { typeId: "minecraft:stone", liquid: false };
  const pose: TentPose = { x: 0, y: 64, z: 0, yaw: 0 };
  const fine = (): PitchSurvey => ({
    clear: tentClearCells(pose).map(() => AIR),
    ground: tentGroundCells(pose).map(() => STONE),
    vehicleSpace: false,
    campSpace: false,
    occupants: 0,
    tents: 0,
  });
  const plant = defined([...CLEARABLE_DECORATIONS][0], "plant");

  const clearType = fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom(...CLEARABLE_DECORATIONS) },
    { weight: 1, arbitrary: fc.constant("minecraft:stone") },
    { weight: 1, arbitrary: fc.constant(undefined) },
  );
  const groundReading = fc.oneof(
    {
      weight: 1,
      arbitrary: fc.constant({ typeId: "minecraft:water", liquid: true }),
    },
    { weight: 1, arbitrary: fc.constant({ typeId: AIR, liquid: false }) },
    {
      weight: 1,
      arbitrary: fc
        .constantFrom(...CLEARABLE_DECORATIONS)
        .map((typeId) => ({ typeId, liquid: false })),
    },
    { weight: 1, arbitrary: fc.constant(undefined) },
    {
      weight: 2,
      arbitrary: fc.constant({ typeId: "minecraft:sand", liquid: false }),
    },
  );
  // Mostly air over stone, with a few cells changed, so every rule gets its turn.
  const edits = <T>(value: fc.Arbitrary<T>, length: number) =>
    fc.array(fc.tuple(fc.nat({ max: length - 1 }), value), { maxLength: 4 });
  const arbSurvey: fc.Arbitrary<PitchSurvey> = fc
    .record({
      clear: edits(clearType, 336),
      ground: edits(groundReading, 84),
      vehicleSpace: fc.boolean(),
      campSpace: fc.boolean(),
      occupants: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 3 })),
      tents: fc.integer({ min: 0, max: TENT_SPEC.maxTents + 1 }),
    })
    .map((r) => {
      const clear: (string | undefined)[] = Array(336).fill(AIR);
      for (const [i, v] of r.clear) clear[i] = v;
      const ground: (GroundReading | undefined)[] = Array(84).fill(STONE);
      for (const [i, v] of r.ground) ground[i] = v;
      return { ...r, clear, ground };
    });

  it("refuses for the first rule that fails, and otherwise clears the decorations from the top down", () => {
    fc.assert(
      fc.property(arbPose, arbSurvey, (p, survey) => {
        const isClear = (t: string | undefined) =>
          t === AIR || (t !== undefined && CLEARABLE_DECORATIONS.has(t));
        const isGround = (g: GroundReading | undefined) =>
          g !== undefined &&
          g.typeId !== AIR &&
          !g.liquid &&
          !CLEARABLE_DECORATIONS.has(g.typeId);
        const expected =
          survey.tents >= TENT_SPEC.maxTents
            ? "limit"
            : survey.vehicleSpace
              ? "vehicle"
              : survey.occupants > 0
                ? "crowded"
                : survey.campSpace || !survey.clear.every(isClear)
                  ? "blocked"
                  : !survey.ground.every(isGround)
                    ? "ground"
                    : undefined;
        const plan = planPitch(p, survey);
        if (expected !== undefined) {
          expect(plan).toEqual({ ok: false, reason: expected });
          return;
        }
        if (!plan.ok) throw new Error(`refused: ${plan.reason}`);
        const cells = tentClearCells(p);
        const decorated = cells.filter((_, i) => survey.clear[i] !== AIR);
        expect(new Set(plan.clearTopFirst.map(cellKey))).toEqual(
          new Set(decorated.map(cellKey)),
        );
        expect(plan.clearTopFirst).toHaveLength(decorated.length);
        for (let i = 1; i < plan.clearTopFirst.length; i++)
          expect(defined(plan.clearTopFirst[i], "cell").y).toBeLessThanOrEqual(
            defined(plan.clearTopFirst[i - 1], "cell").y,
          );
      }),
    );
  });

  it("pitches on flat stone with nothing in the way", () => {
    expect(planPitch(pose, fine())).toEqual({ ok: true, clearTopFirst: [] });
  });

  it("refuses a fifth tent", () => {
    expect(planPitch(pose, { ...fine(), tents: 4 })).toEqual({
      ok: false,
      reason: "limit",
    });
  });

  it("refuses vehicle space", () => {
    expect(planPitch(pose, { ...fine(), vehicleSpace: true })).toEqual({
      ok: false,
      reason: "vehicle",
    });
  });

  it("refuses another tent's camp space, even where it reads as air", () => {
    expect(planPitch(pose, { ...fine(), campSpace: true })).toEqual({
      ok: false,
      reason: "blocked",
    });
  });

  it("refuses with someone in the footprint", () => {
    expect(planPitch(pose, { ...fine(), occupants: 1 })).toEqual({
      ok: false,
      reason: "crowded",
    });
  });

  it("refuses a step in the footprint", () => {
    const clear = [...fine().clear];
    clear[40] = "minecraft:stone";
    expect(planPitch(pose, { ...fine(), clear })).toEqual({
      ok: false,
      reason: "blocked",
    });
  });

  it("refuses a hole under the footprint", () => {
    const ground = [...fine().ground];
    ground[10] = { typeId: AIR, liquid: false };
    expect(planPitch(pose, { ...fine(), ground })).toEqual({
      ok: false,
      reason: "ground",
    });
  });

  it("clears grass in the footprint, top first", () => {
    const clear = [...fine().clear];
    clear[0] = plant;
    clear[1] = plant;
    const plan = planPitch(pose, { ...fine(), clear });
    const cells = tentClearCells(pose);
    expect(plan).toEqual({
      ok: true,
      clearTopFirst: [cells[1], cells[0]],
    });
  });
});
