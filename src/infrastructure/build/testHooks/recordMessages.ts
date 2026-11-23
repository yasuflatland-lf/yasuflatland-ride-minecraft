import type {
  BuildMessage,
  BuildMode,
} from "../../../application/build/ports/feedback";
import type { PlayerId } from "../../../domain/shared/ids";
import type { BedrockFeedback } from "../bedrock/bedrockFeedback";

interface LastMessage {
  message: BuildMessage;
  count?: number;
  skippedCount?: number;
}

// Edit jobs report completion from later ticks, after the script event returns.
export function recordMessages(feedback: BedrockFeedback) {
  const latest = new Map<PlayerId, LastMessage>();
  const modes = new Map<PlayerId, BuildMode>();
  const hints = new Map<PlayerId, number>();
  feedback.listeners.add({
    onMessage: (id, message, count, _material, skippedCount) => {
      latest.set(id, { message, count, skippedCount });
    },
    onMode: (id, mode) => modes.set(id, mode),
    onUndoHint: (id) => hints.set(id, (hints.get(id) ?? 0) + 1),
  });
  return {
    hints: (playerId: PlayerId) => hints.get(playerId) ?? 0,
    last: (playerId: PlayerId) => latest.get(playerId),
    lastMode: (playerId: PlayerId) => modes.get(playerId),
    forget: (playerId: PlayerId) => {
      latest.delete(playerId);
      modes.delete(playerId);
      hints.delete(playerId);
    },
  };
}
