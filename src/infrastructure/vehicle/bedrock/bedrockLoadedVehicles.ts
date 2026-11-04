// Reads loaded vehicle snapshots and releases their shared state (ADR 0012).
import {
  ButtonState,
  type Entity,
  InputButton,
  type Player,
} from "@minecraft/server";
import type { VehicleHostState } from "../../../application/shared/ports/vehicleHost";
import { hostStateOf } from "../../../application/vehicle/hostStateOf";
import type {
  LoadedVehicleWorld,
  VehicleSnapshot,
} from "../../../application/vehicle/ports/drive";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
  type VehicleId,
} from "../../../domain/shared/ids";
import { DOCK_RESTORED } from "../../../domain/vehicle/dock/dock";
import type { HoldPose } from "../../../domain/vehicle/dock/floor";
import type { RawInput } from "../../../domain/vehicle/driveInput";
import {
  entityContractOf,
  profileOf,
} from "../../../domain/vehicle/kinds/index";
import type { RiderView } from "../../../domain/vehicle/vehicle";
import { heldTypeId } from "../../shared/heldItem";
import type { VehicleTestStore } from "../testInput/vehicleTestStore";
import { savedDecor } from "./bedrockDecorWorld";
import type { DeckSeats } from "./deckSeats";
import type { DockLayer } from "./dockLayer";
import {
  type EntityIndex,
  isPlayer,
  loadedVehicleEntities,
} from "./entityIndex";
import type { HeadlightBlocks } from "./headlightBlocks";
import { riderHeldOf } from "./heldBlock";
import {
  entityPropertyId,
  HEADLIGHTS_PROPERTY,
  kindOfEntity,
} from "./identifiers";
import type { SeatFillers } from "./seatFillers";
import type { StandIns } from "./standIns";
import type { VehicleReleaser } from "./vehicleReleaser";

function rawInputOf(player: Player): RawInput {
  const movement = player.inputInfo.getMovementVector();
  return {
    moveX: movement.x,
    moveY: movement.y,
    jump:
      player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed,
  };
}

export class BedrockLoadedVehicles implements LoadedVehicleWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly testInputs: VehicleTestStore<RawInput>,
    private readonly testHeldItems: VehicleTestStore<string>,
    private readonly headlightBlocks: HeadlightBlocks,
    private readonly dockBlocks: DockLayer,
    private readonly deckSeats: DeckSeats,
    private readonly standIns: StandIns,
    private readonly seatFillers: SeatFillers,
    private readonly holds: Map<VehicleId, HoldPose>,
    private readonly releaser: VehicleReleaser,
  ) {}

  loadedVehicles(): VehicleSnapshot[] {
    this.index.clear();
    const snapshots: VehicleSnapshot[] = [];
    for (const vehicle of loadedVehicleEntities()) {
      const kind = kindOfEntity(vehicle.typeId);
      if (kind === undefined) continue;
      const id = asVehicleId(vehicle.id);
      this.index.track(vehicle);
      const v = vehicle.getVelocity();
      const deckRiders = this.deckSeats.riders(vehicle);
      snapshots.push({
        id,
        kind,
        location: vehicle.location,
        yaw: vehicle.getRotation().y,
        velocity: v,
        onGround: vehicle.isOnGround,
        riders: this.riders(vehicle, profileOf(kind).monitor !== undefined),
        deckSeatInputs: deckRiders.map((player) =>
          player ? rawInputOf(player) : undefined,
        ),
        deckSeatRiders: deckRiders.map((player) =>
          player ? asPlayerId(player.id) : undefined,
        ),
        restored: () => {
          const dock = this.dockBlocks.saved(vehicle);
          return {
            [DOCK_RESTORED.laid]: dock.laid,
            [DOCK_RESTORED.doorOpen]: dock.doorOpen,
            [DOCK_RESTORED.decor]: savedDecor(vehicle),
            ...Object.fromEntries(
              entityContractOf(kind).restored.map((name) => [
                name,
                vehicle.getProperty(entityPropertyId(name)),
              ]),
            ),
          };
        },
        headlights: vehicle.getProperty(HEADLIGHTS_PROPERTY) === true,
        testInput: this.testInputs.get(id),
        testHeld: riderHeldOf(this.testHeldItems.get(id)),
      });
    }
    const live = this.index.trackedIds();
    this.testInputs.retain(live);
    this.testHeldItems.retain(live);
    this.headlightBlocks.clearGone(live);
    this.dockBlocks.clearGone(live);
    this.deckSeats.clearGone(live);
    this.standIns.clearGone(live);
    this.seatFillers.clearGone(live);
    for (const id of this.holds.keys())
      if (!live.has(id)) this.holds.delete(id);
    return snapshots;
  }

  releaseVehicle(vehicleId: VehicleId): void {
    this.releaser.release(vehicleId, this.index.entity(vehicleId));
  }

  hostState(vehicleId: string): VehicleHostState {
    const vehicle = this.index.entity(asVehicleId(vehicleId));
    // The index cannot distinguish an unloaded entity from a removed one.
    if (!vehicle) return { status: "unknown" };
    const kind = kindOfEntity(vehicle.typeId);
    if (kind === undefined) return { status: "unknown" };
    return hostStateOf(
      {
        location: vehicle.location,
        yaw: vehicle.getRotation().y,
        velocity: vehicle.getVelocity(),
        riders: this.riders(vehicle, false),
      },
      profileOf(kind),
      asDimensionId(vehicle.dimension.id),
    );
  }

  private riders(vehicle: Entity, readHeld: boolean): RiderView[] {
    // The engine seats riders by their index in this list (ADR 0019), seat fillers
    // included (ADR 0120), so the index is taken before the players are picked out.
    const aboard = (
      vehicle.getComponent("minecraft:rideable")?.getRiders() ?? []
    )
      .map((rider, slot) => ({ rider, slot }))
      .filter((entry): entry is { rider: Player; slot: number } =>
        isPlayer(entry.rider),
      );
    // A player the seat layout took off a tick ago is still riding it, in the slot
    // they wait for (ADR 0120), unless they got on something else meanwhile.
    for (const [id, slot] of this.seatFillers.waitingRiders(
      asVehicleId(vehicle.id),
    )) {
      const player = this.index.player(id);
      if (
        player?.isValid &&
        !player.getComponent("minecraft:riding") &&
        !aboard.some((entry) => entry.rider.id === id)
      )
        aboard.push({ rider: player, slot });
    }
    return aboard
      .sort((a, b) => a.slot - b.slot)
      .map(({ rider: p, slot }) => {
        return {
          slot,
          id: asPlayerId(p.id),
          offset: {
            x: p.location.x - vehicle.location.x,
            z: p.location.z - vehicle.location.z,
          },
          yaw: p.getRotation().y,
          raw: rawInputOf(p),
          held: readHeld ? riderHeldOf(heldTypeId(p)) : undefined,
        };
      });
  }
}
