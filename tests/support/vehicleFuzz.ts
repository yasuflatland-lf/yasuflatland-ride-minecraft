import fc from "fast-check";
import { asPlayerId, type PlayerId } from "../../src/domain/shared/ids";
import { forward, leftOf, type Vec3 } from "../../src/domain/shared/vec";
import type { RawInput } from "../../src/domain/vehicle/driveInput";
import type { VehicleKind } from "../../src/domain/vehicle/kind";
import { profileOf } from "../../src/domain/vehicle/kinds/index";
import type { RiderView } from "../../src/domain/vehicle/vehicle";
import { defined } from "./defined";
import { waterDepth } from "./waterDepth";

export interface RiderSample {
  readonly seat: number;
  readonly yaw: number;
  readonly raw: RawInput;
}

/** One tick of a random ride: who sits where, every input, and the sensor readings. */
export interface TickSample {
  /** Ascending seat order; each seat has one fixed rider, `riderId(seat)`. */
  readonly riders: readonly RiderSample[];
  readonly testInput: RawInput | undefined;
  readonly deckSeatInputs: readonly (RawInput | undefined)[];
  readonly depth: number;
  readonly below: boolean;
  readonly onGround: boolean;
  readonly solid: boolean;
  readonly velocity: Vec3;
}

type Draw<T> = { readonly keep: true } | { readonly keep: false; value: T };

const KEEP: Draw<never> = { keep: true };

/** Last tick's value three times out of four, so a stick or Jump stays held over several ticks (ADR 0021, 0039). */
function held<T>(arbitrary: fc.Arbitrary<T>): fc.Arbitrary<Draw<T>> {
  return fc.oneof(
    { arbitrary: fc.constant(KEEP), weight: 3 },
    {
      arbitrary: arbitrary.map((value): Draw<T> => ({ keep: false, value })),
      weight: 1,
    },
  );
}

function resolve<T>(draw: Draw<T>, last: T): T {
  return draw.keep ? last : draw.value;
}

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });

const rawInput = fc.record({
  moveX: number(-1, 1),
  moveY: number(-1, 1),
  jump: fc.boolean(),
});

const heldRawInput = fc.record({
  moveX: held(number(-1, 1)),
  moveY: held(number(-1, 1)),
  jump: held(fc.boolean()),
});

const NEUTRAL: RawInput = { moveX: 0, moveY: 0, jump: false };

export const riderId = (seat: number): PlayerId => asPlayerId(`p${seat}`);

/** Random rides for `kind` of 1 to `maxTicks` ticks; a seat drawn on one tick and not the next is a departure. */
export function tickSamples(
  kind: VehicleKind,
  maxTicks: number,
): fc.Arbitrary<TickSample[]> {
  const profile = profileOf(kind);
  const seats = [...profile.seats.positions.keys()];
  const deckSeatCount =
    profile.seats.positions.length +
    (profile.parkedSeats?.positions.length ?? 0);
  const perSeat = <T>(arbitrary: fc.Arbitrary<T>) =>
    fc.array(arbitrary, { minLength: seats.length, maxLength: seats.length });
  const draw = fc.record({
    riders: held(fc.subarray(seats)),
    yaws: perSeat(number(-180, 180)),
    raws: perSeat(heldRawInput),
    testInput: held(fc.option(rawInput, { nil: undefined })),
    deckSeatInputs: held(
      fc.array(fc.option(rawInput, { nil: undefined }), {
        maxLength: deckSeatCount,
      }),
    ),
    depth: waterDepth,
    below: fc.boolean(),
    onGround: fc.boolean(),
    solid: fc.boolean(),
    velocity: fc.record({
      x: number(-2, 2),
      y: number(-1, 1),
      z: number(-2, 2),
    }),
  });
  return fc
    .array(draw, { minLength: 1, maxLength: maxTicks, size: "max" })
    .map((draws) => {
      let seated: readonly number[] = [];
      let raws: readonly RawInput[] = seats.map(() => NEUTRAL);
      let testInput: RawInput | undefined;
      let deckSeatInputs: readonly (RawInput | undefined)[] = [];
      return draws.map((d): TickSample => {
        seated = resolve(d.riders, seated);
        raws = raws.map((last, seat) => {
          const next = defined(d.raws[seat], `raw for seat ${seat}`);
          return {
            moveX: resolve(next.moveX, last.moveX),
            moveY: resolve(next.moveY, last.moveY),
            jump: resolve(next.jump, last.jump),
          };
        });
        testInput = resolve(d.testInput, testInput);
        deckSeatInputs = resolve(d.deckSeatInputs, deckSeatInputs);
        return {
          riders: seated.map((seat) => ({
            seat,
            yaw: defined(d.yaws[seat], `yaw for seat ${seat}`),
            raw: defined(raws[seat], `raw for seat ${seat}`),
          })),
          testInput,
          deckSeatInputs,
          depth: d.depth,
          below: d.below,
          onGround: d.onGround,
          solid: d.solid,
          velocity: d.velocity,
        };
      });
    });
}

/**
 * Each rider sits exactly on their seat for a vehicle heading `yaw`. Only a kind
 * whose players choose their seat gets the rider's slot (ADR 0120). The engine
 * reports a slot for every kind, but leaving it out keeps the other kinds on the
 * position reading, where the sticky driver applies (ADR 0025, 0128).
 */
export function riderViews(
  kind: VehicleKind,
  riders: readonly RiderSample[],
  yaw: number,
): RiderView[] {
  const profile = profileOf(kind);
  const f = forward(yaw);
  const l = leftOf(f);
  return riders.map(({ seat, yaw: riderYaw, raw }) => {
    const s = defined(profile.seats.positions[seat], `seat ${seat}`);
    return {
      id: riderId(seat),
      offset: { x: l.x * s.x + f.x * s.z, z: l.z * s.x + f.z * s.z },
      yaw: riderYaw,
      raw,
      ...(profile.boarding.order === "chosen" ? { slot: seat } : {}),
    };
  });
}
