// Use case: hint players on foot near a vehicle where to hit it and how to drive it (ADR 0086).
import type { Vec3 } from "../../domain/shared/vec";
import {
  type Hint,
  type HintState,
  NO_HINT,
  stepHint,
} from "../../domain/vehicle/hints";
import type { Vehicle } from "../../domain/vehicle/vehicle";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { HintPlayerView, HintVehicleView, HintWorld } from "./ports";

interface Near {
  view: HintVehicleView;
  vehicle: Vehicle;
}

const offset = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const squaredDistance = (a: Vec3, b: Vec3) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

export class ShowVehicleHints {
  private readonly states = new Map<string, HintState>();

  constructor(
    private readonly world: HintWorld,
    private readonly repo: VehicleRepository,
  ) {}

  /** Runs after the drive tick, so each vehicle's parked state is this tick's. */
  execute(tick: number): void {
    const vehicles = this.world.hintVehicles().flatMap((view) => {
      const vehicle = this.repo.get(view.id);
      return vehicle?.showsHints ? [{ view, vehicle }] : [];
    });
    if (vehicles.length === 0 && this.states.size === 0) return;
    const present = new Set<string>();
    for (const player of this.world.hintPlayers()) {
      present.add(player.id);
      const state = this.states.get(player.id) ?? NO_HINT;
      const candidate = player.riding
        ? undefined
        : this.candidate(player, vehicles, state);
      const next = stepHint(state, candidate, tick);
      if (next.state.shown === undefined) this.states.delete(player.id);
      else this.states.set(player.id, next.state);
      // Mounting replaces the hint with the game's own dismount tip, which an empty
      // action bar would wipe; the stale hint just fades.
      if (next.action === "clear") {
        if (!player.riding) this.world.clearHint(player.id);
      } else if (next.action) this.world.showHint(player.id, next.action.show);
    }
    for (const id of this.states.keys())
      if (!present.has(id)) this.states.delete(id);
  }

  private candidate(
    player: HintPlayerView,
    vehicles: readonly Near[],
    state: HintState,
  ): Hint | undefined {
    const near = vehicles
      .filter(({ view }) => view.dimensionId === player.dimensionId)
      .sort(
        (a, b) =>
          squaredDistance(a.view.location, player.location) -
          squaredDistance(b.view.location, player.location),
      );
    for (const { view, vehicle } of near) {
      const hint = vehicle.hint(
        offset(player.location, view.location),
        player.held,
        player.controls,
        state.shown,
      );
      if (hint) return hint;
    }
    return undefined;
  }
}
