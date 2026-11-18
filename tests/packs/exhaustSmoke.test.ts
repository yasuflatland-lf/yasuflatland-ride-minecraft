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
