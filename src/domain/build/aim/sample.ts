import type { BlockFace } from "../../shared/blockFace";
import type { Cell } from "../../shared/cells";
import type { Ray } from "./aim";

export type InputKind = "touch" | "pointer";

export type AimSample = Readonly<{
  ray: Ray;
  block?: Readonly<{ cell: Cell; face: BlockFace }>;
  input: InputKind;
}>;
