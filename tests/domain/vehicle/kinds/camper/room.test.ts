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
import {
  DECOR_CELLS,
  DECOR_SLOTS,
} from "../../../../../src/domain/vehicle/kinds/camper/decor";
import {
  CABINET_DOORS,
  type CabinetDoor,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import { CAMPER_PROFILE } from "../../../../../src/domain/vehicle/kinds/camper/profile";
import {
  AIR,
  CLEARABLE_DECORATIONS,
  cabinetCells,
  cargoCells,
  deckSeats,
  decorBlockName,
  decorCells,
  decorSlotCell,
  departure,
  exitCells,
  furnitureCells,
  holdsCargo,
  ownSlotBlock,
  parkCheckCells,
  parkPose,
  planPark,
  roomCells,
  slotCells,
  snapYaw,
  wallFootCells,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { seatSlotCell } from "../../../../../src/domain/vehicle/kinds/camper/seatPress";
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
// At most one placement per slot cell, as the drive keeps it (ADR 0107).
const decor = fc
  .subarray([...DECOR_CELLS])
  .chain((cells) =>
    fc.tuple(
      ...cells.map(({ slots }) =>
        fc
          .tuple(
            fc.constantFrom(...slots),
            fc.constantFrom("potted_plant", "percolator", "cushion"),
          )
          .map(([s, item]) => ({ slot: s.id, item })),
      ),
    ),
  );
const itemId = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/);
const openDoors = fc
  .subarray(CABINET_DOORS.map(({ door }) => door))
  .map((doors) => new Set<CabinetDoor>(doors));
const slotOf = (id: string) =>
  defined(
    DECOR_SLOTS.find((s) => s.id === id),
    id,
  );
// The wall cabinet's compartments are laid by cabinetCells, full or empty (ADR 0114).
const outsideCabinet = <T extends { slot: string }>(placements: readonly T[]) =>
  placements.filter((e) => slotOf(e.slot).door === undefined);
const isCabinetCell = (cell: { x: number; z: number; layer: number }) =>
  CABINET_DOORS.some(
    (d) =>
      d.cell.x === cell.x && d.cell.z === cell.z && d.cell.layer === cell.layer,
  );

it("lays 105 distinct integer cells with the specified counts at any snapped pose, an open cabinet door's plate in place of a ceiling cell and the open shower door's wall in place of a wall (ADR 0068, 0114, 0118)", () => {
  fc.assert(
    fc.property(
      location,
      yaw,
      fc.boolean(),
      openDoors,
      fc.boolean(),
      (at, angle, open, cabinets, showerOpen) => {
        const p = parkPose(at, angle);
        expect(p).toEqual({
          x: Math.floor(at.x) + 0.5,
          y: Math.floor(at.y + 0.01),
          z: Math.floor(at.z) + 0.5,
          yaw: snapYaw(angle),
        });
        const cells = roomCells(p, open, cabinets, showerOpen);
        expect(cells).toHaveLength(105);
        expect(new Set(cells.map(cellKey)).size).toBe(105);
        expect(
          Object.fromEntries(
            [
              "floor",
              "ceiling",
              "wall",
              "door",
              "deck",
              "bed",
              "showerToilet",
              "cabinetDoor",
              "showerDoor",
            ].map((type) => [
              type,
              cells.filter((c) => c.block.type === type).length,
            ]),
          ),
        ).toEqual({
          floor: 21,
          ceiling: 19 - cabinets.size,
          wall: showerOpen ? 54 : 57,
          door: 3,
          deck: 1,
          bed: 2,
          showerToilet: 2,
          cabinetDoor: cabinets.size,
          showerDoor: showerOpen ? 3 : 0,
        });
        for (const c of cells)
          expect([c.x, c.y, c.z].every(Number.isInteger)).toBe(true);
      },
    ),
  );
});

it("makes the rear wall cells behind the aisle beside the shower-toilet selectable while its door is open, with the wall's face, and changes nothing else (ADR 0118)", () => {
  fc.assert(
    fc.property(pose, fc.boolean(), openDoors, (p, open, cabinets) => {
      const shut = roomCells(p, open, cabinets, false);
      const opened = roomCells(p, open, cabinets, true);
      expect(opened.map(cellKey)).toEqual(shut.map(cellKey));
      const f = forward(p.yaw);
      const step = { x: Math.round(f.x) + 0, z: Math.round(f.z) + 0 };
      const left = leftOf(step);
      const showerToilet = shut.filter((c) => c.block.type === "showerToilet");
      // From the shower-toilet one cell left into the aisle, then one back into the rear wall.
      const behind = new Set(
        [1, 2, 3].map((layer) => {
          const st = defined(showerToilet[0], "shower-toilet cell");
          return cellKey({
            x: st.x + left.x - step.x,
            y: p.y + layer,
            z: st.z + left.z - step.z,
          });
        }),
      );
      shut.forEach((before, i) => {
        const after = defined(opened[i], "opened cell");
        if (!behind.has(cellKey(before))) {
          expect(after).toEqual(before);
          return;
        }
        expect(before.block.type).toBe("wall");
        expect(after.block).toEqual({
          type: "showerDoor",
          face: (before.block as { face: number }).face,
        });
      });
      expect(opened.filter((c) => c.block.type === "showerDoor")).toHaveLength(
        3,
      );
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

it("covers the interior and the roof exactly once with cargo cells, slot cells, and furniture block cells (ADR 0093, 0097, 0098)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const blocks = roomCells(p, false).filter(
        (c) => c.block.type === "bed" || c.block.type === "showerToilet",
      );
      const cargo = cargoCells(p);
      const cargoKeys = new Set(cargo.map(cellKey));
      for (const key of blocks.map(cellKey))
        expect(cargoKeys.has(key)).toBe(false);
      // The wall cabinet's two slot cells are in the ceiling layer, not the interior (ADR 0114).
      const slots = slotCells(p).filter((c) => c.y - p.y !== 3);
      expect(slotCells(p).length - slots.length).toBe(2);
      const all = [...cargo, ...slots, ...blocks];
      expect(all).toHaveLength(63);
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

it("checks 168 unique cells including the room and keeps all 49 cargo cells outside its blocks and slots (ADR 0097, 0098)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const room = new Set(roomCells(p, false).map(cellKey));
      const check = parkCheckCells(p).map(cellKey);
      expect(check).toHaveLength(168);
      expect(new Set(check).size).toBe(168);
      for (const c of room) expect(check).toContain(c);
      const cargo = cargoCells(p).map(cellKey);
      expect(cargo).toHaveLength(49);
      expect(new Set(cargo).size).toBe(49);
      expect(cargo.some((c) => room.has(c))).toBe(false);
      for (const key of slotCells(p).map(cellKey)) {
        expect(room.has(key)).toBe(false);
        expect(cargo).not.toContain(key);
        expect(check).toContain(key);
      }
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

it("puts a deck seat at each profile seat with the measured rises, then the compact toilet seat (ADR 0095)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const seats = deckSeats(p);
      const world = seatWorldPositions(p, CAMPER_PROFILE.seats.positions);
      expect(seats).toHaveLength(5);
      seats.slice(0, 4).forEach((s, i) => {
        expect(s).not.toHaveProperty("compact");
        expect(s.x).toBe(world[i]?.x);
        expect(s.z).toBe(world[i]?.z);
        expect(s.y).toBeCloseTo(
          p.y + defined([0.98, 0.98, 0.68, 0.68][i], "rise"),
        );
      });
      const toilet = defined(seats[4], "toilet seat");
      const at = defined(
        seatWorldPositions(
          p,
          defined(CAMPER_PROFILE.parkedSeats, "parked seats").positions,
        )[0],
        "toilet position",
      );
      expect(toilet.x).toBe(at.x);
      expect(toilet.z).toBe(at.z);
      expect(toilet.y).toBeCloseTo(p.y + 0.68);
      expect(toilet.compact).toBe(true);
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
        const roof = defined(cargoCells(p).slice(28)[index], "roof cell");
        expect(roof.y - p.y).toBe(4);
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

it("lists the seventeen decor slots with distinct ids (ADR 0093, 0103, 0105, 0108, 0112, 0114)", () => {
  expect(DECOR_SLOTS).toHaveLength(17);
  expect(new Set(DECOR_SLOTS.map((s) => s.id))).toEqual(
    new Set([
      "dashboard_center",
      "dashboard_left",
      "table",
      "table_aisle",
      "dinette_front",
      "dinette_rear",
      "shelf_low",
      "shelf_low_front",
      "shelf_high",
      "shelf_high_front",
      "stove",
      "counter",
      "ceiling_hook",
      "cabinet_sink_rear",
      "cabinet_sink_front",
      "cabinet_stove_rear",
      "cabinet_stove_front",
    ]),
  );
});

it("lays each decor at its slot's cell, the yaw quarter, the slot height, and the slot's spot, or as its end of a pair block (ADR 0093, 0105, 0108)", () => {
  fc.assert(
    fc.property(pose, decor, (p, all) => {
      const d = outsideCabinet(all);
      const cells = decorCells(p, all);
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
        // + 0 because a zero axis times a negative offset is -0, which toBe rejects.
        expect(dot(at, l) + 0).toBe(slot.cell.x);
        expect(dot(at, f) + 0).toBe(slot.cell.z);
        expect(c.y).toBe(p.y + slot.cell.layer);
        expect(c.block).toEqual(
          slot.pair
            ? {
                type: "decorPair",
                pair: slot.pair.kind,
                face: decorFace(p.yaw),
                height: slot.height,
                [`end${slot.pair.end}`]: item,
              }
            : {
                type: "decor",
                item,
                face: decorFace(p.yaw),
                height: slot.height,
                spot: slot.spot ?? 0,
              },
        );
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

it("lays a furniture block in every slot cell without decor but the cabinet's and none in a cargo, room, or shower-toilet cell (ADR 0097, 0105, 0114)", () => {
  fc.assert(
    fc.property(pose, decor, (p, d) => {
      const furniture = furnitureCells(p, d);
      expect(furniture).toHaveLength(
        DECOR_CELLS.filter(({ cell }) => !isCabinetCell(cell)).length -
          outsideCabinet(d).length,
      );
      const laid = [
        ...decorCells(p, d),
        ...furniture,
        ...cabinetCells(p, d, new Set()),
      ].map(cellKey);
      expect(new Set(laid).size).toBe(laid.length);
      expect(new Set(laid)).toEqual(new Set(slotCells(p).map(cellKey)));
      const cargo = new Set(cargoCells(p).map(cellKey));
      const room = new Set(roomCells(p, false).map(cellKey));
      const exact = forward(p.yaw);
      const f = { x: Math.round(exact.x) + 0, z: Math.round(exact.z) + 0 };
      const left = leftOf(f);
      const l = { x: left.x + 0, z: left.z + 0 };
      for (const c of furniture) {
        const slot = defined(
          DECOR_SLOTS.find((s) => cellKey(decorSlotCell(p, s)) === cellKey(c)),
          "slot at furniture cell",
        );
        expect(c.block).toEqual({
          type: "furniture",
          height: slot.hanging ? 0 : slot.height,
        });
        expect(cargo.has(cellKey(c))).toBe(false);
        expect(room.has(cellKey(c))).toBe(false);
        const at = { x: c.x - Math.floor(p.x), z: c.z - Math.floor(p.z) };
        expect(dot(at, l) + 0 === -1 && dot(at, f) + 0 === -3).toBe(false);
      }
    }),
  );
});

it("lists each slot cell once, in the order of its first slot (ADR 0097, 0105)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const cells = DECOR_SLOTS.map((s) => decorSlotCell(p, s));
      expect(slotCells(p)).toEqual(
        cells.filter(
          (c, i) => cells.findIndex((o) => cellKey(o) === cellKey(c)) === i,
        ),
      );
    }),
  );
});

it("lays the stove's furniture block once, at its burner's height, while the stove holds no decor (ADR 0107, 0112)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const stove = defined(
        DECOR_SLOTS.find((s) => s.id === "stove"),
        "stove",
      );
      const at = cellKey(decorSlotCell(p, stove));
      const empty = furnitureCells(p, []).filter((c) => cellKey(c) === at);
      expect(empty.map((c) => c.block)).toEqual([
        { type: "furniture", height: 15 },
      ]);
      const held = [{ slot: "stove", item: "saucepan" }];
      expect(furnitureCells(p, held).some((c) => cellKey(c) === at)).toBe(
        false,
      );
    }),
  );
});

it("lets a slot cell hold only air, the furniture block, or the block its decor lays (ADR 0097, 0108)", () => {
  fc.assert(
    fc.property(itemId, itemId, (item, other) => {
      fc.pre(item !== other);
      for (const name of [`${item}_decor`, undefined]) {
        expect(ownSlotBlock(AIR, name)).toBe(true);
        expect(ownSlotBlock("yasu_ride:camper_furniture", name)).toBe(true);
        expect(ownSlotBlock(undefined, name)).toBe(false);
        expect(ownSlotBlock("minecraft:stone", name)).toBe(false);
        expect(ownSlotBlock(`yasu_ride:${other}_decor`, name)).toBe(false);
        expect(ownSlotBlock(`yasu_ride:${item}_decor`, name)).toBe(
          name !== undefined,
        );
      }
    }),
  );
});

it("names the block a cell's decor lays: the pair block on a shelf board or the table, else the item's decor block, and the cabinet block in a cabinet cell even when empty (ADR 0093, 0108, 0114)", () => {
  fc.assert(
    fc.property(decor, (d) => {
      for (const { cell, slots } of DECOR_CELLS) {
        const placed = d.find((e) => slots.some((s) => s.id === e.slot));
        const pair = slots[0]?.pair;
        expect(decorBlockName(cell, d)).toBe(
          isCabinetCell(cell)
            ? "cabinet_decor_pair"
            : placed === undefined
              ? undefined
              : pair
                ? `${pair.kind}_decor_pair`
                : `${placed.item}_decor`,
        );
      }
    }),
  );
});

it("puts each dinette deck seat under its dinette slot, the first slot cell from the seat's cell up, and no other deck seat under a slot (ADR 0097)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const slots = new Map(
        DECOR_SLOTS.map((s) => [cellKey(decorSlotCell(p, s)), s.id]),
      );
      const firstSlotAbove = (seat: { x: number; y: number; z: number }) => {
        const cell = seatSlotCell(seat, (c) => slots.has(cellKey(c)));
        return cell === undefined ? undefined : slots.get(cellKey(cell));
      };
      expect(deckSeats(p).map(firstSlotAbove)).toEqual([
        undefined,
        undefined,
        "dinette_front",
        "dinette_rear",
        undefined,
      ]);
    }),
  );
});

it("lays the shower-toilet block in both shower-toilet cells with its plate toward the aisle (ADR 0098)", () => {
  const faceOf = (v: { x: number; z: number }) => {
    if (v.z !== 0) return v.z < 0 ? 0 : 1;
    return v.x < 0 ? 2 : 3;
  };
  fc.assert(
    fc.property(pose, (p) => {
      const cells = roomCells(p, false).filter(
        (c) => c.block.type === "showerToilet",
      );
      const exact = forward(p.yaw);
      const f = { x: Math.round(exact.x) + 0, z: Math.round(exact.z) + 0 };
      const left = leftOf(f);
      const l = { x: left.x + 0, z: left.z + 0 };
      expect(cells).toHaveLength(2);
      for (const c of cells) {
        const d = { x: c.x - Math.floor(p.x), z: c.z - Math.floor(p.z) };
        expect(dot(d, l)).toBe(-1);
        expect(dot(d, f)).toBe(-3);
        expect(c.block).toEqual({ type: "showerToilet", face: faceOf(l) });
      }
      expect(cells.map((c) => c.y)).toEqual([p.y + 1, p.y + 2]);
      const cargo = new Set(cargoCells(p).map(cellKey));
      for (const c of cells) expect(cargo.has(cellKey(c))).toBe(false);
    }),
  );
});

it("makes the wall cabinet cells cargo cells (ADR 0103)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const exact = forward(p.yaw);
      const f = { x: Math.round(exact.x) + 0, z: Math.round(exact.z) + 0 };
      const left = leftOf(f);
      const l = { x: left.x + 0, z: left.z + 0 };
      const cargo = new Set(cargoCells(p).map(cellKey));
      const slots = new Set(slotCells(p).map(cellKey));
      for (const z of [-1, -2]) {
        const key = cellKey({
          x: Math.floor(p.x) - l.x + z * f.x,
          y: p.y + 2,
          z: Math.floor(p.z) - l.z + z * f.z,
        });
        expect(cargo.has(key)).toBe(true);
        expect(slots.has(key)).toBe(false);
      }
    }),
  );
});

it("puts the toilet seat inside the shower-toilet cell at the rear right at every parked pose (ADR 0095)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const toilet = defined(
        CAMPER_PROFILE.parkedSeats?.positions[0],
        "toilet position",
      );
      const seat = defined(deckSeats(p)[4], "toilet seat");
      const offset = { x: seat.x - p.x, z: seat.z - p.z };
      const facing = forward(p.yaw);
      const right = dot(offset, rightOf(facing));
      const front = dot(offset, facing);
      expect(right).toBeCloseTo(-toilet.x);
      expect(right).toBeGreaterThanOrEqual(0.5);
      expect(right).toBeLessThanOrEqual(1.5);
      expect(front).toBeCloseTo(toilet.z);
      expect(front).toBeGreaterThanOrEqual(-3.5);
      expect(front).toBeLessThanOrEqual(-2.5);
    }),
  );
});

it("stands each deck seat's rider up on the floor of an open aisle cell beside the seat (ADR 0109)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const open = new Set(cargoCells(p).map(cellKey));
      const floor = new Set(
        roomCells(p, false)
          .filter((c) => c.block.type === "floor")
          .map(cellKey),
      );
      const facing = forward(p.yaw);
      const left = leftOf(facing);
      const aisleZ = deckSeats(p).map((seat) => {
        const stand = defined(seat.stand, "stand spot");
        const feet = {
          x: Math.floor(stand.x),
          y: stand.y,
          z: Math.floor(stand.z),
        };
        // Feet at the floor top, in the middle of the cell.
        expect(stand.y).toBe(p.y + 1);
        expect(stand.x - feet.x).toBe(0.5);
        expect(stand.z - feet.z).toBe(0.5);
        expect(floor.has(cellKey({ ...feet, y: feet.y - 1 }))).toBe(true);
        expect(open.has(cellKey(feet))).toBe(true);
        expect(open.has(cellKey({ ...feet, y: feet.y + 1 }))).toBe(true);
        const offset = { x: stand.x - p.x, z: stand.z - p.z };
        expect(dot(offset, left)).toBeCloseTo(0);
        // A step from the seat, not across the room.
        expect(
          Math.hypot(stand.x - seat.x, stand.z - seat.z),
        ).toBeLessThanOrEqual(1.5);
        return Math.round(dot(offset, facing));
      });
      expect(aisleZ).toEqual([2, 2, 1, -1, -3]);
    }),
  );
});

it("puts every stand spot inside the box departure seats standing players from (ADR 0068, 0109)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const inside = defined(departure(p).boxes[0], "inside box");
      for (const seat of deckSeats(p))
        expect(inBox(inside, defined(seat.stand, "stand spot"))).toBe(true);
    }),
  );
});

it("lays the cabinet blocks over the sink and the stove in the ceiling layer, in place of the ceiling, and each open door's plate on its hinge side of the aisle cell beside it (ADR 0114)", () => {
  const faceOf = (v: { x: number; z: number }) => {
    if (v.z !== 0) return v.z < 0 ? 0 : 1;
    return v.x < 0 ? 2 : 3;
  };
  fc.assert(
    fc.property(pose, openDoors, (p, open) => {
      const exact = forward(p.yaw);
      const f = { x: Math.round(exact.x) + 0, z: Math.round(exact.z) + 0 };
      const left = leftOf(f);
      const l = { x: left.x + 0, z: left.z + 0 };
      const at = (x: number, z: number, layer: number) => ({
        x: Math.floor(p.x) + x * l.x + z * f.x,
        y: p.y + layer,
        z: Math.floor(p.z) + x * l.z + z * f.z,
      });
      const room = roomCells(p, false, open);
      const byKey = new Map(room.map((c) => [cellKey(c), c.block]));
      const cabinets = cabinetCells(p, [], open).map(cellKey);
      expect(cabinets).toEqual([-1, -2].map((z) => cellKey(at(-1, z, 3))));
      for (const key of cabinets) expect(byKey.has(key)).toBe(false);
      for (const { door, aisle, hinge } of CABINET_DOORS) {
        const block = byKey.get(cellKey(at(aisle.x, aisle.z, aisle.layer)));
        expect(block).toEqual(
          open.has(door)
            ? {
                type: "cabinetDoor",
                face: faceOf({ x: hinge * f.x, z: hinge * f.z }),
              }
            : { type: "ceiling" },
        );
      }
      expect(new Set(slotCells(p).map(cellKey))).toEqual(
        new Set([
          ...DECOR_CELLS.filter(({ cell }) => !isCabinetCell(cell)).map(
            ({ cell }) => cellKey(at(cell.x, cell.z, cell.layer)),
          ),
          ...cabinets,
        ]),
      );
    }),
  );
});

it("lets a cabinet cell hold air, the furniture block, or the cabinet block when the camper departs (ADR 0114)", () => {
  for (const { cell } of CABINET_DOORS) {
    const name = decorBlockName(cell, []);
    expect(ownSlotBlock("yasu_ride:cabinet_decor_pair", name)).toBe(true);
    expect(ownSlotBlock(AIR, name)).toBe(true);
    expect(ownSlotBlock("yasu_ride:camper_ceiling", name)).toBe(false);
    expect(ownSlotBlock("minecraft:stone", name)).toBe(false);
  }
});
