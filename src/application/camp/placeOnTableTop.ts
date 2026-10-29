import { hostSpotPoint } from "../../domain/camp/dutchOven";
import { encodeHost } from "../../domain/camp/hosted";
import {
  TABLE_TOP_HALF_PX,
  TABLE_TOP_LIMIT,
  TABLE_TOP_PX,
} from "../../domain/camp/spec";
import {
  type LocalPoint,
  placeOnTop,
  type TopPlacement,
} from "../../domain/camp/tabletop";
import type { PlayerId } from "../../domain/shared/ids";
import { hasClearance } from "./groundPlacement";
import type { HostedItemKind, TableTopWorld } from "./ports/tableTop";

/** A refusal of the table top rule, which the player sees as a hint. */
export type TableTopRefusal = Extract<TopPlacement, { ok: false }>["reason"];

/** `refused` covers a missing table, a blocked column, and an unpaid item. */
export type TableTopOutcome = "placed" | "refused" | TableTopRefusal;

export interface TableTopRequest {
  /** Omitted only by the server test hook, which pays nothing (ADR 0010). */
  player?: PlayerId;
  table: string;
  slot: number;
  aim?: LocalPoint;
}

/** Stand an item at the aimed point of a table top, paying only once every check passes (ADR 0185). */
export function placeOnTableTop(
  world: TableTopWorld,
  kind: HostedItemKind,
  cmd: TableTopRequest,
): TableTopOutcome {
  const table = world.table(cmd.table);
  if (!table) return "refused";
  const placement = placeOnTop(
    TABLE_TOP_HALF_PX,
    TABLE_TOP_LIMIT,
    world.itemsOnTable(cmd.table),
    cmd.aim ?? { x: 0, z: 0 },
    kind.footprint,
  );
  if (!placement.ok) return placement.reason;
  const at = hostSpotPoint(table, placement.at, TABLE_TOP_PX);
  const cell = {
    x: Math.floor(at.x),
    y: Math.floor(table.at.y),
    z: Math.floor(at.z),
  };
  if (!hasClearance(world, table.dimension, cell, kind.clearance))
    return "refused";
  if (
    cmd.player &&
    !world.isCreative(cmd.player) &&
    !world.consumeItem(cmd.player, cmd.slot)
  )
    return "refused";
  world.spawnHostedOnTable(
    kind.id,
    table.dimension,
    at,
    table.yaw,
    encodeHost({ kind: "camp_table", id: cmd.table, at: placement.at }),
  );
  return "placed";
}
