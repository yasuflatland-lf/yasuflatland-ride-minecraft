import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildLayout,
  type TentLayoutSpec,
} from "../../../src/domain/camp/tentLayout";
import { defined } from "../../support/defined";

const spec = (): TentLayoutSpec => ({
  wallHalfWidths: [3, 2, 2],
  depths: { front: 1, inner: 4, rear: 7 },
  ceilings: [
    { halfWidth: 1, depthFrom: 2, depthTo: 6, layer: 3 },
    { halfWidth: 1, depthFrom: 0, depthTo: 0, layer: 1 },
  ],
  flaps: {
    front: [{ x: 0, depth: 1, layer: 0 }],
    left: [{ x: 3, depth: 3, layer: 0 }],
    right: [{ x: -3, depth: 3, layer: 0 }],
    bedroom: [{ x: 0, depth: 4, layer: 0 }],
  },
  mattresses: [[{ x: 1, depth: 5, layer: 0 }], [{ x: -1, depth: 5, layer: 0 }]],
  lantern: { x: 0, depth: 3, layer: 3 },
  clear: { halfWidth: 3, depth: 8, layers: 4 },
  rooms: [{ halfWidth: 1, depthFrom: 2, depthTo: 6, layerTo: 2 }],
  anchor: { x: 0, depth: 7, layer: 0 },
});

describe("buildLayout", () => {
  it("builds walls from independently supplied layer widths", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 2, max: 6 }), {
          minLength: 3,
          maxLength: 3,
        }),
        (widths) => {
          const base = spec();
          const layout = buildLayout({
            ...base,
            wallHalfWidths: widths,
            clear: { ...base.clear, halfWidth: Math.max(...widths) },
            flaps: { ...base.flaps, left: [], right: [] },
          });
          widths.forEach((width, layer) => {
            const row = layout.walls.filter(({ cell }) => cell.layer === layer);
            for (const depth of [1, 4, 7]) {
              expect(
                row
                  .filter(({ cell, face }) => cell.depth === depth && face <= 1)
                  .map(({ cell }) => cell.x),
              ).toEqual(
                Array.from({ length: 2 * width - 1 }, (_, i) => i - width + 1),
              );
            }
            for (let depth = 2; depth <= 6; depth++)
              expect(
                row
                  .filter(({ cell, face }) => cell.depth === depth && face >= 2)
                  .map(({ cell }) => cell.x),
              ).toEqual([width, -width]);
          });
        },
      ),
    );
  });

  it("insets only the outer cross-walls and leaves the side spans unchanged", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 2 }), { maxLength: 3 }),
        (insets) => {
          const base = spec();
          const layout = buildLayout({
            ...base,
            crossWallInsets: insets,
            flaps: {
              ...base.flaps,
              front: base.flaps.front.map((cell) => ({
                ...cell,
                depth: cell.depth + (insets[cell.layer] ?? 0),
              })),
            },
            anchor: {
              ...base.anchor,
              depth: base.anchor.depth - (insets[base.anchor.layer] ?? 0),
            },
          });
          for (let layer = 0; layer < base.wallHalfWidths.length; layer++) {
            const row = layout.walls.filter(({ cell }) => cell.layer === layer);
            const inset = insets[layer] ?? 0;
            expect(
              row
                .filter(({ face }) => face === 0)
                .every(({ cell }) => cell.depth === base.depths.front + inset),
            ).toBe(true);
            expect(
              row
                .filter(({ face }) => face === 1)
                .map(({ cell }) => cell.depth),
            ).toEqual(
              Array(defined(base.wallHalfWidths[layer], "layer width") * 2 - 1)
                .fill(base.depths.inner)
                .concat(
                  Array(
                    defined(base.wallHalfWidths[layer], "layer width") * 2 - 1,
                  ).fill(base.depths.rear - inset),
                ),
            );
            expect(
              row.filter(({ face }) => face >= 2).map(({ cell }) => cell.depth),
            ).toEqual([2, 3, 4, 5, 6, 2, 3, 4, 5, 6]);
          }
        },
      ),
    );
  });

  it("rejects negative, fractional, excessive and crossing insets", () => {
    fc.assert(
      fc.property(
        fc.constantFrom([-1], [0.5], [3], [0, 0, 0, 0], [Number.NaN]),
        (insets) => {
          expect(() =>
            buildLayout({ ...spec(), crossWallInsets: insets }),
          ).toThrow("Invalid tent cross-wall insets");
        },
      ),
    );
  });

  it("rejects a mattress inside the clear box but outside every room", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -3, max: 3 }),
        fc.integer({ min: 0, max: 3 }),
        (x, layer) => {
          const base = spec();
          expect(() =>
            buildLayout({
              ...base,
              mattresses: [[{ x, depth: 0, layer }], base.mattresses[1]],
            }),
          ).toThrow("Tent mattress cell must be inside a room");
        },
      ),
    );
  });

  it("checks every room when validating mattresses", () => {
    const base = spec();
    expect(() =>
      buildLayout({
        ...base,
        rooms: [
          { halfWidth: 0, depthFrom: 2, depthTo: 3, layerTo: 0 },
          ...base.rooms,
        ],
      }),
    ).not.toThrow();
  });

  it("rejects cells outside the clear box", () => {
    const base = spec();
    const outside = { x: 4, depth: 3, layer: 0 };
    const invalid: TentLayoutSpec[] = [
      { ...base, wallHalfWidths: [4, 2, 2] },
      {
        ...base,
        ceilings: [
          ...base.ceilings,
          { halfWidth: 4, depthFrom: 0, depthTo: 0, layer: 1 },
        ],
      },
      { ...base, flaps: { ...base.flaps, front: [outside] } },
      { ...base, mattresses: [[outside], []] },
      { ...base, lantern: outside },
      { ...base, anchor: outside },
    ];
    for (const input of invalid)
      expect(() => buildLayout(input)).toThrow("Tent cell outside clear box");
  });

  it("rejects flaps off walls, lanterns off ceilings, and anchors off the rear wall", () => {
    const base = spec();
    expect(() =>
      buildLayout({
        ...base,
        flaps: { ...base.flaps, front: [{ x: 0, depth: 2, layer: 0 }] },
      }),
    ).toThrow("Tent flap cell must be a wall cell");
    expect(() =>
      buildLayout({ ...base, lantern: { ...base.lantern, layer: 0 } }),
    ).toThrow("Tent lantern cell must be a ceiling cell");
    for (const anchor of [
      { x: 0, depth: 1, layer: 0 },
      { x: 3, depth: 7, layer: 0 },
    ])
      expect(() => buildLayout({ ...base, anchor })).toThrow(
        "Tent anchor must be a rear wall cell",
      );
  });

  it("copies its input and freezes every nested layout value", () => {
    const input = spec();
    const layout = buildLayout(input);
    const assertFrozen = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) assertFrozen(child);
    };
    assertFrozen(layout);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.flaps.front)).toBe(false);
    expect(layout.flaps.front).not.toBe(input.flaps.front);
    expect(layout.flaps.front[0]).not.toBe(input.flaps.front[0]);
    expect(layout.mattresses[0]).not.toBe(input.mattresses[0]);
    expect(layout.rooms[0]).not.toBe(input.rooms[0]);
    expect(layout.lantern).not.toBe(input.lantern);
    expect(layout.anchor).not.toBe(input.anchor);
    expect(layout.clear).not.toBe(input.clear);
  });
});
