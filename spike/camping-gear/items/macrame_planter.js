export default {
  build(THREE, L) {
    const g = new THREE.Group();
    const circle = (r) => ({ a: r, zf: -r, zb: r, nf: 2, nb: 2 });
    const at = (angle, r, y) => [Math.cos(angle) * r, y, Math.sin(angle) * r];
    const ropeMap = L.canvasTex(32, 128, (c, w, h) => {
      c.fillStyle = "#e6dcc6";
      c.fillRect(0, 0, w, h);
      for (let y = -32; y < h + 32; y += 8) {
        c.strokeStyle = "#c4b89f";
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(w, y + 18);
        c.stroke();
        c.strokeStyle = "#fff7e5";
        c.beginPath();
        c.moveTo(0, y + 2);
        c.lineTo(w, y + 20);
        c.stroke();
      }
    });
    const rope = new THREE.MeshStandardMaterial({ map: ropeMap, roughness: 1 });
    const woodMap = L.canvasTex(96, 48, (c, w, h) => {
      c.fillStyle = "#cba368";
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) {
        c.strokeStyle = y % 2 ? "#b98e55" : "#e0bd86";
        c.lineWidth = 0.7;
        c.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const yy = y + Math.sin(x * 0.09 + y) * 0.65;
          if (x === 0) c.moveTo(x, yy);
          else c.lineTo(x, yy);
        }
        c.stroke();
      }
    });
    const wood = new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.78 });
    const beadWood = new THREE.MeshStandardMaterial({
      map: woodMap, color: 0xffefcf, roughness: 0.8,
    });
    const ceramic = new THREE.MeshStandardMaterial({ color: 0xfaf8f1, roughness: 0.34 });

    // Three panel courses retain the bowl's rounded shoulder without curved meshes.
    L.loft(g, [
      [0.18, circle(1.15)], [0.48, circle(1.45)],
      [1.25, circle(1.7)], [2.12, circle(1.78)],
    ], ceramic, { N: 12, thick: 0.09 });
    L.loft(g, [[0.3, circle(1.33)], [0.68, circle(1.54)]], wood,
      { N: 12, thick: 0.07 });
    L.texPlate(g, circle(1.16), 0.16, 0.2, { color: "#ece7dc", bottom: true });
    L.texPlate(g, circle(1.81), 2.1, 2.18, {
      color: "#fffdf5", hole: circle(1.62),
    });
    L.texPlate(g, circle(1.63), 1.94, 1.97, {
      draw(c, w, h) {
        c.fillStyle = "#342b1e";
        c.fillRect(0, 0, w, h);
        for (let i = 0; i < 90; i++) {
          c.fillStyle = i % 3 ? "#594731" : "#81705a";
          c.fillRect((i * 47) % w, (i * 71) % h, 2, 2);
        }
      },
    });

    const cord = (points, size = 0.058) => L.tube(g, points, size, rope);
    const bead = (p) => {
      const [x, y, z] = p;
      const shape = (r) => ({ ...circle(r), xc: x, zf: z - r, zb: z + r });
      L.loft(g, [[y - 0.12, shape(0.085)], [y, shape(0.145)],
        [y + 0.12, shape(0.085)]], beadWood, { N: 6, thick: 0.055 });
    };
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + i * Math.PI / 2;
      // Paired cords splay from the common neck, with knots below the beads.
      for (const offset of [-0.026, 0.026]) {
        const a = angle + offset;
        cord([at(a, 0.12, 8.82), at(a, 0.75, 6.5),
          at(a, 1.35, 4.12), at(a, 1.69, 3.17), at(a, 1.84, 2.35)], 0.047);
      }
      bead(at(angle, 1.32, 4.24));
      for (let k = 0; k < 6; k++) {
        const y = 2.53 + k * 0.092;
        const r = 1.82 - (y - 2.53) * 0.2;
        const p = at(angle, r, y);
        const t = [-Math.sin(angle) * 0.09, 0.035, Math.cos(angle) * 0.09];
        cord([p.map((v, j) => v - t[j]), p.map((v, j) => v + t[j])], 0.078);
      }
      for (let k = 0; k < 3; k++) {
        const p = at(angle, 0.76 + k * 0.02, 6.48 - k * 0.1);
        cord([[p[0] - 0.075, p[1] - 0.03, p[2]],
          [p[0] + 0.075, p[1] + 0.03, p[2]]], 0.075);
      }

      // Split each bundle to the neighboring junctions, forming open diamonds.
      for (const side of [-1, 1]) {
        const jointAngle = angle + side * Math.PI / 4;
        cord([at(angle, 1.84, 2.35), at(jointAngle, 1.66, 1.03),
          at(angle, 1.22, 0.24), at(angle, 0.31, 0.08)], 0.064);
      }
      const joint = at(angle + Math.PI / 4, 1.67, 1.03);
      L.box(g, [joint[0] - 0.08, 0.94, joint[2] - 0.08],
        [joint[0] + 0.08, 1.1, joint[2] + 0.08], rope);
    }

    const loop = [];
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 12;
      loop.push([0.18 * Math.cos(a), 9.43 + 0.51 * Math.sin(a), 0]);
    }
    cord(loop, 0.105);
    for (let k = 0; k < 5; k++) {
      L.box(g, [-0.13, 8.67 + k * 0.06, -0.105],
        [0.13, 8.72 + k * 0.06, 0.105], rope);
    }

    const leafMap = L.canvasTex(32, 96, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.beginPath();
      c.moveTo(w * 0.5, h);
      c.bezierCurveTo(w * 0.06, h * 0.72, 0, h * 0.35, w * 0.6, 0);
      c.bezierCurveTo(w * 0.92, h * 0.38, w, h * 0.65, w * 0.5, h);
      const gr = c.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, "#254e19");
      gr.addColorStop(0.46, "#498829");
      gr.addColorStop(0.53, "#95b64a");
      gr.addColorStop(1, "#36651e");
      c.fillStyle = gr;
      c.fill();
    });
    const leaves = [0xffffff, 0xd4e2a7, 0xadc68a].map((color) =>
      [0, 1].map((half) => {
        const map = leafMap.clone();
        map.repeat.set(1, 0.5);
        map.offset.y = half * 0.5;
        return new THREE.MeshStandardMaterial({ map, color,
          alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
      }));
    const hidden = L.invisible;
    for (let i = 0; i < 15; i++) {
      const a = i * 2.39996;
      const outer = i % 3 !== 0;
      const reach = outer ? 2.14 + (i % 3) * 0.08 : 0.92;
      const root = at(a, 0.35, 2.01);
      const elbow = at(a, reach * 0.55, outer ? 3.18 : 3.72);
      const tip = at(a, reach, outer ? 2.86 + (i % 4) * 0.16 : 4.35);
      // Each blade bends once; its silhouette and midrib are face textures.
      const points = [root, elbow, tip];
      for (let j = 0; j < 2; j++) {
        const A = new THREE.Vector3(...points[j]);
        const B = new THREE.Vector3(...points[j + 1]);
        const delta = B.clone().sub(A);
        const m = L.box(g, [-0.24, -delta.length() / 2, -0.008],
          [0.24, delta.length() / 2, 0.008],
          [hidden, hidden, hidden, hidden, leaves[i % 3][j], leaves[i % 3][j]]);
        m.position.copy(A).add(B).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
        m.rotateY(-a + Math.PI / 2);
      }
    }
    return g;
  },
};
