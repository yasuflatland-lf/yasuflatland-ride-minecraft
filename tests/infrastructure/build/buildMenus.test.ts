import type { Player, RawMessage } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";

import {
  buildMenu,
  contentsMenu,
  openBuildMenu,
  pasteMenu,
  shapeMenu,
  utilityMenu,
} from "../../../src/domain/build/flow/menu";
import { fixStairGoal } from "../../../src/domain/build/flow/stairFlow";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import { selectionOf } from "../../../src/domain/build/selection";
import { staircaseToward } from "../../../src/domain/build/stairs/staircase";
import { volumeOf } from "../../../src/domain/build/volume/geometry";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockBuildMenus } from "../../../src/infrastructure/build/bedrock/buildMenus";
import { BUILD_FORM } from "../../../src/infrastructure/build/identifiers";
import { overworld } from "../../application/build/fakes";
import {
  endpoint,
  from,
  playerId,
  selected,
  setupMenuChoices,
  stone,
  to,
} from "../../application/build/fakes/menuChoices";
import { NETHER_RANGE, OVERWORLD_RANGE } from "../../helpers/buildHeightRange";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import {
  chooseHeightedFlow,
  tapAir,
  tapBlock,
} from "../../support/buildSelection";

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

const cell = fc.record({
  x: fc.integer({ min: -20, max: 20 }),
  y: fc.integer({ min: 0, max: 319 }),
  z: fc.integer({ min: -20, max: 20 }),
});
function setup(fallback?: boolean) {
  const { repo, world, session, cases, choices } = setupMenuChoices();
  const player = {
    id: playerId,
    isValid: true,
  } as unknown as Player;
  const menus = new BedrockBuildMenus(repo, choices, world, fallback);
  return { repo, world, session, cases, player, menus };
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
      const roofBase = selected(a, { ...a, x: a.x + 1, z: a.z + 1 });
      for (const flow of [
        { kind: "idle" } as const,
        {
          kind: "point1",
          dimensionId: overworld,
          cell: a,
          material: stone,
        } as const,
        end,
        chooseHeightedFlow(roofBase, "hip"),
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
  session.setFlow(chooseHeightedFlow(endpoint, "gable"));
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
      fc.integer({ min: 0, max: 127 }),
      fc.constantFrom("gable" as const, "hip" as const),
      async (y, kind) => {
        const { session, menus, player, cases, world } = setup(true);
        world.heightRanges.set(overworld, NETHER_RANGE);
        const selection = selected({ ...from, y }, { ...to, y });
        session.setFlow(selection);
        const flow = chooseHeightedFlow(selection, kind);
        if (flow.kind !== "heightStep") throw new Error("Expected roof");
        const max = volumeOf(kind).maxHeight(flow.base, NETHER_RANGE);
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
    if (stage === "roof") session.setFlow(chooseHeightedFlow(endpoint, "hip"));
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

it("labels End pasting and applies the form response", async () => {
  const { session, menus, player } = setup();
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

it.each([320, 128, 256, 512])(
  "shows the dimension top for Remove above with exclusive ceiling %i",
  async (ceiling) => {
    const { menus, player, cases, session, world } = setup();
    world.heightRanges.set(overworld, { minY: 0, maxY: ceiling - 1 });
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
  [320, OVERWORLD_RANGE.maxY],
  [512, 511],
  [128, 127],
  [128, 128],
  [256, 255],
  [256, 256],
])(
  "confirms without a form for ceiling %i and floor %i",
  async (ceiling, floor) => {
    const { menus, player, cases, session, world } = setup();
    world.heightRanges.set(overworld, { minY: 0, maxY: ceiling - 1 });
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

it("labels New copy and dispatches it through the paste menu with or without history", async () => {
  await fc.assert(
    fc.asyncProperty(fc.boolean(), async (history) => {
      ui.forms.length = 0;
      const { session, menus, player, cases } = setup();
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
  [-64, 320, OVERWORLD_RANGE.maxY],
  [0, 128, 64],
  [0, 256, 64],
  [-32, 256, 64],
])(
  "shows Fill below's dimension bottom %i, ceiling %i and inclusive top %i",
  async (bottom, ceiling, y) => {
    const { menus, player, cases, session, world } = setup();
    world.heightRanges.set(overworld, { minY: bottom, maxY: ceiling - 1 });
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
