export default {
  build(THREE, L) {
    const g = new THREE.Group();
    const { box, canvasTex, invisible } = L;
    const tau = Math.PI * 2;
    const material = (map) => new THREE.MeshStandardMaterial({
      map, roughness: 0.42, metalness: 0.08, alphaTest: 0.5,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.8 });
    function steelDraw(c, w, h, horizontal = false) {
      const gr = c.createLinearGradient(0, 0, horizontal ? 0 : w, horizontal ? h : 0);
      [[0, '#737779'], [0.07, '#e6e6e3'], [0.22, '#fafaf7'],
        [0.48, '#b9bcbd'], [0.72, '#e2e3e0'], [0.91, '#a8acad'], [1, '#626669']]
        .forEach(([p, col]) => gr.addColorStop(p, col));
      c.fillStyle = gr;
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < w * 2; i++) {
        const x = (i * 37.173) % w;
        c.fillStyle = i % 3 ? '#ffffff17' : '#30353814';
        c.fillRect(x, 0, 0.35, h);
      }
    }
    const metal = material(canvasTex(192, 224, steelDraw));
    const trim = material(canvasTex(32, 192, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, 0);
      [[0, '#111315'], [0.22, '#484d50'], [0.43, '#e2e4e2'],
        [0.6, '#8e9395'], [0.85, '#292d30'], [1, '#111315']]
        .forEach(([p, col]) => gr.addColorStop(p, col));
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    }));
    const chrome = material(canvasTex(48, 48, (c, w, h) => steelDraw(c, w, h, true)));
    function rounded(c, x, y, w, h, r) {
      c.beginPath(); c.roundRect(x, y, w, h, r);
    }
    // Rounded cross sections are extruded using only rotated rectangular cubes.
    function outline(w, h, r, n = 5) {
      const pts = [];
      for (const [x, y, a] of [[w / 2 - r, h / 2 - r, 0],
        [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180],
        [w / 2 - r, -h / 2 + r, 270]]) {
        for (let j = 0; j <= n; j++) {
          const t = (a + j * 90 / n) * Math.PI / 180;
          pts.push([x + r * Math.cos(t), y + r * Math.sin(t)]);
        }
      }
      return pts;
    }
    function rim(points, cx, cy, z0, z1, mat, omitTop = false, thick = 0.035) {
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if (omitTop && a[1] > 1.99 && b[1] > 1.99) continue;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const p = box(g, [-len / 2, -thick / 2, z0], [len / 2, thick / 2, z1], mat);
        p.position.x = cx + (a[0] + b[0]) / 2;
        p.position.y = cy + (a[1] + b[1]) / 2;
        p.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
      }
    }
    function face(x, y, z, w, h, mat, back = false) {
      return box(g, [x - w / 2, y - h / 2, z - 0.006],
        [x + w / 2, y + h / 2, z + 0.006],
        [invisible, invisible, invisible, invisible, back ? mat : invisible, back ? invisible : mat]);
    }
    const body = outline(4.3, 4.1, 0.34);
    rim(body, 0, 2.3, -2.73, 2.91, metal, true, 0.055);
    // The dark polished borders follow the same rounded silhouette as the case.
    rim(body, 0, 2.3, -2.82, -2.73, trim, true, 0.065);
    rim(body, 0, 2.3, 2.91, 2.99, trim, true, 0.065);
    function endTexture(front) {
      return material(canvasTex(206, 197, (c, w, h) => {
        rounded(c, 0, 0, w, h, 16); c.clip(); steelDraw(c, w, h);
        c.strokeStyle = '#555a5b'; c.lineWidth = 1;
        c.strokeRect(19, 8, w - 38, h - 16);
        if (front) {
          const stripY = 156;
          c.fillStyle = '#474a4b'; c.fillRect(19, stripY, w - 38, 1.2);
          c.fillStyle = '#eeeeeb'; c.fillRect(20, stripY + 1.5, w - 40, 0.8);
          // One painted scale surrounds the physical knob; text stays upright.
          c.textAlign = 'center'; c.fillStyle = '#191b1c'; c.font = '5px Arial';
          const dx = w * 0.5, dy = 181;
          for (let i = 1; i <= 6; i++) {
            const t = (145 + (i - 1) * 50) * Math.PI / 180;
            c.fillText(String(i), dx + Math.cos(t) * 22, dy + Math.sin(t) * 22 + 1.5);
          }
          c.font = '4.5px Arial';
          for (const [s, x] of [['CANCEL', 39], ['REHEAT', 138], ['DEFROST', 168]]) {
            c.fillText(s, x, 165);
          }
          rounded(c, 99, 37, 7, 110, 3.5); c.fillStyle = '#55595a'; c.fill();
          rounded(c, 100, 38, 5, 108, 2.5); c.fillStyle = '#101213'; c.fill();
          c.fillStyle = '#e6e7e4'; c.fillRect(106, 41, 0.7, 102);
        } else {
          c.fillStyle = '#343638'; c.fillRect(20, 159, w - 40, 30);
          c.fillStyle = '#cfd1cf'; c.font = '5px Arial'; c.textAlign = 'center';
          c.fillText('PUSH', w / 2, 178);
          c.fillStyle = '#111314'; c.fillRect(72, 187, 62, 2);
        }
      }));
    }
    face(0, 2.3, -2.825, 4.3, 4.1, endTexture(true));
    face(0, 2.3, 2.995, 4.3, 4.1, endTexture(false), true);
    const top = material(canvasTex(176, 274, (c, w, h) => {
      steelDraw(c, w, h);
      for (const u of [0.25, 0.75]) {
        const x = u * w - 25, y = 32;
        rounded(c, x - 3, y - 3, 56, 213, 7); c.fillStyle = '#747a7c'; c.fill();
        rounded(c, x - 1, y - 1, 52, 209, 6); c.strokeStyle = '#fafbf7'; c.lineWidth = 2; c.stroke();
        c.save(); c.globalCompositeOperation = 'destination-out';
        rounded(c, x + 1, y + 1, 48, 205, 4); c.fill(); c.restore();
      }
    }));
    L.topOnly(g, [-1.83, 4.325, -2.73], [1.83, 4.35, 2.91], top);
    for (const x of [-0.915, 0.915]) {
      box(g, [x - 0.51, 3.61, -2.06], [x + 0.51, 3.65, 2.22], dark);
      box(g, [x - 0.53, 3.65, -2.06], [x - 0.48, 4.32, 2.22], trim);
      box(g, [x + 0.48, 3.65, -2.06], [x + 0.53, 4.32, 2.22], trim);
      for (const z of [-2.06, 2.17]) box(g, [x - 0.5, 3.65, z], [x + 0.5, 4.32, z + 0.05], chrome);
      for (const sx of [-0.4, 0.4]) {
        for (const z of [-1.55, -0.75, 0.05, 0.85, 1.65]) {
          box(g, [x + sx - 0.02, 3.83, z], [x + sx + 0.02, 4.18, z + 0.035], chrome);
        }
      }
    }
    function discTexture(size, button = false) {
      return material(canvasTex(size, size, (c, w, h) => {
        const r = w / 2;
        const gr = c.createRadialGradient(r * 0.64, r * 0.48, 0, r, r, r);
        [[0, '#ffffff'], [0.72, '#dedfdb'], [0.87, '#a2a7a8'], [0.93, '#ffffff'], [1, '#34393c']]
          .forEach(([p, col]) => gr.addColorStop(p, col));
        c.fillStyle = gr; c.beginPath(); c.arc(r, r, r - 0.4, 0, tau); c.fill();
        if (button) {
          c.strokeStyle = '#353b3e'; c.lineWidth = 3;
          c.beginPath(); c.arc(r, r, r - 2, 0, tau); c.stroke();
          c.strokeStyle = '#b7bdbe'; c.lineWidth = 0.7;
          c.beginPath(); c.arc(r, r, r - 4, 0, tau); c.stroke();
        } else {
          c.fillStyle = '#343638'; c.beginPath(); c.arc(r * 0.73, r * 0.42, 1.7, 0, tau); c.fill();
        }
      }));
    }
    function disc(x, y, r, z0, z1, button) {
      const pts = Array.from({ length: button ? 12 : 20 }, (_, i) => {
        const t = i * tau / (button ? 12 : 20); return [Math.cos(t) * r, Math.sin(t) * r];
      });
      rim(pts, x, y, z0, z1, button ? dark : chrome, false, 0.025);
      face(x, y, z0 - 0.008, r * 2, r * 2, discTexture(Math.ceil(r * 96), button));
    }
    // Face UVs look toward +z: the photograph's left is the model's +x.
    disc(0, 0.59, 0.43, -2.94, -2.83, true);
    disc(0, 0.58, 0.345, -3.16, -2.94, false);
    for (const x of [1.336, -0.731, -1.357]) disc(x, 0.625, 0.222, -2.9, -2.83, true);
    box(g, [-0.055, 2.77, -3.08], [0.055, 3.02, -2.83], dark);
    const leverOutline = outline(0.98, 0.31, 0.145, 4);
    rim(leverOutline, 0, 2.83, -3.25, -3.01, chrome);
    const leverFace = material(canvasTex(48, 16, (c, w, h) => {
      rounded(c, 0, 0, w, h, 7); c.clip(); steelDraw(c, w, h, true);
      c.strokeStyle = '#53585a'; c.lineWidth = 1; rounded(c, 0.6, 0.6, w - 1.2, h - 1.2, 7); c.stroke();
    }));
    face(0, 2.83, -3.256, 0.98, 0.31, leverFace);
    for (const x of [-1.52, 1.52]) {
      const pts = Array.from({ length: 8 }, (_, i) => [Math.cos(i * tau / 8) * 0.15, Math.sin(i * tau / 8) * 0.15]);
      // Feet are octagonal horizontal sections, capped with one small cube.
      L.loft(g, [[0.015, { a: 0.15, xc: x, zf: -2.45, zb: -2.15, nf: 2, nb: 2 }],
        [0.29, { a: 0.17, xc: x, zf: -2.47, zb: -2.13, nf: 2, nb: 2 }]], dark, { N: pts.length, thick: 0.055 });
      box(g, [x - 0.11, 0.02, -2.41], [x + 0.11, 0.27, -2.19], dark);
    }
    // The thin bread edges face front; the broad crumb faces run along the slots.
    const breadFace = material(canvasTex(130, 48, (c, w, h) => {
      rounded(c, 1, 1, w - 2, h - 2, [13, 13, 3, 3]); c.clip();
      c.fillStyle = '#b96c2b'; c.fillRect(0, 0, w, h);
      rounded(c, 4, 4, w - 8, h - 6, [10, 10, 2, 2]); c.fillStyle = '#f2d39c'; c.fill();
      for (let i = 0; i < 480; i++) {
        const x = (i * 23.739) % w, y = (i * 13.371) % h;
        c.fillStyle = i % 4 ? '#b4874b51' : '#fff0c8';
        c.fillRect(x, y, i % 3 ? 0.6 : 1.2, 0.7);
      }
    }));
    const crust = material(canvasTex(16, 48, (c, w, h) => {
      c.fillStyle = '#cc9250'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#f1ce93'; c.fillRect(w * 0.25, 0, w * 0.5, h);
    }));
    for (const x of [-0.915, 0.915]) {
      box(g, [x - 0.145, 4.04, -1.17], [x + 0.145, 5, 1.5],
        [breadFace, breadFace, crust, crust, crust, crust]);
    }
    return g;
  },
};
