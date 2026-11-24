import type { RawMessage } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { asWarpPointId } from "../../../src/domain/warp/ids";
import { parseWarpName } from "../../../src/domain/warp/warpName";
import {
  BedrockWarpMenus,
  warpLabel,
} from "../../../src/infrastructure/warp/bedrock/bedrockWarpMenus";
import { WARP_MESSAGE } from "../../../src/infrastructure/warp/messages";

const ui = vi.hoisted(() => {
  const show = vi.fn();
  const getEntity = vi.fn();
  const forms: Form[] = [];
  class Form {
    heading?: RawMessage;
    field?: { label: RawMessage; options: { defaultValue: string } };
    buttons: RawMessage[] = [];
    constructor() {
      forms.push(this);
    }
    title(value: RawMessage) {
      this.heading = value;
      return this;
    }
    textField(
      label: RawMessage,
      _placeholder: string,
      options: { defaultValue: string },
    ) {
      this.field = { label, options };
      return this;
    }
    button(value: RawMessage) {
      this.buttons.push(value);
      return this;
    }
    show = show;
  }
  return { show, getEntity, forms, Form };
});
vi.mock("@minecraft/server", () => ({ world: { getEntity: ui.getEntity } }));
vi.mock("@minecraft/server-ui", () => ({
  ModalFormData: ui.Form,
  ActionFormData: ui.Form,
  FormCancelationReason: { UserBusy: "UserBusy", UserClosed: "UserClosed" },
}));
const playerId = asPlayerId("player");
const player = { typeId: "minecraft:player", isValid: true };
const homeName = parseWarpName("Home");
if (!homeName) throw new Error("Invalid fixture name");
const point = {
  id: asWarpPointId("warp-1"),
  name: homeName,
  owner: "Alex",
  dimension: asDimensionId("minecraft:overworld"),
  cell: cellOf({ x: 1, y: 64, z: -2 }),
};
const menus = new BedrockWarpMenus();
const page = {
  entries: [{ point, unverified: false }],
  pageIndex: 0,
  pageCount: 1,
};
beforeEach(() => {
  vi.resetAllMocks();
  ui.forms.length = 0;
  player.isValid = true;
  ui.getEntity.mockReturnValue(player);
  ui.show.mockResolvedValue({});
});

it("normalizes submitted names and prepopulates the current name", async () => {
  await fc.assert(
    fc.asyncProperty(fc.string(), async (raw) => {
      ui.show.mockResolvedValue({ formValues: [raw] });
      const name = parseWarpName(raw);
      expect(await menus.askName(playerId, point.name)).toEqual(
        name ? { kind: "name", name } : { kind: "cancelled" },
      );
      expect(ui.forms.at(-1)?.field).toEqual({
        label: { translate: WARP_MESSAGE.nameLabel, with: ["32"] },
        options: { defaultValue: "Home" },
      });
      expect(ui.forms.at(-1)?.heading).toEqual({
        translate: WARP_MESSAGE.nameTitle,
      });
      expect(ui.show).toHaveBeenLastCalledWith(player);
      expect(ui.getEntity).toHaveBeenLastCalledWith(playerId);
    }),
  );
});
it("starts with an empty field and truncates long names", async () => {
  ui.show.mockResolvedValue({ formValues: ["a".repeat(40)] });
  expect(await menus.askName(playerId)).toEqual({
    kind: "name",
    name: "a".repeat(32),
  });
  expect(ui.forms.at(-1)?.field?.options.defaultValue).toBe("");
});
it.each([
  [{ canceled: true }, "cancelled"],
  [{ cancelationReason: "UserClosed" }, "cancelled"],
  [{ canceled: true, cancelationReason: "UserBusy" }, "busy"],
  [{}, "cancelled"],
  [{ formValues: [42] }, "cancelled"],
  [{ formValues: ["   "] }, "cancelled"],
])("maps form cancellation and malformed answers: %j", async (answer, kind) => {
  ui.show.mockResolvedValue(answer);
  expect(await menus.askName(playerId)).toEqual({ kind });
  expect(await menus.chooseWarp(playerId, page)).toEqual({ kind });
});
it.each([
  undefined,
  { typeId: "minecraft:pig", isValid: true },
  { ...player, isValid: false },
])("does not show forms for unavailable players", async (entity) => {
  ui.getEntity.mockReturnValue(entity);
  expect(await menus.askName(playerId)).toEqual({ kind: "cancelled" });
  expect(await menus.chooseWarp(playerId, page)).toEqual({ kind: "cancelled" });
  expect(ui.forms).toHaveLength(0);
});
it("discards answers after the player leaves", async () => {
  ui.show.mockImplementation(async () => {
    player.isValid = false;
    return { selection: 0, formValues: ["New"] };
  });
  expect(await menus.askName(playerId)).toEqual({ kind: "cancelled" });
  player.isValid = true;
  expect(await menus.chooseWarp(playerId, page)).toEqual({ kind: "cancelled" });
});
it("keeps point IDs stable and only offers reachable pages", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 10 }),
      fc.nat(),
      fc.string().filter((s) => !!s.trim()),
      async (pageCount, n, id) => {
        const pageIndex = n % pageCount;
        const current = {
          ...page,
          pageCount,
          pageIndex,
          entries: [
            { point: { ...point, id: asWarpPointId(id) }, unverified: false },
          ],
        };
        ui.show.mockResolvedValue({ selection: 0 });
        expect(await menus.chooseWarp(playerId, current)).toEqual({
          kind: "warp",
          id,
        });
        const buttons = ui.forms.at(-1)?.buttons ?? [];
        expect(ui.forms.at(-1)?.heading).toEqual({
          translate: WARP_MESSAGE.listTitle,
        });
        expect(buttons[0]).toEqual(warpLabel(point, false));
        expect(buttons.slice(1)).toEqual([
          ...(pageIndex > 0 ? [{ translate: WARP_MESSAGE.previousPage }] : []),
          ...(pageIndex < pageCount - 1
            ? [{ translate: WARP_MESSAGE.nextPage }]
            : []),
        ]);
        for (let selection = 1; selection < buttons.length; selection++) {
          ui.show.mockResolvedValue({ selection });
          expect(await menus.chooseWarp(playerId, current)).toEqual({
            kind: "page",
            pageIndex: pageIndex + (pageIndex > 0 && selection === 1 ? -1 : 1),
          });
        }
      },
    ),
  );
});
it("cancels empty lists and out-of-range answers", async () => {
  expect(await menus.chooseWarp(playerId, { ...page, entries: [] })).toEqual({
    kind: "cancelled",
  });
  expect(ui.forms).toHaveLength(0);
  ui.show.mockResolvedValue({ selection: 99 });
  expect(await menus.chooseWarp(playerId, page)).toEqual({ kind: "cancelled" });
});
it.each([
  ["minecraft:overworld", { translate: WARP_MESSAGE.overworld }],
  ["minecraft:nether", { translate: WARP_MESSAGE.nether }],
  ["minecraft:the_end", { translate: WARP_MESSAGE.theEnd }],
  ["custom:moon", { text: "custom:moon" }],
])("renders a translated or fallback dimension: %s", (dimension, label) => {
  fc.assert(
    fc.property(
      fc.string(),
      fc.string(),
      fc.integer(),
      fc.integer(),
      fc.integer(),
      fc.boolean(),
      (name, owner, x, y, z, unverified) => {
        const p = {
          ...point,
          name: parseWarpName(name) ?? point.name,
          owner,
          dimension: asDimensionId(dimension),
          cell: cellOf({ x, y, z }),
        };
        expect(warpLabel(p, unverified)).toEqual({
          rawtext: [
            { text: `${p.name}\n${owner} | ` },
            label,
            { text: ` | ${x} ${y} ${z}` },
            ...(unverified
              ? [{ text: " | " }, { translate: WARP_MESSAGE.unverified }]
              : []),
          ],
        });
      },
    ),
  );
});
