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
  readonly rooms: readonly TentLocalBox[];
  readonly anchor: TentLocalCell;
}

export interface TentLayoutSpec extends Omit<TentLayout, "walls" | "ceilings"> {
  /** Outer side-wall x at each layer; cross-walls exclude the corner columns. */
  readonly wallHalfWidths: readonly number[];
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

const key = (cell: TentLocalCell): string =>
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

  const walls: { cell: TentLocalCell; face: TentFace }[] = [];
  const crossWall = (depth: number, face: TentFace) => {
    const halfWidth = Math.max(...wallHalfWidths) - 1;
    for (let x = -halfWidth; x <= halfWidth; x++)
      wallHalfWidths.forEach((width, layer) => {
        if (Math.abs(x) < width)
          walls.push({ cell: { x, depth, layer }, face });
      });
  };
  // Preserve the saved-cell order: front, left side, right side, inner, rear.
  crossWall(depths.front, 0);
  for (const side of [1, -1])
    for (let depth = depths.front + 1; depth < depths.rear; depth++)
      wallHalfWidths.forEach((width, layer) => {
        walls.push({
          cell: { x: side * width, depth, layer },
          face: side > 0 ? 2 : 3,
        });
      });
  crossWall(depths.inner, 1);
  crossWall(depths.rear, 1);

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
  const wallKeys = new Set(walls.map(({ cell }) => key(cell)));
  if (flapCells.some((cell) => !wallKeys.has(key(cell))))
    throw new Error("Tent flap cell must be a wall cell");
  if (
    spec.mattresses
      .flat()
      .some((cell) => !spec.rooms.some((room) => inTentLocalBox(cell, room)))
  )
    throw new Error("Tent mattress cell must be inside a room");
  if (!ceilings.some((cell) => key(cell) === key(spec.lantern)))
    throw new Error("Tent lantern cell must be a ceiling cell");
  if (spec.anchor.depth !== depths.rear || !wallKeys.has(key(spec.anchor)))
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
    rooms: Object.freeze(spec.rooms.map((room) => Object.freeze({ ...room }))),
    anchor: freezeCell(spec.anchor),
  });
}

const halfWidth = (TENT_SPEC.width - 1) / 2;
const roomHalfWidth = halfWidth - 1;
const front = 3;
const inner = 8;
const rear = TENT_SPEC.depth - 1;
const wallLayers = TENT_SPEC.frontRoomHeadroom;

export const TUNNEL_LAYOUT: TentLayout = buildLayout({
  wallHalfWidths: Array.from({ length: wallLayers }, () => halfWidth),
  depths: { front, inner, rear },
  ceilings: [
    {
      halfWidth: roomHalfWidth,
      depthFrom: front + 1,
      depthTo: rear - 1,
      layer: wallLayers,
    },
    {
      halfWidth: roomHalfWidth,
      depthFrom: 0,
      depthTo: front - 1,
      layer: TENT_SPEC.tarpHeadroom,
    },
  ],
  flaps: {
    front: [
      { x: 0, depth: front, layer: 0 },
      { x: 0, depth: front, layer: 1 },
    ],
    left: [
      { x: halfWidth, depth: 6, layer: 0 },
      { x: halfWidth, depth: 6, layer: 1 },
    ],
    right: [
      { x: -halfWidth, depth: 6, layer: 0 },
      { x: -halfWidth, depth: 6, layer: 1 },
    ],
    bedroom: [
      { x: 0, depth: inner, layer: 0 },
      { x: 0, depth: inner, layer: 1 },
    ],
  },
  mattresses: [
    [
      { x: 1, depth: 9, layer: 0 },
      { x: 1, depth: 10, layer: 0 },
    ],
    [
      { x: -1, depth: 9, layer: 0 },
      { x: -1, depth: 10, layer: 0 },
    ],
  ],
  // The ceiling cell over the lantern bone, in front of the bedroom door.
  lantern: { x: 0, depth: inner - 1, layer: wallLayers },
  clear: { halfWidth, depth: TENT_SPEC.depth, layers: wallLayers + 1 },
  // The inner wall counts as inside, including the bedroom doorway.
  rooms: [
    {
      halfWidth: roomHalfWidth,
      depthFrom: front + 1,
      depthTo: rear - 1,
      layerTo: wallLayers - 1,
    },
  ],
  anchor: { x: 0, depth: rear, layer: 0 },
});
