import type { Player, RawMessage } from "@minecraft/server";
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
    copy: vi.fn(),
    paste: vi.fn(),
    pasteAt: vi.fn(),
    undo: vi.fn(),
    clearSelection: vi.fn(),
  };
  return { player, actions, getItem };
}

it("confirms fill immediately without asking for a block", async () => {
  const { player, actions, getItem } = setup();
  ui.answers.push({ canceled: false, selection: 0 });
  await showBuildToolForm(player, actions);
  expect(actions.fill).toHaveBeenCalledExactlyOnceWith();
  expect(getItem).not.toHaveBeenCalled();
  expect(ui.forms[0]?.buttons).toEqual(
    [
      BUILD_FORM.fill,
      BUILD_FORM.copy,
      BUILD_FORM.paste,
      BUILD_FORM.undo,
      BUILD_FORM.clearSelection,
    ].map((translate) => ({ translate })),
  );
});

it.each([false, true])(
  "defaults skip air off and passes the chosen toggle value %s",
  async (skipAir) => {
    const { player, actions, getItem } = setup();
    ui.answers.push(
      { canceled: false, selection: 2 },
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

it.each([1, 3, 4])(
  "executes immediate menu action %s without a modal",
  async (selection) => {
    const { player, actions, getItem } = setup();
    ui.answers.push({ canceled: false, selection });
    await showBuildToolForm(player, actions);
    const chosen =
      selection === 1
        ? actions.copy
        : selection === 3
          ? actions.undo
          : actions.clearSelection;
    expect(chosen).toHaveBeenCalledExactlyOnceWith();
    expect(ui.forms).toHaveLength(1);
    expect(getItem).not.toHaveBeenCalled();
  },
);

it.each([undefined, 2])(
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
