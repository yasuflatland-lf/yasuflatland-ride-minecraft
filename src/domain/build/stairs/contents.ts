import type { StairRole } from "./roles";

export type StairContents = "stepsOnly";

export function rolesOf(contents: StairContents): ReadonlySet<StairRole> {
  switch (contents) {
    case "stepsOnly":
      return new Set(["step"]);
  }
}
