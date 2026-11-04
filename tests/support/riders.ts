import { asPlayerId } from "../../src/domain/shared/ids";
import type { Vec2 } from "../../src/domain/shared/vec";
import type { RawInput } from "../../src/domain/vehicle/driveInput";
import { SUV_PROFILE } from "../../src/domain/vehicle/kinds/suv/profile";
import type { RiderPos } from "../../src/domain/vehicle/seats";
import type { RiderHeld, RiderView } from "../../src/domain/vehicle/vehicle";
import { defined } from "./defined";

type RiderOptions = {
  seat?: number;
  slot?: number;
  offset?: Vec2;
  yaw?: number;
  raw?: RawInput;
  held?: RiderHeld;
};

export function riderView(id: string, options: RiderOptions = {}): RiderView {
  const seat = options.seat ?? 0;
  return {
    id: asPlayerId(id),
    slot: options.slot ?? seat,
    offset:
      options.offset ??
      defined(SUV_PROFILE.seats.positions[seat], `seat ${seat}`),
    yaw: options.yaw ?? 0,
    raw: options.raw ?? { moveX: 0, moveY: 0, jump: false },
    ...(options.held === undefined ? {} : { held: options.held }),
  };
}

export function riderPos(id: string, options: RiderOptions = {}): RiderPos {
  const { id: playerId, slot, offset } = riderView(id, options);
  return { id: playerId, slot, offset };
}
