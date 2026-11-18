import type { Player } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockRiderPose } from "../../../src/infrastructure/vehicle/bedrock/bedrockRiderPose";
import type { EntityIndex } from "../../../src/infrastructure/vehicle/bedrock/entityIndex";

function fixture() {
  const player = { isValid: true, playAnimation: vi.fn() };
  const lookup = vi.fn((): Player | undefined => player as unknown as Player);
  const adapter = new BedrockRiderPose({
    player: lookup,
  } as unknown as EntityIndex);
  return { player, lookup, adapter, id: asPlayerId("rider") };
}
it("plays the full animation and clears the last pose once with immediate stop", () => {
  const { player, adapter, id } = fixture();
  adapter.play(id, "scooter_lean_l2");
  expect(player.playAnimation).toHaveBeenCalledExactlyOnceWith(
    "animation.yasu_ride.player.scooter_lean_l2",
    {
      controller: "yasu_ride.scooter_pose",
      blendOutTime: 0.15,
      stopExpression: "!query.is_riding",
    },
  );
  adapter.clear(id);
  expect(player.playAnimation).toHaveBeenLastCalledWith(
    "animation.yasu_ride.player.scooter_lean_l2",
    {
      controller: "yasu_ride.scooter_pose",
      blendOutTime: 0.15,
      stopExpression: "1",
    },
  );
  adapter.clear(id);
  expect(player.playAnimation).toHaveBeenCalledTimes(2);
});
it("replays an unchanged pose without a blend so the arms do not jump", () => {
  const { player, adapter, id } = fixture();
  adapter.play(id, "scooter_grip");
  adapter.play(id, "scooter_grip");
  adapter.play(id, "scooter_lean_l1");
  adapter.play(id, "scooter_lean_l1");
  expect(
    player.playAnimation.mock.calls.map(([, options]) => options.blendOutTime),
  ).toEqual([0.15, 0, 0.15, 0]);
});
it("ignores missing and invalid players", () => {
  const { player, lookup, adapter, id } = fixture();
  lookup.mockReturnValueOnce(undefined);
  adapter.play(id, "pose");
  player.isValid = false;
  adapter.play(id, "pose");
  adapter.clear(id);
  expect(player.playAnimation).not.toHaveBeenCalled();
});
it("catches playback errors including clear and forgets the cleared pose", () => {
  const { player, adapter, id } = fixture();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  adapter.play(id, "custom_pose");
  player.playAnimation.mockImplementation(() => {
    throw new Error("animation");
  });
  expect(() => adapter.clear(id)).not.toThrow();
  adapter.clear(id);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(() => adapter.play(id, "custom_pose")).not.toThrow();
  expect(warn).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});
