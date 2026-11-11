export default {
  build(THREE, L) {
    const g = new THREE.Group();
    const cx = 0.34;
    const circle = (r) => ({ a: r, zf: -r, zb: r, xc: cx, nf: 2, nb: 2 });
    const enamel = (height, band, shade = 1) => {
      const map = L.canvasTex(24, Math.max(16, Math.ceil(height * 48)), (c, w, h) => {
        const grad = c.createLinearGradient(0, 0, 0, h);
        for (const [stop, color] of band) grad.addColorStop(stop, color);
        c.fillStyle = grad;
        c.fillRect(0, 0, w, h);
        const sheen = c.createLinearGradient(0, 0, w, 0);
        sheen.addColorStop(0, "#ffffff00");
        sheen.addColorStop(0.32, "#e5efb919");
        sheen.addColorStop(0.62, "#ffffff05");
        sheen.addColorStop(1, "#0000000a");
        c.fillStyle = sheen;
        c.fillRect(0, 0, w, h);
      });
      return new THREE.MeshStandardMaterial({
        map, color: new THREE.Color(shade, shade, shade),
        roughness: 0.36, metalness: 0.02,
      });
    };
    const wallBand = [[0, "#3c581e"], [0.04, "#607338"], [0.09, "#354e18"],
      [0.6, "#2b4213"], [0.91, "#263b13"], [1, "#1c2d10"]];
    const ribBand = [[0, "#203511"], [0.21, "#39571b"], [0.43, "#526c2a"],
      [0.51, "#87965a"], [0.61, "#4c6927"], [0.82, "#2b4514"], [1, "#22380f"]];
    const black = new THREE.MeshStandardMaterial({
      map: L.canvasTex(16, 48, (c, w, h) => {
        const grad = c.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, "#101211");
        grad.addColorStop(0.18, "#363936");
        grad.addColorStop(0.33, "#252825");
        grad.addColorStop(1, "#101210");
        c.fillStyle = grad;
        c.fillRect(0, 0, w, h);
      }), roughness: 0.56, metalness: 0.02,
    });
    const inside = new THREE.MeshStandardMaterial({ color: 0x080d09, roughness: 0.85 });
    const green = enamel(0.2, ribBand);

    // Narrow courses form rolled enamel shoulders, rather than a conical body.
    const profile = [[0.035, 1.74], [0.16, 1.90], [1.47, 1.95],
      [1.68, 1.94], [1.85, 1.80], [1.94, 1.79],
      [2.09, 1.64], [2.19, 1.64], [2.32, 1.47], [2.39, 1.46]];
    const rings = profile.map(([y, r]) => L.ringPts(y, circle(r), 16));
    for (let k = 0; k < rings.length - 1; k++) {
      for (let j = 0; j < 16; j++) {
        const angle = (j + 0.5) * Math.PI / 8;
        const shade = 0.78 + 0.22 * Math.cos(angle + 2.1);
        L.panel(g, rings[k][j], rings[k][(j + 1) % 16],
          rings[k + 1][j], rings[k + 1][(j + 1) % 16], 0.045,
          enamel(profile[k + 1][0] - profile[k][0], k === 1 ? wallBand : ribBand, shade),
          L.V(cx, 0, 0));
      }
    }
    L.texPlate(g, circle(1.76), 0.005, 0.04, { bottom: true, color: "#1b2b0e" });

    // A dark seating seam separates the removable lid from the upper shoulder.
    L.loft(g, [[2.385, circle(1.455)], [2.44, circle(1.455)],
      [2.63, circle(1.24)]], green, { N: 16, thick: 0.045 });
    L.texPlate(g, circle(1.26), 2.615, 2.65, {
      draw(c, w, h) {
        const grad = c.createRadialGradient(w * 0.37, h * 0.27, w * 0.05, w / 2, h / 2, w / 2);
        grad.addColorStop(0, "#4e6829");
        grad.addColorStop(0.65, "#3a551d");
        grad.addColorStop(0.86, "#536d2b");
        grad.addColorStop(0.91, "#728348");
        grad.addColorStop(1, "#2b4315");
        c.fillStyle = grad;
        c.fillRect(0, 0, w, h);
      },
    });
    L.box(g, [cx - 0.22, 2.64, -0.22], [cx + 0.22, 2.84, 0.22], black);
    L.loft(g, [[2.82, circle(0.49)], [2.94, circle(0.53)]], black, { N: 12, thick: 0.04 });
    L.texPlate(g, circle(0.53), 2.93, 2.965, {
      draw(c, w, h) {
        const grad = c.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#343633");
        grad.addColorStop(0.3, "#232522");
        grad.addColorStop(1, "#141613");
        c.fillStyle = grad;
        c.fillRect(0, 0, w, h);
      },
    });

    const handleZ = 0.06;
    const spout = new THREE.Group();
    spout.position.set(cx + 1.46, 1.12, handleZ);
    spout.quaternion.setFromUnitVectors(L.V(0, 1, 0), L.V(Math.hypot(0.77, 0.15), 0.62, 0).normalize());
    g.add(spout);
    const mouth = (r) => ({ a: r, zf: -r * 0.83, zb: r * 0.83, nf: 2, nb: 2 });
    L.loft(spout, [[0, mouth(0.43)], [0.64, mouth(0.32)],
      [1.50, mouth(0.22)], [1.56, mouth(0.245)]], green, { N: 8, thick: 0.035 });
    L.loft(spout, [[1.33, mouth(0.185)], [1.55, mouth(0.21)]], inside,
      { N: 8, thick: 0.022, inward: true });
    L.texPlate(spout, mouth(0.19), 1.325, 1.335, { color: "#050906" });

    for (const sign of [-1, 1]) {
      const x = cx + sign * 1.51;
      L.box(g, [x - 0.105, 2.11, -0.15], [x + 0.105, 2.64, 0.26], black);
      L.box(g, [x - 0.16, 2.32, -0.17], [x + 0.16, 2.74, 0.22], black);
      // The rivet is an alpha-cut disc on a thin cube, facing the front.
      const rivet = L.topOnly(g, [-0.09, -0.012, -0.09], [0.09, 0.012, 0.09], L.lightDisc);
      rivet.rotation.x = -Math.PI / 2;
      rivet.position.set(x, 2.50, -0.19);
      const pin = L.box(g, [-0.028, -0.028, -0.008], [0.028, 0.028, 0.008], inside);
      pin.position.set(x, 2.50, -0.208);
    }
    L.tube(g, [
      [cx - 1.65, 2.49, handleZ], [cx - 1.65, 3.96, handleZ],
      [cx - 1.58, 4.26, handleZ], [cx - 1.39, 4.51, handleZ],
      [cx - 1.12, 4.67, handleZ], [cx - 0.82, 4.72, handleZ],
      [cx + 0.82, 4.72, handleZ], [cx + 1.12, 4.67, handleZ],
      [cx + 1.39, 4.51, handleZ], [cx + 1.58, 4.26, handleZ],
      [cx + 1.65, 3.96, handleZ], [cx + 1.65, 2.49, handleZ],
    ], 0.205, black);
    return g;
  },
};
