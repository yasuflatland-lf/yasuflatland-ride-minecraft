import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CAMPER_ENTITY } from "../../../src/domain/vehicle/kinds/camper/entity";
import { KITCHEN_DRAWERS } from "../../../src/domain/vehicle/kinds/camper/furniture";
import {
  COUNTER_HEIGHT,
  DRAWER_SLIDE_PX,
  DRAWER_WALL_PX,
  DRAWER_HIT_PROFILE as HIT,
  PX_PER_BLOCK,
} from "../../../src/domain/vehicle/kinds/camper/spec";
import { STANDING_GEAR_IDS } from "../../../src/domain/vehicle/kinds/index";
import { PAIR_PAGE_SIZE } from "../../../src/infrastructure/vehicle/kinds/camper/identifiers";
import { defined } from "../../support/defined";
import { bone, type Cube, cubeCenter, end, RP, slotXZ } from "./helpers";

// A player's 0.6-block width must fit the aisle even at full extension.
const PLAYER_WIDTH_PX = 9.6;
const DINETTE_EDGE_X = 8;
const animations = JSON.parse(
  readFileSync(`${RP}/animations/yasu_ride/camper.anim.json`, "utf8"),
).animations;
const properties = JSON.parse(
  readFileSync("packs/yasu_ride_bp/entities/yasu_ride/camper.se.json", "utf8"),
)["minecraft:entity"].description.properties;
const fixture = JSON.parse(
  readFileSync("tests/packs/fixtures/camper-cubes/kitchen_fronts.json", "utf8"),
) as [string, number[], number[]][];

function position(drawer: string, progress: number): number[] {
  const channels =
    animations[`animation.yasu_ride.camper.${drawer}`]?.bones[drawer];
  expect(channels).toBeDefined();
  return (channels.position as unknown[]).map((value) => {
    if (value === 0) return 0;
    const expression = String(value).replace(
      `q.property('yasu_ride:${drawer}')`,
      String(progress),
    );
    const match = /^(\d+(?:\.\d+)?(?:e-\d+)?) \* (\d+(?:\.\d+)?)$/.exec(
      expression,
    );
    if (!match) throw new Error(`Unexpected drawer expression: ${expression}`);
    return Number(match[1]) * Number(match[2]);
  });
}

function pose(cubes: Cube[], offset: number[]): Cube[] {
  // As in suvFold, positive animation x adds to geometry x, toward the aisle.
  return cubes.map((cube) => ({
    ...cube,
    origin: cube.origin.map(
      (value, axis) => value + defined(offset[axis], "offset"),
    ),
  }));
}

function clearance(cubes: Cube[]): number {
  return (
    DINETTE_EDGE_X -
    Math.max(
      ...cubes.map(
        (cube) => defined(cube.origin[0], "x") + defined(cube.size[0], "width"),
      ),
    )
  );
}

describe("camper drawer poses", () => {
  it("keeps the empty counter selection at its surface and extends it only for counter decor", () => {
    const block = JSON.parse(
      readFileSync(
        "packs/yasu_ride_bp/blocks/yasu_ride/drawers_decor_pair.block.json",
        "utf8",
      ),
    )["minecraft:block"];
    const base = block.components["minecraft:selection_box"];
    expect(base).toEqual({
      origin: [-8, 0, -8],
      size: [16, COUNTER_HEIGHT, 16],
    });
    expect(base.size[0] / 2).toBe(HIT.counterHalfWidth);
    expect(base.size[2] / 2).toBe(HIT.counterHalfWidth);
    const permutations = block.permutations as {
      condition: string;
      components: Record<string, unknown>;
    }[];
    const selection = permutations.filter(
      (p) => p.components["minecraft:selection_box"],
    );
    expect(selection).toEqual([
      {
        condition:
          "!(q.block_state('yasu_ride:counter_page') == 0 && q.block_state('yasu_ride:counter_item') == 0)",
        components: {
          "minecraft:selection_box": {
            origin: [-8, 0, -8],
            size: [16, 16, 16],
          },
        },
      },
    ]);
    const visibility = block.components["minecraft:geometry"].bone_visibility;
    for (const [index, item] of STANDING_GEAR_IDS.entries()) {
      const code = index + 1;
      expect(visibility[`counter_${item}`]).toBe(
        `q.block_state('yasu_ride:counter_page') == ${Math.floor(code / PAIR_PAGE_SIZE)} && q.block_state('yasu_ride:counter_item') == ${code % PAIR_PAGE_SIZE}`,
      );
    }
    for (const face of block.description.states["yasu_ride:face"]) {
      expect(
        permutations.find(
          (p) => p.condition === `q.block_state('yasu_ride:face') == ${face}`,
        )?.components,
      ).toHaveProperty("minecraft:transformation");
    }
  });

  it("declares seventeen properties within Bedrock's limit", () => {
    expect(Object.keys(properties)).toHaveLength(17);
    // Headlights belong to the core, outside the camper kind's contract.
    expect(Object.keys(properties).sort()).toEqual(
      [
        ...Object.keys(CAMPER_ENTITY.properties).map(
          (name) => `yasu_ride:${name}`,
        ),
        "yasu_ride:headlights",
      ].sort(),
    );
    expect(Object.keys(properties).length).toBeLessThanOrEqual(32);
  });

  for (const [drawer, y] of [
    ["drawer_top", 22.65],
    ["drawer_bottom", 17.25],
  ] as const) {
    it(`keeps ${drawer}'s virtual front and open content centre aligned with its model`, () => {
      const cubes = defined(bone(drawer).cubes, "drawer cubes");
      const front = defined(cubes[0], "front cube");
      const floor = defined(
        cubes.find((cube) => cube.size[1] === DRAWER_WALL_PX),
        "floor cube",
      );
      const door = defined(
        KITCHEN_DRAWERS.doors.find((door) => door.id === drawer),
        "drawer door",
      );
      const slot = defined(door.slots[0], "drawer slot");
      const centre = slotXZ(slot);
      // Room left follows model x; ahead negates model z relative to the cell center.
      expect(defined(front.origin[0], "front x") - centre.x).toBeCloseTo(
        HIT.frontLeftMin,
        6,
      );
      expect(end(front, 0) - centre.x).toBeCloseTo(HIT.frontLeftMax, 6);
      expect(-(end(front, 2) - centre.z)).toBeCloseTo(HIT.frontAheadMin, 6);
      expect(-(defined(front.origin[2], "front z") - centre.z)).toBeCloseTo(
        HIT.frontAheadMax,
        6,
      );
      expect(
        defined(front.origin[1], "front y") - slot.cell.layer * PX_PER_BLOCK,
      ).toBeCloseTo(HIT.frontBottom[drawer], 6);
      expect(front.size[1]).toBeCloseTo(HIT.frontHeight, 6);
      expect(cubeCenter(floor, 0) + DRAWER_SLIDE_PX - centre.x).toBeCloseTo(
        HIT.contentLeft,
        6,
      );
      expect(-(cubeCenter(floor, 2) - centre.z)).toBeCloseTo(
        HIT.contentAhead,
        6,
      );
    });

    it(`syncs ${drawer} as closed by default with gameplay restoration`, () => {
      expect(CAMPER_ENTITY.properties[drawer]).toEqual({
        type: "float",
        range: [0, 1],
      });
      expect(properties[`yasu_ride:${drawer}`]).toEqual({
        type: "float",
        range: [0, 1],
        default: 0,
        client_sync: true,
      });
      expect(CAMPER_ENTITY.restored).toContain(drawer);
    });

    it(`preserves ${drawer}'s geometry and translates its front into the aisle`, () => {
      const model = bone(drawer);
      const cubes = defined(model.cubes, "drawer cubes");
      expect(model.pivot).toEqual([-9, y, 16.45]);
      expect(model.rotation).toBeUndefined();
      expect(cubes.map((cube) => [drawer, cube.origin, cube.size])).toEqual(
        fixture.filter(([name]) => name === drawer),
      );
      const closed = pose(cubes, position(drawer, 0));
      const opened = pose(cubes, position(drawer, 1));
      expect(closed).toEqual(cubes);
      expect(clearance(closed)).toBeCloseTo(16.22);
      expect(position(drawer, 1)).toEqual([DRAWER_SLIDE_PX, 0, 0]);
      for (const [index, cube] of cubes.entries()) {
        const moved = defined(opened[index], "open cube");
        expect(
          defined(moved.origin[0], "open x") -
            defined(cube.origin[0], "closed x"),
        ).toBeCloseTo(DRAWER_SLIDE_PX);
        expect(moved.origin.slice(1)).toEqual(cube.origin.slice(1));
        expect(moved.size).toEqual(cube.size);
        expect(moved.pivot).toEqual(cube.pivot);
      }
      expect(clearance(opened)).toBeGreaterThanOrEqual(PLAYER_WIDTH_PX);
    });

    it(`keeps ${drawer}'s aisle passable and displacement monotone throughout opening`, () => {
      const cubes = defined(bone(drawer).cubes, "drawer cubes");
      const progress = fc.double({ min: 0, max: 1, noNaN: true });
      fc.assert(
        fc.property(progress, progress, (a, b) => {
          const earlier = position(drawer, Math.min(a, b));
          const later = position(drawer, Math.max(a, b));
          expect(defined(earlier[0], "earlier x")).toBeLessThanOrEqual(
            defined(later[0], "later x"),
          );
          for (const offset of [earlier, later]) {
            expect(clearance(pose(cubes, offset))).toBeGreaterThanOrEqual(
              PLAYER_WIDTH_PX,
            );
          }
        }),
      );
    });
  }
});
