import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FLAP_IDS } from "../../../src/domain/camp/flaps";
import { TENT_SPEC } from "../../../src/domain/camp/spec";
import {
  flapAt,
  flapCells,
  type GroundReading,
  insideTent,
  inTentFootprint,
  lanternCell,
  PITCHED_STATE,
  type PitchSurvey,
  planPitch,
  TENT_FLAPS,
  type TentFace,
  type TentPose,
  type TentState,
  type TentYaw,
  tentBlockAt,
  tentCellAt,
  tentCells,
  tentClearCells,
  tentEntityLocation,
  tentFootprintBox,
  tentGround,
  tentGroundCells,
  tentPose,
} from "../../../src/domain/camp/tent";
import {
  TRAPEZOID_LAYOUT,
  tentShellAt,
} from "../../../src/domain/camp/tentLayout";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import { CLEARABLE_DECORATIONS } from "../../../src/domain/shared/decorations";
import { dot, forward, normalizeYaw } from "../../../src/domain/shared/vec";
import { defined } from "../../support/defined";

const AIR = "minecraft:air";
const YAWS: readonly TentYaw[] = [0, 90, 180, -90];
const arbYaw = fc.constantFrom(...YAWS);
const arbPose: fc.Arbitrary<TentPose> = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -1000, max: 1000 }),
  yaw: arbYaw,
});

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

// A quarter turn of the yaw turns the world offsets (a, b) into (-b, a).
const turned = (pose: TentPose, c: Cell): Cell => ({
  x: pose.x - (c.z - pose.z) + 0,
  y: c.y,
  z: pose.z + (c.x - pose.x) + 0,
});
const TURNED_FACE: Record<TentFace, TentFace> = { 0: 3, 1: 2, 2: 0, 3: 1 };

describe("tentPose (ADR 0131)", () => {
  it("stands on the clicked block, snapped to a quarter turn, facing the player", () => {
    fc.assert(
      fc.property(
        fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() }),
        fc.double({ min: -720, max: 720, noNaN: true }),
        (clicked, playerYaw) => {
          const pose = tentPose(clicked, playerYaw);
          expect({ x: pose.x, y: pose.y, z: pose.z }).toEqual({
            ...clicked,
            y: clicked.y + 1,
          });
          expect(YAWS).toContain(pose.yaw);
          expect(pose.yaw).toBe(
            normalizeYaw(Math.round((playerYaw + 180) / 90) * 90) + 0,
          );
          expect(
            dot(forward(pose.yaw), forward(playerYaw)),
          ).toBeLessThanOrEqual(-Math.SQRT1_2 + 1e-9);
        },
      ),
    );
  });
});

describe("tentCells (ADR 0130, 0131)", () => {
  it("lays unique cells inside the clear box at every yaw and state", () => {
    fc.assert(
      fc.property(arbPose, arbState, (pose, state) => {
        const cells = tentCells(pose, state);
        const clear = new Set(tentClearCells(pose).map(cellKey));
        expect(new Set(cells.map(cellKey)).size).toBe(cells.length);
        for (const cell of cells) {
          expect(clear.has(cellKey(cell))).toBe(true);
          expect(inTentFootprint(pose, cell)).toBe(true);
        }
      }),
    );
  });

  it("keeps laid centres inside the shell and outer plates within half a block of its edge", () => {
    const localCells = [
      ...TRAPEZOID_LAYOUT.walls.map(({ cell }) => cell),
      ...TRAPEZOID_LAYOUT.ceilings,
      ...TRAPEZOID_LAYOUT.mattresses.flat(),
    ];
    for (const cell of localCells) {
      const shell = tentShellAt(cell.layer + 0.5);
      const depth = cell.depth + 0.5;
      const body =
        Math.abs(cell.x) <= shell.halfWidth &&
        depth >= shell.front &&
        depth <= shell.rear &&
        cell.layer + 0.5 <= shell.top;
      const tarp =
        Math.abs(cell.x) <= shell.tarpHalfWidth &&
        depth >= 0 &&
        depth <= shell.front &&
        cell.layer + 0.5 <= shell.tarpTop;
      expect(body || tarp, JSON.stringify(cell)).toBe(true);
    }
    const inner = defined(TENT_FLAPS.bedroom[0], "bedroom flap").depth;
    for (const { cell, face } of TRAPEZOID_LAYOUT.walls) {
      if (cell.depth === inner && face === 1) continue;
      const shell = tentShellAt(cell.layer + 0.5);
      const distance =
        face >= 2
          ? shell.halfWidth - Math.abs(cell.x)
          : face === 0
            ? cell.depth + 0.5 - shell.front
            : shell.rear - cell.depth - 0.5;
      // The cell centre is inside, and its outer face is at most 0.5 from the shell.
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThanOrEqual(1);
    }
    for (const cell of TRAPEZOID_LAYOUT.ceilings) {
      const shell = tentShellAt(cell.layer + 0.5);
      const onTarp = cell.depth + 0.5 <= shell.front;
      const halfWidth = onTarp ? shell.tarpHalfWidth : shell.halfWidth;
      const near = onTarp ? 0 : shell.front;
      for (const dx of [-0.5, 0.5])
        for (const dz of [-0.5, 0.5]) {
          const x = Math.abs(cell.x + dx);
          const depth = cell.depth + 0.5 + dz;
          // A corner may poke out of the slanted edge by under half a block.
          expect(x, JSON.stringify(cell)).toBeLessThanOrEqual(halfWidth + 0.5);
          expect(depth, JSON.stringify(cell)).toBeGreaterThanOrEqual(
            near - 0.5,
          );
          expect(depth, JSON.stringify(cell)).toBeLessThanOrEqual(
            shell.rear + 0.5,
          );
        }
    }
  });

  it("lays one block per layout cell in any state", () => {
    fc.assert(
      fc.property(arbState, (state) => {
        const pose: TentPose = { x: 0, y: 0, z: 0, yaw: 0 };
        const count =
          TRAPEZOID_LAYOUT.walls.length +
          TRAPEZOID_LAYOUT.ceilings.length +
          TRAPEZOID_LAYOUT.mattresses.flat().length;
        expect(tentCells(pose, state)).toHaveLength(count);
      }),
    );
  });

  it("replaces only wall cells with flaps at any pose", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const walls = new Set(
          TRAPEZOID_LAYOUT.walls.map(({ cell }) =>
            cellKey(tentCellAt(pose, cell)),
          ),
        );
        for (const id of FLAP_IDS)
          for (const cell of flapCells(pose, id))
            expect(walls.has(cellKey(cell))).toBe(true);
      }),
    );
  });

  it("shelters every room column and the open entrance above its top", () => {
    fc.assert(
      fc.property(arbPose, arbState, (pose, state) => {
        const roofs = tentCells(pose, state).filter(
          ({ block }) =>
            block.type === "ceiling" ||
            block.type === "lantern" ||
            block.type === "wall",
        );
        const roomCells = tentClearCells(pose).filter((cell) =>
          insideTent(pose, {
            x: cell.x + 0.5,
            y: cell.y + 0.5,
            z: cell.z + 0.5,
          }),
        );
        for (const cell of [...roomCells, ...flapCells(pose, "front")])
          expect(
            roofs.some(
              (roof) =>
                roof.x === cell.x && roof.z === cell.z && roof.y > cell.y,
            ),
          ).toBe(true);
      }),
    );
  });

  it("preserves standing paths through both rooms and out of the stepped side flaps", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const cells = tentCells(pose, {
          ...PITCHED_STATE,
          openFlaps: new Set(FLAP_IDS),
        });
        const blocked = new Set(
          cells
            .filter(
              ({ block }) =>
                block.type !== "mattress" &&
                !(block.type === "flap" && block.open),
            )
            .map(cellKey),
        );
        for (const depth of [0, 1, 2, 3, 4, 5, 6, 7])
          for (const x of [-1, 0, 1]) {
            if (depth === 5 && x !== 0) continue;
            for (const layer of [0, 1])
              expect(
                blocked.has(cellKey(tentCellAt(pose, { x, depth, layer }))),
              ).toBe(false);
          }
        for (const id of ["left", "right"] as const)
          for (const flap of TENT_FLAPS[id]) {
            const outside = { ...flap, x: flap.x + Math.sign(flap.x) };
            expect(blocked.has(cellKey(tentCellAt(pose, outside)))).toBe(false);
          }
      }),
    );
  });

  it("turns with the yaw about the pose", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const next: TentPose = {
          ...pose,
          yaw: (normalizeYaw(pose.yaw + 90) + 0) as TentYaw,
        };
        const mapped = tentCells(pose, PITCHED_STATE).map((c) => ({
          ...turned(pose, c),
          block:
            c.block.type === "wall"
              ? { type: "wall", face: TURNED_FACE[c.block.face] }
              : c.block,
        }));
        const sort = (cs: { x: number; y: number; z: number }[]) =>
          [...cs].sort((a, b) => cellKey(a).localeCompare(cellKey(b)));
        expect(sort(mapped)).toEqual(sort(tentCells(next, PITCHED_STATE)));
      }),
    );
  });

  it("keeps the depth lean below 4/3 so the standing paths survive (ADR 0210)", () => {
    // Above 4/3 the layer-1 cross-walls remove the standing front room and a
    // bedroom column; the standing-path test above checks the layout itself.
    expect(TENT_SPEC.leanDepth).toBeLessThan(4 / 3);
  });

  it("pins the trapezoid footprint, stepped walls, entrance and anchor", () => {
    expect(TRAPEZOID_LAYOUT.clear).toEqual({
      halfWidth: 3,
      depth: 9,
      layers: 4,
    });
    expect(TRAPEZOID_LAYOUT.anchor).toEqual({ x: 0, depth: 8, layer: 0 });
    expect(TRAPEZOID_LAYOUT.lantern).toEqual({ x: 0, depth: 4, layer: 3 });
    expect(TENT_FLAPS.front).toHaveLength(6);
    const pose = tentPose({ x: 110, y: -61, z: 46 }, 0);
    expect(tentEntityLocation(pose)).toEqual({ x: 110.5, y: -60, z: 54.5 });
    expect(tentCells(pose, PITCHED_STATE)).toHaveLength(
      TRAPEZOID_LAYOUT.walls.length +
        TRAPEZOID_LAYOUT.ceilings.length +
        TRAPEZOID_LAYOUT.mattresses.flat().length,
    );
  });
});

const arbState: fc.Arbitrary<TentState> = fc.record({
  openFlaps: fc.subarray([...FLAP_IDS]).map((ids) => new Set(ids)),
  lanternOn: fc.boolean(),
});

describe("the lantern cell", () => {
  it("lays exactly one lantern, at lanternCell, lit as the state says", () => {
    fc.assert(
      fc.property(arbPose, arbState, (pose, state) => {
        const lanterns = tentCells(pose, state).filter(
          (c) => c.block.type === "lantern",
        );
        expect(lanterns).toEqual([
          {
            ...lanternCell(pose),
            block: { type: "lantern", lit: state.lanternOn },
          },
        ]);
      }),
    );
  });

  it("never takes a flap or a mattress cell", () => {
    fc.assert(
      fc.property(arbPose, arbState, (pose, state) => {
        const key = cellKey(lanternCell(pose));
        const taken = tentCells(pose, state).filter((c) => cellKey(c) === key);
        expect(taken.map((c) => c.block.type)).toEqual(["lantern"]);
        expect(flapAt(pose, lanternCell(pose))).toBeUndefined();
      }),
    );
  });

  it("sits one cell in front of the bedroom wall at the body ceiling", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        expect(lanternCell(pose)).toEqual(
          tentCellAt(pose, {
            x: 0,
            depth: defined(TENT_FLAPS.bedroom[0], "bedroom flap").depth - 1,
            layer: TENT_SPEC.frontRoomHeadroom,
          }),
        );
      }),
    );
  });

  it("changes only the lantern's lit between off and on", () => {
    fc.assert(
      fc.property(arbPose, arbState, (pose, state) => {
        const on = tentCells(pose, { ...state, lanternOn: true });
        const off = tentCells(pose, { ...state, lanternOn: false });
        expect(on.map(cellKey)).toEqual(off.map(cellKey));
        const key = cellKey(lanternCell(pose));
        on.forEach((c, i) => {
          const o = defined(off[i], "off cell");
          if (cellKey(c) === key) {
            expect(c.block).toEqual({ type: "lantern", lit: true });
            expect(o.block).toEqual({ type: "lantern", lit: false });
          } else expect(c.block).toEqual(o.block);
        });
      }),
    );
  });

  it("takes no room cell: the standing space under it stays free", () => {
    fc.assert(
      fc.property(arbPose, arbState, (pose, state) => {
        const l = lanternCell(pose);
        const standing = { x: l.x, y: pose.y + 1, z: l.z };
        const below = cellKey(standing);
        expect(tentCells(pose, state).map(cellKey)).not.toContain(below);
        expect(
          insideTent(pose, {
            x: standing.x + 0.5,
            y: standing.y,
            z: standing.z + 0.5,
          }),
        ).toBe(true);
      }),
    );
  });

  it("turns with the yaw about the pose", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const next: TentPose = {
          ...pose,
          yaw: (normalizeYaw(pose.yaw + 90) + 0) as TentYaw,
        };
        expect(turned(pose, lanternCell(pose))).toEqual(lanternCell(next));
      }),
    );
  });
});

describe("tentBlockAt (ADR 0131)", () => {
  it("agrees with tentCells and finds nothing elsewhere", () => {
    fc.assert(
      fc.property(
        arbPose,
        fc.record({
          dx: fc.integer({ min: -14, max: 14 }),
          dy: fc.integer({ min: -2, max: 6 }),
          dz: fc.integer({ min: -14, max: 14 }),
        }),
        (pose, d) => {
          const cells = tentCells(pose, PITCHED_STATE);
          for (const c of cells) expect(tentBlockAt(pose, c)).toEqual(c.block);
          const probe = {
            x: pose.x + d.dx,
            y: pose.y + d.dy,
            z: pose.z + d.dz,
          };
          const laid = cells.find((c) => cellKey(c) === cellKey(probe));
          expect(tentBlockAt(pose, probe)).toEqual(laid?.block);
        },
      ),
    );
  });
});

describe("clear and ground cells (ADR 0131)", () => {
  it("covers the specified clear and ground cells, and the footprint box holds exactly them", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const clear = tentClearCells(pose);
        const ground = tentGroundCells(pose);
        expect(new Set(clear.map(cellKey)).size).toBe(
          TENT_SPEC.width * TENT_SPEC.depth * (TENT_SPEC.frontRoomHeadroom + 1),
        );
        expect(new Set(ground.map(cellKey)).size).toBe(
          TENT_SPEC.width * TENT_SPEC.depth,
        );
        ground.forEach((g, i) => {
          const base = defined(
            clear[i * (TENT_SPEC.frontRoomHeadroom + 1)],
            "column base",
          );
          expect(g).toEqual({ ...base, y: pose.y - 1 });
        });
        const { min, size } = tentFootprintBox(pose);
        expect([
          [TENT_SPEC.width, TENT_SPEC.frontRoomHeadroom + 1, TENT_SPEC.depth],
          [TENT_SPEC.depth, TENT_SPEC.frontRoomHeadroom + 1, TENT_SPEC.width],
        ]).toContainEqual([size.x, size.y, size.z]);
        const keys = new Set(clear.map(cellKey));
        for (let x = min.x - 1; x <= min.x + size.x; x++)
          for (let y = min.y - 1; y <= min.y + size.y; y++)
            for (let z = min.z - 1; z <= min.z + size.z; z++) {
              const c = { x, y, z };
              const inBox =
                x >= min.x &&
                x < min.x + size.x &&
                y >= min.y &&
                y < min.y + size.y &&
                z >= min.z &&
                z < min.z + size.z;
              expect(keys.has(cellKey(c))).toBe(inBox);
              expect(inTentFootprint(pose, c)).toBe(inBox);
            }
      }),
    );
  });
});

describe("insideTent (ADR 0131)", () => {
  const frac = fc.double({ min: 0, max: 0.999, noNaN: true });

  it("holds exactly in sheltered tarp columns and the stepped body interior, including the inner wall", () => {
    fc.assert(
      fc.property(arbPose, frac, frac, frac, (pose, fx, fy, fz) => {
        const halfWidth = (TENT_SPEC.width - 1) / 2;
        const bodyFront = tentShellAt(0).front;
        for (const x of range(-halfWidth - 1, halfWidth + 1))
          for (const depth of range(-1, TENT_SPEC.depth))
            for (const layer of range(-1, TENT_SPEC.frontRoomHeadroom + 1)) {
              const cell = tentCellAt(pose, { x, depth, layer });
              const shell = tentShellAt(layer + 0.5);
              const lower = layer >= 0;
              const tarp =
                lower &&
                layer < TENT_SPEC.tarpHeadroom &&
                depth >= 0 &&
                depth < bodyFront &&
                Math.abs(x) < halfWidth;
              const body =
                lower &&
                layer < TENT_SPEC.frontRoomHeadroom &&
                Math.abs(x) < Math.floor(shell.halfWidth) &&
                depth > Math.ceil(shell.front - 0.5) &&
                depth < Math.floor(shell.rear - 0.5);
              expect(
                insideTent(pose, {
                  x: cell.x + fx,
                  y: cell.y + fy,
                  z: cell.z + fz,
                }),
                JSON.stringify({ x, depth, layer }),
              ).toBe(tarp || body);
            }
      }),
    );
  });
});

describe("tentGround (ADR 0131)", () => {
  const decorations = [...CLEARABLE_DECORATIONS];
  const arbCell = fc.record({
    x: fc.integer({ min: -1000, max: 1000 }),
    y: fc.integer({ min: -60, max: 300 }),
    z: fc.integer({ min: -1000, max: 1000 }),
  });

  it("steps down through the decorations on top of the ground, and keeps any other clicked block", () => {
    fc.assert(
      fc.property(
        arbCell,
        fc.array(fc.constantFrom(...decorations), { maxLength: 3 }),
        fc.constantFrom("minecraft:stone", "minecraft:grass_block", AIR),
        (clicked, layers, groundType) => {
          const typeIdAt = (at: { y: number }) => {
            const above = clicked.y - at.y;
            return above < layers.length ? layers[above] : groundType;
          };
          expect(tentGround(clicked, typeIdAt)).toEqual({
            ...clicked,
            y: clicked.y - layers.length,
          });
        },
      ),
    );
  });

  it("rests a tent clicked on a snow layer on the block under it, with the snow in its clear cells", () => {
    const clicked = { x: 4, y: 70, z: -2 };
    const ground = tentGround(clicked, (at) =>
      at.y === 70 ? "minecraft:snow_layer" : "minecraft:dirt",
    );
    const pose = tentPose(ground, 0);
    expect(pose.y).toBe(70);
    expect(tentClearCells(pose).map(cellKey)).toContain(cellKey(clicked));
  });

  it("stops when the column cannot be read", () => {
    const clicked = { x: 0, y: 64, z: 0 };
    expect(tentGround(clicked, () => undefined)).toEqual(clicked);
  });
});

describe("tentEntityLocation (ADR 0130)", () => {
  it("is the bottom middle of the rear wall's middle cell", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const at = tentEntityLocation(pose);
        const cell = tentCellAt(pose, {
          x: 0,
          depth: TENT_SPEC.depth - 1,
          layer: 0,
        });
        expect({
          x: Math.floor(at.x),
          y: Math.floor(at.y),
          z: Math.floor(at.z),
        }).toEqual(cell);
        expect([at.x - cell.x, at.y - cell.y, at.z - cell.z]).toEqual([
          0.5, 0, 0.5,
        ]);
      }),
    );
  });
});

describe("flaps and mattresses (ADR 0130)", () => {
  it("lays four disjoint two-layer flaps as closed flap cells", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const all = Object.values(TENT_FLAPS).flat();
        for (const flap of Object.values(TENT_FLAPS))
          expect(new Set(flap.map(({ layer }) => layer))).toEqual(
            new Set([0, 1]),
          );
        const keys = all.map((c) => cellKey(tentCellAt(pose, c)));
        expect(new Set(keys).size).toBe(all.length);
        for (const [id, flap] of Object.entries(TENT_FLAPS))
          for (const c of flap)
            expect(tentBlockAt(pose, tentCellAt(pose, c))).toEqual({
              type: "flap",
              id,
              open: false,
            });
      }),
    );
  });

  it("lays each two-cell mattress as a tent cell inside the tent", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        for (const index of [0, 1] as const) {
          const mattress = TRAPEZOID_LAYOUT.mattresses[index];
          expect(mattress).toHaveLength(2);
          for (const local of mattress) {
            const c = tentCellAt(pose, local);
            expect(tentBlockAt(pose, c)).toEqual({ type: "mattress", index });
            expect(local.depth).toBeGreaterThan(
              defined(TENT_FLAPS.bedroom[0], "bedroom flap").depth,
            );
            expect(local.depth).toBeLessThan(TENT_SPEC.depth - 1);
            expect(local.x).not.toBe(0);
            expect(
              insideTent(pose, { x: c.x + 0.5, y: c.y, z: c.z + 0.5 }),
            ).toBe(true);
          }
        }
      }),
    );
  });
});

describe("tent flap cells (ADR 0132)", () => {
  it("lays the same cells in the same order for any open flaps, a flap cell open iff its flap is", () => {
    fc.assert(
      fc.property(arbPose, fc.subarray([...FLAP_IDS]), (pose, open) => {
        const openFlaps = new Set(open);
        const closed = tentCells(pose, PITCHED_STATE);
        const cells = tentCells(pose, { ...PITCHED_STATE, openFlaps });
        expect(cells.map(cellKey)).toEqual(closed.map(cellKey));
        cells.forEach((c, i) => {
          const before = defined(closed[i], "closed cell").block;
          if (c.block.type !== "flap") {
            expect(c.block).toEqual(before);
            return;
          }
          expect(before).toEqual({ ...c.block, open: false });
          expect(c.block.open).toBe(openFlaps.has(c.block.id));
        });
      }),
    );
  });

  it("finds each flap's cells and nothing else, from TENT_FLAPS at the pose", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const seen = new Set<string>();
        for (const id of FLAP_IDS) {
          const cells = flapCells(pose, id);
          expect(cells.length).toBeGreaterThan(0);
          expect(cells).toEqual(TENT_FLAPS[id].map((c) => tentCellAt(pose, c)));
          for (const c of cells) {
            expect(flapAt(pose, c)).toBe(id);
            expect(seen.has(cellKey(c))).toBe(false);
            seen.add(cellKey(c));
          }
        }
        for (const c of tentCells(pose, PITCHED_STATE))
          if (!seen.has(cellKey(c))) expect(flapAt(pose, c)).toBeUndefined();
      }),
    );
  });
});

describe("mattresses (ADR 0092, 0133)", () => {
  const mattressCells = (pose: TentPose) =>
    tentCells(pose, PITCHED_STATE).filter((c) => c.block.type === "mattress");

  it("lays the mattress cells last, index 0 then index 1, through tentCellAt", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const cells = tentCells(pose, PITCHED_STATE);
        const expected = ([0, 1] as const).flatMap((index) =>
          TRAPEZOID_LAYOUT.mattresses[index].map((local) => ({
            ...tentCellAt(pose, local),
            block: { type: "mattress", index },
          })),
        );
        expect(cells.slice(-4)).toEqual(expected);
        expect(mattressCells(pose)).toEqual(expected);
      }),
    );
  });

  it("lays the same mattress cells whichever flaps are open and whether the lantern is on", () => {
    fc.assert(
      fc.property(arbPose, arbState, (pose, state) => {
        const mattresses = tentCells(pose, state).filter(
          (c) => c.block.type === "mattress",
        );
        expect(mattresses).toEqual(mattressCells(pose));
      }),
    );
  });

  it("puts each mattress's two cells next to each other along the depth at one height", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        for (const mattress of TRAPEZOID_LAYOUT.mattresses) {
          const [a, b] = mattress.map((l) => tentCellAt(pose, l));
          const [la, lb] = mattress;
          const ca = defined(a, "mattress front");
          const cb = defined(b, "mattress rear");
          expect(ca.y).toBe(cb.y);
          expect(Math.abs(ca.x - cb.x) + Math.abs(ca.z - cb.z)).toBe(1);
          expect(defined(la, "mattress front").x).toBe(
            defined(lb, "mattress rear").x,
          );
          expect(
            Math.abs(
              defined(la, "mattress front").depth -
                defined(lb, "mattress rear").depth,
            ),
          ).toBe(1);
        }
      }),
    );
  });

  it("shares no cell with any other tent cell", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        const others = new Set(
          tentCells(pose, PITCHED_STATE)
            .filter((c) => c.block.type !== "mattress")
            .map(cellKey),
        );
        for (const c of mattressCells(pose))
          expect(others.has(cellKey(c))).toBe(false);
      }),
    );
  });

  it("counts a player standing on a mattress as inside the tent", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        for (const c of mattressCells(pose))
          expect(
            insideTent(pose, { x: c.x + 0.5, y: c.y + 9 / 16, z: c.z + 0.5 }),
          ).toBe(true);
      }),
    );
  });

  it("answers the mattress of the right index from tentBlockAt", () => {
    fc.assert(
      fc.property(arbPose, (pose) => {
        for (const c of mattressCells(pose))
          expect(tentBlockAt(pose, c)).toEqual(c.block);
      }),
    );
  });
});

describe("planPitch (ADR 0131)", () => {
  const STONE: GroundReading = { typeId: "minecraft:stone", liquid: false };
  const pose: TentPose = { x: 0, y: 64, z: 0, yaw: 0 };
  const fine = (): PitchSurvey => ({
    clear: tentClearCells(pose).map(() => AIR),
    ground: tentGroundCells(pose).map(() => STONE),
    vehicleSpace: false,
    campSpace: false,
    occupants: 0,
    tents: 0,
  });
  const plant = defined([...CLEARABLE_DECORATIONS][0], "plant");

  const clearType = fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom(...CLEARABLE_DECORATIONS) },
    { weight: 1, arbitrary: fc.constant("minecraft:stone") },
    { weight: 1, arbitrary: fc.constant(undefined) },
  );
  const groundReading = fc.oneof(
    {
      weight: 1,
      arbitrary: fc.constant({ typeId: "minecraft:water", liquid: true }),
    },
    { weight: 1, arbitrary: fc.constant({ typeId: AIR, liquid: false }) },
    {
      weight: 1,
      arbitrary: fc
        .constantFrom(...CLEARABLE_DECORATIONS)
        .map((typeId) => ({ typeId, liquid: false })),
    },
    { weight: 1, arbitrary: fc.constant(undefined) },
    {
      weight: 2,
      arbitrary: fc.constant({ typeId: "minecraft:sand", liquid: false }),
    },
  );
  // Mostly air over stone, with a few cells changed, so every rule gets its turn.
  const edits = <T>(value: fc.Arbitrary<T>, length: number) =>
    fc.array(fc.tuple(fc.nat({ max: length - 1 }), value), { maxLength: 4 });
  const arbSurvey: fc.Arbitrary<PitchSurvey> = fc
    .record({
      clear: edits(clearType, tentClearCells(pose).length),
      ground: edits(groundReading, tentGroundCells(pose).length),
      vehicleSpace: fc.boolean(),
      campSpace: fc.boolean(),
      occupants: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 3 })),
      tents: fc.integer({ min: 0, max: TENT_SPEC.maxTents + 1 }),
    })
    .map((r) => {
      const clear: (string | undefined)[] = Array(
        tentClearCells(pose).length,
      ).fill(AIR);
      for (const [i, v] of r.clear) clear[i] = v;
      const ground: (GroundReading | undefined)[] = Array(
        tentGroundCells(pose).length,
      ).fill(STONE);
      for (const [i, v] of r.ground) ground[i] = v;
      return { ...r, clear, ground };
    });

  it("refuses for the first rule that fails, and otherwise clears the decorations from the top down", () => {
    fc.assert(
      fc.property(arbPose, arbSurvey, (p, survey) => {
        const isClear = (t: string | undefined) =>
          t === AIR || (t !== undefined && CLEARABLE_DECORATIONS.has(t));
        const isGround = (g: GroundReading | undefined) =>
          g !== undefined &&
          g.typeId !== AIR &&
          !g.liquid &&
          !CLEARABLE_DECORATIONS.has(g.typeId);
        const expected =
          survey.tents >= TENT_SPEC.maxTents
            ? "limit"
            : survey.vehicleSpace
              ? "vehicle"
              : survey.occupants > 0
                ? "crowded"
                : survey.campSpace || !survey.clear.every(isClear)
                  ? "blocked"
                  : !survey.ground.every(isGround)
                    ? "ground"
                    : undefined;
        const plan = planPitch(p, survey);
        if (expected !== undefined) {
          expect(plan).toEqual({ ok: false, reason: expected });
          return;
        }
        if (!plan.ok) throw new Error(`refused: ${plan.reason}`);
        const cells = tentClearCells(p);
        const decorated = cells.filter((_, i) => survey.clear[i] !== AIR);
        expect(new Set(plan.clearTopFirst.map(cellKey))).toEqual(
          new Set(decorated.map(cellKey)),
        );
        expect(plan.clearTopFirst).toHaveLength(decorated.length);
        for (let i = 1; i < plan.clearTopFirst.length; i++)
          expect(defined(plan.clearTopFirst[i], "cell").y).toBeLessThanOrEqual(
            defined(plan.clearTopFirst[i - 1], "cell").y,
          );
      }),
    );
  });

  it("pitches on flat stone with nothing in the way", () => {
    expect(planPitch(pose, fine())).toEqual({ ok: true, clearTopFirst: [] });
  });

  it("refuses a fifth tent", () => {
    expect(planPitch(pose, { ...fine(), tents: 4 })).toEqual({
      ok: false,
      reason: "limit",
    });
  });

  it("refuses vehicle space", () => {
    expect(planPitch(pose, { ...fine(), vehicleSpace: true })).toEqual({
      ok: false,
      reason: "vehicle",
    });
  });

  it("refuses another tent's camp space, even where it reads as air", () => {
    expect(planPitch(pose, { ...fine(), campSpace: true })).toEqual({
      ok: false,
      reason: "blocked",
    });
  });

  it("refuses with someone in the footprint", () => {
    expect(planPitch(pose, { ...fine(), occupants: 1 })).toEqual({
      ok: false,
      reason: "crowded",
    });
  });

  it("refuses a step in the footprint", () => {
    const clear = [...fine().clear];
    clear[40] = "minecraft:stone";
    expect(planPitch(pose, { ...fine(), clear })).toEqual({
      ok: false,
      reason: "blocked",
    });
  });

  it("refuses a hole under the footprint", () => {
    const ground = [...fine().ground];
    ground[10] = { typeId: AIR, liquid: false };
    expect(planPitch(pose, { ...fine(), ground })).toEqual({
      ok: false,
      reason: "ground",
    });
  });

  it("clears grass in the footprint, top first", () => {
    const clear = [...fine().clear];
    clear[0] = plant;
    clear[1] = plant;
    const plan = planPitch(pose, { ...fine(), clear });
    const cells = tentClearCells(pose);
    expect(plan).toEqual({
      ok: true,
      clearTopFirst: [cells[1], cells[0]],
    });
  });
});
