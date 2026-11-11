// Count the cubes each spike item builds and how many non-zero Euler axes (ZYX order, as
// Bedrock composes Rz * Ry * Rx; ADR 0167) each cube carries in the item frame.
// Usage: node count-spike-cubes.mjs <spike/camping-gear dir> <path to three@0.160.0 build/three.module.js>
const THREE = await import(process.argv[3]);
const spike = process.argv[2];
const ctx = new Proxy({}, { get: (t, k) => (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") ? () => ({ addColorStop() {} }) : (k === "measureText" ? () => ({ width: 1 }) : (k === "getImageData" ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {})), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const { makeLib } = await import(`${spike}/lib.js`);
const { ITEMS } = await import(`${spike}/items/manifest.js`);
for (const item of ITEMS) {
  const L = makeLib(THREE);
  L.stats.reset();
  const g = (await import(`${spike}/items/${item.id}.js`)).default.build(THREE, L);
  g.updateMatrixWorld(true);
  let boxes = 0; const axes = [0, 0, 0, 0];
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.geometry.type !== "BoxGeometry") return;
    boxes++;
    o.matrixWorld.decompose(p, q, s); e.setFromQuaternion(q, "ZYX");
    const n = [e.x, e.y, e.z].filter((a) => Math.abs(a) > 1e-4 && Math.abs(Math.abs(a) - Math.PI) > 1e-4).length;
    axes[n]++;
  });
  console.log(`${item.id}\tpanels=${L.stats.panels}\tboxes=${boxes}\taxes0=${axes[0]}\taxes1=${axes[1]}\taxes2=${axes[2]}\taxes3=${axes[3]}`);
}
