import { vi } from "vitest";
import type { RoofTentWorld } from "../../../src/application/camp/ports/roofTent";
import type { VehicleHostState } from "../../../src/application/shared/ports/vehicleHost";
import { asRoofTentId, type RoofTentId } from "../../../src/domain/camp/ids";
import type { Host } from "../../../src/domain/shared/hosted";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

export const PLAYER = asPlayerId("player");
export const DIMENSION = asDimensionId("overworld");
export const PRESENT: Extract<VehicleHostState, { status: "present" }> = {
  status: "present",
  dimensionId: DIMENSION,
  location: { x: 10, y: 20, z: 30 },
  yaw: 0,
  mount: {
    roofHeight: 2,
    anchor: { x: 1, z: 3 },
    ladder: true,
    entrance: { x: 0, z: 1 },
  },
  driverPresent: false,
  moving: false,
};

export class FakeRoofTentWorld implements RoofTentWorld {
  readonly hosts = new Map<RoofTentId, Host>();
  readonly calls: string[] = [];
  spawn = vi.fn<RoofTentWorld["spawn"]>(() => asRoofTentId("tent"));
  remove = vi.fn<RoofTentWorld["remove"]>((id) => {
    this.calls.push(`remove:${id}`);
    this.hosts.delete(id);
  });
  ownerOf = vi.fn<RoofTentWorld["ownerOf"]>(() => PLAYER);
  hostOf = (id: RoofTentId): Host => this.hosts.get(id) ?? { kind: "ground" };
  returnItem = vi.fn<RoofTentWorld["returnItem"]>((id, owner) => {
    this.calls.push(`return:${id}:${owner ?? "drop"}`);
  });
  blockAt = vi.fn<RoofTentWorld["blockAt"]>();
  isVehicleSpace = vi.fn<RoofTentWorld["isVehicleSpace"]>(() => false);
  isCampSpace = vi.fn<RoofTentWorld["isCampSpace"]>(() => false);
  hasRoofTentNear = vi.fn<RoofTentWorld["hasRoofTentNear"]>(() => false);
  loaded = () => [...this.hosts.keys()];
  isCreative = vi.fn<RoofTentWorld["isCreative"]>(() => false);
  consumeItem = vi.fn<RoofTentWorld["consumeItem"]>(() => true);
  refund = vi.fn<RoofTentWorld["refund"]>();
  showRefusal = vi.fn<RoofTentWorld["showRefusal"]>();
  showHitsLeft = vi.fn<RoofTentWorld["showHitsLeft"]>();
}
