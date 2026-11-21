import type { Cell } from "../../shared/cells";
import type { Ray } from "./aim";
import type { Face } from "./face";

export type InputKind = "touch" | "pointer";

export type AimSample = Readonly<{
  ray: Ray;
  block?: Readonly<{ cell: Cell; face: Face }>;
  input: InputKind;
}>;
