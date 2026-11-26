import type { Player } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { asPlayerId } from "../../../../src/domain/shared/ids";
import type { NavDestination } from "../../../../src/domain/vehicle/navigation/destinations";
import { chooseFromForm } from "../../../../src/infrastructure/shared/choiceForm";
import { ActionBarLog } from "../../../../src/infrastructure/vehicle/bedrock/actionBarLog";
import { BedrockNavWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockNavWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import { giveExplorerMap } from "../../../../src/infrastructure/vehicle/bedrock/navMapDelivery";

vi.mock("@minecraft/server", () => ({ world: {} }));

vi.mock("../../../../src/infrastructure/shared/choiceForm", () => ({
  chooseFromForm: vi.fn(),
}));

const destination = "test_destination" as NavDestination;
const playerId = asPlayerId("driver");

function setup(
  items: ({ typeId: string; amount: number } | undefined)[] = [undefined],
) {
  const player = {
    isValid: true,
    onScreenDisplay: { setActionBar: vi.fn() },
    getComponent: vi.fn(() => ({
      container: {
        emptySlotsCount: items.filter((item) => item === undefined).length,
        size: items.length,
        getItem: (slot: number) => items[slot],
      },
    })),
    runCommand: vi.fn(() => ({ successCount: 1 })),
  };
  const index = new EntityIndex();
  vi.spyOn(index, "player").mockReturnValue(player as unknown as Player);
  const nav = new BedrockNavWorld(index, new ActionBarLog(index, () => 0));
  return { nav, player, index };
}

it("returns the give path and the filled map counts around the loot command", () => {
  const stack = { typeId: "minecraft:filled_map", amount: 3 };
  const { player } = setup([stack, undefined]);
  player.runCommand.mockImplementationOnce(() => {
    stack.amount++;
    return { successCount: 1 };
  });
  expect(giveExplorerMap(player as unknown as Player, destination)).toEqual({
    path: "give",
    result: "given",
    before: 3,
    after: 4,
  });
});

it.each([destination, "cancel", undefined] as const)(
  "maps the form answer %s",
  async (answer) => {
    const { nav, player } = setup();
    vi.mocked(chooseFromForm).mockResolvedValueOnce(answer);
    await expect(nav.choose(playerId, [destination])).resolves.toBe(
      answer === "cancel" ? undefined : answer,
    );
    expect(chooseFromForm).toHaveBeenLastCalledWith(
      player,
      "yasu_ride.nav.title",
      [
        {
          id: destination,
          textKey: "yasu_ride.nav.destination.test_destination",
        },
      ],
    );
  },
);

it("shows the creating message with the translated destination on the rider's action bar", () => {
  const { nav, player } = setup();
  nav.showCreating(playerId, destination);
  expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledExactlyOnceWith({
    translate: "yasu_ride.message.nav_creating",
    with: {
      rawtext: [{ translate: "yasu_ride.nav.destination.test_destination" }],
    },
  });
});

it("returns given when the amount in an existing filled map stack increases", () => {
  const filledMaps = { typeId: "minecraft:filled_map", amount: 2 };
  const { nav, player } = setup([filledMaps, undefined]);
  player.runCommand.mockImplementationOnce(() => {
    filledMaps.amount += 1;
    return { successCount: 1 };
  });
  expect(nav.giveMap(playerId, destination)).toBe("given");
  expect(player.runCommand).toHaveBeenCalledExactlyOnceWith(
    'execute at @s run loot give @s loot "yasu_ride/nav_test_destination"',
  );
});

it("returns nothing when a successful command adds only a blank map", () => {
  const items = [{ typeId: "minecraft:filled_map", amount: 2 }, undefined];
  const { nav, player } = setup(items);
  player.runCommand.mockImplementationOnce(() => {
    items[1] = { typeId: "minecraft:empty_map", amount: 1 };
    return { successCount: 1 };
  });
  expect(nav.giveMap(playerId, destination)).toBe("nothing");
});

it("drops loot at the driver's feet and returns unknown for a full inventory", () => {
  const { nav, player } = setup([{ typeId: "minecraft:stone", amount: 64 }]);
  expect(nav.giveMap(playerId, destination)).toBe("unknown");
  expect(player.runCommand).toHaveBeenCalledExactlyOnceWith(
    'execute at @s run loot spawn ~ ~ ~ loot "yasu_ride/nav_test_destination"',
  );
});

it.each(["invalid", "missing"])(
  "returns unknown without running loot for a %s player",
  (state) => {
    const { nav, player, index } = setup();
    if (state === "missing") vi.mocked(index.player).mockReturnValue(undefined);
    else player.isValid = false;
    expect(nav.giveMap(playerId, destination)).toBe("unknown");
    expect(player.runCommand).not.toHaveBeenCalled();
  },
);
