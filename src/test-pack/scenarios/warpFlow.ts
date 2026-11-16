import {
  type Block,
  type BlockPermutation,
  system,
  world,
} from "@minecraft/server";
import { HitWarpBlock } from "../../application/warp/hitWarpBlock";
import { OpenWarpList } from "../../application/warp/openWarpList";
import type { WarpMenus } from "../../application/warp/ports/menus";
import { RegisterWarpPoint } from "../../application/warp/registerWarpPoint";
import { RemoveWarpPoint } from "../../application/warp/removeWarpPoint";
import { RenameWarpPoint } from "../../application/warp/renameWarpPoint";
import { WarpTo } from "../../application/warp/warpTo";
import { asPlayerId } from "../../domain/shared/ids";
import { WARP_SPEC } from "../../domain/warp/spec";
import { parseWarpName } from "../../domain/warp/warpName";
import { BedrockWarpBlockHits } from "../../infrastructure/warp/bedrock/bedrockWarpBlockHits";
import { BedrockWarpFeedback } from "../../infrastructure/warp/bedrock/bedrockWarpFeedback";
import { BedrockWarpPlayers } from "../../infrastructure/warp/bedrock/bedrockWarpPlayers";
import { BedrockWarpWorld } from "../../infrastructure/warp/bedrock/bedrockWarpWorld";
import { SystemWarpTicks } from "../../infrastructure/warp/bedrock/systemWarpTicks";
import { WARP_BLOCK_TYPE } from "../../infrastructure/warp/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";
import {
  checkWarp,
  sameWarpPosition,
  warpPoint,
  withWarpRegistry,
} from "./warp";

export async function warpFlow(a: Arena): Promise<Outcome> {
  const player = world.getAllPlayers()[0];
  if (!player?.isValid)
    return { pass: false, detail: "a connected player is required" };
  const location = player.location;
  const dimension = player.dimension;
  const rotation = player.getRotation();
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory)
    return { pass: false, detail: "player inventory unavailable" };
  const originalItems = Array.from({ length: inventory.size }, (_, slot) =>
    inventory.getItem(slot),
  );
  const point = warpPoint(a);
  const block = a.dim.getBlock(point.cell);
  if (!block) return { pass: false, detail: "fixture is unloaded" };
  const saved: { block: Block; permutation: BlockPermutation }[] = [];
  for (let x = 23; x <= 25; x++)
    for (let y = a.gy - 1; y <= a.gy + 2; y++)
      for (let z = 23; z <= 25; z++) {
        const cell = a.dim.getBlock(a.at(x, y, z));
        if (!cell) return { pass: false, detail: "fixture is unloaded" };
        saved.push({ block: cell, permutation: cell.permutation });
      }
  try {
    a.dim.runCommand(`fill ${a.box(23, a.gy, 23, 25, a.gy + 2, 25)} air`);
    a.dim.runCommand(`fill ${a.box(23, a.gy - 1, 23, 25, a.gy - 1, 25)} stone`);
    return await withWarpRegistry(async (store) => {
      const adapter = new BedrockWarpWorld();
      const players = new BedrockWarpPlayers();
      const feedback = new BedrockWarpFeedback();
      const ticks = new SystemWarpTicks();
      const command = {
        playerId: asPlayerId(player.id),
        dimension: point.dimension,
        cell: point.cell,
      };
      let answer = "Named warp";
      let listed = false;
      let naming = 0;
      // Stable forms and player input events cannot be answered or synthesized by a script.
      // Exercise the handler use cases with real adapters and scripted menu responses.
      const menus: WarpMenus = {
        async askName(_id, current) {
          const saved = store.load()?.points[0];
          checkWarp(saved !== undefined, "point must be saved before naming");
          if (naming++ === 0)
            checkWarp(saved.name === "Warp 1", "default name before form");
          else checkWarp(current === saved.name, "rename form current name");
          const name = parseWarpName(answer);
          return name ? { kind: "name", name } : { kind: "cancelled" };
        },
        async chooseWarp(_id, page) {
          const entry = page.entries[0];
          checkWarp(
            page.entries.length === 1 &&
              entry !== undefined &&
              !entry.unverified,
            "list must contain the placed point",
          );
          checkWarp(
            entry.point.name === "Renamed warp" &&
              entry.point.owner === player.name,
            "list name and owner",
          );
          listed = true;
          return { kind: "warp", id: entry.point.id };
        },
      };
      const register = new RegisterWarpPoint(
        store,
        players,
        menus,
        feedback,
        ticks,
      );
      const rename = new RenameWarpPoint(store, menus, feedback, ticks);
      const warp = new WarpTo(store, adapter, feedback, ticks);
      const list = new OpenWarpList(
        store,
        adapter,
        players,
        menus,
        feedback,
        warp,
      );
      block.setType(WARP_BLOCK_TYPE);
      checkWarp(
        store.load()?.points.length === 0,
        "setType alone must not register in the test pack",
      );
      checkWarp(
        (await register.run(command)) === "registered",
        "register failed",
      );
      checkWarp(
        store.load()?.points[0]?.name === "Named warp",
        "placement name",
      );
      answer = "Renamed warp";
      await rename.run(command);
      checkWarp(store.load()?.points[0]?.name === answer, "rename failed");
      answer = "   ";
      await rename.run(command);
      checkWarp(
        store.load()?.points[0]?.name === "Renamed warp",
        "empty edit changed name",
      );
      player.teleport(a.at(20.5, a.gy, 20.5), { dimension: a.dim, rotation });
      await list.run(command.playerId);
      checkWarp(
        listed &&
          sameWarpPosition(player.location, {
            x: point.cell.x + 0.5,
            y: point.cell.y + 1,
            z: point.cell.z + 0.5,
          }),
        "list selection teleport failed",
      );
      checkWarp(
        Math.abs(player.getRotation().x - rotation.x) < 0.01 &&
          Math.abs(player.getRotation().y - rotation.y) < 0.01,
        "player facing changed",
      );
      const hits = new HitWarpBlock(
        new BedrockWarpBlockHits(),
        new RemoveWarpPoint(store),
      );
      const itemCount = () =>
        Array.from({ length: inventory.size }, (_, slot) =>
          inventory.getItem(slot),
        ).reduce(
          (count, item) =>
            count + (item?.typeId === WARP_BLOCK_TYPE ? item.amount : 0),
          0,
        );
      inventory.setItem(0, undefined);
      const beforeItems = itemCount();
      for (let i = 0; i < WARP_SPEC.breakHits; i++) {
        hits.run({ ...command, now: system.currentTick });
        if (i < WARP_SPEC.breakHits - 1)
          checkWarp(
            block.typeId === WARP_BLOCK_TYPE &&
              store.load()?.points.length === 1,
            "early hit broke the block",
          );
        await wait(1);
      }
      checkWarp(
        block.typeId === "minecraft:air",
        "fifth hit did not remove block",
      );
      checkWarp(
        itemCount() - beforeItems === 1,
        "five hits must return exactly one item",
      );
      checkWarp(store.load()?.points.length === 0, "break removal failed");
      naming = 0;
      await register.run(command);
      await list.run(command.playerId);
      checkWarp(
        store.load()?.points.length === 0,
        "list did not prune the broken block",
      );
      return {
        pass: true,
        detail:
          "place/default/name/list/rename/empty edit/teleport/facing/five-hit break/refund/prune; scripted menus, input handlers and rendered forms require manual check",
      };
    });
  } finally {
    try {
      for (let slot = 0; slot < originalItems.length; slot++)
        inventory.setItem(slot, originalItems[slot]);
      for (const savedCell of saved)
        savedCell.block.setPermutation(savedCell.permutation);
    } finally {
      if (player.isValid) player.teleport(location, { dimension, rotation });
    }
  }
}
