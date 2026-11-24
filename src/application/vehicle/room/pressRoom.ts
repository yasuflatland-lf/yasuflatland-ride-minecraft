import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
import { add3, sub3, type Vec3 } from "../../../domain/shared/vec";
import type { DecorItemId } from "../../../domain/vehicle/dock/decor";
import { DRAWER_GEAR_IDS } from "../../../domain/vehicle/kinds/index";
import type { PlaceDecor, PlaceDecorCommand } from "./placeDecor";
import type { PressStorage } from "./pressStorage";
import type { RemoveDecor } from "./removeDecor";

type Gear = { item: DecorItemId; hotbarSlot: number };
type Hit = { cell: Vec3; point: Vec3; eye?: Vec3 };
type DrawerHit = Hit & { kind: "side" | "ray" | "footprint" };
type Actor = { playerId: PlayerId; vehicleId: VehicleId };
type Surface =
  | { kind: "room" }
  | { kind: "floor"; drawerPoint: Vec3; allowPlacementOnMiss: boolean }
  | { kind: "drawers"; sideFace: boolean };

type PressRoomCommand = Actor &
  (
    | {
        source: "block";
        surface: Surface;
        held: Gear | undefined;
        cell: Vec3;
        point: Vec3;
        eye: Vec3;
      }
    | { source: "itemUse"; held: Gear; eye: Vec3; direction: Vec3; feet: Vec3 }
    | { source: "seat"; held: Gear; cell: Vec3; point: Vec3 }
  );

type Outcome = "storage" | "placed" | "removed" | "unchanged";

export class PressRoom {
  constructor(
    private readonly storage: PressStorage,
    private readonly place: PlaceDecor,
    private readonly remove: RemoveDecor,
  ) {}

  /** Resolve the target before cancellation. Only running the returned action may change the room or inventory. */
  prepare(press: PressRoomCommand): (() => Outcome) | undefined {
    const actor = { playerId: press.playerId, vehicleId: press.vehicleId };
    if (press.source === "itemUse") return this.prepareItemUse(actor, press);

    const { cell, point } = press;
    if (press.source === "seat")
      return () =>
        this.placeGear({
          ...actor,
          ...press.held,
          cell,
          point,
          fallback: "none",
        });
    const { eye, surface, held } = press;
    if (surface.kind === "drawers")
      return () =>
        this.pressDrawer(
          actor,
          { cell, point, eye, kind: surface.sideFace ? "side" : "ray" },
          held,
        );
    if (surface.kind === "floor" && (!held || DRAWER_GEAR_IDS.has(held.item))) {
      const target = this.storage.drawerTarget(actor.vehicleId, {
        eye,
        direction: sub3(surface.drawerPoint, eye),
        cell,
      });
      if (target) {
        // A footprint has no ray intersection to replay on the next tick.
        const hit: DrawerHit = target.floorFootprint
          ? { kind: "footprint", cell: target.cell, point: target.point }
          : { kind: "ray", cell: target.cell, point: surface.drawerPoint, eye };
        return () => this.pressDrawer(actor, hit, held);
      }
      if (!surface.allowPlacementOnMiss) return;
    }
    if (held)
      return () =>
        this.placeGear({
          ...actor,
          ...held,
          cell,
          point,
          eye,
          fallback: "nearestFree",
        });
  }

  private prepareItemUse(
    actor: Actor,
    press: Extract<PressRoomCommand, { source: "itemUse" }>,
  ): (() => Outcome) | undefined {
    const { eye, direction, feet, held } = press;
    if (!DRAWER_GEAR_IDS.has(held.item)) return;
    const target = this.storage.drawerTarget(
      actor.vehicleId,
      { eye, direction, feet },
      held.item,
    );
    if (!target) return;
    const { cell, point, slot } = target;
    if (!target.open)
      return () =>
        this.storage.execute({
          ...actor,
          cell,
          point: add3(eye, direction),
          eye,
          openOnly: true,
          takeContents: false,
        })
          ? "storage"
          : "unchanged";
    // An occupied drawer still claims this tap, including a duplicate itemUse next tick.
    if (!slot) return () => "unchanged";
    return () =>
      this.placeGear({
        ...actor,
        ...held,
        cell,
        point,
        slot,
        fallback: "none",
      });
  }

  private pressDrawer(
    actor: Actor,
    { kind, ...hit }: DrawerHit,
    held: Gear | undefined,
  ): Outcome {
    const cmd = { ...actor, ...hit, drawersSideFace: kind === "side" };
    if (held && kind !== "footprint") {
      if (this.storage.execute({ ...cmd, openOnly: true, takeContents: false }))
        return "storage";
      return this.placeGear({
        ...actor,
        ...hit,
        ...held,
        fallback: "nearestFree",
      });
    }
    if (
      this.storage.execute({
        ...cmd,
        takeContents: kind === "footprint" ? false : undefined,
      })
    )
      return "storage";
    return this.remove.execute({ ...actor, ...hit }) ? "removed" : "unchanged";
  }

  private placeGear(cmd: PlaceDecorCommand): Outcome {
    return this.place.execute(cmd) ? "placed" : "unchanged";
  }
}
