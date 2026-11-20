import { globSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps vehicle production code from calling this.inspect()", () => {
  const callers = globSync("src/domain/vehicle/**/*.ts").filter((file) =>
    /\bthis\s*\.\s*inspect\s*\(/.test(readFileSync(file, "utf8")),
  );
  expect(callers).toEqual([]);
});
