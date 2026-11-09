import { PlaceParasol } from "../../application/resort/placeParasol";
import { SyncParasolCeilings } from "../../application/resort/syncParasolCeilings";
import { TakeBackParasol } from "../../application/resort/takeBackParasol";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { BedrockParasolWorld } from "./bedrock/bedrockParasolWorld";
import { registerParasolHits } from "./bedrock/handlers/hits";
import { registerParasolLifecycle } from "./bedrock/handlers/lifecycle";
import { registerParasolPlacement } from "./bedrock/handlers/placement";
import { registerTestParasol } from "./bedrock/handlers/testParasol";

export function installResort(deps: {
  isVehicleSpace: SpaceCheck;
  isCampSpace: SpaceCheck;
}): void {
  const adapter = new BedrockParasolWorld(deps);
  registerParasolPlacement(new PlaceParasol(adapter));
  const takeBack = new TakeBackParasol(adapter);
  registerParasolHits(takeBack);
  registerTestParasol(adapter, takeBack, deps);
  registerParasolLifecycle(adapter, new SyncParasolCeilings(adapter));
}
