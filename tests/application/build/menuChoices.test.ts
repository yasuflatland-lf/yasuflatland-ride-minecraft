import fc from "fast-check";
import { expect, it } from "vitest";
import type { MenuChoices } from "../../../src/application/build/menuChoices";
import { boxOf } from "../../../src/domain/build/box";
import {
  buildMenu,
  contentsMenu,
  shapeMenu,
} from "../../../src/domain/build/flow/menu";
import {
  chooseStairs,
  fixStairGoal,
} from "../../../src/domain/build/flow/stairFlow";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import { backToAiming } from "../../../src/domain/build/flow/stepBack";
import { chooseTerrain } from "../../../src/domain/build/flow/terrainFlow";
import { selectionOf } from "../../../src/domain/build/selection";
import { staircaseToward } from "../../../src/domain/build/stairs/staircase";
import { cellOf } from "../../../src/domain/shared/cells";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import { chooseHeightedFlow } from "../../support/buildSelection";
import { overworld } from "./fakes";
import {
  endpoint,
  from,
  playerId,
  selected,
  setupMenuChoices,
  stone,
  to,
} from "./fakes/menuChoices";

const cell = fc.record({
  x: fc.integer({ min: -20, max: 20 }),
  y: fc.integer({ min: 0, max: 319 }),
  z: fc.integer({ min: -20, max: 20 }),
});

const command = { playerId };
const tick = 17;
const shapeRoutes = {
  fill: ["confirmShape", { playerId, style: "fill" }],
  frame: ["confirmShape", { playerId, style: "frame" }],
  faces: ["confirmShape", { playerId, style: "faces" }],
  walls: ["confirmShape", { playerId, style: "walls" }],
  gable: ["chooseHeighted", { playerId, kind: "gable" }],
  hip: ["chooseHeighted", { playerId, kind: "hip" }],
  cylinder: ["chooseHeighted", { playerId, kind: "cylinder" }],
  sphere: ["chooseHeighted", { playerId, kind: "sphere" }],
  cube: ["chooseHeighted", { playerId, kind: "cube" }],
  sideCylinder: ["chooseSideCylinder", command],
  stairs: ["chooseStairs", { playerId, op: "stairs" }],
  terrace: ["chooseStairs", { playerId, op: "terrace" }],
  copy: ["chooseBoxStep", { playerId, kind: "copy" }],
  cut: ["chooseBoxStep", { playerId, kind: "cut" }],
  removeAbove: ["chooseTerrain", { playerId, op: "removeAbove" }],
  fillBelow: ["chooseTerrain", { playerId, op: "fillBelow" }],
  buildShape: undefined,
  back: undefined,
  adjustHeight: undefined,
  cancel: ["clear", command],
} as const;
const contentsRoutes = {
  fill: ["confirmHeighted", { playerId, fill: "fill" }],
  hollow: ["confirmHeighted", { playerId, fill: "hollow" }],
  tube: ["confirmHeighted", { playerId, fill: "tube" }],
  cancel: undefined,
} as const;
const stairRoutes = {
  passage: ["confirmStairs", { playerId, contents: "passage" }],
  fillBelow: ["confirmStairs", { playerId, contents: "fillBelow" }],
  stepsOnly: ["confirmStairs", { playerId, contents: "stepsOnly" }],
  cancel: undefined,
} as const;
const terraceRoutes = {
  confirm: ["confirmTerrace", command],
  cancel: undefined,
} as const;
const terrainRoutes = {
  confirm: ["confirmTerrain", command],
  cancel: undefined,
} as const;

function expectDispatch(
  flow: BuildFlow,
  method: Extract<keyof MenuChoices, `choose${string}`>,
  offered: string[],
  routes: Record<
    string,
    | readonly [keyof ReturnType<typeof setupMenuChoices>["cases"], object]
    | undefined
  >,
) {
  expect(Object.keys(routes)).toEqual(expect.arrayContaining(offered));
  for (const [id, expected] of Object.entries({
    ...routes,
    invalid: undefined,
  })) {
    const { session, cases, choices } = setupMenuChoices();
    session.setFlowForTest(flow);
    const available = offered.includes(id);
    expect(choices[method](playerId, id, tick), id).toBe(available);
    const calls = Object.entries(cases).flatMap(([action, useCase]) => {
      return useCase.execute.mock.calls.map((args) => [action, ...args]);
    });
    expect(calls, id).toEqual(available && expected ? [expected] : []);
    if (!available) expect(session.flow).toBe(flow);
    else if (id === "cancel" && method !== "chooseShape")
      expect(session.flow).toEqual(backToAiming(flow));
  }
}

it("dispatches only entries offered by the current flow, including stale choices", () => {
  const span = fc.integer({ min: -2, max: 2 });
  fc.assert(
    fc.property(
      cell,
      span,
      span,
      span,
      fc.constantFrom("root", "build"),
      (start, dx, dy, dz, level) => {
        const flow = selected(
          cellOf(start),
          cellOf({ x: start.x + dx, y: start.y + dy, z: start.z + dz }),
          level,
        );
        expectDispatch(
          flow,
          "chooseShape",
          [...shapeMenu(flow), ...buildMenu(flow)].map(({ id }) => id),
          shapeRoutes,
        );
        expectDispatch(flow, "chooseContents", [], contentsRoutes);
      },
    ),
  );
  expectDispatch({ kind: "idle" }, "chooseShape", [], shapeRoutes);
});

it.each([
  ["box", cellOf({ ...to, y: from.y + 1 })],
  ["line", cellOf({ ...from, x: from.x + 3 })],
] as const)(
  "dispatches root Fill and rejects Place for a %s",
  (_shape, end) => {
    const { session, cases, choices } = setupMenuChoices();
    session.setFlowForTest(selected(from, end));
    expect(choices.chooseShape(playerId, "place", tick)).toBe(false);
    expect(cases.confirmShape.execute).not.toHaveBeenCalled();
    expect(choices.chooseShape(playerId, "fill", tick)).toBe(true);
    expect(cases.confirmShape.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      style: "fill",
    });
  },
);

it("dispatches only contents offered for the selected shape", () => {
  for (const kind of ["hip", "cube"] as const) {
    const flow = chooseHeightedFlow(endpoint, kind);
    expectDispatch(
      flow,
      "chooseContents",
      contentsMenu(flow).map(({ id }) => id),
      contentsRoutes,
    );
  }
});

it("dispatches stair and terrace choices only for the matching fixed goal", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 5 }),
      fc.constantFrom("stairs", "terrace"),
      fc.boolean(),
      (width, op, fixed) => {
        const aim = chooseStairs(selected(from, { ...from, x: width - 1 }), op);
        if (aim.kind !== "stairAim") throw new Error("Expected stair aim");
        const goal = staircaseToward(aim.row, cellOf({ x: 0, y: 62, z: 4 }));
        if (!goal) throw new Error("Expected staircase");
        const flow = fixed ? fixStairGoal(aim, goal) : aim;
        expectDispatch(
          flow,
          "chooseStairContents",
          fixed && op === "stairs"
            ? ["passage", "fillBelow", "stepsOnly", "cancel"]
            : [],
          { ...stairRoutes, confirm: undefined },
        );
        expectDispatch(
          flow,
          "chooseTerrace",
          fixed && op === "terrace" ? ["confirm", "cancel"] : [],
          { ...terraceRoutes, passage: undefined },
        );
      },
    ),
  );
});

it("validates utility availability before dispatching", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      (confirmed, clipboard, history) => {
        const { session, cases, choices } = setupMenuChoices();
        session.setFlowForTest({ kind: "idle" });
        const box = boxOf(from, to);
        if (confirmed) session.confirmBox(selectionOf(overworld, box, stone));
        if (clipboard)
          holdClipboard(
            session,
            structureClipboard(box, () => stone),
          );
        if (history)
          session.finishEdit(
            {
              dimensionId: overworld,
              changes: [{ cell: from, before: stone, after: stone }],
            },
            "undoable",
          );
        for (const [id, offered] of [
          ["copy", confirmed],
          ["undo", history],
          ["clear", confirmed],
        ] as const) {
          expect(choices.chooseUtility(playerId, id)).toBe(offered);
          if (offered)
            expect(cases[id].execute).toHaveBeenCalledExactlyOnceWith({
              playerId,
            });
          else expect(cases[id].execute).not.toHaveBeenCalled();
        }
      },
    ),
  );
});

it("ends paste aiming and clears the clipboard and confirmed box", () => {
  const { session, choices, cases } = setupMenuChoices();
  for (const flow of [
    { kind: "idle" } as const,
    {
      kind: "point1",
      start: { dimensionId: overworld, cell: from, material: stone },
    } as const,
    endpoint,
    chooseHeightedFlow(endpoint, "hip"),
  ]) {
    session.setFlowForTest(flow);
    expect(choices.choosePaste(playerId, "endPaste")).toBe(false);
  }
  expect(cases.endPasting.execute).not.toHaveBeenCalled();
  session.completeCopy(
    selectionOf(overworld, boxOf(from, to), stone),
    structureClipboard(boxOf(from, to), () => stone),
  );
  session.setFlowForTest({ kind: "pasteAim", manualTurn: 0 });
  expect(choices.choosePaste(playerId, "endPaste")).toBe(true);
  expect(cases.endPasting.execute).toHaveBeenCalledExactlyOnceWith(playerId);
  expect(session.flow.kind).toBe("idle");
  expect(session.clipboard).toBeUndefined();
  expect(session.confirmedBox).toBeUndefined();
  expect(choices.chooseUtility(playerId, "paste")).toBe(false);
  expect(choices.choosePaste(playerId, "endPaste")).toBe(false);
});

it("offers terrain entries only during the confirmation", () => {
  expectDispatch(endpoint, "chooseTerrain", [], terrainRoutes);
  expectDispatch(
    chooseTerrain(endpoint, "removeAbove"),
    "chooseTerrain",
    ["confirm", "cancel"],
    terrainRoutes,
  );
});

it("ignores responses for players without a session", () => {
  const { choices, repo, refresh } = setupMenuChoices();
  const absent = asPlayerId("absent");
  expect(choices.openShapeMenu(absent, tick)).toEqual([]);
  expect(choices.chooseShape(absent, "cut", tick)).toBe(false);
  expect(choices.chooseContents(absent, "fill")).toBe(false);
  expect(choices.chooseStairContents(absent, "passage")).toBe(false);
  expect(choices.chooseTerrace(absent, "confirm")).toBe(false);
  expect(choices.chooseTerrain(absent, "confirm")).toBe(false);
  expect(choices.chooseUtility(absent, "clear")).toBe(false);
  expect(choices.choosePaste(absent, "endPaste")).toBe(false);
  expect(choices.choosePaste(absent, "newCopy")).toBe(false);
  choices.submitHeight(absent, 3);
  expect(repo.get(absent)).toBeUndefined();
  expect(refresh).not.toHaveBeenCalled();
});

it("dispatches each offered paste entry exactly once and ignores all unoffered ids", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.oneof(
        fc.constantFrom(
          "undo",
          "endPaste",
          "copy",
          "paste",
          "cancel",
          "endPasting",
          "newCopy",
        ),
        fc.option(fc.string(), { nil: undefined }),
      ),
      (history, aiming, entryId) => {
        const { session, choices, cases } = setupMenuChoices();
        session.setFlowForTest(
          aiming ? { kind: "pasteAim", manualTurn: 0 } : { kind: "idle" },
        );
        if (history)
          session.finishEdit(
            {
              dimensionId: overworld,
              changes: [{ cell: from, before: stone, after: stone }],
            },
            "undoable",
          );
        const offered =
          aiming &&
          (entryId === "newCopy" ||
            entryId === "endPaste" ||
            entryId === "cancel");
        expect(choices.choosePaste(playerId, entryId)).toBe(offered);
        for (const useCase of Object.values(cases)) {
          expect(useCase.execute.mock.calls).toEqual(
            offered && entryId === "endPaste" && useCase === cases.endPasting
              ? [[playerId]]
              : [],
          );
        }
        expect(session.flow.kind).toBe(
          aiming && entryId !== "newCopy" && entryId !== "endPaste"
            ? "pasteAim"
            : "idle",
        );
      },
    ),
  );
});

it("refreshes the preview at the current tick after changing menu levels", () => {
  fc.assert(
    fc.property(fc.integer({ min: -100, max: 100 }), (x) => {
      const { session, choices, refresh } = setupMenuChoices();
      const initial = selected(
        cellOf({ ...from, x }),
        cellOf({ ...to, x: x + 3 }),
      );
      session.setFlowForTest(initial);
      const levels: unknown[] = [];
      refresh.mockImplementation(() => {
        levels.push(session.flow.kind === "selected" && session.flow.menuLevel);
      });
      expect(choices.chooseShape(playerId, "buildShape", tick)).toBe(true);
      expect(session.flow).toEqual({ ...initial, menuLevel: "build" });
      expect(choices.chooseShape(playerId, "back", tick)).toBe(true);
      expect(session.flow).toEqual(initial);
      expect(levels).toEqual(["build", "root"]);
      expect(refresh.mock.calls).toEqual([
        [playerId, tick],
        [playerId, tick],
      ]);
      expect(session.hasHistory).toBe(false);
      expect(session.clipboard).toBeUndefined();
    }),
  );
});

it("reopens height aiming from the selected height and reports the change once", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 40 }), (height) => {
      const { session, choices, feedback } = setupMenuChoices();
      const initial = selected(from, cellOf({ ...to, y: from.y + height - 1 }));
      session.setFlowForTest(initial);
      choices.openShapeMenu(playerId, tick);
      expect(choices.chooseShape(playerId, "adjustHeight", tick)).toBe(true);
      expect(choices.chooseShape(playerId, "adjustHeight", tick)).toBe(false);
      expect(feedback.messages).toEqual([{ message: "heightAim" }]);
      const flow = session.flow;
      if (flow.kind !== "baseHeight") throw new Error("Expected live height");
      expect(flow.liveHeight).toBe(height);
      expect(flow.baseBox.max.y).toBe(from.y);
      expect(session.confirmLiveHeight()).toBe(true);
      expect(session.flow).toEqual(initial);
    }),
  );
});
