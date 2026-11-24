import {
  asDutchOvenId,
  type DutchOvenId,
  initialSimmering,
} from "../../domain/camp/dutchOven";
import { asFirePitId, type FirePitId } from "../../domain/camp/firePit";
import {
  DUTCH_OVEN_SPEC,
  FIRE_PIT_SPOTS,
  FIRE_PIT_TOP_PX,
} from "../../domain/camp/spec";
import { cellOf } from "../../domain/shared/cells";
import {
  Debounces,
  LIGHT_SWITCH_COOLDOWN_TICKS,
} from "../../domain/shared/debounce";
import { encodeHost, type Host } from "../../domain/shared/hosted";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { hostSpotPoint } from "../../domain/shared/tableTop";
import type { Vec3 } from "../../domain/shared/vec";
import {
  canUseBlockTop,
  hasClearance,
  placeOnGround,
} from "../shared/groundPlacement";
import { placePaid } from "../shared/paidPlacement";
import type { HostedItemKind } from "../shared/ports/hostedItem";
import type { HostedKindPort } from "../shared/ports/hostedKind";
import { TakeBackByHits } from "../shared/takeBackByHits";
import {
  campHostedKind,
  decodeCampHost,
  HostedOnTopActions,
} from "./hostedKind";
import type { DutchOvenWorld } from "./ports/dutchOven";

export function dutchOvenHostedKind(world: DutchOvenWorld): HostedKindPort {
  return campHostedKind(
    {
      asId: asDutchOvenId,
      loaded: () => world.loadedOvens(),
      remove: (id) => world.removeDutchOven(id),
    },
    world,
  );
}

export class DutchOvenActions extends HostedOnTopActions {
  private readonly takeBack = new TakeBackByHits<DutchOvenId>({
    rule: DUTCH_OVEN_SPEC.recovery,
    release: (id) => {
      const host = decodeCampHost(this.world.host(id));
      if (
        host.kind === "spot" &&
        host.hostType === "fire_pit" &&
        this.world.hostExists(host.id)
      )
        this.world.setCovered(asFirePitId(host.id), false);
    },
    giveBack: (id, player) => this.world.dropItem(id, player),
    remove: (id) => this.world.removeDutchOven(id),
    feedback: {
      remaining: (_id, player, left) => this.world.showHitsLeft(player, left),
    },
    order: ["release", "giveBack", "remove"],
  });

  private readonly switches = new Debounces<DutchOvenId>(
    LIGHT_SWITCH_COOLDOWN_TICKS,
  );

  constructor(
    private readonly world: DutchOvenWorld,
    onTop: HostedItemKind,
  ) {
    super(world, onTop);
  }

  toggleLid(id: DutchOvenId, tick: number): boolean {
    this.switches.forgetIdle(tick);
    const simmering = this.world.simmering(id);
    if (simmering === undefined || !this.switches.press(id, tick)) return false;
    this.world.setSimmering(id, !simmering);
    return true;
  }

  canUseBlock(dimension: DimensionId, block: Vec3, face: string): boolean {
    return canUseBlockTop(this.world, dimension, block, face);
  }

  place(cmd: {
    player?: PlayerId;
    dimension: DimensionId;
    block: Vec3;
    yaw: number;
    slot: number;
  }): boolean {
    return placeOnGround(this.world, DUTCH_OVEN_SPEC, cmd, {
      isNear: this.world.hasDutchOvenNear.bind(this.world),
      spawn: this.world.spawnDutchOven.bind(this.world),
    });
  }

  placeOnFirePit(cmd: {
    /** Omitted only by the server test hook, as for tent placement (ADR 0010). */
    player?: PlayerId;
    pit: FirePitId;
    slot: number;
  }): boolean {
    const pit = this.world.firePit(cmd.pit);
    if (!pit || this.world.isCovered(cmd.pit)) return false;
    const cell = cellOf(pit.at);
    if (
      !hasClearance(this.world, pit.dimension, cell, DUTCH_OVEN_SPEC.clearance)
    )
      return false;
    const [spot] = FIRE_PIT_SPOTS;
    const result = placePaid(
      this.world,
      { player: cmd.player, slot: cmd.slot },
      () =>
        this.spawnHosted(pit, hostSpotPoint(pit, spot, FIRE_PIT_TOP_PX), {
          kind: "spot",
          hostType: "fire_pit",
          id: cmd.pit,
          spot: 0,
        }),
    );
    if (result.placed) this.world.setCovered(cmd.pit, true);
    return result.placed;
  }

  private spawnHosted(
    hostEntity: { dimension: DimensionId; yaw: number },
    at: Vec3,
    host: Host,
  ): DutchOvenId | undefined {
    const marker = encodeHost(host);
    const simmering = initialSimmering(host);
    return this.world.spawnDutchOven(
      hostEntity.dimension,
      at,
      hostEntity.yaw,
      (oven) => this.world.setHost(oven, marker, simmering),
    );
  }

  /** Clears the covered flag of every loaded Fire Pit no oven stands on. */
  uncoverEmptyFirePits(): void {
    const occupiedPits = new Set<string>();
    for (const oven of this.world.loadedOvens()) {
      const host = decodeCampHost(this.world.host(oven));
      if (host.kind === "spot" && host.hostType === "fire_pit")
        occupiedPits.add(host.id);
    }
    for (const pit of this.world.loadedFirePits()) {
      if (this.world.isCovered(pit) && !occupiedPits.has(pit))
        this.world.setCovered(pit, false);
    }
  }

  hit(id: DutchOvenId, player: PlayerId | undefined, tick: number): boolean {
    return this.takeBack.hit(id, tick, player) === "taken";
  }
}
