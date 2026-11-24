import { SleepInBed } from "../../../../application/shared/sleepInBed";
import { NormalizePaint } from "../../../../application/vehicle/normalizePaint";
import type { Clock } from "../../../../application/vehicle/ports/shared";
import { FindBedSpawnCell } from "../../../../application/vehicle/room/findBedSpawnCell";
import { PlaceDecor } from "../../../../application/vehicle/room/placeDecor";
import { PressShowerToilet } from "../../../../application/vehicle/room/pressShowerToilet";
import { PressStorage } from "../../../../application/vehicle/room/pressStorage";
import { RemoveDecor } from "../../../../application/vehicle/room/removeDecor";
import { SetDecor } from "../../../../application/vehicle/room/setDecor";
import { SwitchCeilingLights } from "../../../../application/vehicle/room/switchCeilingLights";
import { UseDockDoor } from "../../../../application/vehicle/room/useDockDoor";
import type { DimensionId, VehicleId } from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import type { VehicleRepository } from "../../../../domain/vehicle/vehicleRepository";
import { registerBedBlock } from "../../../shared/bedBlock";
import { BedrockBedWorld } from "../../../shared/bedrockBedWorld";
import type { BedrockInventory } from "../../bedrock/bedrockInventory";
import { BedrockPaintWorld } from "../../bedrock/bedrockPaintWorld";
import type { EntityIndex } from "../../bedrock/entityIndex";
import { BedrockDecorWorld } from "./bedrockDecorWorld";
import { registerDecor } from "./handlers/decor";
import { registerDockDoor } from "./handlers/dockDoor";
import { registerNormalizePaint } from "./handlers/normalizePaint";
import { registerShowerToilet } from "./handlers/showerToilet";
import { registerStorage } from "./handlers/storage";
import { CAMPER_BED_COMPONENT } from "./identifiers";
import { registerTestDecor } from "./testHooks/testDecor";

type DockOwner = (
  dimensionId: DimensionId,
  cell: Vec3,
) => VehicleId | undefined;

export function registerCamperHandlers(
  useCases: {
    normalizePaint: NormalizePaint;
    door: UseDockDoor;
    bed: SleepInBed;
    bedSpawnCell: FindBedSpawnCell;
    showerToilet: PressShowerToilet;
    placeDecor: PlaceDecor;
    removeDecor: RemoveDecor;
    storage: PressStorage;
  },
  dockDoorOwner: DockOwner,
  dockCellOwner: DockOwner,
  registerDockGuard: () => void,
): void {
  registerNormalizePaint(useCases.normalizePaint);
  registerDecor(
    useCases.placeDecor,
    useCases.removeDecor,
    dockCellOwner,
    useCases.storage,
  );
  registerBedBlock(CAMPER_BED_COMPONENT, useCases.bed, (dim, cell) => {
    const id = dockCellOwner(dim, cell);
    return id === undefined
      ? undefined
      : useCases.bedSpawnCell.execute({ vehicleId: id, cell });
  });
  registerDockDoor(useCases.door, dockDoorOwner);
  registerDockGuard();
  registerShowerToilet(useCases.showerToilet, dockCellOwner);
  registerStorage(useCases.storage, dockCellOwner);
}

export function installCamper(
  {
    repo,
    index,
    inventory,
    clock,
  }: {
    repo: VehicleRepository;
    index: EntityIndex;
    inventory: BedrockInventory;
    clock: Clock;
  },
  dockDoorOwner: DockOwner,
  dockCellOwner: DockOwner,
  registerDockGuard: () => void,
) {
  const decorWorld = new BedrockDecorWorld(index, inventory);
  return {
    ceilingLights: new SwitchCeilingLights(repo, clock),
    registerHandlers: () =>
      registerCamperHandlers(
        {
          normalizePaint: new NormalizePaint(
            new BedrockPaintWorld(index, inventory),
          ),
          door: new UseDockDoor(repo, clock),
          bed: new SleepInBed(new BedrockBedWorld(index)),
          bedSpawnCell: new FindBedSpawnCell(repo),
          showerToilet: new PressShowerToilet(repo, clock),
          placeDecor: new PlaceDecor(decorWorld, repo),
          removeDecor: new RemoveDecor(decorWorld, repo),
          storage: new PressStorage(decorWorld, repo, clock),
        },
        dockDoorOwner,
        dockCellOwner,
        registerDockGuard,
      ),
    registerTestHooks: () =>
      __TEST_HOOKS__ && registerTestDecor(new SetDecor(decorWorld, repo)),
  };
}
