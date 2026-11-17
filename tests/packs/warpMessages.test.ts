import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { WARP_MESSAGE } from "../../src/infrastructure/warp/messages";

it.each(["en_US", "ja_JP"])("translates every warp message in %s", (locale) => {
  const lines = readFileSync(
    `packs/yasu_ride_rp/texts/${locale}.lang`,
    "utf8",
  ).split("\n");
  for (const key of Object.values(WARP_MESSAGE)) {
    expect(key).toMatch(/^yasu_build\.warp\./);
    const matches = lines.filter((line) => line.startsWith(`${key}=`));
    expect(matches, key).toHaveLength(1);
    expect(matches[0]?.slice(key.length + 1).trim(), key).not.toBe("");
  }
});
