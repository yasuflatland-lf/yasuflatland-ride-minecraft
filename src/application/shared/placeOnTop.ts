import { cellOf } from "../../domain/shared/cells";
import { encodeHost } from "../../domain/shared/hosted";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import {
  placeOnTop as fitOnTop,
  hostSpotPoint,
  type LocalPoint,
  type TopItem,
  type TopPlacement,
  type TopRect,
  type TopSurface,
} from "../../domain/shared/tableTop";
import type { Vec3 } from "../../domain/shared/vec";
import { hasClearance } from "./groundPlacement";
import { placePaid } from "./paidPlacement";
import type { GroundCellsWorld } from "./ports/groundCells";
import type { HostedItemKind, HostedKindId } from "./ports/hostedItem";
import type { ItemPayment } from "./ports/itemPayment";

/** A refusal of the table top rule, which the player sees as a hint. */
export type TopRefusal = Extract<TopPlacement, { ok: false }>["reason"];

/** `refused` covers a missing table, a blocked column, an unpaid item, and a failed spawn. */
export type TopOutcome = "placed" | "refused" | TopRefusal;

export interface TopRequest {
  /** Omitted only by the server test hook, which pays nothing (ADR 0010). */
  player?: PlayerId;
  hostType: string;
  host: string;
  slot: number;
  aim?: LocalPoint;
}

/** Stand an item at the aimed point of a table top, paying only once every check passes (ADR 0185). */
export function placeOnTop(
  world: TopHostWorld,
  surface: TopSurface,
  kind: HostedItemKind,
  cmd: TopRequest,
): TopOutcome {
  const host = world.topHost(cmd.hostType, cmd.host);
  if (!host) return "refused";
  const placement = fitOnTop(
    surface.half,
    surface.limit,
    world.itemsOnTop(cmd.hostType, cmd.host),
    cmd.aim ?? { x: 0, z: 0 },
    kind.footprint,
  );
  if (!placement.ok) return placement.reason;
  if (host.blockedAt?.(placement.at, kind.footprint)) return "overlap";
  const at = hostSpotPoint(host, placement.at, surface.topPx);
  const cell = cellOf({
    ...at,
    y: Math.floor(host.at.y) + surface.clearanceBase,
  });
  if (!hasClearance(world, host.dimension, cell, kind.clearance, kind.refuses))
    return "refused";
  const result = placePaid(world, { player: cmd.player, slot: cmd.slot }, () =>
    world.spawnHosted(
      kind.id,
      host.dimension,
      at,
      host.yaw,
      encodeHost({
        kind: "top",
        hostType: cmd.hostType,
        id: cmd.host,
        at: placement.at,
      }),
    ),
  );
  return result.placed ? "placed" : "refused";
}

export interface TopHostWorld extends GroundCellsWorld, ItemPayment {
  topHost(
    hostType: string,
    id: string,
  ):
    | {
        blockedAt?: (at: LocalPoint, footprint: TopRect) => boolean;
        dimension: DimensionId;
        at: Vec3;
        yaw: number;
      }
    | undefined;
  itemsOnTop(hostType: string, id: string): readonly TopItem[];
  spawnHosted(
    kind: HostedKindId,
    dimension: DimensionId,
    at: Vec3,
    yaw: number,
    host: string,
  ): string | undefined;
}
