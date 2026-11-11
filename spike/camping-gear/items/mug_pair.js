export default {
  build(THREE, L) {
    const pair = new THREE.Group();
    const sides = 20;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    function glaze(colors, inside = false) {
      const map = L.canvasTex(32, 80, (ctx, w, h) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        for (const [stop, color] of colors) gradient.addColorStop(stop, color);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        let seed = inside ? 137 : 821;
        const random = () => {
          seed = (1664525 * seed + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        for (let i = 0; i < 650; i++) {
          const x = random() * w;
          const y = random() * h;
          ctx.fillStyle = random() < 0.64
            ? 'rgba(21,16,9,0.13)' : 'rgba(222,201,153,0.14)';
          ctx.fillRect(x, y, 0.5 + random() * 0.6, 0.5 + random() * 0.7);
        }
      });
      return new THREE.MeshStandardMaterial({
        map, roughness: 0.86, metalness: 0,
      });
    }

    function mug(x, palette) {
      const group = new THREE.Group();
      group.position.x = x;
      pair.add(group);
      const body = glaze([
        [0, palette.edge], [0.035, palette.upper], [0.22, palette.light],
        [0.65, palette.main], [0.92, palette.low], [1, palette.edge],
      ]);
      const inner = glaze([
        [0, palette.edge], [0.06, palette.main], [0.38, palette.low],
        [1, palette.deep],
      ], true);
      const edge = glaze([[0, palette.edge], [0.5, palette.low], [1, palette.edge]]);
      const handle = glaze([
        [0, palette.upper], [0.22, palette.light], [0.72, palette.main],
        [1, palette.low],
      ]);
      const spec = (radius) => ({
        a: radius, zf: -radius, zb: radius, nf: 2, nb: 2,
      });

      // The narrower foot leaves a visible undercut beneath the rounded heel.
      L.loft(group, [[0.015, spec(0.465)], [0.145, spec(0.485)]], edge,
        { N: sides, thick: 0.055 });
      L.loft(group, [
        [0.13, spec(0.535)], [0.23, spec(0.605)], [1.61, spec(0.67)],
      ], body, { N: sides, thick: 0.045 });
      L.loft(group, [[0.27, spec(0.48)], [1.61, spec(0.606)]], inner,
        { N: sides, thick: 0.035, inward: true });

      // Radial horizontal panels bridge the two walls without capping the mouth.
      for (let i = 0; i < sides; i++) {
        const a = i * Math.PI * 2 / sides;
        const b = (i + 1) * Math.PI * 2 / sides;
        const point = (r, t) => V(r * Math.cos(t), 1.61, r * Math.sin(t));
        L.panel(group, point(0.67, a), point(0.67, b),
          point(0.606, a), point(0.606, b), 0.022, edge, V(0, 0, 0));
      }

      const floor = L.texPlate(group, spec(0.495), 0.245, 0.272, {
        sc: 48,
        draw(ctx, w, h) {
          const gradient = ctx.createRadialGradient(w * 0.4, h * 0.35, 0,
            w * 0.5, h * 0.5, w * 0.52);
          gradient.addColorStop(0, palette.low);
          gradient.addColorStop(0.55, palette.deep);
          gradient.addColorStop(1, palette.edge);
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, w, h);
        },
      });
      const sole = L.texPlate(group, spec(0.467), 0, 0.018, {
        bottom: true, hole: spec(0.375), color: palette.edge, sc: 48,
      });
      for (const mesh of [floor, sole]) {
        for (const material of mesh.material) material.roughness = 0.9;
      }

      function strap(a, b, thickness, depth, material) {
        const delta = V(b[0] - a[0], b[1] - a[1], 0);
        const mesh = L.box(group, [-delta.length() / 2 - 0.018,
          -thickness / 2, -depth / 2],
        [delta.length() / 2 + 0.018, thickness / 2, depth / 2], material);
        mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
        mesh.rotation.z = Math.atan2(delta.y, delta.x);
      }

      // A narrow neck opens into a broad, flat thumb shelf before the angled bow.
      strap([0.638, 1.39], [0.76, 1.385], 0.075, 0.115, handle);
      strap([0.745, 1.385], [0.92, 1.40], 0.085, 0.17, handle);
      strap([0.905, 1.40], [1.075, 1.435], 0.10, 0.235, handle);
      strap([1.075, 1.435], [1.20, 1.19], 0.105, 0.19, handle);
      strap([1.20, 1.19], [1.23, 0.94], 0.105, 0.16, handle);
      strap([1.23, 0.94], [1.145, 0.71], 0.10, 0.14, handle);
      strap([1.145, 0.71], [0.91, 0.49], 0.095, 0.13, handle);
      strap([0.91, 0.49], [0.60, 0.30], 0.09, 0.115, handle);
    }

    mug(-1.32, {
      upper: '#647650', light: '#647e54', main: '#3e583d',
      low: '#263b2a', edge: '#202b1d', deep: '#15251a',
    });
    mug(0.69, {
      upper: '#a34b37', light: '#b55c43', main: '#994632',
      low: '#6c2e22', edge: '#40251d', deep: '#361711',
    });
    return pair;
  },
};
