import fc from "fast-check";
import { expect, it } from "vitest";
import {
  dot,
  forward,
  leftOf,
  normalizeYaw,
  rightOf,
} from "../../../../../src/domain/shared/vec";
import { decorFace } from "../../../../../src/domain/vehicle/dock/decor";
import { inBox } from "../../../../../src/domain/vehicle/dock/dock";
import { DECOR_SLOTS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import { CAMPER_PROFILE } from "../../../../../src/domain/vehicle/kinds/camper/profile";
import {
  AIR,
  CLEARABLE_DECORATIONS,
  cargoCells,
  deckSeats,
  decorCells,
  departure,
  exitCells,
  holdsCargo,
  ownDecor,
  parkCheckCells,
  parkPose,
  planPark,
  roomCells,
  showerFloorCell,
  snapYaw,
  wallFootCells,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { cellKey } from "../../../../../src/domain/vehicle/lighting/headlights";
import { seatWorldPositions } from "../../../../../src/domain/vehicle/seats";
import { defined } from "../../../../support/defined";

const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
const location = fc.record({
  x: coordinate,
  z: coordinate,
  y: fc
    .tuple(
      fc.integer({ min: -64, max: 300 }),
      fc.double({ min: 0, max: 0.009, noNaN: true }),
    )
    .map(([base, delta]) => base + delta),
});
const yaw = fc.double({ min: -720, max: 720, noNaN: true });
const pose = fc.tuple(location, yaw).map(([at, angle]) => parkPose(at, angle));
const decor = fc
  .subarray([...DECOR_SLOTS])
  .chain((slots) =>
    fc.tuple(
      ...slots.map((s) =>
        fc
          .constantFrom("potted_plant", "percolator", "cushion")
          .map((item) => ({ slot: s.id, item })),
      ),
    ),
  );
const itemId = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/);

it("lays 105 distinct integer cells with the specified counts at any snapped pose", () => {
  fc.assert(
    fc.property(location, yaw, fc.boolean(), (at, angle, open) => {
      const p = parkPose(at, angle);
      expect(p).toEqual({
        x: Math.floor(at.x) + 0.5,
        y: Math.floor(at.y + 0.01),
        z: Math.floor(at.z) + 0.5,
        yaw: snapYaw(angle),
      });
      const cells = roomCells(p, open);
      expect(cells).toHaveLength(105);
      expect(new Set(cells.map(cellKey)).size).toBe(105);
      expect(
        Object.fromEntries(
          ["floor", "ceiling", "wall", "door", "deck", "bed"].map((type) => [
            type,
            cells.filter((c) => c.block.type === type).length,
          ]),
        ),
      ).toEqual({ floor: 21, ceiling: 21, wall: 57, door: 3, deck: 1, bed: 2 });
      for (const c of cells)
        expect([c.x, c.y, c.z].every(Number.isInteger)).toBe(true);
    }),
  );
});

it("snaps to the nearest quarter turn without negative zero", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -8, max: 8 }),
      fc.double({ min: -44.899, max: 44.899, noNaN: true }),
      (k, d) => {
        expect(snapYaw(k * 90 + d)).toBe(normalizeYaw(k * 90));
        expect(Object.is(snapYaw(k * 90 + d), -0)).toBe(false);
      },
    ),
  );
});

it("rotates the set of cells and types by a quarter turn", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const key = (x: number, y: number, z: number, type: string) =>
        `${x},${y},${z},${type}`;
      const cx = Math.floor(p.x),
        cz = Math.floor(p.z);
      const rotated = roomCells(p, false).map((c) =>
        key(cx - (c.z - cz), c.y, cz + (c.x - cx), c.block.type),
      );
      expect(
        new Set(
          roomCells({ ...p, yaw: snapYaw(p.yaw + 90) }, false).map((c) =>
            key(c.x, c.y, c.z, c.block.type),
          ),
        ),
      ).toEqual(new Set(rotated));
    }),
  );
});

it("faces every plate inward and stacks the three door cells above the half step", () => {
  fc.assert(
    fc.property(pose, fc.boolean(), (p, open) => {
      const cells = roomCells(p, open);
      const directions = [
        { x: 0, z: -1 },
        { x: 0, z: 1 },
        { x: -1, z: 0 },
        { x: 1, z: 0 },
      ];
      for (const c of cells)
        if (c.block.type === "wall" || c.block.type === "door") {
          const d = defined(directions[c.block.face], "face direction");
          expect(
            (p.x - c.x - 0.5) * d.x + (p.z - c.z - 0.5) * d.z,
          ).toBeGreaterThan(0);
        }
      const doors = cells.filter((c) => c.block.type === "door");
      const first = defined(doors[0], "door");
      expect(
        doors.map((c) => [
          c.x,
          c.z,
          c.y - p.y,
          c.block.type === "door" && c.block.open,
        ]),
      ).toEqual([1, 2, 3].map((y) => [first.x, first.z, y, open]));
      expect(
        cells.find((c) => c.x === first.x && c.z === first.z && c.y === p.y)
          ?.block,
      ).toEqual({ type: "deck", height: 8 });
    }),
  );
});

it("lays the two bed cells at the rear left, one layer above the floor (ADR 0092)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const beds = roomCells(p, false).filter((c) => c.block.type === "bed");
      expect(beds).toHaveLength(2);
      const exact = forward(p.yaw);
      const f = { x: Math.round(exact.x) + 0, z: Math.round(exact.z) + 0 };
      const left = leftOf(f);
      const l = { x: left.x + 0, z: left.z + 0 };
      const along: number[] = [];
      for (const c of beds) {
        const d = { x: c.x - Math.floor(p.x), z: c.z - Math.floor(p.z) };
        expect(c.y).toBe(p.y + 1);
        expect(dot(d, l)).toBe(1);
        along.push(dot(d, f));
      }
      expect(along.sort((a, b) => a - b)).toEqual([-3, -2]);
    }),
  );
});

it("covers the interior and the roof exactly once with cargo cells and furniture block cells (ADR 0093)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const blocks = roomCells(p, false).filter((c) => c.block.type === "bed");
      const cargo = cargoCells(p);
      const cargoKeys = new Set(cargo.map(cellKey));
      for (const key of blocks.map(cellKey))
        expect(cargoKeys.has(key)).toBe(false);
      const all = [...cargo, ...blocks];
      expect(new Set(all.map(cellKey)).size).toBe(63);
      const exact = forward(p.yaw);
      const f = { x: Math.round(exact.x) + 0, z: Math.round(exact.z) + 0 };
      const left = leftOf(f);
      const l = { x: left.x + 0, z: left.z + 0 };
      for (const c of all) {
        expect([1, 2, 4].includes(c.y - p.y)).toBe(true);
        const d = { x: c.x - Math.floor(p.x), z: c.z - Math.floor(p.z) };
        expect(Math.abs(dot(d, l))).toBeLessThanOrEqual(1);
        expect(Math.abs(dot(d, f))).toBeLessThanOrEqual(3);
      }
    }),
  );
});

it("checks 168 unique cells including the room and keeps all 61 cargo cells outside its blocks", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const room = new Set(roomCells(p, false).map(cellKey));
      const check = parkCheckCells(p).map(cellKey);
      expect(check).toHaveLength(168);
      expect(new Set(check).size).toBe(168);
      for (const c of room) expect(check).toContain(c);
      const cargo = cargoCells(p).map(cellKey);
      expect(cargo).toHaveLength(61);
      expect(new Set(cargo).size).toBe(61);
      expect(cargo.some((c) => room.has(c))).toBe(false);
    }),
  );
});

it("plans only decorations, top first, and rejects any blocking or unknown cell", () => {
  fc.assert(
    fc.property(
      pose,
      fc.array(fc.constantFrom(AIR, ...CLEARABLE_DECORATIONS), {
        minLength: 168,
        maxLength: 168,
      }),
      fc.integer({ min: 0, max: 167 }),
      fc.oneof(
        fc.constant(undefined),
        fc.string().filter((t) => t !== AIR && !CLEARABLE_DECORATIONS.has(t)),
      ),
      (p, types, index, blocked) => {
        const cells = parkCheckCells(p);
        expect(
          planPark(
            cells,
            cells.map(() => AIR),
          ),
        ).toEqual([]);
        const expected = cells
          .flatMap((c, i) =>
            types[i] === AIR ? [] : [{ ...c, typeId: types[i] }],
          )
          .sort((a, b) => b.y - a.y);
        expect(planPark(cells, types)).toEqual(expected);
        const bad: (string | undefined)[] = [...types];
        bad[index] = blocked;
        expect(planPark(cells, bad)).toBeUndefined();
      },
    ),
  );
});

it("holds cargo exactly when at least one type is not air, including unknown cells", () => {
  fc.assert(
    fc.property(
      fc.array(fc.oneof(fc.string(), fc.constant(AIR), fc.constant(undefined))),
      (types) => {
        expect(holdsCargo(types)).toBe(!types.every((t) => t === AIR));
      },
    ),
  );
});

it("departs to the adjacent outside door cell facing away and encloses the floor and roof", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const out = departure(p);
      const door = defined(
        roomCells(p, false).find((c) => c.block.type === "door"),
        "door",
      );
      const dx = door.x + 0.5 - p.x,
        dz = door.z + 0.5 - p.z;
      expect(out.exit).toMatchObject({
        x: door.x + 0.5 + dx / 2,
        y: p.y,
        z: door.z + 0.5 + dz / 2,
      });
      const exit = defined(out.exit, "exit");
      const f = forward(exit.yaw);
      expect(f.x * (exit.x - p.x) + f.z * (exit.z - p.z)).toBeGreaterThan(0);
      expect(
        inBox(defined(out.boxes[0], "interior box"), { ...p, y: p.y + 1 }),
      ).toBe(true);
      expect(
        inBox(defined(out.boxes[1], "roof box"), { ...p, y: p.y + 4 }),
      ).toBe(true);
      expect(out.boxes.some((b) => inBox(b, exit))).toBe(false);
    }),
  );
});

it("checks the feet and head cells of a player standing at the exit", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const exit = defined(departure(p).exit, "exit");
      const feet = {
        x: Math.floor(exit.x),
        y: Math.floor(exit.y),
        z: Math.floor(exit.z),
      };
      expect(exitCells(p)).toEqual([feet, { ...feet, y: feet.y + 1 }]);
    }),
  );
});

it("puts four deck seats at the profile's horizontal positions and the measured rises", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const seats = deckSeats(p);
      const world = seatWorldPositions(p, CAMPER_PROFILE.seats.positions);
      expect(seats).toHaveLength(4);
      seats.forEach((s, i) => {
        expect(s.x).toBe(world[i]?.x);
        expect(s.z).toBe(world[i]?.z);
        expect(s.y).toBeCloseTo(
          p.y + defined([0.98, 0.98, 0.68, 0.68][i], "rise"),
        );
      });
    }),
  );
});

it("puts the driver's deck seat at the front right at every parked pose", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const driver = defined(deckSeats(p)[0], "driver's deck seat");
      const offset = { x: driver.x - p.x, z: driver.z - p.z };
      const facing = forward(p.yaw);
      expect(dot(offset, rightOf(facing))).toBeCloseTo(0.75);
      expect(dot(offset, facing)).toBeCloseTo(2.1);
    }),
  );
});

it("checks every roof cell and clears decorations there", () => {
  fc.assert(
    fc.property(
      pose,
      fc.integer({ min: 0, max: 20 }),
      fc.constantFrom(...CLEARABLE_DECORATIONS),
      (p, index, typeId) => {
        const roof = defined(cargoCells(p).slice(40)[index], "roof cell");
        const cells = parkCheckCells(p);
        expect(cells.map(cellKey)).toContain(cellKey(roof));
        const types = cells.map((c) =>
          cellKey(c) === cellKey(roof) ? typeId : AIR,
        );
        expect(planPark(cells, types)).toEqual([{ ...roof, typeId }]);
        expect(
          planPark(
            cells,
            types.map((t) => (t === typeId ? "minecraft:stone" : t)),
          ),
        ).toBeUndefined();
      },
    ),
  );
});

it("includes roof wall plates and supported player centers beyond their edges", () => {
  fc.assert(
    fc.property(pose, fc.constantFrom(-1, 1), (p, sign) => {
      const f = forward(p.yaw);
      const roof = defined(departure(p).boxes[1], "roof box");
      for (const [x, z, inside] of [
        [1.6, 3.6, true],
        [1.92, 3.92, true],
        [1.93, 0, false],
        [0, 3.93, false],
        [2.79, 4.79, false],
      ] as const) {
        const at = {
          x: p.x + sign * (x * f.z + z * f.x),
          z: p.z + sign * (-x * f.x + z * f.z),
          y: p.y + 4,
        };
        expect(inBox(roof, at)).toBe(inside);
      }
    }),
  );
});

it("snaps the body and floor together above low ground and down through lower snow layers", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -64, max: 300 }),
      fc.oneof(
        fc.double({ min: 0, max: 0.849999, noNaN: true }),
        fc.double({ min: 0.85, max: 0.999999, noNaN: true }),
      ),
      (base, fraction) => {
        const p = parkPose({ x: 0, y: base + fraction, z: 0 }, 0);
        const layer = base + (fraction >= 0.85 ? 1 : 0);
        expect(p.y).toBe(layer);
        expect(
          roomCells(p, false)
            .filter((c) => c.block.type === "floor")
            .every((c) => c.y === layer),
        ).toBe(true);
        expect(parkCheckCells(p).every((c) => c.y >= layer)).toBe(true);
        expect(departure(p).exit?.y).toBe(layer);
        expect(deckSeats(p)[0]?.y).toBeCloseTo(layer + 0.98);
      },
    ),
  );
});

it("clears wall-foot decorations only below a cleared matching upper half, upper first", () => {
  fc.assert(
    fc.property(
      pose,
      fc.integer({ min: 0, max: 18 }),
      fc.constantFrom(...CLEARABLE_DECORATIONS),
      fc.constantFrom(
        AIR,
        "minecraft:stone",
        "minecraft:fern",
        "minecraft:tall_grass",
      ),
      fc.boolean(),
      (p, index, plant, lowerType, upperPresent) => {
        const feet = wallFootCells(p);
        expect(feet).toHaveLength(19);
        expect(new Set(feet.map(cellKey)).size).toBe(19);
        const cells = parkCheckCells(p);
        expect(
          feet.every(
            (c) => !cells.some((checked) => cellKey(c) === cellKey(checked)),
          ),
        ).toBe(true);
        const lower = defined(feet[index], "wall foot");
        const upper = { ...lower, y: lower.y + 1 };
        expect(cells.map(cellKey)).toContain(cellKey(upper));
        const clear = defined(
          planPark(
            cells,
            cells.map((c) =>
              upperPresent && cellKey(c) === cellKey(upper) ? plant : AIR,
            ),
            feet,
            feet.map((c) => (cellKey(c) === cellKey(lower) ? lowerType : AIR)),
          ),
          "clear plan",
        );
        const lowerIndex = clear.findIndex(
          (c) => cellKey(c) === cellKey(lower),
        );
        expect(lowerIndex >= 0).toBe(upperPresent && plant === lowerType);
        for (const c of clear.filter((c) =>
          feet.some((foot) => cellKey(c) === cellKey(foot)),
        )) {
          const upperIndex = clear.findIndex(
            (u) =>
              u.x === c.x &&
              u.z === c.z &&
              u.y === c.y + 1 &&
              u.typeId === c.typeId,
          );
          expect(upperIndex).toBeGreaterThanOrEqual(0);
          expect(upperIndex).toBeLessThan(clear.indexOf(c));
        }
      },
    ),
  );
});

it("lists the twelve decor slots with distinct ids (ADR 0093)", () => {
  expect(DECOR_SLOTS).toHaveLength(12);
  expect(new Set(DECOR_SLOTS.map((s) => s.id))).toEqual(
    new Set([
      "dashboard_center",
      "dashboard_left",
      "table",
      "dinette_front",
      "dinette_rear",
      "shelf_low",
      "shelf_high",
      "stove",
      "counter",
      "wall_cabinet_front",
      "wall_cabinet_rear",
      "ceiling_hook",
    ]),
  );
});

it("lays each decor at its slot's cell, the yaw quarter, and the slot height (ADR 0093)", () => {
  fc.assert(
    fc.property(pose, decor, (p, d) => {
      const cells = decorCells(p, d);
      expect(cells).toHaveLength(d.length);
      const exact = forward(p.yaw);
      const f = { x: Math.round(exact.x) + 0, z: Math.round(exact.z) + 0 };
      const left = leftOf(f);
      const l = { x: left.x + 0, z: left.z + 0 };
      for (const [i, c] of cells.entries()) {
        const { slot: id, item } = defined(d[i], "placement");
        const slot = defined(
          DECOR_SLOTS.find((s) => s.id === id),
          "slot",
        );
        const at = { x: c.x - Math.floor(p.x), z: c.z - Math.floor(p.z) };
        expect(dot(at, l)).toBe(slot.cell.x);
        expect(dot(at, f)).toBe(slot.cell.z);
        expect(c.y).toBe(p.y + slot.cell.layer);
        expect(c.block).toEqual({
          type: "decor",
          item,
          face: decorFace(p.yaw),
          height: slot.height,
        });
      }
      expect(decorCells(p, [{ slot: "nowhere", item: "mug_pair" }])).toEqual(
        [],
      );
    }),
  );
});

it("puts no decor cell on a room cell (ADR 0093)", () => {
  const all = DECOR_SLOTS.map((s) => ({ slot: s.id, item: "potted_plant" }));
  fc.assert(
    fc.property(pose, (p) => {
      const room = new Set(roomCells(p, false).map(cellKey));
      for (const key of decorCells(p, all).map(cellKey))
        expect(room.has(key)).toBe(false);
    }),
  );
});

it("reads the camper's decor cells apart from the cargo cells (ADR 0093)", () => {
  fc.assert(
    fc.property(pose, decor, (p, d) => {
      const decorKeys = new Set(decorCells(p, d).map(cellKey));
      const all = cargoCells(p);
      const allKeys = new Set(all.map(cellKey));
      for (const key of decorKeys) expect(allKeys.has(key)).toBe(true);
      const cargo = cargoCells(p, d);
      expect(cargo).toEqual(all.filter((c) => !decorKeys.has(cellKey(c))));
      expect(cargo).toHaveLength(all.length - d.length);
    }),
  );
});

it("lets a decor cell hold only air or its own decor block (ADR 0093)", () => {
  fc.assert(
    fc.property(itemId, itemId, (item, other) => {
      fc.pre(item !== other);
      expect(ownDecor(AIR, item)).toBe(true);
      expect(ownDecor(`yasu_ride:${item}_decor`, item)).toBe(true);
      expect(ownDecor(undefined, item)).toBe(false);
      expect(ownDecor("minecraft:stone", item)).toBe(false);
      expect(ownDecor(`yasu_ride:${other}_decor`, item)).toBe(false);
    }),
  );
});

it("puts the shower floor cell under the shower-toilet at the rear right (ADR 0094)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const c = showerFloorCell(p);
      const exact = forward(p.yaw);
      const f = { x: Math.round(exact.x) + 0, z: Math.round(exact.z) + 0 };
      const left = leftOf(f);
      const l = { x: left.x + 0, z: left.z + 0 };
      const d = { x: c.x - Math.floor(p.x), z: c.z - Math.floor(p.z) };
      expect(c.y).toBe(p.y);
      expect(dot(d, l)).toBe(-1);
      expect(dot(d, f)).toBe(-3);
      expect(
        roomCells(p, false).some(
          (r) => cellKey(r) === cellKey(c) && r.block.type === "floor",
        ),
      ).toBe(true);
    }),
  );
});
