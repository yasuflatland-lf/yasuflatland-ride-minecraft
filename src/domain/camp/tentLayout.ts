import { TENT_SPEC } from "./spec";

/** x: toward the tent's left. depth: cells behind the tarp's front edge. layer: 0 rests on the ground. */
export interface TentLocalCell {
  readonly x: number;
  readonly depth: number;
  readonly layer: number;
}

/** Plate direction: 0 -z, 1 +z, 2 -x, 3 +x. Layout faces are at yaw 0; tentCells rotates them into world faces. */
export type TentFace = 0 | 1 | 2 | 3;
export type FlapId = "front" | "left" | "right" | "bedroom";

/** Inclusive cell bounds, starting at layer 0. */
export interface TentLocalBox {
  readonly halfWidth: number;
  readonly depthFrom: number;
  readonly depthTo: number;
  readonly layerTo: number;
}

export interface TentLayout {
  readonly walls: readonly {
    readonly cell: TentLocalCell;
    readonly face: TentFace;
  }[];
  readonly ceilings: readonly TentLocalCell[];
  readonly flaps: Readonly<Record<FlapId, readonly TentLocalCell[]>>;
  readonly mattresses: readonly [
    readonly TentLocalCell[],
    readonly TentLocalCell[],
  ];
  readonly lantern: TentLocalCell;
  readonly clear: {
    readonly halfWidth: number;
    readonly depth: number;
    readonly layers: number;
  };
  /** The clear box derived from `clear`; every laid cell lies inside it. */
  readonly clearBox: TentLocalBox;
  readonly rooms: readonly TentLocalBox[];
  readonly anchor: TentLocalCell;
}

export interface TentLayoutSpec
  extends Omit<TentLayout, "walls" | "ceilings" | "clearBox"> {
  /** Outer side-wall x at each layer; cross-walls exclude the corner columns. */
  readonly wallHalfWidths: readonly number[];
  /** Front/rear cross-walls step inward by this many cells at each layer; omitted layers use zero. */
  readonly crossWallInsets?: readonly number[];
  readonly depths: {
    readonly front: number;
    readonly inner: number;
    readonly rear: number;
  };
  /** Ordered ceiling strips, each enumerated x first, then depth. */
  readonly ceilings: readonly {
    readonly halfWidth: number;
    readonly depthFrom: number;
    readonly depthTo: number;
    readonly layer: number;
  }[];
}

export const inTentLocalBox = (
  cell: TentLocalCell,
  box: TentLocalBox,
): boolean =>
  Math.abs(cell.x) <= box.halfWidth &&
  cell.depth >= box.depthFrom &&
  cell.depth <= box.depthTo &&
  cell.layer >= 0 &&
  cell.layer <= box.layerTo;

export const tentCellKey = (cell: TentLocalCell): string =>
  `${cell.x},${cell.depth},${cell.layer}`;
const freezeCell = (cell: TentLocalCell): TentLocalCell =>
  Object.freeze({ ...cell });
const freezeCells = (
  cells: readonly TentLocalCell[],
): readonly TentLocalCell[] => Object.freeze(cells.map(freezeCell));

/** Builds and validates local geometry without retaining mutable input objects. */
export function buildLayout(spec: TentLayoutSpec): TentLayout {
  const { wallHalfWidths, depths, clear } = spec;
  if (
    !Number.isInteger(clear.halfWidth) ||
    clear.halfWidth < 0 ||
    !Number.isInteger(clear.depth) ||
    clear.depth <= 0 ||
    !Number.isInteger(clear.layers) ||
    clear.layers <= 0 ||
    wallHalfWidths.length === 0 ||
    wallHalfWidths.some((width) => !Number.isInteger(width) || width < 1) ||
    ![depths.front, depths.inner, depths.rear].every(Number.isInteger) ||
    depths.front < 0 ||
    depths.front >= depths.inner ||
    depths.inner >= depths.rear
  )
    throw new Error("Invalid tent layout dimensions");

  const insets = spec.crossWallInsets ?? [];
  if (
    insets.length > wallHalfWidths.length ||
    insets.some(
      (inset) =>
        !Number.isInteger(inset) ||
        inset < 0 ||
        depths.front + inset >= depths.inner ||
        depths.rear - inset <= depths.inner,
    )
  )
    throw new Error("Invalid tent cross-wall insets");

  const walls: { cell: TentLocalCell; face: TentFace }[] = [];
  const crossWall = (depth: number, face: TentFace, insetDirection = 0) => {
    const halfWidth = Math.max(...wallHalfWidths) - 1;
    for (let x = -halfWidth; x <= halfWidth; x++)
      wallHalfWidths.forEach((width, layer) => {
        if (Math.abs(x) < width)
          walls.push({
            cell: {
              x,
              depth: depth + insetDirection * (insets[layer] ?? 0),
              layer,
            },
            face,
          });
      });
  };
  // Preserve the saved-cell order: front, left side, right side, inner, rear.
  crossWall(depths.front, 0, 1);
  for (const side of [1, -1])
    for (let depth = depths.front + 1; depth < depths.rear; depth++)
      wallHalfWidths.forEach((width, layer) => {
        walls.push({
          cell: { x: side * width, depth, layer },
          face: side > 0 ? 2 : 3,
        });
      });
  crossWall(depths.inner, 1);
  crossWall(depths.rear, 1, -1);

  const ceilings: TentLocalCell[] = [];
  for (const strip of spec.ceilings) {
    if (
      ![strip.halfWidth, strip.depthFrom, strip.depthTo, strip.layer].every(
        Number.isInteger,
      ) ||
      strip.halfWidth < 0 ||
      strip.depthFrom > strip.depthTo
    )
      throw new Error("Invalid tent ceiling strip");
    for (let x = -strip.halfWidth; x <= strip.halfWidth; x++)
      for (let depth = strip.depthFrom; depth <= strip.depthTo; depth++)
        ceilings.push({ x, depth, layer: strip.layer });
  }

  const clearBox: TentLocalBox = {
    halfWidth: clear.halfWidth,
    depthFrom: 0,
    depthTo: clear.depth - 1,
    layerTo: clear.layers - 1,
  };
  const flapCells = Object.values(spec.flaps).flat();
  const allCells = [
    ...walls.map(({ cell }) => cell),
    ...ceilings,
    ...flapCells,
    ...spec.mattresses.flat(),
    spec.lantern,
    spec.anchor,
  ];
  if (
    allCells.some(
      (cell) =>
        ![cell.x, cell.depth, cell.layer].every(Number.isInteger) ||
        !inTentLocalBox(cell, clearBox),
    )
  )
    throw new Error("Tent cell outside clear box");
  const wallKeys = new Set(walls.map(({ cell }) => tentCellKey(cell)));
  if (flapCells.some((cell) => !wallKeys.has(tentCellKey(cell))))
    throw new Error("Tent flap cell must be a wall cell");
  if (
    spec.mattresses
      .flat()
      .some((cell) => !spec.rooms.some((room) => inTentLocalBox(cell, room)))
  )
    throw new Error("Tent mattress cell must be inside a room");
  if (!ceilings.some((cell) => tentCellKey(cell) === tentCellKey(spec.lantern)))
    throw new Error("Tent lantern cell must be a ceiling cell");
  if (
    spec.anchor.depth !== depths.rear - (insets[spec.anchor.layer] ?? 0) ||
    !wallKeys.has(tentCellKey(spec.anchor))
  )
    throw new Error("Tent anchor must be a rear wall cell");

  return Object.freeze({
    walls: Object.freeze(
      walls.map(({ cell, face }) =>
        Object.freeze({ cell: freezeCell(cell), face }),
      ),
    ),
    ceilings: freezeCells(ceilings),
    flaps: Object.freeze({
      front: freezeCells(spec.flaps.front),
      left: freezeCells(spec.flaps.left),
      right: freezeCells(spec.flaps.right),
      bedroom: freezeCells(spec.flaps.bedroom),
    }),
    mattresses: Object.freeze([
      freezeCells(spec.mattresses[0]),
      freezeCells(spec.mattresses[1]),
    ] as const),
    lantern: freezeCell(spec.lantern),
    clear: Object.freeze({ ...clear }),
    clearBox: Object.freeze(clearBox),
    rooms: Object.freeze(spec.rooms.map((room) => Object.freeze({ ...room }))),
    anchor: freezeCell(spec.anchor),
  });
}

// The body starts after the three-column tarp; the bedroom needs two columns.
const TARP_DEPTH = 3;
const BEDROOM_DEPTH = 2;
const FLAP_HEIGHT = 2;
const ENTRANCE_HALF_WIDTH = 1;
const MATTRESS_X = 1;
const halfWidth = (TENT_SPEC.width - 1) / 2;
const roomHalfWidth = halfWidth - 1;
const front = TARP_DEPTH;
const rear = TENT_SPEC.depth - 1;
const inner = rear - BEDROOM_DEPTH - 1;
const wallLayers = TENT_SPEC.frontRoomHeadroom;

/** Horizontal shell surfaces at a height above ground (ADR 0209, 0210). The tarp meets the inclined front face. */
export function tentShellAt(height: number): {
  halfWidth: number;
  front: number;
  rear: number;
  top: number;
  tarpHalfWidth: number;
  tarpTop: number;
} {
  const top = wallLayers + 1;
  const inset = (TENT_SPEC.leanDepth * height) / top;
  return {
    halfWidth: TENT_SPEC.width / 2 - (TENT_SPEC.leanWidth * height) / top,
    front: front + inset,
    rear: TENT_SPEC.depth - inset,
    top,
    tarpHalfWidth: TENT_SPEC.width / 2,
    tarpTop: TENT_SPEC.tarpHeadroom + 1,
  };
}

const wallHalfWidths = Array.from({ length: wallLayers }, (_, layer) =>
  Math.floor(tentShellAt(layer + 0.5).halfWidth),
);
const crossWallInsets = Array.from(
  { length: wallLayers },
  (_, layer) => Math.ceil(tentShellAt(layer + 0.5).front - 0.5) - front,
);
const flap = (x: number, depth: number): TentLocalCell[] =>
  Array.from({ length: FLAP_HEIGHT }, (_, layer) => ({ x, depth, layer }));
const mattress = (x: number): TentLocalCell[] =>
  Array.from({ length: BEDROOM_DEPTH }, (_, offset) => ({
    x,
    depth: inner + 1 + offset,
    layer: 0,
  }));
const upperInset = crossWallInsets[wallLayers - 1] ?? 0;
const upperHalfWidth = wallHalfWidths[wallLayers - 1] ?? roomHalfWidth;

export const TRAPEZOID_LAYOUT: TentLayout = buildLayout({
  wallHalfWidths,
  crossWallInsets,
  depths: { front, inner, rear },
  ceilings: [
    {
      halfWidth: Math.floor(tentShellAt(wallLayers + 0.5).halfWidth),
      depthFrom: front + 1,
      depthTo: rear - 1,
      layer: wallLayers,
    },
    {
      halfWidth: roomHalfWidth,
      depthFrom: 0,
      // Bridge the stepped front wall so the open entrance cannot lead onto the roof.
      depthTo: front,
      layer: TENT_SPEC.tarpHeadroom,
    },
  ],
  flaps: {
    front: Array.from({ length: ENTRANCE_HALF_WIDTH * 2 + 1 }, (_, offset) =>
      flap(offset - ENTRANCE_HALF_WIDTH, front),
    ).flat(),
    left: wallHalfWidths
      .slice(0, FLAP_HEIGHT)
      .map((x, layer) => ({ x, depth: inner - 1, layer })),
    right: wallHalfWidths
      .slice(0, FLAP_HEIGHT)
      .map((x, layer) => ({ x: -x, depth: inner - 1, layer })),
    bedroom: flap(0, inner),
  },
  mattresses: [mattress(MATTRESS_X), mattress(-MATTRESS_X)],
  lantern: { x: 0, depth: inner - 1, layer: wallLayers },
  clear: { halfWidth, depth: TENT_SPEC.depth, layers: wallLayers + 1 },
  // Outer walls stay outside; the inner wall and its doorway count as inside.
  rooms: [
    {
      halfWidth: roomHalfWidth,
      depthFrom: 0,
      depthTo: front - 1,
      layerTo: TENT_SPEC.tarpHeadroom - 1,
    },
    ...wallHalfWidths.slice(0, TENT_SPEC.tarpHeadroom).map((width, layer) => ({
      halfWidth: width - 1,
      depthFrom: front + 1,
      depthTo: rear - 1,
      layerTo: layer,
    })),
    {
      halfWidth: upperHalfWidth - 1,
      depthFrom: front + upperInset + 1,
      depthTo: rear - upperInset - 1,
      layerTo: wallLayers - 1,
    },
  ],
  anchor: { x: 0, depth: rear, layer: 0 },
});
