import type { WarpFeedback } from "../../../src/application/warp/ports/feedback";
import type { WarpMenus } from "../../../src/application/warp/ports/menus";
import type { WarpPlayers } from "../../../src/application/warp/ports/players";
import type { WarpRegistryStore } from "../../../src/application/warp/ports/registryStore";
import type { WarpTicks } from "../../../src/application/warp/ports/ticks";
import type { WarpWorld } from "../../../src/application/warp/ports/world";
import { type Cell, cellOf } from "../../../src/domain/shared/cells";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../src/domain/shared/ids";
import { asWarpPointId, type WarpPointId } from "../../../src/domain/warp/ids";
import type { BlockPresence } from "../../../src/domain/warp/presence";
import {
  parseWarpName,
  type WarpName,
} from "../../../src/domain/warp/warpName";
import type { WarpPoint } from "../../../src/domain/warp/warpPoint";
import {
  emptyRegistry,
  type WarpRegistry,
} from "../../../src/domain/warp/warpRegistry";

export const player = asPlayerId("player");
export const overworld = asDimensionId("minecraft:overworld");
export const nether = asDimensionId("minecraft:nether");

export function named(raw: string): WarpName {
  const name = parseWarpName(raw);
  if (!name) throw new Error("Expected a nonempty warp name");
  return name;
}

export function point(index = 0): WarpPoint {
  return {
    id: asWarpPointId(`point-${index}`),
    name: named(`Warp ${index + 1}`),
    owner: "Owner",
    dimension: overworld,
    cell: cellOf({ x: index * 4, y: 64, z: 0 }),
  };
}

class FakeRegistryStore implements WarpRegistryStore {
  writes: WarpRegistry[] = [];
  constructor(public registry: WarpRegistry | undefined = emptyRegistry()) {}
  load() {
    return this.registry;
  }
  save(registry: WarpRegistry) {
    this.writes.push(registry);
    this.registry = registry;
  }
}

class FakeWorld implements WarpWorld {
  presences = new Map<WarpPointId, BlockPresence>();
  standable = new Set<string>();
  teleports: { playerId: PlayerId; dimension: DimensionId; feet: Cell }[] = [];
  teleportSucceeds = true;
  presence(point: WarpPoint): BlockPresence {
    return this.presences.get(point.id) ?? "present";
  }
  isStandable(dimension: DimensionId, feet: Cell) {
    return this.standable.has(JSON.stringify([dimension, feet]));
  }
  teleport(playerId: PlayerId, dimension: DimensionId, feet: Cell) {
    this.teleports.push({ playerId, dimension, feet });
    return this.teleportSucceeds;
  }
}

class FakePlayers implements WarpPlayers {
  locations = new Map<
    PlayerId,
    NonNullable<ReturnType<WarpPlayers["locationOf"]>>
  >([[player, { dimension: overworld, position: { x: 0, y: 64, z: 0 } }]]);
  names = new Map<PlayerId, string>([[player, "Player Name"]]);
  locationOf(playerId: PlayerId) {
    return this.locations.get(playerId);
  }
  nameOf(playerId: PlayerId) {
    return this.names.get(playerId);
  }
}

class FakeMenus implements WarpMenus {
  nameAnswers: Awaited<ReturnType<WarpMenus["askName"]>>[] = [];
  listAnswers: Awaited<ReturnType<WarpMenus["chooseWarp"]>>[] = [];
  nameRequests: { playerId: PlayerId; current: WarpName | undefined }[] = [];
  pages: {
    playerId: PlayerId;
    page: Parameters<WarpMenus["chooseWarp"]>[1];
  }[] = [];
  beforeNameAnswer: () => void = () => {};
  beforeListAnswer: () => void = () => {};
  async askName(playerId: PlayerId, current?: WarpName) {
    this.nameRequests.push({ playerId, current });
    const answer = this.nameAnswers.shift() ?? { kind: "cancelled" as const };
    this.beforeNameAnswer();
    return answer;
  }
  async chooseWarp(
    playerId: PlayerId,
    page: Parameters<WarpMenus["chooseWarp"]>[1],
  ) {
    this.pages.push({ playerId, page });
    const answer = this.listAnswers.shift() ?? { kind: "cancelled" as const };
    this.beforeListAnswer();
    return answer;
  }
}

class FakeFeedback implements WarpFeedback {
  unreadable: PlayerId[] = [];
  full: PlayerId[] = [];
  gone: { playerId: PlayerId; point: WarpPoint }[] = [];
  empty: PlayerId[] = [];
  failed: PlayerId[] = [];
  registryUnreadable(playerId: PlayerId) {
    this.unreadable.push(playerId);
  }
  registryFull(playerId: PlayerId) {
    this.full.push(playerId);
  }
  pointGone(playerId: PlayerId, point: WarpPoint) {
    this.gone.push({ playerId, point });
  }
  noPoints(playerId: PlayerId) {
    this.empty.push(playerId);
  }
  teleportFailed(playerId: PlayerId) {
    this.failed.push(playerId);
  }
}

class FakeTicks implements WarpTicks {
  waits: number[] = [];
  onWait: () => void = () => {};
  async wait(ticks: number) {
    this.waits.push(ticks);
    this.onWait();
  }
}

export function setup(registry: WarpRegistry | undefined = emptyRegistry()) {
  return {
    store: new FakeRegistryStore(registry),
    world: new FakeWorld(),
    players: new FakePlayers(),
    menus: new FakeMenus(),
    feedback: new FakeFeedback(),
    ticks: new FakeTicks(),
  };
}
