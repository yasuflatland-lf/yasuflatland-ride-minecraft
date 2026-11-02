# Specs

The specs in this folder state the rules that apply now, one topic per file, so you can read the current behavior without reading every ADR. The ADRs stay the source: each rule names the ADR section it comes from, where it is implemented, and how it was verified, and a mismatch between an ADR and the code is recorded under Open issues instead of being resolved by choosing a side. A pull request that changes behavior updates the matching spec in the same pull request. `pnpm lint:docs` checks the format, the links, and that each rule's Agreement matches the Status of its Basis ADRs.

## Topics

- [SUV body and seats](suv-body.md): The SUV's model contract, size, collision box, body proportions, and seat positions.
- [Seats and driver selection](seats-and-driver.md): Which seat a rider takes, how a boarding player picks one, and who drives, for the SUV, camper, sports boat, and bulldozer.
- [Camper hover display](camper-hover-display.md): What the camper shows in hover form: the four glow discs under the folded wheels, the particles that leave them, and the emissive overlay that makes the discs bright.
- [Development server](dev-environment.md): How the dev Bedrock Dedicated Server runs in Docker, which transport and ports it uses, how the packs reach it, how devices avoid a stale Resource Pack, and which packs go to a Realm.
