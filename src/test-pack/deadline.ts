export const TPS = 20;
export const DEADLINE_FACTOR = 1.5;
export const SETUP_MARGIN_MS = 30_000;
export const STALL_MS = 60_000;
// A scenario of at most 300 ticks only looks stalled when TPS falls to about 5.
export const MAX_SCENARIO_TICKS = ((STALL_MS / 1000) * TPS) / 4;

export function deadlineMsOf(expectedTicks: number): number {
  return (
    Math.ceil((expectedTicks / TPS) * DEADLINE_FACTOR * 1000) + SETUP_MARGIN_MS
  );
}

export interface Watch {
  readonly lastProgressAt: number;
  readonly seen: number;
  readonly deadlineAt?: number;
}

export function watchStart(now: number): Watch {
  return { lastProgressAt: now, seen: 0 };
}

export function observe(
  w: Watch,
  now: number,
  seen: number,
  plan?: { readonly ticks: number },
): Watch {
  return {
    lastProgressAt: seen > w.seen ? now : w.lastProgressAt,
    seen,
    ...(w.deadlineAt !== undefined
      ? { deadlineAt: w.deadlineAt }
      : plan === undefined
        ? {}
        : { deadlineAt: now + deadlineMsOf(plan.ticks) }),
  };
}

export function watchVerdict(
  w: Watch,
  now: number,
): "running" | "stalled" | "overdue" {
  if (now - w.lastProgressAt > STALL_MS) return "stalled";
  if (w.deadlineAt !== undefined && now > w.deadlineAt) return "overdue";
  return "running";
}
