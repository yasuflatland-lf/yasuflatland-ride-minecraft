import { WASHSTAND_SPEC } from "./shows";

export type WashstandState =
  | { phase: "idle" }
  | { phase: "running"; endsAt: number };

export type WashstandEffect = "start_run" | "end_run" | "none";

export function washstandInteract(
  s: WashstandState,
  now: number,
): { state: WashstandState; effect: WashstandEffect } {
  if (s.phase === "running") return { state: s, effect: "none" };
  return {
    state: { phase: "running", endsAt: now + WASHSTAND_SPEC.runTicks },
    effect: "start_run",
  };
}

export function washstandTick(
  s: WashstandState,
  now: number,
): { state: WashstandState; effect: WashstandEffect } {
  if (s.phase === "running" && now >= s.endsAt)
    return { state: { phase: "idle" }, effect: "end_run" };
  return { state: s, effect: "none" };
}
