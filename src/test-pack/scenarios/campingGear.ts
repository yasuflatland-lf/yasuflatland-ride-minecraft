import { BlockPermutation, ItemStack } from "@minecraft/server";
import gear from "../../../tools/camping_gear.json";
import { id } from "../../infrastructure/shared/identifiers";
import {
  DECOR_FACE_STATE,
  DECOR_HEIGHT_STATE,
  DECOR_SPOT_STATE,
  decorBlockId,
} from "../../infrastructure/vehicle/bedrock/identifiers";
import type { Arena, Outcome } from "../arena";

// One cell per gear along the arena's east edge, clear of the camper park spot (x 103-114)
// and the soul sand strip (x 93-98).
const ROW = { x: 119, z: 1 } as const;
// The 19 items of ADR 0093; a spec that loses an item fails here as well as in the unit tests.
const GEAR_COUNT = 19;

// The decor blocks' yasu_ride:spot values: the cell middle and the four stove burners (ADR 0105).
const SPOTS = 5;

/** Sets every decor block with a mix of face, height, and spot states and creates every gear item. */
export function campingGearBlocks(a: Arena): Promise<Outcome> {
  const failed: string[] = [];
  try {
    gear.forEach((g, i) => {
      const at = { x: ROW.x, y: a.gy, z: ROW.z + i };
      const blockId = decorBlockId(g.id);
      const face = i % 4;
      const height = (i * 5) % 16;
      const spot = i % SPOTS;
      try {
        a.dim.getBlock(at)?.setPermutation(
          BlockPermutation.resolve(blockId, {
            [DECOR_FACE_STATE]: face,
            [DECOR_HEIGHT_STATE]: height,
            [DECOR_SPOT_STATE]: spot,
          }),
        );
        new ItemStack(id(g.id));
      } catch {
        failed.push(g.id);
        return;
      }
      // getState only accepts vanilla state names in @minecraft/server 2.x typings
      const block = a.dim.getBlock(at);
      const states = block?.permutation.getAllStates();
      if (
        block?.typeId !== blockId ||
        states?.[DECOR_FACE_STATE] !== face ||
        states?.[DECOR_HEIGHT_STATE] !== height ||
        states?.[DECOR_SPOT_STATE] !== spot
      )
        failed.push(g.id);
    });
    return Promise.resolve({
      pass: gear.length === GEAR_COUNT && failed.length === 0,
      detail: `gear=${gear.length} failed=${failed.join("|")}`,
    });
  } finally {
    a.dim.runCommand(
      `fill ${ROW.x} ${a.gy} ${ROW.z} ${ROW.x} ${a.gy} ${ROW.z + gear.length - 1} air`,
    );
  }
}
