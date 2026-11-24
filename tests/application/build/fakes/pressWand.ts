import { vi } from "vitest";
import { FixStairGoal } from "../../../../src/application/build/fixStairGoal";
import { PasteAt } from "../../../../src/application/build/pasteAt";
import { PressPasteAim } from "../../../../src/application/build/pressPasteAim";
import { PressWand } from "../../../../src/application/build/pressWand";
import { ResolvePasteTarget } from "../../../../src/application/build/resolvePasteTarget";
import { SetPoint } from "../../../../src/application/build/setPoint";
import { TapAir } from "../../../../src/application/build/tapAir";
import type { PlayerId } from "../../../../src/domain/shared/ids";
import {
  FakeAimReader,
  FakeBuildPlayers,
  FakeFeedback,
  FakeGroundProbe,
  FakeSessions,
  FakeWorld,
} from "../fakes";
import { FakeStructureStore } from "./structureStore";

export function wandFixture(afterPaste?: (id: PlayerId, tick: number) => void) {
  const world = new FakeWorld();
  const aim = new FakeAimReader();
  const feedback = new FakeFeedback();
  const structures = new FakeStructureStore(world);
  const repo = new FakeSessions(structures);
  const onPasted = vi.fn(afterPaste);
  const press = new PressWand(
    repo,
    {
      setPoint: new SetPoint(repo, world, feedback),
      tapAir: new TapAir(repo, feedback, world),
      fixStairGoal: new FixStairGoal(repo, feedback, aim),
      pressPasteAim: new PressPasteAim(
        repo,
        new PasteAt(repo, world, feedback, structures, new FakeBuildPlayers()),
        feedback,
        new ResolvePasteTarget(repo, new FakeGroundProbe()),
      ),
      onPasted,
    },
    world,
  );
  return { repo, press, world, aim, feedback, structures, onPasted };
}
