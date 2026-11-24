// Implements TentWorld with @minecraft/server (ADR 0012, 0131).

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
import { paidItem } from "../../shared/groundCells";
import type { CellLayer } from "../../shared/laidCells";
import { showActionBar, showHitsLeftHint } from "../../shared/players";
import {
  PITCH_REFUSAL_MESSAGE,
  TENT_HITS_LEFT_HINT,
  TENT_ITEM,
  TENT_OCCUPIED_HINT,
} from "../identifiers";
import type { DynamicPropertyTentRegistry } from "../persistence/tentRegistry";
import type { TentFlapStore } from "./tentFlapStore";
import { BedrockTentFlapWorld } from "./tentFlapWorld";
import { TentPitching } from "./tentPitching";
import { TentSpace } from "./tentSpace";
import { TentTakeDown } from "./tentTakeDown";

export class BedrockTentWorld
  implements TentWorld, TentFlapWorld, LegacyTentWorld
{
  private readonly space: TentSpace;
  private readonly pitching: TentPitching;
  private readonly takeDown: TentTakeDown;
  private readonly flap: BedrockTentFlapWorld;

  constructor(deps: {
    isVehicleSpace: SpaceCheck;
    registry: DynamicPropertyTentRegistry;
    blocks: CellLayer<TentId, TentBlock>;
    flaps: TentFlapStore;
  }) {
    const { isVehicleSpace, registry, blocks, flaps } = deps;
    this.space = new TentSpace({ registry, blocks });
    this.pitching = new TentPitching({
      space: this.space,
      isVehicleSpace,
      registry,
      blocks,
    });
    this.takeDown = new TentTakeDown({
      space: this.space,
      registry,
      blocks,
      flaps,
    });
    this.flap = new BedrockTentFlapWorld(this.space, flaps);
  }
  /** Whether a pitched tent in that dimension takes `cell`; answers from the saved registry, before any tent is loaded. */
  isCampSpace(dimensionId: DimensionId, cell: Cell): boolean {
    return this.space.isCampSpace(dimensionId, cell);
  }

  /** The tent whose block `typeId` is at `cell`; before the first lay after /reload, from the registry. */
  tentBlockOwner(
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ): TentId | undefined {
    return this.space.tentBlockOwner(dimensionId, cell, typeId);
  }

  /** The tent and flap whose tent_flap block is at `cell`; before the first lay after /reload, from the registry. */
  flapAt(
    dimensionId: DimensionId,
    cell: Cell,
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
    return this.space.isOwnBlock(dimensionId, at);
  }

  typeIdAt(dimensionId: DimensionId, at: Vec3): string | undefined {
    return this.space.typeIdAt(dimensionId, at);
  }

  survey(dimensionId: DimensionId, pose: TentPose): PitchSurvey {
    return this.pitching.survey(dimensionId, pose);
  }

  private readonly payment = paidItem(TENT_ITEM);
  readonly isCreative = this.payment.isCreative;
  readonly consumeItem = this.payment.consumeItem;
  readonly refund = this.payment.refund;

  clearDecorations(dimensionId: DimensionId, cells: readonly Cell[]): void {
    this.pitching.clearDecorations(dimensionId, cells);
  }

  pitch(dimensionId: DimensionId, pose: TentPose): TentId | undefined {
    return this.pitching.pitch(dimensionId, pose);
  }

  showPitchRefusal(playerId: PlayerId, reason: PitchRefusal): void {
    const translate = PITCH_REFUSAL_MESSAGE[reason];
    showActionBar(
      playerId,
      reason === "limit"
        ? { translate, with: [String(TENT_SPEC.maxTents)] }
        : { translate },
    );
  }

  /** The loaded tent in that dimension whose rooms hold `feet`. */
  tentContaining(dimensionId: DimensionId, feet: Vec3): TentId | undefined {
    return this.space.tentContaining(dimensionId, feet);
  }

  isOccupied(tentId: TentId): boolean {
    return this.takeDown.isOccupied(tentId);
  }

  returnTentItem(tentId: TentId, playerId: PlayerId | undefined): void {
    this.takeDown.returnTentItem(tentId, playerId);
  }

  entityLoaded(tentId: TentId): boolean {
    return this.space.entityLoaded(tentId);
  }

  unlayBlocks(tentId: TentId): void {
    this.takeDown.unlayBlocks(tentId);
  }

  clearBlocksByPose(tentId: TentId): void {
    this.takeDown.clearBlocksByPose(tentId);
  }

  clearTentBlocks(dimensionId: DimensionId, cells: readonly Cell[]): void {
    this.takeDown.clearTentBlocks(dimensionId, cells);
  }

  removeTent(tentId: TentId): void {
    this.takeDown.removeTent(tentId);
  }

  listTents(): readonly TentEntry[] {
    return this.space.listTents();
  }

  anchorLoaded(entry: TentEntry): boolean {
    return this.space.anchorLoaded(entry);
  }

  ejectPlayers(
    dimensionId: DimensionId,
    cells: readonly Cell[],
    exit: Cell,
  ): void {
    this.takeDown.ejectPlayers(dimensionId, cells, exit);
  }

  showHitsLeft(playerId: PlayerId, hitsLeft: number): void {
    showHitsLeftHint(playerId, TENT_HITS_LEFT_HINT, hitsLeft);
  }

  showOccupied(playerId: PlayerId): void {
    showActionBar(playerId, {
      translate: TENT_OCCUPIED_HINT,
    });
  }
}
