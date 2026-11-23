import { expect, it } from "vitest";
import {
  BUILD_FORM,
  BUILD_MESSAGE,
} from "../../src/infrastructure/build/identifiers";
import { readLang } from "../support/lang";

const locales = ["en_US", "ja_JP"] as const;

it.each(locales)(
  "defines every build message and form label in %s",
  (locale) => {
    const entries = readLang(`packs/yasu_ride_rp/texts/${locale}.lang`);
    for (const [prefix, keys] of [
      ["yasu_build.message.", Object.values(BUILD_MESSAGE)],
      ["yasu_build.form.", Object.values(BUILD_FORM)],
    ] as const) {
      expect(
        [...entries.keys()].filter((key) => key.startsWith(prefix)).sort(),
      ).toEqual(keys.sort());
      for (const key of keys) expect(entries.get(key), key).toBeTruthy();
    }
    expect(entries.get(BUILD_MESSAGE.undoHint)).toContain(
      entries.get(BUILD_FORM.undo),
    );
  },
);

it("keeps format arguments identical in both build locales", () => {
  const english = readLang("packs/yasu_ride_rp/texts/en_US.lang");
  const japanese = readLang("packs/yasu_ride_rp/texts/ja_JP.lang");
  for (const key of [
    ...Object.values(BUILD_MESSAGE),
    ...Object.values(BUILD_FORM),
  ]) {
    expect(japanese.get(key)?.match(/%s/g)?.length ?? 0, key).toBe(
      english.get(key)?.match(/%s/g)?.length ?? 0,
    );
  }
});
