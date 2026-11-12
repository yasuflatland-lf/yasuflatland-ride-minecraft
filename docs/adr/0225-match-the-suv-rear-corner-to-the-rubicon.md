# 0225. Match the SUV rear corner to the Rubicon

- Status: Accepted
- Date: 2026-11-05
- Supersedes in part: [0214](0214-replace-the-suv-with-the-rubicon-shape.md): the rear overhang, rear bumper, and bumper height rows, and the rear bumper, rear overfender, fuel door, and spare height
- Related: [0015](0015-dev-server-docker-nethernet.md): bump the Resource Pack version so devices drop the cached geometry

## Context

From the rear quarters, the 0214 body differed from the Rubicon photos in four ways. The rear overfender reached the body's rear edge, about 0.55 D behind the axle against about 0.38 D on the side photo (measured by eye). The fuel door sat on the vehicle's right, so it was missing from the left side where the photos show it, and the overfender partly covered it. The bumper's end caps stood out as boxes, and its plain top stayed clear below the spare. The photos show a bumper corner that receives the overfender's end and a notch that takes the spare's lower edge.

The owner compared six renders with the photos from the same angles and approved the last one. The side photo reads the bumper's underside about 0.17 D above the rock rail's top, and the rear quarter photo shows them about level. The owner first asked for the level reading, then set the bumper's height by eye, which put its underside 0.015 D below the rail's top. This shape follows the rear quarters.

## Decision

- End the rear overfender at 3.41 D from the front axle, 0.94 D high, and fill the side behind it with a body panel. Keep that panel's underside at 0.84 D on both sides: the tread corners sweep up to 0.822 D at its front edge, beyond the nominal tyre radius. The panel, overfender and bumper must clear the tyres throughout a full rotation.
- Build the rear bumper from 0.72 D to 0.92 D high, with a stepped notch in the top that is 0.31 D to 0.39 D from the centre at each side and has its floor at 0.765 D.
- Taper the bumper's ends and run each corner forward under the overfender's end. The corner's front edge moves from 3.38 D at 0.91 D high back toward the tyre lower down, in ten steps.
- Draw the bumper's panels as thin outlines in the bumper's own colour, so they read as shallow insets.
- Lower the spare's centre from 1.35 D to 1.28 D, and remove the support cube under the spare, which would stand in the notch.
- Move the fuel door to the vehicle's left, at model +x, 3.39 D from the front axle. Build it from three stacked discs with no logo.
- Re-record three proportion rows from the model: rear overhang 0.722, rear bumper 0.316, bumper height 0.241.
- Bump the Resource Pack and the Behavior Pack dependency to 0.1.255.

## Consequences

- The side view of the bumper's underside stays about 0.17 D higher than the photo relative to the rail, because the rail keeps its 0.735 D top. Moving the rail would change the recorded ground clearance, so it is left for a separate decision.
- The raised underside shows more of the suspension links from the rear quarters.
- The corner's front edge is a staircase of small steps, not the photo's smooth line. If it shows on a device, replace the steps with one tilted cube.
- The renders come from the preview renderer. The look in game still needs a client check.
