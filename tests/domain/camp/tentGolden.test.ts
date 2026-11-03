import { describe, expect, it } from "vitest";
import {
  insideTent,
  lanternCell,
  type TentPose,
  type TentState,
  tentCells,
  tentClearCells,
  tentEntityLocation,
  tentFootprintBox,
  tentGroundCells,
} from "../../../src/domain/camp/tent";
import golden from "./fixtures/tentGolden.json";

const states: Record<string, TentState> = {
  pitched: { openFlaps: new Set(), lanternOn: false },
  allOpen: {
    openFlaps: new Set(["front", "left", "right", "bedroom"]),
    lanternOn: true,
  },
  frontLeft: { openFlaps: new Set(["front", "left"]), lanternOn: false },
  bedroomLit: { openFlaps: new Set(["bedroom"]), lanternOn: true },
};

function poseOf(pose: (typeof golden.inside)[number]["pose"]): TentPose {
  const { yaw } = pose;
  if (yaw !== 0 && yaw !== 90 && yaw !== 180 && yaw !== -90)
    throw new Error(`Unexpected golden yaw: ${yaw}`);
  return { ...pose, yaw };
}

describe("pre-refactor tent golden outputs", () => {
  it("preserves every laid cell, block state, and their order", () => {
    expect(
      golden.cells.map(({ pose, state }) => {
        const current = states[state];
        if (current === undefined) throw new Error(`Unknown state: ${state}`);
        return { pose, state, cells: tentCells(poseOf(pose), current) };
      }),
    ).toEqual(golden.cells);
  });

  it("preserves clear cells, ground cells, boxes, entity locations, and lanterns", () => {
    expect(
      golden.clear.map(({ pose }) => ({
        pose,
        cells: tentClearCells(poseOf(pose)),
      })),
    ).toEqual(golden.clear);
    expect(
      golden.ground.map(({ pose }) => ({
        pose,
        cells: tentGroundCells(poseOf(pose)),
      })),
    ).toEqual(golden.ground);
    expect(
      golden.box.map(({ pose }) => ({
        pose,
        box: tentFootprintBox(poseOf(pose)),
      })),
    ).toEqual(golden.box);
    expect(
      golden.entity.map(({ pose }) => ({
        pose,
        at: tentEntityLocation(poseOf(pose)),
      })),
    ).toEqual(golden.entity);
    expect(
      golden.lantern.map(({ pose }) => ({
        pose,
        at: lanternCell(poseOf(pose)),
      })),
    ).toEqual(golden.lantern);
  });

  it("preserves inside hits across whole and fractional feet positions", () => {
    expect(
      golden.inside.map(({ pose }) => {
        const hits: string[] = [];
        for (let dx = -14; dx <= 14; dx++)
          for (let dz = -14; dz <= 14; dz++)
            for (const dy of [-1, 0, 1, 2, 3, 4])
              for (const f of [0, 0.5, 0.99]) {
                const feet = {
                  x: pose.x + dx + f,
                  y: pose.y + dy,
                  z: pose.z + dz + f,
                };
                if (insideTent(poseOf(pose), feet))
                  hits.push(`${feet.x},${feet.y},${feet.z}`);
              }
        return { pose, hits };
      }),
    ).toEqual(golden.inside);
  });
});
