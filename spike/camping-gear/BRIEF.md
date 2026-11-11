# Brief for one camping gear item (throwaway spike)

Goal: build ONE item as a high-precision model that matches its reference photos, previewed in the browser viewer in this folder. Keep the item at its current size (`px` in `items/manifest.js`: [width, height] in Bedrock pixels, 16 px = 1 block). Detail comes from tilted thin cubes ("panels") and alpha-cut textures, not from a bigger item.

## Write exactly one file: `items/<id>.js`

```js
export default {
  build(THREE, L) {
    const g = new THREE.Group();
    // ... add meshes to g using the helpers in L ...
    return g; // front = -z, origin at the middle of the base, y = 0 on the floor, units = Bedrock px
  },
};
```

Do not edit `lib.js`, `index.html`, `manifest.js`, or another item's file. If you need a helper that `lib.js` lacks, write it inside your own item file.

## Helpers in `L` (see lib.js)

`box(parent, [x0,y0,z0], [x1,y1,z1], mat)`, `loft(parent, rings, mat, {N, thick})` (rings = `[height, {a, zf, zb, xc, nf, nb}]` super-ellipse, or rounded rectangle `{a, zf, zb, r, k}`; N panels per ring; use N=8 for an octagon), `panel(...)`, `tube(parent, pts, size, mat)`, `texPlate(parent, outlineSpec, y0, y1, {draw, hole, bottom, sc})` (a flat plate as ONE cube; outline and hole are drawn into an alpha-cut texture), `topOnly`, `roundPost`, `lightDisc`, `canvasTex(w, h, draw)`, and `L.M` (starter materials: chrome, dark, por, wood, water, ...). Create your own `THREE.MeshStandardMaterial`s freely; paint gloss into canvas textures (Bedrock entities cannot reflect), so keep metalness low and put highlight bands in the texture.

## Hard constraints (they decide whether it can ship in Bedrock)

- Only cubes (boxes), each optionally rotated. No curved or custom meshes, no `CylinderGeometry`, no `SphereGeometry`. Round shapes are rings of tilted panels (`loft`) or a textured flat plate.
- Per-face textures only; a texture is a canvas painted at ~16-48 texels per pixel of model size. Alpha-cut (on/off) transparency, no soft alpha, except glass which may use a plain translucent material.
- Budget: aim for under 250 cubes; never over 400.
- Stay inside the given `px` width x height (width = x and z extent, a small overhang for a handle or spout is fine if the photos show it).
- Front of the item is -z. Show the most characteristic side (handle, spout, dial face) toward -z.

## How to check your work

The viewer runs at `http://127.0.0.1:8124/index.html#<id>` (a static server is already running; reload the page to pick up your file). Reference photos are in `ref/` (names are listed in `items/manifest.js`). Compare the model from the same angle as each photo (Front / Back / Left / Right / Top / 3/4 buttons, Overlay slider). A headless capture is available through `window.shot(itemId, viewName)` which returns a PNG data URL; use Playwright or the Chrome tools if available, otherwise `node --check items/<id>.js` plus careful reading is the minimum.

## Done means

1. `items/<id>.js` builds without errors and shows in the viewer.
2. The features the owner named are recognisable at a glance and in close-up: see the item notes below.
3. Reply with: cube count, what you matched, what you could not match at this size and why, and any texture/material needs (e.g. alpha cut-outs) that the real Resource Pack must support.
