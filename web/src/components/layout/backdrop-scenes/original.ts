import type { LoginBackdropId } from "@/lib/login-backdrop-choices";
import { rgba, seeded, type Rgb, type SceneFactory } from "./shared";

/**
 * The first eight sign-in backdrops (2026-09-17), moved here verbatim from
 * `auth-backdrop.tsx` on 2026-09-24 when seven more arrived and one file of
 * fifteen scenes stopped being readable.
 */
export const ORIGINAL_SCENES = {
  particles(w, h, density, p) {
    const rnd = seeded(11);
    const n = Math.round(Math.min(160, (w * h) / 9000) * density);
    const dots = Array.from({ length: n }, () => ({
      x: rnd() * w, y: rnd() * h, vx: (rnd() - 0.5) * 18, vy: (rnd() - 0.5) * 18, r: 1 + rnd() * 1.6, px: 0, py: 0,
    }));
    const link = 110;
    return {
      draw(ctx, t) {
        for (const d of dots) {
          const x = ((d.x + d.vx * t) % w + w) % w;
          const y = ((d.y + d.vy * t) % h + h) % h;
          d.px = x; d.py = y;
        }
        ctx.lineWidth = 1;
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < dots.length; j++) {
            const dx = dots[i].px - dots[j].px, dy = dots[i].py - dots[j].py;
            const dist = Math.hypot(dx, dy);
            if (dist > link) continue;
            ctx.strokeStyle = rgba(p.brand, 0.22 * (1 - dist / link));
            ctx.beginPath(); ctx.moveTo(dots[i].px, dots[i].py); ctx.lineTo(dots[j].px, dots[j].py); ctx.stroke();
          }
        }
        for (const d of dots) {
          ctx.fillStyle = rgba(p.brand, 0.7);
          ctx.beginPath(); ctx.arc(d.px, d.py, d.r, 0, Math.PI * 2); ctx.fill();
        }
      },
    };
  },

  waves(w, h, density, p) {
    const layers = [
      { colour: p.brand, amp: 22, freq: 0.012, phase: 0, y: 0.62, alpha: 0.28 },
      { colour: p.secondary, amp: 30, freq: 0.008, phase: 2.1, y: 0.7, alpha: 0.22 },
      { colour: p.accent, amp: 18, freq: 0.016, phase: 4.2, y: 0.78, alpha: 0.18 },
    ];
    return {
      draw(ctx, t) {
        for (const l of layers) {
          const amp = l.amp * (0.6 + density * 0.5);
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 6) {
            const y = h * l.y + Math.sin(x * l.freq + t * 0.9 + l.phase) * amp + Math.sin(x * l.freq * 0.37 - t * 0.5) * amp * 0.5;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h); ctx.closePath();
          ctx.fillStyle = rgba(l.colour, l.alpha * Math.min(1.4, density));
          ctx.fill();
        }
      },
    };
  },

  circuit(w, h, density, p) {
    const rnd = seeded(7);
    const cell = 36;
    const cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
    // Traces: orthogonal walks on the grid, each with a pulse travelling along it.
    const n = Math.round(Math.min(48, (cols * rows) / 14) * density);
    const traces = Array.from({ length: n }, () => {
      const pts: [number, number][] = [[Math.floor(rnd() * cols) * cell, Math.floor(rnd() * rows) * cell]];
      const steps = 3 + Math.floor(rnd() * 5);
      for (let i = 0; i < steps; i++) {
        const [x, y] = pts[pts.length - 1];
        const horizontal = rnd() < 0.5;
        const len = (1 + Math.floor(rnd() * 3)) * cell * (rnd() < 0.5 ? -1 : 1);
        pts.push(horizontal ? [x + len, y] : [x, y + len]);
      }
      let length = 0;
      for (let i = 1; i < pts.length; i++) length += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
      return { pts, length, offset: rnd() * length, speed: 40 + rnd() * 50 };
    });
    const along = (tr: typeof traces[number], d: number): [number, number] => {
      let left = ((d % tr.length) + tr.length) % tr.length;
      for (let i = 1; i < tr.pts.length; i++) {
        const [ax, ay] = tr.pts[i - 1], [bx, by] = tr.pts[i];
        const seg = Math.abs(bx - ax) + Math.abs(by - ay);
        if (left <= seg) { const k = seg ? left / seg : 0; return [ax + (bx - ax) * k, ay + (by - ay) * k]; }
        left -= seg;
      }
      return tr.pts[tr.pts.length - 1];
    };
    return {
      draw(ctx, t) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(p.brand, 0.06);
        for (let x = 0; x <= w; x += cell) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = 0; y <= h; y += cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        for (const tr of traces) {
          ctx.strokeStyle = rgba(p.brand, 0.28);
          ctx.beginPath(); ctx.moveTo(tr.pts[0][0], tr.pts[0][1]);
          for (const [x, y] of tr.pts.slice(1)) ctx.lineTo(x, y);
          ctx.stroke();
          for (const [x, y] of [tr.pts[0], tr.pts[tr.pts.length - 1]]) {
            ctx.fillStyle = rgba(p.brand, 0.5); ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
          }
          const [px, py] = along(tr, tr.offset + t * tr.speed);
          const glow = ctx.createRadialGradient(px, py, 0, px, py, 9);
          glow.addColorStop(0, rgba(p.accent, 0.9)); glow.addColorStop(1, rgba(p.accent, 0));
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
        }
      },
    };
  },

  geometric(w, h, density, p) {
    const rnd = seeded(23);
    const n = Math.round(Math.min(40, (w * h) / 26000) * density);
    const shapes = Array.from({ length: n }, () => ({
      x: rnd() * w, y: rnd() * h, size: 18 + rnd() * 70, sides: 3 + Math.floor(rnd() * 4),
      spin: (rnd() - 0.5) * 0.5, drift: (rnd() - 0.5) * 12, rise: -6 - rnd() * 14, phase: rnd() * Math.PI * 2,
      colour: [p.brand, p.secondary, p.accent][Math.floor(rnd() * 3)],
    }));
    return {
      draw(ctx, t) {
        ctx.lineWidth = 1;
        for (const s of shapes) {
          const x = ((s.x + s.drift * t) % w + w) % w;
          const y = ((s.y + s.rise * t) % h + h) % h;
          const a = s.phase + s.spin * t;
          ctx.strokeStyle = rgba(s.colour, 0.6);
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          for (let i = 0; i <= s.sides; i++) {
            const th = a + (i / s.sides) * Math.PI * 2;
            const px = x + Math.cos(th) * s.size / 2, py = y + Math.sin(th) * s.size / 2;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        // Faint chords between near shapes, the reference's "abstract shapes".
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(p.brand, 0.12);
        for (let i = 0; i < shapes.length; i++) {
          for (let j = i + 1; j < shapes.length; j++) {
            const ax = ((shapes[i].x + shapes[i].drift * t) % w + w) % w, ay = ((shapes[i].y + shapes[i].rise * t) % h + h) % h;
            const bx = ((shapes[j].x + shapes[j].drift * t) % w + w) % w, by = ((shapes[j].y + shapes[j].rise * t) % h + h) % h;
            if (Math.hypot(ax - bx, ay - by) < 160) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
          }
        }
      },
    };
  },

  dataflow(w, h, density, p) {
    const rnd = seeded(5);
    const n = Math.round(Math.min(90, w / 14) * density);
    const streams = Array.from({ length: n }, () => ({
      x: rnd() * w, len: 40 + rnd() * 160, speed: 60 + rnd() * 140, offset: rnd() * h * 2,
      colour: rnd() < 0.7 ? p.brand : rnd() < 0.5 ? p.secondary : p.accent, width: rnd() < 0.2 ? 2 : 1,
    }));
    return {
      draw(ctx, t) {
        for (const s of streams) {
          const head = ((s.offset + s.speed * t) % (h + s.len));
          const g = ctx.createLinearGradient(0, head - s.len, 0, head);
          g.addColorStop(0, rgba(s.colour, 0)); g.addColorStop(1, rgba(s.colour, 0.75));
          ctx.strokeStyle = g; ctx.lineWidth = s.width;
          ctx.beginPath(); ctx.moveTo(s.x, head - s.len); ctx.lineTo(s.x, head); ctx.stroke();
          ctx.fillStyle = rgba(s.colour, 0.9);
          ctx.beginPath(); ctx.arc(s.x, head, s.width + 0.5, 0, Math.PI * 2); ctx.fill();
        }
      },
    };
  },

  gradient(w, h, density, p) {
    const blobs = [
      { colour: p.brand, cx: 0.3, cy: 0.35, r: 0.55, dx: 0.12, dy: 0.08, phase: 0 },
      { colour: p.secondary, cx: 0.7, cy: 0.6, r: 0.5, dx: 0.1, dy: 0.12, phase: 2 },
      { colour: p.accent, cx: 0.5, cy: 0.85, r: 0.45, dx: 0.14, dy: 0.06, phase: 4 },
    ];
    return {
      draw(ctx, t) {
        const big = Math.max(w, h);
        ctx.globalCompositeOperation = "lighter";
        for (const b of blobs) {
          const x = (b.cx + Math.sin(t * 0.25 + b.phase) * b.dx) * w;
          const y = (b.cy + Math.cos(t * 0.2 + b.phase) * b.dy) * h;
          const r = b.r * big * (0.8 + density * 0.25);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, rgba(b.colour, 0.42 * Math.min(1.3, density)));
          g.addColorStop(1, rgba(b.colour, 0));
          ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        }
        ctx.globalCompositeOperation = "source-over";
      },
    };
  },

  quantum(w, h, density, p) {
    const rnd = seeded(31);
    const centres = Array.from({ length: Math.max(2, Math.round(3 * density)) }, () => ({
      x: 0.15 * w + rnd() * 0.7 * w, y: 0.15 * h + rnd() * 0.7 * h, r: 40 + rnd() * 80, phase: rnd() * 6,
      colour: [p.brand, p.secondary, p.accent][Math.floor(rnd() * 3)],
    }));
    const n = Math.round(Math.min(140, (w * h) / 10000) * density);
    const points = Array.from({ length: n }, () => {
      const c = centres[Math.floor(rnd() * centres.length)];
      return { c, radius: c.r * (0.4 + rnd() * 1.4), angle: rnd() * Math.PI * 2, speed: (0.3 + rnd() * 0.7) * (rnd() < 0.5 ? -1 : 1), tilt: 0.35 + rnd() * 0.5 };
    });
    return {
      draw(ctx, t) {
        ctx.lineWidth = 1;
        for (const c of centres) {
          for (let k = 1; k <= 3; k++) {
            const r = c.r * k * (1 + 0.06 * Math.sin(t * 0.8 + c.phase + k));
            ctx.strokeStyle = rgba(c.colour, 0.12 / k);
            ctx.beginPath(); ctx.ellipse(c.x, c.y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
          }
          const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r * 0.5);
          g.addColorStop(0, rgba(c.colour, 0.35)); g.addColorStop(1, rgba(c.colour, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.5, 0, Math.PI * 2); ctx.fill();
        }
        for (const q of points) {
          const a = q.angle + t * q.speed;
          const x = q.c.x + Math.cos(a) * q.radius, y = q.c.y + Math.sin(a) * q.radius * q.tilt;
          ctx.fillStyle = rgba(q.c.colour, 0.55 + 0.35 * Math.sin(a * 2));
          ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill();
        }
      },
    };
  },

  stars(w, h, density, p) {
    const rnd = seeded(43);
    const n = Math.round(Math.min(420, (w * h) / 3200) * density);
    const stars = Array.from({ length: n }, () => ({
      x: rnd() * w, y: rnd() * h, depth: 0.2 + rnd() * 0.8, twinkle: rnd() * Math.PI * 2, rate: 0.6 + rnd() * 1.8,
      colour: rnd() < 0.8 ? [235, 238, 245] as Rgb : rnd() < 0.5 ? p.brand : p.accent,
    }));
    return {
      draw(ctx, t) {
        for (const s of stars) {
          // Nearer stars drift faster: parallax, the whole of the depth cue.
          const x = ((s.x - t * 6 * s.depth) % w + w) % w;
          const y = ((s.y + t * 2 * s.depth) % h + h) % h;
          const a = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.rate + s.twinkle))) * (0.4 + s.depth * 0.6);
          ctx.fillStyle = rgba(s.colour, a);
          ctx.beginPath(); ctx.arc(x, y, 0.6 + s.depth * 1.3, 0, Math.PI * 2); ctx.fill();
        }
      },
    };
  },
} satisfies Partial<Record<Exclude<LoginBackdropId, "image">, SceneFactory>>;
