import type { StairRole } from "./roles";

export type StairContents = "passage" | "fillBelow" | "stepsOnly";

export function rolesOf(contents: StairContents): ReadonlySet<StairRole> {
  switch (contents) {
    case "passage":
      return new Set(["step", "below", "headroom"]);
    case "fillBelow":
      return new Set(["step", "below"]);
    case "stepsOnly":
      return new Set(["step"]);
  }
}
