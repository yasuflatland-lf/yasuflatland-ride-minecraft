import fc from "fast-check";
import { expect, it } from "vitest";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CopySelection } from "../../../src/application/build/copySelection";
import { CutBox } from "../../../src/application/build/cutBox";
import { AIR } from "../../../src/domain/build/blockState";
import {
  FACINGS,
  type Facing,
} from "../../../src/domain/build/rotation/facing";
import {
  type Selection,
  selectionOf,
} from "../../../src/domain/build/selection";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions, FakeWorld, overworld } from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

type BoxAction = (cmd: {
  playerId: PlayerId;
  selection: Selection;
  facing: Facing;
}) => void;
type Factory = (
  repo: FakeSessions,
  structures: FakeStructureStore,
  feedback: FakeFeedback,
) => BoxAction;

const actions: [string, Factory][] = [
  [
    "CopyBox",
    (repo, structures, feedback) => {
      const action = new CopyBox(repo, structures, feedback);
      return (cmd) => action.execute(cmd);
    },
  ],
  [
    "CutBox",
    (repo, structures, feedback) => {
      const action = new CutBox(repo, new FakeWorld(), structures, feedback, {
        warn: () => {},
      });
      return (cmd) => action.execute(cmd);
    },
  ],
  [
    "CopySelection",
    (repo, structures, feedback) =>
      ({ playerId, selection, facing }) => {
        repo.getOrCreate(playerId).confirmBox(selection);
        new CopySelection(
          repo,
          new CopyBox(repo, structures, feedback),
          feedback,
          {
            facingOf: () => facing,
          },
        ).execute({ playerId });
      },
  ],
];

it.each(actions)(
  "%s stores the passed facing in the clipboard",
  (_name, makeAction) => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FACINGS),
        fc.integer({ min: 1, max: 5 }),
        (facing, side) => {
          const repo = new FakeSessions();
          const structures = new FakeStructureStore();
          const feedback = new FakeFeedback();
          const playerId = asPlayerId("builder");
          const box = {
            min: { x: 0, y: 0, z: 0 },
            max: { x: side, y: side, z: side },
          };
          const action = makeAction(repo, structures, feedback);
          action({
            playerId,
            selection: selectionOf(overworld, box, AIR),
            facing,
          });
          expect(repo.get(playerId)?.clipboard?.facing).toBe(facing);
        },
      ),
    );
  },
);
