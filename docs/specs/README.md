# Specs

The specs in this folder state the rules that apply now, one topic per file, so you can read the current behavior without reading every ADR. The implementation (code, pack assets, and tests) is the source of truth when it disagrees with a spec or an ADR. Each rule states what the implementation does, cites its code or asset, names the ADR section it came from in Basis, and records how it was verified. List each difference from an ADR's Decision, Context, or Consequences under Open issues as: "ADR NNNN says X; the implementation does Y (path); the ADR needs an edit or a superseding ADR". If the implementation does not do something an ADR describes, list it only under Open issues, not as a rule. Never leave a difference unrecorded or change code or ADR text to reconcile it while writing a spec. A pull request that changes behavior updates the matching spec in the same pull request. `pnpm lint:docs` checks the format, the links, and that each rule's Agreement matches the Status of its Basis ADRs.

## Topics

- [SUV body and seats](suv-body.md): The SUV's model contract, size, collision box, body proportions, and seat positions.
- [Seats and driver selection](seats-and-driver.md): Which seat a rider takes, how a boarding player picks one, and who drives, for the SUV, camper, sports boat, and bulldozer.
- [Camper hover display](camper-hover-display.md): What the camper shows in hover form: the four glow discs under the folded wheels, the particles that leave them, and the emissive overlay that makes the discs bright.
- [Development server](dev-environment.md): How the dev Bedrock Dedicated Server runs in Docker, which transport and ports it uses, how the packs reach it, how devices avoid a stale Resource Pack, and which packs go to a Realm.
