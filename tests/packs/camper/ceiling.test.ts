import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CEILING_LIGHTS } from "../../../src/domain/vehicle/kinds/camper/furniture";
import { bone, type Cube, RP } from "./helpers";

describe("camper ceiling lights (ADR 0115)", () => {
  const PX = 16;
  // The ceiling liner's underside (tools/gen_camper.py CEIL - 0.2) and the top of a standing
  // player's head on the floor (16 px) at 1.8 blocks.
  const LINER = 60.8;
  const HEAD = 16 + 1.8 * PX;
  const lights = bone("ceiling_lights");
  const cubes = lights.cubes ?? [];
  const center = (cube: Cube, axis: number) =>
    (cube.origin[axis] ?? 0) + (cube.size[axis] ?? 0) / 2;

  it("hangs one light from the liner over each light cell of the aisle, above every head", () => {
    expect(lights.parent).toBe("body");
    expect(cubes.length).toBeGreaterThan(0);
    for (const cube of cubes) {
      expect(cube.origin[1] ?? 0).toBeGreaterThan(HEAD);
      expect((cube.origin[1] ?? 0) + (cube.size[1] ?? 0)).toBeLessThanOrEqual(
        LINER + 1e-6,
      );
    }
    // Each light's rim meets the liner, so it does not float under the ceiling.
    expect(
      cubes.filter((c) => (c.origin[1] ?? 0) + (c.size[1] ?? 0) > LINER - 1e-6),
    ).toHaveLength(CEILING_LIGHTS.length);
    // Model z is -16 times the local cell z, and the mirrored model x is minus the local x.
    const centers = new Set(
      cubes.map((c) => `${center(c, 0)},${center(c, 2)}`),
    );
    expect(centers).toEqual(
      new Set(CEILING_LIGHTS.map((c) => `${-c.x * PX + 0},${-c.z * PX}`)),
    );
    for (const cell of CEILING_LIGHTS) expect(cell.layer).toBe(2);
  });

  it("stays inside the aisle cells of its lights", () => {
    for (const cube of cubes) {
      const cell = CEILING_LIGHTS.find(
        (c) => -c.z * PX === center(cube, 2) && -c.x * PX === center(cube, 0),
      );
      expect(cell).toBeDefined();
      for (const axis of [0, 2]) {
        const mid = axis === 0 ? -(cell?.x ?? 0) * PX : -(cell?.z ?? 0) * PX;
        expect(cube.origin[axis] ?? 0).toBeGreaterThanOrEqual(mid - PX / 2);
        expect(
          (cube.origin[axis] ?? 0) + (cube.size[axis] ?? 0),
        ).toBeLessThanOrEqual(mid + PX / 2);
      }
    }
  });

  it("keeps the ceiling lenses on the unlit material in the base pass", () => {
    const entries: Record<string, string>[] = camperRender.materials;
    expect(entries).toContainEqual({
      ceiling_lights: "Material.lamp",
    });
    const property = JSON.parse(
      readFileSync(
        "packs/yasu_ride_bp/entities/yasu_ride/camper.se.json",
        "utf8",
      ),
    )["minecraft:entity"].description.properties["yasu_ride:ceiling_lights"];
    expect(property).toEqual({
      type: "bool",
      default: false,
      client_sync: true,
    });
  });
});

const camperRender = JSON.parse(
  readFileSync(`${RP}/render_controllers/yasu_ride/camper.rc.json`, "utf8"),
).render_controllers["controller.render.yasu_ride.camper"];
