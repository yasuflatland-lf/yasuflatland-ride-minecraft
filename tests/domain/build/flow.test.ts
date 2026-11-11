import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { isUsableMaterial } from "../../../src/domain/build/edit/guard";
import {
  airPressOffersUndo,
  type BuildFlow,
  backToAiming,
  cancel,
  chooseHeighted,
  chooseTerrain,
  enterRotateMode,
  finishHeightStep,
  finishRotateMode,
  opensUtilityMenu,
  selectionBoxOf,
  setHeight,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import {
  contentsMenu,
  shapeMenu,
  terrainMenu,
  utilityMenu,
} from "../../../src/domain/build/flow/menu";
import { beginPasteAim } from "../../../src/domain/build/flow/paste";
import { BuildSession } from "../../../src/domain/build/session";
import { shapeOf, stylesFor } from "../../../src/domain/build/shape/shape";
import {
  fillStylesFor,
  type HeightedKind,
} from "../../../src/domain/build/volume/kind";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { PLACE_KEPT_BLOCKS } from "../../../src/domain/shared/keptBlocks";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";

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
          ? ["gable", "hip", "cylinder", "sideCylinder", "sphere", "cube"]
          : shape.kind === "box"
            ? ["cylinder", "sideCylinder", "sphere"]
            : []),
        "fillBelow",
        "removeAbove",
        "cut",
        "copy",
        "rotate",
        "cancel",
      ]);
    }),
  );
  for (const [to, ids] of [
    [
      { x: 3, y: 0, z: 0 },
      ["place", "fillBelow", "removeAbove", "cut", "copy", "rotate", "cancel"],
    ],
    [
      { x: 3, y: 0, z: 3 },
      [
        "fill",
        "frame",
        "gable",
        "hip",
        "cylinder",
        "sideCylinder",
        "sphere",
        "cube",
        "fillBelow",
        "removeAbove",
        "cut",
        "copy",
        "rotate",
        "cancel",
      ],
    ],
    [
      { x: 3, y: 3, z: 3 },
      [
        "fill",
        "faces",
        "walls",
        "cylinder",
        "sideCylinder",
        "sphere",
        "fillBelow",
        "removeAbove",
        "cut",
        "copy",
        "rotate",
        "cancel",
      ],
    ],
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
        if (clipboard)
          holdClipboard(
            session,
            structureClipboard(box, () => stone),
          );
        if (history)
          session.finishEdit(
            {
              dimensionId: dim,
              changes: [{ cell: at, before: dirt, after: stone }],
            },
            "undoable",
          );
        if (aiming) session.setFlow(tapBlock(idle, dim, at, stone));
        expect(utilityMenu(session).map((e) => e.id)).toEqual([
          ...(confirmed ? ["copy"] : []),
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

it("accepts every heighted kind only on its supported shapes", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 1, max: 20 }),
      fc.boolean(),
      (origin, dx, dy, dz, reverse) => {
        for (const [offset, ids] of [
          [
            { x: dx, y: 0, z: dz },
            [
              "fill",
              "frame",
              "gable",
              "hip",
              "cylinder",
              "sideCylinder",
              "sphere",
              "cube",
              "fillBelow",
              "removeAbove",
              "cut",
              "copy",
              "rotate",
              "cancel",
            ],
          ],
          [
            { x: dx, y: dy, z: dz },
            [
              "fill",
              "faces",
              "walls",
              "cylinder",
              "sideCylinder",
              "sphere",
              "fillBelow",
              "removeAbove",
              "cut",
              "copy",
              "rotate",
              "cancel",
            ],
          ],
          [
            { x: dx, y: dy, z: 0 },
            [
              "fill",
              "frame",
              "fillBelow",
              "removeAbove",
              "cut",
              "copy",
              "rotate",
              "cancel",
            ],
          ],
          [
            { x: 0, y: dy, z: dz },
            [
              "fill",
              "frame",
              "fillBelow",
              "removeAbove",
              "cut",
              "copy",
              "rotate",
              "cancel",
            ],
          ],
          [
            { x: dx, y: 0, z: 0 },
            [
              "place",
              "fillBelow",
              "removeAbove",
              "cut",
              "copy",
              "rotate",
              "cancel",
            ],
          ],
          [
            { x: 0, y: dy, z: 0 },
            [
              "place",
              "fillBelow",
              "removeAbove",
              "cut",
              "copy",
              "rotate",
              "cancel",
            ],
          ],
          [
            { x: 0, y: 0, z: dz },
            [
              "place",
              "fillBelow",
              "removeAbove",
              "cut",
              "copy",
              "rotate",
              "cancel",
            ],
          ],
        ] as const) {
          const end = {
            x: origin.x + offset.x,
            y: origin.y + offset.y,
            z: origin.z + offset.z,
          };
          const from = reverse ? end : origin;
          const to = reverse ? origin : end;
          const flow = tapAir(tapBlock(idle, dim, from, stone), to);
          expect(shapeMenu(flow).map((e) => e.id)).toEqual(ids);
          for (const kind of [
            "gable",
            "hip",
            "cylinder",
            "sphere",
            "cube",
          ] as const) {
            const chosen = chooseHeighted(flow, kind);
            if (!(ids as readonly string[]).includes(kind)) {
              expect(chosen).toBe(flow);
              continue;
            }
            const locked = offset.y !== 0;
            expect(chosen).toEqual({
              kind: "heightStep",
              dimensionId: dim,
              from,
              material: stone,
              heightedKind: kind,
              base: { min: origin, max: { ...end, y: origin.y } },
              previous: locked ? dy + 1 : 1,
              heightLocked: locked,
            });
            expect(contentsMenu(chosen).map((e) => e.id)).toEqual(
              kind === "cylinder" || kind === "cube"
                ? ["fill", "hollow", "tube", "cancel"]
                : ["fill", "hollow", "cancel"],
            );
            if (locked) expect(setHeight(chosen, 999)).toBe(chosen);
            expect(backToAiming(chosen)).toEqual({
              kind: "point1",
              dimensionId: dim,
              cell: from,
              material: stone,
            });
          }
        }
      },
    ),
  );
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
        const roof = chooseHeighted(endpoint, kind);
        if (shape.kind === "rect" && shape.flat === "y") {
          expect(roof).toEqual({
            kind: "heightStep",
            heightLocked: false,
            dimensionId: dim,
            base: boxOf(a, b),
            from: a,
            heightedKind: kind,
            previous: 1,
            material: stone,
          });
        } else expect(roof).toBe(endpoint);
        const horizontal = chooseHeighted(
          tapAir(tapBlock(idle, dim, a, stone), {
            x: a.x + 2,
            y: a.y,
            z: a.z + 3,
          }),
          kind,
        );
        const paste = beginPasteAim();
        for (const flow of [
          idle,
          tapBlock(idle, dim, a, stone),
          endpoint,
          horizontal,
          paste,
        ]) {
          expect(finishHeightStep(flow, hollow)).toEqual(
            flow.kind === "heightStep" ? idle : flow,
          );
          expect(setHeight(flow, height)).toEqual(
            flow.kind === "heightStep" ? { ...flow, previous: height } : flow,
          );
          if (flow.kind !== "endpoint")
            expect(chooseHeighted(flow, kind)).toBe(flow);
          expect(contentsMenu(flow)).toEqual(
            flow.kind === "heightStep"
              ? [{ id: "fill" }, { id: "hollow" }, { id: "cancel" }]
              : [],
          );
          expect(cancel(flow)).toEqual(idle);
        }
        for (const flow of [horizontal, paste]) {
          expect(tapBlock(flow, other, b, dirt)).toBe(flow);
          expect(tapAir(flow, b)).toBe(flow);
          expect(backToAiming(flow)).toEqual(
            flow.kind === "heightStep"
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
          expect(backToAiming(chooseHeighted(endpoint, kind))).toEqual({
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

it("offers each heighted kind's fill styles followed by Cancel", () => {
  fc.assert(
    fc.property(
      fc.constantFrom<HeightedKind>(
        "gable",
        "hip",
        "cylinder",
        "sphere",
        "cube",
      ),
      cell,
      cell,
      (kind, from, to) => {
        const flow: BuildFlow = {
          kind: "heightStep",
          dimensionId: dim,
          base: boxOf(from, to),
          from,
          heightedKind: kind,
          previous: 1,
          heightLocked: false,
          material: stone,
        };
        expect(contentsMenu(flow).map((entry) => entry.id)).toEqual([
          ...fillStylesFor(kind),
          "cancel",
        ]);
      },
    ),
  );
});

it("opens the utility menu when sneaking or idle, never otherwise", () => {
  const flows: BuildFlow[] = [
    { kind: "idle" },
    {
      kind: "point1",
      dimensionId: dim,
      cell: { x: 0, y: 0, z: 0 },
      material: stone,
    },
  ];
  fc.assert(
    fc.property(fc.constantFrom(...flows), fc.boolean(), (flow, sneaking) => {
      expect(opensUtilityMenu(flow, sneaking)).toBe(
        sneaking || flow.kind === "idle",
      );
    }),
  );
});

it("offers Undo on a plain air press only when idle or aiming a paste", () => {
  const cell = { x: 0, y: 0, z: 0 };
  const flows: BuildFlow[] = [
    { kind: "idle" },
    { kind: "point1", dimensionId: dim, cell, material: stone },
    {
      kind: "endpoint",
      dimensionId: dim,
      from: cell,
      to: cell,
      material: stone,
    },
    {
      kind: "heightStep",
      dimensionId: dim,
      base: boxOf(cell, cell),
      from: cell,
      heightedKind: "cylinder",
      previous: 1,
      heightLocked: false,
      material: stone,
    },
    beginPasteAim(),
    beginPasteAim(),
  ];
  fc.assert(
    fc.property(fc.constantFrom(...flows), (flow) => {
      expect(airPressOffersUndo(flow)).toBe(
        flow.kind === "idle" || flow.kind === "pasteAim",
      );
      if (flow.kind === "idle" || flow.kind === "pasteAim")
        expect(airPressOffersUndo(flow)).toBe(true);
      expect(airPressOffersUndo(flow)).toBe(
        opensUtilityMenu(flow, false) || flow.kind === "pasteAim",
      );
    }),
  );
});

it("enters the terrain confirmation only from an end point, keeps the points, and returns to aiming on Cancel", () => {
  fc.assert(
    fc.property(cell, cell, cell, (a, b, c) => {
      const first = tapBlock(idle, dim, a, stone);
      const endpoint = tapAir(first, b);
      for (const flow of [idle, first, beginPasteAim()])
        expect(chooseTerrain(flow, "removeAbove")).toBe(flow);
      const confirming = chooseTerrain(endpoint, "removeAbove");
      expect(confirming).toEqual({
        kind: "terrainConfirm",
        dimensionId: dim,
        from: a,
        to: b,
        material: stone,
        op: "removeAbove",
      });
      expect(chooseTerrain(confirming, "removeAbove")).toBe(confirming);
      expect(tapBlock(confirming, dim, c, stone)).toBe(confirming);
      expect(tapAir(confirming, c)).toBe(confirming);
      expect(backToAiming(confirming)).toEqual(first);
      expect(cancel(confirming)).toEqual(idle);
      expect(opensUtilityMenu(confirming, false)).toBe(false);
      expect(airPressOffersUndo(confirming)).toBe(false);
    }),
  );
});

it("offers Remove above directly before Cut for every shape and the confirmation only in its state", () => {
  fc.assert(
    fc.property(cell, cell, (a, b) => {
      const endpoint = tapAir(tapBlock(idle, dim, a, stone), b);
      const ids = shapeMenu(endpoint).map((entry) => entry.id);
      expect(ids.indexOf("removeAbove")).toBe(ids.indexOf("cut") - 1);
      expect(terrainMenu(endpoint)).toEqual([]);
      const confirming = chooseTerrain(endpoint, "removeAbove");
      expect(shapeMenu(confirming)).toEqual([]);
      expect(terrainMenu(confirming).map((entry) => entry.id)).toEqual([
        "confirm",
        "cancel",
      ]);
    }),
  );
});

it("enters rotation only from endpoints and keeps ordinary gestures and menus inactive", () => {
  fc.assert(
    fc.property(cell, cell, fc.boolean(), (a, b, sneaking) => {
      const endpoint = tapAir(tapBlock(idle, dim, a, stone), b);
      const mode = enterRotateMode(endpoint);
      const box = boxOf(a, b);
      expect(mode).toEqual({
        kind: "rotateMode",
        dimensionId: dim,
        box,
        material: stone,
        turn: 1,
      });
      expect(selectionBoxOf(mode)).toEqual(box);
      expect(finishRotateMode(mode)).toEqual({
        kind: "endpoint",
        dimensionId: dim,
        from: box.min,
        to: box.max,
        material: stone,
      });
      for (const flow of [
        idle,
        tapBlock(idle, dim, a, stone),
        chooseHeighted(endpoint, "copy"),
        chooseTerrain(endpoint, "fillBelow"),
        beginPasteAim(),
        mode,
      ]) {
        if (flow.kind !== "endpoint") expect(enterRotateMode(flow)).toBe(flow);
        if (flow.kind !== "rotateMode")
          expect(finishRotateMode(flow)).toBe(flow);
      }
      expect(tapBlock(mode, other, a, dirt)).toBe(mode);
      expect(tapAir(mode, b)).toBe(mode);
      expect(backToAiming(mode)).toBe(mode);
      expect(chooseHeighted(mode, "copy")).toBe(mode);
      expect(chooseTerrain(mode, "fillBelow")).toBe(mode);
      expect(setHeight(mode, 5)).toBe(mode);
      expect(cancel(mode)).toEqual(idle);
      expect(opensUtilityMenu(mode, sneaking)).toBe(false);
      expect(airPressOffersUndo(mode)).toBe(false);
      expect(shapeMenu(mode)).toEqual([]);
      expect(contentsMenu(mode)).toEqual([]);
      expect(terrainMenu(mode)).toEqual([]);
      const session = new BuildSession(asPlayerId("alex"));
      session.setFlow(mode);
      expect(utilityMenu(session)).toEqual([]);
    }),
  );
});
