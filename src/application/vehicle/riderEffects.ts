import type { PlayerId } from "../../domain/shared/ids";
// The effects a drive puts on its riders: the chase camera (ADR 0028) and water breathing.
import type { ChaseCamera } from "../../domain/vehicle/profile";
import { SPEC } from "../../domain/vehicle/spec";
import { forEachIsolated } from "./isolated";
import type { DriveWorld } from "./ports/drive";
import type { Logger } from "./ports/shared";

export class RiderEffects {
  /** Players this use case switched to a third-person camera, and which one (ADR 0028). */
  private readonly thirdPerson = new Map<PlayerId, ChaseCamera>();
  /** Players whose camera switch failed and was logged, so a retry every tick logs once. */
  private readonly cameraFailed = new Set<PlayerId>();

  constructor(
    private readonly world: Pick<
      DriveWorld,
      "setChaseCamera" | "giveWaterBreathing"
    >,
    private readonly log: Logger,
  ) {}

  /**
   * Each drive chooses its riders' view; everyone this use case switched
   * gets their own view back when requested or when they get off. A failed
   * switch either way is retried on the next tick. A player who left needs no
   * clearing: the world does nothing for a missing player, so they are dropped.
   */
  syncCameras(thirdPersonRiders: ReadonlyMap<PlayerId, ChaseCamera>): void {
    for (const [id, camera] of thirdPersonRiders)
      if (this.thirdPerson.get(id) !== camera && this.switchCamera(id, camera))
        this.thirdPerson.set(id, camera);
    for (const id of this.thirdPerson.keys())
      if (!thirdPersonRiders.has(id) && this.switchCamera(id, undefined))
        this.thirdPerson.delete(id);
  }

  /** Refreshes water breathing for the riders under water, once every SPEC.waterBreathingInterval ticks. */
  refreshWaterBreathing(underwater: ReadonlySet<PlayerId>, tick: number): void {
    if (tick % SPEC.waterBreathingInterval !== 0) return;
    forEachIsolated(
      underwater,
      (id) => this.world.giveWaterBreathing(id, SPEC.waterBreathingTicks),
      this.log,
      (id) => `breathing ${id}`,
    );
  }

  private switchCamera(id: PlayerId, camera: ChaseCamera | undefined): boolean {
    try {
      this.world.setChaseCamera(id, camera);
      this.cameraFailed.delete(id);
      return true;
    } catch (e) {
      if (!this.cameraFailed.has(id)) this.log.warn(`camera ${id}: ${e}`);
      this.cameraFailed.add(id);
      return false;
    }
  }
}
