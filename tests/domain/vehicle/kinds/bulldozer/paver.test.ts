import { MinecraftBlockTypes } from "@minecraft/vanilla-data";
import fc from "fast-check";
import { expect, it } from "vitest";
import { KEPT_BLOCKS } from "../../../../../src/domain/shared/keptBlocks";
import { forward, type Vec3 } from "../../../../../src/domain/shared/vec";
import { bladeColumns } from "../../../../../src/domain/vehicle/kinds/bulldozer/blade";
import {
  type CellClass,
  flightRow,
  isRoadBlock,
  paveStep,
  ROAD_REJECTED_BLOCKS,
  referenceRow,
  roadPick,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/paver";
import { BULLDOZER_SPEC } from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";

const rule = BULLDOZER_SPEC.paver;
const classes: CellClass[] = ["solid", "liquid", "open"];
const cls = fc.constantFrom(...classes);
const REF = 10;
// Index 0 is row REF - 12; REF + 2 is the last row.
const BASE = REF - 12;
const profile = fc.array(cls, { minLength: 15, maxLength: 15 });
const at = (p: CellClass[]) => (row: number) => p[row - BASE] ?? "solid";
const col = { x: 3, z: 4 };
const pick = (p: CellClass[]) => roadPick(col, REF, at(p), rule);
const profileWith = (p: CellClass[], set: Record<number, CellClass>) => {
  const out = [...p];
  for (const [row, c] of Object.entries(set)) out[Number(row) - BASE] = c;
  return out;
};

it("roadPick stays on ref or ref+1 and only in allowed cells", () =>
  fc.assert(
    fc.property(profile, (p) => {
      const r = pick(p);
      if (!r) return;
      const c = at(p);
      expect([REF, REF + 1]).toContain(r.cell.y);
      if (r.cell.y === REF + 1) {
        expect(c(REF + 1)).toBe("solid");
        expect(c(REF + 2)).not.toBe("solid");
        return;
      }
      if (c(REF) === "open" && r.over === "land")
        expect(c(REF - 1)).toBe("solid");
      if (c(REF) === "open" && r.over === "liquid") {
        let d = 1;
        while (c(REF - d) === "open") d++;
        expect(d).toBeLessThanOrEqual(rule.liquidSearchDepth);
        expect(c(REF - d)).toBe("liquid");
      }
    }),
  ));
it("roadPick follows the step rules", () =>
  fc.assert(
    fc.property(profile, (p) => {
      expect(
        pick(profileWith(p, { [REF + 1]: "solid", [REF + 2]: "solid" })),
      ).toBeUndefined();
      expect(
        pick(profileWith(p, { [REF + 1]: "solid", [REF + 2]: "open" })),
      ).toEqual({ cell: { ...col, y: REF + 1 }, over: "land" });
      expect(
        pick(profileWith(p, { [REF + 1]: "open", [REF]: "solid" })),
      )?.toEqual({ cell: { ...col, y: REF }, over: "land" });
      expect(
        pick(profileWith(p, { [REF + 1]: "open", [REF]: "liquid" })),
      )?.toEqual({ cell: { ...col, y: REF }, over: "liquid" });
      expect(
        pick(
          profileWith(p, {
            [REF + 1]: "open",
            [REF]: "open",
            [REF - 1]: "solid",
          }),
        ),
      )?.toEqual({ cell: { ...col, y: REF }, over: "land" });
    }),
  ));
it("roadPick handles drops of two or more", () =>
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 12 }),
      cls.filter((c) => c !== "open"),
      (depth, found) => {
        const p: CellClass[] = Array.from({ length: 15 }, (_, i) =>
          BASE + i >= REF - depth + 1 ? "open" : "solid",
        );
        p[REF - depth - BASE] = found;
        const r = pick(p);
        if (found === "liquid" && depth <= rule.liquidSearchDepth)
          expect(r).toEqual({ cell: { ...col, y: REF }, over: "liquid" });
        else expect(r).toBeUndefined();
      },
    ),
  ));

const pose = fc.record({
  x: fc.double({ min: -200, max: 200, noNaN: true }),
  y: fc.integer({ min: 0, max: 200 }).map((n) => n + 0.0),
  z: fc.double({ min: -200, max: 200, noNaN: true }),
});
const yawArb = fc.double({ min: -180, max: 180, noNaN: true });
const speedArb = fc.oneof(
  fc.double({ min: 0.03, max: 0.45, noNaN: true }),
  fc.double({ min: -0.1, max: -0.03, noNaN: true }),
);
const halfWidthArb = fc.constantFrom(2.32, 4.64);
// A deterministic terrain from a seed, so two half widths see the same world.
const terrain =
  (seed: number) =>
  (c: Vec3): CellClass =>
    classes[Math.abs((c.x * 7 + c.z * 13 + c.y * 3 + seed) | 0) % 3] ?? "open";
const base = (p: Vec3, yaw: number, speed: number, halfWidth: number) => ({
  location: p,
  yaw,
  speed,
  form: "car" as const,
  onGround: true,
  halfWidth,
  block: "minecraft:stone",
});
const along = (c: Vec3, p: Vec3, yaw: number, speed: number) => {
  const f = forward(yaw);
  const s = speed > 0 ? 1 : -1;
  return ((c.x + 0.5 - p.x) * f.x + (c.z + 0.5 - p.z) * f.z) * s;
};
const halfDiagonal = Math.SQRT1_2;

it("paveStep lays nothing through a failing gate", () =>
  fc.assert(
    fc.property(pose, yawArb, speedArb, (p, yaw, speed) => {
      const open = (c: Vec3) =>
        c.y <= referenceRow(p.y) ? ("solid" as const) : ("open" as const);
      const ok = base(p, yaw, speed, 2.32);
      expect(paveStep(ok, open)).toBeDefined();
      expect(
        paveStep({ ...ok, block: "minecraft:sand" }, open),
      ).toBeUndefined();
      expect(paveStep({ ...ok, block: undefined }, open)).toBeUndefined();
      expect(paveStep({ ...ok, speed: rule.minSpeed }, open)).toBeUndefined();
      expect(paveStep({ ...ok, speed: -rule.minSpeed }, open)).toBeUndefined();
      expect(paveStep({ ...ok, onGround: false }, open)).toBeUndefined();
      for (const form of ["takeoff", "landing", "submarine"] as const)
        expect(paveStep({ ...ok, form }, open)).toBeUndefined();
    }),
  ));
it("paveStep keeps land cells on the trailing side unless over liquid", () =>
  fc.assert(
    fc.property(
      pose,
      yawArb,
      speedArb,
      halfWidthArb,
      fc.integer({ min: 0, max: 50 }),
      (p, yaw, speed, hw, seed) => {
        const land = base(p, yaw, speed, hw);
        const classAt = terrain(seed);
        const out = paveStep(land, classAt);
        const travelYaw = speed > 0 ? yaw : yaw + 180;
        const keys = new Set<string>();
        for (const c of out?.cells ?? []) {
          const key = `${c.x},${c.z}`;
          expect(keys.has(key)).toBe(false);
          keys.add(key);
          const a = along(c, p, travelYaw, 1);
          if (a > -rule.bodyHalf + halfDiagonal + 1e-6) {
            // Outside the trail strip, a cell exists only over liquid.
            const ref = referenceRow(p.y);
            const wet = Array.from(
              { length: rule.liquidSearchDepth + 1 },
              (_, d) => classAt({ x: c.x, y: ref - d, z: c.z }),
            ).includes("liquid");
            expect(wet).toBe(true);
          }
          expect(a).toBeGreaterThanOrEqual(
            -(rule.bodyHalf + rule.trail) - halfDiagonal - 1e-6,
          );
          expect(a).toBeLessThanOrEqual(
            rule.bodyHalf + rule.lookAhead + halfDiagonal + 1e-6,
          );
        }
      },
    ),
  ));
it("paveStep keeps flight cells in the flight row, clear of solids and of the body", () =>
  fc.assert(
    fc.property(
      pose,
      yawArb,
      speedArb,
      halfWidthArb,
      fc.integer({ min: 0, max: 50 }),
      (p, yaw, speed, hw, seed) => {
        const classAt = terrain(seed);
        const out = paveStep(
          { ...base(p, yaw, speed, hw), form: "hover", onGround: false },
          classAt,
        );
        for (const c of out?.cells ?? []) {
          expect(c.y).toBe(flightRow(p.y));
          expect(classAt(c)).not.toBe("solid");
          const dx = Math.max(p.x - 1.2 - (c.x + 1), c.x - (p.x + 1.2), 0);
          const dz = Math.max(p.z - 1.2 - (c.z + 1), c.z - (p.z + 1.2), 0);
          expect(dx > 0 || dz > 0).toBe(true);
        }
      },
    ),
  ));
it("paveStep does not emit a solid flight cell", () => {
  const out = paveStep(
    {
      ...base({ x: 0.5, y: 70, z: 0.5 }, 0, 0.3, 2.32),
      form: "hover",
      onGround: false,
    },
    (c) => (c.x === 0 ? "solid" : "open"),
  );
  expect(out?.cells.some((c) => c.x === 0)).toBe(false);
  expect(out?.cells.length).toBeGreaterThan(0);
});
it("paveStep at the wide width contains the cells of the normal width", () =>
  fc.assert(
    fc.property(
      pose,
      yawArb,
      speedArb,
      fc.constantFrom("car", "hover"),
      fc.integer({ min: 0, max: 50 }),
      (p, yaw, speed, form, seed) => {
        const classAt = terrain(seed);
        const input = (hw: number) => ({
          ...base(p, yaw, speed, hw),
          form,
          onGround: form === "car",
        });
        const wide = new Set(
          (paveStep(input(4.64), classAt)?.cells ?? []).map(
            (c) => `${c.x},${c.y},${c.z}`,
          ),
        );
        for (const c of paveStep(input(2.32), classAt)?.cells ?? [])
          expect(wide.has(`${c.x},${c.y},${c.z}`)).toBe(true);
      },
    ),
  ));
it("paveStep prefers the trail strip pick over a support zone pick", () => {
  const out = paveStep(base({ x: 0.5, y: 64, z: 0.5 }, 0, 0.3, 2.32), (c) =>
    c.y === 63 ? "solid" : "open",
  );
  expect(out?.cells.every((c) => c.y === 63)).toBe(true);
});

it("isRoadBlock follows the accepted block rules", () => {
  for (const id of KEPT_BLOCKS) expect(isRoadBlock(id)).toBe(false);
  for (const id of ROAD_REJECTED_BLOCKS) expect(KEPT_BLOCKS).not.toContain(id);
  const vanilla = new Set<string>(Object.values(MinecraftBlockTypes));
  for (const id of ROAD_REJECTED_BLOCKS) {
    expect(vanilla.has(id)).toBe(true);
    expect(isRoadBlock(id)).toBe(false);
  }
  for (const id of [
    "minecraft:stone",
    "minecraft:oak_planks",
    "minecraft:cobblestone",
  ])
    expect(isRoadBlock(id)).toBe(true);
  for (const id of [
    "minecraft:wooden_door",
    "minecraft:bed",
    "minecraft:sand",
    "yasu_ride:camper_bed",
    "yasu_build:anything",
    "minecraft:oak_sign",
    "minecraft:red_concrete_powder",
  ])
    expect(isRoadBlock(id)).toBe(false);
});
it("referenceRow and flightRow round like the blade", () => {
  expect(referenceRow(64)).toBe(63);
  expect(referenceRow(64.5)).toBe(64);
  expect(flightRow(70)).toBe(69);
  expect(flightRow(70.3)).toBe(69);
  fc.assert(
    fc.property(fc.double({ min: -64, max: 319, noNaN: true }), (y) => {
      const cols = bladeColumns(
        { x: 0, y, z: 0 },
        0,
        BULLDOZER_SPEC.blade,
        false,
      );
      expect(referenceRow(y) + 1 + 0).toBe((cols[0]?.bottom ?? 0) + 0);
    }),
  );
});
