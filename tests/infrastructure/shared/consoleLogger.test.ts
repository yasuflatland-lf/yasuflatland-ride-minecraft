import { expect, it, vi } from "vitest";
import { consoleLogger } from "../../../src/infrastructure/shared/consoleLogger";

it.each(["unavailable", ""])(
  "warns with the namespace prefix: %s",
  (message) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      consoleLogger.warn(message);
      expect(warn).toHaveBeenCalledExactlyOnceWith(`[yasu_ride] ${message}`);
    } finally {
      warn.mockRestore();
    }
  },
);
