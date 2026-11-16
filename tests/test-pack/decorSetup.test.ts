import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  SETUP_LIMIT_TICKS,
  SETUP_POLL_TICKS,
  SETUP_REPORT_TICKS,
  setupProgressStep,
  setupPromptStep,
  setupTimeoutDetail,
} from "../../src/test-pack/decorSetup";

const pieces = ["item frame", "diamond interaction with the frame", "painting"];
const missingPieces = fc.shuffledSubarray(pieces);
const ticks = fc.integer({ min: 0, max: 1200 });

describe("decor setup reporting", () => {
  it("announces the setup actions and timing", () => {
    expect([SETUP_LIMIT_TICKS, SETUP_POLL_TICKS, SETUP_REPORT_TICKS]).toEqual([
      1200, 10, 200,
    ]);
    expect(setupPromptStep()).toEqual({
      name: "setup_prompt",
      pass: true,
      detail:
        "waiting up to 1200 ticks for a player to place the item frame, put the diamond in it and hang the painting",
    });
  });

  it("reports present and missing pieces without changing the inputs", () => {
    fc.assert(
      fc.property(ticks, missingPieces, (elapsed, missing) => {
        const original = [...missing];
        const step = setupProgressStep(elapsed, missing);
        expect(step.name).toBe(`setup_wait_${elapsed}`);
        expect(step.pass).toBe(true);
        const match = /^present: (.*); missing: (.*); ticks=(\d+)$/.exec(
          step.detail,
        );
        expect(match).not.toBeNull();
        expect(match?.[1]).toBe(
          pieces.filter((piece) => !missing.includes(piece)).join(", ") ||
            "none",
        );
        expect(match?.[2]).toBe(missing.join(", ") || "none");
        expect(Number(match?.[3])).toBe(elapsed);
        expect(missing).toEqual(original);
      }),
    );
  });

  it("identifies the waited ticks and missing player actions on timeout", () => {
    fc.assert(
      fc.property(ticks, missingPieces, (elapsed, missing) => {
        expect(setupTimeoutDetail(elapsed, missing)).toBe(
          `no player action within ${elapsed} ticks: missing ${missing.join(", ")}`,
        );
      }),
    );
  });
});
