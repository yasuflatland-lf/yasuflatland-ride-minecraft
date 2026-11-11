export default {
  build(THREE, L) {
    const g = new THREE.Group();
    const circle = (r, xc = 0) => ({ a: r, zf: -r, zb: r, xc, nf: 2, nb: 2 });
    const paint = (colors, horizontal = false) => (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, horizontal ? w : 0, horizontal ? 0 : h);
      colors.forEach(([stop, color]) => gradient.addColorStop(stop, color));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    };
    const chromeDraw = paint([
      [0, '#626b70'], [0.14, '#faffff'], [0.29, '#d8e0e3'],
      [0.43, '#ffffff'], [0.51, '#586166'], [0.65, '#a6b0b6'],
      [0.83, '#f6fcff'], [1, '#858c91'],
    ]);
    const chrome = new THREE.MeshStandardMaterial({
      map: L.canvasTex(32, 32, chromeDraw), roughness: 0.24, metalness: 0.18,
    });
    const blackDraw = paint([
      [0, '#141516'], [0.22, '#363839'], [0.4, '#454747'],
      [0.62, '#2c2e2f'], [1, '#141516'],
    ]);
    const black = new THREE.MeshStandardMaterial({
      map: L.canvasTex(32, 32, blackDraw), roughness: 0.48, metalness: 0.02,
    });
    const enamel = Array.from({ length: 20 }, (_, sector) => {
      const map = L.canvasTex(32, 48, (ctx, w, h) => {
        for (let x = 0; x < w; x++) {
          const angle = (sector + x / w) * Math.PI * 2 / 20;
          const wrapped = Math.atan2(Math.sin(angle + 2.1), Math.cos(angle + 2.1));
          const sheen = Math.exp(-((wrapped / 0.25) ** 2));
          const light = 0.8 + 0.16 * Math.cos(angle + 2.1);
          const gradient = ctx.createLinearGradient(0, 0, 0, h);
          gradient.addColorStop(0, `rgb(${Math.round(235 * light)},28,23)`);
          gradient.addColorStop(0.25, `rgb(${Math.round(225 * light + 20 * sheen)},${Math.round(22 + 55 * sheen)},${Math.round(18 + 48 * sheen)})`);
          gradient.addColorStop(0.8, `rgb(${Math.round(214 * light + 20 * sheen)},${Math.round(13 + 42 * sheen)},${Math.round(11 + 36 * sheen)})`);
          gradient.addColorStop(1, '#ab100c');
          ctx.fillStyle = gradient;
          ctx.fillRect(x, 0, 1, h);
        }
      });
      return new THREE.MeshStandardMaterial({ map, roughness: 0.24, metalness: 0.02 });
    });
    const redSurface = (rings) => {
      const pts = rings.map(([y, r]) => L.ringPts(y, circle(r), 20));
      for (let k = 0; k < pts.length - 1; k++) {
        for (let j = 0; j < 20; j++) {
          L.panel(g, pts[k][j], pts[k][(j + 1) % 20],
            pts[k + 1][j], pts[k + 1][(j + 1) % 20],
            0.035, enamel[j], L.V(0, 0, 0));
        }
      }
    };
    const redDraw = (ctx, w, h) => {
      const shine = ctx.createRadialGradient(w * 0.32, h * 0.26, 0, w / 2, h / 2, w * 0.66);
      shine.addColorStop(0, '#f15b50');
      shine.addColorStop(0.42, '#e3261c');
      shine.addColorStop(1, '#b4110b');
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, w, h);
    };

    // The bottom rolls inward, while the upper wall stays almost cylindrical.
    redSurface([[0.025, 1.44], [0.12, 1.66], [0.34, 1.79], [1.93, 1.84]]);
    L.texPlate(g, circle(1.45), 0, 0.025, { draw: redDraw, bottom: true });
    L.loft(g, [[1.93, circle(1.88)], [2.035, circle(1.92)]], chrome, { N: 20, thick: 0.035 });
    L.texPlate(g, circle(1.92), 2.025, 2.04, {
      draw: chromeDraw, hole: circle(1.78),
    });
    // A dark seat line separates the rolled metal rim from the removable lid.
    L.texPlate(g, circle(1.81), 2.038, 2.047, {
      color: '#640a07', hole: circle(1.73),
    });
    redSurface([[2.045, 1.80], [2.21, 1.73], [2.47, 1.13], [2.58, 0.35]]);
    L.texPlate(g, circle(0.37), 2.565, 2.58, { draw: redDraw });

    L.loft(g, [[2.575, circle(0.49)], [2.625, circle(0.46)]], chrome, { N: 12, thick: 0.025 });
    L.texPlate(g, circle(0.465), 2.62, 2.635, { draw: chromeDraw });
    L.loft(g, [[2.63, circle(0.29)], [2.70, circle(0.32)],
      [2.85, circle(0.44)], [2.955, circle(0.37)]], black, { N: 12, thick: 0.025 });
    L.texPlate(g, circle(0.375), 2.947, 2.975, {
      draw: (ctx, w, h) => {
        const gradient = ctx.createRadialGradient(w * 0.35, h * 0.25, 1, w / 2, h / 2, w / 2);
        gradient.addColorStop(0, '#626363');
        gradient.addColorStop(0.6, '#343536');
        gradient.addColorStop(1, '#202122');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      },
    });

    // A separate metal socket remains visible between the enamel and the grip.
    L.box(g, [1.77, 1.67, -0.24], [2.10, 1.96, 0.24], chrome);
    const handle = new THREE.Group();
    handle.position.set(2.02, 1.81, 0);
    handle.rotation.z = 0.13;
    g.add(handle);
    L.box(handle, [-0.04, -0.1, -0.19], [0.20, 0.16, 0.19], black);
    const outline = { a: 0.96, xc: 1.02, zf: -0.32, zb: 0.32, r: 0.24, k: 3 };
    const hole = { a: 0.23, xc: 1.57, zf: -0.11, zb: 0.11, nf: 2, nb: 2 };
    L.texPlate(handle, outline, 0.015, 0.235, { draw: blackDraw, hole });
    L.texPlate(handle, outline, 0.015, 0.235, { draw: blackDraw, hole, bottom: true });
    L.loft(handle, [[0.015, outline], [0.235, outline]], black, { thick: 0.025 });
    L.loft(handle, [[0.015, hole], [0.235, hole]], black, { N: 12, thick: 0.02, inward: true });
    return g;
  },
};
