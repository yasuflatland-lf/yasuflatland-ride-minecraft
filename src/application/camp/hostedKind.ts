import { CAMP_TABLE_TOP, TABLE_SPOTS } from "../../domain/camp/spec";
import type { TableId } from "../../domain/camp/table";
import { decodeHost, type Host } from "../../domain/shared/hosted";
import type { LocalPoint, TopSurface } from "../../domain/shared/tableTop";
import {
  placeOnTop,
  type TopHostWorld,
  type TopOutcome,
  type TopRequest,
} from "../shared/placeOnTop";
import type { HostedItemKind } from "../shared/ports/hostedItem";
import type { HostedKindPort } from "../shared/ports/hostedKind";

export const CAMP_TABLE_HOST_TYPE = "camp_table";

export function campTableLegacySpot(spot: number): LocalPoint | undefined {
  return TABLE_SPOTS[spot];
}

const campHosts = {
  spotHostTypes: new Set(["fire_pit"]),
  legacySpot: (type: string, spot: number) =>
    type === CAMP_TABLE_HOST_TYPE ? campTableLegacySpot(spot) : undefined,
};

export function decodeCampHost(marker: string): Host {
  return decodeHost(marker, campHosts);
}

export function campHostedKind<Id extends string>(
  kind: {
    asId(id: string): Id;
    loaded(): readonly Id[];
    remove(id: Id): void;
  },
  world: {
    host(id: Id): string;
    isHostAreaLoaded(id: Id): boolean;
    hostExists(hostId: string): boolean;
  },
): HostedKindPort {
  return {
    loaded: () => kind.loaded(),
    host: (id) => decodeCampHost(world.host(kind.asId(id))),
    isHostAreaLoaded: (id) => world.isHostAreaLoaded(kind.asId(id)),
    hostExists: (id) => world.hostExists(id),
    remove: (id) => kind.remove(kind.asId(id)),
  };
}

export class HostedOnTopActions {
  constructor(
    private readonly topWorld: TopHostWorld,
    private readonly onTop: HostedItemKind,
  ) {}

  placeOnTop(surface: TopSurface, cmd: TopRequest): TopOutcome {
    return placeOnTop(this.topWorld, surface, this.onTop, cmd);
  }

  placeOnTable(
    cmd: Omit<TopRequest, "hostType" | "host"> & { table: TableId },
  ): TopOutcome {
    return this.placeOnTop(CAMP_TABLE_TOP, {
      ...cmd,
      hostType: CAMP_TABLE_HOST_TYPE,
      host: cmd.table,
    });
  }
}
