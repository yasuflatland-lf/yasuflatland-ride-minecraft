import type { PlayerId, VehicleId } from "../../shared/ids";
// The vehicles in a world in the order they appeared, and the ones evicted to
// keep each owner and kind at its limit (ADR 0038, ADR 0066, ADR 0124). A
// script cannot remove an entity in an unloaded chunk, so it waits until its
// chunk loads.
import type { VehicleKind } from "../kind";
import { SPEC } from "../spec";

export type FleetLimitOf = (kind: VehicleKind) => number;

export interface FleetEntry {
  readonly id: VehicleId;
  readonly kind: VehicleKind;
  /** Player.id of the player who placed it; undefined when summoned by command or placed before ADR 0066. */
  readonly owner?: PlayerId;
}

/** An eviction saved before ADR 0124 has only its id, so it never comes back. */
export type EvictedEntry = FleetEntry | { readonly id: VehicleId };

export interface FleetState {
  /** Oldest first. */
  readonly order: readonly FleetEntry[];
  /** Oldest eviction first. */
  readonly evicted: readonly EvictedEntry[];
}

const groupOf = (entry: FleetEntry): string =>
  entry.owner === undefined ? "" : `${entry.owner}\u0000${entry.kind}`;

export class Fleet {
  private constructor(
    private order: FleetEntry[],
    private evicted: EvictedEntry[],
    private readonly limitOf: FleetLimitOf,
  ) {}

  static empty(limitOf: FleetLimitOf): Fleet {
    return new Fleet([], [], limitOf);
  }

  /**
   * A stored state may come from a build with a higher limit or be edited by
   * hand, so a repeated id counts once and a tracked id is not also evicted.
   */
  static restore(state: FleetState, limitOf: FleetLimitOf): Fleet {
    const tracked = new Set<VehicleId>();
    const order: FleetEntry[] = [];
    for (const entry of state.order) {
      if (tracked.has(entry.id)) continue;
      tracked.add(entry.id);
      order.push({ ...entry });
    }
    const evicted: EvictedEntry[] = [];
    for (const entry of state.evicted) {
      if (tracked.has(entry.id)) continue;
      tracked.add(entry.id);
      evicted.push({ ...entry });
    }
    const fleet = new Fleet(order, evicted, limitOf);
    fleet.trim();
    return fleet;
  }

  state(): FleetState {
    return {
      order: this.order.map((entry) => ({ ...entry })),
      evicted: this.evicted.map((entry) => ({ ...entry })),
    };
  }

  has(id: VehicleId): boolean {
    return this.order.some((entry) => entry.id === id);
  }

  isEvicted(id: VehicleId): boolean {
    return this.evicted.some((entry) => entry.id === id);
  }

  knows(id: VehicleId): boolean {
    return this.has(id) || this.isEvicted(id);
  }

  /**
   * Adds a vehicle as the newest one. A vehicle already known keeps its place,
   * so a repeated event for the same vehicle changes nothing.
   */
  admit(entry: FleetEntry): void {
    if (this.knows(entry.id)) return;
    this.order.push({ ...entry });
    this.trim();
  }

  /**
   * Adds a vehicle that was already in the world when the fleet first saw it,
   * so it goes before every vehicle the fleet watched appear.
   */
  admitAsOldest(entry: FleetEntry): void {
    if (this.knows(entry.id)) return;
    this.order.unshift({ ...entry });
    this.trim();
  }

  /**
   * Stops tracking a vehicle that is gone. When it held a slot, the latest
   * vehicle evicted from its group takes the slot back and stays (ADR 0124).
   */
  forget(id: VehicleId): void {
    const freed = this.order.find((entry) => entry.id === id);
    this.order = this.order.filter((entry) => entry.id !== id);
    this.evicted = this.evicted.filter((entry) => entry.id !== id);
    if (freed) this.recall(groupOf(freed));
  }

  // Every vehicle in the group arrived after the one it evicted, so the
  // recalled one goes back as the oldest.
  private recall(group: string): void {
    for (let at = this.evicted.length - 1; at >= 0; at--) {
      const entry = this.evicted[at];
      if (!entry || !("kind" in entry) || groupOf(entry) !== group) continue;
      this.evicted.splice(at, 1);
      this.order.unshift(entry);
      return;
    }
  }

  private trim(): void {
    const groups = new Map<string, FleetEntry[]>();
    for (const entry of this.order) {
      const key = groupOf(entry);
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    const removed = new Set<VehicleId>();
    for (const group of groups.values()) {
      const first = group[0];
      if (!first) continue;
      const limit =
        first.owner === undefined
          ? SPEC.maxUnownedVehicles
          : this.limitOf(first.kind);
      const excess = group.length - limit;
      if (excess <= 0) continue;
      for (const entry of group.slice(0, excess)) {
        removed.add(entry.id);
        this.evicted.push(entry);
      }
    }
    this.order = this.order.filter((entry) => !removed.has(entry.id));
    this.evicted = this.evicted.slice(-SPEC.maxEvicted);
  }
}
