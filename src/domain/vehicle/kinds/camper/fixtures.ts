import { Debounce } from "../../../shared/debounce";
import { TapToggle } from "../../../shared/tapToggle";
import type { Vec3 } from "../../../shared/vec";
import type { HoldPose } from "../../dock/floor";
import type { EngineCommand } from "../../drive";
import type { RestoredOf } from "../../entityContract";
import { SPEC } from "../../spec";
import { SyncedCommands } from "../../syncedCommands";
import { DOOR_STEPS, restoredDoorStep, stepOpening } from "./doorSwing";
import {
  type CAMPER_ENTITY,
  ceilingLightsCommand,
  doorCommand,
  SWITCH_CLICK,
  showerCommand,
  showerDoorCommand,
} from "./entity";
import { inShowerToilet } from "./roomCells";
import { CAMPER_SPEC } from "./spec";

interface FixtureValues {
  doorStep?: number;
  showerDoorStep?: number;
  showerRunning?: boolean;
  ceilingLights?: boolean;
}

export class CamperFixtures {
  private readonly doorToggle = new TapToggle(CAMPER_SPEC.doorSwingTicks);
  // The shower door swings in the entry door's DOOR_STEPS (ADR 0094).
  private readonly showerDoorToggle = new TapToggle(CAMPER_SPEC.doorSwingTicks);
  private showerTicks = 0;
  private readonly ceilingLightSwitch = new Debounce(
    SPEC.headlightSwitchCooldown,
  );
  private readonly synced = new SyncedCommands<FixtureValues>()
    .add(
      (v) => v.doorStep,
      (step) => doorCommand(step / DOOR_STEPS),
    )
    .add(
      (v) => v.showerDoorStep,
      (step) => showerDoorCommand(step / DOOR_STEPS),
    )
    .add((v) => v.showerRunning, showerCommand)
    .add((v) => v.ceilingLights, ceilingLightsCommand);
  private clickPending = false;

  private constructor(
    private entryOpen: boolean,
    private doorStep: number,
    private showerOpen: boolean,
    private showerDoorStep: number,
    private lightsOn: boolean,
  ) {}

  static restore(
    restored: RestoredOf<typeof CAMPER_ENTITY>,
    docked: boolean,
    savedDoorOpen: unknown,
  ): CamperFixtures {
    const doorStep = restoredDoorStep(restored.door, docked);
    const doorOpen =
      docked && typeof savedDoorOpen === "boolean"
        ? savedDoorOpen
        : doorStep * 2 >= DOOR_STEPS;
    const showerDoorStep = restoredDoorStep(restored.shower_door, docked);
    return new CamperFixtures(
      doorOpen,
      doorStep,
      showerDoorStep * 2 >= DOOR_STEPS,
      showerDoorStep,
      docked && restored.ceiling_lights === true,
    );
  }

  get doorOpen(): boolean {
    return this.entryOpen;
  }

  get showerDoorOpen(): boolean {
    return this.showerOpen;
  }

  get ceilingLightsOn(): boolean {
    return this.lightsOn;
  }

  useDockDoor(tick: number): boolean {
    if (!this.doorToggle.tryToggle(tick)) return false;
    this.entryOpen = !this.entryOpen;
    return true;
  }

  private useShowerDoor(tick: number): boolean {
    if (!this.showerDoorToggle.tryToggle(tick)) return false;
    this.showerOpen = !this.showerOpen;
    return true;
  }

  private runShower(): boolean {
    this.showerTicks = CAMPER_SPEC.showerTicks;
    return true;
  }

  /**
   * An open door, or one that moved within a swing, takes the press, so the door closes
   * from either side and an echo cannot start the shower (ADR 0105, 0118). A shut door
   * opens from outside; from inside, the press runs the shower (ADR 0098).
   */
  pressShowerToilet(pose: HoldPose, feet: Vec3, tick: number): boolean {
    const doorTakesIt =
      this.showerOpen ||
      this.showerDoorToggle.withinWindow(tick) ||
      !inShowerToilet(pose, feet);
    return doorTakesIt ? this.useShowerDoor(tick) : this.runShower();
  }

  /** Even an unreachable use restarts the idle time of a held switch (ADR 0024, 0115). */
  trySwitchCeilingLights(tick: number, reachable: boolean): boolean {
    if (!this.ceilingLightSwitch.press(tick) || !reachable) return false;
    this.lightsOn = !this.lightsOn;
    this.clickPending = true;
    return true;
  }

  doorCommands(): EngineCommand[] {
    this.doorStep = stepOpening(this.doorStep, this.entryOpen);
    return this.synced.next({ doorStep: this.doorStep });
  }

  showerCommands(): EngineCommand[] {
    this.showerDoorStep = stepOpening(this.showerDoorStep, this.showerOpen);
    const commands = this.synced.next({
      showerDoorStep: this.showerDoorStep,
      showerRunning: this.showerTicks > 0,
    });
    this.showerTicks = Math.max(this.showerTicks - 1, 0);
    return commands;
  }

  ceilingLightCommands(): EngineCommand[] {
    const commands = this.synced.next({ ceilingLights: this.lightsOn });
    if (this.clickPending) commands.push(SWITCH_CLICK);
    this.clickPending = false;
    return commands;
  }

  shutForDeparture(): void {
    this.entryOpen = false;
    this.doorStep = 0;
    this.showerOpen = false;
    this.showerDoorStep = 0;
    this.showerTicks = 0;
    // The next park starts dark (ADR 0115).
    this.lightsOn = false;
    this.clickPending = false;
  }

  resync(): void {
    this.synced.resync();
  }
}
