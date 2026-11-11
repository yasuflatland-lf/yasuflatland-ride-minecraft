import type { PlayerId } from "../shared/ids";
import { TOILET_SPEC } from "./shows";

export type ToiletState =
  | { phase: "empty" }
  | { phase: "seated"; rider: PlayerId }
  | { phase: "flushing"; endsAt: number };

export type ToiletEffect =
  | "seat"
  | "refuse_occupied"
  | "refuse_flushing"
  | "start_flush"
  | "end_flush"
  | "none";

export function toiletInteract(
  s: ToiletState,
  player: PlayerId,
): { state: ToiletState; effect: ToiletEffect } {
  switch (s.phase) {
    case "empty":
      return { state: { phase: "seated", rider: player }, effect: "seat" };
    case "seated":
      return { state: s, effect: "refuse_occupied" };
    case "flushing":
      return { state: s, effect: "refuse_flushing" };
  }
}

export function toiletRiderGone(
  s: ToiletState,
  now: number,
): { state: ToiletState; effect: ToiletEffect } {
  if (s.phase !== "seated") return { state: s, effect: "none" };
  return {
    state: { phase: "flushing", endsAt: now + TOILET_SPEC.flushTicks },
    effect: "start_flush",
  };
}

export function toiletTick(
  s: ToiletState,
  now: number,
): { state: ToiletState; effect: ToiletEffect } {
  if (s.phase === "flushing" && now >= s.endsAt)
    return { state: { phase: "empty" }, effect: "end_flush" };
  return { state: s, effect: "none" };
}
