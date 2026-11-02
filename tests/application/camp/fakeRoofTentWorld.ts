import { vi } from "vitest";
import type { RoofTentWorld } from "../../../src/application/camp/ports/roofTent";
import type { VehicleHostState } from "../../../src/application/shared/ports/vehicleHost";
import type { Host } from "../../../src/domain/camp/hosted";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import type { Paint } from "../../../src/domain/shared/paint";

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
  readonly hosts = new Map<string, Host>();
  readonly paints = new Map<string, Paint>();
  readonly calls: string[] = [];
  spawn = vi.fn<RoofTentWorld["spawn"]>(() => "tent");
  remove = vi.fn((id: string) => {
    this.calls.push(`remove:${id}`);
    this.hosts.delete(id);
    this.paints.delete(id);
  });
  ownerOf = vi.fn<RoofTentWorld["ownerOf"]>(() => PLAYER);
  hostOf = (id: string): Host => this.hosts.get(id) ?? { kind: "ground" };
  returnItem = vi.fn<RoofTentWorld["returnItem"]>((id, owner) => {
    this.calls.push(`return:${id}:${owner ?? "drop"}`);
  });
  groundFree = vi.fn<RoofTentWorld["groundFree"]>(() => true);
  loaded = () => [...this.hosts.keys()];
  isCreative = vi.fn<RoofTentWorld["isCreative"]>(() => false);
  consumeItem = vi.fn<RoofTentWorld["consumeItem"]>(() => true);
  giveItem = vi.fn<RoofTentWorld["giveItem"]>();
  showMessage = vi.fn<RoofTentWorld["showMessage"]>();
  paintOf = (id: string) => this.paints.get(id);
  paint = vi.fn<RoofTentWorld["paint"]>((id, paint) => {
    this.paints.set(id, paint);
  });
  consumeDye = vi.fn<RoofTentWorld["consumeDye"]>();
}
