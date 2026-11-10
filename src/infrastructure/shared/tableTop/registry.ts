import { type Entity, world } from "@minecraft/server";
import type { TopRefusal } from "../../../application/shared/placeOnTop";
import type { HostedKindId } from "../../../application/shared/ports/hostedItem";
import { decodeHost } from "../../../domain/shared/hosted";
import type {
  LocalPoint,
  TopItem,
  TopRect,
  TopSurface,
} from "../../../domain/shared/tableTop";

export interface TopHostType {
  readonly hostType: string;
  readonly entityTypeId: string;
  readonly surface: TopSurface;
  readonly isTopNow: (entity: Entity) => boolean;
  readonly blockedAt?: (
    entity: Entity,
    at: LocalPoint,
    footprint: TopRect,
  ) => boolean;
  readonly refusalHints: Readonly<Record<TopRefusal, string>>;
  /** Saved fixed-spot markers predate free placement (ADR 0185). */
  readonly legacySpot?: (spot: number) => LocalPoint | undefined;
}

export interface HostedEntityKind {
  readonly kind: HostedKindId;
  readonly entityTypeId: string;
  readonly hostProperty: string;
  readonly footprint: TopRect;
}

export class TopHostRegistry {
  private readonly hosts = new Map<string, TopHostType>();
  private readonly kinds = new Map<HostedKindId, HostedEntityKind>();

  registerHost(type: TopHostType): void {
    this.hosts.set(type.hostType, type);
  }

  registerHosted(kind: HostedEntityKind): void {
    this.kinds.set(kind.kind, kind);
  }

  hostTypeOf(entity: Entity): TopHostType | undefined {
    return [...this.hosts.values()].find(
      (type) => type.entityTypeId === entity.typeId && type.isTopNow(entity),
    );
  }

  host(
    hostType: string,
    id: string,
  ): { entity: Entity; type: TopHostType } | undefined {
    const type = this.hosts.get(hostType);
    if (!type) return undefined;
    const entity = world.getEntity(id);
    return entity?.isValid &&
      entity.typeId === type.entityTypeId &&
      type.isTopNow(entity)
      ? { entity, type }
      : undefined;
  }

  /** Scan the host dimension so no stored item list can drift from the world (ADR 0185). */
  private entries(hostType: string, id: string) {
    const host = this.host(hostType, id);
    if (!host) return [];
    return [...this.kinds.values()].flatMap((kind) =>
      host.entity.dimension
        .getEntities({ type: kind.entityTypeId })
        .flatMap((entity) => {
          const value = entity.getDynamicProperty(kind.hostProperty);
          const marker = decodeHost(
            typeof value === "string" ? value : "",
            (type, spot) => this.hosts.get(type)?.legacySpot?.(spot),
          );
          return marker.kind === "top" &&
            marker.hostType === hostType &&
            marker.id === id
            ? [{ entity, item: { at: marker.at, footprint: kind.footprint } }]
            : [];
        }),
    );
  }

  itemsOnTop(hostType: string, id: string): TopItem[] {
    return this.entries(hostType, id).map((entry) => entry.item);
  }

  hostedOn(hostType: string, id: string): Entity[] {
    return this.entries(hostType, id).map((entry) => entry.entity);
  }
}
