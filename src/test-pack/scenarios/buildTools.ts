import { blockStateOf } from "../../domain/build/blockState";
import { asDimensionId } from "../../domain/shared/ids";
import { BedrockBlockWorld } from "../../infrastructure/build/bedrock/bedrockBlockWorld";
import type { Arena } from "../arena";
import type { Outcome } from "../outcome";

/** Engine permutation round trips run without a connected player. */
export async function buildBlockStates(a: Arena): Promise<Outcome> {
  const blocks = new BedrockBlockWorld({ isProtected: () => false });
  const dimension = asDimensionId(a.dim.id);
  const cell = a.at(20, a.gy + 8, 20);
  const original = blocks.stateAt(dimension, cell);
  if (!original) return { pass: false, detail: "test cell unreadable" };
  try {
    const state = blockStateOf("minecraft:oak_log", { pillar_axis: "x" });
    const written = blocks.setState(dimension, cell, state);
    const actual = blocks.stateAt(dimension, cell);
    return {
      pass:
        written &&
        !!actual &&
        actual.typeId === state.typeId &&
        actual.states.pillar_axis === "x" &&
        blocks.mayEdit(dimension, cell),
      detail: `written=${written} state=${JSON.stringify(actual)}`,
    };
  } finally {
    blocks.setState(dimension, cell, original);
  }
}
