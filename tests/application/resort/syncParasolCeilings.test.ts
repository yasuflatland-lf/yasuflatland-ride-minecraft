import fc from "fast-check";
import { expect, it } from "vitest";
import { SyncParasolCeilings } from "../../../src/application/resort/syncParasolCeilings";
import { asParasolId } from "../../../src/domain/resort/ids";
import { fakeParasolWorld } from "./fakeParasolWorld";

it("restores every loaded parasol ceiling", () => {
  fc.assert(
    fc.property(fc.uniqueArray(fc.string()), (ids) => {
      const world = fakeParasolWorld();
      new SyncParasolCeilings(world).execute(ids.map(asParasolId));
      expect(world.layCeiling.mock.calls).toEqual(ids.map((id) => [id]));
    }),
  );
});
