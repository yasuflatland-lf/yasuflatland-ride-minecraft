import type {
  DimensionId,
  PlayerId,
  VehicleId,
} from "../../../domain/shared/ids";
// Ports the per-tick drive requires from the game; implemented in the infrastructure layer (ADR 0012).
import type { Vec3 } from "../../../domain/shared/vec";
import type { ClearCell, Departure } from "../../../domain/vehicle/dock/dock";
import type { DockCell, HoldPose } from "../../../domain/vehicle/dock/floor";
import type {
  EngineCommand,
  RestoredValues,
} from "../../../domain/vehicle/drive";
import type { RawInput } from "../../../domain/vehicle/driveInput";
import type {
  HeldItem,
  Hint,
  HintControls,
} from "../../../domain/vehicle/hints";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import type { Cell } from "../../../domain/vehicle/lighting/headlights";
import type { ChaseCamera } from "../../../domain/vehicle/profile";
import type { RamHit, RamTarget } from "../../../domain/vehicle/ram";
import type { RiderView } from "../../../domain/vehicle/vehicle";

export interface VehicleSnapshot {
  kind: VehicleKind;
  id: VehicleId;
  location: Vec3;
  yaw: number;
  velocity: Vec3;
  onGround: boolean;
  riders: RiderView[];
  deckSeatInputs: (RawInput | undefined)[];
  restored(): RestoredValues;
  headlights: boolean;
  testInput?: RawInput;
}

export interface DriveWorld {
  loadedVehicles(): VehicleSnapshot[];
  keepDeckSeats(
    vehicleId: VehicleId,
    positions: readonly (Vec3 | undefined)[],
    yaw: number,
  ): void;
  boardDeckRiders(vehicleId: VehicleId): void;
  waterAt(vehicleId: VehicleId, offset: Vec3): boolean;
  solidAt(vehicleId: VehicleId, offset: Vec3): boolean;
  targetsNear(vehicleId: VehicleId): RamTarget[];
  /** While a pose is set, teleports the vehicle there and clears its velocity every tick instead of applying the impulse. */
  holdAt(vehicleId: VehicleId, pose: HoldPose | undefined): void;
  /**
   * Keeps exactly these dock cells for the vehicle and clears the ones it laid before.
   */
  layDock(vehicleId: VehicleId, cells: readonly DockCell[]): void;
  /** See TickContext.blockTypes; world cells, in the vehicle's dimension. */
  blockTypes(
    vehicleId: VehicleId,
    cells: readonly Vec3[],
  ): (string | undefined)[];
  /** Sets each cell to air if it still holds the type it had at the check. */
  clearBlocks(vehicleId: VehicleId, cells: readonly ClearCell[]): void;
  /** Shows the lang key yasu_ride.message.<name> on a player's action bar; does nothing for a missing player. */
  showMessage(playerId: PlayerId, name: string): void;
  /**
   * Seats the players standing in the departure's boxes, nearest to the vehicle first,
   * and moves those left without a seat to the exit.
   */
  seatStandingPlayers(vehicleId: VehicleId, departure: Departure): void;
  applyMotion(vehicleId: VehicleId, impulse: Vec3, yaw: number): void;
  run(vehicleId: VehicleId, commands: readonly EngineCommand[]): void;
  /** Switches a player's view to a third-person camera, or back to their own when undefined (ADR 0028, 0071). */
  setChaseCamera(playerId: PlayerId, camera: ChaseCamera | undefined): void;
  /** Refreshes water breathing; does nothing for a missing player (ADR 0040). */
  giveWaterBreathing(playerId: PlayerId, ticks: number): void;
  damage(hit: RamHit, attackerId: PlayerId | undefined): void;
  /**
   * Keeps light blocks in exactly these cells for the vehicle and clears the
   * ones it lit before.
   */
  shineHeadlights(vehicleId: VehicleId, cells: readonly Cell[]): void;
  /**
   * Releases everything the world keeps for a vehicle that is no longer loaded:
   * its light blocks, dock cells, deck seats and hold. Every part is attempted
   * even when one fails; the first failure is then thrown.
   */
  releaseVehicle(vehicleId: VehicleId): void;
}

export interface HintPlayerView {
  id: PlayerId;
  dimensionId: DimensionId;
  /** Feet. */
  location: Vec3;
  /** Riding any entity, a vehicle, a deck seat or a vanilla mount. */
  riding: boolean;
  held: HeldItem;
  controls: HintControls;
}

export interface HintVehicleView {
  id: VehicleId;
  dimensionId: DimensionId;
  location: Vec3;
}

export interface HintWorld {
  /** Players who can get hints; spectators are left out. */
  hintPlayers(): HintPlayerView[];
  /** The vehicles driven this tick. */
  hintVehicles(): HintVehicleView[];
  /** Shows the lang key yasu_ride.hint.<name> on the action bar; does nothing for a missing player. */
  showHint(playerId: PlayerId, hint: Hint): void;
  /** Empties the action bar; does nothing for a missing player. */
  clearHint(playerId: PlayerId): void;
}
