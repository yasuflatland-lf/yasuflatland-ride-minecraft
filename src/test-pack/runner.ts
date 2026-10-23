// In-game tests (ADR 0010). They run in a script environment separate from the
// main Behavior Pack, so they drive the vehicle through script events.
import { system } from "@minecraft/server";
import { type Outcome, setupArena } from "./arena";
import {
  LOG_TAG,
  linePrefix,
  type RunRequest,
  runRequestFrom,
  shardsOf,
  TEST_EVENT,
} from "./protocol";
import {
  lowChairSeatAndTakeBack,
  lowChairSettlesThroughGrass,
} from "./scenarios/camp";
import {
  camperAccel,
  camperBumper,
  camperCabinet,
  camperDecor,
  camperDecorPairs,
  camperDepart,
  camperDepartCargo,
  camperDive,
  camperFridge,
  camperLand,
  camperPark,
  camperParkBlocked,
  camperParkGrass,
  camperParkPath,
  camperParkSnow,
  camperRelay,
  camperShowerToiletBlock,
  camperStandSpots,
  camperTakeoff,
  camperToiletSeat,
  camperWall,
} from "./scenarios/camper";
import { campingGearBlocks } from "./scenarios/campingGear";
import { fleetForget } from "./scenarios/fleetRemove";
import {
  boatCruise,
  boatDeckSeats,
  boatDock,
  boatDrag,
  boatFloat,
  boatRam,
  boatSeatFillers,
  boatShore,
} from "./scenarios/sportsboat";
import {
  accelAndStep1,
  flightBank,
  flightClimbDescend,
  flightCruise,
  flightDriverless,
  flightLand,
  flightTakeoff,
  flightTouchdown,
  headlightsFollowAndClear,
  paintEvents,
  passableNoHop,
  ramCow,
  seatsAfterDriverLeaves,
  step2,
  submarineBank,
  submarineBreach,
  submarineDive,
  submarineShallow,
  submarineShore,
  submarineUnmanned,
  suvSoulSand,
  turnAndHandbrake,
  vehicleLimit,
  wallDiagonal,
} from "./scenarios/suv";
import {
  tentEntityContract,
  tentFlapOpensAlone,
  tentPitchAndTakeDown,
  tentPitchOnSnow,
  tentRefuseStep,
  tentRefuseVehicleSpace,
  tentRelayLostCell,
} from "./scenarios/tent";

function log(runId: string, msg: string): void {
  console.warn(`${linePrefix(runId)}${msg}`);
}

async function runAll({ runId, shard }: RunRequest): Promise<void> {
  const a = await setupArena();
  // The middle number is the test's ticks as last logged in CI; shardsOf packs
  // by it, so update it when a test gets much slower or faster (ADR 0054).
  const allTests: [string, number, () => Promise<Outcome>][] = [
    ["camper_accel", 144, () => camperAccel(a)],
    ["camper_wall", 150, () => camperWall(a)],
    ["camper_takeoff", 33, () => camperTakeoff(a)],
    ["camper_land", 140, () => camperLand(a)],
    ["camper_dive", 45, () => camperDive(a)],
    ["camper_park", 30, () => camperPark(a)],
    ["camper_park_blocked", 30, () => camperParkBlocked(a)],
    ["camper_park_snow", 30, () => camperParkSnow(a)],
    ["camper_park_path", 30, () => camperParkPath(a)],
    ["camper_park_grass", 30, () => camperParkGrass(a)],
    ["camper_depart", 45, () => camperDepart(a)],
    ["camper_depart_cargo", 50, () => camperDepartCargo(a)],
    ["camper_toilet_seat", 31, () => camperToiletSeat(a)],
    ["camper_stand_spots", 31, () => camperStandSpots(a)],
    ["camper_shower_toilet_block", 45, () => camperShowerToiletBlock(a)],
    ["camper_decor", 51, () => camperDecor(a)],
    ["camper_decor_pairs", 54, () => camperDecorPairs(a)],
    ["camper_cabinet", 52, () => camperCabinet(a)],
    ["camper_fridge", 52, () => camperFridge(a)],
    ["camper_relay", 55, () => camperRelay(a)],
    ["camper_bumper", 48, () => camperBumper(a)],
    ["accel_and_step1", 85, () => accelAndStep1(a)],
    ["passable_no_hop", 65, () => passableNoHop(a)],
    ["turn_and_handbrake", 130, () => turnAndHandbrake(a)],
    ["ram_cow", 44, () => ramCow(a)],
    ["wall_diagonal", 70, () => wallDiagonal(a)],
    ["step2_front", 52, () => step2(a, 8, -90, 100)],
    ["step2_diagonal", 57, () => step2(a, 30, -60, 100)],
    ["seats_after_driver_leaves", 20, () => seatsAfterDriverLeaves(a)],
    ["paint_events", 16, () => paintEvents(a)],
    ["headlights_follow_and_clear", 56, () => headlightsFollowAndClear(a)],
    ["flight_takeoff", 33, () => flightTakeoff(a)],
    ["flight_cruise", 93, () => flightCruise(a)],
    ["flight_climb_descend", 63, () => flightClimbDescend(a)],
    ["flight_bank", 73, () => flightBank(a)],
    ["flight_land", 140, () => flightLand(a)],
    ["flight_touchdown", 60, () => flightTouchdown(a)],
    ["flight_driverless", 45, () => flightDriverless(a)],
    ["submarine_dive", 136, () => submarineDive(a)],
    ["submarine_bank", 91, () => submarineBank(a)],
    ["submarine_breach", 59, () => submarineBreach(a)],
    ["submarine_shore", 178, () => submarineShore(a)],
    ["submarine_unmanned", 211, () => submarineUnmanned(a)],
    ["submarine_shallow", 118, () => submarineShallow(a)],
    ["vehicle_limit", 20, () => vehicleLimit(a)],
    ["fleet_forget", 112, () => fleetForget(a)],
    ["boat_float", 105, () => boatFloat(a)],
    ["boat_dock", 76, () => boatDock(a)],
    ["boat_deck_seats", 27, () => boatDeckSeats(a)],
    ["boat_drag", 138, () => boatDrag(a)],
    ["boat_cruise", 270, () => boatCruise(a)],
    ["boat_shore", 165, () => boatShore(a)],
    ["boat_ram", 77, () => boatRam(a)],
    ["boat_seat_fillers", 19, () => boatSeatFillers(a)],
    ["suv_soul_sand", 78, () => suvSoulSand(a)],
    ["camping_gear_blocks", 0, () => campingGearBlocks(a)],
    ["low_chair_seat_and_take_back", 6, () => lowChairSeatAndTakeBack(a)],
    [
      "low_chair_settles_through_grass",
      20,
      () => lowChairSettlesThroughGrass(a),
    ],
    ["tent_entity_contract", 12, () => tentEntityContract(a)],
    ["tent_pitch_and_take_down", 7, () => tentPitchAndTakeDown(a)],
    ["tent_pitch_on_snow", 6, () => tentPitchOnSnow(a)],
    ["tent_refuse_step", 5, () => tentRefuseStep(a)],
    ["tent_refuse_vehicle_space", 7, () => tentRefuseVehicleSpace(a)],
    ["tent_relay_lost_cell", 23, () => tentRelayLostCell(a)],
    ["tent_flap_opens_alone", 21, () => tentFlapOpensAlone(a)],
  ];
  const shards = shardsOf(
    allTests.map(([, ticks]) => ticks),
    shard.total,
  );
  const tests = allTests.filter((_, i) => shards[i] === shard.index);
  let passed = 0;
  const lines: string[] = [];
  for (const [name, , test] of tests) {
    const start = system.currentTick;
    let outcome: Outcome;
    try {
      outcome = await test();
    } catch (e) {
      outcome = { pass: false, detail: `error: ${e}` };
    }
    if (outcome.pass) passed++;
    // ticks= is what rebalancing the CI shards needs.
    lines.push(
      `${outcome.pass ? "PASS" : "FAIL"} ${name} ticks=${system.currentTick - start} ${outcome.detail}`,
    );
    for (const line of outcome.lines ?? []) lines.push(`${name} ${line}`);
  }
  for (const line of lines) log(runId, line);
  log(runId, `SUMMARY pass=${passed} fail=${tests.length - passed}`);
}

// Two runs would share the arena and kill each other's cars in setupArena.
let activeRun: string | undefined;

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== TEST_EVENT) return;
  const request = runRequestFrom(ev.message);
  const { runId } = request;
  if (activeRun !== undefined) {
    log(runId, `SUMMARY pass=0 fail=1 error=run ${activeRun} in progress`);
    return;
  }
  activeRun = runId;
  runAll(request)
    .catch((e) => log(runId, `SUMMARY pass=0 fail=1 error=${e}`))
    .finally(() => {
      activeRun = undefined;
    });
});
console.warn(`${LOG_TAG} loaded`);
