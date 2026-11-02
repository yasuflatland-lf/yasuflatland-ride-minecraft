import { ButtonState, InputButton, type Player } from "@minecraft/server";
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
  ROOF_TENT_SEATED_HINT,
  ROOF_TENT_SNEAK_HINT,
  ROOF_TENT_TYPE,
} from "../../../src/infrastructure/camp/identifiers";

const game = vi.hoisted(() => ({
  interact: vi.fn(),
  input: vi.fn(),
  timeout: vi.fn(),
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
  InputButton: { Jump: "Jump", Sneak: "Sneak" },
  ButtonState: { Pressed: "Pressed", Released: "Released" },
  system: {
    get currentTick() {
      return game.tick;
    },
    run: game.run,
    runTimeout: game.timeout,
    runInterval: game.interval,
  },
  world: {
    getEntity: game.getEntity,
    getAllPlayers: game.getAllPlayers,
    beforeEvents: { playerInteractWithEntity: { subscribe: game.interact } },
    afterEvents: {
      playerButtonInput: { subscribe: game.input },
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
  FormCancelationReason: { UserBusy: "UserBusy", UserClosed: "UserClosed" },
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
    conceal: vi.fn(),
    reveal: vi.fn(),
    moveInside: vi.fn(),
    isSeated: vi.fn(() => true),
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
    expect(occupants.reveal).toHaveBeenCalledExactlyOnceWith(pid);
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
  expect(occupants.placeOutside).toHaveBeenCalledExactlyOnceWith(pid, "tent");
  expect(occupied.has("tent")).toBe(false);
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
  expect(occupants.reveal).toHaveBeenCalledExactlyOnceWith(pid);
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

it("leaves a seated occupant in place on every tick", () => {
  interact();
  flush();
  player.isSneaking = false;
  for (let i = 0; i < 60; i++) poll();
  expect(occupants.moveInside).toHaveBeenCalledExactlyOnceWith(pid, "tent");
  expect(occupants.placeOutside).not.toHaveBeenCalled();
  expect(leave.execute).not.toHaveBeenCalled();
});

it("clears occupancy and places a dismounted occupant outside after entry grace", () => {
  interact();
  flush();
  player.isSneaking = false;
  for (let i = 0; i < 10; i++) poll();
  vi.mocked(occupants.isSeated).mockReturnValue(false);
  poll();
  poll();
  expect(leave.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: pid,
    tentId: "tent",
  });
  expect(occupants.placeOutside).toHaveBeenCalledExactlyOnceWith(pid, "tent");
  expect(occupied.has("tent")).toBe(false);
});

it("re-seats a dismounted occupant during the entry grace while the sneak is held", () => {
  interact();
  flush();
  vi.mocked(occupants.moveInside).mockClear();
  vi.mocked(occupants.isSeated).mockReturnValue(false);
  for (let i = 0; i < 10; i++) poll();
  expect(occupants.moveInside).toHaveBeenCalledTimes(10);
  expect(occupants.moveInside).toHaveBeenLastCalledWith(pid, "tent");
  expect(leave.execute).not.toHaveBeenCalled();
  expect(occupied.get("tent")).toBe(pid);
});

it("allows a brief seating delay after the entry sneak is released", () => {
  interact();
  flush();
  player.isSneaking = false;
  vi.mocked(occupants.isSeated).mockReturnValue(false);
  vi.mocked(occupants.moveInside).mockClear();
  for (let i = 0; i < 10; i++) poll();
  expect(occupants.moveInside).toHaveBeenCalledTimes(10);
  expect(leave.execute).not.toHaveBeenCalled();
  poll();
  expect(leave.execute).toHaveBeenCalledOnce();
});

it("leaves after the entry grace when a latched sneak was never released", () => {
  interact();
  flush();
  vi.mocked(occupants.isSeated).mockReturnValue(false);
  vi.mocked(occupants.moveInside).mockClear();
  for (let i = 0; i < 10; i++) poll();
  expect(leave.execute).not.toHaveBeenCalled();
  poll();
  expect(leave.execute).toHaveBeenCalledOnce();
  expect(occupants.placeOutside).toHaveBeenCalledExactlyOnceWith(pid, "tent");
  expect(occupied.has("tent")).toBe(false);
});

it("keeps an unloaded tent's occupant without re-seating or leaving", () => {
  interact();
  flush();
  player.isSneaking = false;
  vi.mocked(occupants.isSeated).mockReturnValue(undefined);
  vi.mocked(occupants.moveInside).mockClear();
  for (let i = 0; i < 60; i++) poll();
  expect(occupants.moveInside).not.toHaveBeenCalled();
  expect(leave.execute).not.toHaveBeenCalled();
  expect(occupied.get("tent")).toBe(pid);
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

it("refreshes concealment at the configured interval only for matching seated occupants", () => {
  interact();
  flush();
  vi.mocked(occupants.conceal).mockClear();
  for (let i = 0; i < ROOF_TENT_SPEC.concealRefreshTicks * 3; i++) {
    poll();
    expect(occupants.conceal).toHaveBeenCalledTimes(
      Math.floor(i / ROOF_TENT_SPEC.concealRefreshTicks) + 1,
    );
  }
  vi.mocked(occupants.isSeated).mockReturnValue(false);
  for (let i = 0; i < ROOF_TENT_SPEC.concealRefreshTicks; i++) poll();
  expect(occupants.conceal).toHaveBeenCalledTimes(3);
  occupied.set("tent", asPlayerId("other"));
  poll();
  expect(occupants.reveal).toHaveBeenCalledExactlyOnceWith(pid);
  expect(occupants.conceal).toHaveBeenCalledTimes(3);
});

it("resumes concealment refresh for a restored seated occupant", () => {
  game.interval.mockClear();
  registerRoofTentOccupantCleanup(leave, occupants, () => ["tent"]);
  occupied.set("tent", pid);
  for (let i = 0; i < ROOF_TENT_SPEC.concealRefreshTicks + 1; i++) poll();
  expect(occupants.conceal).toHaveBeenCalledTimes(2);
});

function press(
  button = InputButton.Jump,
  newButtonState = ButtonState.Pressed,
) {
  game.input.mock.calls[0]?.[0]({ player, button, newButtonState });
}
async function pollMenu() {
  const callback = game.timeout.mock.calls.shift()?.[0];
  expect(callback).toBeDefined();
  await callback();
}
function expectSeatedHint() {
  expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledExactlyOnceWith({
    translate: ROOF_TENT_SEATED_HINT,
  });
}
it("opens the menu on Jump for a seated occupant of a loaded tent", async () => {
  occupied.set("tent", pid);
  foot.loadedTents.mockReturnValue([target]);
  press();
  await vi.waitFor(() => expect(sleep.execute).toHaveBeenCalledOnce());
  expect(game.show).toHaveBeenCalledExactlyOnceWith(player);
});
it.each([
  "non-occupant",
  "unseated",
  "unknown seating",
  "sneak",
  "released",
  "unloaded",
  "invalid",
])("ignores Jump or other input when %s", (condition) => {
  occupied.set(
    "tent",
    condition === "non-occupant" ? asPlayerId("other") : pid,
  );
  foot.loadedTents.mockReturnValue(condition === "unloaded" ? [] : [target]);
  if (condition === "unseated")
    vi.mocked(occupants.isSeated).mockReturnValue(false);
  if (condition === "unknown seating")
    vi.mocked(occupants.isSeated).mockReturnValue(undefined);
  if (condition === "invalid") player.isValid = false;
  press(
    condition === "sneak" ? InputButton.Sneak : InputButton.Jump,
    condition === "released" ? ButtonState.Released : ButtonState.Pressed,
  );
  expect(game.show).not.toHaveBeenCalled();
  expect(leave.execute).not.toHaveBeenCalled();
});
it("waits for seating and sneak release before auto-opening, then retries only busy forms", async () => {
  interact();
  flush();
  expect(game.timeout).toHaveBeenLastCalledWith(expect.any(Function), 5);
  await pollMenu();
  expect(game.show).not.toHaveBeenCalled();
  player.isSneaking = false;
  vi.mocked(occupants.isSeated).mockReturnValue(false);
  await pollMenu();
  expect(game.show).not.toHaveBeenCalled();
  vi.mocked(occupants.isSeated).mockReturnValue(true);
  game.show
    .mockResolvedValueOnce({ canceled: true, cancelationReason: "UserBusy" })
    .mockResolvedValueOnce({ canceled: true, cancelationReason: "UserClosed" });
  await pollMenu();
  expect(game.show).toHaveBeenCalledOnce();
  expect(player.onScreenDisplay.setActionBar).not.toHaveBeenCalled();
  await pollMenu();
  expect(game.show).toHaveBeenCalledTimes(2);
  expectSeatedHint();
  expect(game.timeout.mock.calls).toHaveLength(0);
  expect(occupied.get("tent")).toBe(pid);
  expect(leave.execute).not.toHaveBeenCalled();
});
it("gives up after five busy forms with one seated hint", async () => {
  interact();
  flush();
  player.isSneaking = false;
  game.show.mockResolvedValue({
    canceled: true,
    cancelationReason: "UserBusy",
  });
  for (let i = 0; i < 5; i++) await pollMenu();
  expect(game.show).toHaveBeenCalledTimes(5);
  expect(game.timeout.mock.calls).toHaveLength(0);
  expectSeatedHint();
  expect(occupied.get("tent")).toBe(pid);
});
it.each(["sneaking", "mounting"])(
  "bounds waiting for %s to twenty polls",
  async (condition) => {
    interact();
    flush();
    if (condition === "mounting") {
      player.isSneaking = false;
      vi.mocked(occupants.isSeated).mockReturnValue(false);
    }
    for (let i = 0; i < 20; i++) await pollMenu();
    expect(game.show).not.toHaveBeenCalled();
    expect(game.timeout.mock.calls).toHaveLength(0);
    expectSeatedHint();
  },
);
it.each(["invalid", "left", "replaced"])(
  "stops auto-opening when the occupant is %s",
  async (condition) => {
    interact();
    flush();
    player.isSneaking = false;
    if (condition === "invalid") player.isValid = false;
    if (condition === "left") occupied.delete("tent");
    if (condition === "replaced") occupied.set("tent", asPlayerId("other"));
    await pollMenu();
    expect(game.timeout.mock.calls).toHaveLength(0);
    expect(game.show).not.toHaveBeenCalled();
    expect(player.onScreenDisplay.setActionBar).not.toHaveBeenCalled();
  },
);
it("stops busy retries after dismounting", async () => {
  interact();
  flush();
  player.isSneaking = false;
  game.show.mockResolvedValue({ cancelationReason: "UserBusy" });
  await pollMenu();
  vi.mocked(occupants.isSeated).mockReturnValue(false);
  await pollMenu();
  expect(game.show).toHaveBeenCalledOnce();
  expect(game.timeout.mock.calls).toHaveLength(0);
  expect(player.onScreenDisplay.setActionBar).not.toHaveBeenCalled();
});
it.each([0, 1])(
  "dispatches auto-opened choice %i without a seated hint",
  async (selection) => {
    interact();
    flush();
    player.isSneaking = false;
    game.show.mockResolvedValue({ selection });
    await pollMenu();
    expect(game.timeout.mock.calls).toHaveLength(0);
    expect(player.onScreenDisplay.setActionBar).not.toHaveBeenCalled();
    if (selection === 0) {
      expect(sleep.execute).toHaveBeenCalledOnce();
      expect(occupied.get("tent")).toBe(pid);
    } else {
      expect(leave.execute).toHaveBeenCalledOnce();
      expect(occupied.has("tent")).toBe(false);
    }
  },
);
it.each([
  [{ cancelationReason: "UserBusy" }, "busy"],
  [{ canceled: true }, "dismissed"],
  [{ selection: 0 }, "answered"],
] as const)(
  "reports the roof tent form outcome %j as %s",
  async (answer, result) => {
    occupied.set("tent", pid);
    game.show.mockResolvedValue(answer);
    expect(await showMenu(player as unknown as Player, "tent")).toBe(result);
  },
);

it("does not stack forms from repeated Jump presses", async () => {
  occupied.set("tent", pid);
  foot.loadedTents.mockReturnValue([target]);
  let close: (answer: unknown) => void = () => {};
  game.show.mockReturnValue(
    new Promise((resolve) => {
      close = resolve;
    }),
  );
  press();
  press();
  expect(game.show).toHaveBeenCalledOnce();
  close({ canceled: true });
  await vi.waitFor(() => expect(occupied.get("tent")).toBe(pid));
  expect(leave.execute).not.toHaveBeenCalled();
});
it("gives a fresh entry its own hint and ignores the previous entry's pending poll", async () => {
  interact();
  flush();
  occupied.clear();
  game.tick++;
  interact();
  flush();
  player.isSneaking = false;
  game.show.mockResolvedValue({ canceled: true });
  await pollMenu();
  expect(game.show).not.toHaveBeenCalled();
  await pollMenu();
  expectSeatedHint();
  occupied.clear();
  game.tick++;
  player.isSneaking = true;
  interact();
  flush();
  player.isSneaking = false;
  await pollMenu();
  expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledTimes(2);
  expect(game.timeout.mock.calls).toHaveLength(0);
});
