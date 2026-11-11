export default {
  build(THREE, L) {
    const g = new THREE.Group();
    const circle = (r) => ({ a: r, zf: -r, zb: r, nf: 2, nb: 2 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0xe2eeeb, transparent: true, opacity: 0.15,
      roughness: 0.16, metalness: 0.02, depthWrite: false,
    });
    const thickGlass = glass.clone();
    thickGlass.opacity = 0.32;
    const wallThickness = 0.045;
    function glassLoft(rings, material) {
      const first = g.children.length;
      L.loft(g, rings, material, { N: 32, thick: wallThickness });
      for (let k = 0; k < rings.length - 1; k++) {
        // Loft panels are rectangular cubes: use the wider ring's chord so
        // sloping shoulders overlap instead of leaving gaps at their wide end.
        const radius = Math.max(rings[k][1].a, rings[k + 1][1].a);
        const width = 2 * radius * Math.sin(Math.PI / 32) + wallThickness * 0.4;
        for (let j = 0; j < 32; j++) {
          const mesh = g.children[first + k * 32 + j];
          mesh.scale.x = width / mesh.geometry.parameters.width;
        }
      }
    }

    glassLoft([[0.25, circle(1.34)], [2.96, circle(1.34)]], glass);
    glassLoft([
      [0.04, circle(1.28)], [0.10, circle(1.34)], [0.29, circle(1.34)],
    ], thickGlass);

    const floor = L.texPlate(g, circle(1.32), 0.10, 0.26, {
      color: '#e2eeeb', sc: 48,
    });
    for (const material of floor.material) {
      if (!material.map) continue;
      material.opacity = thickGlass.opacity;
      material.depthWrite = false;
    }

    let seed = 14237;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    function sugarTexture(ctx, w, h) {
      ctx.fillStyle = '#eee9d8';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < w * h / 5; i++) {
        const x = random() * w, y = random() * h;
        const s = 0.7 + random() * 1.5;
        ctx.fillStyle = ['#ffffff', '#faf8ec', '#ded8c4', '#f2efdf'][i % 4];
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s, y - s * 0.2);
        ctx.lineTo(x + s * 0.65, y + s);
        ctx.lineTo(x - s * 0.6, y + s * 0.55);
        ctx.closePath();
        ctx.fill();
        if (i % 6 === 0) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x, y - s, 0.8, 0.8);
        }
      }
    }
    const sugar = new THREE.MeshStandardMaterial({
      map: L.canvasTex(32, 64, sugarTexture), roughness: 0.95,
    });
    L.loft(g, [[0.29, circle(1.23)], [1.75, circle(1.26)]],
      sugar, { N: 24, thick: 0.04 });
    L.texPlate(g, circle(1.265), 1.74, 1.765, { draw: sugarTexture, sc: 48 });

    glassLoft([
      [2.91, circle(1.37)], [3.00, circle(1.44)], [3.10, circle(1.39)],
    ], thickGlass);
    glassLoft([
      [3.10, circle(1.39)], [3.25, circle(1.10)], [3.34, circle(0.35)],
    ], thickGlass);

    // The flattened upper knob and narrower neck follow the reference lid.
    glassLoft([
      [3.30, circle(0.35)], [3.43, circle(0.27)],
      [3.78, circle(0.41)], [3.91, circle(0.31)],
    ], thickGlass);
    L.texPlate(g, circle(0.32), 3.895, 3.925, {
      sc: 48,
      draw(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#effbfa';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w * 0.43, h * 0.43, 0, 0, Math.PI * 2);
        ctx.stroke();
      },
    });

    const steel = new THREE.MeshStandardMaterial({
      map: L.canvasTex(24, 96, (ctx, w, h) => {
        const gradient = ctx.createLinearGradient(0, 0, w, 0);
        gradient.addColorStop(0, '#333e43');
        gradient.addColorStop(0.25, '#7c898c');
        gradient.addColorStop(0.38, '#f7ffff');
        gradient.addColorStop(0.53, '#dde7e7');
        gradient.addColorStop(0.72, '#58666c');
        gradient.addColorStop(1, '#263137');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      }), roughness: 0.28, metalness: 0.18,
    });
    const spoon = new THREE.Group();
    spoon.position.set(0.12, 1.59, -0.31);
    spoon.rotation.z = -0.57;
    g.add(spoon);
    const bowl = L.texPlate(spoon,
      { a: 0.15, zf: -0.29, zb: 0.29, nf: 2, nb: 2 },
      -0.014, 0.014, {
        sc: 48,
        draw(ctx, w, h) {
          const gradient = ctx.createRadialGradient(w * 0.42, h * 0.38,
            1, w / 2, h / 2, h * 0.5);
          gradient.addColorStop(0, '#4b5b60');
          gradient.addColorStop(0.6, '#99a9ac');
          gradient.addColorStop(0.8, '#f4ffff');
          gradient.addColorStop(1, '#38484e');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, w, h);
        },
      });
    bowl.rotation.x = Math.PI / 2;
    bowl.position.y = -0.12;
    const handle = L.box(spoon, [-0.036, 0.11, -0.023], [0.036, 2.65, 0.023], steel);
    handle.rotation.x = -0.025;
    const tip = L.box(spoon, [-0.049, 2.62, -0.023], [0.049, 2.72, 0.023], steel);
    tip.rotation.z = 0.06;
    return g;
  },
};
