import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import { isUsableMaterial } from "../../../src/domain/build/edit/guard";
import {
  type BuildFlow,
  backToAiming,
  cancel,
  chooseRoof,
  chooseRoofFill,
  setRoofHeight,
  startPaste,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import {
  roofMenu,
  shapeMenu,
  utilityMenu,
} from "../../../src/domain/build/flow/menu";
import { BuildSession } from "../../../src/domain/build/session";
import { shapeOf, stylesFor } from "../../../src/domain/build/shape/shape";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { PLACE_KEPT_BLOCKS } from "../../../src/domain/shared/keptBlocks";

const coord = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coord, y: coord, z: coord });
const dim = asDimensionId("minecraft:overworld");
const other = asDimensionId("minecraft:nether");
const stone = blockStateOf("minecraft:stone");
const dirt = blockStateOf("minecraft:dirt");
const idle: BuildFlow = { kind: "idle" };
const flows = fc
  .tuple(cell, cell)
  .chain(([a, b]) =>
    fc.constantFrom(
      idle,
      tapBlock(idle, dim, a, stone),
      tapAir(tapBlock(idle, dim, a, stone), b),
    ),
  );

it("cancel always reaches idle, and air without an endpoint changes nothing", () => {
  fc.assert(
    fc.property(flows, (flow) => {
      expect(cancel(flow)).toEqual(idle);
      expect(tapAir(flow)).toBe(flow);
      if (flow.kind !== "endpoint") expect(backToAiming(flow)).toBe(flow);
    }),
  );
});

it("menu Cancel keeps point 1 and tapping the same end restores the endpoint", () => {
  fc.assert(
    fc.property(cell, cell, (a, b) => {
      const endpoint = tapAir(tapBlock(idle, dim, a, stone), b);
      const aiming = backToAiming(endpoint);
      expect(aiming).toEqual({
        kind: "point1",
        dimensionId: dim,
        cell: a,
        material: stone,
      });
      expect(tapBlock(aiming, dim, b, dirt)).toEqual(endpoint);
      expect(tapAir(aiming, b)).toEqual(endpoint);
    }),
  );
});

it("a block tap in another dimension starts a fresh point 1", () => {
  fc.assert(
    fc.property(flows, cell, (flow, at) => {
      const before = structuredClone(flow);
      expect(tapBlock(flow, other, at, dirt)).toEqual({
        kind: "point1",
        dimensionId: other,
        cell: at,
        material: dirt,
      });
      expect(flow).toEqual(before);
    }),
  );
});

it("replaces only the end on subsequent taps, keeping dimension, point 1 and material", () => {
  fc.assert(
    fc.property(cell, cell, cell, (a, b, c) => {
      const endpoint = tapAir(tapBlock(idle, dim, a, stone), b);
      const expected = {
        kind: "endpoint",
        dimensionId: dim,
        from: a,
        to: c,
        material: stone,
      };
      expect(tapBlock(endpoint, dim, c, dirt)).toEqual(expected);
      expect(tapAir(endpoint, c)).toEqual(expected);
      expect(tapAir(idle, c)).toBe(idle);
    }),
  );
});

it("offers only supported shape styles followed by Cancel", () => {
  fc.assert(
    fc.property(cell, cell, (a, b) => {
      const first = tapBlock(idle, dim, a, stone);
      const shape = shapeOf(a, b);
      expect(shapeMenu(idle)).toEqual([]);
      expect(shapeMenu(first)).toEqual([]);
      expect(shapeMenu(tapAir(first, b)).map((e) => e.id)).toEqual([
        ...stylesFor(shape).map((style) =>
          shape.kind === "line" ? "place" : style,
        ),
        ...(shape.kind === "rect" && shape.flat === "y"
          ? ["gable", "hip"]
          : []),
        "cancel",
      ]);
    }),
  );
  for (const [to, ids] of [
    [{ x: 3, y: 0, z: 0 }, ["place", "cancel"]],
    [{ x: 3, y: 0, z: 3 }, ["fill", "frame", "gable", "hip", "cancel"]],
    [{ x: 3, y: 3, z: 3 }, ["fill", "faces", "walls", "cancel"]],
  ] as const)
    expect(
      shapeMenu(
        tapAir(tapBlock(idle, dim, { x: 0, y: 0, z: 0 }, stone), to),
      ).map((e) => e.id),
    ).toEqual(ids);
});

it("offers utility entries exactly when their prerequisites exist", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      cell,
      (confirmed, clipboard, history, aiming, at) => {
        const session = new BuildSession(asPlayerId("p"));
        const box = boxOf(at, at);
        if (confirmed) session.confirmBox(dim, box);
        if (clipboard) session.setClipboard(clipboardOf(box, () => stone));
        if (history)
          session.finishEdit(
            {
              dimensionId: dim,
              changes: [{ cell: at, before: dirt, after: stone }],
            },
            false,
          );
        if (aiming) session.setFlow(tapBlock(idle, dim, at, stone));
        expect(utilityMenu(session).map((e) => e.id)).toEqual([
          ...(confirmed ? ["copy"] : []),
          ...(clipboard ? ["paste"] : []),
          ...(history ? ["undo"] : []),
          ...(confirmed || aiming ? ["clear"] : []),
        ]);
      },
    ),
  );
});

it("refuses unreadable, open and data-holding material regardless of block states", () => {
  const refused = [
    ...PLACE_KEPT_BLOCKS,
    "minecraft:air",
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava",
    "minecraft:standing_sign",
    "minecraft:shulker_box",
  ];
  fc.assert(
    fc.property(
      fc.constantFrom(...refused),
      fc.dictionary(fc.string(), fc.integer()),
      (id, states) => {
        expect(isUsableMaterial(blockStateOf(id, states))).toBe(false);
      },
    ),
  );
  expect(isUsableMaterial(undefined)).toBe(false);
  expect(
    isUsableMaterial(
      blockStateOf("minecraft:oak_stairs", { upside_down_bit: true }),
    ),
  ).toBe(true);
});

it("roof and paste stages accept only their own transitions and ignore selection taps", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      fc.constantFrom("gable" as const, "hip" as const),
      fc.integer(),
      fc.boolean(),
      (a, b, kind, height, hollow) => {
        const endpoint = tapAir(tapBlock(idle, dim, a, stone), b);
        const shape = shapeOf(a, b);
        const roof = chooseRoof(endpoint, kind);
        if (shape.kind === "rect" && shape.flat === "y") {
          expect(roof).toEqual({
            kind: "roofHeight",
            dimensionId: dim,
            base: boxOf(a, b),
            from: a,
            roofKind: kind,
            previous: 1,
            material: stone,
          });
        } else expect(roof).toBe(endpoint);
        const horizontal = chooseRoof(
          tapAir(tapBlock(idle, dim, a, stone), {
            x: a.x + 2,
            y: a.y,
            z: a.z + 3,
          }),
          kind,
        );
        const paste = startPaste(idle, hollow);
        for (const flow of [
          idle,
          tapBlock(idle, dim, a, stone),
          endpoint,
          horizontal,
          paste,
        ]) {
          expect(chooseRoofFill(flow, hollow)).toEqual(
            flow.kind === "roofHeight" ? idle : flow,
          );
          expect(setRoofHeight(flow, height)).toEqual(
            flow.kind === "roofHeight" ? { ...flow, previous: height } : flow,
          );
          expect(startPaste(flow, hollow)).toEqual(
            flow.kind === "idle" ? { kind: "pasteAim", skipAir: hollow } : flow,
          );
          if (flow.kind !== "endpoint")
            expect(chooseRoof(flow, kind)).toBe(flow);
          expect(roofMenu(flow)).toEqual(
            flow.kind === "roofHeight"
              ? [{ id: "fill" }, { id: "hollow" }, { id: "cancel" }]
              : [],
          );
          expect(cancel(flow)).toEqual(idle);
        }
        for (const flow of [horizontal, paste]) {
          expect(tapBlock(flow, other, b, dirt)).toBe(flow);
          expect(tapAir(flow, b)).toBe(flow);
          expect(backToAiming(flow)).toEqual(
            flow.kind === "roofHeight"
              ? {
                  kind: "point1",
                  dimensionId: flow.dimensionId,
                  cell: flow.from,
                  material: flow.material,
                }
              : flow,
          );
        }
      },
    ),
  );
});

it("roof Cancel preserves the original first point for either selection direction", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 1, max: 20 }),
      fc.boolean(),
      (a, dx, dz, reverse) => {
        const b = { x: a.x + dx, y: a.y, z: a.z + dz };
        const from = reverse ? b : a;
        const to = reverse ? a : b;
        const endpoint = tapAir(tapBlock(idle, dim, from, stone), to);
        for (const kind of ["gable", "hip"] as const) {
          expect(backToAiming(chooseRoof(endpoint, kind))).toEqual({
            kind: "point1",
            dimensionId: dim,
            cell: from,
            material: stone,
          });
        }
      },
    ),
  );
});
