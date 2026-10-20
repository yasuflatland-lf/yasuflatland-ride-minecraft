import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HINTS } from "../../../../src/domain/vehicle/hints";
import { PAINTS } from "../../../../src/domain/vehicle/paint";
import { BedrockHintWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockHintWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
  dyeOf,
  hintKey,
  PLAYER_TYPE,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({
  getEntity: vi.fn(),
  getAllPlayers: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: game,
  GameMode: { Spectator: "Spectator", Survival: "Survival" },
  InputMode: {
    Gamepad: "Gamepad",
    KeyboardAndMouse: "KeyboardAndMouse",
    MotionController: "MotionController",
    Touch: "Touch",
  },
}));

function fakePlayer(
  over: {
    id?: string;
    mode?: string;
    input?: string | (() => never);
    held?: string;
    riding?: boolean;
  } = {},
) {
  const { id = "p", mode = "Survival", input = "Touch", held, riding } = over;
  const inputInfo = {};
  Object.defineProperty(inputInfo, "lastInputModeUsed", {
    get: typeof input === "function" ? input : () => input,
  });
  return {
    id,
    typeId: PLAYER_TYPE,
    dimension: { id: "overworld" },
    location: { x: 1, y: 64, z: 2 },
    selectedSlotIndex: 3,
    inputInfo,
    getGameMode: () => mode,
    getComponent: (name: string) => {
      if (name === "minecraft:riding") return riding ? {} : undefined;
      if (name === "minecraft:inventory")
        return {
          container: {
            getItem: (slot: number) =>
              slot === 3 && held ? { typeId: held } : undefined,
          },
        };
      return undefined;
    },
    onScreenDisplay: { setActionBar: vi.fn() },
  };
}

describe("BedrockHintWorld", () => {
  beforeEach(() => vi.resetAllMocks());

  it("maps each input mode to its wording, and a gamepad, a motion controller, or a throw to the neutral one", () => {
    const cases = [
      ["Touch", "touch"],
      ["KeyboardAndMouse", "mouse"],
      ["Gamepad", "other"],
      ["MotionController", "other"],
    ] as const;
    game.getAllPlayers.mockReturnValue([
      ...cases.map(([input], i) => fakePlayer({ id: `${i}`, input })),
      fakePlayer({
        id: "throws",
        input: () => {
          throw new Error("engine");
        },
      }),
    ]);
    const views = new BedrockHintWorld(new EntityIndex()).hintPlayers();
    expect(views.map((v) => v.controls)).toEqual([
      ...cases.map(([, controls]) => controls),
      "other",
    ]);
  });

  it("reads a held dye, the riding state, and leaves out spectators and players that throw", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PAINTS), (paint) => {
        game.getAllPlayers.mockReturnValue([
          fakePlayer({ id: "dye", held: dyeOf(paint), riding: true }),
          fakePlayer({ id: "stick", held: "minecraft:stick" }),
          fakePlayer({ id: "empty" }),
          fakePlayer({ id: "ghost", mode: "Spectator" }),
          {
            id: "gone",
            getGameMode: () => {
              throw new Error("invalid");
            },
          },
        ]);
        const views = new BedrockHintWorld(new EntityIndex()).hintPlayers();
        expect(views).toEqual([
          {
            id: "dye",
            dimensionId: "overworld",
            location: { x: 1, y: 64, z: 2 },
            riding: true,
            held: "dye",
            controls: "touch",
          },
          expect.objectContaining({
            id: "stick",
            held: "other",
            riding: false,
          }),
          expect.objectContaining({ id: "empty", held: "other" }),
        ]);
      }),
    );
  });

  it("lists the valid vehicles the drive tracked this tick", () => {
    const index = new EntityIndex();
    const car = {
      id: "car",
      isValid: true,
      dimension: { id: "nether" },
      location: { x: 3, y: 4, z: 5 },
    };
    index.track(car as unknown as Entity);
    index.track({ id: "old", isValid: false } as unknown as Entity);
    expect(new BedrockHintWorld(index).hintVehicles()).toEqual([
      { id: "car", dimensionId: "nether", location: { x: 3, y: 4, z: 5 } },
    ]);
  });

  it("sends a hint as a translated raw text with its numbers and translated vehicle names, and clears with an empty bar", () => {
    const player = fakePlayer();
    game.getEntity.mockImplementation((id: string) =>
      id === player.id ? player : undefined,
    );
    const hints = new BedrockHintWorld(new EntityIndex());
    hints.showHint("p", {
      name: HINTS.bumperMouse,
      with: [{ number: 3 }, { vehicle: "camper" }],
    });
    hints.showHint("p", { name: HINTS.driveTouch });
    hints.clearHint("p");
    hints.showHint("missing", { name: HINTS.paint });
    expect(player.onScreenDisplay.setActionBar.mock.calls).toEqual([
      [
        {
          rawtext: [
            {
              translate: hintKey(HINTS.bumperMouse),
              with: {
                rawtext: [
                  { text: "3" },
                  { translate: "entity.yasu_ride:camper.name" },
                ],
              },
            },
          ],
        },
      ],
      [{ rawtext: [{ translate: hintKey(HINTS.driveTouch) }] }],
      [""],
    ]);
    expect(hintKey(HINTS.paint)).toBe("yasu_ride.hint.paint");
  });

  it("ignores a player who left between the scan and the send", () => {
    const player = fakePlayer();
    player.onScreenDisplay.setActionBar.mockImplementation(() => {
      throw new Error("invalid");
    });
    game.getEntity.mockReturnValue(player);
    const hints = new BedrockHintWorld(new EntityIndex());
    expect(() => hints.clearHint("p")).not.toThrow();
  });
});
