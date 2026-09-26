import type { LoginBackdropId } from "@/lib/login-backdrop-choices";
import { rgba, seeded, type Rgb, type SceneFactory } from "./shared";

/**
 * Seven backdrops after Vengeance UI's backgrounds (the client, 2026-09-24):
 * Wave grid, Aurora, Fluid morph, Twisting ribbon, Animated rays,
 * Perspective grid, Light lines.
 *
 * Read as behaviour and re-drawn on the 2D canvas the other eight share —
 * not vendored. The Wave grid there is a three.js scene with a
 * post-processing pass and the Fluid morph is framer-motion; either library
 * alone would outweigh the whole sign-in page, and both would need a second
 * source of colour where these read the theme's three hues from the palette
 * like every other scene. Every figure below is scaled by `density` (the
 * intensity choice) and every motion by `t` (already scaled by speed), and a
 * still frame is the same drawing at a fixed `t` — so the settings tile and
 * a reduced-motion visitor both get the picture.
 */

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * k),
  Math.round(a[1] + (b[1] - a[1]) * k),
  Math.round(a[2] + (b[2] - a[2]) * k),
];

export const VENGEANCE_SCENES = {
  /**
   * An isometric field of cells whose heights ripple outward from the
   * pointer — and, when nobody is pointing, from a slow sequence of seeded
   * spots, so the panel is never dead. Cells are drawn back to front with a
   * lit top and a darker side, coloured from brand toward accent by height.
   */
  wavegrid(w, h, density, p) {
    const n = Math.round(Math.min(34, Math.max(18, w / 22)) * Math.min(1.2, 0.75 + density * 0.25));
    const cell = (Math.max(w, h) * 1.25) / n;
    const cx = w / 2, cy = h * 0.22;
    const iso = (i: number, j: number) => [cx + (i - j) * cell * 0.5, cy + (i + j) * cell * 0.26] as const;
    const toGrid = (x: number, y: number) => {
      const a = (x - cx) / (cell * 0.5), b = (y - cy) / (cell * 0.26);
      return [(a + b) / 2, (b - a) / 2] as const;
    };
    const rnd = seeded(61);
    const spots = Array.from({ length: 6 }, () => ({ i: rnd() * n, j: rnd() * n, at: rnd() * 12 }));
    let pointerGrid: readonly [number, number] | null = null;

    return {
      draw(ctx, t, input) {
        pointerGrid = input.pointer ? toGrid(input.pointer.x, input.pointer.y) : null;
        const height = (i: number, j: number) => {
          let z = 0;
          if (pointerGrid) {
            const d = Math.hypot(i - pointerGrid[0], j - pointerGrid[1]);
            z += Math.sin(d * 1.2 - t * 6) * Math.exp(-d / 5) * 1.1;
          }
          for (const s of spots) {
            // Each spot rings every 12s, its wave front travelling outward.
            const age = ((t - s.at) % 12 + 12) % 12;
            const d = Math.hypot(i - s.i, j - s.j);
            const front = age * 3.2;
            z += Math.sin((d - front) * 1.2) * Math.exp(-Math.abs(d - front) / 2.4) * Math.exp(-age / 5) * 0.8;
          }
          return Math.max(-1, Math.min(1.2, z));
        };
        const side = cell * 0.26;
        for (let k = 0; k < n * 2 - 1; k++) {
          for (let i = Math.max(0, k - n + 1); i <= Math.min(k, n - 1); i++) {
            const j = k - i;
            const z = height(i, j);
            const [x, y0] = iso(i, j);
            const lift = z * cell * 0.45;
            const y = y0 - lift;
            if (x < -cell || x > w + cell || y < -cell * 2 || y > h + cell) continue;
            const hx = cell * 0.46, hy = cell * 0.24;
            const k01 = (z + 1) / 2.2;
            // Top face.
            ctx.beginPath();
            ctx.moveTo(x, y - hy); ctx.lineTo(x + hx, y); ctx.lineTo(x, y + hy); ctx.lineTo(x - hx, y); ctx.closePath();
            ctx.fillStyle = rgba(mix(p.brand, p.accent, k01), 0.1 + k01 * 0.32 * Math.min(1.4, density));
            ctx.fill();
            // The two visible sides, only where the cell stands up.
            if (lift > 1) {
              ctx.fillStyle = rgba(p.brand, 0.08 + k01 * 0.1);
              ctx.beginPath();
              ctx.moveTo(x - hx, y); ctx.lineTo(x, y + hy); ctx.lineTo(x, y + hy + Math.min(side * 2, lift)); ctx.lineTo(x - hx, y + Math.min(side * 2, lift)); ctx.closePath();
              ctx.fill();
            }
          }
        }
      },
    };
  },

  /**
   * Fluted glass over moving light: two soft colour fields drift behind a
   * row of vertical flutes, and each flute bends the light it passes — a
   * gradient across its width, bright at one edge and shaded at the other —
   * so the panel reads as ribbed glass lit from behind.
   */
  aurora(w, h, density, p) {
    const flute = Math.max(14, Math.round(26 / Math.min(1.4, density)));
    return {
      draw(ctx, t) {
        const big = Math.max(w, h);
        const fields = [
          { c: p.brand, x: 0.35 + Math.sin(t * 0.18) * 0.2, y: 0.4 + Math.cos(t * 0.13) * 0.15, r: 0.55, a: 0.5 },
          { c: p.secondary, x: 0.7 + Math.cos(t * 0.15) * 0.18, y: 0.65 + Math.sin(t * 0.17) * 0.12, r: 0.5, a: 0.42 },
          { c: p.accent, x: 0.5 + Math.sin(t * 0.11 + 2) * 0.25, y: 0.2 + Math.cos(t * 0.09) * 0.1, r: 0.35, a: 0.3 },
        ];
        ctx.globalCompositeOperation = "lighter";
        for (const f of fields) {
          const g = ctx.createRadialGradient(f.x * w, f.y * h, 0, f.x * w, f.y * h, f.r * big);
          g.addColorStop(0, rgba(f.c, f.a * Math.min(1.3, density)));
          g.addColorStop(1, rgba(f.c, 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }
        ctx.globalCompositeOperation = "source-over";
        for (let x = 0; x < w; x += flute) {
          const g = ctx.createLinearGradient(x, 0, x + flute, 0);
          g.addColorStop(0, "rgba(255,255,255,0.07)");
          g.addColorStop(0.35, "rgba(255,255,255,0)");
          g.addColorStop(1, "rgba(0,0,0,0.22)");
          ctx.fillStyle = g;
          ctx.fillRect(x, 0, flute, h);
        }
      },
    };
  },

  /**
   * Blobs whose outlines never settle: each is a closed curve through eight
   * points whose distances from the centre breathe on their own periods, so
   * the shape morphs rather than scales. Filled with a soft radial of its
   * hue and added onto one another, the overlaps glow.
   */
  fluid(w, h, density, p) {
    const rnd = seeded(71);
    const count = Math.max(3, Math.round(4 * density));
    const blobs = Array.from({ length: count }, (_, i) => ({
      c: [p.brand, p.secondary, p.accent][i % 3],
      x: 0.2 + rnd() * 0.6, y: 0.2 + rnd() * 0.6, r: 0.22 + rnd() * 0.16,
      dx: 0.06 + rnd() * 0.1, dy: 0.05 + rnd() * 0.08, phase: rnd() * 6,
      k: Array.from({ length: 8 }, () => ({ rate: 0.35 + rnd() * 0.6, ph: rnd() * 6 })),
    }));
    return {
      draw(ctx, t) {
        const big = Math.min(w, h) * 1.2;
        ctx.globalCompositeOperation = "lighter";
        for (const b of blobs) {
          const x = (b.x + Math.sin(t * 0.2 + b.phase) * b.dx) * w;
          const y = (b.y + Math.cos(t * 0.17 + b.phase) * b.dy) * h;
          const r = b.r * big;
          const pts = b.k.map((q, i) => {
            const a = (i / b.k.length) * Math.PI * 2;
            const rr = r * (0.75 + 0.25 * Math.sin(t * q.rate + q.ph));
            return [x + Math.cos(a) * rr, y + Math.sin(a) * rr] as const;
          });
          ctx.beginPath();
          const mid = (a: readonly [number, number], c: readonly [number, number]) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2] as const;
          const start = mid(pts[pts.length - 1], pts[0]);
          ctx.moveTo(start[0], start[1]);
          for (let i = 0; i < pts.length; i++) {
            const next = pts[(i + 1) % pts.length];
            const m = mid(pts[i], next);
            ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
          }
          ctx.closePath();
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.1);
          g.addColorStop(0, rgba(b.c, 0.42 * Math.min(1.3, density)));
          g.addColorStop(0.7, rgba(b.c, 0.14));
          g.addColorStop(1, rgba(b.c, 0));
          ctx.fillStyle = g;
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      },
    };
  },

  /**
   * One ribbon across the panel, waving and twisting as it goes: its centre
   * line is a travelling sine, its width is the cosine of a twist angle that
   * turns three times along its length, and each segment is shaded by which
   * side faces us and how squarely — the face in brand, the folds in the
   * other two hues.
   */
  ribbon(w, h, density, p) {
    const segments = Math.round(200 * Math.min(1.6, 0.6 + density * 0.5));
    // Three turns, not the reference's six: across a half-screen panel six
    // reads as a string of beads rather than as one ribbon turning over.
    const cycles = 3;
    return {
      draw(ctx, t) {
        const half = Math.min(h * 0.09, 70) * (0.7 + density * 0.3);
        const amp = h * 0.16;
        const at = (s: number) => {
          const x = -w * 0.05 + s * w * 1.1;
          const y = h * 0.52 + Math.sin(s * 5.2 + t * 0.9) * amp + Math.sin(s * 2.1 - t * 0.5) * amp * 0.4;
          const twist = s * cycles * Math.PI * 2 + t * 0.8;
          return { x, y, c: Math.cos(twist) };
        };
        let prev = at(0);
        for (let i = 1; i <= segments; i++) {
          const cur = at(i / segments);
          const facing = (prev.c + cur.c) / 2;
          const light = Math.abs(facing);
          const colour = facing >= 0 ? p.brand : light > 0.5 ? p.secondary : p.accent;
          ctx.fillStyle = rgba(colour, (0.14 + light * 0.5) * Math.min(1.3, density));
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y - half * prev.c);
          ctx.lineTo(cur.x, cur.y - half * cur.c);
          ctx.lineTo(cur.x, cur.y + half * cur.c);
          ctx.lineTo(prev.x, prev.y + half * prev.c);
          ctx.closePath();
          ctx.fill();
          prev = cur;
        }
      },
    };
  },

  /**
   * Light falling from above the top edge: a fan of soft rays, each a wedge
   * fading downward, swaying a little and breathing in brightness on its
   * own period, added onto one another so where they cross is brighter.
   */
  rays(w, h, density, p) {
    const rnd = seeded(83);
    const n = Math.round(14 * Math.min(1.8, density));
    const rays = Array.from({ length: n }, (_, i) => ({
      angle: -0.55 + (i / Math.max(1, n - 1)) * 1.1 + (rnd() - 0.5) * 0.08,
      width: 0.03 + rnd() * 0.07, phase: rnd() * 6, rate: 0.25 + rnd() * 0.4,
      c: rnd() < 0.6 ? p.brand : rnd() < 0.5 ? p.secondary : p.accent,
    }));
    return {
      draw(ctx, t) {
        const ox = w * 0.5, oy = -h * 0.15;
        const reach = Math.hypot(w, h) * 1.1;
        ctx.globalCompositeOperation = "lighter";
        for (const r of rays) {
          const a = r.angle + Math.sin(t * 0.3 + r.phase) * 0.04;
          const glow = 0.5 + 0.5 * Math.sin(t * r.rate + r.phase);
          const g = ctx.createLinearGradient(ox, oy, ox + Math.sin(a) * reach, oy + Math.cos(a) * reach);
          g.addColorStop(0, rgba(r.c, (0.1 + glow * 0.22) * Math.min(1.3, density)));
          g.addColorStop(0.7, rgba(r.c, 0.03));
          g.addColorStop(1, rgba(r.c, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ox + Math.sin(a - r.width) * reach, oy + Math.cos(a - r.width) * reach);
          ctx.lineTo(ox + Math.sin(a + r.width) * reach, oy + Math.cos(a + r.width) * reach);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      },
    };
  },

  /**
   * A floor grid running toward a horizon: lines across it come forward
   * and spread as they near the viewer, lines along it converge on a
   * vanishing point, and a glow sits on the horizon. Faint near the horizon
   * and strongest in front, so it reads as depth rather than as a pattern.
   */
  perspective(w, h, density, p) {
    const across = Math.round(16 * Math.min(1.6, 0.6 + density * 0.4));
    const along = Math.round(22 * Math.min(1.6, 0.6 + density * 0.4));
    return {
      draw(ctx, t) {
        const horizon = h * 0.4;
        const vx = w / 2;
        const glow = ctx.createRadialGradient(vx, horizon, 0, vx, horizon, w * 0.6);
        glow.addColorStop(0, rgba(p.accent, 0.28 * Math.min(1.3, density)));
        glow.addColorStop(1, rgba(p.accent, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
        ctx.lineWidth = 1;
        // Lines across: z from 1 (horizon) to 0 (viewer), scrolling forward.
        const scroll = (t * 0.25) % 1;
        for (let k = 0; k < across; k++) {
          const z = 1 - ((k + scroll) / across);
          if (z <= 0.001) continue;
          const y = horizon + (h - horizon) * Math.pow(1 - z, 2.2);
          ctx.strokeStyle = rgba(p.brand, 0.05 + (1 - z) * 0.35);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        // Lines along, converging on the vanishing point.
        for (let k = 0; k <= along; k++) {
          const xBottom = -w * 1.5 + (k / along) * w * 4;
          const g = ctx.createLinearGradient(0, horizon, 0, h);
          g.addColorStop(0, rgba(p.brand, 0));
          g.addColorStop(1, rgba(p.brand, 0.32));
          ctx.strokeStyle = g;
          ctx.beginPath(); ctx.moveTo(vx, horizon); ctx.lineTo(xBottom, h); ctx.stroke();
        }
        // The horizon itself.
        ctx.strokeStyle = rgba(p.accent, 0.35);
        ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(w, horizon); ctx.stroke();
      },
    };
  },

  /**
   * A few long lines flowing across the panel, each a curve through control
   * points that drift on their own periods, drawn faintly — with a bright
   * stretch of light travelling along each one.
   */
  lightlines(w, h, density, p) {
    const rnd = seeded(97);
    const n = Math.max(3, Math.round(5 * density));
    const lines = Array.from({ length: n }, (_, i) => ({
      y: 0.2 + (i / Math.max(1, n - 1)) * 0.6 + (rnd() - 0.5) * 0.05,
      amps: [rnd(), rnd(), rnd()].map((a) => 0.05 + a * 0.12),
      rates: [rnd(), rnd(), rnd()].map((r) => 0.15 + r * 0.3),
      phase: rnd() * 6, speed: 90 + rnd() * 120,
      c: [p.brand, p.secondary, p.accent][i % 3],
    }));
    return {
      draw(ctx, t) {
        for (const l of lines) {
          const cy = (k: number) => (l.y + Math.sin(t * l.rates[k] + l.phase + k * 1.7) * l.amps[k]) * h;
          const path = () => {
            ctx.beginPath();
            ctx.moveTo(-20, cy(0));
            ctx.bezierCurveTo(w * 0.33, cy(1), w * 0.66, cy(2), w + 20, cy(0) + (cy(1) - cy(2)) * 0.5);
          };
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = rgba(l.c, 0.16 * Math.min(1.4, density));
          ctx.setLineDash([]);
          path(); ctx.stroke();
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = rgba(l.c, 0.75);
          const dash = 90 + w * 0.08;
          ctx.setLineDash([dash, w * 1.6]);
          ctx.lineDashOffset = -((t * l.speed + l.phase * 200) % (dash + w * 1.6));
          path(); ctx.stroke();
        }
        ctx.setLineDash([]);
      },
    };
  },
} satisfies Partial<Record<Exclude<LoginBackdropId, "image">, SceneFactory>>;
