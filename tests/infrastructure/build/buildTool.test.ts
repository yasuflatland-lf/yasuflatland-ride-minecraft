import type { Player } from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { showBuildToolForm } from "../../../src/infrastructure/build/bedrock/buildToolForm";
import type { BuildToolActions } from "../../../src/infrastructure/build/bedrock/editActions";
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
vi.mock("../../../src/infrastructure/build/bedrock/buildToolForm", () => ({
  showBuildToolForm: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  engine.tick = 0;
});

function setup() {
  const actions = {
    fill: vi.fn(),
    replace: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    undo: vi.fn(),
    clearSelection: vi.fn(),
  } satisfies BuildToolActions;
  const forPlayer = vi.fn(() => actions);
  registerBuildTool(forPlayer);
  const use = (tick: number, id = "p", typeId = BUILD_TOOL_TYPE) => {
    engine.tick = tick;
    engine.use({
      source: { id, isValid: true } as Player,
      itemStack: { typeId },
    });
  };
  return { actions, forPlayer, use };
}

it("opens once for a held touch, restarts its idle cooldown on every repeat, and lets another player open", async () => {
  vi.mocked(showBuildToolForm).mockResolvedValue();
  const { use, forPlayer, actions } = setup();
  use(0);
  await vi.waitFor(() => expect(showBuildToolForm).toHaveBeenCalledTimes(1));
  for (const tick of [4, 8, 12, 16]) {
    use(tick);
    await Promise.resolve();
  }
  expect(showBuildToolForm).toHaveBeenCalledTimes(1);
  use(17, "other");
  expect(showBuildToolForm).toHaveBeenCalledTimes(2);
  use(26);
  expect(showBuildToolForm).toHaveBeenCalledTimes(3);
  expect(forPlayer).toHaveBeenLastCalledWith(asPlayerId("p"));
  expect(showBuildToolForm).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: "p" }),
    actions,
  );
});

it("keeps a pending form exclusive even after the cooldown expires and releases it after cancellation", async () => {
  let close: (() => void) | undefined;
  vi.mocked(showBuildToolForm).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        close = resolve;
      }),
  );
  const { use } = setup();
  use(0);
  use(20);
  expect(showBuildToolForm).toHaveBeenCalledTimes(1);
  close?.();
  await Promise.resolve();
  await Promise.resolve();
  use(30);
  expect(showBuildToolForm).toHaveBeenCalledTimes(2);
  close?.();
});

it("ignores other items and opens the form on foot", () => {
  vi.mocked(showBuildToolForm).mockResolvedValue();
  const { use, forPlayer } = setup();
  use(0, "p", "minecraft:stick");
  expect(forPlayer).not.toHaveBeenCalled();
  expect(showBuildToolForm).not.toHaveBeenCalled();
  use(1);
  expect(forPlayer).toHaveBeenCalledExactlyOnceWith(asPlayerId("p"));
  expect(showBuildToolForm).toHaveBeenCalledTimes(1);
});
