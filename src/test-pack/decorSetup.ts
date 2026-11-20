import { seconds } from "../domain/shared/ticks";
import type { StepResult } from "./outcome";

export const SETUP_LIMIT_TICKS = seconds(60);
export const SETUP_POLL_TICKS = 10;
export const SETUP_REPORT_TICKS = 200;

const PIECES = ["item frame", "diamond interaction with the frame", "painting"];

export function setupPromptStep(): StepResult {
  return {
    name: "setup_prompt",
    pass: true,
    detail: `waiting up to ${SETUP_LIMIT_TICKS} ticks for a player to place the item frame, put the diamond in it and hang the painting`,
  };
}

export function setupProgressStep(
  elapsed: number,
  missing: readonly string[],
): StepResult {
  const present = PIECES.filter((piece) => !missing.includes(piece));
  return {
    name: `setup_wait_${elapsed}`,
    pass: true,
    detail: `present: ${present.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}; ticks=${elapsed}`,
  };
}

export function setupTimeoutDetail(
  elapsed: number,
  missing: readonly string[],
): string {
  return `no player action within ${elapsed} ticks: missing ${missing.join(", ")}`;
}
