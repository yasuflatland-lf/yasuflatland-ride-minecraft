import { expect, it, vi } from "vitest";
import { AimHeight } from "../../../src/application/build/aimHeight";
import { ConfirmLiveHeight } from "../../../src/application/build/confirmLiveHeight";
import { FixStairGoal } from "../../../src/application/build/fixStairGoal";
import { SetPoint } from "../../../src/application/build/setPoint";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { Debounces } from "../../../src/domain/shared/debounce";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import { registerTapTarget } from "../../../src/infrastructure/build/bedrock/handlers/tapTarget";
import {
  SELECTION_WAND_TYPE,
  TAP_TARGET_TYPE,
} from "../../../src/infrastructure/build/identifiers";
import {
  FakeAimReader,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  nether,
} from "../../application/build/fakes";

const engine = vi.hoisted(() => ({
  hit: vi.fn(),
  interact: vi.fn(),
  run: vi.fn(),
  tick: 0,
}));
vi.mock("@minecraft/server", () => ({
  world: {
    afterEvents: { entityHitEntity: { subscribe: engine.hit } },
    beforeEvents: { playerInteractWithEntity: { subscribe: engine.interact } },
  },
  system: {
    run: engine.run,
    get currentTick() {
      return engine.tick;
    },
  },
}));

const playerId = asPlayerId("owner");
const start = { x: 0, y: 64, z: 0 };
const cell = { x: 3, y: 66, z: 2 };
const target = { id: "target", typeId: TAP_TARGET_TYPE };

function setup({ ownsTarget = true, holdsWand = true } = {}) {
  vi.clearAllMocks();
  engine.tick = 0;
  const repo = new FakeSessions();
  const blocks = new FakeWorld();
  blocks.put(start, blockStateOf("minecraft:stone"));
  const feedback = new FakeFeedback();
  const aim = new FakeAimReader();
  aim.target = {
    input: "touch",
    ray: {
      origin: { x: 0, y: 65, z: -2 },
      direction: { x: 0, y: 1, z: 1 },
    },
  };
  const setPoint = new SetPoint(repo, blocks, feedback);
  const confirmLiveHeight = new ConfirmLiveHeight(repo);
  setPoint.execute({ playerId, dimensionId: nether, cell: start });
  const session = repo.getOrCreate(playerId);
  const debounce = new Debounces<PlayerId>(BUILD_SPEC.pressDebounceTicks);
  const menus = {
    showBuildMenu: vi.fn(),
    showContentsMenu: vi.fn(),
    showTerraceMenu: vi.fn(),
    showStairContentsMenu: vi.fn(),
    showUtilityMenu: vi.fn(),
    showPasteMenu: vi.fn(),
    showHeightSlider: vi.fn(),
  };
  registerTapTarget({
    repo,
    aim,
    setPoint,
    aimHeight: new AimHeight(repo),
    confirmLiveHeight,
    fixStairGoal: new FixStairGoal(repo, feedback, aim),
    debounce,
    menus,
    targets: {
      ownerOf: (id) =>
        id === target.id
          ? {
              playerId: ownsTarget ? playerId : asPlayerId("other"),
              dimensionId: nether,
              cell,
            }
          : undefined,
    },
  });
  const player = {
    id: playerId,
    typeId: "minecraft:player",
    isValid: true,
    isSneaking: false,
    selectedSlotIndex: 0,
    getComponent: () => ({
      container: {
        getItem: () =>
          holdsWand ? { typeId: SELECTION_WAND_TYPE } : undefined,
      },
    }),
  };
  return {
    session,
    feedback,
    menus,
    debounce,
    fixEnd: () => setPoint.execute({ playerId, dimensionId: nether, cell }),
    confirmHeight: () => confirmLiveHeight.execute({ playerId }),
    hit: () =>
      engine.hit.mock.lastCall?.[0]({
        damagingEntity: player,
        hitEntity: target,
      }),
    interact: () => {
      const ev = { player, target, cancel: false };
      engine.interact.mock.lastCall?.[0](ev);
      return ev;
    },
    flush: () => {
      for (const [run] of engine.run.mock.calls) run();
    },
  };
}

it("fixes the endpoint at the player's tap target cell", () => {
  const f = setup();
  f.hit();
  expect(f.session.flow).toMatchObject({ kind: "baseHeight", to: cell });
});

it("confirms live height and opens the shape menu once across repeated hits", () => {
  const f = setup();
  f.fixEnd();
  f.hit();
  f.hit();
  expect(f.session.flow.kind).toBe("selected");
  expect(
    f.feedback.messages.filter(({ message }) => message === "endSet"),
  ).toHaveLength(0);
  expect(f.menus.showUtilityMenu).toHaveBeenCalledTimes(1);
});

it("requests one shape menu across repeated hits in selected", () => {
  const f = setup();
  f.fixEnd();
  f.confirmHeight();
  f.hit();
  f.hit();
  expect(f.menus.showUtilityMenu).toHaveBeenCalledTimes(1);
});

it.each([true, false])(
  "counts hit and interact once (hit first: %s)",
  (hitFirst) => {
    const f = setup();
    if (hitFirst) f.hit();
    expect(f.interact().cancel).toBe(true);
    if (!hitFirst) {
      expect(f.session.flow.kind).toBe("point1");
      expect(f.debounce.ready(playerId, engine.tick)).toBe(false);
      f.hit();
    }
    f.flush();
    expect(f.session.flow).toMatchObject({ kind: "baseHeight", to: cell });
  },
);

it.each([{ ownsTarget: false }, { holdsWand: false }])(
  "ignores ineligible presses but still cancels interaction (%j)",
  (options) => {
    const f = setup(options);
    f.hit();
    expect(f.interact().cancel).toBe(true);
    f.flush();
    expect(f.session.flow.kind).toBe("point1");
    expect(f.debounce.ready(playerId, engine.tick)).toBe(true);
  },
);
