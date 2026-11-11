export default {
  build(THREE, L) {
    const g = new THREE.Group();
    const material = (color, roughness = 0.65) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.03 });
    const teal = material(0x354e4e);
    const edge = material(0x293f40);
    const seam = material(0x202f30);
    const metal = new THREE.MeshStandardMaterial({
      map: L.canvasTex(32, 32, (c, w, h) => {
        const grad = c.createLinearGradient(0, 0, w, 0);
        for (const [p, col] of [[0, '#615f50'], [0.22, '#b4b19a'],
          [0.4, '#e3dfc9'], [0.58, '#999786'], [1, '#66675c']])
          grad.addColorStop(p, col);
        c.fillStyle = grad;
        c.fillRect(0, 0, w, h);
      }), roughness: 0.4, metalness: 0.12,
    });
    const texture = (w, h, draw, extra = {}) =>
      new THREE.MeshStandardMaterial({ map: L.canvasTex(w, h, draw),
        roughness: 0.65, metalness: 0.02, ...extra });
    const face = (parent, a, b, mat, base = teal) =>
      L.box(parent, a, b, [base, base, base, base, base, mat]);

    L.box(g, [-2.86, 0.06, -0.68], [2.86, 2.89, 0.66], teal);
    L.box(g, [-2.89, 0.1, -0.72], [2.89, 2.87, -0.65], edge);
    const grille = texture(272, 128, (c, w, h) => {
      c.fillStyle = '#3b5352'; c.fillRect(0, 0, w, h);
      // Painted recesses preserve the dense grille without hundreds of cubes.
      for (let row = 0; row < 19; row++) {
        for (let col = 0; col < 7; col++) {
          const x = 11 + col * 36.2, y = 17 + row * 5.25;
          c.fillStyle = '#71807a'; c.fillRect(x, y + 1.6, 29, 1.4);
          c.fillStyle = '#101a1a';
          c.beginPath(); c.roundRect(x, y, 29, 1.9, 0.8); c.fill();
        }
      }
      c.fillStyle = '#294140'; c.fillRect(0, h - 2, w, 2);
    });
    face(g, [-2.83, 0.13, -0.746], [2.83, 2.86, -0.718], grille);
    L.box(g, [-2.88, 0.09, 0.46], [2.88, 2.91, 0.475], seam);
    L.box(g, [-2.87, 0.1, 0.48], [2.87, 2.93, 0.7], teal);

    const rear = texture(264, 128, (c, w, h) => {
      c.fillStyle = '#3c5251'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#263c3c'; c.lineWidth = 1;
      c.strokeRect(28, 37, w - 56, h - 46);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++) {
        c.fillStyle = '#1d2e2e'; c.fillRect(18 + col * 33, 12 + row * 4, 25, 1.4);
      }
      for (const x of [12, w - 12]) for (const y of [10, h - 10]) {
        c.fillStyle = '#8c8d7f'; c.beginPath(); c.arc(x, y, 1.5, 0, 7); c.fill();
        c.fillStyle = '#293a39'; c.fillRect(x - 1, y - 0.35, 2, 0.7);
      }
    });
    L.box(g, [-2.82, 0.15, 0.7], [2.82, 2.88, 0.715],
      [teal, teal, teal, teal, rear, teal]);

    // Local -z is the outward normal of the inclined control deck.
    const deck = new THREE.Group();
    deck.position.set(0, 2.87, -0.69);
    deck.rotation.x = Math.PI / 2 - 0.20;
    g.add(deck);
    L.box(deck, [-2.87, 0, -0.035], [2.87, 1.37, 0.065], teal);
    L.box(deck, [-2.89, 1.31, -0.07], [2.89, 1.39, 0.02], edge);
    const dial = texture(264, 32, (c, w, h) => {
      const grad = c.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#b6b5a3'); grad.addColorStop(0.25, '#e4dfc9');
      grad.addColorStop(0.75, '#d5d1ba'); grad.addColorStop(1, '#aaa996');
      c.fillStyle = grad; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#8a897a'; c.lineWidth = 0.5;
      for (const y of [5, 14, 23, 30]) { c.beginPath(); c.moveTo(4, y); c.lineTo(212, y); c.stroke(); }
      c.font = '3.6px sans-serif'; c.textAlign = 'center';
      const rows = [[88, 90, 92, 94, 96, 98, 100], [6, 14, 18, 22, 30, 38, 42],
        [0.55, 0.7, 0.8, 1, 1.2, 1.4, 1.6], [550, 650, 800, 1000, 1200, 1400, 1600]];
      rows.forEach((values, row) => {
        c.fillStyle = row === 1 ? '#a65e42' : '#4d544d';
        values.forEach((value, i) => c.fillText(String(value), 13 + i * 30, 4.5 + row * 8));
      });
      for (let i = 0; i < 67; i++) {
        c.fillStyle = '#757b6e'; c.fillRect(5 + i * 3.1, 6, 0.5, i % 5 === 0 ? 3 : 1.7);
      }
      c.fillStyle = '#bc4935'; c.fillRect(58, 0, 0.9, h);
      c.fillStyle = '#f1e7ce'; c.fillRect(59, 0, 0.45, h);
      // An abstract bar emblem occupies the wordmark area without lettering.
      c.fillStyle = '#414b45';
      for (let i = 0; i < 6; i++) c.fillRect(226 + i * 2.2, 12 + i % 2, 1.2, 7 - i % 3);
      c.fillStyle = '#f6f0db'; c.fillRect(0, 1, w, 0.8);
    }, { roughness: 0.28 });
    face(deck, [-2.78, 0.62, -0.075], [2.78, 1.29, -0.04], metal);
    face(deck, [-2.73, 0.65, -0.081], [2.73, 1.26, -0.074], dial);
    const glass = new THREE.MeshStandardMaterial({ color: 0xe6efdf,
      transparent: true, opacity: 0.1, roughness: 0.15, metalness: 0, depthWrite: false });
    L.box(deck, [-2.73, 0.65, -0.087], [2.73, 1.26, -0.082], glass);

    const ribbed = texture(32, 12, (c, w, h) => {
      c.fillStyle = '#2c4140'; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 4) {
        c.fillStyle = '#63736a'; c.fillRect(x, 0, 1, h);
        c.fillStyle = '#192e2f'; c.fillRect(x + 1, 0, 1, h);
      }
    });
    function roundControl(parent, x, y, r, height, sides, color, ribs = false) {
      const p = new THREE.Group();
      p.position.set(x, y, -0.06); p.rotation.x = -Math.PI / 2;
      parent.add(p);
      L.loft(p, [[0, { a: r, zf: -r, zb: r, nf: 2, nb: 2 }],
        [height, { a: r * 0.92, zf: -r * 0.92, zb: r * 0.92, nf: 2, nb: 2 }]],
      ribs ? ribbed : material(color), { N: sides, thick: 0.024 });
      L.texPlate(p, { a: r * 0.93, zf: -r * 0.93, zb: r * 0.93, nf: 2, nb: 2 },
        height - 0.009, height + 0.004, { sc: 48, draw(c, w, h) {
          c.fillStyle = color; c.fillRect(0, 0, w, h);
          c.strokeStyle = ribs ? '#6c7e73' : '#d3d2af'; c.lineWidth = 0.8;
          c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.45, h * 0.45, 0, 0, 7); c.stroke();
        } });
    }
    for (const x of [2.22, 0.78, -0.66]) roundControl(deck, x, 0.29, 0.22, 0.20, 16, '#3e5551', true);
    roundControl(deck, -1.78, 0.30, 0.142, 0.105, 12, '#ed4d16');
    roundControl(deck, -2.20, 0.30, 0.142, 0.105, 12, '#aeb4a0');
    roundControl(deck, -2.62, 0.30, 0.142, 0.105, 12, '#b9bdab');
    roundControl(deck, -2.46, 0.99, 0.105, 0.09, 8, '#aaa58c');
    const switchStem = new THREE.Group();
    switchStem.position.set(-2.46, 0.99, -0.13);
    switchStem.rotation.x = -Math.PI / 2; deck.add(switchStem);
    L.loft(switchStem, [[0, { a: 0.052, zf: -0.052, zb: 0.052, nf: 2, nb: 2 }],
      [0.14, { a: 0.045, zf: -0.045, zb: 0.045, nf: 2, nb: 2 }]], metal, { N: 8, thick: 0.02 });
    L.texPlate(switchStem, { a: 0.073, zf: -0.073, zb: 0.073, nf: 2, nb: 2 },
      0.14, 0.17, { color: '#bdb8a0', sc: 48, sides: metal });

    const grip = texture(240, 8, (c, w, h) => {
      c.fillStyle = '#202522'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#50514a'; c.fillRect(0, 1, w, 1);
      c.fillStyle = '#111a18'; c.fillRect(0, h - 2, w, 2);
      for (let x = 2; x < w; x += 3) {
        c.fillStyle = '#343b34'; c.fillRect(x, 2, 0.5, h - 4);
      }
    });
    for (const side of [-1, 1]) {
      const x = side * 2.93;
      L.box(g, [x - 0.04, 2.14, 0.17], [x + 0.04, 2.32, 0.35], metal);
      L.tube(g, [[x, 2.22, 0.26], [side * 2.99, 2.30, 0.26],
        [side * 2.99, 3.74, 0.26], [side * 2.94, 3.87, 0.26],
        [side * 2.80, 3.91, 0.26]], 0.055, metal);
    }
    L.tube(g, [[-2.81, 3.91, 0.26], [2.81, 3.91, 0.26]], 0.055, metal);
    const handle = new THREE.Group();
    handle.position.set(0, 3.91, 0.26); handle.rotation.z = Math.PI / 2; g.add(handle);
    L.loft(handle, [[-2.53, { a: 0.071, zf: -0.071, zb: 0.071, nf: 2, nb: 2 }],
      [2.53, { a: 0.071, zf: -0.071, zb: 0.071, nf: 2, nb: 2 }]], grip, { N: 8, thick: 0.025 });
    for (const y of [-2.535, 2.535]) L.texPlate(handle,
      { a: 0.071, zf: -0.071, zb: 0.071, nf: 2, nb: 2 }, y, y + 0.008,
      { color: '#222925', bottom: y < 0 });
    return g;
  },
};
