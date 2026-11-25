import type { Player } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { asPlayerId } from "../../../../src/domain/shared/ids";
import type { NavDestination } from "../../../../src/domain/vehicle/navigation/destinations";
import { chooseFromForm } from "../../../../src/infrastructure/shared/choiceForm";
import { ActionBarLog } from "../../../../src/infrastructure/vehicle/bedrock/actionBarLog";
import { BedrockNavWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockNavWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";

vi.mock("@minecraft/server", () => ({ world: {} }));

vi.mock("../../../../src/infrastructure/shared/choiceForm", () => ({
  chooseFromForm: vi.fn(),
}));

const destination = "test_destination" as NavDestination;
const playerId = asPlayerId("driver");

function setup(emptySlotsCount = 1) {
  const player = {
    isValid: true,
    getComponent: vi.fn(() => ({ container: { emptySlotsCount } })),
    runCommand: vi.fn(() => ({ successCount: 1 })),
  };
  const index = new EntityIndex();
  vi.spyOn(index, "player").mockReturnValue(player as unknown as Player);
  const nav = new BedrockNavWorld(index, new ActionBarLog(index, () => 0));
  return { nav, player };
}

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

it.each([
  [1, 'execute at @s run loot give @s loot "yasu_ride/nav_test_destination"'],
  [
    0,
    'execute at @s run loot spawn ~ ~ ~ loot "yasu_ride/nav_test_destination"',
  ],
] as const)(
  "runs loot once at the driver with %i free inventory slots",
  (slots, command) => {
    const { nav, player } = setup(slots);
    expect(nav.giveMap(playerId, destination)).toBe("unknown");
    expect(player.runCommand).toHaveBeenCalledExactlyOnceWith(command);
  },
);
