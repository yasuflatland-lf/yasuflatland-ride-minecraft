import { PAINTS, type Paint } from "../../../domain/shared/paint";

/** minecraft:variant value for each paint. The render controller of each painted entity picks the texture by this index. */
export const PAINT_VARIANT: Readonly<Record<Paint, number>> =
  Object.fromEntries(PAINTS.map((paint, i) => [paint, i])) as Record<
    Paint,
    number
  >;
