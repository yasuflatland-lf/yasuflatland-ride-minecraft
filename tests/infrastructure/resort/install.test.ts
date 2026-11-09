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
vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/testBeachChair",
  () => ({ registerTestBeachChair: vi.fn() }),
);

import { expect, it, vi } from "vitest";
import { GiveStarterItem } from "../../../src/application/shared/giveStarterItem";
import { ROOF_TENT_STARTER_RECEIVED_PROPERTY } from "../../../src/infrastructure/camp/identifiers";
import {
  BEACH_PARASOL_ITEM,
  BEACH_PARASOL_STARTER_RECEIVED_PROPERTY,
} from "../../../src/infrastructure/resort/identifiers";
import { installResort } from "../../../src/infrastructure/resort/install";
import { registerStarterItem } from "../../../src/infrastructure/shared/starterItem";
import { campTopHosts } from "../../support/campTopHosts";

vi.mock("@minecraft/server", () => ({ world: {} }));

const world = vi.hoisted(() => ({ args: [] as unknown[][] }));
vi.mock("../../../src/infrastructure/shared/starterItem", () => ({
  registerStarterItem: vi.fn(),
  BedrockStarterItemWorld: class {
    constructor(...args: unknown[]) {
      world.args.push(args);
    }
  },
}));
vi.mock(
  "../../../src/infrastructure/resort/bedrock/bedrockParasolPaintWorld",
  () => ({
    BedrockParasolPaintWorld: class {},
  }),
);
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
vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/testParasol",
  () => ({
    registerTestParasol: vi.fn(),
  }),
);

it("registers the parasol starter with its own received flag", () => {
  installResort({
    topHosts: campTopHosts(),
    isVehicleSpace: () => true,
    isCampSpace: () => false,
  });
  expect(registerStarterItem).toHaveBeenCalledExactlyOnceWith(
    expect.any(GiveStarterItem),
  );
  expect(world.args).toEqual([
    [BEACH_PARASOL_ITEM, BEACH_PARASOL_STARTER_RECEIVED_PROPERTY],
  ]);
  expect(BEACH_PARASOL_STARTER_RECEIVED_PROPERTY).not.toBe(
    ROOF_TENT_STARTER_RECEIVED_PROPERTY,
  );
});
