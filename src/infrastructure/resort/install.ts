import { PlaceParasol } from "../../application/resort/placeParasol";
import { SyncParasolCeilings } from "../../application/resort/syncParasolCeilings";
import { TakeBackParasol } from "../../application/resort/takeBackParasol";
import { GiveStarterItem } from "../../application/shared/giveStarterItem";
import type { SpaceCheck } from "../../application/shared/ports/space";
import {
  BedrockStarterItemWorld,
  registerStarterItem,
} from "../shared/starterItem";
import { BedrockParasolWorld } from "./bedrock/bedrockParasolWorld";
import { registerParasolHits } from "./bedrock/handlers/hits";
import { registerParasolLifecycle } from "./bedrock/handlers/lifecycle";
import { registerParasolPlacement } from "./bedrock/handlers/placement";
import { registerTestParasol } from "./bedrock/handlers/testParasol";
import {
  BEACH_PARASOL_ITEM,
  BEACH_PARASOL_STARTER_RECEIVED_PROPERTY,
} from "./identifiers";

export function installResort(deps: {
  isVehicleSpace: SpaceCheck;
  isCampSpace: SpaceCheck;
}): void {
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
  registerParasolHits(takeBack);
  registerTestParasol(adapter, takeBack, deps);
  registerParasolLifecycle(adapter, new SyncParasolCeilings(adapter));
}
