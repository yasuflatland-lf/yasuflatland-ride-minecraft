import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, boxWithHeight, cellBox } from "../../../src/domain/build/box";
import { isUsableMaterial } from "../../../src/domain/build/edit/guard";
import {
  adjustHeight,
  airPressOffersUndo,
  type BuildFlow,
  backToAiming,
  cancel,
  chooseHeighted,
  chooseStairs,
  chooseTerrain,
  closeBuildMenu,
  confirmLiveHeight,
  confirmTappedSpan,
  cornerTaps,
  enteredBaseHeight,
  fixStairGoal,
  openBuildMenu,
  opensUtilityMenu,
  setHeight,
  tapAir,
  tapBlock,
  tappedSpanHeight,
  tapsOf,
  withoutStepBack,
} from "../../../src/domain/build/flow/flow";
import {
  buildEntries,
  buildMenu,
  contentsMenu,
  isShapeEntryOffered,
  shapeMenu,
  stairContentsMenu,
  terraceMenu,
  terrainMenu,
  utilityMenu,
} from "../../../src/domain/build/flow/menu";
import { beginPasteAim } from "../../../src/domain/build/flow/paste";
import { selectionOf } from "../../../src/domain/build/selection";
import { BuildSession } from "../../../src/domain/build/session";
import { shapeOf } from "../../../src/domain/build/shape/shape";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { staircaseToward } from "../../../src/domain/build/stairs/staircase";
import {
  fillStylesFor,
  type HeightedKind,
} from "../../../src/domain/build/volume/kind";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { PLACE_KEPT_BLOCKS } from "../../../src/domain/shared/keptBlocks";
import { selectionBoxOf } from "../../../src/test-pack/scenarios/support/buildSelection";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import { confirmEndpointHeight } from "../../support/buildSelection";

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
      confirmEndpointHeight(tapAir(tapBlock(idle, dim, a, stone), b)),
    ),
  );

it("detects only transitions into base height", () => {
  const endpoint = fc
    .tuple(cell, cell)
    .map(([from, to]) => tapAir(tapBlock(idle, dim, from, stone), to));
  const flow = fc.oneof(flows, endpoint);
  fc.assert(
    fc.property(flow, flow, (before, after) => {
      expect(enteredBaseHeight(before, after)).toBe(
        after.kind === "baseHeight" && before.kind !== "baseHeight",
      );
    }),
  );
});

it("uses the minimum and maximum box corners as taps", () => {
  fc.assert(
    fc.property(cell, cell, (a, b) => {
      const box = boxOf(a, b);
      expect(cornerTaps(box)).toEqual({ from: box.min, to: box.max });
    }),
  );
});

it("keeps taps only in the selected and terrain confirmation flows", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 1, max: 20 }),
      (from, dx, dz) => {
        const to = { x: from.x - dx, y: from.y, z: from.z + dz };
        const point = tapBlock(idle, dim, from, stone);
        const base = tapAir(point, to);
        const selected = confirmEndpointHeight(base);
        for (const flow of [selected, chooseTerrain(selected, "fillBelow")])
          expect(tapsOf(flow)).toEqual({ from, to });
        for (const flow of [
          idle,
          point,
          base,
          chooseHeighted(selected, "cube"),
          beginPasteAim(),
        ])
          expect(tapsOf(flow)).toBeUndefined();
      },
    ),
  );
});

it("cancel always reaches idle, and air without an endpoint changes nothing", () => {
  fc.assert(
    fc.property(flows, (flow) => {
      expect(cancel(flow)).toEqual(idle);
      expect(tapAir(flow)).toBe(flow);
      expect(backToAiming(flow)).toBe(flow);
    }),
  );
});

it("selects the same box from an air press or a second block tap", () => {
  fc.assert(
    fc.property(cell, cell, (a, b) => {
      const endpoint = tapAir(tapBlock(idle, dim, a, stone), b);
      const aiming = tapBlock(idle, dim, a, stone);
      expect(aiming).toEqual({
        kind: "point1",
        dimensionId: dim,
        cell: a,
        material: stone,
      });
      expect(tapBlock(aiming, dim, b, dirt)).toEqual(endpoint);
      expect(tapAir(aiming, b)).toEqual(endpoint);
      expect(endpoint.kind).toBe(
        shapeOf(a, b).kind === "line" ? "selected" : "baseHeight",
      );
      expect(selectionBoxOf(confirmEndpointHeight(endpoint))).toEqual(
        boxOf(a, b),
      );
    }),
  );
});

it("a block tap in another dimension starts a fresh point 1 before selection", () => {
  fc.assert(
    fc.property(flows, cell, (flow, at) => {
      if (flow.kind === "selected") return;
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

it("keeps the selection on subsequent air and block taps", () => {
  fc.assert(
    fc.property(cell, cell, cell, (a, b, c) => {
      const endpoint = confirmEndpointHeight(
        tapAir(tapBlock(idle, dim, a, stone), b),
      );
      expect(tapBlock(endpoint, dim, c, dirt)).toBe(endpoint);
      expect(tapBlock(endpoint, other, c, dirt)).toBe(endpoint);
      expect(tapAir(endpoint, c)).toBe(endpoint);
      expect(tapAir(idle, c)).toBe(idle);
    }),
  );
});

it("offers the ordered root and build menus for every shape and returns unchanged from Back", () => {
  fc.assert(
    fc.property(cell, fc.integer({ min: 1, max: 20 }), (from, size) => {
      for (const delta of [
        { x: size, y: 0, z: 0 },
        { x: 0, y: size, z: size },
        { x: size, y: 0, z: size },
        { x: size, y: size, z: 0 },
        { x: size, y: size, z: size },
      ]) {
        const to = {
          x: from.x + delta.x,
          y: from.y + delta.y,
          z: from.z + delta.z,
        };
        const flow = confirmEndpointHeight(
          tapAir(tapBlock(idle, dim, from, stone), to),
        );
        const shape = shapeOf(from, to);
        const before = structuredClone(flow);
        const rootIds = [
          ...(shape.kind === "line" ? [] : ["adjustHeight"]),
          "cut",
          "removeAbove",
          shape.kind === "line" ? "place" : "buildShape",
          ...(shape.kind === "line" && from.y === to.y
            ? ["stairs", "terrace"]
            : []),
          "copy",
          "fillBelow",
          "cancel",
        ];
        expect(shapeMenu(flow).map((e) => e.id)).toEqual(rootIds);
        expect(buildMenu(flow)).toEqual([]);
        const opened = openBuildMenu(flow);
        expect(opened).toEqual({ ...flow, menuLevel: "build" });
        expect(shapeMenu(opened)).toEqual([]);
        expect(buildMenu(opened)).toEqual([
          ...buildEntries(shape),
          { id: "back" },
        ]);
        expect(closeBuildMenu(opened)).toEqual(flow);
        expect(adjustHeight(opened)).toBe(opened);
        expect(adjustHeight(idle)).toBe(idle);
        if (shape.kind === "line") expect(adjustHeight(flow)).toBe(flow);
        expect(closeBuildMenu(flow)).toBe(flow);
        expect(openBuildMenu(opened)).toBe(opened);
        expect(tapAir(opened, to)).toBe(opened);
        expect(Object.isFrozen(opened)).toBe(true);
        for (const entry of [...shapeMenu(flow), ...buildMenu(opened)]) {
          expect(isShapeEntryOffered(flow, entry.id)).toBe(
            rootIds.includes(entry.id),
          );
          expect(isShapeEntryOffered(opened, entry.id)).toBe(
            buildMenu(opened).some((e) => e.id === entry.id),
          );
        }
        expect(flow).toEqual(before);
      }
      for (const flow of [
        idle,
        tapBlock(idle, dim, from, stone),
        beginPasteAim(),
        chooseHeighted(
          confirmEndpointHeight(
            tapAir(tapBlock(idle, dim, from, stone), {
              ...from,
              x: from.x + 2,
              z: from.z + 2,
            }),
          ),
          "gable",
        ),
        chooseTerrain(
          confirmEndpointHeight(tapAir(tapBlock(idle, dim, from, stone), from)),
          "removeAbove",
        ),
      ]) {
        expect(openBuildMenu(flow)).toBe(flow);
        expect(closeBuildMenu(flow)).toBe(flow);
        expect(shapeMenu(flow)).toEqual([]);
        expect(buildMenu(flow)).toEqual([]);
        expect(isShapeEntryOffered(flow, "cancel")).toBe(false);
      }
    }),
  );
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
        if (confirmed) session.confirmBox(selectionOf(dim, box, stone));
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
            ],
          ],
          [
            { x: dx, y: dy, z: dz },
            [
              "fill",
              "faces",
              "walls",
              "gable",
              "hip",
              "cylinder",
              "sideCylinder",
              "sphere",
              "cube",
            ],
          ],
          [{ x: dx, y: dy, z: 0 }, ["fill", "frame"]],
          [{ x: 0, y: dy, z: dz }, ["fill", "frame"]],
          [{ x: dx, y: 0, z: 0 }, ["place"]],
          [{ x: 0, y: dy, z: 0 }, ["place"]],
          [{ x: 0, y: 0, z: dz }, ["place"]],
        ] as const) {
          const end = {
            x: origin.x + offset.x,
            y: origin.y + offset.y,
            z: origin.z + offset.z,
          };
          const from = reverse ? end : origin;
          const to = reverse ? origin : end;
          const flow = confirmEndpointHeight(
            tapAir(tapBlock(idle, dim, from, stone), to),
          );
          expect(buildEntries(shapeOf(from, to)).map((e) => e.id)).toEqual(ids);
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
            const locked = kind !== "gable" && kind !== "hip";
            expect(chosen).toEqual({
              kind: "heightStep",
              dimensionId: dim,
              from,
              material: stone,
              heightedKind: kind,
              base: { min: origin, max: { ...end, y: origin.y } },
              previous: locked ? offset.y + 1 : 1,
              ...(!locked && offset.y !== 0
                ? { selectionBefore: boxOf(origin, end) }
                : {}),
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

it.each(["gable", "hip"] as const)(
  "locks a stair %s to its pitch and keeps the original box for Undo",
  (kind) => {
    const min = { x: 0, y: BUILD_SPEC.worldTopY - 2, z: 0 };
    const box = boxOf(min, { x: 4, y: min.y + 1, z: 6 });
    const stair = blockStateOf("minecraft:oak_stairs", {
      weirdo_direction: 3,
      upside_down_bit: true,
    });
    const selected = {
      kind: "selected",
      menuLevel: "build",
      selection: selectionOf(dim, box, stair),
      from: box.min,
      to: box.max,
    } as const;
    const flow = chooseHeighted(selected, kind);
    expect(flow).toMatchObject({
      kind: "heightStep",
      base: boxWithHeight(box, 1),
      selectionBefore: box,
      heightLocked: true,
      roofStyle: "stair",
      previous: 3,
    });
    expect(setHeight(flow, 1)).toBe(flow);
    expect(chooseHeighted(selected, "cube")).toMatchObject({ previous: 2 });
    expect(chooseHeighted(selected, "cube")).not.toHaveProperty("roofStyle");

    const aboveTop = {
      ...selected,
      selection: selectionOf(
        dim,
        cellBox({ ...box.min, y: min.y + 1 }, { ...box.max, y: min.y + 1 }),
        stair,
      ),
    };
    expect(chooseHeighted(aboveTop, kind)).toBe(aboveTop);
  },
);

it("roof and paste stages accept only their own transitions and ignore selection taps", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      fc.constantFrom("gable" as const, "hip" as const),
      fc.integer(),
      (a, b, kind, height) => {
        const endpoint = confirmEndpointHeight(
          tapAir(tapBlock(idle, dim, a, stone), b),
        );
        const shape = shapeOf(a, b);
        const roof = chooseHeighted(endpoint, kind);
        if (
          shape.kind === "box" ||
          (shape.kind === "rect" && shape.flat === "y")
        ) {
          expect(roof).toEqual({
            kind: "heightStep",
            heightLocked: false,
            dimensionId: dim,
            base: boxWithHeight(boxOf(a, b), 1),
            ...(shape.kind === "box" && endpoint.kind === "selected"
              ? { selectionBefore: endpoint.selection.box }
              : {}),
            from: a,
            heightedKind: kind,
            previous: 1,
            material: stone,
          });
        } else expect(roof).toBe(endpoint);
        const horizontal = chooseHeighted(
          confirmEndpointHeight(
            tapAir(tapBlock(idle, dim, a, stone), {
              x: a.x + 2,
              y: a.y,
              z: a.z + 3,
            }),
          ),
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
          expect(setHeight(flow, height)).toEqual(
            flow.kind === "heightStep" ? { ...flow, previous: height } : flow,
          );
          if (flow.kind !== "selected")
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
        const endpoint = confirmEndpointHeight(
          tapAir(tapBlock(idle, dim, from, stone), to),
        );
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

it("offers Undo on a plain air press only when idle", () => {
  const cell = { x: 0, y: 0, z: 0 };
  const flows: BuildFlow[] = [
    { kind: "idle" },
    { kind: "point1", dimensionId: dim, cell, material: stone },
    {
      kind: "selected",
      menuLevel: "root",
      selection: selectionOf(dim, boxOf(cell, cell), stone),
      from: cell,
      to: cell,
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
      expect(airPressOffersUndo(flow)).toBe(flow.kind === "idle");
      if (flow.kind === "idle") expect(airPressOffersUndo(flow)).toBe(true);
      if (flow.kind === "selected")
        expect(opensUtilityMenu(flow, false)).toBe(true);
    }),
  );
});

it("enters the terrain confirmation only from an end point, keeps the points, and returns to aiming on Cancel", () => {
  fc.assert(
    fc.property(cell, cell, cell, (a, b, c) => {
      const first = tapBlock(idle, dim, a, stone);
      const endpoint = confirmEndpointHeight(tapAir(first, b));
      for (const flow of [idle, first, beginPasteAim()])
        expect(chooseTerrain(flow, "removeAbove")).toBe(flow);
      const confirming = chooseTerrain(endpoint, "removeAbove");
      expect(confirming).toEqual({
        kind: "terrainConfirm",
        selection: selectionOf(dim, boxOf(a, b), stone),
        from: a,
        to: b,
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

it("offers Cut then Remove above first for every shape and the confirmation only in its state", () => {
  fc.assert(
    fc.property(cell, cell, (a, b) => {
      const endpoint = confirmEndpointHeight(
        tapAir(tapBlock(idle, dim, a, stone), b),
      );
      const ids = shapeMenu(endpoint).map((entry) => entry.id);
      expect(ids.filter((id) => id !== "adjustHeight").slice(0, 2)).toEqual([
        "cut",
        "removeAbove",
      ]);
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

it("offers Stairs only for a horizontal row and returns from either stair flow to point 1", () => {
  const from = { x: 2, y: 5, z: 0 };
  const point = tapBlock(idle, dim, from, stone);
  const chosen = tapAir(point, { ...from, x: 0 });
  const aim = chooseStairs(chosen, "stairs");
  if (aim.kind !== "stairAim") throw new Error("Expected stair aim");
  expect(aim.taps.from).toEqual(from);
  expect(aim.selectionBefore).toEqual(selectionBoxOf(chosen));
  const staircase = staircaseToward(aim.row, { x: 50, y: 7, z: -4 });
  if (!staircase) throw new Error("Expected staircase");
  const contents = fixStairGoal(aim, staircase);
  const session = new BuildSession(asPlayerId("p"));
  session.setFlow(contents);
  expect(session.isInBuildMode).toBe(true);
  expect(fixStairGoal(chosen, staircase)).toBe(chosen);
  expect(backToAiming(aim)).toEqual(point);
  expect(backToAiming(contents)).toEqual(point);
  expect(stairContentsMenu(aim)).toEqual([]);
  expect(stairContentsMenu(contents)).toEqual([
    { id: "passage" },
    { id: "fillBelow" },
    { id: "stepsOnly" },
    { id: "cancel" },
  ]);
  for (const to of [
    { ...from, y: 7 },
    { ...from, x: 0, z: 2 },
  ]) {
    const other = confirmEndpointHeight(tapAir(point, to));
    expect(isShapeEntryOffered(other, "stairs")).toBe(false);
    expect(chooseStairs(other, "stairs")).toBe(other);
  }
  expect(shapeMenu(chosen).map(({ id }) => id)).toEqual([
    "cut",
    "removeAbove",
    "place",
    "stairs",
    "terrace",
    "copy",
    "fillBelow",
    "cancel",
  ]);
});

it("offers Stairs and Terrace after Build shape for a single-cell box only when both taps match it", () => {
  fc.assert(
    fc.property(cell, (foot) => {
      const point = tapBlock(idle, dim, foot, stone);
      const selected = confirmEndpointHeight(tapBlock(point, dim, foot, stone));
      if (selected.kind !== "selected")
        throw new Error("Expected a selected cell");
      expect(shapeMenu(selected).map(({ id }) => id)).toEqual([
        "adjustHeight",
        "cut",
        "removeAbove",
        "buildShape",
        "stairs",
        "terrace",
        "copy",
        "fillBelow",
        "cancel",
      ]);
      const next = { ...foot, x: foot.x + 1 };
      for (const flow of [
        { ...selected, from: next },
        { ...selected, to: next },
        { ...selected, from: next, to: next },
        {
          ...selected,
          selection: selectionOf(
            dim,
            boxWithHeight(boxOf(foot, foot), 2),
            stone,
          ),
        },
      ]) {
        for (const op of ["stairs", "terrace"] as const) {
          expect(isShapeEntryOffered(flow, op)).toBe(false);
          expect(chooseStairs(flow, op)).toBe(flow);
        }
      }
    }),
  );
});

it("opens Terrace confirmation from a single-cell foot", () => {
  const foot = { x: 2, y: 5, z: 1 };
  const point = tapBlock(idle, dim, foot, stone);
  const selected = confirmEndpointHeight(tapBlock(point, dim, foot, stone));
  const aim = chooseStairs(selected, "terrace");
  if (aim.kind !== "stairAim") throw new Error("Expected stair aim");
  expect(aim.op).toBe("terrace");
  expect(aim.row).toEqual({ min: foot, max: foot, y: 5, along: undefined });
  const staircase = staircaseToward(aim.row, { x: 6, y: 7, z: 2 });
  if (!staircase) throw new Error("Expected staircase");
  const contents = fixStairGoal(aim, staircase);
  expect(terraceMenu(contents)).toEqual([{ id: "confirm" }, { id: "cancel" }]);
  expect(stairContentsMenu(contents)).toEqual([]);
});

it("uses the rotated selection as the stair foot and keeps the tapped point for Cancel", () => {
  const from = { x: 3, y: 5, z: 0 };
  const to = { ...from, x: 1 };
  const point = tapBlock(idle, dim, from, stone);
  const session = new BuildSession(asPlayerId("p"));
  session.setFlow(tapAir(point, to));
  const rotated = boxOf({ x: 2, y: 5, z: -1 }, { x: 2, y: 5, z: 1 });
  session.replaceSelection(selectionOf(dim, rotated, stone));
  const aim = chooseStairs(session.flow, "stairs");
  expect(aim).toMatchObject({
    kind: "stairAim",
    row: { ...rotated, along: "z", y: 5 },
    selectionBefore: rotated,
  });
  expect(backToAiming(aim)).toEqual(point);
});

it("starts and re-enters live height at the clamped tapped span", () => {
  fc.assert(
    fc.property(cell, cell, (from, to) => {
      const flow = tapBlock(tapBlock(idle, dim, from, stone), dim, to, dirt);
      fc.pre(flow.kind === "baseHeight");
      if (flow.kind !== "baseHeight") return;
      const box = flow.selection.box;
      const expected = Math.min(
        Math.abs(to.y - from.y) + 1,
        Math.max(
          1,
          Math.min(
            BUILD_SPEC.worldTopY - box.min.y + 1,
            Math.floor(
              BUILD_SPEC.maxCopyVolume /
                ((Math.abs(to.x - from.x) + 1) * (Math.abs(to.z - from.z) + 1)),
            ),
          ),
        ),
      );
      expect(tappedSpanHeight(box)).toBe(expected);
      expect(flow.previous).toBe(tappedSpanHeight(box));
      const adjusted = adjustHeight({
        kind: "selected",
        menuLevel: "root",
        selection: flow.selection,
        from,
        to,
      });
      expect(adjusted).toEqual(withoutStepBack(flow));
    }),
  );
});

it("confirms the tapped span at root independently of the live height", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      fc.constantFrom(dim, other),
      fc.constantFrom(stone, dirt),
      fc.integer(),
      (from, to, dimensionId, material, previous) => {
        const flow = tapAir(tapBlock(idle, dimensionId, from, material), to);
        fc.pre(flow.kind === "baseHeight");
        if (flow.kind !== "baseHeight") return;
        const box = boxOf(from, to);
        const expected = {
          kind: "selected",
          menuLevel: "root",
          from,
          to,
          selection: selectionOf(
            dimensionId,
            boxWithHeight(box, tappedSpanHeight(box)),
            material,
          ),
        };
        expect(confirmTappedSpan({ ...flow, previous })).toEqual(expected);
        const reopened = adjustHeight(
          confirmLiveHeight({ ...flow, previous: 2 }),
        );
        if (reopened.kind === "baseHeight")
          expect(confirmTappedSpan(reopened)).toEqual(expected);
      },
    ),
  );
});

it("keeps the fresh endpoint through live height updates but ends it on confirmation and adjustment", () => {
  fc.assert(
    fc.property(cell, fc.integer({ min: 1, max: 20 }), (start, height) => {
      const point = tapBlock(idle, dim, start, stone);
      const base = tapAir(point, { ...start, x: start.x + 3, z: start.z + 2 });
      if (base.kind !== "baseHeight") throw new Error("Expected base height");
      expect(setHeight(base, height)).toHaveProperty("stepBackTo", point);
      for (const confirmed of [
        confirmLiveHeight(base),
        confirmTappedSpan(base),
      ]) {
        expect(confirmed).not.toHaveProperty("stepBackTo");
        expect(adjustHeight(confirmed)).not.toHaveProperty("stepBackTo");
        const session = new BuildSession(asPlayerId("p"));
        session.setFlow(base);
        session.confirmBox(confirmed.selection, "selected", {
          from: base.from,
          to: base.to,
        });
        expect(session.flow).not.toHaveProperty("stepBackTo");
        session.selectPasted(confirmed.selection);
        expect(session.flow).not.toHaveProperty("stepBackTo");
      }
    }),
  );
});
