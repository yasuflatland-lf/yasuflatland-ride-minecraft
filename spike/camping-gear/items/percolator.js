export default {
  build(THREE, L) {
    const g = new THREE.Group();
    const shell = new THREE.Group();
    g.add(shell);
    const silver = L.M.chrome;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    // Binary face masks retain the exact polygon outlines using only thin cubes.
    function face(parent, points, tones, thickness = 0.025) {
      const origin = points[0];
      const ex = points[1].clone().sub(origin).normalize();
      const normal = new THREE.Vector3()
        .crossVectors(ex, points[2].clone().sub(origin))
        .normalize();
      const ey = new THREE.Vector3().crossVectors(normal, ex);
      const uv = points.map((p) => {
        const d = p.clone().sub(origin);
        return [d.dot(ex), d.dot(ey)];
      });
      const x0 = Math.min(...uv.map(([x]) => x));
      const x1 = Math.max(...uv.map(([x]) => x));
      const y0 = Math.min(...uv.map(([, y]) => y));
      const y1 = Math.max(...uv.map(([, y]) => y));
      const width = x1 - x0,
        height = y1 - y0;
      const material = (flip) =>
        new THREE.MeshStandardMaterial({
          map: L.canvasTex(
            Math.max(16, Math.ceil(width * 48)),
            Math.max(16, Math.ceil(height * 48)),
            (ctx, w, h) => {
              if (flip) {
                ctx.translate(w, 0);
                ctx.scale(-1, 1);
              }
              ctx.beginPath();
              uv.forEach(([x, y], i) => {
                const u = ((x - x0) / width) * w,
                  v = (1 - (y - y0) / height) * h;
                if (i) ctx.lineTo(u, v);
                else ctx.moveTo(u, v);
              });
              ctx.closePath();
              ctx.clip();
              const grad = ctx.createLinearGradient(0, 0, w, 0);
              tones.forEach((tone, i) => {
                grad.addColorStop(i / (tones.length - 1), tone);
              });
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, w, h);
            },
          ),
          alphaTest: 0.5,
          roughness: 0.48,
          metalness: 0.05,
        });
      const mesh = L.box(
        parent,
        [-width / 2, -height / 2, -thickness / 2],
        [width / 2, height / 2, thickness / 2],
        [
          L.invisible,
          L.invisible,
          L.invisible,
          L.invisible,
          material(false),
          material(true),
        ],
      );
      mesh.position
        .copy(origin)
        .addScaledVector(ex, (x0 + x1) / 2)
        .addScaledVector(ey, (y0 + y1) / 2);
      mesh.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(ex, ey, normal),
      );
      return mesh;
    }

    const facetTones = (i, dark) =>
      dark
        ? ["#121312", "#333532", "#20221f", "#10110f"]
        : i % 2 === 0
          ? ["#a3adaf", "#e1e5e1", "#d4dbd8", "#98a3a6"]
          : ["#788487", "#a5b0b1", "#b5bfbd", "#7e898c"];
    const ring = (y, r) =>
      Array.from({ length: 8 }, (_, i) =>
        V(r * Math.cos((i * Math.PI) / 4), y, r * Math.sin((i * Math.PI) / 4)),
      );

    const potBottom = 3.4, potRim = 5.87;
    const creaseY = potRim - (potRim - potBottom) * 0.6;
    const bodyRadius = (y) => 1.25 + (0.45 * (y - potBottom)) / (potRim - potBottom);
    const shoulderX = 1.7 - 0.65 * (Math.SQRT2 - 1);

    // Vertex zero is the pouring crease (+x); vertex four carries the hinge (-x).
    function octagon(parent, y0, r0, y1, r1, dark = false, notch = false) {
      const bottom = ring(y0, r0),
        top = ring(y1, r1);
      if (notch) {
        top[0].y = creaseY;
        top[0].x = bodyRadius(creaseY);
      }
      for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8;
        const points = [bottom[i], bottom[j], top[j], top[i]];
        // The drawn wall replaces the corner above the crease, rather than
        // covering a closed pot wall that would block the pouring channel.
        if (notch && i === 0) points.splice(3, 0, V(shoulderX, y1, 0.65));
        if (notch && i === 7) points.splice(3, 0, V(shoulderX, y1, -0.65));
        face(parent, points, facetTones(i, dark));
      }
    }

    function cap(parent, y, radius, color) {
      const map = L.canvasTex(
        Math.ceil(radius * 80),
        Math.ceil(radius * 80),
        (ctx, w, h) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4;
            const x = w / 2 + (w / 2) * Math.cos(a);
            const z = h / 2 + (h / 2) * Math.sin(a);
            if (i) ctx.lineTo(x, z);
            else ctx.moveTo(x, z);
          }
          ctx.closePath();
          ctx.fill();
        },
      );
      const mat = new THREE.MeshStandardMaterial({
        map,
        alphaTest: 0.5,
        roughness: 0.5,
        side: THREE.DoubleSide,
      });
      L.topOnly(
        parent,
        [-radius, y, -radius],
        [radius, y + 0.012, radius],
        mat,
      );
    }

    octagon(shell, 0.04, 1.48, 0.14, 1.56);
    cap(shell, 0.04, 1.48, "#8c969a");
    octagon(shell, 0.14, 1.56, 2.58, 1.14);
    octagon(shell, 2.58, 1.14, 2.7, 1.09);
    octagon(shell, 2.7, 1.09, 2.77, 1.11, true);
    octagon(shell, 2.77, 1.13, 3.28, 1.13);
    octagon(shell, 3.28, 1.13, 3.4, 1.25);
    octagon(shell, 3.4, 1.25, 5.87, 1.7, false, true);
    // Only the two pouring sectors extend into the rounded hood.
    const lidEdge = ring(5.96, 1.72),
      lidTop = ring(6.4, 0.14);
    lidEdge[0].set(2.18, 6.06, 0);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const tones = facetTones(i, false);
      if (i === 0 || i === 7) {
        // Each cheek is a single planar polygon, rather than a triangle fan.
        // Project the rounded outline onto its plane so the mask cannot fold.
        const slopeX = (6.06 - 6.4) / (2.18 - 0.14);
        const slopeZ = (5.96 - 6.4 - slopeX * (lidEdge[1].x - 0.14)) / lidEdge[1].z;
        const lobePoint = (x, z) => V(x, 6.4 + slopeX * (x - 0.14) + slopeZ * z, z);
        const lobe = [lidEdge[0], lobePoint(2.18, 0.055),
          lobePoint(2.14, 0.105), lobePoint(1.93, 0.23),
          lobePoint(1.53, 0.52), lidEdge[1]];
        if (i === 7) {
          lobe.forEach((p, k) => { lobe[k] = V(p.x, p.y, -p.z); });
          lobe.reverse();
        }
        face(shell, [...lobe, lidTop[0]], tones);
        for (let k = 0; k < lobe.length - 1; k++) {
          face(shell, [
            lobe[k].clone().add(V(0, -0.065, 0)),
            lobe[k + 1].clone().add(V(0, -0.065, 0)),
            lobe[k + 1], lobe[k],
          ], tones);
        }
        face(shell, [lidEdge[i === 0 ? 1 : 7], lidTop[i === 0 ? 1 : 7], lidTop[0]], tones);
        continue;
      } else {
        face(shell, [lidEdge[i], lidEdge[j], lidTop[j], lidTop[i]], tones);
      }
      face(
        shell,
        [
          lidEdge[i].clone().add(V(0, -0.065, 0)),
          lidEdge[j].clone().add(V(0, -0.065, 0)),
          lidEdge[j],
          lidEdge[i],
        ],
        tones,
      );
    }
    cap(shell, 6.4, 0.15, "#737c7b");
    octagon(shell, 6.4, 0.12, 6.91, 0.23, true);
    octagon(shell, 6.91, 0.23, 6.97, 0.19, true);
    cap(shell, 6.98, 0.19, "#252723");

    const rimX = 1.7;
    const handle = new THREE.Group();
    g.add(handle);
    L.box(
      handle,
      [-rimX - 0.3, 5.51, -0.27],
      [-rimX + 0.24, 6.03, 0.27],
      silver,
    );
    L.box(
      handle,
      [-rimX - 0.3, 6.03, -0.29],
      [-rimX + 0.24, 6.11, 0.29],
      silver,
    );
    for (const z of [-0.286, 0.286]) {
      L.box(
        handle,
        [-rimX - 0.24, 5.89, z - 0.008],
        [-rimX - 0.08, 6.05, z + 0.008],
        L.lightDisc,
      );
    }

    // One uninterrupted side silhouette and mitered edge slabs close the plastic
    // extrusion. No internal section edges can protrude through its broad faces.
    const contour = [
      [0.2, 6.0],
      [0.93, 6.03],
      [1.42, 5.44],
      [0.91, 3.68],
      [0.8, 3.53],
      [0.25, 3.42],
      [0.14, 3.45],
      [0.08, 3.55],
      [0.06, 3.75],
      [0.17, 3.78],
      [0.3, 3.66],
      [0.51, 3.76],
      [0.84, 5.26],
      [0.65, 5.43],
      [0.2, 5.41],
    ].map(([out, y]) => V(-rimX - out, y, 0));
    // All vertices are coplanar, so the concave hook can use one alpha-cut cube.
    face(handle, contour, ["#151614", "#20211e", "#1a1b19"], 0.5);
    const edgeMap = L.canvasTex(32, 24, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#20211e");
      grad.addColorStop(0.3, "#41433e");
      grad.addColorStop(0.65, "#2b2d28");
      grad.addColorStop(1, "#181916");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });
    const plasticEdge = new THREE.MeshStandardMaterial({
      map: edgeMap,
      roughness: 0.72,
    });
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i],
        b = contour[(i + 1) % contour.length];
      const d = b.clone().sub(a);
      const edge = L.box(
        handle,
        [-d.length() / 2, -0.25, -0.004],
        [d.length() / 2, 0.25, 0.004],
        plasticEdge,
      );
      edge.position.copy(a).add(b).multiplyScalar(0.5);
      const ex = d.normalize(),
        ey = V(0, 0, 1);
      edge.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(
          ex,
          ey,
          new THREE.Vector3().crossVectors(ex, ey),
        ),
      );
    }

    const crease = V(bodyRadius(creaseY), creaseY, 0);
    const tip = V(2.244, 5.84, 0);
    const shoulders = [V(shoulderX, potRim, -0.65), V(shoulderX, potRim, 0.65)];
    for (const [side, shoulder] of shoulders.entries()) {
      const inward = new THREE.Vector3().crossVectors(
        shoulder.clone().sub(crease), tip.clone().sub(crease),
      ).normalize();
      if (inward.x > 0) inward.negate();
      const outerTone = side === 0 ? "#99a5a7" : "#c1cbc8";
      face(g, [crease, shoulder, tip], [outerTone, outerTone], 0.018);
      const lining = (p, inset = 0) => p.clone().addScaledVector(inward,
        (0.032 + inset) * (p.y - creaseY) / (potRim - creaseY));
      // A continuous backing closes alpha-mask sampling seams between the
      // small lining panels without coplanar overlap or a stepped silhouette.
      face(g, [crease, shoulder, tip].map((p) => lining(p, -0.012)),
        ["#e4ece4", "#e4ece4"], 0.008);
      // Narrow masked cube strips keep the diagonal continuous and let the
      // lining follow the same drawn sheet without a solid cap over the V.
      for (let k = 0; k < 20; k++) {
        const a = k / 20;
        const b = (k + 1) / 20;
        const points = k === 0
          ? [crease, crease.clone().lerp(shoulder, b), crease.clone().lerp(tip, b)]
          : [crease.clone().lerp(shoulder, a), crease.clone().lerp(shoulder, b),
            crease.clone().lerp(tip, b), crease.clone().lerp(tip, a)];
        // Taper the separation to zero at the body, keeping the pointed root
        // on the ridge rather than leaving a second floating lining tip.
        face(g, points.map((p) => lining(p)),
          ["#e4ece4", "#e4ece4"], 0.008);
      }
      L.tube(g, [shoulder.toArray(), tip.toArray()], 0.035, silver);
      const fold = V(-0.055, -0.045, side === 0 ? 0.025 : -0.025);
      face(g, [shoulder, tip, tip.clone().add(fold), shoulder.clone().add(fold)],
        ["#edf2e9", "#edf2e9"], 0.008);
    }
    // Recess the darkness under the hood; the outer part of the V stays open
    // so both light inner cheeks remain visible at the pouring tip.
    face(g, [V(1.39, 5.83, -0.59), V(1.39, 5.83, 0.59), V(2.22, 5.83, 0)],
      ["#070908", "#0c100e"], 0.012);
    // The near-vertical throat stays visible through the slit at low angles;
    // the horizontal recess alone disappears behind the pouring lip.
    face(g, [V(2.105, 5.99, -0.115), V(2.105, 5.99, 0.115),
      V(2.21, 5.845, 0)], ["#060807", "#090c0a"], 0.008);
    face(g, [V(1.4, 5.83, 0), V(1.45, 6.03, 0), V(2.22, 5.845, 0)],
      ["#060807", "#090c0a"], 0.008);
    face(g, [crease.clone().add(V(-0.035, 0, 0)),
      V(1.39, 5.83, -0.59), V(1.39, 5.83, 0.59)],
      ["#070908", "#0c100e"], 0.012);

    const valve = new THREE.Group();
    valve.position.set(0.46, 2.26, -1.14);
    valve.rotation.x = Math.PI / 2;
    valve.rotation.y = -Math.PI / 8;
    g.add(valve);
    octagon(valve, 0, 0.145, 0.065, 0.145);
    cap(valve, 0.067, 0.145, "#b99a51");
    cap(valve, 0.081, 0.103, "#e4ce84");
    cap(valve, 0.095, 0.066, "#303635");
    cap(valve, 0.108, 0.031, "#111716");
    return g;
  },
};
