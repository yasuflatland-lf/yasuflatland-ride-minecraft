import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { DutchOvenActions } from "../../../src/application/camp/dutchOven";
import { FirePitActions } from "../../../src/application/camp/firePit";
import { GasLanternActions } from "../../../src/application/camp/gasLantern";
import { PlaceTable } from "../../../src/application/camp/placeTable";
import type { DutchOvenWorld } from "../../../src/application/camp/ports/dutchOven";
import type { FirePitWorld } from "../../../src/application/camp/ports/firePit";
import type { GasLanternWorld } from "../../../src/application/camp/ports/gasLantern";
import { asDutchOvenId } from "../../../src/domain/camp/dutchOven";
import { asFirePitId } from "../../../src/domain/camp/firePit";
import { asGasLanternId } from "../../../src/domain/camp/gasLantern";
import { asTableId } from "../../../src/domain/camp/table";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import {
  DUTCH_OVEN_ON_TOP,
  GAS_LANTERN_ON_TOP,
} from "../../../src/infrastructure/camp/bedrock/topHosts";
import { fakeTableWorld } from "./fakeTableWorld";

const player = asPlayerId("player");
const dimension = asDimensionId("overworld");
const pit = asFirePitId("pit");
const table = asTableId("table");
const oven = asDutchOvenId("oven");

it("charges and refunds each camp placement only when payment is owed and spawn fails", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      fc.integer({ min: 0, max: 35 }),
      (hasPlayer, creative, itemPresent, spawnOk, slot) => {
        for (const site of [
          "oven ground",
          "oven pit",
          "oven table",
          "lantern ground",
          "lantern table",
          "table",
          "pit",
        ] as const) {
          const payer = hasPlayer ? player : undefined;
          const world = {
            ...fakeTableWorld(!spawnOk),
            isCreative: vi.fn(() => creative),
            consumeItem: vi.fn(() => itemPresent),
            refund: vi.fn(),
            hasDutchOvenNear: () => false,
            hasGasLanternNear: () => false,
            hasFirePitNear: () => false,
            topHost: () => ({
              dimension,
              at: { x: 4.5, y: 61, z: 5.5 },
              yaw: 0,
            }),
            itemsOnTop: () => [],
            firePit: () => ({
              dimension,
              at: { x: 4.5, y: 61, z: 5.5 },
              yaw: 0,
            }),
            isCovered: () => false,
            setCovered: vi.fn(),
            setHost: vi.fn(),
            spawnDutchOven: vi.fn<DutchOvenWorld["spawnDutchOven"]>(
              (_d, _at, _yaw, setup) => {
                if (!spawnOk) return undefined;
                setup?.(oven);
                return oven;
              },
            ),
            spawnGasLantern: vi.fn(() =>
              spawnOk ? asGasLanternId("lantern") : undefined,
            ),
            spawnFirePit: vi.fn(() => (spawnOk ? pit : undefined)),
            spawnHosted: vi.fn(() => (spawnOk ? "hosted" : undefined)),
          };
          const ground = {
            player: payer,
            dimension,
            block: cellOf({ x: 4, y: 60, z: 5 }),
            yaw: 0,
            slot,
          };
          const ovenActions = new DutchOvenActions(
            world as unknown as DutchOvenWorld,
            DUTCH_OVEN_ON_TOP,
          );
          const lanternActions = new GasLanternActions(
            world as unknown as GasLanternWorld,
            GAS_LANTERN_ON_TOP,
          );
          let placed: boolean;
          let spawn:
            | typeof world.spawnDutchOven
            | typeof world.spawnHosted
            | typeof world.spawnGasLantern
            | typeof world.spawnTable
            | typeof world.spawnFirePit;
          switch (site) {
            case "oven ground":
              placed = ovenActions.place(ground);
              spawn = world.spawnDutchOven;
              break;
            case "oven pit":
              placed = ovenActions.placeOnFirePit({ player: payer, pit, slot });
              spawn = world.spawnDutchOven;
              break;
            case "oven table":
              placed =
                ovenActions.placeOnTable({ player: payer, table, slot }) ===
                "placed";
              spawn = world.spawnHosted;
              break;
            case "lantern ground":
              placed = lanternActions.place(ground);
              spawn = world.spawnGasLantern;
              break;
            case "lantern table":
              placed =
                lanternActions.placeOnTable({ player: payer, table, slot }) ===
                "placed";
              spawn = world.spawnHosted;
              break;
            case "table":
              placed = new PlaceTable(world).execute({
                playerId: payer,
                dimensionId: dimension,
                blockLocation: ground.block,
                yaw: 0,
                slot,
              });
              spawn = world.spawnTable;
              break;
            case "pit":
              placed = new FirePitActions(
                world as unknown as FirePitWorld,
              ).place(ground);
              spawn = world.spawnFirePit;
              break;
          }
          const owes = hasPlayer && !creative;
          const paid = owes && itemPresent;
          const spawned = !owes || paid;
          expect(world.consumeItem.mock.calls, site).toEqual(
            owes ? [[player, slot]] : [],
          );
          expect(spawn, site).toHaveBeenCalledTimes(spawned ? 1 : 0);
          expect(placed, site).toBe(spawned && spawnOk);
          expect(world.refund.mock.calls, site).toEqual(
            paid && !spawnOk ? [[player, slot]] : [],
          );
          if (site === "oven pit") {
            expect(world.setCovered.mock.calls).toEqual(
              placed ? [[pit, true]] : [],
            );
            expect(world.setHost).toHaveBeenCalledTimes(placed ? 1 : 0);
          }
        }
      },
    ),
    { numRuns: 500 },
  );
});
