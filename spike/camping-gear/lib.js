// Panel and texture helpers copied from ../resort-bathroom/index.html (throwaway spike). Units are Bedrock pixels.
export function makeLib(THREE) {
      function canvasTex(w, h, draw, repeat) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        draw(c.getContext("2d"), w, h);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (repeat) t.repeat.set(...repeat);
        return t;
      }
      const woodTex = canvasTex(256, 256, (g, w, h) => {
        woodDraw(g, w, h);
      });
      const meshTex = canvasTex(
        64,
        64,
        (g, w, h) => {
          g.clearRect(0, 0, w, h);
          g.strokeStyle = "#25282b";
          g.lineWidth = 5;
          g.beginPath();
          g.moveTo(0, h / 2);
          g.lineTo(w / 2, 0);
          g.lineTo(w, h / 2);
          g.lineTo(w / 2, h);
          g.closePath();
          g.stroke();
        },
        [20, 10],
      );

      const M = {
        por: new THREE.MeshStandardMaterial({
          color: 0xf5f7f7,
          roughness: 0.2,
          metalness: 0.02,
        }),
        inner: new THREE.MeshStandardMaterial({
          color: 0xe6ecee,
          roughness: 0.3,
        }),
        chrome: new THREE.MeshStandardMaterial({
          map: canvasTex(64, 64, (g, w, h) => {
            const gr = g.createLinearGradient(0, 0, w, 0);
            gr.addColorStop(0, '#8b949a'); gr.addColorStop(0.22, '#dde3e6'); gr.addColorStop(0.42, '#ffffff');
            gr.addColorStop(0.58, '#aab3b9'); gr.addColorStop(0.8, '#e3e8eb'); gr.addColorStop(1, '#7d878d');
            g.fillStyle = gr; g.fillRect(0, 0, w, h);
            const v = g.createLinearGradient(0, 0, 0, h);
            v.addColorStop(0, 'rgba(255,255,255,0.35)'); v.addColorStop(0.5, 'rgba(255,255,255,0)'); v.addColorStop(1, 'rgba(0,0,0,0.25)');
            g.fillStyle = v; g.fillRect(0, 0, w, h);
          }),
          roughness: 0.3, metalness: 0.25, envMapIntensity: 0.5,
        }),
        hole: new THREE.MeshStandardMaterial({ color: 0x0d0e0f, roughness: 0.8 }),
        dark: new THREE.MeshStandardMaterial({
          color: 0x26292c,
          roughness: 0.55,
        }),
        rod: new THREE.MeshStandardMaterial({
          color: 0x1f2224,
          roughness: 0.45,
        }),
        wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 }),
        mesh: new THREE.MeshStandardMaterial({
          map: meshTex,
          transparent: true,
          alphaTest: 0.3,
          roughness: 0.5,
          side: THREE.DoubleSide,
        }),
        water: new THREE.MeshStandardMaterial({
          color: 0x9edcff,
          transparent: true,
          opacity: 0.6,
          roughness: 0.1,
          depthWrite: false,
        }),
        foam: new THREE.MeshStandardMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.85,
          roughness: 0.2,
        }),
        skin: new THREE.MeshStandardMaterial({ color: 0xc98f6b }),
        shirt: new THREE.MeshStandardMaterial({ color: 0x3b82c4 }),
        pants: new THREE.MeshStandardMaterial({ color: 0x3a3f8f }),
      };

      // ---------- geometry helpers ----------
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      const EDGE = new THREE.LineBasicMaterial({
        color: 0x6f787e,
        transparent: true,
        opacity: 0.5,
      });
      const edgeLines = [];
      let panelCount = 0;

      function box(parent, a, b, mat) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
          mat,
        );
        m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        parent.add(m);
        panelCount++;
        return m;
      }

      // Plan outline: a super-ellipse with its own exponent for the front half (nf) and rear half (nb).
      function ringPts(h, s, N = 16) {
        if (s.r !== undefined) {
          const k = s.k || 2, xc = s.xc || 0, cx = s.a - s.r;
          const corners = [
            [cx, s.zb - s.r, 0], [-cx, s.zb - s.r, 90], [-cx, s.zf + s.r, 180], [cx, s.zf + s.r, 270],
          ];
          const pts = [];
          for (const [px, pz, t0] of corners) {
            for (let i = 0; i <= k; i++) {
              const t = ((t0 + (90 * i) / k) * Math.PI) / 180;
              pts.push(V(xc + px + s.r * Math.cos(t), h, pz + s.r * Math.sin(t)));
            }
          }
          return pts;
        }
        const zc = (s.zf + s.zb) / 2, hz = (s.zb - s.zf) / 2, pts = [];
        for (let i = 0; i < N; i++) {
          const ang = (i / N) * Math.PI * 2;
          const c = Math.cos(ang), sn = Math.sin(ang);
          const n = sn < 0 ? (s.nf || 2.4) : (s.nb || 2.4);
          pts.push(V((s.xc || 0) + s.a * Math.sign(c) * Math.abs(c) ** (2 / n), h, zc + hz * Math.sign(sn) * Math.abs(sn) ** (2 / n)));
        }
        return pts;
      }
      function widthAt(s, z) {
        if (s.r !== undefined) {
          if (z < s.zf || z > s.zb) return 0;
          const lo = s.zf + s.r, hi = s.zb - s.r;
          if (z >= lo && z <= hi) return s.a;
          const dz = z < lo ? lo - z : z - hi;
          return s.a - s.r + Math.sqrt(Math.max(0, s.r * s.r - dz * dz));
        }
        const zc = (s.zf + s.zb) / 2, hz = (s.zb - s.zf) / 2;
        const t = (z - zc) / hz;
        if (Math.abs(t) >= 1) return 0;
        const n = t < 0 ? (s.nf || 2.4) : (s.nb || 2.4);
        return s.a * (1 - Math.abs(t) ** n) ** (1 / n);
      }
      function panel(parent, A0, A1, B0, B1, thick, mat, center, inward) {
        const u = A1.clone()
          .sub(A0)
          .add(B1.clone().sub(B0))
          .multiplyScalar(0.5);
        const v = B0.clone()
          .sub(A0)
          .add(B1.clone().sub(A1))
          .multiplyScalar(0.5);
        const c = A0.clone().add(A1).add(B0).add(B1).multiplyScalar(0.25);
        const ex = u.clone().normalize();
        const vp = v.clone().sub(ex.clone().multiplyScalar(v.dot(ex)));
        const ey = vp.clone().normalize();
        const ez = new THREE.Vector3().crossVectors(ex, ey);
        const out = new THREE.Vector3(c.x - center.x, 0, c.z - center.z);
        if (inward) out.negate();
        if (ez.dot(out) < 0) {
          ey.negate();
          ez.negate();
        }
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(u.length() + Math.min(0.16, thick * 0.4), vp.length() + Math.min(0.16, thick * 0.6), thick),
          mat,
        );
        m.position.copy(c).addScaledVector(ez, -thick / 2);
        m.quaternion.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(ex, ey, ez),
        );
        const e = new THREE.LineSegments(
          new THREE.EdgesGeometry(m.geometry),
          EDGE,
        );
        edgeLines.push(e);
        m.add(e);
        parent.add(m);
        panelCount++;
        return m;
      }
      // rings: array of [height, spec], bottom to top
      function loft(parent, rings, mat, opt = {}) {
        let N = opt.N || 16,
          thick = opt.thick || 0.4;
        const pts = rings.map(([h, s]) => ringPts(h, s, N));
        N = pts[0].length;
        const ctr = (arr) =>
          arr
            .reduce((p, q) => p.add(q), V(0, 0, 0))
            .multiplyScalar(1 / arr.length);
        for (let k = 0; k < pts.length - 1; k++) {
          const A = pts[k],
            B = pts[k + 1],
            center = ctr(A);
          for (let j = 0; j < N; j++) {
            panel(
              parent,
              A[j],
              A[(j + 1) % N],
              B[j],
              B[(j + 1) % N],
              thick,
              mat,
              center,
              opt.inward,
            );
          }
        }
      }
      // Flat plate filled with strips along z, optional hole.
      function _plate(parent, s, y0, y1, steps, mat, hole) {
        // Strips never reach past the outline (inset hides the edge under the rim panels), and are denser near the ends.
        const INSET = 0.28, zc = (s.zf + s.zb) / 2, hz = (s.zb - s.zf) / 2;
        const zAt = (k) => zc - hz * Math.cos((Math.PI * k) / steps);
        for (let k = 0; k < steps; k++) {
          const z0 = zAt(k), z1 = zAt(k + 1), zm = (z0 + z1) / 2;
          const w = Math.min(widthAt(s, z0 + 1e-4), widthAt(s, z1 - 1e-4), widthAt(s, zm)) - INSET;
          if (w < 0.05) continue;
          const hw = hole ? Math.max(widthAt(hole, z0 + 1e-4), widthAt(hole, z1 - 1e-4), widthAt(hole, zm)) : 0;
          const xc = s.xc || 0;
          if (hw > 0.05) {
            const hi = hw + INSET;
            if (w > hi) {
              box(parent, [xc - w, y0, z0 - 0.01], [xc - hi, y1, z1 + 0.01], mat);
              box(parent, [xc + hi, y0, z0 - 0.01], [xc + w, y1, z1 + 0.01], mat);
            }
          } else {
            box(parent, [xc - w, y0, z0 - 0.01], [xc + w, y1, z1 + 0.01], mat);
          }
        }
      }

      // Flat plate as ONE cube whose top face carries an alpha-cut texture: smooth outline and hole, no strips.
      function outlinePts(s, N = 160) {
        const xc = s.xc || 0, out = [];
        if (s.r !== undefined) {
          const cx = s.a - s.r, k = s.k || 24;
          const corners = [[cx, s.zb - s.r, 0], [-cx, s.zb - s.r, 90], [-cx, s.zf + s.r, 180], [cx, s.zf + s.r, 270]];
          for (const [px, pz, t0] of corners) {
            for (let i = 0; i <= k; i++) {
              const t = ((t0 + (90 * i) / k) * Math.PI) / 180;
              out.push([xc + px + s.r * Math.cos(t), pz + s.r * Math.sin(t)]);
            }
          }
          return out;
        }
        const zc = (s.zf + s.zb) / 2, hz = (s.zb - s.zf) / 2;
        for (let i = 0; i < N; i++) {
          const ang = (i / N) * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang), n = sn < 0 ? s.nf || 2.4 : s.nb || 2.4;
          out.push([xc + s.a * Math.sign(c) * Math.abs(c) ** (2 / n), zc + hz * Math.sign(sn) * Math.abs(sn) ** (2 / n)]);
        }
        return out;
      }
      const invisible = new THREE.MeshBasicMaterial({ visible: false });
      // thin cube that shows its texture on the top face only (no edge lines from the sides)
      function topOnly(parent, a, b, mat) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(b[0] - a[0], b[1] - a[1], b[2] - a[2]), [invisible, invisible, mat, invisible, invisible, invisible]);
        m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        parent.add(m);
        panelCount++;
        return m;
      }
      function woodDraw(g, w, h) {
        g.fillStyle = '#d4a46c'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 520; i++) {
          const dark = Math.random() < 0.5;
          g.strokeStyle = dark ? `rgba(140,98,56,${0.05 + Math.random() * 0.1})` : `rgba(240,206,160,${0.05 + Math.random() * 0.1})`;
          g.lineWidth = 0.4 + Math.random() * 0.9;
          const y = Math.random() * h;
          g.beginPath(); g.moveTo(0, y);
          for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 1.2);
          g.stroke();
        }
      }
      function texPlate(parent, s, y0, y1, o = {}) {
        const SC = o.sc || 48, wU = 2 * s.a, dU = s.zb - s.zf, xc = s.xc || 0;
        const W = Math.max(16, Math.round(wU * SC)), H = Math.max(16, Math.round(dU * SC));
        const build = (flipZ) => {
          const mkc = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
          const c = mkc(), m = mkc(), g = c.getContext('2d'), mg = m.getContext('2d');
          const trace = (ctx, sp) => {
            ctx.beginPath();
            outlinePts(sp).forEach(([x, z], i) => {
              const px = ((x - (xc - s.a)) / wU) * W;
              let py = ((z - s.zf) / dU) * H;
              if (flipZ) py = H - py;
              if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
            });
            ctx.closePath();
          };
          mg.fillStyle = '#fff'; trace(mg, s); mg.fill();
          if (o.hole) { mg.globalCompositeOperation = 'destination-out'; trace(mg, o.hole); mg.fill(); }
          if (o.draw) o.draw(g, W, H); else { g.fillStyle = o.color || '#ffffff'; g.fillRect(0, 0, W, H); }
          g.globalCompositeOperation = 'destination-in';
          g.drawImage(m, 0, 0);
          const t = new THREE.CanvasTexture(c);
          t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
          return t;
        };
        const mat = (map) => o.water
          ? new THREE.MeshStandardMaterial({ map, color: 0x9edcff, transparent: true, opacity: 0.6, roughness: 0.1, alphaTest: 0.05, depthWrite: false })
          : new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.5, roughness: 0.2, metalness: 0.02 });
        const side = o.sides || invisible;
        const faces = [side, side, o.bottom ? invisible : mat(build(false)), o.bottom ? mat(build(true)) : side, side, side];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(wU, y1 - y0, dU), faces);
        mesh.position.set(xc, (y0 + y1) / 2, (s.zf + s.zb) / 2);
        parent.add(mesh);
        panelCount++;
        return mesh;
      }
      // round chrome-looking disc on one face (used for the lever boss)
      const lightDisc = (() => {
        const t = canvasTex(128, 128, (g, w, h) => {
          const c = w / 2;
          const gr = g.createRadialGradient(c - 18, c - 22, 4, c, c, 60);
          gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#c6ccd0'); gr.addColorStop(0.85, '#7d868b'); gr.addColorStop(1, '#3d4246');
          g.fillStyle = gr; g.beginPath(); g.arc(c, c, 61, 0, Math.PI * 2); g.fill();
        });
        return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 0.3, metalness: 0.2 });
      })();
      // Bent tube: one square-section cube per segment.
      function tube(parent, pts, size, mat) {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = V(...pts[i]),
            b = V(...pts[i + 1]);
          const d = b.clone().sub(a),
            len = d.length();
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(size, size, len + size * 0.6),
            mat,
          );
          m.position.copy(a).add(b).multiplyScalar(0.5);
          m.quaternion.setFromUnitVectors(V(0, 0, 1), d.normalize());
          parent.add(m);
          panelCount++;
        }
      }
      const roundPost = (parent, x, z, y0, y1, r, mat) =>
        loft(
          parent,
          [
            [y0, { a: r, zf: z - r, zb: z + r, xc: x, nf: 2, nb: 2 }],
            [y1, { a: r, zf: z - r, zb: z + r, xc: x, nf: 2, nb: 2 }],
          ],
          mat,
          { N: r >= 0.35 ? 32 : 8, thick: r >= 0.35 ? 0.08 : 0.14 },
        );

  const stats = { get panels() { return panelCount; }, reset() { panelCount = 0; edgeLines.length = 0; } };
  return { V, M, EDGE, edgeLines, stats, canvasTex, box, ringPts, widthAt, panel, loft, outlinePts, topOnly, woodDraw, texPlate, lightDisc, tube, roundPost, invisible };
}
