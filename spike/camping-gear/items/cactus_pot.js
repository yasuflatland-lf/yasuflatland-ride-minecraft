export default {
  build(THREE, L) {
    const g = new THREE.Group();
    const circle = (r) => ({ a: r, zf: -r, zb: r, nf: 2, nb: 2 });
    let seed = 617;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const clay = (dark = false) => new THREE.MeshStandardMaterial({
      roughness: 0.95,
      map: L.canvasTex(64, 128, (c, w, h) => {
        const wash = c.createLinearGradient(0, 0, 0, h);
        wash.addColorStop(0, dark ? '#9c4d2b' : '#cf8552');
        wash.addColorStop(0.18, dark ? '#ac6138' : '#c77a45');
        wash.addColorStop(1, dark ? '#773c26' : '#b86638');
        c.fillStyle = wash;
        c.fillRect(0, 0, w, h);
        for (let i = 0; i < 1500; i++) {
          c.fillStyle = random() < 0.5 ? '#ad61342a' : '#edb48430';
          c.fillRect(random() * w, random() * h, 0.6, 0.6);
        }
      }),
    });
    const terracotta = clay();
    const innerClay = clay(true);
    L.loft(g, [
      [0.04, circle(1.12)],
      [0.17, circle(1.22)],
      [2.65, circle(1.69)],
    ], terracotta, { N: 12, thick: 0.07 });
    L.texPlate(g, circle(1.12), 0, 0.05, { color: '#a85832' });
    L.loft(g, [
      [2.53, circle(1.72)],
      [2.62, circle(1.94)],
      [3.36, circle(1.96)],
      [3.45, circle(1.90)],
    ], terracotta, { N: 12, thick: 0.07 });
    L.loft(g, [
      [3.12, circle(1.72)],
      [3.43, circle(1.76)],
    ], innerClay, { N: 12, thick: 0.06, inward: true });
    L.texPlate(g, circle(1.90), 3.42, 3.45, {
      hole: circle(1.76), color: '#d18a5c',
    });
    L.texPlate(g, circle(1.73), 3.13, 3.17, {
      draw(c, w, h) {
        c.fillStyle = '#3c3025';
        c.fillRect(0, 0, w, h);
        for (let i = 0; i < 1500; i++) {
          c.fillStyle = ['#665447', '#887761', '#28241e'][i % 3];
          c.fillRect(random() * w, random() * h, 1 + random() * 2, 1 + random() * 2);
        }
      },
    });

    // Each face is one rib; darker margins read as the recessed valleys.
    const rings = [
      [3.19, circle(0.93)],
      [3.63, circle(1.24)],
      [4.28, circle(1.46)],
      [5.15, circle(1.46)],
      [5.86, circle(1.23)],
      [6.31, circle(0.78)],
      [6.51, circle(0.19)],
    ];
    const points = rings.map(([y, s]) => L.ringPts(y, s, 12));
    for (let k = 0; k < rings.length - 1; k++) {
      for (let j = 0; j < 12; j++) {
        const y0 = rings[k][0];
        const y1 = rings[k + 1][0];
        const width = points[k][j].distanceTo(points[k][(j + 1) % 12]);
        const material = new THREE.MeshStandardMaterial({
          roughness: 0.88,
          map: L.canvasTex(Math.max(16, Math.round(width * 40)),
            Math.max(16, Math.round((y1 - y0) * 44)), (c, w, h) => {
              const rib = c.createLinearGradient(0, 0, w, 0);
              rib.addColorStop(0, '#214522');
              rib.addColorStop(0.22, '#35672d');
              rib.addColorStop(0.49, '#58883b');
              rib.addColorStop(0.69, '#467b32');
              rib.addColorStop(1, '#254d25');
              c.fillStyle = rib;
              c.fillRect(0, 0, w, h);
              for (let n = 0; n < 110; n++) {
                c.fillStyle = n % 2 ? '#a0b25b25' : '#193e241c';
                c.fillRect(random() * w, random() * h, 1, 1);
              }
              for (let row = 0; row < 8; row++) {
                const y = 3.42 + row * 0.43 + (j % 2) * 0.12;
                const py = (y1 - y) / (y1 - y0) * h;
                if (py < -8 || py > h + 8) continue;
                const px = w * (0.50 + Math.sin(row * 3 + j) * 0.045);
                c.fillStyle = '#b8ad71';
                c.beginPath();
                c.ellipse(px, py, 1.8, 2.3, 0, 0, Math.PI * 2);
                c.fill();
                for (let ray = 0; ray < 9; ray++) {
                  const angle = ray * Math.PI * 2 / 9 + j * 0.13;
                  const len = 3.8 + (ray % 3) * 1.2;
                  c.strokeStyle = ray % 3 ? '#d1c28b' : '#8d8055';
                  c.lineWidth = 0.65;
                  c.beginPath();
                  c.moveTo(px, py);
                  c.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len * 1.2);
                  c.stroke();
                }
                c.fillStyle = '#e5d9ab';
                c.fillRect(px - 0.6, py - 0.8, 1.2, 1.5);
              }
            }),
        });
        L.panel(g, points[k][j], points[k][(j + 1) % 12],
          points[k + 1][j], points[k + 1][(j + 1) % 12],
          0.045, material, L.V(0, y0, 0));
      }
    }
    L.texPlate(g, circle(0.22), 6.49, 6.52, { color: '#96935b' });

    const pebbleMats = ['#eee9d9', '#d5d3c5', '#faf5e7', '#bcbfb3'].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 }),
    );
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI * 2 / 24;
      const r = 1.20 + random() * 0.38;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const s = 0.09 + random() * 0.07;
      const pebble = L.box(g, [x - s, 3.17, z - s * 0.7],
        [x + s, 3.28 + random() * 0.07, z + s * 0.7], pebbleMats[i % 4]);
      pebble.rotation.set(random() * 0.3, angle + random(), random() * 0.3);
    }
    const spine = new THREE.MeshStandardMaterial({ color: '#c8b987', roughness: 1 });
    // Sparse projecting needles preserve the silhouette without modeling every cluster.
    for (let i = 0; i < 12; i++) {
      const angle = (i + 0.5) * Math.PI * 2 / 12;
      const r = 0.67;
      L.tube(g, [
        [Math.cos(angle) * r, 6.34, Math.sin(angle) * r],
        [Math.cos(angle) * (r + 0.15), 6.74 + (i % 3) * 0.06,
          Math.sin(angle) * (r + 0.15)],
      ], 0.018, spine);
    }
    return g;
  },
};
