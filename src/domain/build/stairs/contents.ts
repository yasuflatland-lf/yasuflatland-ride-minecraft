import type { StairRole } from "./roles";

export type StairContents = "stepsOnly";

export function rolesOf(contents: StairContents): ReadonlySet<StairRole> {
  switch (contents) {
    case "stepsOnly":
      return new Set(["step"]);
  }
}

export type StairOp = "stairs" | "terrace";
export const TERRACE_ROLES: ReadonlySet<StairRole> = new Set(["above"]);
