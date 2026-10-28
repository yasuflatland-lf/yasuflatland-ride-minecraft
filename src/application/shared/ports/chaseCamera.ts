// The chase camera wish one feature hands another through bootstrap (ADR 0046, 0178).
import type { PlayerId } from "../../../domain/shared/ids";

/** Whether another feature wants `playerId`, while seated in a vehicle, in that vehicle's chase camera. A pure read. */
export type ChaseCameraWish = (playerId: PlayerId) => boolean;
