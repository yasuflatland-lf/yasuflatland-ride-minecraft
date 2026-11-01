import type { Player, RawMessage } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { CancelFlow } from "../../../src/application/build/cancelFlow";
import { ChooseCopy } from "../../../src/application/build/chooseCopy";
import { ChooseHeighted } from "../../../src/application/build/chooseHeighted";
import { SetHeightTo } from "../../../src/application/build/setHeightTo";
import { StopPaste } from "../../../src/application/build/stopPaste";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import {
  type BuildFlow,
  chooseHeighted,
} from "../../../src/domain/build/flow/flow";
import {
  contentsMenu,
  shapeMenu,
  utilityMenu,
} from "../../../src/domain/build/flow/menu";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { volumeOf } from "../../../src/domain/build/volume/geometry";
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
    constructor() {
      forms.push(this);
    }
    title(label: RawMessage) {
      this.heading = label;
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
const endpoint: BuildFlow = {
  kind: "endpoint",
  dimensionId: overworld,
  from,
  to,
  material: stone,
};
const cell = fc.record({
  x: fc.integer({ min: -20, max: 20 }),
  y: fc.integer({ min: 0, max: 319 }),
  z: fc.integer({ min: -20, max: 20 }),
});
function setup(fallback?: boolean) {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  session.setFlow(endpoint);
  const cases = {
    chooseCopy: {
      execute: vi.fn((cmd) =>
        new ChooseCopy(repo, new FakeWorld(), new FakeFeedback()).execute(cmd),
      ),
    },
    confirmCopyHeight: { execute: vi.fn() },
    confirmShape: { execute: vi.fn() },
    chooseHeighted: {
      execute: vi.fn((cmd) =>
        new ChooseHeighted(repo, new FakeFeedback()).execute(cmd),
      ),
    },
    confirmHeighted: { execute: vi.fn() },
    cancel: {
      backToAiming: vi.fn((cmd) => new CancelFlow(repo).backToAiming(cmd)),
    },
    copy: { execute: vi.fn() },
    paste: { execute: vi.fn() },
    stopPaste: { execute: vi.fn((cmd) => new StopPaste(repo).execute(cmd)) },
    undo: { execute: vi.fn() },
    clear: { execute: vi.fn() },
    setHeight: {
      execute: vi.fn((cmd) => new SetHeightTo(repo).execute(cmd)),
    },
  };
  const player = { id: playerId, isValid: true } as unknown as Player;
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
const labels = (entries: { id: string }[]) =>
  entries.map(({ id }) => ({
    translate: BUILD_FORM[id as keyof typeof BUILD_FORM],
  }));

it("rebuilds shape and roof entries from the live flow, including empty models", async () => {
  await fc.assert(
    fc.asyncProperty(cell, cell, async (a, b) => {
      const { session, menus, player } = setup();
      const end: BuildFlow = { ...endpoint, from: a, to: b };
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
        { kind: "pasteAim", skipAir: false } as const,
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
        if (confirmed) session.confirmBox(overworld, box);
        if (clipboard) session.setClipboard(clipboardOf(box, () => stone));
        if (history)
          session.finishEdit(
            {
              dimensionId: overworld,
              changes: [{ cell: from, before: stone, after: stone }],
            },
            false,
          );
        if (aiming) session.setFlow(endpoint);
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

it.each([
  ["place", { x: 4, y: 60, z: 0 }, "fill"],
  ["fill", to, "fill"],
  ["frame", to, "frame"],
  ["faces", { x: 4, y: 64, z: 6 }, "faces"],
  ["walls", { x: 4, y: 64, z: 6 }, "walls"],
] as const)("routes shape %s to ConfirmShape", async (id, end, style) => {
  const { session, menus, player, cases } = setup();
  session.setFlow({ ...endpoint, to: end });
  ui.answers.push({
    selection: shapeMenu(session.flow).findIndex((e) => e.id === id),
  });
  await menus.showShapeMenu(player);
  expect(cases.confirmShape.execute).toHaveBeenCalledExactlyOnceWith({
    playerId,
    style,
  });
});

it.each(["gable", "hip", "cylinder", "cube"] as const)(
  "chooses %s without a slider by default",
  async (kind) => {
    const { menus, player, cases } = setup();
    ui.answers.push({
      selection: shapeMenu(endpoint).findIndex((e) => e.id === kind),
    });
    await menus.showShapeMenu(player);
    expect(cases.chooseHeighted.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      kind,
    });
    expect(ui.forms).toHaveLength(1);
  },
);

it.each([false, true])("confirms roof hollow=%s", async (hollow) => {
  const { session, menus, player, cases } = setup();
  session.setFlow(chooseHeighted(endpoint, "gable"));
  ui.answers.push({ selection: hollow ? 1 : 0 });
  await menus.showContentsMenu(player);
  expect(cases.confirmHeighted.execute).toHaveBeenCalledExactlyOnceWith({
    playerId,
    fill: hollow ? "hollow" : "fill",
  });
});

it.each(["shape", "contents"] as const)(
  "returns to aiming for Cancel and dismissal in the %s menu",
  async (menu) => {
    for (const answer of [
      { canceled: true },
      { cancelationReason: "UserClosed" },
      {
        selection:
          menu === "shape"
            ? shapeMenu(endpoint).findIndex((entry) => entry.id === "cancel")
            : 2,
      },
    ]) {
      const { session, menus, player, cases } = setup();
      if (menu === "contents")
        session.setFlow(chooseHeighted(endpoint, "gable"));
      ui.answers.push(answer);
      await (menu === "shape"
        ? menus.showShapeMenu(player)
        : menus.showContentsMenu(player));
      expect(cases.cancel.backToAiming).toHaveBeenCalledExactlyOnceWith({
        playerId,
      });
      expect(session.flow.kind).toBe("point1");
    }
  },
);

it.each(["copy", "undo", "clear"] as const)("routes utility %s", async (id) => {
  const { session, menus, player, cases } = setup();
  session.confirmBox(overworld, boxOf(from, to));
  session.finishEdit(
    {
      dimensionId: overworld,
      changes: [{ cell: from, before: stone, after: stone }],
    },
    false,
  );
  ui.answers.push({
    selection: utilityMenu(session).findIndex((e) => e.id === id),
  });
  await menus.showUtilityMenu(player);
  expect(cases[id].execute).toHaveBeenCalledExactlyOnceWith({ playerId });
});

it.each([false, true])(
  "passes skip air=%s after a toggle defaulting off",
  async (skipAir) => {
    const { session, menus, player, cases } = setup();
    session.setClipboard(clipboardOf(boxOf(from, from), () => stone));
    ui.answers.push({ selection: 0 }, { formValues: [skipAir] });
    await menus.showUtilityMenu(player);
    expect(ui.forms[1]?.toggles).toEqual([
      {
        label: { translate: BUILD_FORM.skipAir },
        options: { defaultValue: false },
      },
    ]);
    expect(cases.paste.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      skipAir,
    });
  },
);

it("does nothing on utility or paste dismissal", async () => {
  for (const paste of [false, true]) {
    const { session, menus, player, cases } = setup();
    session.setClipboard(clipboardOf(boxOf(from, from), () => stone));
    if (paste) ui.answers.push({ selection: 0 });
    ui.answers.push({ canceled: true });
    await menus.showUtilityMenu(player);
    expect(cases.paste.execute).not.toHaveBeenCalled();
    expect(cases.cancel.backToAiming).not.toHaveBeenCalled();
  }
});

it("bounds the fallback slider, uses the previous height and applies it before the roof menu", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 319 }),
      fc.integer({ min: 1, max: 21 }),
      fc.constantFrom(
        "gable" as const,
        "hip" as const,
        "cylinder" as const,
        "cube" as const,
      ),
      async (y, requested, kind) => {
        const { session, menus, player, cases } = setup(true);
        const flow = chooseHeighted(
          { ...endpoint, from: { ...from, y }, to: { ...to, y } },
          kind,
        );
        if (flow.kind !== "heightStep") throw new Error("Expected roof");
        const max = volumeOf(kind).maxHeight(flow.base, BUILD_SPEC.worldTopY);
        const previous = Math.min(max, requested);
        session.setFlow({ ...flow, previous });
        ui.forms.length = 0;
        ui.answers.push({ formValues: [max] }, { selection: 1 });
        await menus.showHeightSlider(player);
        const title =
          kind === "cylinder" || kind === "cube"
            ? BUILD_FORM.solidTitle
            : BUILD_FORM.roofTitle;
        expect(ui.forms[0]?.heading).toEqual({ translate: title });
        expect(ui.forms[1]?.heading).toEqual({ translate: title });
        expect(ui.forms[0]?.sliders).toEqual([
          {
            label: { translate: BUILD_FORM.height },
            min: 1,
            max,
            options: { defaultValue: previous, valueStep: 1 },
          },
        ]);
        expect(cases.setHeight.execute).toHaveBeenCalledExactlyOnceWith({
          playerId,
          height: max,
        });
        expect(session.flow).toEqual({ ...flow, previous: max });
        expect(ui.forms[1]?.buttons).toEqual(
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

it.each(["gable", "hip", "cylinder", "cube"] as const)(
  "chains %s through the enabled slider to the roof menu",
  async (kind) => {
    const { menus, player, cases } = setup(true);
    ui.answers.push(
      { selection: shapeMenu(endpoint).findIndex((e) => e.id === kind) },
      { formValues: [3] },
      { selection: 0 },
    );
    await menus.showShapeMenu(player);
    expect(ui.forms).toHaveLength(3);
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
  const { repo, session, menus, player } = setup();
  session.setClipboard(clipboardOf(boxOf(from, from), () => stone));
  let close!: (answer: Answer) => void;
  ui.answers.push(
    { selection: 0 },
    new Promise((resolve) => {
      close = resolve;
    }),
  );
  const pending = menus.showUtilityMenu(player);
  await vi.waitFor(() => expect(ui.forms).toHaveLength(2));
  await menus.showShapeMenu(player);
  await menus.showHeightSlider(player);
  await menus.showContentsMenu(player);
  expect(ui.forms).toHaveLength(2);
  const other = { id: "other", isValid: true } as Player;
  repo.getOrCreate(asPlayerId(other.id)).setFlow(endpoint);
  await menus.showShapeMenu(other);
  expect(ui.forms).toHaveLength(3);
  close({ canceled: true });
  await pending;
  await menus.showShapeMenu(player);
  expect(ui.forms).toHaveLength(4);
});

it.each(["shape", "roof", "paste", "slider"] as const)(
  "ignores %s responses after disconnection",
  async (stage) => {
    const { session, menus, player, cases } = setup();
    let close!: (answer: Answer) => void;
    if (stage === "roof" || stage === "slider")
      session.setFlow(chooseHeighted(endpoint, "hip"));
    if (stage === "paste") {
      session.setClipboard(clipboardOf(boxOf(from, from), () => stone));
      ui.answers.push({ selection: 0 });
    }
    ui.answers.push(
      new Promise((resolve) => {
        close = resolve;
      }),
    );
    const pending =
      stage === "shape"
        ? menus.showShapeMenu(player)
        : stage === "roof"
          ? menus.showContentsMenu(player)
          : stage === "paste"
            ? menus.showUtilityMenu(player)
            : menus.showHeightSlider(player);
    await vi.waitFor(() =>
      expect(ui.forms).toHaveLength(stage === "paste" ? 2 : 1),
    );
    Object.assign(player, { isValid: false });
    close({ selection: 0, formValues: [stage === "paste" ? true : 3] });
    await pending;
    for (const action of Object.values(cases))
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

it("dispatches only entries offered by the current flow, including stale choices", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      fc.constantFrom(
        "place",
        "fill",
        "frame",
        "faces",
        "walls",
        "gable",
        "hip",
        "cylinder",
        "cube",
        "cancel",
        "invalid",
      ),
      (from, to, id) => {
        const { session, cases, choices } = setup();
        const flow: BuildFlow = { ...endpoint, from, to };
        session.setFlow(flow);
        const offered = shapeMenu(flow).some((entry) => entry.id === id);
        expect(choices.choose(playerId, "shape", id)).toBe(offered);
        if (!offered) {
          for (const action of Object.values(cases))
            expect(Object.values(action)[0]).not.toHaveBeenCalled();
        } else if (id === "cancel") {
          expect(cases.cancel.backToAiming).toHaveBeenCalledExactlyOnceWith({
            playerId,
          });
        } else if (
          id === "gable" ||
          id === "hip" ||
          id === "cylinder" ||
          id === "cube"
        ) {
          expect(cases.chooseHeighted.execute).toHaveBeenCalledExactlyOnceWith({
            playerId,
            kind: id,
          });
        } else {
          expect(cases.confirmShape.execute).toHaveBeenCalledExactlyOnceWith({
            playerId,
            style: id === "place" ? "fill" : id,
          });
        }
        session.setFlow({ kind: "idle" });
        expect(choices.choose(playerId, "shape", id)).toBe(false);
        expect(choices.choose(playerId, "contents", "fill")).toBe(false);
      },
    ),
  );
});

it("validates utility availability before dispatching and preserves the paste toggle", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      (confirmed, clipboard, history, skipAir) => {
        const { session, cases, choices } = setup();
        session.setFlow({ kind: "idle" });
        const box = boxOf(from, to);
        if (confirmed) session.confirmBox(overworld, box);
        if (clipboard) session.setClipboard(clipboardOf(box, () => stone));
        if (history)
          session.finishEdit(
            {
              dimensionId: overworld,
              changes: [{ cell: from, before: stone, after: stone }],
            },
            false,
          );
        for (const [id, offered] of [
          ["copy", confirmed],
          ["paste", clipboard],
          ["undo", history],
          ["clear", confirmed],
        ] as const) {
          expect(choices.choose(playerId, "utility", id, { skipAir })).toBe(
            offered,
          );
          if (offered)
            expect(cases[id].execute).toHaveBeenCalledExactlyOnceWith(
              id === "paste" ? { playerId, skipAir } : { playerId },
            );
          else expect(cases[id].execute).not.toHaveBeenCalled();
        }
        expect(choices.choose(asPlayerId("absent"), "utility", "paste")).toBe(
          false,
        );
      },
    ),
  );
});

it.each(["fill", "hollow", "cancel"] as const)(
  "dispatches roof %s only during height selection",
  (id) => {
    const { session, choices, cases } = setup();
    expect(choices.choose(playerId, "contents", id)).toBe(false);
    session.setFlow(chooseHeighted(endpoint, "hip"));
    expect(choices.choose(playerId, "contents", id)).toBe(true);
    if (id === "cancel")
      expect(cases.cancel.backToAiming).toHaveBeenCalledExactlyOnceWith({
        playerId,
      });
    else
      expect(cases.confirmHeighted.execute).toHaveBeenCalledExactlyOnceWith({
        playerId,
        fill: id,
      });
  },
);

it.each([false, true])(
  "opens locked cylinder contents directly with fallback=%s",
  async (fallback) => {
    const { session, menus, player, cases } = setup(fallback);
    session.setFlow({ ...endpoint, to: { ...to, y: 71 } });
    ui.answers.push({ selection: 3 }, { selection: 2 });
    await menus.showShapeMenu(player);
    expect(cases.chooseHeighted.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      kind: "cylinder",
    });
    expect(ui.forms).toHaveLength(2);
    expect(ui.forms[1]?.heading).toEqual({ translate: BUILD_FORM.solidTitle });
    expect(ui.forms[1]?.buttons).toEqual(labels(contentsMenu(session.flow)));
    expect(cases.setHeight.execute).not.toHaveBeenCalled();
    expect(cases.confirmHeighted.execute).toHaveBeenCalledExactlyOnceWith({
      playerId,
      fill: "tube",
    });
    expect(session.flow).toMatchObject({ heightLocked: true, previous: 12 });
    ui.answers.push({ selection: 0 });
    await menus.showHeightSlider(player);
    expect(ui.forms).toHaveLength(3);
    expect(ui.forms[2]?.sliders).toEqual([]);
    expect(cases.setHeight.execute).not.toHaveBeenCalled();
  },
);

it.each([
  ["line", { x: 4, y: 60, z: 0 }],
  ["horizontal rectangle", to],
  ["x-flat rectangle", { x: 0, y: 64, z: 6 }],
  ["z-flat rectangle", { x: 4, y: 64, z: 0 }],
  ["box", { x: 4, y: 64, z: 6 }],
] as const)("routes Copy on a %s to ChooseCopy", async (_shape, end) => {
  const { session, menus, player, cases } = setup();
  session.setFlow({ ...endpoint, to: end });
  ui.answers.push({
    selection: shapeMenu(session.flow).findIndex((e) => e.id === "copy"),
  });
  await menus.showShapeMenu(player);
  expect(cases.chooseCopy.execute).toHaveBeenCalledExactlyOnceWith({
    playerId,
  });
  expect(cases.copy.execute).not.toHaveBeenCalled();
  expect(ui.forms).toHaveLength(1);
});

it("confirms Copy after the fallback slider without opening contents", async () => {
  const { menus, player, cases, session } = setup(true);
  ui.answers.push(
    { selection: shapeMenu(endpoint).findIndex((e) => e.id === "copy") },
    { formValues: [7] },
  );
  cases.confirmCopyHeight.execute.mockImplementation(() => {
    expect(session.flow).toMatchObject({ heightedKind: "copy", previous: 7 });
  });
  await menus.showShapeMenu(player);
  expect(ui.forms).toHaveLength(2);
  expect(ui.forms[1]?.heading).toEqual({ translate: BUILD_FORM.copyTitle });
  expect(cases.confirmCopyHeight.execute).toHaveBeenCalledExactlyOnceWith({
    playerId,
  });
  expect(cases.confirmHeighted.execute).not.toHaveBeenCalled();
});

it("does not open contents or a slider for locked Copy", async () => {
  const { menus, player, session } = setup(true);
  const flow = chooseHeighted(endpoint, "copy");
  if (flow.kind !== "heightStep") throw new Error("Expected height step");
  session.setFlow({ ...flow, heightLocked: true });
  await menus.showHeightSlider(player);
  await menus.showContentsMenu(player);
  expect(ui.forms).toHaveLength(0);
});

it("accepts StopPaste only in paste aiming and exposes its own label", async () => {
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
    expect(choices.choose(playerId, "utility", "stopPaste")).toBe(false);
  }
  expect(cases.stopPaste.execute).not.toHaveBeenCalled();
  session.setFlow({ kind: "pasteAim", skipAir: false });
  expect(choices.choose(playerId, "utility", "stopPaste")).toBe(true);
  expect(cases.stopPaste.execute).toHaveBeenCalledExactlyOnceWith({ playerId });
  expect(session.flow.kind).toBe("idle");
  expect(choices.choose(playerId, "utility", "stopPaste")).toBe(false);
  session.setFlow({ kind: "pasteAim", skipAir: true });
  ui.answers.push({
    selection: utilityMenu(session).findIndex(
      (entry) => entry.id === "stopPaste",
    ),
  });
  await menus.showUtilityMenu(player);
  expect(ui.forms[0]?.buttons).toContainEqual({
    translate: BUILD_FORM.stopPaste,
  });
  expect(session.flow.kind).toBe("idle");
});
