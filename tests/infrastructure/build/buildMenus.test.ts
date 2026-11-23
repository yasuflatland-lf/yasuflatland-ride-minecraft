import type { Player, RawMessage } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { BackToAiming } from "../../../src/application/build/backToAiming";
import { ChooseBoxStep } from "../../../src/application/build/chooseBoxStep";
import { ChooseHeighted } from "../../../src/application/build/chooseHeighted";
import { ChooseSideCylinder } from "../../../src/application/build/chooseSideCylinder";
import { ChooseStairs } from "../../../src/application/build/chooseStairs";
import { ChooseTerrain } from "../../../src/application/build/chooseTerrain";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import { CloseBuildMenu } from "../../../src/application/build/closeBuildMenu";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { EndPasting } from "../../../src/application/build/endPasting";
import { NewCopy } from "../../../src/application/build/newCopy";
import { OpenBuildMenu } from "../../../src/application/build/openBuildMenu";
import { OpenSelectionMenu } from "../../../src/application/build/openSelectionMenu";
import { SetHeightTo } from "../../../src/application/build/setHeightTo";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/heightFlow";
import {
  buildMenu,
  contentsMenu,
  openBuildMenu,
  pasteMenu,
  shapeMenu,
  terrainMenu,
  utilityMenu,
} from "../../../src/domain/build/flow/menu";
import { fixStairGoal } from "../../../src/domain/build/flow/stairFlow";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import { chooseTerrain } from "../../../src/domain/build/flow/terrainFlow";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { staircaseToward } from "../../../src/domain/build/stairs/staircase";
import { volumeOf } from "../../../src/domain/build/volume/geometry";
import type { Cell } from "../../../src/domain/shared/cells";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockBuildMenus } from "../../../src/infrastructure/build/bedrock/buildMenus";
import { MenuChoices } from "../../../src/infrastructure/build/bedrock/menuChoices";
import { BUILD_FORM } from "../../../src/infrastructure/build/identifiers";
import {
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "../../application/build/fakes";
import { FakeStructureStore } from "../../application/build/fakes/structureStore";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";

type Answer = {
  canceled?: boolean;
  cancelationReason?: string;
  selection?: number;
  formValues?: (number | boolean)[];
};
const ui = vi.hoisted(() => {
  const answers: (Answer | Promise<Answer>)[] = [];
  const forms: Form[] = [];
  class Form {
    buttons: RawMessage[] = [];
    toggles: unknown[] = [];
    sliders: unknown[] = [];
    heading: RawMessage | undefined;
    message: RawMessage | undefined;
    constructor() {
      forms.push(this);
    }
    title(label: RawMessage) {
      this.heading = label;
      return this;
    }
    body(label: RawMessage) {
      this.message = label;
      return this;
    }
    submitButton() {
      return this;
    }
    button(label: RawMessage) {
      this.buttons.push(label);
      return this;
    }
    toggle(label: RawMessage, options: unknown) {
      this.toggles.push({ label, options });
      return this;
    }
    slider(label: RawMessage, min: number, max: number, options: unknown) {
      this.sliders.push({ label, min, max, options });
      return this;
    }
    async show() {
      return answers.shift() ?? {};
    }
  }
  return { answers, forms, Form };
});
vi.mock("@minecraft/server-ui", () => ({
  FormCancelationReason: { UserBusy: "UserBusy", UserClosed: "UserClosed" },
  ActionFormData: ui.Form,
  ModalFormData: ui.Form,
}));
beforeEach(() => {
  ui.answers.length = 0;
  ui.forms.length = 0;
});

const playerId = asPlayerId("p");
const stone = blockStateOf("minecraft:stone");
const from = { x: 0, y: 60, z: 0 };
const to = { x: 4, y: 60, z: 6 };
function selected(
  from: Cell,
  to: Cell,
  menuLevel: "root" | "build" = "root",
): BuildFlow {
  return {
    kind: "selected",
    menuLevel,
    selection: selectionOf(overworld, boxOf(from, to), stone),
    from,
    to,
  };
}
const endpoint = selected(from, to);
const cell = fc.record({
  x: fc.integer({ min: -20, max: 20 }),
  y: fc.integer({ min: 0, max: 319 }),
  z: fc.integer({ min: -20, max: 20 }),
});
function setup(fallback?: boolean) {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  session.setFlow(endpoint);
  const preview = { refresh: vi.fn() };
  const cases = {
    openSelectionMenu: {
      execute: vi.fn((cmd) => new OpenSelectionMenu(repo).execute(cmd)),
    },
    openBuildMenu: {
      execute: vi.fn((cmd) => new OpenBuildMenu(repo, preview).execute(cmd)),
    },
    closeBuildMenu: {
      execute: vi.fn((cmd) => new CloseBuildMenu(repo, preview).execute(cmd)),
    },
    chooseAdjustHeight: { execute: vi.fn() },
    chooseBoxStep: {
      execute: vi.fn((cmd) =>
        new ChooseBoxStep(
          repo,
          {
            copy: new CopyBox(
              repo,
              new FakeStructureStore(),
              new FakeFeedback(),
            ),
            cut: new CutBox(
              repo,
              new FakeWorld(),
              new FakeStructureStore(),
              new FakeFeedback(),
              { warn: () => {} },
            ),
          },
          new FakeFeedback(),
          { facingOf: () => "east" },
        ).execute(cmd),
      ),
    },
    confirmShape: { execute: vi.fn() },
    chooseHeighted: {
      execute: vi.fn((cmd) =>
        new ChooseHeighted(repo, new FakeFeedback()).execute(cmd),
      ),
    },
    chooseSideCylinder: {
      execute: vi.fn((cmd) =>
        new ChooseSideCylinder(
          repo,
          new FakeFeedback(),
          { aim: () => undefined },
          new ChooseHeighted(repo, new FakeFeedback()),
        ).execute(cmd),
      ),
    },
    confirmHeighted: { execute: vi.fn() },
    chooseStairs: {
      execute: vi.fn((cmd) =>
        new ChooseStairs(repo, new FakeFeedback()).execute(cmd),
      ),
    },
    confirmTerrace: { execute: vi.fn() },
    confirmStairs: { execute: vi.fn() },
    chooseTerrain: {
      execute: vi.fn((cmd) =>
        new ChooseTerrain(repo, new FakeFeedback()).execute(cmd),
      ),
    },
    confirmTerrain: { execute: vi.fn() },
    cancel: {
      backToAiming: vi.fn((cmd) => new BackToAiming(repo).backToAiming(cmd)),
    },
    copy: { execute: vi.fn() },
    newCopy: { execute: vi.fn((id) => new NewCopy(repo).execute(id)) },
    endPasting: {
      execute: vi.fn((cmd) =>
        new EndPasting(repo, new FakeStructureStore()).execute(cmd),
      ),
    },
    undo: { execute: vi.fn() },
    clear: {
      execute: vi.fn((cmd) =>
        new ClearSelection(repo, new FakeFeedback()).execute(cmd),
      ),
    },
    setHeight: {
      execute: vi.fn((cmd) => new SetHeightTo(repo).execute(cmd)),
    },
  };
  const player = {
    id: playerId,
    isValid: true,
    dimension: { heightRange: { min: -64, max: 320 } },
  } as unknown as Player;
  const menus = new BedrockBuildMenus(repo, cases, fallback);
  return {
    repo,
    session,
    cases,
    player,
    menus,
    choices: new MenuChoices(repo, cases),
  };
}
function shapeAnswers(flow: BuildFlow, id: string): Answer[] {
  const root = shapeMenu(flow);
  const direct = root.findIndex((entry) => entry.id === id);
  if (direct >= 0) return [{ selection: direct }];
  return [
    { selection: root.findIndex((entry) => entry.id === "buildShape") },
    {
      selection: buildMenu(openBuildMenu(flow)).findIndex(
        (entry) => entry.id === id,
      ),
    },
  ];
}

const labels = (entries: { id: string }[]) =>
  entries.map(({ id }) => ({
    translate: BUILD_FORM[id as keyof typeof BUILD_FORM],
  }));

it("accepts a line menu response after opening clears the undo target", async () => {
  const { session, menus, player, cases } = setup();
  const point = tapBlock({ kind: "idle" }, overworld, from, stone);
  const line = tapAir(point, { ...from, x: 4 });
  session.setFlow(line);
  ui.answers.push({
    selection: shapeMenu(line).findIndex((entry) => entry.id === "cancel"),
  });

  await menus.showShapeMenu(player);

  expect(cases.clear.execute).toHaveBeenCalledExactlyOnceWith({ playerId });
  expect(session.flow.kind).toBe("idle");
});

it.each(["back", "dismiss", "unanswered"] as const)(
  "returns from build %s to the unchanged root",
  async (answer) => {
    const { session, menus, player, cases } = setup();
    const build = openBuildMenu(endpoint);
    ui.answers.push(
      { selection: 3 },
      answer === "back"
        ? {
            selection: buildMenu(build).findIndex(
              (entry) => entry.id === "back",
            ),
          }
        : answer === "dismiss"
          ? { canceled: true }
          : {},
      { canceled: true },
    );
    await menus.showShapeMenu(player);
    expect(ui.forms.map((form) => form.heading)).toEqual([
      { translate: BUILD_FORM.shapeTitle },
      { translate: BUILD_FORM.buildShapeTitle },
      { translate: BUILD_FORM.shapeTitle },
    ]);
    expect(ui.forms[0]?.buttons).toEqual(
      [
        "adjustHeight",
        "cut",
        "removeAbove",
        "buildShape",
        "copy",
        "fillBelow",
        "cancel",
      ].map((id) => ({ translate: BUILD_FORM[id as keyof typeof BUILD_FORM] })),
    );
    expect(cases.closeBuildMenu.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
    });
    expect(session.flow).toEqual(endpoint);
  },
);

it("keeps a refused side-cylinder choice at the build level", async () => {
  const { session, menus, player, cases } = setup();
  cases.chooseSideCylinder.execute.mockImplementation(() => {});
  ui.answers.push(...shapeAnswers(endpoint, "sideCylinder"));
  await menus.showShapeMenu(player);
  expect(session.flow).toEqual(openBuildMenu(endpoint));
  ui.answers.push({ canceled: true });
  await menus.showUtilityMenu(player);
  expect(ui.forms.at(-1)?.heading).toEqual({
    translate: BUILD_FORM.shapeTitle,
  });
  expect(session.flow).toEqual(endpoint);
});

it("rebuilds shape and roof entries from the live flow, including empty models", async () => {
  await fc.assert(
    fc.asyncProperty(cell, cell, async (a, b) => {
      const { session, menus, player } = setup();
      const end: BuildFlow = selected(a, b);
      for (const flow of [
        { kind: "idle" } as const,
        {
          kind: "point1",
          dimensionId: overworld,
          cell: a,
          material: stone,
        } as const,
        end,
        chooseHeighted(end, "hip"),
        { kind: "pasteAim", manualTurn: 0 } as const,
      ]) {
        session.setFlow(flow);
        for (const [model, show] of [
          [shapeMenu(flow), () => menus.showShapeMenu(player)],
          [contentsMenu(flow), () => menus.showContentsMenu(player)],
        ] as const) {
          ui.forms.length = 0;
          await show();
          expect(ui.forms).toHaveLength(model.length ? 1 : 0);
          if (model.length) expect(ui.forms[0]?.buttons).toEqual(labels(model));
        }
      }
    }),
  );
});

it("shows exactly the applicable utility entries", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      async (confirmed, clipboard, history, aiming) => {
        const { session, menus, player } = setup();
        session.setFlow({ kind: "idle" });
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
        if (aiming)
          session.setFlow({
            kind: "point1",
            dimensionId: overworld,
            cell: from,
            material: stone,
          });
        ui.forms.length = 0;
        await menus.showUtilityMenu(player);
        const entries = utilityMenu(session);
        expect(ui.forms).toHaveLength(entries.length ? 1 : 0);
        if (entries.length)
          expect(ui.forms[0]?.buttons).toEqual(labels(entries));
      },
    ),
  );
});

it("offers Place directly on a line without opening the build submenu", async () => {
  const { session, menus, player, cases } = setup();
  session.setFlow(selected(from, { ...from, x: 4 }));
  ui.answers.push(...shapeAnswers(session.flow, "place"));
  await menus.showShapeMenu(player);
  expect(ui.forms).toHaveLength(1);
  expect(cases.confirmShape.execute).toHaveBeenCalledExactlyOnceWith({
    playerId,
    style: "fill",
  });
});

it.each(["gable", "hip"] as const)(
  "chooses %s without a slider by default",
  async (kind) => {
    const { menus, player, cases } = setup();
    ui.answers.push(...shapeAnswers(endpoint, kind));
    await menus.showShapeMenu(player);
    expect(cases.chooseHeighted.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      kind,
    });
    expect(ui.forms).toHaveLength(2);
  },
);

it("keeps a dismissed root selection and clears it on Cancel", async () => {
  const { session, menus, player, cases } = setup();
  for (const answer of [
    { canceled: true },
    { cancelationReason: "UserClosed" },
  ]) {
    ui.answers.push(answer);
    await menus.showUtilityMenu(player);
    expect(session.flow).toBe(endpoint);
    expect(cases.clear.execute).not.toHaveBeenCalled();
  }
  expect(ui.forms.map((form) => form.buttons)).toEqual([
    labels(shapeMenu(endpoint)),
    labels(shapeMenu(endpoint)),
  ]);
  ui.answers.push({
    selection: shapeMenu(endpoint).findIndex((entry) => entry.id === "cancel"),
  });
  await menus.showUtilityMenu(player);
  expect(cases.clear.execute).toHaveBeenCalledExactlyOnceWith({ playerId });
  expect(session.flow.kind).toBe("idle");
});

it("returns to aiming on contents Cancel", async () => {
  const { session, menus, player, cases } = setup();
  session.setFlow(chooseHeighted(endpoint, "gable"));
  ui.answers.push({ selection: 2 });
  await menus.showContentsMenu(player);
  expect(cases.cancel.backToAiming).toHaveBeenCalledExactlyOnceWith({
    playerId,
  });
  expect(session.flow.kind).toBe("point1");
});

it("opens no form for an idle session without history or a confirmed box", async () => {
  const { session, menus, player } = setup();
  session.setFlow({ kind: "idle" });
  expect(utilityMenu(session)).toEqual([]);
  ui.forms.length = 0;
  await menus.showUtilityMenu(player);
  expect(ui.forms).toHaveLength(0);
});

it("keeps the confirmed box after utility dismissal and forgets it on Clear", async () => {
  const { session, menus, player } = setup();
  const selection = selectionOf(overworld, boxOf(from, to), stone);
  session.confirmBox(selection);
  ui.answers.push({ canceled: true });
  await menus.showUtilityMenu(player);
  expect(session.confirmedBox).toBe(selection);
  ui.answers.push({
    selection: utilityMenu(session).findIndex(({ id }) => id === "clear"),
  });
  await menus.showUtilityMenu(player);
  expect(session.confirmedBox).toBeUndefined();
});

it("bounds the fallback slider, starts at the initial roof height and applies it before the roof menu", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 319 }),
      fc.constantFrom("gable" as const, "hip" as const),
      async (y, kind) => {
        const { session, menus, player, cases } = setup(true);
        const selection = selected({ ...from, y }, { ...to, y });
        session.setFlow(selection);
        const flow = chooseHeighted(selection, kind);
        if (flow.kind !== "heightStep") throw new Error("Expected roof");
        const max = volumeOf(kind).maxHeight(flow.base, BUILD_SPEC.worldTopY);
        ui.forms.length = 0;
        ui.answers.push(
          ...shapeAnswers(selection, kind),
          { formValues: [max] },
          { selection: 1 },
        );
        await menus.showShapeMenu(player);
        expect(ui.forms[2]?.heading).toEqual({
          translate: BUILD_FORM.roofTitle,
        });
        expect(ui.forms[3]?.heading).toEqual({
          translate: BUILD_FORM.roofTitle,
        });
        expect(ui.forms[2]?.sliders).toEqual([
          {
            label: { translate: BUILD_FORM.height },
            min: 1,
            max,
            options: { defaultValue: flow.previous, valueStep: 1 },
          },
        ]);
        expect(cases.setHeight.execute).toHaveBeenCalledExactlyOnceWith({
          playerId,
          height: max,
        });
        expect(session.flow).toEqual({ ...flow, previous: max });
        expect(ui.forms[3]?.buttons).toEqual(
          labels(contentsMenu(session.flow)),
        );
        expect(cases.confirmHeighted.execute).toHaveBeenCalledExactlyOnceWith({
          playerId,
          fill: "hollow",
        });
      },
    ),
  );
});

it.each(["gable", "hip"] as const)(
  "chains %s through the enabled slider to the roof menu",
  async (kind) => {
    const { menus, player, cases } = setup(true);
    ui.answers.push(
      ...shapeAnswers(endpoint, kind),
      { formValues: [3] },
      { selection: 0 },
    );
    await menus.showShapeMenu(player);
    expect(ui.forms).toHaveLength(4);
    expect(cases.setHeight.execute).toHaveBeenCalledWith({
      playerId,
      height: 3,
    });
    expect(cases.confirmHeighted.execute).toHaveBeenCalledWith({
      playerId,
      fill: "fill",
    });
  },
);

it("holds one lock across nested forms, allows other players, and releases on dismissal", async () => {
  const { repo, session, menus, player } = setup(true);
  session.setFlow(endpoint);
  let close!: (answer: Answer) => void;
  ui.answers.push(
    ...shapeAnswers(endpoint, "hip"),
    new Promise((resolve) => {
      close = resolve;
    }),
  );
  const pending = menus.showShapeMenu(player);
  await vi.waitFor(() => expect(ui.forms).toHaveLength(3));
  await menus.showShapeMenu(player);
  await menus.showContentsMenu(player);
  expect(ui.forms).toHaveLength(3);
  const other = { id: "other", isValid: true } as Player;
  repo.getOrCreate(asPlayerId(other.id)).setFlow(endpoint);
  await menus.showShapeMenu(other);
  expect(ui.forms).toHaveLength(4);
  close({ canceled: true });
  await pending;
  session.setFlow(endpoint);
  await menus.showShapeMenu(player);
  expect(ui.forms).toHaveLength(5);
});

it.each(["shape", "roof", "paste", "slider"] as const)(
  "ignores %s responses after disconnection",
  async (stage) => {
    const { session, menus, player, cases } = setup(stage === "slider");
    let close!: (answer: Answer) => void;
    if (stage === "slider") ui.answers.push(...shapeAnswers(endpoint, "hip"));
    if (stage === "roof") session.setFlow(chooseHeighted(endpoint, "hip"));
    if (stage === "paste") {
      holdClipboard(
        session,
        structureClipboard(boxOf(from, from), () => stone),
      );
      session.setFlow({ kind: "pasteAim", manualTurn: 0 });
    }
    ui.answers.push(
      new Promise((resolve) => {
        close = resolve;
      }),
    );
    const pending =
      stage === "shape" || stage === "slider"
        ? menus.showShapeMenu(player)
        : stage === "roof"
          ? menus.showContentsMenu(player)
          : menus.showPasteMenu(player);
    await vi.waitFor(() =>
      expect(ui.forms).toHaveLength(stage === "slider" ? 3 : 1),
    );
    vi.clearAllMocks();
    Object.assign(player, { isValid: false });
    close({ selection: 0, formValues: [3] });
    await pending;
    for (const action of Object.values(cases).filter(
      (action) => action !== cases.openSelectionMenu,
    ))
      expect(Object.values(action)[0]).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "releases on error and warns only for valid players (%s)",
  async (valid) => {
    const { menus, player } = setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let reject!: (reason: Error) => void;
    ui.answers.push(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const pending = menus.showShapeMenu(player);
    Object.assign(player, { isValid: valid });
    reject(new Error("form unavailable"));
    await pending;
    expect(warn).toHaveBeenCalledTimes(valid ? 1 : 0);
    Object.assign(player, { isValid: true });
    await menus.showShapeMenu(player);
    expect(ui.forms).toHaveLength(2);
    warn.mockRestore();
  },
);

const command = { playerId };
const shapeRoutes = {
  place: ["confirmShape", { playerId, style: "fill" }],
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
  buildShape: ["openBuildMenu", command],
  back: ["closeBuildMenu", command],
  adjustHeight: ["chooseAdjustHeight", command],
  cancel: ["clear", command],
} as const;
const contentsRoutes = {
  fill: ["confirmHeighted", { playerId, fill: "fill" }],
  hollow: ["confirmHeighted", { playerId, fill: "hollow" }],
  tube: ["confirmHeighted", { playerId, fill: "tube" }],
  cancel: ["cancel", command],
} as const;

function expectDispatch(
  flow: BuildFlow,
  menu: "shape" | "contents",
  offered: { id: string }[],
  routes: Record<
    string,
    readonly [keyof ReturnType<typeof setup>["cases"], object]
  >,
) {
  expect(Object.keys(routes)).toEqual(
    expect.arrayContaining(offered.map(({ id }) => id)),
  );
  for (const [id, expected] of Object.entries({
    ...routes,
    invalid: undefined,
  })) {
    const { session, cases, choices } = setup();
    session.setFlow(flow);
    const available = offered.some((entry) => entry.id === id);
    expect(choices.choose(playerId, menu, id), id).toBe(available);
    const calls = Object.entries(cases).flatMap(([action, useCase]) => {
      const spy = "execute" in useCase ? useCase.execute : useCase.backToAiming;
      return spy.mock.calls.map((args) => [action, ...args]);
    });
    expect(calls, id).toEqual(available ? [expected] : []);
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
          start,
          { x: start.x + dx, y: start.y + dy, z: start.z + dz },
          level,
        );
        expectDispatch(
          flow,
          "shape",
          [...shapeMenu(flow), ...buildMenu(flow)],
          shapeRoutes,
        );
        expectDispatch(flow, "contents", [], contentsRoutes);
      },
    ),
  );
  expectDispatch({ kind: "idle" }, "shape", [], shapeRoutes);
});

it("dispatches only contents offered for the selected shape", () => {
  for (const kind of ["hip", "cube"] as const) {
    const flow = chooseHeighted(endpoint, kind);
    expectDispatch(flow, "contents", contentsMenu(flow), contentsRoutes);
  }
});

it("validates utility availability before dispatching", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      (confirmed, clipboard, history) => {
        const { session, cases, choices } = setup();
        session.setFlow({ kind: "idle" });
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
          expect(choices.choose(playerId, "utility", id)).toBe(offered);
          if (offered)
            expect(cases[id].execute).toHaveBeenCalledExactlyOnceWith({
              playerId,
            });
          else expect(cases[id].execute).not.toHaveBeenCalled();
        }
        expect(choices.choose(asPlayerId("absent"), "utility", "paste")).toBe(
          false,
        );
      },
    ),
  );
});

it.each(["gable", "hip"] as const)(
  "opens locked stair %s contents under the roof title",
  async (kind) => {
    const { session, menus, player, cases } = setup(true);
    const box = boxOf(from, to);
    session.setFlow({
      kind: "selected",
      menuLevel: "root",
      selection: selectionOf(
        overworld,
        box,
        blockStateOf("minecraft:oak_stairs", {
          weirdo_direction: 0,
          upside_down_bit: false,
        }),
      ),
      from,
      to,
    });
    ui.answers.push(...shapeAnswers(session.flow, kind), { selection: 1 });
    await menus.showShapeMenu(player);
    expect(ui.forms).toHaveLength(3);
    expect(ui.forms[2]?.heading).toEqual({ translate: BUILD_FORM.roofTitle });
    expect(ui.forms[2]?.buttons).toEqual(labels(contentsMenu(session.flow)));
    expect(ui.forms[2]?.sliders).toEqual([]);
    expect(cases.setHeight.execute).not.toHaveBeenCalled();
    expect(cases.confirmHeighted.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      fill: "hollow",
    });
  },
);

it.each([
  { kind: "cylinder", y: from.y, fallback: false },
  { kind: "cube", y: from.y, fallback: true },
  { kind: "cylinder", y: 71, fallback: true },
  { kind: "cube", y: 71, fallback: false },
] as const)(
  "opens locked $kind contents directly at y=$y with fallback=$fallback",
  async ({ kind, y, fallback }) => {
    const { session, menus, player, cases } = setup(fallback);
    session.setFlow(selected(from, { ...to, y }));
    ui.answers.push(...shapeAnswers(session.flow, kind), {
      selection: 2,
    });
    await menus.showShapeMenu(player);
    expect(cases.chooseHeighted.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      kind,
    });
    expect(ui.forms).toHaveLength(3);
    expect(ui.forms[2]?.heading).toEqual({ translate: BUILD_FORM.solidTitle });
    expect(ui.forms[2]?.buttons).toEqual(labels(contentsMenu(session.flow)));
    expect(cases.setHeight.execute).not.toHaveBeenCalled();
    expect(cases.confirmHeighted.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      fill: "tube",
    });
    expect(session.flow).toMatchObject({
      heightLocked: true,
      previous: y - from.y + 1,
    });
    expect(ui.forms[2]?.sliders).toEqual([]);
  },
);

it.each([from.y, 71])(
  "opens locked sphere contents directly with top y=%s",
  async (y) => {
    const { session, menus, player, cases } = setup(true);
    session.setFlow(selected(from, { ...to, y }));
    ui.answers.push(...shapeAnswers(session.flow, "sphere"), { selection: 1 });
    await menus.showShapeMenu(player);
    expect(cases.chooseHeighted.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      kind: "sphere",
    });
    expect(ui.forms).toHaveLength(3);
    expect(ui.forms[2]?.buttons).toEqual(labels(contentsMenu(session.flow)));
    expect(cases.setHeight.execute).not.toHaveBeenCalled();
    expect(cases.confirmHeighted.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      fill: "hollow",
    });
  },
);

it("accepts EndPasting only in paste aiming and exposes its own label", async () => {
  const { session, choices, cases, menus, player } = setup();
  for (const flow of [
    { kind: "idle" } as const,
    {
      kind: "point1",
      dimensionId: overworld,
      cell: from,
      material: stone,
    } as const,
    endpoint,
    chooseHeighted(endpoint, "hip"),
  ]) {
    session.setFlow(flow);
    expect(choices.choose(playerId, "paste", "endPaste")).toBe(false);
  }
  expect(cases.endPasting.execute).not.toHaveBeenCalled();
  session.completeCopy(
    selectionOf(overworld, boxOf(from, to), stone),
    structureClipboard(boxOf(from, to), () => stone),
  );
  session.setFlow({ kind: "pasteAim", manualTurn: 0 });
  expect(choices.choose(playerId, "paste", "endPaste")).toBe(true);
  expect(cases.endPasting.execute).toHaveBeenCalledExactlyOnceWith(playerId);
  expect(session.flow.kind).toBe("idle");
  expect(session.clipboard).toBeUndefined();
  expect(session.confirmedBox).toBeUndefined();
  expect(choices.choose(playerId, "utility", "paste")).toBe(false);
  expect(choices.choose(playerId, "paste", "endPaste")).toBe(false);
  session.setFlow({ kind: "pasteAim", manualTurn: 0 });
  ui.answers.push({
    selection: pasteMenu().findIndex((entry) => entry.id === "endPaste"),
  });
  await menus.showPasteMenu(player);
  expect(ui.forms[0]?.buttons).toContainEqual({
    translate: BUILD_FORM.endPaste,
  });
  expect(session.flow.kind).toBe("idle");
});

it.each(["copy", "cut"] as const)(
  "enters paste aiming directly with %s when the fallback slider is enabled",
  async (kind) => {
    const { menus, player, session } = setup(true);
    ui.answers.push({
      selection: shapeMenu(endpoint).findIndex((e) => e.id === kind),
    });
    await menus.showShapeMenu(player);
    expect(session.flow.kind).toBe("pasteAim");
    expect(ui.forms).toHaveLength(1);
  },
);

function removeAboveAnswer() {
  return {
    selection: shapeMenu(endpoint).findIndex((e) => e.id === "removeAbove"),
  };
}

it.each([320, 128, 256])(
  "shows the dimension top for Remove above with exclusive ceiling %i",
  async (ceiling) => {
    const { menus, player, cases, session } = setup();
    player.dimension.heightRange.max = ceiling;
    const area: BuildFlow = selected(
      { x: 0, y: 64, z: 0 },
      { x: 4, y: 60, z: 6 },
    );
    session.setFlow(area);
    ui.answers.push(
      {
        selection: shapeMenu(area).findIndex((e) => e.id === "removeAbove"),
      },
      { selection: 0 },
    );
    await menus.showShapeMenu(player);
    expect(cases.chooseTerrain.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      op: "removeAbove",
    });
    expect(ui.forms).toHaveLength(2);
    expect(ui.forms[1]?.heading).toEqual({
      translate: BUILD_FORM.removeAboveTitle,
    });
    expect(ui.forms[1]?.message).toEqual({
      translate: BUILD_FORM.removeAboveBody,
      with: ["5", "7", "61", String(ceiling - 1)],
    });
    expect(ui.forms[1]?.buttons).toEqual([
      { translate: BUILD_FORM.confirm },
      { translate: BUILD_FORM.cancel },
    ]);
    expect(cases.confirmTerrain.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
    });
    expect(cases.cancel.backToAiming).not.toHaveBeenCalled();
  },
);

it.each([
  [320, BUILD_SPEC.worldTopY],
  [512, BUILD_SPEC.worldTopY],
  [128, 127],
  [128, 128],
  [256, 255],
  [256, 256],
])(
  "confirms without a form for ceiling %i and floor %i",
  async (ceiling, floor) => {
    const { menus, player, cases, session } = setup();
    player.dimension.heightRange.max = ceiling;
    session.setFlow(selected({ ...from, y: floor }, { ...to, y: floor }));
    ui.answers.push(removeAboveAnswer());
    await menus.showShapeMenu(player);
    expect(ui.forms).toHaveLength(1);
    expect(cases.confirmTerrain.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
    });
    expect(cases.cancel.backToAiming).not.toHaveBeenCalled();
  },
);

it.each([
  ["Cancel", { selection: 1 }],
  ["closing the form", { canceled: true, cancelationReason: "UserClosed" }],
  ["an unanswered form", {}],
] as const)(
  "returns to aiming after %s without confirming",
  async (_, answer) => {
    const { menus, player, cases, session } = setup();
    ui.answers.push(removeAboveAnswer(), answer);
    await menus.showShapeMenu(player);
    expect(cases.confirmTerrain.execute).not.toHaveBeenCalled();
    expect(session.flow).toMatchObject({ kind: "point1", cell: from });
  },
);

it("opens no confirmation when the area is too large", async () => {
  const { menus, player, cases, session } = setup();
  const area: BuildFlow = selected(from, { x: 32, y: 60, z: 0 });
  session.setFlow(area);
  ui.answers.push({
    selection: shapeMenu(area).findIndex((e) => e.id === "removeAbove"),
  });
  await menus.showShapeMenu(player);
  expect(ui.forms).toHaveLength(1);
  expect(session.flow).toBe(area);
  expect(cases.confirmTerrain.execute).not.toHaveBeenCalled();
});

it("offers terrain entries only during the confirmation", () => {
  const { session, cases, choices } = setup();
  for (const id of ["confirm", "cancel"]) {
    expect(choices.choose(playerId, "terrain", id)).toBe(false);
  }
  expect(cases.confirmTerrain.execute).not.toHaveBeenCalled();
  session.setFlow(chooseTerrain(endpoint, "removeAbove"));
  expect(terrainMenu(session.flow)).toHaveLength(2);
  expect(choices.choose(playerId, "terrain", "invalid")).toBe(false);
  expect(choices.choose(playerId, "terrain", "confirm")).toBe(true);
  expect(cases.confirmTerrain.execute).toHaveBeenCalledExactlyOnceWith({
    playerId,
  });
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
        fc.string(),
      ),
      (history, aiming, entryId) => {
        const { session, choices, cases } = setup();
        session.setFlow(
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
          aiming && pasteMenu().some((entry) => entry.id === entryId);
        expect(choices.choose(playerId, "paste", entryId)).toBe(offered);
        const routes = new Map([
          ["newCopy", cases.newCopy.execute],
          ["endPaste", cases.endPasting.execute],
        ]);
        const expected = offered ? routes.get(entryId) : undefined;
        for (const useCase of Object.values(cases)) {
          const call =
            "execute" in useCase ? useCase.execute : useCase.backToAiming;
          expect(call.mock.calls).toEqual(
            call === expected ? [[playerId]] : [],
          );
        }
      },
    ),
  );
});

it("labels New copy and dispatches it through the paste menu with or without history", async () => {
  await fc.assert(
    fc.asyncProperty(fc.boolean(), async (history) => {
      ui.forms.length = 0;
      const { session, menus, player, cases, choices } = setup();
      session.completeCopy(
        selectionOf(overworld, boxOf(from, from), stone),
        structureClipboard(boxOf(from, from), () => stone),
      );
      const clipboard = session.clipboard;
      session.setFlow({ kind: "pasteAim", manualTurn: 0 });
      if (history)
        session.finishEdit(
          {
            dimensionId: overworld,
            changes: [{ cell: from, before: stone, after: stone }],
          },
          "undoable",
        );
      expect(choices.choose(playerId, "paste", "undo")).toBe(false);
      expect(cases.undo.execute).not.toHaveBeenCalled();
      const index = 0;
      ui.answers.push({ selection: index });
      await menus.showPasteMenu(player);
      expect(ui.forms[0]?.buttons).toEqual([
        { translate: BUILD_FORM.newCopy },
        { translate: BUILD_FORM.endPaste },
        { translate: BUILD_FORM.cancel },
      ]);
      expect(cases.newCopy.execute).toHaveBeenCalledExactlyOnceWith(playerId);
      expect(session.flow).toEqual({ kind: "idle" });
      expect(session.clipboard).toBe(clipboard);
      expect(session.confirmedBox).toBeUndefined();
    }),
  );
});

it.each([
  [-64, 320, 64],
  [-64, 320, BUILD_SPEC.worldTopY],
  [0, 128, 64],
  [0, 256, 64],
  [-32, 256, 64],
])(
  "shows Fill below's dimension bottom %i, ceiling %i and inclusive top %i",
  async (bottom, ceiling, y) => {
    const { menus, player, cases, session } = setup();
    player.dimension.heightRange.min = bottom;
    player.dimension.heightRange.max = ceiling;
    const area: BuildFlow = selected({ x: 0, y, z: 0 }, { x: 4, y: 60, z: 6 });
    session.setFlow(area);
    ui.answers.push(
      { selection: shapeMenu(area).findIndex((e) => e.id === "fillBelow") },
      { selection: 0 },
    );
    await menus.showShapeMenu(player);
    expect(ui.forms).toHaveLength(2);
    expect(ui.forms[1]?.heading).toEqual({
      translate: BUILD_FORM.fillBelowTitle,
    });
    expect(ui.forms[1]?.message).toEqual({
      translate: BUILD_FORM.fillBelowBody,
      with: ["5", "7", String(bottom), String(y)],
    });
    expect(cases.chooseTerrain.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      op: "fillBelow",
    });
    expect(cases.confirmTerrain.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
    });
  },
);

it.each([false, true])(
  "routes a sideways box directly to contents with fallback=%s",
  async (fallback) => {
    const { session, menus, player, cases } = setup(fallback);
    session.setFlow(selected(from, { ...to, y: 64 }));
    ui.answers.push(...shapeAnswers(session.flow, "sideCylinder"), {
      selection: 2,
    });
    await menus.showShapeMenu(player);
    expect(cases.chooseSideCylinder.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
    });
    expect(session.flow).toMatchObject({
      heightedKind: "sideCylinderX",
      heightLocked: true,
      previous: 5,
    });
    expect(ui.forms).toHaveLength(3);
    expect(ui.forms[2]?.buttons).toEqual(labels(contentsMenu(session.flow)));
    expect(cases.setHeight.execute).not.toHaveBeenCalled();
    expect(cases.confirmHeighted.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      fill: "tube",
    });
  },
);

it("returns to aiming when Fill below confirmation is dismissed", async () => {
  const { menus, player, cases, session } = setup();
  ui.answers.push(
    {
      selection: shapeMenu(endpoint).findIndex((e) => e.id === "fillBelow"),
    },
    { canceled: true, cancelationReason: "UserClosed" },
  );
  await menus.showShapeMenu(player);
  expect(cases.confirmTerrain.execute).not.toHaveBeenCalled();
  expect(session.flow.kind).toBe("point1");
});

it.each([false, true])(
  "opens one-layer sideways cylinder contents directly with fallback=%s",
  async (fallback) => {
    const { session, menus, player, cases } = setup(fallback);
    ui.answers.push(...shapeAnswers(session.flow, "sideCylinder"), {
      selection: 0,
    });
    await menus.showShapeMenu(player);
    expect(session.flow).toMatchObject({
      heightedKind: "sideCylinderX",
      heightLocked: true,
      previous: 1,
    });
    expect(ui.forms).toHaveLength(3);
    expect(ui.forms[2]?.buttons).toEqual(labels(contentsMenu(session.flow)));
    expect(cases.setHeight.execute).not.toHaveBeenCalled();
    expect(cases.confirmHeighted.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      fill: "fill",
    });
  },
);

it("Cancel closes the paste menu and keeps paste aiming", async () => {
  const { session, menus, player, cases } = setup();
  session.setFlow({ kind: "pasteAim", manualTurn: 0 });
  const flow = session.flow;
  ui.answers.push({ selection: 2 });
  await menus.showPasteMenu(player);
  expect(ui.forms[0]?.buttons).toEqual(
    labels([{ id: "newCopy" }, { id: "endPaste" }, { id: "cancel" }]),
  );
  expect(session.flow).toBe(flow);
  expect(cases.cancel.backToAiming).not.toHaveBeenCalled();
});

it.each([
  { selection: 2 },
  { canceled: true },
  { cancelationReason: "UserClosed" },
])(
  "returns from the build submenu to the same root selection (%s)",
  async (answer) => {
    const { session, menus, player, cases } = setup();
    session.setFlow(selected(from, { x: 4, y: 64, z: 0 }));
    const initial = session.flow;
    ui.answers.push(
      {
        selection: shapeMenu(initial).findIndex(
          ({ id }) => id === "buildShape",
        ),
      },
      answer,
      { selection: shapeMenu(initial).findIndex(({ id }) => id === "cut") },
    );
    await menus.showShapeMenu(player);
    expect(cases.openBuildMenu.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
    });
    expect(cases.closeBuildMenu.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
    });
    expect(ui.forms.map((form) => form.heading)).toEqual([
      { translate: BUILD_FORM.shapeTitle },
      { translate: BUILD_FORM.buildShapeTitle },
      { translate: BUILD_FORM.shapeTitle },
    ]);
    expect(ui.forms[2]?.buttons).toEqual(labels(shapeMenu(initial)));
    expect(cases.cancel.backToAiming).not.toHaveBeenCalled();
    expect(cases.chooseBoxStep.execute).toHaveBeenCalledWith({
      playerId,
      kind: "cut",
    });
  },
);

it.each(["root", "build"] as const)(
  "ignores an off-level response from the %s form",
  async (level) => {
    const { session, menus, player, cases } = setup();
    if (level === "build")
      ui.answers.push(...shapeAnswers(endpoint, "buildShape"));
    let answer!: (value: Answer) => void;
    ui.answers.push(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const pending = menus.showShapeMenu(player);
    await vi.waitFor(() =>
      expect(ui.forms).toHaveLength(level === "build" ? 2 : 1),
    );
    vi.clearAllMocks();
    session.setFlow(selected(from, to, level === "root" ? "build" : "root"));
    answer({ selection: 0 });
    await pending;
    for (const action of Object.values(cases).filter(
      (action) => action !== cases.openSelectionMenu,
    ))
      expect(Object.values(action)[0]).not.toHaveBeenCalled();
  },
);

it("holds the lock through submenu dismissal and the reopened root", async () => {
  const { menus, session, player, cases } = setup();
  let dismiss!: (value: Answer) => void;
  let finish!: (value: Answer) => void;
  ui.answers.push(
    { selection: 3 },
    new Promise((resolve) => {
      dismiss = resolve;
    }),
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const pending = menus.showShapeMenu(player);
  await vi.waitFor(() => expect(ui.forms).toHaveLength(2));
  expect(session.flow).toEqual(openBuildMenu(endpoint));
  await menus.showShapeMenu(player);
  expect(ui.forms).toHaveLength(2);
  dismiss({ canceled: true });
  await vi.waitFor(() => expect(ui.forms).toHaveLength(3));
  expect(session.flow).toEqual(endpoint);
  await menus.showShapeMenu(player);
  expect(ui.forms).toHaveLength(3);
  finish({ canceled: true });
  await pending;
  expect(cases.cancel.backToAiming).not.toHaveBeenCalled();
  expect(session.flow).toEqual(endpoint);
});

it.each([
  { answer: { selection: 0 }, contents: "passage" },
  { answer: { selection: 1 }, contents: "fillBelow" },
  { answer: { selection: 2 }, contents: "stepsOnly" },
  { answer: { selection: 3 }, contents: undefined },
  { answer: { canceled: true }, contents: undefined },
  { answer: {}, contents: undefined },
])(
  "dispatches the stair form and returns to aiming when it closes without a build",
  async ({ answer, contents }) => {
    const { session, menus, player, cases } = setup();
    session.setFlow(selected(from, { ...from, x: 2 }));
    ui.answers.push(...shapeAnswers(session.flow, "stairs"));
    await menus.showShapeMenu(player);
    expect(cases.chooseStairs.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      op: "stairs",
    });
    const flow = session.flow;
    if (flow.kind !== "stairAim") throw new Error("Expected stair aim");
    const staircase = staircaseToward(flow.row, {
      ...from,
      y: from.y + 2,
      z: from.z + 4,
    });
    if (!staircase) throw new Error("Expected staircase");
    session.setFlow(fixStairGoal(flow, staircase));
    if (contents)
      cases.confirmStairs.execute.mockImplementation(() =>
        session.setFlow(endpoint),
      );
    ui.answers.push(answer);
    await menus.showStairContentsMenu(player);
    expect(ui.forms[1]?.heading).toEqual({
      translate: BUILD_FORM.stairContentsTitle,
    });
    expect(ui.forms[1]?.buttons).toEqual([
      { translate: BUILD_FORM.stairPassage },
      { translate: BUILD_FORM.stairFillBelow },
      { translate: BUILD_FORM.stepsOnly },
      { translate: BUILD_FORM.cancel },
    ]);
    if (contents) {
      expect(cases.confirmStairs.execute).toHaveBeenCalledExactlyOnceWith({
        playerId,
        contents,
      });
      expect(session.flow).toBe(endpoint);
    } else {
      expect(cases.confirmStairs.execute).not.toHaveBeenCalled();
      expect(session.flow).toMatchObject({ kind: "point1", cell: from });
    }
  },
);

it.each([{ selection: 0 }, { selection: 1 }, { canceled: true }])(
  "shows the terrace count and routes its answer %o",
  async (answer) => {
    const { session, menus, player, cases } = setup();
    session.setFlow(selected(from, { ...from, x: 2 }));
    ui.answers.push(...shapeAnswers(session.flow, "terrace"));
    await menus.showShapeMenu(player);
    const flow = session.flow;
    if (flow.kind !== "stairAim") throw new Error("Expected terrace aim");
    const staircase = staircaseToward(flow.row, {
      ...from,
      y: from.y + 2,
      z: 4,
    });
    if (!staircase) throw new Error("Expected terrace profile");
    session.setFlow(fixStairGoal(flow, staircase));
    cases.confirmTerrace.execute.mockImplementation(() =>
      session.setFlow(endpoint),
    );
    ui.answers.push(answer);
    await menus.showTerraceMenu(player);
    expect(ui.forms[1]).toMatchObject({
      heading: { translate: BUILD_FORM.terraceTitle },
      message: { translate: BUILD_FORM.terraceBody, with: ["57"] },
      buttons: [
        { translate: BUILD_FORM.confirm },
        { translate: BUILD_FORM.cancel },
      ],
    });
    if (answer.selection === 0) {
      expect(cases.confirmTerrace.execute).toHaveBeenCalledExactlyOnceWith({
        playerId,
      });
      expect(session.flow).toBe(endpoint);
    } else {
      expect(cases.confirmTerrace.execute).not.toHaveBeenCalled();
      expect(session.flow).toMatchObject({ kind: "point1", cell: from });
    }
  },
);
