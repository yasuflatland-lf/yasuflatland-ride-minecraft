import type { Player } from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { EnterRoofTent } from "../../../src/application/camp/enterRoofTent";
import { LeaveRoofTent } from "../../../src/application/camp/leaveRoofTent";
import type { RoofTentOccupantWorld } from "../../../src/application/camp/ports/roofTentOccupant";
import { RoofTentMenu } from "../../../src/application/camp/roofTentMenu";
import type { SleepInRoofTent } from "../../../src/application/camp/sleepInRoofTent";
import {
  canSeeEntryHint,
  canStandAtFoot,
  entranceWorld,
} from "../../../src/domain/camp/roofTent/access";
import { ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../src/domain/shared/ids";
import type { RoofTentMount } from "../../../src/domain/shared/roofTent";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { registerRoofTentEnter } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentEnter";
import { createRoofTentMenu } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentMenu";
import { registerRoofTentOccupantCleanup } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentOccupantCleanup";
import {
  ROOF_TENT_MENU_BUTTONS,
  ROOF_TENT_MENU_TITLE,
  ROOF_TENT_SNEAK_HINT,
  ROOF_TENT_TYPE,
} from "../../../src/infrastructure/camp/identifiers";

const game = vi.hoisted(() => ({
  interact: vi.fn(),
  left: vi.fn(),
  died: vi.fn(),
  dimensionChanged: vi.fn(),
  run: vi.fn(),
  interval: vi.fn(),
  getEntity: vi.fn(),
  getAllPlayers: vi.fn(),
  tick: 1,
  dye: vi.fn(),
  show: vi.fn(),
  title: vi.fn(),
  button: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  GameMode: {},
  system: {
    get currentTick() {
      return game.tick;
    },
    run: game.run,
    runInterval: game.interval,
  },
  world: {
    getEntity: game.getEntity,
    getAllPlayers: game.getAllPlayers,
    beforeEvents: { playerInteractWithEntity: { subscribe: game.interact } },
    afterEvents: {
      playerLeave: { subscribe: game.left },
      entityDie: { subscribe: game.died },
      playerDimensionChange: { subscribe: game.dimensionChanged },
    },
  },
}));
vi.mock("../../../src/infrastructure/shared/dyes", () => ({
  heldDye: game.dye,
}));
vi.mock("@minecraft/server-ui", () => ({
  ActionFormData: class {
    title(key: unknown) {
      game.title(key);
      return this;
    }
    button(key: unknown) {
      game.button(key);
      return this;
    }
    show(player: unknown) {
      return game.show(player);
    }
  },
}));
const player = {
  id: "p",
  typeId: "minecraft:player",
  isValid: true,
  isSneaking: true,
  dimension: { id: "overworld" },
  location: { x: 0, y: 0, z: 0 },
  onScreenDisplay: { setActionBar: vi.fn() },
};
const target = {
  id: "tent",
  typeId: ROOF_TENT_TYPE,
  isValid: true,
  dimension: { id: "overworld" },
  location: { x: 0, y: 0, z: 0 },
};
let occupied: Map<string, PlayerId>;
let occupants: RoofTentOccupantWorld;
let leave: LeaveRoofTent;
let sleep: { execute: ReturnType<typeof vi.fn> };
let track: (playerId: PlayerId, tentId: string) => void;
let showMenu: ReturnType<typeof createRoofTentMenu>;
const pid = asPlayerId("p");
const entranceReach = vi.fn(() => false);
const foot = {
  hostOf: vi.fn(),
  tentOfHost: vi.fn(),
  loadedTents: vi.fn(),
  atFoot: vi.fn(),
  canSeeEntryHint: vi.fn(),
};
function pollFoot() {
  game.interval.mock.calls[1]?.[0]();
}
function interact() {
  const event = { player, target, cancel: false };
  game.interact.mock.calls[0]?.[0](event);
  return event;
}
function flush() {
  const callbacks = game.run.mock.calls.splice(0);
  for (const [callback] of callbacks) callback();
}
function poll() {
  game.interval.mock.calls[0]?.[0]();
}
beforeEach(() => {
  vi.clearAllMocks();
  game.tick = 1;
  entranceReach.mockReturnValue(false);
  foot.tentOfHost.mockReturnValue(undefined);
  foot.loadedTents.mockReturnValue([]);
  foot.atFoot.mockReturnValue(false);
  foot.canSeeEntryHint.mockImplementation(() => foot.atFoot());
  game.getAllPlayers.mockReturnValue([player]);
  game.dye.mockReturnValue(undefined);
  game.show.mockResolvedValue({ canceled: false, selection: 0 });
  Object.assign(player, {
    isValid: true,
    isSneaking: true,
    location: { x: 0, y: 0, z: 0 },
  });
  Object.assign(target, { typeId: ROOF_TENT_TYPE, isValid: true });
  game.getEntity.mockImplementation((id: string) =>
    id === player.id ? player : undefined,
  );
  occupied = new Map();
  occupants = {
    occupantOf: (id) => occupied.get(id),
    setOccupant: vi.fn((id, p) => {
      if (p) occupied.set(id, p);
      else occupied.delete(id);
    }),
    moveInside: vi.fn(),
    holdInside: vi.fn(),
    placeOutside: vi.fn(),
    showMessage: vi.fn(),
    spawnCellOf: () => ({ x: 0, y: 0, z: 0 }),
    dimensionOf: () => asDimensionId("overworld"),
    spawnSetBy: () => undefined,
    setSpawnSetBy: vi.fn(),
  };
  leave = new LeaveRoofTent(occupants);
  vi.spyOn(leave, "execute");
  sleep = { execute: vi.fn() };
  showMenu = createRoofTentMenu(
    new RoofTentMenu(occupants, sleep as unknown as SleepInRoofTent, leave),
  );
  track = registerRoofTentOccupantCleanup(leave, occupants);
  registerRoofTentEnter(
    new EnterRoofTent(occupants),
    occupants,
    showMenu,
    track,
    entranceReach,
    foot,
  );
});
it("cancels and defers one entry per player per tick, routing the occupant to the menu", async () => {
  expect(interact().cancel).toBe(true);
  interact();
  expect(occupants.moveInside).not.toHaveBeenCalled();
  flush();
  expect(occupants.moveInside).toHaveBeenCalledExactlyOnceWith(pid, "tent");
  game.tick++;
  interact();
  flush();
  await vi.waitFor(() =>
    expect(sleep.execute).toHaveBeenCalledWith({
      playerId: pid,
      tentId: "tent",
    }),
  );
  expect(game.title).toHaveBeenCalledWith({ translate: ROOF_TENT_MENU_TITLE });
  expect(game.button.mock.calls).toEqual([
    [{ translate: ROOF_TENT_MENU_BUTTONS.sleep }],
    [{ translate: ROOF_TENT_MENU_BUTTONS.exit }],
  ]);
});
it("leaves dye interactions and unrelated entities to their own handlers", () => {
  game.dye.mockReturnValue("red");
  expect(interact().cancel).toBe(false);
  game.dye.mockReturnValue(undefined);
  target.typeId = "minecraft:pig";
  expect(interact().cancel).toBe(false);
  expect(game.run).not.toHaveBeenCalled();
});
it("requires reach and sneaking, with a hint for standing players", () => {
  player.location.x = ROOF_TENT_SPEC.interactReach + 0.01;
  interact();
  flush();
  expect(occupants.moveInside).not.toHaveBeenCalled();
  game.tick++;
  player.location.x = ROOF_TENT_SPEC.interactReach;
  player.isSneaking = false;
  interact();
  flush();
  expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledWith({
    translate: ROOF_TENT_SNEAK_HINT,
  });
  expect(occupants.moveInside).not.toHaveBeenCalled();
});
it("refuses a second player without replacing the occupant", () => {
  occupied.set("tent", asPlayerId("other"));
  interact();
  flush();
  expect(occupants.showMessage).toHaveBeenCalledWith(pid, "tent_occupied");
  expect(occupied.get("tent")).toBe("other");
  expect(occupants.moveInside).not.toHaveBeenCalled();
});
it.each(["player", "tent"])(
  "ignores an invalid %s before the deferred interaction",
  (invalid) => {
    interact();
    if (invalid === "player") player.isValid = false;
    else target.isValid = false;
    flush();
    expect(occupants.moveInside).not.toHaveBeenCalled();
    expect(game.show).not.toHaveBeenCalled();
  },
);
it.each([{ canceled: true }, { selection: undefined }, { selection: 9 }])(
  "leaves the occupant inside on an unanswered form: %j",
  async (answer) => {
    occupied.set("tent", pid);
    game.show.mockResolvedValue(answer);
    await showMenu(player as unknown as Player, "tent");
    expect(occupied.get("tent")).toBe(pid);
    expect(leave.execute).not.toHaveBeenCalled();
    expect(sleep.execute).not.toHaveBeenCalled();
  },
);
it("guards concurrent forms and ignores a player invalidated while the form is open", async () => {
  occupied.set("tent", pid);
  let resolve: (value: unknown) => void = () => {};
  game.show.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = showMenu(player as unknown as Player, "tent");
  await showMenu(player as unknown as Player, "tent");
  expect(game.show).toHaveBeenCalledOnce();
  player.isValid = false;
  resolve({ selection: 1 });
  await pending;
  await showMenu(player as unknown as Player, "tent");
  expect(game.show).toHaveBeenCalledOnce();
  expect(leave.execute).not.toHaveBeenCalled();
});
it("gets out through the form and does not leave again on disconnect", async () => {
  interact();
  flush();
  game.show.mockResolvedValue({ selection: 1 });
  await showMenu(player as unknown as Player, "tent");
  game.left.mock.calls[0]?.[0]({ playerId: pid });
  expect(leave.execute).toHaveBeenCalledOnce();
  expect(occupants.placeOutside).toHaveBeenCalledExactlyOnceWith(pid, "tent");
});
it.each(["leave", "death", "dimension"])(
  "cleans up once on %s even if another lifecycle event follows",
  (event) => {
    interact();
    flush();
    if (event === "leave") game.left.mock.calls[0]?.[0]({ playerId: pid });
    if (event === "death") game.died.mock.calls[0]?.[0]({ deadEntity: player });
    if (event === "dimension")
      game.dimensionChanged.mock.calls[0]?.[0]({ player });
    game.left.mock.calls[0]?.[0]({ playerId: pid });
    poll();
    expect(leave.execute).toHaveBeenCalledExactlyOnceWith({
      playerId: pid,
      tentId: "tent",
    });
    expect(occupied.has("tent")).toBe(false);
  },
);
it("waits for the entry sneak to be released before sneak-dismounting", () => {
  interact();
  flush();
  poll();
  poll();
  expect(leave.execute).not.toHaveBeenCalled();
  player.isSneaking = false;
  poll();
  track(pid, "tent");
  player.isSneaking = true;
  poll();
  poll();
  expect(leave.execute).toHaveBeenCalledOnce();
});
it("forgets host-ejected occupants without another exit and ignores unavailable player handles", () => {
  interact();
  flush();
  game.getEntity.mockReturnValue(undefined);
  poll();
  expect(occupied.get("tent")).toBe(pid);
  occupied.delete("tent");
  poll();
  game.left.mock.calls[0]?.[0]({ playerId: pid });
  expect(leave.execute).not.toHaveBeenCalled();
});

it("enters from a reachable entrance beyond the entity interaction reach", () => {
  player.location.x = ROOF_TENT_SPEC.interactReach + 1;
  entranceReach.mockReturnValue(true);
  interact();
  expect(entranceReach).not.toHaveBeenCalled();
  flush();
  expect(entranceReach).toHaveBeenCalledExactlyOnceWith(target, player);
  expect(occupants.moveInside).toHaveBeenCalledExactlyOnceWith(pid, "tent");
  expect(foot.tentOfHost).not.toHaveBeenCalled();
  expect(foot.atFoot).not.toHaveBeenCalled();
});
it("restores tracking of a persisted occupant after a reload and frees the tent", () => {
  game.interval.mockClear();
  registerRoofTentOccupantCleanup(leave, occupants, () => ["tent"]);
  occupied.set("tent", pid);
  const run = game.interval.mock.calls[0]?.[0];
  player.isValid = false;
  for (let i = 0; i < 20 * 30 + 1; i++) run();
  expect(occupied.has("tent")).toBe(false);
  expect(occupants.placeOutside).toHaveBeenCalledWith(pid, "tent");
});
it("keeps a restored occupant who is back online within the grace period", () => {
  game.interval.mockClear();
  registerRoofTentOccupantCleanup(leave, occupants, () => ["tent"]);
  occupied.set("tent", pid);
  const run = game.interval.mock.calls[0]?.[0];
  player.isValid = false;
  for (let i = 0; i < 100; i++) run();
  player.isValid = true;
  player.isSneaking = false;
  for (let i = 0; i < 20 * 30 + 1; i++) run();
  expect(occupied.get("tent")).toBe(pid);
});

it("cancels vehicle-targeted sneak entry at the foot beyond entity reach", () => {
  const tent = { ...target };
  target.typeId = "yasu_ride:suv";
  player.location.x = ROOF_TENT_SPEC.interactReach + 1;
  foot.tentOfHost.mockReturnValue(tent);
  foot.atFoot.mockReturnValue(true);
  expect(interact().cancel).toBe(true);
  interact();
  flush();
  expect(occupants.moveInside).toHaveBeenCalledExactlyOnceWith(pid, "tent");
  expect(entranceReach).not.toHaveBeenCalled();
});
it.each(["standing", "away", "dye"])(
  "leaves vehicle interaction untouched when %s",
  (condition) => {
    foot.tentOfHost.mockReturnValue({ ...target });
    foot.atFoot.mockReturnValue(condition !== "away");
    target.typeId = "yasu_ride:suv";
    player.isSneaking = condition !== "standing";
    if (condition === "dye") game.dye.mockReturnValue("red");
    expect(interact().cancel).toBe(false);
    expect(game.run).not.toHaveBeenCalled();
    flush();
    expect(occupants.moveInside).not.toHaveBeenCalled();
    expect(player.onScreenDisplay.setActionBar).not.toHaveBeenCalled();
  },
);
it.each(["sneak", "foot", "validity"])(
  "rechecks %s before deferred vehicle entry",
  (condition) => {
    const tent = { ...target };
    foot.tentOfHost.mockReturnValue(tent);
    foot.atFoot.mockReturnValue(true);
    target.typeId = "yasu_ride:suv";
    expect(interact().cancel).toBe(true);
    if (condition === "sneak") player.isSneaking = false;
    if (condition === "foot") foot.atFoot.mockReturnValue(false);
    if (condition === "validity") tent.isValid = false;
    flush();
    expect(occupants.moveInside).not.toHaveBeenCalled();
  },
);
it("enters at the foot once until sneak is released", () => {
  foot.loadedTents.mockReturnValue([target]);
  foot.atFoot.mockReturnValue(true);
  pollFoot();
  expect(occupants.moveInside).toHaveBeenCalledExactlyOnceWith(pid, "tent");
  occupied.clear();
  game.tick += 4;
  pollFoot();
  expect(occupants.moveInside).toHaveBeenCalledOnce();
  player.isSneaking = false;
  pollFoot();
  player.isSneaking = true;
  game.tick += 4;
  pollFoot();
  expect(occupants.moveInside).toHaveBeenCalledTimes(2);
});
it("disarms proximity entry after interaction and rearms away from the foot", () => {
  foot.loadedTents.mockReturnValue([target]);
  foot.atFoot.mockReturnValue(true);
  interact();
  flush();
  occupied.clear();
  game.tick += 4;
  pollFoot();
  expect(occupants.moveInside).toHaveBeenCalledOnce();
  foot.atFoot.mockReturnValue(false);
  pollFoot();
  foot.atFoot.mockReturnValue(true);
  game.tick += 4;
  pollFoot();
  expect(occupants.moveInside).toHaveBeenCalledTimes(2);
});
it("hints at the foot no more than once per twenty ticks", () => {
  player.isSneaking = false;
  foot.loadedTents.mockReturnValue([target]);
  foot.atFoot.mockReturnValue(true);
  pollFoot();
  expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledExactlyOnceWith({
    translate: ROOF_TENT_SNEAK_HINT,
  });
  game.tick += 19;
  pollFoot();
  expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledOnce();
  game.tick++;
  pollFoot();
  expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledTimes(2);
});
it("skips occupied tents and riding players in the proximity poll", () => {
  foot.loadedTents.mockReturnValue([target]);
  foot.atFoot.mockReturnValue(true);
  occupied.set("tent", asPlayerId("other"));
  pollFoot();
  expect(occupants.moveInside).not.toHaveBeenCalled();
  occupied.clear();
  game.getAllPlayers.mockReturnValue([{ ...player, getComponent: () => ({}) }]);
  game.tick += 4;
  pollFoot();
  expect(occupants.moveInside).not.toHaveBeenCalled();
});

it("keeps the tent-targeted entrance fallback and sneak hint without foot access", () => {
  player.location.x = ROOF_TENT_SPEC.interactReach + 1;
  player.isSneaking = false;
  entranceReach.mockReturnValue(true);
  expect(interact().cancel).toBe(true);
  flush();
  expect(entranceReach).toHaveBeenCalledExactlyOnceWith(target, player);
  expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledExactlyOnceWith({
    translate: ROOF_TENT_SNEAK_HINT,
  });
  expect(occupants.moveInside).not.toHaveBeenCalled();
  expect(foot.tentOfHost).not.toHaveBeenCalled();
  expect(foot.atFoot).not.toHaveBeenCalled();
});

it("leaves a vehicle without a foot-access tent to its native interaction", () => {
  target.typeId = "yasu_ride:camper";
  foot.tentOfHost.mockReturnValue(undefined);
  foot.atFoot.mockReturnValue(true);
  expect(interact().cancel).toBe(false);
  expect(foot.tentOfHost).toHaveBeenCalledExactlyOnceWith(target.id);
  expect(foot.atFoot).not.toHaveBeenCalled();
  expect(game.run).not.toHaveBeenCalled();
  flush();
  expect(occupants.moveInside).not.toHaveBeenCalled();
});

it("does not enter a loaded tent when the player is away from its foot", () => {
  foot.loadedTents.mockReturnValue([target]);
  foot.atFoot.mockReturnValue(false);
  pollFoot();
  expect(foot.atFoot).toHaveBeenCalledExactlyOnceWith(target, player);
  expect(occupants.moveInside).not.toHaveBeenCalled();
  expect(player.onScreenDisplay.setActionBar).not.toHaveBeenCalled();
});

it("holds a tracked occupant every tick and stops after occupancy clears", () => {
  interact();
  flush();
  poll();
  poll();
  expect(occupants.holdInside).toHaveBeenCalledTimes(2);
  expect(occupants.holdInside).toHaveBeenLastCalledWith(pid, "tent");
  occupied.delete("tent");
  poll();
  poll();
  expect(occupants.holdInside).toHaveBeenCalledTimes(2);
});

it("stops holding immediately on menu leave", async () => {
  interact();
  flush();
  poll();
  game.show.mockResolvedValue({ selection: 1 });
  await showMenu(player as unknown as Player, "tent");
  poll();
  expect(occupants.holdInside).toHaveBeenCalledExactlyOnceWith(pid, "tent");
});

it("holds through sneak release but never on the sneak-leave tick", () => {
  interact();
  flush();
  poll();
  player.isSneaking = false;
  poll();
  expect(occupants.holdInside).toHaveBeenCalledTimes(2);
  player.isSneaking = true;
  poll();
  poll();
  expect(leave.execute).toHaveBeenCalledOnce();
  expect(occupants.holdInside).toHaveBeenCalledTimes(2);
});

it("does not hold an unavailable tracked player", () => {
  interact();
  flush();
  player.isValid = false;
  poll();
  game.getEntity.mockReturnValue(undefined);
  poll();
  expect(occupants.holdInside).not.toHaveBeenCalled();
});

it("hints at 1.2 blocks from the ladder without triggering proximity entry", () => {
  const mount = SUV_PROFILE.roofTent as RoofTentMount;
  const host = { location: { x: 0, y: 0, z: 0 }, yaw: 0 };
  const entrance = entranceWorld(mount, host);
  player.location = { x: entrance.x + 1.2, y: 0, z: entrance.z };
  player.isSneaking = false;
  foot.loadedTents.mockReturnValue([target]);
  foot.atFoot.mockImplementation(() =>
    canStandAtFoot(mount, host, player.location),
  );
  foot.canSeeEntryHint.mockImplementation(() =>
    canSeeEntryHint(mount, host, player.location),
  );
  pollFoot();
  expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledExactlyOnceWith({
    translate: ROOF_TENT_SNEAK_HINT,
  });
  game.tick += 4;
  player.isSneaking = true;
  pollFoot();
  expect(occupants.moveInside).not.toHaveBeenCalled();
  expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledOnce();
  player.isSneaking = false;
  game.getAllPlayers.mockReturnValue([{ ...player, getComponent: () => ({}) }]);
  game.tick += 20;
  pollFoot();
  expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledOnce();
});
