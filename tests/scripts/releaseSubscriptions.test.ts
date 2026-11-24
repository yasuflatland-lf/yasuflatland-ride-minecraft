import { expect, it } from "vitest";
import { checkReleaseSubscriptions } from "../../scripts/release-subscriptions.mjs";

const receiver = (id: string) => `
  system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id !== "${id}") return;
  });
`;

it("accepts the driving-input receiver", () => {
  expect(() =>
    checkReleaseSubscriptions(receiver("yasu_ride:test_input")),
  ).not.toThrow();
});

it("rejects an extra receiver and identifies it", () => {
  expect(() =>
    checkReleaseSubscriptions(
      receiver("yasu_ride:test_input") + receiver("yasu_ride:test_edit"),
    ),
  ).toThrow(/test_edit/);
});

it("rejects a bundle without a receiver", () => {
  expect(() => checkReleaseSubscriptions("")).toThrow(/0/);
});

it("rejects the wrong receiver id", () => {
  expect(() =>
    checkReleaseSubscriptions(receiver("yasu_ride:test_edit")),
  ).toThrow(/test_edit/);
});

it("rejects an unguarded receiver even when the id occurs elsewhere", () => {
  expect(() =>
    checkReleaseSubscriptions(
      '"yasu_ride:test_input"; system.afterEvents.scriptEventReceive.subscribe(() => {});',
    ),
  ).toThrow();
});

it("rejects a second subscription even when it uses the permitted id", () => {
  expect(() =>
    checkReleaseSubscriptions(receiver("yasu_ride:test_input").repeat(2)),
  ).toThrow(/2/);
});

it("finds subscriptions using bracket notation", () => {
  const extra = `system.afterEvents["scriptEventReceive"]["subscribe"](() => {});`;
  expect(() =>
    checkReleaseSubscriptions(receiver("yasu_ride:test_input") + extra),
  ).toThrow(/2/);
});
