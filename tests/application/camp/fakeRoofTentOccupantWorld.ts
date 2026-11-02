import { vi } from "vitest";
import type { RoofTentOccupantWorld } from "../../../src/application/camp/ports/roofTentOccupant";
import { asDimensionId, type PlayerId } from "../../../src/domain/shared/ids";

export class FakeRoofTentOccupantWorld implements RoofTentOccupantWorld {
  readonly occupants = new Map<string, PlayerId>();
  readonly spawns = new Map<string, PlayerId>();
  readonly calls: unknown[][] = [];
  occupantOf = (id: string) => this.occupants.get(id);
  setOccupant = vi.fn<RoofTentOccupantWorld["setOccupant"]>((id, player) => {
    this.calls.push(["setOccupant", id, player]);
    if (player === undefined) this.occupants.delete(id);
    else this.occupants.set(id, player);
  });
  conceal = vi.fn<RoofTentOccupantWorld["conceal"]>();
  reveal = vi.fn<RoofTentOccupantWorld["reveal"]>((player) => {
    this.calls.push(["reveal", player]);
  });
  isSeated = vi.fn<RoofTentOccupantWorld["isSeated"]>(() => true);
  moveInside = vi.fn<RoofTentOccupantWorld["moveInside"]>();
  placeOutside = vi.fn<RoofTentOccupantWorld["placeOutside"]>((player, id) => {
    this.calls.push(["placeOutside", player, id]);
  });
  spawnCellOf = vi.fn<RoofTentOccupantWorld["spawnCellOf"]>(() => ({
    x: 3,
    y: 64,
    z: 5,
  }));
  spawnSetBy = (id: string) => this.spawns.get(id);
  setSpawnSetBy = vi.fn<RoofTentOccupantWorld["setSpawnSetBy"]>(
    (id, player) => {
      if (player === undefined) this.spawns.delete(id);
      else this.spawns.set(id, player);
    },
  );
  dimensionOf = vi.fn<RoofTentOccupantWorld["dimensionOf"]>(() =>
    asDimensionId("minecraft:overworld"),
  );
  showMessage = vi.fn<RoofTentOccupantWorld["showMessage"]>();
}
