import { world } from "@minecraft/server";
import { HitWarpBlock } from "../../application/warp/hitWarpBlock";
import { OpenWarpList } from "../../application/warp/openWarpList";
import { RegisterWarpPoint } from "../../application/warp/registerWarpPoint";
import { RemoveWarpPoint } from "../../application/warp/removeWarpPoint";
import { RenameWarpPoint } from "../../application/warp/renameWarpPoint";
import { WarpTo } from "../../application/warp/warpTo";
import { asPlayerId } from "../../domain/shared/ids";
import { BedrockWarpBlockHits } from "./bedrock/bedrockWarpBlockHits";
import { BedrockWarpFeedback } from "./bedrock/bedrockWarpFeedback";
import { BedrockWarpMenus } from "./bedrock/bedrockWarpMenus";
import { BedrockWarpPlayers } from "./bedrock/bedrockWarpPlayers";
import { BedrockWarpWorld } from "./bedrock/bedrockWarpWorld";
import { SystemWarpTicks } from "./bedrock/systemWarpTicks";
import { registerWarpBlockHits } from "./handlers/blockHits";
import { registerWarpBlockInteract } from "./handlers/blockInteract";
import { WarpFormGuard } from "./handlers/formGuard";
import { registerWarpPlacement } from "./handlers/placement";
import { registerWarpRemoval } from "./handlers/removal";
import { registerWarpTool } from "./handlers/tool";
import { DynamicPropertyWarpRegistryStore } from "./persistence/dynamicPropertyWarpRegistryStore";

export function installWarp(): void {
  const store = new DynamicPropertyWarpRegistryStore();
  const warpWorld = new BedrockWarpWorld();
  const players = new BedrockWarpPlayers();
  const menus = new BedrockWarpMenus();
  const feedback = new BedrockWarpFeedback();
  const ticks = new SystemWarpTicks();
  const guard = new WarpFormGuard();
  const warpTo = new WarpTo(store, warpWorld, feedback, ticks);
  const list = new OpenWarpList(
    store,
    warpWorld,
    players,
    menus,
    feedback,
    warpTo,
  );
  registerWarpPlacement(
    new RegisterWarpPoint(store, players, menus, feedback, ticks),
    guard,
  );
  const remove = new RemoveWarpPoint(store);
  registerWarpRemoval(remove);
  registerWarpBlockHits(new HitWarpBlock(new BedrockWarpBlockHits(), remove));
  registerWarpBlockInteract(
    new RenameWarpPoint(store, menus, feedback, ticks),
    list,
    guard,
  );
  registerWarpTool(list, guard);
  world.afterEvents.playerLeave.subscribe(({ playerId }) =>
    guard.forget(asPlayerId(playerId)),
  );
}
