// Implements TentWorld with @minecraft/server (ADR 0012, 0131).
import { ItemStack } from "@minecraft/server";
import type { LegacyTentWorld } from "../../../application/camp/ports/legacyTent";
import type { TentWorld } from "../../../application/camp/ports/tent";
import type { TentFlapWorld } from "../../../application/camp/ports/tentFlap";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { TentFlaps } from "../../../domain/camp/flaps";
import { TENT_SPEC } from "../../../domain/camp/spec";
import type {
  FlapId,
  PitchRefusal,
  PitchSurvey,
  TentBlock,
  TentId,
  TentPose,
} from "../../../domain/camp/tent";
import type { TentEntry } from "../../../domain/camp/tentRegistry";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { CellLayer } from "../../shared/laidCells";
import {
  consumeHeld,
  giveOrDrop,
  isCreative,
  playerById,
} from "../../shared/players";
import { chunkLoadedAt } from "../chunkLoadedAt";
import {
  PITCH_REFUSAL_MESSAGE,
  TENT_HITS_LEFT_HINT,
  TENT_ITEM,
  TENT_OCCUPIED_HINT,
} from "../identifiers";
import type { DynamicPropertyTentRegistry } from "../persistence/tentRegistry";
import type { TentFlapStore } from "./tentFlapStore";
import { BedrockTentFlapWorld } from "./tentFlapWorld";
import { TentLayout } from "./tentLayout";
export class BedrockTentWorld
  implements TentWorld, TentFlapWorld, LegacyTentWorld
{
  private readonly layout: TentLayout;
  private readonly flap: BedrockTentFlapWorld;

  constructor(deps: {
    isVehicleSpace: SpaceCheck;
    registry: DynamicPropertyTentRegistry;
    blocks: CellLayer<TentId, TentBlock>;
    flaps: TentFlapStore;
  }) {
    this.layout = new TentLayout(deps);
    this.flap = new BedrockTentFlapWorld(this.layout, deps.flaps);
  }
  /** Whether a pitched tent in that dimension takes `cell`; answers from the saved registry, before any tent is loaded. */
  isCampSpace(dimensionId: DimensionId, cell: Cell): boolean {
    return this.layout.isCampSpace(dimensionId, cell);
  }

  /** The tent whose block `typeId` is at `cell`; before the first lay after /reload, from the registry. */
  tentBlockOwner(
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ): TentId | undefined {
    return this.layout.tentBlockOwner(dimensionId, cell, typeId);
  }

  /** The tent and flap whose tent_flap block is at `cell`; before the first lay after /reload, from the registry. */
  flapAt(
    dimensionId: DimensionId,
    cell: Vec3,
  ): { tentId: TentId; flap: FlapId } | undefined {
    return this.flap.flapAt(dimensionId, cell);
  }

  flapsOf(tentId: TentId): TentFlaps | undefined {
    return this.flap.flapsOf(tentId);
  }

  clearPlayersForClose(tentId: TentId, flap: FlapId): boolean {
    return this.flap.clearPlayersForClose(tentId, flap);
  }

  showFlapBlocked(playerId: PlayerId): void {
    this.flap.showFlapBlocked(playerId);
  }

  isOwnBlock(dimensionId: DimensionId, at: Vec3): boolean {
    return this.layout.isOwnBlock(dimensionId, at);
  }

  typeIdAt(dimensionId: DimensionId, at: Vec3): string | undefined {
    return this.layout.typeIdAt(dimensionId, at);
  }

  survey(dimensionId: DimensionId, pose: TentPose): PitchSurvey {
    return this.layout.survey(dimensionId, pose);
  }

  isCreative(playerId: PlayerId): boolean {
    return isCreative(playerById(playerId));
  }

  consumeTentItem(playerId: PlayerId, slot: number): boolean {
    const player = playerById(playerId);
    return player !== undefined && consumeHeld(player, TENT_ITEM, slot);
  }

  giveTentItem(playerId: PlayerId): void {
    const player = playerById(playerId);
    if (player) giveOrDrop(player, [new ItemStack(TENT_ITEM, 1)]);
  }

  clearDecorations(dimensionId: DimensionId, cells: readonly Cell[]): void {
    this.layout.clearDecorations(dimensionId, cells);
  }

  pitch(dimensionId: DimensionId, pose: TentPose): TentId | undefined {
    return this.layout.pitch(dimensionId, pose);
  }

  showPitchRefusal(playerId: PlayerId, reason: PitchRefusal): void {
    const translate = PITCH_REFUSAL_MESSAGE[reason];
    playerById(playerId)?.onScreenDisplay.setActionBar(
      reason === "limit"
        ? { translate, with: [String(TENT_SPEC.maxTents)] }
        : { translate },
    );
  }

  /** The loaded tent in that dimension whose rooms hold `feet`. */
  tentContaining(dimensionId: DimensionId, feet: Vec3): TentId | undefined {
    return this.layout.tentContaining(dimensionId, feet);
  }

  isOccupied(tentId: TentId): boolean {
    return this.layout.isOccupied(tentId);
  }

  returnTentItem(tentId: TentId, playerId: PlayerId | undefined): void {
    this.layout.returnTentItem(tentId, playerId);
  }

  takeDown(tentId: TentId, legacy?: TentEntry): void {
    this.layout.takeDown(tentId, legacy);
  }

  listTents(): readonly TentEntry[] {
    return this.layout.listTents();
  }

  foldInto(entry: TentEntry): "folded" | "deferred" {
    return this.layout.foldInto(entry);
  }

  showHitsLeft(playerId: PlayerId, hitsLeft: number): void {
    playerById(playerId)?.onScreenDisplay.setActionBar({
      translate: TENT_HITS_LEFT_HINT,
      with: [String(hitsLeft)],
    });
  }

  showOccupied(playerId: PlayerId): void {
    playerById(playerId)?.onScreenDisplay.setActionBar({
      translate: TENT_OCCUPIED_HINT,
    });
  }
}
