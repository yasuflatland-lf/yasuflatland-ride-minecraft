vi.mock("@minecraft/server", () => ({ world: {} }));
vi.mock(
  "../../../src/infrastructure/resort/bedrock/handlers/beachChairInteraction",
  () => ({ registerBeachChairInteraction: vi.fn() }),
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
import { BeachChairMenu } from "../../../src/application/resort/beachChairMenu";
import { SwitchBeachChairForm } from "../../../src/application/resort/switchBeachChairForm";
import { TakeBackBeachChair } from "../../../src/application/resort/takeBackBeachChair";
import { GiveStarterItem } from "../../../src/application/shared/giveStarterItem";
import { BEACH_CHAIR_SPEC } from "../../../src/domain/resort/spec";
import { ROOF_TENT_STARTER_RECEIVED_PROPERTY } from "../../../src/infrastructure/camp/identifiers";
import { registerBeachChairHits } from "../../../src/infrastructure/resort/bedrock/handlers/beachChairHits";
import { registerBeachChairInteraction } from "../../../src/infrastructure/resort/bedrock/handlers/beachChairInteraction";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_TOP_REFUSAL_HINTS,
  BEACH_PARASOL_ITEM,
  BEACH_PARASOL_STARTER_RECEIVED_PROPERTY,
} from "../../../src/infrastructure/resort/identifiers";
import { installResort } from "../../../src/infrastructure/resort/install";
import { registerStarterItem } from "../../../src/infrastructure/shared/starterItem";
import { TopHostRegistry } from "../../../src/infrastructure/shared/tableTop/registry";

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

it("registers folded chair hosting and the parasol starter with its own flag", () => {
  const topHosts = new TopHostRegistry();
  const register = vi.spyOn(topHosts, "registerHost");
  installResort({
    topHosts,
    isVehicleSpace: () => true,
    isCampSpace: () => false,
  });
  expect(register).toHaveBeenCalledExactlyOnceWith({
    hostType: "beach_chair",
    entityTypeId: BEACH_CHAIR,
    surface: {
      half: BEACH_CHAIR_SPEC.topHalf,
      topPx: 7,
      limit: 2,
      clearanceBase: 0,
    },
    isTopNow: expect.any(Function),
    refusalHints: BEACH_CHAIR_TOP_REFUSAL_HINTS,
  });
  const host = register.mock.calls[0]?.[0];
  for (const folded of [true, false, undefined]) {
    const getProperty = vi.fn(() => folded);
    expect(host?.isTopNow({ getProperty } as never)).toBe(folded === true);
    expect(getProperty).toHaveBeenCalledExactlyOnceWith(BEACH_CHAIR_FOLDED);
  }
  expect(registerBeachChairHits).toHaveBeenCalledExactlyOnceWith(
    expect.any(TakeBackBeachChair),
  );
  expect(registerBeachChairInteraction).toHaveBeenCalledExactlyOnceWith(
    expect.any(SwitchBeachChairForm),
    expect.any(BeachChairMenu),
  );
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
