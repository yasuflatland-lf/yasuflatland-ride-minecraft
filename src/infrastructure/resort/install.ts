import { BeachChairMenu } from "../../application/resort/beachChairMenu";
import { PaintParasol } from "../../application/resort/paintParasol";
import { PlaceBeachChair } from "../../application/resort/placeBeachChair";
import { PlaceParasol } from "../../application/resort/placeParasol";
import { SwitchBeachChairForm } from "../../application/resort/switchBeachChairForm";
import { SyncParasolCeilings } from "../../application/resort/syncParasolCeilings";
import { TakeBackBeachChair } from "../../application/resort/takeBackBeachChair";
import { TakeBackParasol } from "../../application/resort/takeBackParasol";
import { GiveStarterItem } from "../../application/shared/giveStarterItem";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { Repaint } from "../../application/shared/repaint";
import { BEACH_CHAIR_SPEC } from "../../domain/resort/spec";
import {
  BedrockStarterItemWorld,
  registerStarterItem,
} from "../shared/starterItem";
import type {
  PlaceHostedOnTop,
  TopHostRegistry,
} from "../shared/tableTop/registry";
import { BedrockBeachChairWorld } from "./bedrock/bedrockBeachChairWorld";
import { BedrockParasolPaintWorld } from "./bedrock/bedrockParasolPaintWorld";
import { BedrockParasolWorld } from "./bedrock/bedrockParasolWorld";
import { registerBeachChairHits } from "./bedrock/handlers/beachChairHits";
import { registerBeachChairInteraction } from "./bedrock/handlers/beachChairInteraction";
import { registerBeachChairLifecycle } from "./bedrock/handlers/beachChairLifecycle";
import { registerBeachChairPlacement } from "./bedrock/handlers/beachChairPlacement";
import { registerParasolHits } from "./bedrock/handlers/hits";
import { registerParasolLifecycle } from "./bedrock/handlers/lifecycle";
import { registerParasolPlacement } from "./bedrock/handlers/placement";
import { registerTestBeachChair } from "./bedrock/handlers/testBeachChair";
import { registerTestParasol } from "./bedrock/handlers/testParasol";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_TOP_REFUSAL_HINTS,
  BEACH_PARASOL_ITEM,
  BEACH_PARASOL_STARTER_RECEIVED_PROPERTY,
} from "./identifiers";

export function installResort(deps: {
  topHosts: TopHostRegistry;
  placeHostedOnTop: PlaceHostedOnTop;
  isVehicleSpace: SpaceCheck;
  isCampSpace: SpaceCheck;
}): void {
  const chair = new BedrockBeachChairWorld(deps);
  deps.topHosts.registerHost({
    hostType: "beach_chair",
    entityTypeId: BEACH_CHAIR,
    surface: {
      half: BEACH_CHAIR_SPEC.topHalf,
      topPx: BEACH_CHAIR_SPEC.topPx,
      limit: BEACH_CHAIR_SPEC.topLimit,
      clearanceBase: 1,
    },
    isTopNow: (entity) => entity.getProperty(BEACH_CHAIR_FOLDED) === true,
    blockedAt: (entity, at, footprint) =>
      chair.blockedAt(entity, at, footprint),
    refusalHints: BEACH_CHAIR_TOP_REFUSAL_HINTS,
  });
  const takeChair = new TakeBackBeachChair(chair);
  registerBeachChairPlacement(new PlaceBeachChair(chair));
  const form = new SwitchBeachChairForm(chair);
  registerBeachChairHits(takeChair, (dimension, cell, typeId) =>
    chair.topOwner(dimension, cell, typeId),
  );
  registerBeachChairInteraction(
    chair,
    form,
    new BeachChairMenu(form, () => {}),
    deps.placeHostedOnTop,
  );
  registerBeachChairLifecycle(chair);
  registerTestBeachChair(chair, takeChair, deps, form);
  registerStarterItem(
    new GiveStarterItem(
      new BedrockStarterItemWorld(
        BEACH_PARASOL_ITEM,
        BEACH_PARASOL_STARTER_RECEIVED_PROPERTY,
      ),
    ),
  );
  const adapter = new BedrockParasolWorld(deps);
  registerParasolPlacement(new PlaceParasol(adapter));
  const takeBack = new TakeBackParasol(adapter);
  registerParasolHits(
    takeBack,
    new PaintParasol(new Repaint(new BedrockParasolPaintWorld())),
  );
  registerTestParasol(adapter, takeBack, deps);
  registerParasolLifecycle(adapter, new SyncParasolCeilings(adapter));
}
