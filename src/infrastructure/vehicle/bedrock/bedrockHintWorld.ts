// Implements HintWorld on the action bar (ADR 0086).
import {
  GameMode,
  type Player,
  type RawMessage,
  world,
} from "@minecraft/server";
import type {
  HintPlayerView,
  HintVehicleView,
  HintWorld,
} from "../../../application/vehicle/ports/drive";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
  type PlayerId,
} from "../../../domain/shared/ids";
import type { HeldItem, Hint, HintArg } from "../../../domain/vehicle/hints";
import { heldDye } from "../../shared/dyes";
import type { ActionBarLog } from "./actionBarLog";
import type { EntityIndex } from "./entityIndex";
import { ENTITY_TYPE, hintKey } from "./identifiers";

import { controlsOf } from "./inputControls";

const heldOf = (player: Player): HeldItem =>
  heldDye(player) ? "dye" : "other";

/** A number as text, and a vehicle kind as its entity name in the player's language. */
const argText = (arg: HintArg): RawMessage =>
  "number" in arg
    ? { text: String(arg.number) }
    : { translate: `entity.${ENTITY_TYPE[arg.vehicle]}.name` };

export class BedrockHintWorld implements HintWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly actionBar: ActionBarLog,
  ) {}

  hintPlayers(): HintPlayerView[] {
    return world.getAllPlayers().flatMap((player) => {
      // A player leaving mid-scan throws on every read.
      try {
        if (player.getGameMode() === GameMode.Spectator) return [];
        return [
          {
            id: asPlayerId(player.id),
            dimensionId: asDimensionId(player.dimension.id),
            location: player.location,
            riding: player.getComponent("minecraft:riding") !== undefined,
            held: heldOf(player),
            controls: controlsOf(player),
          },
        ];
      } catch {
        return [];
      }
    });
  }

  hintVehicles(): HintVehicleView[] {
    return this.index.tracked().flatMap((car) => {
      try {
        return car.isValid
          ? [
              {
                id: asVehicleId(car.id),
                dimensionId: asDimensionId(car.dimension.id),
                location: car.location,
              },
            ]
          : [];
      } catch {
        return [];
      }
    });
  }

  showHint(playerId: PlayerId, hint: Hint): void {
    this.actionBar.write(playerId, {
      rawtext: [
        hint.with
          ? {
              translate: hintKey(hint.name),
              with: { rawtext: hint.with.map(argText) },
            }
          : { translate: hintKey(hint.name) },
      ],
    });
  }

  clearHint(playerId: PlayerId): void {
    this.actionBar.write(playerId, "");
  }
}
