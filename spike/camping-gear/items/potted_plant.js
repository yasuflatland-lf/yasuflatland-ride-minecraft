export default {
  build(THREE, L) {
    const g = new THREE.Group();
    let seed = 317;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const ceramicMap = L.canvasTex(96, 144, (ctx, w, h) => {
      const glaze = ctx.createLinearGradient(0, 0, 0, h);
      glaze.addColorStop(0, "#a7bab0");
      glaze.addColorStop(0.35, "#9db2a8");
      glaze.addColorStop(0.8, "#93aaa0");
      glaze.addColorStop(1, "#839d93");
      ctx.fillStyle = glaze;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2100; i++) {
        ctx.fillStyle = random() < 0.5 ? "#849c9220" : "#d7e0d329";
        ctx.fillRect(random() * w, random() * h, 0.5 + random(), 0.5 + random());
      }
    });
    const ceramic = new THREE.MeshStandardMaterial({
      map: ceramicMap,
      roughness: 0.43,
      metalness: 0,
    });
    const inner = new THREE.MeshStandardMaterial({
      color: "#7d9487", roughness: 0.7,
    });
    const circle = (r) => ({ a: r, zf: -r, zb: r, nf: 2, nb: 2 });
    L.loft(g, [
      [0.055, circle(0.99)],
      [0.17, circle(1.22)],
      [0.43, circle(1.38)],
      [0.88, circle(1.445)],
      [2.84, circle(1.46)],
      [2.94, circle(1.435)],
    ], ceramic, { N: 32, thick: 0.065 });
    L.texPlate(g, circle(1.435), 2.905, 2.94, {
      hole: circle(1.305), sc: 48,
      draw(ctx, w, h) {
        ctx.fillStyle = "#b6c7bc";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#c9d5cb";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      },
    });
    L.loft(g, [[2.68, circle(1.29)], [2.915, circle(1.305)]], inner,
      { N: 32, thick: 0.045, inward: true });
    L.texPlate(g, circle(1.3), 2.66, 2.69, {
      sc: 48,
      draw(ctx, w, h) {
        ctx.fillStyle = "#493c2a";
        ctx.fillRect(0, 0, w, h);
        const colors = ["#766045", "#352e20", "#927855", "#584632"];
        for (let i = 0; i < 1800; i++) {
          ctx.fillStyle = colors[Math.floor(random() * colors.length)];
          const size = 0.5 + random() * 2.3;
          ctx.fillRect(random() * w, random() * h, size, size * 0.65);
        }
      },
    });
    L.texPlate(g, circle(1.02), 0, 0.06, { color: "#82968a", bottom: true });

    function leaf({ x, z, length, width, lean, yaw, shade, bend }) {
      const tex = L.canvasTex(Math.ceil(width * 48), Math.ceil(length * 48), (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        // The pointed silhouette is cut into the face texture of one thin cube.
        ctx.beginPath();
        ctx.moveTo(w * 0.43, h);
        ctx.bezierCurveTo(w * 0.23, h * 0.74, w * 0.02, h * 0.4, w * 0.23, h * 0.23);
        ctx.bezierCurveTo(w * 0.37, h * 0.12, w * (0.5 + bend), h * 0.035, w * (0.51 + bend), 0);
        ctx.bezierCurveTo(w * 0.72, h * 0.16, w * 0.98, h * 0.27, w * 0.91, h * 0.45);
        ctx.bezierCurveTo(w * 0.9, h * 0.65, w * 0.68, h * 0.9, w * 0.61, h);
        ctx.closePath();
        ctx.save();
        ctx.clip();
        const green = ctx.createLinearGradient(0, 0, w, 0);
        green.addColorStop(0, "#40502b");
        green.addColorStop(0.18, "#87974c");
        green.addColorStop(0.46, "#697e3c");
        green.addColorStop(0.58, "#829548");
        green.addColorStop(0.84, "#526b31");
        green.addColorStop(1, "#a5ad5c");
        ctx.fillStyle = green;
        ctx.fillRect(0, 0, w, h);
        for (let y = -4; y < h; y += 6 + random() * 4) {
          const phase = random() * 6;
          const wave = (u) => y + Math.sin(u * 15 + phase) * 1.8 + Math.sin(u * 33 + phase) * 0.8;
          ctx.fillStyle = random() < 0.5 ? "#273e26" : "#364d29";
          ctx.beginPath();
          for (let i = 0; i <= 24; i++) {
            const u = i / 24;
            if (i === 0) ctx.moveTo(0, wave(u));
            else ctx.lineTo(u * w, wave(u));
          }
          for (let i = 24; i >= 0; i--) {
            const u = i / 24;
            ctx.lineTo(u * w, wave(u) + 1.3 + random() * 2.5);
          }
          ctx.closePath();
          ctx.fill();
        }
        for (let i = 0; i < 1300; i++) {
          ctx.fillStyle = random() < 0.5 ? "#b3ba6638" : "#223b252f";
          ctx.fillRect(random() * w, random() * h, 0.6 + random() * 1.7, 0.5 + random());
        }
        const rib = ctx.createLinearGradient(0, 0, w, 0);
        rib.addColorStop(0, "#091e2100");
        rib.addColorStop(0.47, "#091e2100");
        rib.addColorStop(0.5, "#cad28a50");
        rib.addColorStop(0.54, "#091e2130");
        rib.addColorStop(1, "#091e2100");
        ctx.fillStyle = rib;
        ctx.fillRect(0, 0, w, h);
        const base = ctx.createLinearGradient(0, h * 0.6, 0, h);
        base.addColorStop(0, "#172d1900");
        base.addColorStop(1, "#172d1970");
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      });
      const material = new THREE.MeshStandardMaterial({
        map: tex, color: shade, alphaTest: 0.5, roughness: 0.77, metalness: 0,
      });
      const pivot = new THREE.Group();
      pivot.position.set(x, 2.65, z);
      pivot.rotation.set(0, yaw, lean, "YXZ");
      g.add(pivot);
      L.box(pivot, [-width / 2, 0, -0.018], [width / 2, length, 0.018],
        [L.invisible, L.invisible, L.invisible, L.invisible, material, material]);
    }

    leaf({ x: -0.03, z: 0.27, length: 5.3, width: 1.1, lean: -0.025, yaw: -0.12, shade: "#ffffff", bend: 0.04 });
    leaf({ x: -0.31, z: 0.34, length: 4.14, width: 0.88, lean: 0.11, yaw: 0.43, shade: "#a8b79b", bend: -0.1 });
    leaf({ x: 0.28, z: 0.2, length: 4.61, width: 1.08, lean: -0.29, yaw: -0.22, shade: "#f2f3d6", bend: 0.08 });
    leaf({ x: -0.42, z: -0.17, length: 3.68, width: 0.94, lean: 0.43, yaw: 0.12, shade: "#ecebcf", bend: -0.17 });
    leaf({ x: 0.44, z: -0.03, length: 3.52, width: 0.77, lean: -0.47, yaw: -0.36, shade: "#d8e2bf", bend: 0.12 });
    leaf({ x: 0.12, z: -0.48, length: 3.56, width: 0.99, lean: -0.09, yaw: 0.08, shade: "#dce2bd", bend: 0.03 });
    leaf({ x: -0.58, z: 0.35, length: 3.15, width: 0.66, lean: 0.19, yaw: 1.23, shade: "#becba3", bend: -0.05 });
    return g;
  },
};
