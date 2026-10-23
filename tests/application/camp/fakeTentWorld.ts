import type { TentWorld } from "../../../src/application/camp/ports/tent";
import {
  asTentId,
  type PitchRefusal,
  type PitchSurvey,
  type TentId,
  type TentPose,
  tentClearCells,
  tentGroundCells,
} from "../../../src/domain/camp/tent";
import type { Cell } from "../../../src/domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";

/** Flat stone ground with air above it, nobody around, and no tents. */
export function fineSurvey(pose: TentPose): PitchSurvey {
  return {
    clear: tentClearCells(pose).map(() => "minecraft:air"),
    ground: tentGroundCells(pose).map(() => ({
      typeId: "minecraft:stone",
      liquid: false,
    })),
    vehicleSpace: false,
    occupants: 0,
    tents: 0,
  };
}

/** An in-memory TentWorld that records every call in `calls`, in order. */
export class FakeTentWorld implements TentWorld {
  ownBlocks = new Set<string>();
  surveyOf: (pose: TentPose) => PitchSurvey = fineSurvey;
  creative = false;
  consumeResult = true;
  pitchResult: TentId | undefined = asTentId("tent");
  occupied = false;
  readonly calls: [string, ...unknown[]][] = [];

  isOwnBlock(_d: DimensionId, at: Vec3): boolean {
    return this.ownBlocks.has(`${at.x},${at.y},${at.z}`);
  }
  survey(_d: DimensionId, pose: TentPose): PitchSurvey {
    return this.surveyOf(pose);
  }
  isCreative(): boolean {
    return this.creative;
  }
  consumeTentItem(playerId: PlayerId, slot: number): boolean {
    this.calls.push(["consumeTentItem", playerId, slot]);
    return this.consumeResult;
  }
  giveTentItem(playerId: PlayerId): void {
    this.calls.push(["giveTentItem", playerId]);
  }
  clearDecorations(_d: DimensionId, cells: readonly Cell[]): void {
    this.calls.push(["clearDecorations", cells]);
  }
  pitch(_d: DimensionId, pose: TentPose): TentId | undefined {
    this.calls.push(["pitch", pose]);
    return this.pitchResult;
  }
  showPitchRefusal(playerId: PlayerId, reason: PitchRefusal): void {
    this.calls.push(["showPitchRefusal", playerId, reason]);
  }
  isOccupied(): boolean {
    return this.occupied;
  }
  returnTentItem(tentId: TentId, playerId: PlayerId | undefined): void {
    this.calls.push(["returnTentItem", tentId, playerId]);
  }
  takeDown(tentId: TentId): void {
    this.calls.push(["takeDown", tentId]);
  }
  showHitsLeft(playerId: PlayerId, hitsLeft: number): void {
    this.calls.push(["showHitsLeft", playerId, hitsLeft]);
  }
  showOccupied(playerId: PlayerId): void {
    this.calls.push(["showOccupied", playerId]);
  }

  names(): string[] {
    return this.calls.map(([name]) => name);
  }
}
