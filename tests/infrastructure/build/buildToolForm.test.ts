import type { Player, RawMessage } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { showBuildToolForm } from "../../../src/infrastructure/build/bedrock/buildToolForm";
import { BUILD_FORM } from "../../../src/infrastructure/build/identifiers";

const ui = vi.hoisted(() => {
  class Form {
    buttons: RawMessage[] = [];
    dropdowns: { label: RawMessage; items: RawMessage[] }[] = [];
    toggles: { label: RawMessage; options: unknown }[] = [];
    constructor() {
      forms.push(this);
    }
    title() {
      return this;
    }
    submitButton() {
      return this;
    }
    button(label: RawMessage) {
      this.buttons.push(label);
      return this;
    }
    dropdown(label: RawMessage, items: RawMessage[]) {
      this.dropdowns.push({ label, items });
      return this;
    }
    toggle(label: RawMessage, options: unknown) {
      this.toggles.push({ label, options });
      return this;
    }
    async show() {
      return answers.shift();
    }
  }
  const forms: Form[] = [];
  const answers: {
    canceled: boolean;
    selection?: number;
    formValues?: (number | boolean)[];
  }[] = [];
  return { Form, forms, answers };
});
vi.mock("@minecraft/server-ui", () => ({
  ActionFormData: ui.Form,
  ModalFormData: ui.Form,
}));
vi.mock("@minecraft/server", () => ({
  BlockPermutation: {
    resolve: (typeId: string) => {
      if (
        !new Set(["minecraft:stone", "minecraft:oak_log", "minecraft:air"]).has(
          typeId,
        )
      )
        throw new Error("not a block");
      return {
        type: { id: typeId },
        getAllStates: () =>
          typeId === "minecraft:oak_log" ? { pillar_axis: "y" } : {},
      };
    },
  },
}));

beforeEach(() => {
  ui.forms.length = 0;
  ui.answers.length = 0;
});

function setup(hotbar: string[] = []) {
  const getItem = vi.fn((slot: number) => {
    const typeId = hotbar[slot];
    return typeId ? { typeId, localizationKey: `item.${typeId}` } : undefined;
  });
  const player = {
    isValid: true,
    getComponent: () => ({ container: { size: 36, getItem } }),
  } as unknown as Player;
  const actions = {
    fill: vi.fn(),
    replace: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    undo: vi.fn(),
    clearSelection: vi.fn(),
  };
  return { player, actions, getItem };
}

it("offers distinct resolvable hotbar blocks in slot order followed by air", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.constantFrom(
          "minecraft:stone",
          "minecraft:oak_log",
          "minecraft:stick",
          "minecraft:air",
          "",
        ),
        { maxLength: 12 },
      ),
      async (items) => {
        ui.forms.length = 0;
        ui.answers.push(
          { canceled: false, selection: 0 },
          { canceled: false, formValues: [0] },
        );
        const { player, actions, getItem } = setup(items);
        await showBuildToolForm(player, actions);
        expect(ui.forms[0]?.buttons).toEqual(
          [
            BUILD_FORM.fill,
            BUILD_FORM.replace,
            BUILD_FORM.copy,
            BUILD_FORM.paste,
            BUILD_FORM.undo,
            BUILD_FORM.clearSelection,
          ].map((translate) => ({ translate })),
        );
        const expected = [
          ...new Set(
            items
              .slice(0, 9)
              .filter(
                (type) =>
                  type === "minecraft:stone" || type === "minecraft:oak_log",
              ),
          ),
        ];
        expect(ui.forms[1]?.dropdowns).toEqual([
          {
            label: { translate: BUILD_FORM.block },
            items: [
              ...expected.map((type) => ({ translate: `item.${type}` })),
              { translate: BUILD_FORM.air },
            ],
          },
        ]);
        expect(getItem.mock.calls.map(([slot]) => slot)).toEqual([
          0, 1, 2, 3, 4, 5, 6, 7, 8,
        ]);
        expect(actions.fill).toHaveBeenCalledExactlyOnceWith({
          state: {
            typeId: expected[0] ?? "minecraft:air",
            states:
              expected[0] === "minecraft:oak_log" ? { pillar_axis: "y" } : {},
          },
        });
      },
    ),
  );
});

it("uses a type-only replace mask and the resolved destination states", async () => {
  const { player, actions } = setup(["minecraft:stone", "minecraft:oak_log"]);
  ui.answers.push(
    { canceled: false, selection: 1 },
    { canceled: false, formValues: [1, 0] },
  );
  await showBuildToolForm(player, actions);
  expect(ui.forms[1]?.dropdowns.map((d) => d.label)).toEqual([
    { translate: BUILD_FORM.replace },
    { translate: BUILD_FORM.with },
  ]);
  expect(actions.replace).toHaveBeenCalledExactlyOnceWith(
    { typeId: "minecraft:oak_log" },
    { state: { typeId: "minecraft:stone", states: {} } },
  );
});

it.each([false, true])(
  "defaults skip air off and passes the chosen toggle value %s",
  async (skipAir) => {
    const { player, actions, getItem } = setup();
    ui.answers.push(
      { canceled: false, selection: 3 },
      { canceled: false, formValues: [skipAir] },
    );
    await showBuildToolForm(player, actions);
    expect(ui.forms[1]?.toggles).toEqual([
      {
        label: { translate: BUILD_FORM.skipAir },
        options: { defaultValue: false },
      },
    ]);
    expect(actions.paste).toHaveBeenCalledExactlyOnceWith(skipAir);
    expect(getItem).not.toHaveBeenCalled();
  },
);

it.each([2, 4, 5])(
  "executes immediate menu action %s without a modal",
  async (selection) => {
    const { player, actions, getItem } = setup();
    ui.answers.push({ canceled: false, selection });
    await showBuildToolForm(player, actions);
    const chosen =
      selection === 2
        ? actions.copy
        : selection === 4
          ? actions.undo
          : actions.clearSelection;
    expect(chosen).toHaveBeenCalledExactlyOnceWith();
    expect(ui.forms).toHaveLength(1);
    expect(getItem).not.toHaveBeenCalled();
  },
);

it.each([undefined, 0, 1, 3])(
  "leaves all actions untouched when a form is cancelled after choice %s",
  async (selection) => {
    const { player, actions } = setup(["minecraft:stone"]);
    if (selection !== undefined)
      ui.answers.push({ canceled: false, selection });
    ui.answers.push({ canceled: true });
    await showBuildToolForm(player, actions);
    for (const action of Object.values(actions))
      expect(action).not.toHaveBeenCalled();
  },
);
