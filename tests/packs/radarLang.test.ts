import { expect, it } from "vitest";
import { readLang } from "../support/lang";

it.each(["en_US", "ja_JP"])(
  "translates every radar message in %s",
  (locale) => {
    const lang = readLang(`packs/yasu_ride_rp/texts/${locale}.lang`);
    expect(lang.get("yasu_ride.radar.report")).toBe("%1 %2 m: %3");
    for (const place of [
      "village",
      "pillager_outpost",
      "ocean_monument",
      "woodland_mansion",
      "witch_hut",
    ]) {
      expect(lang.get(`yasu_ride.radar.place.${place}`)).toBeTruthy();
    }
    for (const point of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) {
      expect(lang.get(`yasu_ride.radar.dir.${point}`)).toBe(
        point.toUpperCase(),
      );
    }
  },
);
