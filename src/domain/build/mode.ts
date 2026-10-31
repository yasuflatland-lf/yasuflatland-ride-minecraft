import { BUILD_SPEC } from "./spec";

export interface BuildMode {
  readonly active: boolean;
  /** Ticks the current input has lasted: holding when off, not holding when on. */
  readonly streak: number;
}

export interface ModeInput {
  readonly holding: boolean;
}

export const MODE_OFF: BuildMode = Object.freeze({ active: false, streak: 0 });

export function stepMode(mode: BuildMode, input: ModeInput): BuildMode {
  if (mode.active) {
    if (input.holding) return { active: true, streak: 0 };
    const streak = mode.streak + 1;
    return streak >= BUILD_SPEC.modeLeaveTicks
      ? MODE_OFF
      : { active: true, streak };
  }
  if (!input.holding) return MODE_OFF;
  const streak = mode.streak + 1;
  return streak >= BUILD_SPEC.modeEnterTicks
    ? { active: true, streak: 0 }
    : { active: false, streak };
}
