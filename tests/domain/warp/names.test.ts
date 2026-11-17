import fc from "fast-check";
import { expect, it } from "vitest";
import { WARP_SPEC } from "../../../src/domain/warp/spec";
import {
  defaultWarpName,
  parseWarpName,
  type WarpName,
} from "../../../src/domain/warp/warpName";

it("trims and bounds names by code points", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 0x10ffff }), { maxLength: 100 }),
      (codes) => {
        const raw = `  ${String.fromCodePoint(...codes)}  `;
        const expected = Array.from(raw.trim())
          .slice(0, WARP_SPEC.nameMaxLength)
          .join("")
          .trimEnd();
        expect(parseWarpName(raw)).toBe(expected || undefined);
      },
    ),
  );
});

it("keeps parsed names stable when truncation ends on whitespace", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: WARP_SPEC.nameMaxLength - 1 }),
      (length) => {
        const raw = `${"a".repeat(length)}${" ".repeat(WARP_SPEC.nameMaxLength - length)}tail`;
        const name = parseWarpName(raw);
        expect(name).toBeDefined();
        expect(parseWarpName(name ?? "")).toBe(name);
      },
    ),
  );
});

it("chooses the lowest free default number without colliding", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 1, max: 100 })),
      fc.array(fc.string()),
      (numbers, other) => {
        const taken: WarpName[] = [
          ...numbers.map((n) => `Warp ${n}`),
          ...other,
        ].flatMap((s) => {
          const name = parseWarpName(s);
          return name ? [name] : [];
        });
        const name = defaultWarpName(taken);
        expect(taken).not.toContain(name);
        const n = Number(name.slice(5));
        expect(name).toBe(`Warp ${n}`);
        expect(n).toBeGreaterThanOrEqual(1);
        for (let i = 1; i < n; i++) expect(taken).toContain(`Warp ${i}`);
      },
    ),
  );
});
