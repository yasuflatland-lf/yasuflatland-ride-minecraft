import { system } from "@minecraft/server";
import { BeachChairMenu } from "../../application/resort/beachChairMenu";
import { LieOnBeachChair } from "../../application/resort/lieOnBeachChair";
import { PaintParasol } from "../../application/resort/paintParasol";
import { PlaceBeachChair } from "../../application/resort/placeBeachChair";
import { PlaceFurniture } from "../../application/resort/placeFurniture";
import { PlaceParasol } from "../../application/resort/placeParasol";
import { ShowStates } from "../../application/resort/showStates";
import { SwitchBeachChairForm } from "../../application/resort/switchBeachChairForm";
import { SyncParasolCeilings } from "../../application/resort/syncParasolCeilings";
import { TakeBackBeachChair } from "../../application/resort/takeBackBeachChair";
import { TakeBackFurniture } from "../../application/resort/takeBackFurniture";
import { TakeBackParasol } from "../../application/resort/takeBackParasol";
import { TickShows } from "../../application/resort/tickShows";
import { UseToilet } from "../../application/resort/useToilet";
import { UseWashstand } from "../../application/resort/useWashstand";
import { WatchToiletDismount } from "../../application/resort/watchToiletDismount";
import { GiveStarterItem } from "../../application/shared/giveStarterItem";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { Repaint } from "../../application/shared/repaint";
import { FURNITURE_SPEC } from "../../domain/resort/furniture";
import { BEACH_CHAIR_SPEC } from "../../domain/resort/spec";
import {
  BedrockStarterItemWorld,
  registerStarterItem,
} from "../shared/starterItem";
import type { PlaceHostedOnTop } from "../shared/tableTop/hosted";
import type { TopHostRegistry } from "../shared/tableTop/registry";
import { BedrockBeachChairWorld } from "./bedrock/bedrockBeachChairWorld";
import { BedrockFurnitureWorld } from "./bedrock/bedrockFurnitureWorld";
import { BedrockParasolPaintWorld } from "./bedrock/bedrockParasolPaintWorld";
import { BedrockParasolWorld } from "./bedrock/bedrockParasolWorld";
import { BedrockShowSound } from "./bedrock/bedrockShowSound";
import { BedrockToiletWorld } from "./bedrock/bedrockToiletWorld";
import { BedrockWashstandWorld } from "./bedrock/bedrockWashstandWorld";
import { registerBeachChairHits } from "./bedrock/handlers/beachChairHits";
import { registerBeachChairInteraction } from "./bedrock/handlers/beachChairInteraction";
import { registerBeachChairLifecycle } from "./bedrock/handlers/beachChairLifecycle";
import { registerBeachChairPlacement } from "./bedrock/handlers/beachChairPlacement";
import { registerFurnitureHits } from "./bedrock/handlers/furnitureHits";
import { registerFurniturePlacement } from "./bedrock/handlers/furniturePlacement";
import { registerFurnitureTopInteraction } from "./bedrock/handlers/furnitureTopInteraction";
import { registerFurnitureTopLifecycle } from "./bedrock/handlers/furnitureTopLifecycle";
import { registerParasolHits } from "./bedrock/handlers/hits";
import { registerParasolLifecycle } from "./bedrock/handlers/lifecycle";
import { registerParasolPlacement } from "./bedrock/handlers/placement";
import { registerShowLifecycle } from "./bedrock/handlers/showLifecycle";
import { registerTestBeachChair } from "./bedrock/handlers/testBeachChair";
import { registerTestFurniture } from "./bedrock/handlers/testFurniture";
import { registerTestParasol } from "./bedrock/handlers/testParasol";
import { registerTestToilet } from "./bedrock/handlers/testToilet";
import { registerTestWashstand } from "./bedrock/handlers/testWashstand";
import { registerToiletInteraction } from "./bedrock/handlers/toiletInteraction";
import { registerWashstandInteraction } from "./bedrock/handlers/washstandInteraction";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_TOP_REFUSAL_HINTS,
  BEACH_PARASOL_ITEM,
  BEACH_PARASOL_STARTER_RECEIVED_PROPERTY,
  DINING_TABLE_TOP_REFUSAL_HINTS,
  FURNITURE_IDS,
} from "./identifiers";

export function installResort(deps: {
  topHosts: TopHostRegistry;
  isVehicleSpace: SpaceCheck;
  isCampSpace: SpaceCheck;
  placeHostedOnTop: PlaceHostedOnTop;
}): void {
  deps.topHosts.registerHost({
    hostType: "beach_chair",
    entityTypeId: BEACH_CHAIR,
    surface: {
      half: BEACH_CHAIR_SPEC.topHalf,
      topPx: BEACH_CHAIR_SPEC.topPx,
      limit: BEACH_CHAIR_SPEC.topLimit,
      clearanceBase: 0,
    },
    isTopNow: (entity) => entity.getProperty(BEACH_CHAIR_FOLDED) === true,
    refusalHints: BEACH_CHAIR_TOP_REFUSAL_HINTS,
  });
  const furniture = new BedrockFurnitureWorld(deps);
  const diningTop = FURNITURE_SPEC.dining_table.top;
  if (diningTop)
    deps.topHosts.registerHost({
      hostType: "dining_table",
      entityTypeId: FURNITURE_IDS.dining_table.entity,
      surface: diningTop,
      isTopNow: () => true,
      refusalHints: DINING_TABLE_TOP_REFUSAL_HINTS,
      blockedAt: (entity, at, footprint) =>
        furniture.blockedAt(entity, at, footprint),
    });
  registerFurnitureTopInteraction(furniture, deps.placeHostedOnTop);
  const takeFurniture = new TakeBackFurniture(furniture);
  registerFurniturePlacement(new PlaceFurniture(furniture));
  registerFurnitureHits(takeFurniture, furniture);
  registerFurnitureTopLifecycle(furniture);
  registerTestFurniture(furniture, takeFurniture, deps);
  const states = new ShowStates();
  const sound = new BedrockShowSound();
  const toilet = new BedrockToiletWorld(deps);
  const washstand = new BedrockWashstandWorld();
  const watch = new WatchToiletDismount(
    toilet,
    states,
    sound,
    () => system.currentTick,
  );
  const useToilet = new UseToilet(toilet, states, watch);
  const useWashstand = new UseWashstand(washstand, states, sound);
  registerToiletInteraction(useToilet);
  registerWashstandInteraction(useWashstand);
  registerShowLifecycle(watch, new TickShows(toilet, washstand, states));
  registerTestToilet(states, sound, deps);
  registerTestWashstand(washstand, useWashstand);
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
