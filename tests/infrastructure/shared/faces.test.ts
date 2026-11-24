import { Direction } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { blockFaceOf } from "../../../src/infrastructure/shared/faces";

vi.mock("@minecraft/server", () => ({
  Direction: {
    Up: "Up",
    Down: "Down",
    North: "North",
    South: "South",
    East: "East",
    West: "West",
  },
}));

it.each(Object.values(Direction))(
  "maps the Bedrock direction %s to its block face",
  (direction) => {
    expect(blockFaceOf(direction)).toBe(direction.toLowerCase());
  },
);
