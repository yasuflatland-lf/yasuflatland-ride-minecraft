import { BeachChairMenu } from "../../application/resort/beachChairMenu";
import { LieOnBeachChair } from "../../application/resort/lieOnBeachChair";
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
import {
  BedrockStarterItemWorld,
  registerStarterItem,
} from "../shared/starterItem";
import type { TopHostRegistry } from "../shared/tableTop/registry";
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
  BEACH_PARASOL_ITEM,
  BEACH_PARASOL_STARTER_RECEIVED_PROPERTY,
} from "./identifiers";

export function installResort(deps: {
  topHosts: TopHostRegistry;
  isVehicleSpace: SpaceCheck;
  isCampSpace: SpaceCheck;
}): void {
  const chair = new BedrockBeachChairWorld(deps);
  const takeChair = new TakeBackBeachChair(chair);
  registerBeachChairPlacement(new PlaceBeachChair(chair));
  const form = new SwitchBeachChairForm(chair);
  registerBeachChairHits(takeChair);
  const lie = new LieOnBeachChair(chair);
  registerBeachChairInteraction(
    form,
    new BeachChairMenu(form, (cmd) => {
      lie.execute(cmd);
    }),
  );
  registerBeachChairLifecycle(lie);
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
