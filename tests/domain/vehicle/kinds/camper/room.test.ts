import fc from "fast-check";
import { expect, it } from "vitest";
import { forward, normalizeYaw } from "../../../../../src/domain/shared/vec";
import { inBox } from "../../../../../src/domain/vehicle/dock";
import { cellKey } from "../../../../../src/domain/vehicle/headlights";
import { CAMPER_PROFILE } from "../../../../../src/domain/vehicle/kinds/camper/profile";
import {
  AIR,
  CLEARABLE_DECORATIONS,
  cargoCells,
  deckSeats,
  departure,
  holdsCargo,
  parkCheckCells,
  parkPose,
  planPark,
  roomCells,
  snapYaw,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
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

it("lays 103 distinct integer cells with the specified counts at any snapped pose", () => {
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
      expect(cells).toHaveLength(103);
      expect(new Set(cells.map(cellKey)).size).toBe(103);
      expect(
        Object.fromEntries(
          ["floor", "ceiling", "wall", "door", "deck"].map((type) => [
            type,
            cells.filter((c) => c.block.type === type).length,
          ]),
        ),
      ).toEqual({ floor: 21, ceiling: 21, wall: 57, door: 3, deck: 1 });
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

it("checks 145 unique cells including the room and keeps all 63 cargo cells outside its blocks", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const room = new Set(roomCells(p, false).map(cellKey));
      const check = parkCheckCells(p).map(cellKey);
      expect(check).toHaveLength(145);
      expect(new Set(check).size).toBe(145);
      for (const c of room) expect(check).toContain(c);
      const cargo = cargoCells(p).map(cellKey);
      expect(cargo).toHaveLength(63);
      expect(new Set(cargo).size).toBe(63);
      expect(cargo.some((c) => room.has(c))).toBe(false);
    }),
  );
});

it("plans only decorations, top first, and rejects any blocking or unknown cell", () => {
  fc.assert(
    fc.property(
      pose,
      fc.array(fc.constantFrom(AIR, ...CLEARABLE_DECORATIONS), {
        minLength: 145,
        maxLength: 145,
      }),
      fc.integer({ min: 0, max: 144 }),
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
      const f = forward(out.exit.yaw);
      expect(
        f.x * (out.exit.x - p.x) + f.z * (out.exit.z - p.z),
      ).toBeGreaterThan(0);
      expect(
        inBox(defined(out.boxes[0], "interior box"), { ...p, y: p.y + 1 }),
      ).toBe(true);
      expect(
        inBox(defined(out.boxes[1], "roof box"), { ...p, y: p.y + 4 }),
      ).toBe(true);
      expect(out.boxes.some((b) => inBox(b, out.exit))).toBe(false);
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
        expect({ x: s.x, z: s.z }).toEqual(world[i]);
        expect(s.y).toBeCloseTo(
          p.y + defined([0.58, 0.58, 0.68, 0.68][i], "rise"),
        );
      });
    }),
  );
});
