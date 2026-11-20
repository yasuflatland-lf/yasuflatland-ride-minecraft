export const TPS = 20;
export const DEADLINE_FACTOR = 1.5;
export const SETUP_MARGIN_MS = 30_000;
export const STALL_MS = 60_000;
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
  const deadlineAt =
    w.deadlineAt ??
    (plan === undefined ? undefined : now + deadlineMsOf(plan.ticks));
  return {
    lastProgressAt: seen > w.seen ? now : w.lastProgressAt,
    seen,
    ...(deadlineAt === undefined ? {} : { deadlineAt }),
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
