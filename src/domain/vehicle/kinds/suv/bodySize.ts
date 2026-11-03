/** Construction pixels of the SUV model, unscaled (16 px = 1 block at scale 1). */
export type SuvConstructionPx = {
  readonly roofTop: number;
  readonly seatX: number;
  readonly frontSeatBackZ: number;
  readonly rearSeatBackZ: number;
  readonly riderAheadOfSeatBack: number;
  readonly collisionWidth: number;
  readonly collisionHeight: number;
};

/** The SUV's body size in blocks. Every gameplay number that follows the body derives from it. */
export type SuvBodySize = {
  readonly scale: number;
  readonly collision: { readonly width: number; readonly height: number };
  readonly shell: { readonly front: number; readonly halfWidth: number };
  readonly footprint: number;
  readonly roofTop: number;
  readonly seats: {
    readonly x: number;
    readonly frontZ: number;
    readonly rearZ: number;
    readonly y: number;
  };
};

/** Probe and observation results; they are measurements, not derivations. */
export type SuvMeasured = {
  readonly shellFront: number;
  readonly shellHalfWidth: number;
  readonly footprint: number;
  readonly seatY: number;
};

export function suvBodySize(
  px: SuvConstructionPx,
  scale: number,
  measured: SuvMeasured,
): SuvBodySize {
  // Rounded to 9 digits so the derived values equal the decimal literals they replaced (1e-9 is far below any gameplay tolerance).
  const blocks = (v: number) => Math.round(((v * scale) / 16) * 1e9) / 1e9;
  return {
    scale,
    collision: {
      width: blocks(px.collisionWidth),
      height: blocks(px.collisionHeight),
    },
    shell: { front: measured.shellFront, halfWidth: measured.shellHalfWidth },
    footprint: measured.footprint,
    roofTop: blocks(px.roofTop),
    seats: {
      x: blocks(px.seatX),
      frontZ: blocks(px.frontSeatBackZ + px.riderAheadOfSeatBack),
      rearZ: blocks(px.rearSeatBackZ + px.riderAheadOfSeatBack),
      y: measured.seatY,
    },
  };
}

const ROOF_TOP_PX = 31.825;

export const SUV_BODY_SIZE: SuvBodySize = Object.freeze(
  suvBodySize(
    {
      roofTop: ROOF_TOP_PX,
      seatX: 0.38 * 16,
      frontSeatBackZ: -5.75,
      rearSeatBackZ: -18,
      riderAheadOfSeatBack: 5.2,
      collisionWidth: 1.8 * 16,
      // Retain the 0.5 construction-pixel gap below the roof slab (ADR 0194).
      collisionHeight: ROOF_TOP_PX - 0.5,
    },
    1.45,
    {
      shellFront: 3.1, // encloses the measured 3.092125-block fog lamp lenses
      shellHalfWidth: 1.58, // encloses the measured 1.57234375-block wheel hub caps
      footprint: 3.95, // the rear bumper corner reaches radius 3.945698957 blocks
      seatY: 1.16, // round(0.73 observed + 4.75 hood-rise px * 1.45 / 16, 2) (ADR 0196)
    },
  ),
);
