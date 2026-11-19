import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path =
  "packs/yasu_ride_rp/particles/yasu_ride/exhaust_smoke.particle.json";
const particle = () => JSON.parse(readFileSync(path, "utf8")).particle_effect;

describe("exhaust smoke particle", () => {
  it("uses the namespaced identifier and emits one world-space puff", () => {
    const effect = particle();
    expect(effect.description.identifier).toBe("yasu_ride:exhaust_smoke");
    expect(
      effect.components["minecraft:emitter_rate_instant"].num_particles,
    ).toBe(1);
    expect(effect.components["minecraft:emitter_lifetime_once"]).toBeDefined();
    expect(effect.components["minecraft:emitter_local_space"]).toBeUndefined();
  });

  it("launches rearward and slightly down before drifting upward with low drag", () => {
    const components = particle().components;
    const direction = components["minecraft:emitter_shape_point"].direction;
    expect(direction).toHaveLength(3);
    expect(direction[1]).toBeLessThan(0);
    expect(direction[2]).toBeGreaterThan(0);
    expect(Math.abs(direction[1])).toBeLessThan(direction[2]);
    expect(components["minecraft:particle_initial_speed"]).toBeGreaterThan(0);
    const motion = components["minecraft:particle_motion_dynamic"];
    expect(motion.linear_drag_coefficient).toBeGreaterThanOrEqual(0);
    expect(motion.linear_drag_coefficient).toBeLessThan(1);
    expect(motion.linear_acceleration[0]).toBe(0);
    expect(motion.linear_acceleration[1]).toBeGreaterThan(0);
    expect(motion.linear_acceleration[1]).toBeLessThan(1);
    expect(motion.linear_acceleration[2]).toBe(0);
  });

  it("starts visibly large and dense, grows and fades over a longer lifetime", () => {
    const components = particle().components;
    const lifetime =
      components["minecraft:particle_lifetime_expression"].max_lifetime;
    expect(lifetime).toBeGreaterThan(1);
    expect(lifetime).toBeCloseTo(1.6);
    const evaluate = (expression: string, age: number): number =>
      new Function(
        `return (${expression
          .replaceAll("variable.particle_age", String(age))
          .replaceAll("variable.particle_lifetime", String(lifetime))});`,
      )();
    for (const size of components["minecraft:particle_appearance_billboard"]
      .size) {
      expect(evaluate(size, 0)).toBeCloseTo(0.3);
      expect(evaluate(size, lifetime)).toBeGreaterThan(evaluate(size, 0));
    }
    const alpha = components["minecraft:particle_appearance_tinting"].color[3];
    expect(evaluate(alpha, 0)).toBeCloseTo(0.6);
    expect(evaluate(alpha, lifetime / 2)).toBeCloseTo(0.3);
    expect(evaluate(alpha, lifetime)).toBeCloseTo(0);
  });

  it("uses an alpha blended sprite inside the particle atlas", () => {
    const effect = particle();
    expect(effect.description.basic_render_parameters).toEqual({
      material: "particles_alpha",
      texture: "textures/particle/particles",
    });
    const uv = effect.components["minecraft:particle_appearance_billboard"].uv;
    for (const [axis, dimension] of [
      "texture_width",
      "texture_height",
    ].entries()) {
      expect(uv.uv[axis]).toBeGreaterThanOrEqual(0);
      expect(uv.uv_size[axis]).toBeGreaterThan(0);
      expect(uv.uv[axis] + uv.uv_size[axis]).toBeLessThanOrEqual(uv[dimension]);
    }
    expect(path.length).toBeLessThanOrEqual(80);
  });
});
