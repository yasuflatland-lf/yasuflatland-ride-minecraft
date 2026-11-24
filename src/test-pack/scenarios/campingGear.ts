import { BlockPermutation, ItemStack } from "@minecraft/server";
import { CAMPING_GEAR_IDS } from "../../domain/vehicle/kinds/index";
import { id } from "../../infrastructure/shared/identifiers";
import {
  DECOR_FACE_STATE,
  DECOR_HEIGHT_STATE,
  DECOR_SPOT_STATE,
  decorBlockId,
} from "../../infrastructure/vehicle/kinds/camper/identifiers";
import type { Arena } from "../arena";
import type { Outcome } from "../outcome";

// One cell per gear along the arena's east edge, clear of the camper park spot (x 103-114)
// and the soul sand strip (x 93-98).
const ROW = { x: 119, z: 1 } as const;
// The decor blocks' yasu_ride:spot values: the cell middle and ADR 0107's four burner spots (ADR 0112).
const SPOTS = 5;

/** Sets every decor block with a mix of face, height, and spot states and creates every gear item. */
export function campingGearBlocks(a: Arena): Promise<Outcome> {
  const failed: string[] = [];
  try {
    CAMPING_GEAR_IDS.forEach((gear, i) => {
      const at = a.at(ROW.x, a.gy, ROW.z + i);
      const blockId = decorBlockId(gear);
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
        new ItemStack(id(gear));
      } catch {
        failed.push(gear);
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
        failed.push(gear);
    });
    return Promise.resolve({
      pass: failed.length === 0,
      detail: `gear=${CAMPING_GEAR_IDS.length} failed=${failed.join("|")}`,
    });
  } finally {
    a.dim.runCommand(
      `fill ${a.box(ROW.x, a.gy, ROW.z, ROW.x, a.gy, ROW.z + CAMPING_GEAR_IDS.length - 1)} air`,
    );
  }
}
