import type { Player } from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { registerBuildTool } from "../../../src/infrastructure/build/bedrock/handlers/buildTool";
import { BUILD_TOOL_TYPE } from "../../../src/infrastructure/build/identifiers";

const engine = vi.hoisted(() => ({
  tick: 0,
  use: (_event: { source: Player; itemStack: { typeId: string } }) => {},
}));
vi.mock("@minecraft/server", () => ({
  system: {
    get currentTick() {
      return engine.tick;
    },
  },
  world: {
    afterEvents: {
      itemUse: {
        subscribe: (handler: typeof engine.use) => {
          engine.use = handler;
        },
      },
    },
  },
}));
beforeEach(() => {
  engine.tick = 0;
});
function setup() {
  const menus = {
    showUtilityMenu: vi.fn().mockResolvedValue(undefined),
    showShapeMenu: vi.fn(),
    showRoofMenu: vi.fn(),
    showHeightSlider: vi.fn(),
  };
  registerBuildTool(menus);
  const use = (
    tick: number,
    id = "p",
    typeId = BUILD_TOOL_TYPE,
    isValid = true,
  ) => {
    engine.tick = tick;
    engine.use({ source: { id, isValid } as Player, itemStack: { typeId } });
  };
  return { menus, use };
}
it("opens utility once per held touch and lets another player open", () => {
  const { menus, use } = setup();
  use(0);
  for (const tick of [4, 8, 12, 16]) use(tick);
  expect(menus.showUtilityMenu).toHaveBeenCalledTimes(1);
  use(17, "other");
  use(26);
  expect(menus.showUtilityMenu).toHaveBeenCalledTimes(3);
  expect(menus.showUtilityMenu).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: "p" }),
  );
});
it("ignores other items and invalid players, and opens on foot", () => {
  const { menus, use } = setup();
  use(0, "p", "minecraft:stick");
  use(0, "p", BUILD_TOOL_TYPE, false);
  expect(menus.showUtilityMenu).not.toHaveBeenCalled();
  use(0);
  expect(menus.showUtilityMenu).toHaveBeenCalledTimes(1);
});
