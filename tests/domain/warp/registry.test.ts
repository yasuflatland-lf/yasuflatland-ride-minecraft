import fc from "fast-check";
import { expect, it } from "vitest";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { asWarpPointId } from "../../../src/domain/warp/ids";
import {
  type BlockPresence,
  pruneGone,
} from "../../../src/domain/warp/presence";
import { WARP_SPEC } from "../../../src/domain/warp/spec";
import { parseWarpName } from "../../../src/domain/warp/warpName";
import {
  addPoint,
  emptyRegistry,
  findPoint,
  pointAt,
  pointsOf,
  removeAt,
  removePoint,
  renamePoint,
  type WarpRegistry,
} from "../../../src/domain/warp/warpRegistry";
import { point, registry } from "./arbitraries";

it("preserves the registry when adding and then removing a fresh point", () => {
  fc.assert(
    fc.property(registry, point, (reg, p) => {
      const before = structuredClone(reg);
      const result = addPoint(reg, p);
      if (result.ok) {
        expect(removePoint(result.registry, p.id)).toEqual(reg);
        expect(findPoint(result.registry, p.id)).toEqual(p);
        expect(pointAt(result.registry, p.dimension, p.cell)).toEqual(p);
        expect(removeAt(result.registry, p.dimension, p.cell)).toEqual(reg);
      }
      expect(reg).toEqual(before);
      const missing = asWarpPointId("missing");
      expect(removePoint(reg, missing)).toEqual(reg);
      expect(renamePoint(reg, missing, p.name)).toEqual(reg);
      expect(removeAt(reg, asDimensionId("missing"), p.cell)).toEqual(reg);
    }),
  );
});

it("allows the same cell in different dimensions", () => {
  fc.assert(
    fc.property(point, (p) => {
      const added = addPoint(emptyRegistry(), p);
      if (!added.ok) throw Error("point rejected");
      const other = {
        ...p,
        id: asWarpPointId(`${p.id}-other`),
        dimension: asDimensionId("other"),
      };
      const result = addPoint(added.registry, other);
      expect(result.ok).toBe(true);
      if (!result.ok) throw Error("point rejected");
      expect(pointAt(result.registry, p.dimension, p.cell)).toEqual(p);
      expect(pointAt(result.registry, other.dimension, p.cell)).toEqual(other);
      expect(pointsOf(removeAt(result.registry, p.dimension, p.cell))).toEqual([
        other,
      ]);
    }),
  );
});

it("caps capacity, rejects occupied cells and ids, and never mutates earlier values", () => {
  fc.assert(
    fc.property(point, (p) => {
      let reg: WarpRegistry = emptyRegistry();
      for (let i = 0; i <= WARP_SPEC.maxPoints; i++) {
        const before = structuredClone(reg);
        const next = {
          ...p,
          id: asWarpPointId(`point-${i}`),
          cell: { ...p.cell, x: i },
        };
        const result = addPoint(reg, next);
        expect(reg).toEqual(before);
        expect(result.ok).toBe(i < WARP_SPEC.maxPoints);
        if (result.ok) {
          reg = result.registry;
          expect(
            addPoint(reg, { ...next, id: asWarpPointId("other") }),
          ).toEqual({ ok: false, reason: "occupied" });
          expect(
            addPoint(reg, { ...next, cell: { ...next.cell, x: -1 } }),
          ).toEqual({ ok: false, reason: "occupied" });
        } else expect(result.reason).toBe("full");
        expect(pointsOf(reg).length).toBeLessThanOrEqual(WARP_SPEC.maxPoints);
      }
    }),
  );
});

it("renames only the requested point without changing its position", () => {
  fc.assert(
    fc.property(registry, (reg) => {
      const before = structuredClone(reg);
      const name = parseWarpName("New name");
      if (!name) throw Error("missing name");
      for (const p of pointsOf(reg)) {
        const renamed = renamePoint(reg, p.id, name);
        expect(pointsOf(renamed)).toEqual(
          pointsOf(reg).map((q) => (q.id === p.id ? { ...q, name } : q)),
        );
      }
      expect(reg).toEqual(before);
    }),
  );
});

it("prunes only gone blocks and reports unloaded ids in insertion order", () => {
  fc.assert(
    fc.property(
      registry,
      fc.func(fc.constantFrom<BlockPresence>("present", "gone", "unloaded")),
      (reg, probe) => {
        const before = structuredClone(reg);
        const result = pruneGone(reg, probe);
        expect(pointsOf(result.registry)).toEqual(
          pointsOf(reg).filter((p) => probe(p) !== "gone"),
        );
        expect(result.removed).toEqual(
          pointsOf(reg).filter((p) => probe(p) === "gone"),
        );
        expect(result.unverified).toEqual(
          new Set(
            pointsOf(reg)
              .filter((p) => probe(p) === "unloaded")
              .map((p) => p.id),
          ),
        );
        expect(reg).toEqual(before);
      },
    ),
  );
});
