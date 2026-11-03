import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FLAP_IDS } from "../../../src/domain/camp/flaps";
import {
  flapCells,
  type TentPose,
  type TentYaw,
  tentCellAt,
  tentCells,
  tentClearCells,
} from "../../../src/domain/camp/tent";
import {
  buildLayout,
  type TentLayoutSpec,
  TUNNEL_LAYOUT,
} from "../../../src/domain/camp/tentLayout";
import { cellKey } from "../../../src/domain/shared/cells";

const arbPose: fc.Arbitrary<TentPose> = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -1000, max: 1000 }),
  yaw: fc.constantFrom<TentYaw>(0, 90, 180, -90),
});

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

describe("tent layout", () => {
  it("keeps all laid cells within the clear cells at any pose and state", () => {
    fc.assert(
      fc.property(
        arbPose,
        fc.subarray([...FLAP_IDS]),
        fc.boolean(),
        (pose, openFlaps, lanternOn) => {
          const clear = new Set(tentClearCells(pose).map(cellKey));
          for (const cell of tentCells(pose, {
            openFlaps: new Set(openFlaps),
            lanternOn,
          }))
            expect(clear.has(cellKey(cell))).toBe(true);
        },
      ),
    );
  });

  it("replaces only wall cells with flaps at any pose", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const walls = new Set(
          TUNNEL_LAYOUT.walls.map(({ cell }) =>
            cellKey(tentCellAt(pose, cell)),
          ),
        );
        for (const id of FLAP_IDS) {
          expect(flapCells(pose, id)).toEqual(
            TUNNEL_LAYOUT.flaps[id].map((cell) => tentCellAt(pose, cell)),
          );
          for (const cell of flapCells(pose, id))
            expect(walls.has(cellKey(cell))).toBe(true);
        }
      }),
    );
  });
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

describe("buildLayout dimension validation", () => {
  const dims = "Invalid tent layout dimensions";
  const arbBad = fc.constantFrom(0.5, 1.5, Number.NaN);

  it("rejects depths that are not strictly increasing integers", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (front, inner, rear) => {
          fc.pre(!(front < inner && inner < rear));
          expect(() =>
            buildLayout({ ...spec(), depths: { front, inner, rear } }),
          ).toThrow(dims);
        },
      ),
    );
  });

  it("rejects non-integer depths and wall widths", () => {
    fc.assert(
      fc.property(arbBad, (bad) => {
        const base = spec();
        expect(() =>
          buildLayout({ ...base, depths: { ...base.depths, inner: bad } }),
        ).toThrow(dims);
        expect(() =>
          buildLayout({ ...base, wallHalfWidths: [3, bad] }),
        ).toThrow(dims);
        expect(() =>
          buildLayout({ ...base, clear: { ...base.clear, depth: bad } }),
        ).toThrow(dims);
      }),
    );
  });

  it("rejects empty or sub-1 wall widths and non-positive clear sizes", () => {
    const base = spec();
    expect(() => buildLayout({ ...base, wallHalfWidths: [] })).toThrow(dims);
    expect(() => buildLayout({ ...base, wallHalfWidths: [3, 0] })).toThrow(
      dims,
    );
    expect(() =>
      buildLayout({ ...base, clear: { ...base.clear, layers: 0 } }),
    ).toThrow(dims);
    expect(() =>
      buildLayout({ ...base, clear: { ...base.clear, halfWidth: -1 } }),
    ).toThrow(dims);
  });

  it("rejects an invalid ceiling strip", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        (from, gap) => {
          const base = spec();
          const bad = (strip: Partial<TentLayoutSpec["ceilings"][number]>) =>
            buildLayout({
              ...base,
              ceilings: [
                { halfWidth: 1, depthFrom: 2, depthTo: 6, layer: 3 },
                { halfWidth: 1, depthFrom: 0, depthTo: 0, layer: 1, ...strip },
              ],
            });
          const msg = "Invalid tent ceiling strip";
          expect(() => bad({ depthFrom: from + gap, depthTo: from })).toThrow(
            msg,
          );
          expect(() => bad({ halfWidth: -gap })).toThrow(msg);
          expect(() => bad({ halfWidth: gap + 0.5 })).toThrow(msg);
          expect(() => bad({ layer: from + 0.5 })).toThrow(msg);
        },
      ),
    );
  });
});
