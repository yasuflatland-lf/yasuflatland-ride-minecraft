import { world } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { registerCutDrops } from "../../../../src/infrastructure/vehicle/bedrock/handlers/cutDrops";
vi.mock("@minecraft/server",()=>({world:{afterEvents:{entitySpawn:{subscribe:vi.fn()}}},EntityInitializationCause:{Loaded:"Loaded"}}));
it("sweeps spawned entities but not loaded ones",()=>{
 const sweep=vi.fn();registerCutDrops(sweep);
 const callback=vi.mocked(world.afterEvents.entitySpawn.subscribe).mock.calls[0]?.[0];
 const entity={} as never;
 callback?.({entity,cause:"Spawned"} as never);callback?.({entity,cause:"Loaded"} as never);
 expect(sweep).toHaveBeenCalledExactlyOnceWith(entity);
});
