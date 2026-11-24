import { beforeEach, expect, it, vi } from "vitest";
import { TickShows } from "../../../src/application/resort/tickShows";
import { UseToilet } from "../../../src/application/resort/useToilet";
import { UseWashstand } from "../../../src/application/resort/useWashstand";
import { WatchToiletDismount } from "../../../src/application/resort/watchToiletDismount";
import { FURNITURE_SPEC } from "../../../src/domain/resort/furniture";
import { BEACH_CHAIR_SPEC } from "../../../src/domain/resort/spec";
import { ROOF_TENT_STARTER_RECEIVED_PROPERTY } from "../../../src/infrastructure/camp/identifiers";
import { registerFurnitureHits } from "../../../src/infrastructure/resort/bedrock/handlers/furnitureHits";
import { registerFurnitureTopLifecycle } from "../../../src/infrastructure/resort/bedrock/handlers/furnitureTopLifecycle";
import { registerShowLifecycle } from "../../../src/infrastructure/resort/bedrock/handlers/showLifecycle";
import { registerToiletInteraction } from "../../../src/infrastructure/resort/bedrock/handlers/toiletInteraction";
import { registerWashstandInteraction } from "../../../src/infrastructure/resort/bedrock/handlers/washstandInteraction";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_TOP_REFUSAL_HINTS,
  BEACH_PARASOL_ITEM,
  BEACH_PARASOL_STARTER_RECEIVED_PROPERTY,
  DINING_TABLE_TOP_REFUSAL_HINTS,
  FURNITURE_IDS,
} from "../../../src/infrastructure/resort/identifiers";
import { installResort } from "../../../src/infrastructure/resort/install";
import { installResortTestHooks } from "../../../src/infrastructure/resort/testHooks/install";
import { registerTestFurniture } from "../../../src/infrastructure/resort/testHooks/testFurniture";
import { registerTestToilet } from "../../../src/infrastructure/resort/testHooks/testToilet";
import { registerTestWashstand } from "../../../src/infrastructure/resort/testHooks/testWashstand";
import { registerStarterItem } from "../../../src/infrastructure/shared/starterItem";
import { TopHostRegistry } from "../../../src/infrastructure/shared/tableTop/registry";
import { defined } from "../../support/defined";

vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/showLifecycle",
  () => ({ registerShowLifecycle: vi.fn() }),
);

vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/toiletInteraction",
  () => ({ registerToiletInteraction: vi.fn() }),
);

vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/washstandInteraction",
  () => ({ registerWashstandInteraction: vi.fn() }),
);

vi.mock("../../../src/infrastructure/resort/testHooks/testToilet", () => ({
  registerTestToilet: vi.fn(),
}));

vi.mock("../../../src/infrastructure/resort/testHooks/testWashstand", () => ({
  registerTestWashstand: vi.fn(),
}));

vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/furnitureTopInteraction",
  () => ({ registerFurnitureTopInteraction: vi.fn() }),
);
vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/furnitureTopLifecycle",
  () => ({ registerFurnitureTopLifecycle: vi.fn() }),
);

vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/furniturePlacement",
  () => ({ registerFurniturePlacement: vi.fn() }),
);
vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/furnitureHits",
  () => ({ registerFurnitureHits: vi.fn() }),
);
vi.mock("../../../src/infrastructure/resort/testHooks/testFurniture", () => ({
  registerTestFurniture: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({ world: {}, system: {} }));
vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/beachChairInteraction",
  () => ({ registerBeachChairInteraction: vi.fn() }),
);
vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/beachChairLifecycle",
  () => ({ registerBeachChairLifecycle: vi.fn() }),
);
vi.mock(
  "../../../src/infrastructure/resort/bedrock/bedrockBeachChairWorld",
  () => ({ BedrockBeachChairWorld: class {} }),
);
vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/beachChairPlacement",
  () => ({ registerBeachChairPlacement: vi.fn() }),
);
vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/beachChairHits",
  () => ({ registerBeachChairHits: vi.fn() }),
);
vi.mock("../../../src/infrastructure/resort/testHooks/testBeachChair", () => ({
  registerTestBeachChair: vi.fn(),
}));

const starterWorld = vi.hoisted(() => vi.fn());
vi.mock("../../../src/infrastructure/shared/starterItem", () => ({
  registerStarterItem: vi.fn(),
  BedrockStarterItemWorld: starterWorld,
}));
vi.mock("../../../src/infrastructure/shared/dyes", () => ({
  BedrockVariantPaintWorld: class {},
}));
vi.mock(
  "../../../src/infrastructure/resort/bedrock/bedrockParasolWorld",
  () => ({
    BedrockParasolWorld: class {},
  }),
);
vi.mock("../../../src/infrastructure/resort/bedrock/handlers/hits", () => ({
  registerParasolHits: vi.fn(),
}));
vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/lifecycle",
  () => ({
    registerParasolLifecycle: vi.fn(),
  }),
);
vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/placement",
  () => ({
    registerParasolPlacement: vi.fn(),
  }),
);
vi.mock("../../../src/infrastructure/resort/testHooks/testParasol", () => ({
  registerTestParasol: vi.fn(),
}));

vi.mock(import("../../../src/application/resort/watchToiletDismount"), {
  spy: true,
});
vi.mock(import("../../../src/application/resort/tickShows"), { spy: true });
vi.mock(import("../../../src/application/resort/useToilet"), { spy: true });
vi.mock(import("../../../src/application/resort/useWashstand"), { spy: true });

beforeEach(() => vi.clearAllMocks());

function onlyCall<T>(calls: T[]): T {
  expect(calls).toHaveLength(1);
  return defined(calls[0], "expected one call during installation");
}

function install() {
  const topHosts = new TopHostRegistry();
  const parts = installResort({
    topHosts,
    isVehicleSpace: () => true,
    isCampSpace: () => false,
    placeHostedOnTop: () => false,
  });
  installResortTestHooks(parts);
  return topHosts;
}

it("shares the show state and sound between the interactions, lifecycle and test hooks", () => {
  install();
  const [states, sound] = onlyCall(vi.mocked(registerTestToilet).mock.calls);
  const [watch, shows] = onlyCall(vi.mocked(registerShowLifecycle).mock.calls);
  const [washstand, useWashstand] = onlyCall(
    vi.mocked(registerTestWashstand).mock.calls,
  );
  expect(watch).toBe(vi.mocked(WatchToiletDismount).mock.instances[0]);
  expect(shows).toBe(vi.mocked(TickShows).mock.instances[0]);
  const [, watchStates, watchSound] = onlyCall(
    vi.mocked(WatchToiletDismount).mock.calls,
  );
  const [, , tickStates] = onlyCall(vi.mocked(TickShows).mock.calls);
  const [useToilet] = onlyCall(vi.mocked(registerToiletInteraction).mock.calls);
  const [, toiletStates, toiletWatch] = onlyCall(
    vi.mocked(UseToilet).mock.calls,
  );
  expect(useToilet).toBe(vi.mocked(UseToilet).mock.instances[0]);
  expect(toiletStates).toBe(states);
  expect(toiletWatch).toBe(watch);
  expect(watchStates).toBe(states);
  expect(watchSound).toBe(sound);
  expect(tickStates).toBe(states);
  const [world, washstandStates, washstandSound] = onlyCall(
    vi.mocked(UseWashstand).mock.calls,
  );
  expect(world).toBe(washstand);
  expect(washstandStates).toBe(states);
  expect(washstandSound).toBe(sound);
  expect(useWashstand).toBe(vi.mocked(UseWashstand).mock.instances[0]);
  expect(vi.mocked(registerWashstandInteraction).mock.calls[0]?.[0]).toBe(
    useWashstand,
  );
});

it("shares the furniture world and take-back action with the lifecycle and test hook", () => {
  const topHosts = install();
  const [takeBack, world] = onlyCall(
    vi.mocked(registerFurnitureHits).mock.calls,
  );
  const [testWorld, testTakeBack, deps] = onlyCall(
    vi.mocked(registerTestFurniture).mock.calls,
  );
  expect(testWorld).toBe(world);
  expect(testTakeBack).toBe(takeBack);
  expect(deps.topHosts).toBe(topHosts);
  expect(vi.mocked(registerFurnitureTopLifecycle).mock.calls[0]?.[0]).toBe(
    world,
  );
});

it("hosts items on a folded beach chair and a dining table", () => {
  const topHosts = install();
  const chair = (folded: boolean | undefined) =>
    topHosts.hostTypeOf({
      typeId: BEACH_CHAIR,
      getProperty: (key: string) =>
        key === BEACH_CHAIR_FOLDED ? folded : undefined,
    } as never);
  expect(chair(true)).toMatchObject({
    hostType: "beach_chair",
    surface: {
      half: BEACH_CHAIR_SPEC.topHalf,
      topPx: BEACH_CHAIR_SPEC.topPx,
      limit: BEACH_CHAIR_SPEC.topLimit,
      clearanceBase: 0,
    },
    refusalHints: BEACH_CHAIR_TOP_REFUSAL_HINTS,
  });
  expect(chair(false)).toBeUndefined();
  expect(chair(undefined)).toBeUndefined();
  expect(
    topHosts.hostTypeOf({ typeId: FURNITURE_IDS.dining_table.entity } as never),
  ).toMatchObject({
    hostType: "dining_table",
    surface: FURNITURE_SPEC.dining_table.top,
    refusalHints: DINING_TABLE_TOP_REFUSAL_HINTS,
    blockedAt: expect.any(Function),
  });
  expect(
    topHosts.hostTypeOf({ typeId: FURNITURE_IDS.dining_chair.entity } as never),
  ).toBeUndefined();
});

it("registers the parasol starter with its own receipt flag", () => {
  install();
  expect(registerStarterItem).toHaveBeenCalledOnce();
  expect(starterWorld).toHaveBeenCalledExactlyOnceWith(
    BEACH_PARASOL_ITEM,
    BEACH_PARASOL_STARTER_RECEIVED_PROPERTY,
  );
  expect(BEACH_PARASOL_STARTER_RECEIVED_PROPERTY).not.toBe(
    ROOF_TENT_STARTER_RECEIVED_PROPERTY,
  );
});
