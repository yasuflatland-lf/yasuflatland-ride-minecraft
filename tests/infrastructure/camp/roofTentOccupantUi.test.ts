import type { Player } from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { EnterRoofTent } from "../../../src/application/camp/enterRoofTent";
import { LeaveRoofTent } from "../../../src/application/camp/leaveRoofTent";
import type { RoofTentOccupantWorld } from "../../../src/application/camp/ports/roofTentOccupant";
import { RoofTentMenu } from "../../../src/application/camp/roofTentMenu";
import type { SleepInRoofTent } from "../../../src/application/camp/sleepInRoofTent";
import { ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../src/domain/shared/ids";
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
