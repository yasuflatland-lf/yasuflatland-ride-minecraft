import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { placePaid } from "../../../src/application/shared/paidPlacement";
import { asPlayerId } from "../../../src/domain/shared/ids";

it("takes payment before spawning and refunds only a taken item after failure", () => {
  fc.assert(
    fc.property(
      fc.record({
        creative: fc.boolean(),
        hasPlayer: fc.boolean(),
        consumeOk: fc.boolean(),
        spawnOk: fc.boolean(),
      }),
      ({ creative, hasPlayer, consumeOk, spawnOk }) => {
        const player = hasPlayer ? asPlayerId("p") : undefined;
        const slot = 3;
        const id = 0;
        const payment = {
          isCreative: vi.fn(() => creative),
          consumeItem: vi.fn(() => consumeOk),
          refund: vi.fn(),
        };
        const spawn = vi.fn(() => (spawnOk ? id : undefined));

        const result = placePaid(payment, { player, slot }, spawn);

        const owesPayment = hasPlayer && !creative;
        expect(payment.isCreative.mock.calls).toEqual(
          hasPlayer ? [[player]] : [],
        );
        expect(payment.consumeItem.mock.calls).toEqual(
          owesPayment ? [[player, slot]] : [],
        );
        if (owesPayment && !consumeOk) {
          expect(spawn).not.toHaveBeenCalled();
          expect(payment.refund).not.toHaveBeenCalled();
          expect(result).toEqual({ placed: false, reason: "unpaid" });
          return;
        }

        expect(spawn).toHaveBeenCalledTimes(1);
        if (owesPayment)
          expect(payment.consumeItem).toHaveBeenCalledBefore(spawn);
        if (owesPayment && !spawnOk) {
          expect(payment.refund).toHaveBeenCalledExactlyOnceWith(player, slot);
          expect(spawn).toHaveBeenCalledBefore(payment.refund);
        } else {
          expect(payment.refund).not.toHaveBeenCalled();
        }
        expect(result).toEqual(
          spawnOk
            ? { placed: true, id }
            : { placed: false, reason: "spawnFailed" },
        );
      },
    ),
  );
});
