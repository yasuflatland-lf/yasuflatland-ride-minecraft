// Each tent flap's target, swing, and tap window, one flap at a time (ADR 0132).
import { SyncedValue } from "../shared/syncedValue";
import { TapToggle } from "../shared/tapToggle";
import { clamp } from "../shared/vec";
import { TENT_SPEC } from "./spec";
import type { FlapId } from "./tent";

/** Every flap, in the order its property is sent. */
export const FLAP_IDS: readonly FlapId[] = [
  "front",
  "left",
  "right",
  "bedroom",
];

/** One flap's swing to send to the tent entity: 0 closed, 1 open. */
export interface FlapSwing {
  readonly flap: FlapId;
  readonly open: number;
}

const STEPS = TENT_SPEC.flapSwingTicks;

interface Flap {
  open: boolean;
  step: number;
  readonly toggle: TapToggle;
  readonly sent: SyncedValue<number>;
}

// The storage doors' rule (ADR 0121): a flap reloaded mid-swing ends on the nearer side.
function restoredStep(saved: unknown): number {
  return typeof saved === "number"
    ? clamp(Math.round(saved * STEPS), 0, STEPS)
    : 0;
}

/** The four flaps of one tent. Each has its own target, swing step, tap window, and synced value. */
export class TentFlaps {
  private readonly flaps: Readonly<Record<FlapId, Flap>>;

  /** `restored(flap)` is the flap's saved float property, or undefined. */
  constructor(restored: (flap: FlapId) => unknown) {
    this.flaps = Object.fromEntries(
      FLAP_IDS.map((id) => {
        const step = restoredStep(restored(id));
        return [
          id,
          {
            open: step * 2 >= STEPS,
            step,
            toggle: new TapToggle(STEPS),
            sent: new SyncedValue<number>(),
          },
        ];
      }),
    ) as Record<FlapId, Flap>;
  }

  private flap(id: FlapId): Flap {
    return this.flaps[id];
  }

  isOpen(flap: FlapId): boolean {
    return this.flap(flap).open;
  }

  /** The flaps whose target is open. The laid blocks follow this, not the swing. */
  open(): ReadonlySet<FlapId> {
    return new Set(FLAP_IDS.filter((id) => this.flap(id).open));
  }

  /** Whether a tap at `tick` is within the window of this flap's last toggle. */
  withinWindow(flap: FlapId, tick: number): boolean {
    return this.flap(flap).toggle.withinWindow(tick);
  }

  /** Flips this flap's target unless the tap is within its window. True when it flipped. */
  toggle(flap: FlapId, tick: number): boolean {
    const f = this.flap(flap);
    if (!f.toggle.tryToggle(tick)) return false;
    f.open = !f.open;
    return true;
  }

  /** Moves every flap one step toward its target, in FLAP_IDS order. Returns only the values that changed since the last send. */
  swing(): FlapSwing[] {
    const changed: FlapSwing[] = [];
    for (const id of FLAP_IDS) {
      const f = this.flap(id);
      f.step += Math.sign((f.open ? STEPS : 0) - f.step);
      const open = f.sent.next(f.step / STEPS);
      if (open !== undefined) changed.push({ flap: id, open });
    }
    return changed;
  }

  /** After a failed send, makes the next swing() resend every flap (ADR 0127). */
  resync(): void {
    for (const id of FLAP_IDS) this.flap(id).sent.resync();
  }
}
