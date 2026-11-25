import { distanceXZ, type Vec3 } from "../../shared/vec";
import { SPEC } from "../spec";
import {
  type CompassPoint,
  compassPoint,
  type RoundedDistance,
  roundedDistance,
} from "./compass";
import type { RadarPlaceType } from "./radarTargets";

export interface RadarHit {
  place: RadarPlaceType;
  location: Vec3;
}

export interface RadarPlace {
  place: RadarPlaceType;
  center: Vec3;
}

export interface RadarReport {
  place: RadarPlaceType;
  direction: CompassPoint;
  distance: RoundedDistance;
}

export function clusterHits(hits: readonly RadarHit[]): RadarPlace[] {
  const unassigned = [...hits];
  const places: RadarPlace[] = [];
  for (let seed = unassigned.shift(); seed; seed = unassigned.shift()) {
    const cluster = [seed];
    let x = 0;
    let y = 0;
    let z = 0;
    // Newly found neighbors extend the cluster even if they are far from its seed.
    for (const { location } of cluster) {
      x += location.x;
      y += location.y;
      z += location.z;
      for (let i = unassigned.length - 1; i >= 0; i--) {
        const hit = unassigned[i];
        if (
          hit?.place === seed.place &&
          distanceXZ(hit.location, location) <= SPEC.radarClusterRadius
        ) {
          cluster.push(hit);
          unassigned.splice(i, 1);
        }
      }
    }
    places.push({
      place: seed.place,
      center: {
        x: x / cluster.length,
        y: y / cluster.length,
        z: z / cluster.length,
      },
    });
  }
  return places;
}

export class RadarMemory {
  private readonly known: RadarPlace[] = [];
  private readonly pending = new Set<RadarPlace>();

  offer(places: readonly RadarPlace[]): void {
    for (const place of places) {
      if (
        this.known.some(
          (known) =>
            known.place === place.place &&
            distanceXZ(known.center, place.center) <= SPEC.radarClusterRadius,
        )
      )
        continue;
      this.known.push(place);
      this.pending.add(place);
    }
  }

  next(from: Vec3): RadarReport | undefined {
    let nearest: RadarPlace | undefined;
    let nearestDistance = Infinity;
    for (const place of this.pending) {
      const distance = distanceXZ(from, place.center);
      if (distance <= SPEC.radarRadius && distance < nearestDistance) {
        nearest = place;
        nearestDistance = distance;
      }
    }
    if (!nearest) return undefined;
    this.pending.delete(nearest);
    return {
      place: nearest.place,
      direction: compassPoint(from, nearest.center),
      distance: roundedDistance(from, nearest.center),
    };
  }
}
