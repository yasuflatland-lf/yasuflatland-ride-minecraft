import { encodeHost } from "../../domain/shared/hosted";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import {
  placeOnTop as fitOnTop,
  hostSpotPoint,
  type LocalPoint,
  type TopItem,
  type TopPlacement,
  type TopSurface,
} from "../../domain/shared/tableTop";
import type { Vec3 } from "../../domain/shared/vec";
import { hasClearance } from "./groundPlacement";
import type { GroundCellsWorld } from "./ports/groundCells";
import type { HostedItemKind, HostedKindId } from "./ports/hostedItem";

/** A refusal of the table top rule, which the player sees as a hint. */
export type TopRefusal = Extract<TopPlacement, { ok: false }>["reason"];

/** `refused` covers a missing table, a blocked column, and an unpaid item. */
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
  const at = hostSpotPoint(host, placement.at, surface.topPx);
  const cell = {
    x: Math.floor(at.x),
    y: Math.floor(host.at.y) + surface.clearanceBase,
    z: Math.floor(at.z),
  };
  if (!hasClearance(world, host.dimension, cell, kind.clearance))
    return "refused";
  if (
    cmd.player &&
    !world.isCreative(cmd.player) &&
    !world.consumeItem(cmd.player, cmd.slot)
  )
    return "refused";
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
  );
  return "placed";
}

export interface TopHostWorld extends GroundCellsWorld {
  topHost(
    hostType: string,
    id: string,
  ): { dimension: DimensionId; at: Vec3; yaw: number } | undefined;
  itemsOnTop(hostType: string, id: string): readonly TopItem[];
  spawnHosted(
    kind: HostedKindId,
    dimension: DimensionId,
    at: Vec3,
    yaw: number,
    host: string,
  ): void;
}
