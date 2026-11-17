import { expect, it } from "vitest";
import { withCleanup } from "../../src/test-pack/cleanup";

it("keeps the body error when cleanup also fails, including undefined throws", async () => {
  for (const error of [new Error("body failed"), undefined]) {
    let cleaned = false;
    const result = withCleanup(
      async () => {
        throw error;
      },
      () => {
        cleaned = true;
        throw new Error("cleanup failed");
      },
    );
    await expect(result).rejects.toBe(error);
    expect(cleaned).toBe(true);
  }
});
it("fails on cleanup errors after a successful body", async () => {
  const error = new Error("cleanup failed");
  await expect(
    withCleanup(
      async () => 42,
      async () => {
        throw error;
      },
    ),
  ).rejects.toBe(error);
});
it("returns the body result after cleanup finishes", async () => {
  let cleaned = false;
  const value = await withCleanup(
    async () => 42,
    async () => {
      cleaned = true;
    },
  );
  expect(value).toBe(42);
  expect(cleaned).toBe(true);
});
