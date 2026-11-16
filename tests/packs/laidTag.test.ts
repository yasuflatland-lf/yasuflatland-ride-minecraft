import { expect, it } from "vitest";
import { LAID_BLOCK_TAG } from "../../src/infrastructure/shared/identifiers";
import { jsonFileEntries } from "../support/packFiles";

it("tags every block the add-on lays so a blade cut keeps it (ADR 0137)", () => {
  const blocks = jsonFileEntries("packs/yasu_ride_bp").filter((e) =>
    e.path.startsWith("blocks/"),
  );
  expect(blocks.length).toBeGreaterThan(0);
  for (const { path, json } of blocks) {
    const block = json["minecraft:block"] as {
      components: Record<string, unknown>;
    };
    expect(block.components[`tag:${LAID_BLOCK_TAG}`], path).toEqual({});
  }
});
it("names the tag yasu_ride:laid", () =>
  expect(LAID_BLOCK_TAG).toBe("yasu_ride:laid"));
