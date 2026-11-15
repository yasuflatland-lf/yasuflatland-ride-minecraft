import { expect, it } from "vitest";
import { jsonFileEntries } from "../support/packFiles";

type State = unknown[] | { values: { min: number; max: number } };

// fridge_decor_pair at 6,400 works; drawers at 11,520 crashed an iPad on Minecraft 1.26.63.
// See [Sliding kitchen drawers](../../docs/specs/camper-interior.md#sliding-kitchen-drawers).
for (const { path, json } of jsonFileEntries("packs/yasu_ride_bp/blocks")) {
  if (!path.endsWith(".block.json")) continue;
  const block = json["minecraft:block"] as {
    description: { states?: Record<string, State> };
  };
  const states = block.description.states;
  it(`${path} stays within the measured 6,400 permutation budget`, () => {
    const count = Object.values(states ?? {}).reduce(
      (product, state) =>
        product *
        (Array.isArray(state)
          ? state.length
          : state.values.max - state.values.min + 1),
      1,
    );
    expect(count).toBeLessThanOrEqual(6400);
  });
}
