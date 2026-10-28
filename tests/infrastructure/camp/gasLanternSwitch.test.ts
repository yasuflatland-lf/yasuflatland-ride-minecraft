import type { Block, Entity, Player } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import type { GasLanternActions } from "../../../src/application/camp/gasLantern";
import { gasLanternSwitchTarget } from "../../../src/infrastructure/camp/bedrock/gasLanternSwitch";
import { GAS_LANTERN_TYPE } from "../../../src/infrastructure/camp/identifiers";

vi.mock("@minecraft/server", () => ({ system: { currentTick: 42 } }));
const player = {} as Player;
const entity = (typeId = GAS_LANTERN_TYPE, isValid = true) =>
  ({ id: "lantern", typeId, isValid }) as Entity;

it("claims only Gas Lantern entity presses and switches only valid pressed lanterns", () => {
  const switchLantern = vi.fn();
  const target = gasLanternSwitchTarget({
    switch: switchLantern,
  } as unknown as GasLanternActions);
  expect(target.claimsItemUse(player)).toBe(false);
  expect(target.claimsBlockPress(player, {} as Block)).toBe(false);
  expect(target.claimsEntityPress(player, entity())).toBe(true);
  expect(target.claimsEntityPress(player, entity("yasu_ride:tent"))).toBe(
    false,
  );
  target.switchFor(player);
  target.switchFor(player, entity(GAS_LANTERN_TYPE, false));
  target.switchFor(player, entity("yasu_ride:tent"));
  expect(switchLantern).not.toHaveBeenCalled();
  target.switchFor(player, entity());
  expect(switchLantern).toHaveBeenCalledExactlyOnceWith("lantern", 42);
});
