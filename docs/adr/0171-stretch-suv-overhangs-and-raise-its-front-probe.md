# 0171. Stretch the SUV overhangs and raise its front probe

- Status: Proposed
- Date: 2026-10-27

## Context

ADR 0170 keeps the road wheels fixed in size and position and calls the wheel diameter target diagnostic: that ADR does not authorize resizing wheels to satisfy it, and tells a later PR to resolve a conflict between the photograph targets and the fixed mechanical contracts explicitly. The lower-body PR (#734) hits that conflict. With the wheels unchanged, `wheel_diameter` measures 0.1853 of overall length against a target of 0.174 +/-0.01, which is out of tolerance. The ratio only comes into tolerance if the overall length grows, and the greenhouse length ratio cannot be shortened further, so the length must grow at the overhangs. The tolerance is not loosened.

## Decision

- Stretch the front overhang by 0.6 model pixels and the rear overhang by 0.3 model pixels in `tools/gen_model.py` (`FRONT_OVERHANG_EXTENSION`, `REAR_OVERHANG_EXTENSION`). Wheel hubs, wheel size, seats, doors, the wheel animations, and the greenhouse stay unchanged. The wheel diameter ratio becomes 0.1827, inside the target tolerance only because of the longer body.
- Raise `SUV_SPEC.bodyFront` from 1.85 to 1.9, the front bumper and fog lamps reach 1.89 blocks ahead of the center, so the ram detection rectangle (0006) still covers the visible body. A test checks that the model's forward reach stays within the profile's front value. The rear reach is 2.24 blocks; the placement footprint of 2.35 (0122) still covers it.
- The 1.85 front and 2.22 rear quoted in 0006 and 0122 describe the earlier model. The values above supersede them for the SUV.

## Consequences

The wheel target is met through body length, not wheel size, which keeps the mechanical contracts of 0170. The SUV's forward ram reach grows by 0.05 blocks, a small gameplay change recorded here. Revisit this decision if the wheels are ever resized, since the overhang stretch would then no longer be needed.
