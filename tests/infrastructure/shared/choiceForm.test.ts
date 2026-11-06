import type { Player, RawMessage } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import {
  chooseFromForm,
  chooseFromFormResult,
} from "../../../src/infrastructure/shared/choiceForm";

type Answer = {
  canceled?: boolean;
  cancelationReason?: string;
  selection?: number;
};
const ui = vi.hoisted(() => {
  const answers: Answer[] = [];
  const forms: Form[] = [];
  class Form {
    heading?: RawMessage;
    buttons: RawMessage[] = [];
    message?: RawMessage;
    constructor() {
      forms.push(this);
    }
    title(value: RawMessage) {
      this.heading = value;
      return this;
    }
    body(value: RawMessage) {
      this.message = value;
      return this;
    }
    button(value: RawMessage) {
      this.buttons.push(value);
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
  FormCancelationReason: { UserBusy: "UserBusy", UserClosed: "UserClosed" },
}));
beforeEach(() => {
  ui.answers.length = 0;
  ui.forms.length = 0;
});
const player = { id: "p", isValid: true } as Player;
const entries = [
  { id: "a", textKey: "label.a" },
  { id: "b", textKey: "label.b" },
];

it("does not construct a form for empty entries", async () => {
  expect(await chooseFromForm(player, "title", [])).toBeUndefined();
  expect(ui.forms).toHaveLength(0);
});
it("ignores an answer when the player is invalid", async () => {
  ui.answers.push({ selection: 0 });
  expect(
    await chooseFromForm(
      { ...player, isValid: false } as Player,
      "title",
      entries,
    ),
  ).toBeUndefined();
});
it.each([{ canceled: true }, { cancelationReason: "UserClosed" }])(
  "returns cancel on dismissal",
  async (answer) => {
    ui.answers.push(answer);
    expect(await chooseFromForm(player, "title", entries)).toBe("cancel");
  },
);
it("returns the selected id and constructs translated labels", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.string(), { minLength: 1, maxLength: 20 }),
      fc.nat(),
      async (ids, n) => {
        const choices = ids.map((id, i) => ({ id, textKey: `key.${i}` }));
        const selection = n % choices.length;
        ui.answers.push({ selection });
        expect(await chooseFromForm(player, "title", choices)).toBe(
          ids[selection],
        );
        const form = ui.forms.at(-1);
        expect(form?.heading).toEqual({ translate: "title" });
        expect(form?.buttons).toEqual(
          choices.map(({ textKey }) => ({ translate: textKey })),
        );
      },
    ),
  );
});
it("returns undefined without a selection or for an out-of-range selection", async () => {
  expect(await chooseFromForm(player, "title", entries)).toBeUndefined();
  ui.answers.push({ selection: 10 });
  expect(await chooseFromForm(player, "title", entries)).toBeUndefined();
});

it("distinguishes a busy form from user dismissal while preserving legacy cancellation", async () => {
  ui.answers.push({ canceled: true, cancelationReason: "UserBusy" });
  expect(await chooseFromFormResult(player, "title", entries)).toEqual({
    status: "busy",
  });
  ui.answers.push({ canceled: true, cancelationReason: "UserBusy" });
  expect(await chooseFromForm(player, "title", entries)).toBe("cancel");
  ui.answers.push({ cancelationReason: "UserClosed" });
  expect(await chooseFromFormResult(player, "title", entries)).toEqual({
    status: "cancelled",
  });
});
it("reports answered, unanswered, and unavailable forms", async () => {
  ui.answers.push({ selection: 1 });
  expect(await chooseFromFormResult(player, "title", entries)).toEqual({
    status: "answered",
    choice: "b",
  });
  expect(await chooseFromFormResult(player, "title", entries)).toEqual({
    status: "unanswered",
  });
  expect(await chooseFromFormResult(player, "title", [])).toEqual({
    status: "unavailable",
  });
  expect(
    await chooseFromFormResult(
      { ...player, isValid: false } as Player,
      "title",
      entries,
    ),
  ).toEqual({ status: "unavailable" });
});
it("shows a body only when one is given", async () => {
  ui.answers.push({ selection: 0 }, { selection: 0 });
  const body = { translate: "body", with: ["1"] };
  expect(await chooseFromForm(player, "title", entries, body)).toBe("a");
  expect(ui.forms.at(-1)?.message).toEqual(body);
  expect(await chooseFromForm(player, "title", entries)).toBe("a");
  expect(ui.forms.at(-1)?.message).toBeUndefined();
});
