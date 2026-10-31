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
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { shapeMenu, utilityMenu } from "../../../src/domain/build/flow/menu";
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
        "cancel",
      ]);
    }),
  );
  for (const [to, ids] of [
    [{ x: 3, y: 0, z: 0 }, ["place", "cancel"]],
    [{ x: 3, y: 0, z: 3 }, ["fill", "frame", "cancel"]],
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
        if (clipboard) session.setClipboard(clipboardOf(box, at, () => stone));
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
