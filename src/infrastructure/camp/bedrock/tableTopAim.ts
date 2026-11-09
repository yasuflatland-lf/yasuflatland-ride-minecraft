import { asTableId, type TableId } from "../../../domain/camp/table";
import type { LocalPoint } from "../../../domain/shared/tableTop";

const PIXELS = /^-?[0-9]+(?:\.[0-9]+)?$/;

/** Reads a server test hook's `<table> <x> <z>`, a point in the table's local pixels. */
export function testTableTopRequest(
  message: string,
): { table: TableId; aim: LocalPoint } | undefined {
  const [table, x, z, ...rest] = message.trim().split(/\s+/);
  if (
    !table ||
    rest.length > 0 ||
    !PIXELS.test(x ?? "") ||
    !PIXELS.test(z ?? "")
  )
    return undefined;
  return { table: asTableId(table), aim: { x: Number(x), z: Number(z) } };
}
