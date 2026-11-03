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

export const SUV_BODY_SIZE: SuvBodySize = Object.freeze(
  suvBodySize(
    {
      roofTop: 26.1,
      seatX: 0.38 * 16,
      frontSeatBackZ: -5.75,
      rearSeatBackZ: -18,
      riderAheadOfSeatBack: 5.2,
      collisionWidth: 1.8 * 16,
      collisionHeight: 1.6 * 16,
    },
    1.45,
    {
      shellFront: 2.69, // encloses the measured 2.6843125-block fog lamp lenses (ADR 0194)
      shellHalfWidth: 1.64, // encloses the measured 1.63125-block wheel hub caps (ADR 0194)
      footprint: 3.4, // the rear hover glow reaches 3.396322 blocks at its farthest corner (ADR 0122, 0194)
      seatY: 0.73, // observed seat height (ADR 0196)
    },
  ),
);
