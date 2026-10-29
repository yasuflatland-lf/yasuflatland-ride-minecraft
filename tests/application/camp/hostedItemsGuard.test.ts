import fc from "fast-check";
import { expect, it } from "vitest";
import { HostedItemsGuard } from "../../../src/application/camp/hostedItemsGuard";
import type { HostedKindPort } from "../../../src/application/camp/ports/hostedKind";
import type { Host } from "../../../src/domain/camp/hosted";

interface FakeItem {
  host: Host;
  areaLoaded: boolean;
}

/** An in-memory kind: an item is loaded while it has an entry in `items`. */
class FakeKind implements HostedKindPort {
  readonly removed: string[] = [];

  constructor(
    readonly items: Map<string, FakeItem>,
    private readonly hosts: ReadonlySet<string>,
  ) {}

  loaded(): readonly string[] {
    return [...this.items.keys()];
  }
  host(id: string): Host {
    return this.items.get(id)?.host ?? { kind: "ground" };
  }
  isHostAreaLoaded(id: string): boolean {
    return this.items.get(id)?.areaLoaded ?? false;
  }
  hostExists(hostId: string): boolean {
    return this.hosts.has(hostId);
  }
  remove(id: string): void {
    this.removed.push(id);
    this.items.delete(id);
  }
}

const hostId = fc.constantFrom("table", "pit", "gone");
const host: fc.Arbitrary<Host> = fc.oneof(
  fc.constant({ kind: "ground" } as const),
  fc.record({
    kind: fc.constant("fire_pit" as const),
    id: hostId,
    spot: fc.constant(0),
  }),
  fc.record({
    kind: fc.constant("camp_table" as const),
    id: hostId,
    at: fc.record({
      x: fc.integer({ min: -9, max: 9 }),
      z: fc.integer({ min: -1, max: 1 }),
    }),
  }),
);
const items = fc.array(fc.record({ host, areaLoaded: fc.boolean() }), {
  maxLength: 8,
});
const existingHosts = fc
  .subarray(["table", "pit", "gone"])
  .map((ids) => new Set(ids));

const kindOf = (list: readonly FakeItem[], hosts: ReadonlySet<string>) =>
  new FakeKind(new Map(list.map((item, i) => [`item${i}`, item])), hosts);

const missingHost = (item: FakeItem, hosts: ReadonlySet<string>) =>
  item.host.kind !== "ground" && item.areaLoaded && !hosts.has(item.host.id);

it("removes exactly the hosted items whose host is gone from a loaded area", () => {
  fc.assert(
    fc.property(items, existingHosts, (list, hosts) => {
      const kind = kindOf(list, hosts);
      new HostedItemsGuard([kind]).check();
      const expected = list.flatMap((item, i) =>
        missingHost(item, hosts) ? [`item${i}`] : [],
      );
      expect(kind.removed).toEqual(expected);
    }),
  );
});

it("checks every registered kind against its own hosts", () => {
  fc.assert(
    fc.property(
      fc.array(fc.tuple(items, existingHosts), { maxLength: 3 }),
      (kinds) => {
        const fakes = kinds.map(([list, hosts]) => kindOf(list, hosts));
        new HostedItemsGuard(fakes).check();
        kinds.forEach(([list, hosts], k) => {
          expect(fakes[k]?.removed.length).toBe(
            list.filter((item) => missingHost(item, hosts)).length,
          );
        });
      },
    ),
  );
});

it("removes nothing more on a second pass", () => {
  fc.assert(
    fc.property(items, existingHosts, (list, hosts) => {
      const kind = kindOf(list, hosts);
      const guard = new HostedItemsGuard([kind]);
      guard.check();
      const first = kind.removed.length;
      guard.check();
      expect(kind.removed.length).toBe(first);
    }),
  );
});

it("keeps an item in an unloaded area, on the ground, or on an existing host", () => {
  const table = {
    kind: "camp_table",
    id: "table",
    at: { x: 0, z: 0 },
  } as const;
  const kind = kindOf(
    [
      { host: table, areaLoaded: false },
      { host: { kind: "ground" }, areaLoaded: true },
      { host: { kind: "fire_pit", id: "pit", spot: 0 }, areaLoaded: true },
      { host: table, areaLoaded: true },
    ],
    new Set(["pit"]),
  );
  new HostedItemsGuard([kind]).check();
  expect(kind.removed).toEqual(["item3"]);
});
