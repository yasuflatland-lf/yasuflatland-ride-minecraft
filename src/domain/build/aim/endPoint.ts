import type { Cell } from "../../shared/cells";
import type { HeightRange } from "../heightRange";
import { BUILD_SPEC } from "../spec";
import { virtualEndPoint } from "./aim";
import type { AimSample, InputKind } from "./sample";

export function endPointReach(input: InputKind): number {
  return input === "touch" ? BUILD_SPEC.touchTapReach : BUILD_SPEC.reach;
}

export function aimedEndPoint(
  point1: Cell,
  aim: AimSample,
  range: HeightRange,
): Cell | undefined {
  return aim.block?.cell ?? virtualAimedEndPoint(point1, aim, range);
}

export function virtualAimedEndPoint(
  point1: Cell,
  aim: AimSample,
  range: HeightRange,
): Cell | undefined {
  return virtualEndPoint(point1, aim.ray, endPointReach(aim.input), range);
}
