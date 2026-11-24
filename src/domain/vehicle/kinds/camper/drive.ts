import type { Vec3 } from "../../../shared/vec";
import { type CapabilityKey, offer } from "../../capability";
import type { Dock } from "../../dock/dock";
import type { HoldPose } from "../../dock/floor";
import type { DriveStep, EngineCommand, TickContext } from "../../drive";
import type { RawInput } from "../../driveInput";
import { Hold, heldStep, pushesStick } from "../../motion/dock";
import { TransformingDrive } from "../../motion/transformingDrive";
import { SPEC } from "../../spec";
import { type BodyEnds, guardEnds } from "./bodyGuard";
import { decorCells, furnitureCells } from "./decorCells";
import { CamperFixtures } from "./fixtures";
import { PARK_MESSAGES } from "./groundCheck";
import { CamperParking } from "./parking";
import { parkPose } from "./parkPose";
import { CAMPER_MOTION, CAMPER_PROFILE, CAMPER_TYRES } from "./profile";
import { CAMPER_ROOM, type CamperRoom } from "./room";
import {
  ceilingLightCells,
  deckSeats,
  departure,
  insideRoom,
  bedSpawnCell as roomBedSpawnCell,
  roomCells,
} from "./roomCells";
import { CamperRoomDecor } from "./roomDecor";
import { CAMPER_SAVED, type CamperRestored } from "./saved";
import { CAMPER_SPEC, CAMPER_TRANSFORMING } from "./spec";
import { CamperStorage } from "./storage";
import { compartmentCells, storagePlateCells } from "./storagePlates";

const CAMPER_ENDS: BodyEnds = Object.freeze({
  ...CAMPER_PROFILE.body,
  rear: CAMPER_SPEC.bodyRear,
});

export class CamperDrive extends TransformingDrive {
  private readonly hold: Hold;
  private readonly parking: CamperParking;
  private readonly fixtures: CamperFixtures;
  private readonly storage: CamperStorage;
  private readonly roomDecor: CamperRoomDecor;
  private readonly room: CamperRoom;
  constructor(yaw: number, restored: CamperRestored) {
    super(yaw, restored, CAMPER_TRANSFORMING, CAMPER_MOTION, CAMPER_TYRES, {
      guard: (step, ctx, form) => guardEnds(step, ctx, CAMPER_ENDS, form),
    });
    const parked = restored.docked === true;
    this.hold = new Hold(parked);
    this.parking = new CamperParking(
      this.hold,
      restored[CAMPER_SAVED.laid] === true,
    );
    this.fixtures = CamperFixtures.restore(
      restored,
      parked,
      restored[CAMPER_SAVED.doorOpen],
    );
    this.storage = new CamperStorage(restored, parked);
    // Decor survives driving: it is restored whether or not the camper was docked (ADR 0093).
    this.roomDecor = CamperRoomDecor.restore(restored[CAMPER_SAVED.decor]);
    const ceilingLightsReachable = (feet: Vec3) =>
      this.hold.held !== undefined && insideRoom(this.hold.held, feet);
    this.room = Object.freeze<CamperRoom>({
      decor: {
        decor: () => this.roomDecor.all(),
        setDecor: (slot, item) => this.roomDecor.set(slot, item),
        // Decor placed on the parking tick is laid with the room on the next step (ADR 0068, 0093).
        decorSlotFor: (item, press, fallback) => {
          const pose = this.hold.held;
          if (!pose) return undefined;
          return this.roomDecor.slotFor(
            { pose, open: this.storage.open() },
            item,
            press,
            fallback,
          );
        },
        placeDecor: (slot, item) => {
          const pose = this.hold.held;
          if (!pose) return false;
          return this.roomDecor.place(
            { pose, open: this.storage.open() },
            slot,
            item,
          );
        },
        removeDecor: (press) => {
          const pose = this.hold.held;
          if (!pose) return undefined;
          return this.roomDecor.remove(
            { pose, open: this.storage.open() },
            press,
          );
        },
      },
      storage: {
        drawerTarget: (press, item) => {
          const pose = this.hold.held;
          if (!pose) return undefined;
          return this.storage.drawerTarget(pose, this.roomDecor, press, item);
        },
        pressStorage: (request) => {
          const pose = this.hold.held;
          if (!pose) return undefined;
          return this.storage.press(pose, this.roomDecor, request);
        },
      },
      fixtures: {
        ceilingLightsReachable,
        switchCeilingLights: (feet, tick) =>
          this.fixtures.trySwitchCeilingLights(
            tick,
            ceilingLightsReachable(feet),
          ),
        useDockDoor: (tick) =>
          this.hold.held !== undefined && this.fixtures.useDockDoor(tick),
        bedSpawnCell: (cell) => {
          const pose = this.hold.held;
          return pose === undefined ? undefined : roomBedSpawnCell(pose, cell);
        },
        pressShowerToilet: (feet, tick) => {
          const pose = this.hold.held;
          return (
            pose !== undefined &&
            this.fixtures.pressShowerToilet(pose, feet, tick)
          );
        },
      },
    });
  }

  capability<T>(key: CapabilityKey<T>): T | undefined {
    return offer(key, CAMPER_ROOM, this.room);
  }

  cargo(): readonly string[] {
    return this.roomDecor.all().map(({ item }) => item);
  }

  /** Unit-test snapshot. */
  override inspect(): Readonly<{
    wheelsDown: boolean;
    bank: number;
    parked: boolean;
  }> {
    return { ...super.inspect(), parked: this.hold.held !== undefined };
  }

  protected override alignToDriver(driverYaw: number): void {
    // A parked body keeps its snapped yaw, so its room, seats, and headlights stay put.
    if (this.hold.held || this.hold.restoring) return;
    super.alignToDriver(driverYaw);
  }

  override resync(): void {
    super.resync();
    this.hold.resync();
    this.fixtures.resync();
    this.storage.resync();
  }

  override step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    this.hold.beginStep();
    const step = this.stepCamper(raw, ctx);
    const resend = this.hold.resendCommand();
    return resend ? { ...step, commands: [...step.commands, resend] } : step;
  }

  private stepCamper(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    if (this.hold.restoring) {
      const pose = parkPose(ctx.location, this.yaw);
      const layNow = this.parking.recover(pose, ctx);
      if (!this.hold.held) {
        const undock = this.parking.leave();
        this.fixtures.shutForDeparture();
        this.storage.shutAll();
        const step = this.withProperties(super.step(raw, ctx));
        return { ...step, commands: [...undock, ...step.commands] };
      }
      this.restartAt(pose.yaw);
      if (layNow) return this.parkedStep(pose, ctx);
    }
    const pushed = pushesStick(raw);
    const pressed = this.parking.pressedStick(pushed);
    const parked = this.hold.held;
    if (parked) {
      if (!pressed) return this.parkedStep(parked, ctx);
      const { blocked, exitClear } = this.parking.departureCheck(parked, ctx);
      if (blocked)
        return {
          ...this.parkedStep(parked, ctx),
          message: PARK_MESSAGES.clearCargo,
        };
      return this.depart(parked, raw, ctx, exitClear);
    }
    const step = super.step(raw, ctx);
    const still =
      this.form === "car" &&
      ctx.onGround &&
      !pushed &&
      Math.abs(this.speed) < SPEC.stoppedSpeed;
    if (!this.parking.observe(still)) return this.withProperties(step);
    const pose = parkPose(ctx.location, this.yaw);
    const clear = this.parking.clearFor(pose, ctx);
    if (!clear)
      return {
        ...this.withProperties(step),
        message: PARK_MESSAGES.cannotPark,
      };
    const dock = this.parking.park(pose, clear);
    this.restartAt(pose.yaw);
    const held = this.parkedStep(pose, ctx);
    return {
      ...held,
      commands: [...step.commands, ...dock, ...held.commands],
    };
  }

  private parkedStep(pose: HoldPose, ctx: TickContext): DriveStep {
    const { lay, clear } = this.parking.takeLaying();
    // The doors swing first, so a compartment shows its items on the tick its door starts to
    // open and hides them on the tick it is shut (ADR 0114, 0121).
    const commands = this.propertyCommands();
    let cells: Dock["cells"] = [];
    if (lay) {
      const { doorOpen, showerDoorOpen, ceilingLightsOn } = this.fixtures;
      const decor = this.roomDecor.placed();
      const open = this.storage.open();
      cells = [
        ...roomCells(pose, doorOpen, open, showerDoorOpen),
        ...decorCells(pose, decor),
        ...furnitureCells(pose, decor),
        ...compartmentCells(pose, decor, this.storage.shown()),
        ...storagePlateCells(pose, open, ceilingLightsOn),
        ...(ceilingLightsOn ? ceilingLightCells(pose, open) : []),
      ];
    }
    const dock = { hold: pose, cells, seats: deckSeats(pose) };
    return heldStep(dock, pose.yaw, ctx.deckSeatInputs, { commands, clear });
  }

  private depart(
    pose: HoldPose,
    raw: RawInput | undefined,
    ctx: TickContext,
    exitClear: boolean,
  ): DriveStep {
    const undock = this.parking.leave();
    this.fixtures.shutForDeparture();
    this.storage.shutAll();
    const step = super.step(raw, ctx);
    return {
      ...step,
      commands: [...undock, ...this.propertyCommands(), ...step.commands],
      boardDeckRiders: true,
      depart: departure(pose, exitClear),
    };
  }

  private withProperties(step: DriveStep): DriveStep {
    const properties = this.propertyCommands();
    return properties.length === 0
      ? step
      : { ...step, commands: [...step.commands, ...properties] };
  }

  private propertyCommands(): EngineCommand[] {
    return [
      ...this.fixtures.doorCommands(),
      ...this.fixtures.showerCommands(),
      ...this.storage.swingCommands(),
      ...this.storage.drawerItemCommands(this.roomDecor),
      ...this.fixtures.ceilingLightCommands(),
    ];
  }
}
