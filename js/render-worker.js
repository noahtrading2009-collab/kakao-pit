// ===== KAKAO PIT – Bild-Rechner für die Leitstände =====
// Läuft als Web Worker im Hintergrund (das Spiel ruckelt nicht) – oder als Notlösung im Hauptfenster.
// Alles wird in derselben, vollen Auflösung gerechnet: Boden, Bäume, Häuser, Wasser.

const RenderCore = (() => {
    const LIGHT = { x: -0.6, y: -0.8 }; // Sonne links oben
    const canvas = (w, h) => {
        w = Math.max(1, Math.round(w));
        h = Math.max(1, Math.round(h));
        if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    };
    function rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const P = new Float32Array(256 * 256);
    (() => { const r = rng(1234); for (let i = 0; i < P.length; i++) P[i] = r(); })();
    function vn(x, y) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const xf = x - xi;
        const yf = y - yi;
        const u = xf * xf * (3 - 2 * xf);
        const v = yf * yf * (3 - 2 * yf);
        const x0 = xi & 255;
        const y0 = yi & 255;
        const x1 = (x0 + 1) & 255;
        const y1 = (y0 + 1) & 255;
        const a = P[y0 * 256 + x0];
        const b = P[y0 * 256 + x1];
        const c = P[y1 * 256 + x0];
        const d = P[y1 * 256 + x1];
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, y, o) {
        let s = 0;
        let a = 0.5;
        let f = 1;
        let t = 0;
        for (let i = 0; i < o; i++) {
            s += a * vn(x * f + i * 17.3, y * f + i * 9.1);
            t += a;
            a *= 0.5;
            f *= 2.03;
        }
        return s / t;
    }
    const mix = (a, b, t) => a + (b - a) * t;
    const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

    // SVG-Pfad (M/C/S/L, absolut) abtasten – ohne DOM, damit es auch im Worker geht
    function samplePath(d, step = 4) {
        const tok = d.match(/[MCSL]|-?\d*\.?\d+/g) || [];
        const pts = [];
        let i = 0;
        let cmd = 'M';
        let cx = 0;
        let cy = 0;
        let lc = null;
        const num = () => Number(tok[i++]);
        const cubic = (x1, y1, x2, y2, x3, y3) => {
            const len = Math.hypot(x3 - cx, y3 - cy) + Math.hypot(x1 - cx, y1 - cy) * 0.3;
            const n = Math.max(4, Math.ceil(len / step));
            for (let q = 1; q <= n; q++) {
                const t = q / n;
                const m = 1 - t;
                pts.push([m * m * m * cx + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3, m * m * m * cy + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3]);
            }
            lc = [x2, y2];
            cx = x3;
            cy = y3;
        };
        while (i < tok.length) {
            if (/[MCSL]/.test(tok[i])) cmd = tok[i++];
            if (cmd === 'M') { cx = num(); cy = num(); pts.push([cx, cy]); lc = null; cmd = 'L'; }
            else if (cmd === 'L') { const nx = num(); const ny = num(); pts.push([nx, ny]); cx = nx; cy = ny; lc = null; }
            else if (cmd === 'C') cubic(num(), num(), num(), num(), num(), num());
            else if (cmd === 'S') {
                const x1 = lc ? 2 * cx - lc[0] : cx;
                const y1 = lc ? 2 * cy - lc[1] : cy;
                cubic(x1, y1, num(), num(), num(), num());
            } else i++;
        }
        return pts;
    }
    // Abstand zu einer Punktliste über ein grobes Raster (schnell)
    function distField(pts, W, H, cell) {
        const gw = Math.ceil(W / cell) + 1;
        const gh = Math.ceil(H / cell) + 1;
        const g = new Float32Array(gw * gh).fill(1e9);
        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                let best = 1e9;
                const px = x * cell;
                const py = y * cell;
                for (const [qx, qy] of pts) { const d = (qx - px) * (qx - px) + (qy - py) * (qy - py); if (d < best) best = d; }
                g[y * gw + x] = Math.sqrt(best);
            }
        }
        return (px, py) => {
            const fx = Math.min(gw - 1.001, Math.max(0, px / cell));
            const fy = Math.min(gh - 1.001, Math.max(0, py / cell));
            const x0 = Math.floor(fx);
            const y0 = Math.floor(fy);
            const tx = fx - x0;
            const ty = fy - y0;
            const a = g[y0 * gw + x0];
            const b = g[y0 * gw + x0 + 1];
            const c = g[(y0 + 1) * gw + x0];
            const d = g[(y0 + 1) * gw + x0 + 1];
            return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
        };
    }

    // ---------- Baumkronen als Sprites, in Pixel-Auflösung ----------
    const sprites = new Map();
    // Ein Baum = ein fertiges Bild (Schatten nach rechts unten + Krone), in Pixeln
    function tree(Rp, hue, seed) {
        const key = `${Rp}|${hue}|${seed}`;
        if (sprites.has(key)) return sprites.get(key);
        const S = Math.ceil(Rp * 3.4);
        const c = canvas(S, S);
        const x = c.getContext('2d');
        const r = rng(seed * 7919 + Rp * 31 + hue.length * 17 + hue.charCodeAt(1));
        const [h0, h1, h2] = hue.split(',').map(Number);
        const cx = Math.round(S * 0.4);
        const cy = Math.round(S * 0.4);
        // Schlagschatten (weich), Sonne links oben
        const sg = x.createRadialGradient(cx + Rp * 0.6, cy + Rp * 0.75, Rp * 0.3, cx + Rp * 0.6, cy + Rp * 0.75, Rp * 1.35);
        sg.addColorStop(0, 'rgba(8,14,4,.6)');
        sg.addColorStop(1, 'rgba(8,14,4,0)');
        x.fillStyle = sg;
        x.fillRect(0, 0, S, S);
        // unregelmässiger Umriss aus Teilkronen
        const lobes = 5 + Math.floor(r() * 4);
        const parts = [];
        for (let i = 0; i < lobes; i++) {
            const a = (i / lobes) * Math.PI * 2 + r() * 0.6;
            const d = Rp * (0.35 + r() * 0.25);
            parts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, Rp * (0.45 + r() * 0.25)]);
        }
        parts.push([cx, cy, Rp * 0.6]);
        x.fillStyle = `rgb(${h0 * 0.42 | 0},${h1 * 0.42 | 0},${h2 * 0.42 | 0})`;
        for (const [px, py, pr] of parts) { x.beginPath(); x.arc(px, py, pr, 0, Math.PI * 2); x.fill(); }
        for (const [px, py, pr] of parts) {
            const lit = clamp01(0.5 + (-(px - cx) - (py - cy)) / (2.2 * Rp));
            const g = x.createRadialGradient(px - pr * 0.4, py - pr * 0.45, pr * 0.05, px, py, pr);
            const k1 = 0.8 + lit * 0.55;
            const k2 = 0.38 + lit * 0.2;
            g.addColorStop(0, `rgb(${Math.min(255, h0 * k1 + 14) | 0},${Math.min(255, h1 * k1 + 18) | 0},${Math.min(255, h2 * k1 + 6) | 0})`);
            g.addColorStop(0.7, `rgb(${h0 * (k2 + 0.15) | 0},${h1 * (k2 + 0.15) | 0},${h2 * (k2 + 0.15) | 0})`);
            g.addColorStop(1, `rgba(${h0 * k2 | 0},${h1 * k2 | 0},${h2 * k2 | 0},0.9)`);
            x.fillStyle = g;
            x.beginPath();
            x.arc(px, py, pr * 0.92, 0, Math.PI * 2);
            x.fill();
        }
        // Blattstruktur: Sprenkel nur innerhalb der Krone
        x.globalCompositeOperation = 'source-atop';
        const n = Math.round(Rp * Rp * 0.9);
        for (let i = 0; i < n; i++) {
            const a = r() * Math.PI * 2;
            const d = Math.sqrt(r()) * Rp * 1.05;
            const px = cx + Math.cos(a) * d;
            const py = cy + Math.sin(a) * d;
            const up = (-(px - cx) - (py - cy)) / Rp;
            x.fillStyle = r() < 0.45 + up * 0.2 ? 'rgba(220,255,170,.22)' : 'rgba(0,18,0,.28)';
            x.fillRect(px, py, 1, 1);
        }
        x.globalCompositeOperation = 'source-over';
        const out = { c, ox: cx, oy: cy };
        sprites.set(key, out);
        return out;
    }

    // =====================================================================
    // KOOPERATIVE: Luftbild – alles in Pixel-Koordinaten gerechnet (k Pixel pro Einheit)
    // =====================================================================
    function farm(L, pxW) {
        const W = 800;
        const H = L.VH;
        const k = Math.min(2.6, pxW / W);
        const PW = Math.round(W * k);
        const PH = Math.round(H * k);
        const c = canvas(PW, PH);
        const x = c.getContext('2d');
        const r = rng(77);
        const pals = {
            sun: { g1: [74, 108, 44], g2: [112, 132, 64], dry: [158, 140, 92], litter: [52, 60, 30], trees: ['46,92,34', '58,104,38', '38,80,30', '72,112,42', '86,118,48', '52,96,44'] },
            drought: { g1: [120, 116, 60], g2: [158, 142, 84], dry: [190, 160, 104], litter: [86, 74, 44], trees: ['74,96,40', '92,108,44', '66,84,36', '110,116,52', '120,112,56', '80,98,46'] },
            rain: { g1: [56, 104, 42], g2: [86, 128, 56], dry: [120, 120, 76], litter: [40, 56, 28], trees: ['36,90,34', '46,104,40', '30,76,30', '58,112,44', '64,118,46', '42,94,40'] },
            blackpod: { g1: [66, 92, 46], g2: [96, 112, 64], dry: [126, 116, 84], litter: [50, 54, 32], trees: ['50,82,38', '60,90,42', '44,72,34', '70,96,46', '78,96,52', '56,86,44'] },
            record: { g1: [64, 116, 42], g2: [100, 146, 60], dry: [146, 140, 84], litter: [44, 62, 28], trees: ['40,100,34', '52,114,40', '34,88,30', '64,124,44', '78,130,50', '46,104,42'] },
        };
        const pal = pals[L.sky] || pals.sun;
        const TM = [['start', Date.now()]];
        const mark = n => TM.push([n, Date.now()]);
        const river = samplePath(L.river, 3);
        const road = samplePath(L.road, 3);
        const dRiver = distField(river, W, H, 6);
        const dRoad = distField(road, W, H, 6);
        const forestAt = (u, v) => fbm(u * 0.011 + 9, v * 0.011, 4);
        const inField = (px, py, pad = 0) => L.fields.some(([fx, fy, fw, fh, rot]) => {
            const a = (-rot * Math.PI) / 180;
            const dx = px - (fx + fw / 2);
            const dy = py - (fy + fh / 2);
            const qx = dx * Math.cos(a) - dy * Math.sin(a);
            const qy = dx * Math.sin(a) + dy * Math.cos(a);
            return Math.abs(qx) < fw / 2 + pad && Math.abs(qy) < fh / 2 + pad;
        });
        const villageAt = (px, py, s = 1) => L.villages.some(([vx, vy]) => ((vx - px) / (44 * s)) ** 2 + ((vy - py) / (30 * s)) ** 2 < 1);

        mark('pre');
        // 1) Boden in voller Auflösung. Grossflächige Felder (Hügel, Wiesen, Waldrand) sind weich –
        //    sie werden auf einem Raster (alle 4 Pixel) gerechnet und fein interpoliert. Die feine
        //    Grasstruktur kommt pixelgenau aus einer vorberechneten Kachel.
        const inv = 1 / k;
        const G = 4;
        const gw = Math.ceil(PW / G) + 2;
        const gh = Math.ceil(PH / G) + 2;
        const gH = new Float32Array(gw * gh);
        const gM = new Float32Array(gw * gh);
        const gF = new Float32Array(gw * gh);
        for (let gy = 0; gy < gh; gy++) {
            for (let gx = 0; gx < gw; gx++) {
                const u = gx * G * inv;
                const v = gy * G * inv;
                const i = gy * gw + gx;
                gH[i] = fbm(u * 0.008, v * 0.008, 4);
                gM[i] = clamp01((fbm(u * 0.024 + 40, v * 0.024, 3) - 0.3) / 0.42);
                gF[i] = forestAt(u, v);
            }
        }
        // Hangschatten auf dem Raster
        const gS = new Float32Array(gw * gh);
        for (let gy = 0; gy < gh; gy++) {
            for (let gx = 0; gx < gw; gx++) {
                const hx = gH[gy * gw + Math.min(gw - 1, gx + 1)] - gH[gy * gw + Math.max(0, gx - 1)];
                const hy = gH[Math.min(gh - 1, gy + 1) * gw + gx] - gH[Math.max(0, gy - 1) * gw + gx];
                gS[gy * gw + gx] = 1 - (hx * LIGHT.x + hy * LIGHT.y) * 9 * (8 / G) * (k / 2);
            }
        }
        const T = 256;
        const tile = new Float32Array(T * T);
        for (let q = 0; q < T * T; q++) {
            const tx = q % T;
            const ty = (q / T) | 0;
            tile[q] = (vn(tx * 0.8 / k, ty * 0.25 / k) - 0.5) * 26 + (vn(tx * 1.55 / k + 7, ty * 1.55 / k) - 0.5) * 18 + (r() - 0.5) * 12;
        }
        const img = x.createImageData(PW, PH);
        const D = img.data;
        const lerp4 = (A, i0, i1, i2, i3, tx, ty) => { const a = A[i0]; const b = A[i1]; const c2 = A[i2]; const d = A[i3]; return a + (b - a) * tx + (c2 - a) * ty + (a - b - c2 + d) * tx * ty; };
        for (let py = 0; py < PH; py++) {
            const fy = py / G;
            const y0 = fy | 0;
            const ty = fy - y0;
            for (let px = 0; px < PW; px++) {
                const fx = px / G;
                const x0 = fx | 0;
                const tx = fx - x0;
                const i0 = y0 * gw + x0;
                const i1 = i0 + 1;
                const i2 = i0 + gw;
                const i3 = i2 + 1;
                const m = lerp4(gM, i0, i1, i2, i3, tx, ty);
                const f = lerp4(gF, i0, i1, i2, i3, tx, ty);
                const shade = lerp4(gS, i0, i1, i2, i3, tx, ty);
                let R = mix(pal.g1[0], pal.g2[0], m);
                let Gc = mix(pal.g1[1], pal.g2[1], m);
                let B = mix(pal.g1[2], pal.g2[2], m);
                if (m > 0.72) { const q = clamp01((m - 0.72) * 3); R = mix(R, pal.dry[0], q); Gc = mix(Gc, pal.dry[1], q); B = mix(B, pal.dry[2], q); }
                if (f > 0.44) { const q = clamp01((f - 0.44) * 6); R = mix(R, pal.litter[0], q); Gc = mix(Gc, pal.litter[1], q); B = mix(B, pal.litter[2], q); }
                const det = tile[(py & 255) * T + (px & 255)];
                const o = (py * PW + px) * 4;
                D[o] = R * shade + det * 0.8;
                D[o + 1] = Gc * shade + det;
                D[o + 2] = B * shade + det * 0.5;
                D[o + 3] = 255;
            }
        }
        x.putImageData(img, 0, 0);
        x.save();
        x.scale(k, k);
        x.lineCap = 'round';
        x.lineJoin = 'round';

        mark('terrain');
        // 2) Strasse: rote Lateriterde, Grasränder, Fahrspuren, Pfützen
        const roadP = new Path2D(L.road);
        x.strokeStyle = 'rgba(70,52,26,.35)';
        x.lineWidth = 14;
        x.stroke(roadP);
        x.strokeStyle = '#9c5f38';
        x.lineWidth = 10;
        x.stroke(roadP);
        x.strokeStyle = 'rgba(180,110,66,.6)';
        x.lineWidth = 6;
        x.stroke(roadP);
        x.strokeStyle = 'rgba(80,42,20,.55)';
        x.lineWidth = 0.9;
        for (const off of [-2.3, 2.3]) { x.save(); x.translate(0, off); x.stroke(roadP); x.restore(); }
        for (const [qx, qy] of road) if (r() < 0.06) { x.fillStyle = 'rgba(70,60,50,.5)'; x.beginPath(); x.ellipse(qx + (r() - 0.5) * 4, qy + (r() - 0.5) * 3, 1.5 + r() * 2, 0.8 + r(), 0, 0, 7); x.fill(); }

        // 3) Fluss: lehmbraunes Tropenwasser mit Himmelsspiegelung, Strömungslinien und Glitzern
        const riverP = new Path2D(L.river);
        const band = (w, col) => { x.strokeStyle = col; x.lineWidth = w; x.stroke(riverP); };
        band(21, '#4a4428');
        band(17.5, '#26301c');
        band(15, '#2f3a22');
        band(12, '#38452a');
        band(8, '#405033');
        // Himmelsspiegelung: kühler, glänzender Streifen zur Sonnenseite
        x.save();
        x.translate(-1.4, -1.6);
        x.strokeStyle = 'rgba(120,160,190,.30)';
        x.lineWidth = 6;
        x.stroke(riverP);
        x.strokeStyle = 'rgba(190,215,230,.22)';
        x.lineWidth = 2;
        x.stroke(riverP);
        x.restore();
        // Schatten der Uferbäume auf dem Wasser (Sonnenseite gegenüber)
        x.save();
        x.translate(2.2, 2.6);
        x.strokeStyle = 'rgba(8,12,4,.35)';
        x.lineWidth = 3;
        x.setLineDash([6, 4, 10, 3]);
        x.stroke(riverP);
        x.setLineDash([]);
        x.restore();
        // Strömungslinien und Glitzern entlang des Flusses
        for (let q = 1; q < river.length - 1; q++) {
            const [ax, ay] = river[q - 1];
            const [bx, by] = river[q + 1];
            const [qx, qy] = river[q];
            const tx = bx - ax;
            const ty = by - ay;
            const tl = Math.hypot(tx, ty) || 1;
            const nx = -ty / tl;
            const ny = tx / tl;
            if (r() < 0.55) {
                const o = (r() - 0.5) * 11;
                const len = 2 + r() * 6;
                x.strokeStyle = `rgba(230,236,220,${0.08 + r() * 0.16})`;
                x.lineWidth = 0.35;
                x.beginPath();
                x.moveTo(qx + nx * o, qy + ny * o);
                x.lineTo(qx + nx * o + (tx / tl) * len, qy + ny * o + (ty / tl) * len);
                x.stroke();
            }
            if (r() < 0.08) { x.fillStyle = `rgba(255,252,235,${0.35 + r() * 0.4})`; x.fillRect(qx + nx * (r() - 0.5) * 9, qy + ny * (r() - 0.5) * 9, 0.6 + r() * 1.2, 0.35); }
            if (r() < 0.02) { x.fillStyle = 'rgba(196,176,128,.85)'; x.beginPath(); x.ellipse(qx + nx * (r() > 0.5 ? 6 : -6), qy + ny * (r() > 0.5 ? 6 : -6), 3 + r() * 4, 1.1 + r() * 0.8, Math.atan2(ty, tx), 0, 7); x.fill(); }
        }
        mark('road+river');
        // 4) Plantagen: unregelmässige Parzellen, Erde mit Furchen, Kakao in Reihen, ein paar Schattenbäume
        const soil = canvas(128, 128);
        const sx = soil.getContext('2d');
        const si = sx.createImageData(128, 128);
        for (let q = 0; q < 128 * 128; q++) {
            const v = vn((q % 128) * 0.12, ((q / 128) | 0) * 0.12) * 40 + vn((q % 128) * 0.6, ((q / 128) | 0) * 0.6) * 22 + r() * 18;
            si.data[q * 4] = 92 + v; si.data[q * 4 + 1] = 62 + v * 0.7; si.data[q * 4 + 2] = 36 + v * 0.4; si.data[q * 4 + 3] = 255;
        }
        sx.putImageData(si, 0, 0);
        const soilPat = x.createPattern(soil, 'repeat');
        if (soilPat.setTransform) soilPat.setTransform(new DOMMatrix().scale(1 / k));
        const cocoa = [];
        for (const [fx, fy, fw, fh, rot] of L.fields) {
            x.save();
            x.translate(fx + fw / 2, fy + fh / 2);
            x.rotate((rot * Math.PI) / 180);
            // leicht unregelmässige Ränder
            const poly = [];
            const N = 18;
            for (let q = 0; q < N; q++) {
                const t = q / N;
                const side = Math.floor(t * 4);
                const s = t * 4 - side;
                const pt = [[-fw / 2 + s * fw, -fh / 2], [fw / 2, -fh / 2 + s * fh], [fw / 2 - s * fw, fh / 2], [-fw / 2, fh / 2 - s * fh]][side];
                poly.push([pt[0] + (r() - 0.5) * 3, pt[1] + (r() - 0.5) * 3]);
            }
            const path = new Path2D();
            poly.forEach(([px, py], q) => (q ? path.lineTo(px, py) : path.moveTo(px, py)));
            path.closePath();
            x.fillStyle = soilPat;
            x.fill(path);
            x.save();
            x.clip(path);
            x.strokeStyle = 'rgba(40,24,10,.32)';
            x.lineWidth = 0.5;
            for (let yy = -fh / 2; yy < fh / 2; yy += 1.9) { x.beginPath(); x.moveTo(-fw / 2 - 4, yy); x.lineTo(fw / 2 + 4, yy); x.stroke(); }
            x.restore();
            x.strokeStyle = 'rgba(60,80,30,.7)';
            x.lineWidth = 1.4;
            x.stroke(path);
            const ca = Math.cos((rot * Math.PI) / 180);
            const sa = Math.sin((rot * Math.PI) / 180);
            const sp = 5.4;
            for (let yy = -fh / 2 + sp / 2; yy < fh / 2 - 1; yy += sp) {
                for (let xx = -fw / 2 + sp / 2; xx < fw / 2 - 1; xx += sp) {
                    if (r() < 0.07) continue;
                    const lx = xx + (r() - 0.5) * 1.2;
                    const ly = yy + (r() - 0.5) * 1.2;
                    cocoa.push([fx + fw / 2 + lx * ca - ly * sa, fy + fh / 2 + lx * sa + ly * ca, 2.2 + r() * 0.9, 1 + ((r() * 2) | 0), (r() * 3) | 0]);
                }
            }
            for (let q = 0; q < Math.round((fw * fh) / 2500); q++) {
                const lx = (r() - 0.5) * fw * 0.9;
                const ly = (r() - 0.5) * fh * 0.9;
                cocoa.push([fx + fw / 2 + lx * ca - ly * sa, fy + fh / 2 + lx * sa + ly * ca, 5.5 + r() * 2, 4, (r() * 3) | 0]);
            }
            x.restore();
        }

        mark('fields');
        // 5) Dorfplätze: unregelmässige Lehmflächen, Trampelpfade zur Strasse
        for (let vi = 0; vi < L.villages.length; vi++) {
            const [vx, vy] = L.villages[vi];
            const rr = rng(500 + vi);
            let best = road[0];
            for (const q of road) if ((q[0] - vx) ** 2 + (q[1] - vy) ** 2 < (best[0] - vx) ** 2 + (best[1] - vy) ** 2) best = q;
            for (let vj = 0; vj < L.villages.length; vj++) {
                if (vj === vi) continue;
                const q = L.villages[vj];
                if ((q[0] - vx) ** 2 + (q[1] - vy) ** 2 < (best[0] - vx) ** 2 + (best[1] - vy) ** 2) best = q;
            }
            const plen = Math.hypot(best[0] - vx, best[1] - vy);
            const nx = -(best[1] - vy) / (plen || 1);
            const ny = (best[0] - vx) / (plen || 1);
            const pts = [[vx, vy]];
            const segs = Math.max(6, Math.round(plen / 8));
            const ph = rr() * 6;
            for (let q = 1; q < segs; q++) {
                const t = q / segs;
                const wob = Math.sin(t * Math.PI * 3 + ph) * plen * 0.07 * Math.sin(t * Math.PI) + (rr() - 0.5) * 2.5;
                pts.push([vx + (best[0] - vx) * t + nx * wob, vy + (best[1] - vy) * t + ny * wob]);
            }
            pts.push(best);
            for (const [lw, col] of [[2.4, 'rgba(60,40,20,.22)'], [1.3, 'rgba(160,108,68,.75)']]) {
                x.strokeStyle = col;
                x.lineWidth = lw;
                x.beginPath();
                x.moveTo(pts[0][0], pts[0][1]);
                for (let q = 1; q < pts.length - 1; q++) x.quadraticCurveTo(pts[q][0], pts[q][1], (pts[q][0] + pts[q + 1][0]) / 2, (pts[q][1] + pts[q + 1][1]) / 2);
                x.lineTo(best[0], best[1]);
                x.stroke();
            }
            const blob = new Path2D();
            const NB = 28;
            for (let q = 0; q <= NB; q++) {
                const a = (q / NB) * Math.PI * 2;
                const rad = 1 + (vn(Math.cos(a) * 2 + vi * 5, Math.sin(a) * 2) - 0.5) * 0.55;
                const px = vx + Math.cos(a) * 36 * rad;
                const py = vy + Math.sin(a) * 23 * rad;
                q ? blob.lineTo(px, py) : blob.moveTo(px, py);
            }
            x.fillStyle = 'rgba(60,40,20,.25)';
            x.save(); x.translate(0.8, 0.8); x.fill(blob); x.restore();
            x.fillStyle = '#a86e44';
            x.fill(blob);
            x.save();
            x.clip(blob);
            for (let q = 0; q < 260; q++) { x.fillStyle = rr() < 0.5 ? 'rgba(200,140,90,.35)' : 'rgba(90,56,30,.3)'; x.fillRect(vx - 40 + rr() * 80, vy - 26 + rr() * 52, 0.5 + rr(), 0.4 + rr() * 0.6); }
            for (let q = 0; q < 40; q++) { x.fillStyle = 'rgba(80,110,40,.45)'; x.beginPath(); x.arc(vx - 38 + rr() * 76, vy - 24 + rr() * 48, 0.6 + rr() * 1.8, 0, 7); x.fill(); }
            x.restore();
        }

        mark('villages');
        // 6) Bäume: dichtes, zusammenhängendes Kronendach im Wald, einzelne Bäume im Grasland,
        //    Uferwald am Fluss. Farben wechseln grossflächig (natürlicher als Zufall pro Baum).
        const trees = [];
        const step = 4.4;
        for (let gy = -step; gy < H + step; gy += step) {
            for (let gx = -step; gx < W + step; gx += step) {
                const px = gx + (r() - 0.5) * step * 1.1;
                const py = gy + (r() - 0.5) * step * 1.1;
                const f = forestAt(px, py);
                const dr = dRiver(px, py);
                const riparian = dr > 8.5 && dr < 20;
                let p = f > 0.47 ? 0.95 : f > 0.42 ? 0.35 : riparian ? 0.62 : 0.025;
                if (dr < 9 || dRoad(px, py) < 7 || inField(px, py, 2.5) || villageAt(px, py, 1.05)) p = 0;
                if (r() > p) continue;
                const big = f > 0.55 ? 1.25 : 1;
                const R = (2.8 + r() * 2.8) * big * (p < 0.1 ? 1.35 : 1);
                const tint = Math.floor(clamp01(fbm(px * 0.03 + 77, py * 0.03, 2) * 1.6 - 0.3) * 5.99);
                trees.push([px, py, R, tint, (r() * 4) | 0]);
            }
        }
        // ein paar Bäume und Palmen in den Dörfern
        const palms = [];
        for (let vi = 0; vi < L.villages.length; vi++) {
            const [vx, vy] = L.villages[vi];
            const rr = rng(900 + vi);
            for (let q = 0; q < 4; q++) palms.push([vx - 32 + rr() * 64, vy - 20 + rr() * 40, 4 + rr() * 2, rr]);
            for (let q = 0; q < 2; q++) trees.push([vx - 34 + rr() * 68, vy - 22 + rr() * 44, 4 + rr() * 2, 2, 1]);
        }
        const all = trees.map(t => [t[0], t[1], t[2], pal.trees[t[3]], t[4]]).concat(cocoa.map(t => [t[0], t[1], t[2], t[3] === 4 ? pal.trees[4] : ['64,112,40', '74,122,44', '58,104,38'][t[4]], t[4]]));
        all.sort((a, b) => a[1] - b[1]);
        // Bäume pixelgenau ohne Skalierung zeichnen (schnellster Weg, gestochen scharf)
        x.save();
        x.setTransform(1, 0, 0, 1, 0, 0);
        for (const [px, py, R, hue, sd] of all) {
            const Rp = Math.max(2, Math.round(R * k));
            const t = tree(Rp, hue, sd % 3);
            x.drawImage(t.c, Math.round(px * k - t.ox), Math.round(py * k - t.oy));
        }
        x.restore();

        mark('trees');
        // 7) Häuser mit Wellblech, Trockentische mit Bohnen
        for (let vi = 0; vi < L.villages.length; vi++) {
            const [vx, vy] = L.villages[vi];
            const rr = rng(1000 + vi);
            for (let j = 0; j < 3; j++) {
                const mx = vx - 24 + j * 16 + rr() * 4;
                const my = vy + 9 + rr() * 6;
                x.fillStyle = 'rgba(0,0,0,.32)';
                x.fillRect(mx + 1.4, my + 1.6, 12, 5.2);
                x.fillStyle = '#3e2412';
                x.fillRect(mx, my, 12, 5.2);
                for (let b = 0; b < 60; b++) { x.fillStyle = ['#6a3a1c', '#8a4e28', '#a86434', '#5a3018'][(rr() * 4) | 0]; x.beginPath(); x.ellipse(mx + 0.6 + rr() * 10.8, my + 0.5 + rr() * 4.2, 0.45, 0.28, rr() * 3, 0, 7); x.fill(); }
            }
            const placed = [];
            const nh = 5 + Math.floor(rr() * 3);
            for (let j = 0; j < nh * 4 && placed.length < nh; j++) {
                const a = rr() * Math.PI * 2;
                const d = 4 + rr() * 20;
                const hx = vx + Math.cos(a) * d * 1.35;
                const hy = vy + Math.sin(a) * d * 0.7 - 4;
                const hw = 9 + rr() * 6;
                const hh = 6 + rr() * 3;
                if (placed.some(([qx, qy, qw]) => Math.abs(qx - hx) < (qw + hw) / 2 + 1 && Math.abs(qy - hy) < 8)) continue;
                placed.push([hx, hy, hw]);
                const rot = (rr() - 0.5) * 0.7;
                const rust = rr() < 0.4;
                x.save();
                x.translate(hx, hy);
                x.rotate(rot);
                x.fillStyle = 'rgba(0,0,0,.42)';
                x.fillRect(-hw / 2 + 1.8, -hh / 2 + 2.2, hw, hh);
                const g1 = x.createLinearGradient(0, -hh / 2, 0, 0);
                g1.addColorStop(0, rust ? '#b98458' : '#d3d9df');
                g1.addColorStop(1, rust ? '#9a6440' : '#aeb6bf');
                x.fillStyle = g1;
                x.fillRect(-hw / 2, -hh / 2, hw, hh / 2);
                const g2 = x.createLinearGradient(0, 0, 0, hh / 2);
                g2.addColorStop(0, rust ? '#7a4a2c' : '#8c96a2');
                g2.addColorStop(1, rust ? '#5e381f' : '#6f7884');
                x.fillStyle = g2;
                x.fillRect(-hw / 2, 0, hw, hh / 2);
                x.lineWidth = 0.22;
                for (let q = -hw / 2 + 0.5; q < hw / 2; q += 0.7) {
                    x.strokeStyle = rust ? 'rgba(50,24,10,.45)' : 'rgba(40,46,54,.4)';
                    x.beginPath(); x.moveTo(q, -hh / 2); x.lineTo(q, hh / 2); x.stroke();
                    x.strokeStyle = 'rgba(255,255,255,.18)';
                    x.beginPath(); x.moveTo(q + 0.25, -hh / 2); x.lineTo(q + 0.25, 0); x.stroke();
                }
                if (!rust) for (let q = 0; q < 3; q++) { x.fillStyle = `rgba(140,70,30,${0.2 + rr() * 0.25})`; x.fillRect(-hw / 2 + rr() * hw * 0.8, -hh / 2 + rr() * hh * 0.7, 1 + rr() * 3, 1 + rr() * 2); }
                x.strokeStyle = 'rgba(255,255,255,.5)';
                x.lineWidth = 0.35;
                x.beginPath(); x.moveTo(-hw / 2, 0); x.lineTo(hw / 2, 0); x.stroke();
                x.strokeStyle = 'rgba(0,0,0,.5)';
                x.lineWidth = 0.35;
                x.strokeRect(-hw / 2, -hh / 2, hw, hh);
                x.restore();
            }
        }
        for (const [px, py, R, rr] of palms) {
            x.save();
            x.translate(px + R * 0.6, py + R * 0.75);
            x.fillStyle = 'rgba(8,14,4,.38)';
            for (let i = 0; i < 9; i++) { x.rotate((Math.PI * 2) / 9); x.beginPath(); x.ellipse(R * 0.5, 0, R * 0.55, R * 0.12, 0, 0, 7); x.fill(); }
            x.restore();
            x.save();
            x.translate(px, py);
            for (let i = 0; i < 10; i++) {
                x.rotate((Math.PI * 2) / 10 + (rr() - 0.5) * 0.25);
                const g = x.createLinearGradient(0, 0, R, 0);
                g.addColorStop(0, '#2c5520');
                g.addColorStop(1, '#86b850');
                x.fillStyle = g;
                x.beginPath();
                x.moveTo(0, 0);
                x.quadraticCurveTo(R * 0.5, -R * 0.2, R, 0);
                x.quadraticCurveTo(R * 0.5, R * 0.2, 0, 0);
                x.fill();
                x.strokeStyle = 'rgba(20,40,10,.5)';
                x.lineWidth = 0.18;
                for (let q = 0.2; q < 1; q += 0.12) { x.beginPath(); x.moveTo(R * q, 0); x.lineTo(R * q + R * 0.06, R * 0.1); x.moveTo(R * q, 0); x.lineTo(R * q + R * 0.06, -R * 0.1); x.stroke(); }
            }
            x.fillStyle = '#4a3418';
            x.beginPath();
            x.arc(0, 0, R * 0.1, 0, 7);
            x.fill();
            x.restore();
        }

        mark('houses');
        // 8) Atmosphäre: warmes Sonnenlicht, leichter Dunst, Vignette
        const sun = x.createLinearGradient(0, 0, W, H);
        sun.addColorStop(0, 'rgba(255,236,190,.09)');
        sun.addColorStop(1, 'rgba(10,20,40,.12)');
        x.fillStyle = sun;
        x.fillRect(0, 0, W, H);
        const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.78);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,.32)');
        x.fillStyle = vg;
        x.fillRect(0, 0, W, H);
        x.restore();
        mark('end');
        c._tm = TM.map((q, i) => (i ? `${q[0]}:${q[1] - TM[i - 1][1]}` : '')).join(' ');
        return c;
    }

    // =====================================================================
    // FABRIK: Lagerhalle (Frontansicht)
    // =====================================================================
    function cylinderShade(x, X0, Y0, w, h, base, opts = {}) {
        // spaltenweise Licht auf einer runden Oberfläche, mit Glanzlicht
        for (let i = 0; i < w; i += 0.5) {
            const t = (i / w) * 2 - 1; // -1..1
            const nx = t;
            const nz = Math.sqrt(Math.max(0, 1 - t * t));
            const diff = Math.max(0, nx * -0.55 + nz * 0.83);
            const spec = Math.pow(Math.max(0, nx * -0.3 + nz * 0.95), 60) * (opts.spec ?? 0.45);
            const l = 0.16 + diff * 0.7;
            x.fillStyle = `rgb(${Math.min(255, base[0] * l + spec * 255)},${Math.min(255, base[1] * l + spec * 255)},${Math.min(255, base[2] * l + spec * 255)})`;
            x.fillRect(X0 + i, Y0, 0.6, h);
        }
    }
    function plant(L, pxW) {
        const W = 800;
        const H = L.HH;
        const k = Math.min(2.6, pxW / W);
        const c = canvas(W * k, H * k);
        const x = c.getContext('2d');
        const r = rng(4242);
        x.scale(k, k);
        // 1) Wand: Betonplatten mit Fugen, Flecken, Laufspuren
        const wc = canvas(W * k, H * k);
        const wx = wc.getContext('2d');
        const wi = wx.createImageData(wc.width, wc.height);
        const s = 1 / k;
        for (let yy = 0; yy < wc.height; yy++) {
            for (let xx = 0; xx < wc.width; xx++) {
                const u = xx * s;
                const v = yy * s;
                const n = fbm(u * 0.05, v * 0.05, 3);
                const streak = fbm(u * 0.4, v * 0.012, 2);
                let g = 46 + n * 30 + (streak - 0.5) * 16 + (r() - 0.5) * 7;
                const top = clamp01(1 - v / (L.by + 40));
                g *= 0.75 + top * 0.25;
                const i = (yy * wc.width + xx) * 4;
                wi.data[i] = g;
                wi.data[i + 1] = g + 2;
                wi.data[i + 2] = g + 6;
                wi.data[i + 3] = 255;
            }
        }
        wx.putImageData(wi, 0, 0);
        x.drawImage(wc, 0, 0, W, H);
        x.strokeStyle = 'rgba(0,0,0,.35)';
        x.lineWidth = 1;
        for (let yy = 60; yy < L.by + 50; yy += 70) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
        for (let xx = 0; xx < W; xx += 120) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, L.by + 50); x.stroke(); }
        x.strokeStyle = 'rgba(255,255,255,.05)';
        for (let yy = 61; yy < L.by + 50; yy += 70) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
        // Oberlichter
        for (let xx = 40; xx < W; xx += 160) {
            const g = x.createLinearGradient(0, 10, 0, 34);
            g.addColorStop(0, '#9fb6cc');
            g.addColorStop(1, '#4a5b6e');
            x.fillStyle = '#1a1f27';
            x.fillRect(xx - 2, 8, 84, 30);
            x.fillStyle = g;
            x.fillRect(xx, 10, 80, 26);
            x.fillStyle = '#1a1f27';
            for (let m = 1; m < 4; m++) x.fillRect(xx + m * 20 - 1, 10, 2, 26);
        }
        // Stahlträger (Doppel-T) mit Schattierung
        for (let xx = 0; xx <= W; xx += 200) {
            const g = x.createLinearGradient(xx - 8, 0, xx + 8, 0);
            g.addColorStop(0, '#20262f');
            g.addColorStop(0.35, '#59636f');
            g.addColorStop(0.6, '#3a424d');
            g.addColorStop(1, '#161a20');
            x.fillStyle = g;
            x.fillRect(xx - 8, 0, 16, L.by + 50);
            x.fillStyle = 'rgba(0,0,0,.3)';
            x.fillRect(xx + 8, 0, 6, L.by + 50);
            x.fillStyle = '#606b78';
            for (let yy = 30; yy < L.by + 40; yy += 46) { x.beginPath(); x.arc(xx - 4, yy, 1, 0, 7); x.arc(xx + 4, yy, 1, 0, 7); x.fill(); }
        }
        // Dachbinder (Fachwerk)
        x.strokeStyle = '#2a313b';
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(0, 4);
        x.lineTo(W, 4);
        x.stroke();
        x.lineWidth = 1.6;
        for (let xx = 0; xx < W; xx += 40) { x.beginPath(); x.moveTo(xx, 4); x.lineTo(xx + 20, 44); x.lineTo(xx + 40, 4); x.stroke(); }
        x.beginPath();
        x.moveTo(0, 44);
        x.lineTo(W, 44);
        x.stroke();
        // 2) Boden: geschliffener Beton mit Spiegelungen, gelbe Sicherheitslinien, Ölflecken
        const fy = L.by + 50;
        const fg = x.createLinearGradient(0, fy, 0, H);
        fg.addColorStop(0, '#2b3038');
        fg.addColorStop(1, '#1a1e24');
        x.fillStyle = fg;
        x.fillRect(0, fy, W, H - fy);
        for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.08)'; x.fillRect(r() * W, fy + r() * (H - fy), 0.7, 0.7); }
        for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(10,8,6,.25)'; x.beginPath(); x.ellipse(r() * W, fy + 10 + r() * Math.max(1, H - fy - 20), 8 + r() * 14, 3 + r() * 4, 0, 0, 7); x.fill(); }
        x.fillStyle = '#d9a21b';
        x.fillRect(0, fy + 4, W, 2.5);
        x.fillRect(0, H - 12, W, 2.5);
        // Lichtkegel (Lampen) – additiv
        x.globalCompositeOperation = 'lighter';
        for (const lx of [120, 300, 500, 680]) {
            const g = x.createLinearGradient(0, 40, 0, H);
            g.addColorStop(0, 'rgba(255,225,160,.20)');
            g.addColorStop(1, 'rgba(255,225,160,0)');
            x.fillStyle = g;
            x.beginPath();
            x.moveTo(lx - 22, 48);
            x.lineTo(lx - 130, H);
            x.lineTo(lx + 130, H);
            x.lineTo(lx + 22, 48);
            x.fill();
            const pool = x.createRadialGradient(lx, H - 30, 4, lx, H - 30, 150);
            pool.addColorStop(0, 'rgba(255,220,150,.16)');
            pool.addColorStop(1, 'rgba(255,220,150,0)');
            x.fillStyle = pool;
            x.fillRect(lx - 160, fy, 320, H - fy);
            for (let d = 0; d < 40; d++) { x.fillStyle = 'rgba(255,240,200,.35)'; const t = r(); x.fillRect(lx + (r() - 0.5) * (40 + t * 220), 50 + t * (H - 60), 0.6, 0.6); }
        }
        x.globalCompositeOperation = 'source-over';
        for (const lx of [120, 300, 500, 680]) {
            x.fillStyle = '#20262e';
            x.fillRect(lx - 26, 40, 52, 8);
            const g = x.createLinearGradient(0, 46, 0, 50);
            g.addColorStop(0, '#fff6d8');
            g.addColorStop(1, '#ffd27a');
            x.fillStyle = g;
            x.fillRect(lx - 22, 46, 44, 3);
        }
        // 3) Rohre (hinter den Silos): runde Schattierung, Flansche, Ventil
        const pipe = (x1, y1, x2, y2, d) => {
            const vert = x1 === x2;
            if (vert) cylinderShade(x, x1 - d / 2, Math.min(y1, y2), d, Math.abs(y2 - y1), [120, 128, 140], { spec: 0.6 });
            else {
                for (let i = 0; i < d; i += 0.5) {
                    const t = (i / d) * 2 - 1;
                    const nz = Math.sqrt(Math.max(0, 1 - t * t));
                    const l = 0.25 + Math.max(0, -t * 0.6 + nz * 0.8) * 0.75;
                    x.fillStyle = `rgb(${120 * l},${128 * l},${140 * l})`;
                    x.fillRect(Math.min(x1, x2), y1 - d / 2 + i, Math.abs(x2 - x1), 0.6);
                }
            }
        };
        for (const sl of L.drops) pipe(sl[0], sl[1], sl[0], L.pipeY, 6);
        if (L.xb > L.xa) pipe(L.xa, L.pipeY, L.xb, L.pipeY, 7);
        pipe(400, L.pipeY, 400, L.by + 4, 7);
        // Ventil mit rotem Handrad
        x.fillStyle = '#8f1d1d';
        x.beginPath();
        x.arc(400, (L.pipeY + L.by) / 2, 6, 0, 7);
        x.fill();
        x.strokeStyle = '#d24a3a';
        x.lineWidth = 1.4;
        x.beginPath();
        x.arc(400, (L.pipeY + L.by) / 2, 6, 0, 7);
        x.stroke();
        // 4) Silos
        for (const S of L.silos) {
            x.save();
            x.translate(S.x, S.y);
            x.scale(S.s, S.s);
            const w = 64;
            // Schatten an der Wand und am Boden
            x.fillStyle = 'rgba(0,0,0,.35)';
            x.beginPath();
            x.ellipse(w / 2 + 10, 60, w / 2 + 4, 62, 0, 0, 7);
            x.fill();
            x.fillStyle = 'rgba(0,0,0,.5)';
            x.beginPath();
            x.ellipse(w / 2 + 3, 124, w / 2 + 8, 5, 0, 0, 7);
            x.fill();
            // Stützen mit Diagonalverband
            x.strokeStyle = '#3c444f';
            x.lineWidth = 3.4;
            x.beginPath();
            x.moveTo(6, 98); x.lineTo(3, 124);
            x.moveTo(w - 6, 98); x.lineTo(w - 3, 124);
            x.moveTo(w / 2, 108); x.lineTo(w / 2, 124);
            x.stroke();
            x.lineWidth = 1.2;
            x.strokeStyle = '#2a3038';
            x.beginPath();
            x.moveTo(5, 108); x.lineTo(w - 5, 120);
            x.moveTo(w - 5, 108); x.lineTo(5, 120);
            x.stroke();
            // Auslauf-Kegel
            x.save();
            x.beginPath();
            x.moveTo(0, 96); x.lineTo(w / 2 - 7, 112); x.lineTo(w / 2 + 7, 112); x.lineTo(w, 96); x.closePath();
            x.clip();
            cylinderShade(x, 0, 96, w, 17, [128, 136, 148]);
            x.restore();
            // Körper: Zylinder mit gebürstetem Metall
            x.save();
            const body = new Path2D();
            body.roundRect ? body.roundRect(0, 0, w, 100, 6) : body.rect(0, 0, w, 100);
            x.clip(body);
            cylinderShade(x, 0, 0, w, 100, [150, 158, 170]);
            for (let i = 0; i < 260; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'; x.fillRect(r() * w, r() * 100, 0.35, 4 + r() * 18); }
            // Rost- und Wasserlaufspuren
            const rr = rng(S.i * 31 + 7);
            const rustN = S.kind === 'open' ? 6 : 3;
            for (let i = 0; i < rustN; i++) {
                const rx = rr() * w;
                const ry = 20 + rr() * 70;
                const g = x.createLinearGradient(0, ry - 4, 0, ry + 26);
                g.addColorStop(0, 'rgba(140,70,30,.45)');
                g.addColorStop(1, 'rgba(140,70,30,0)');
                x.fillStyle = g;
                x.fillRect(rx, ry - 4, 1.4 + rr() * 2.5, 30);
            }
            // Schweissnähte (Ringe) mit Licht oben, Schatten unten
            for (const sy of [24, 50, 76]) {
                x.fillStyle = 'rgba(0,0,0,.45)';
                x.fillRect(0, sy, w, 1.4);
                x.fillStyle = 'rgba(255,255,255,.22)';
                x.fillRect(0, sy + 1.4, w, 0.7);
                for (let q = 4; q < w; q += 6) {
                    const lit = 1 - Math.abs((q / w) * 2 - 0.7);
                    x.fillStyle = `rgba(${200 + lit * 55},${205 + lit * 50},${215 + lit * 40},${0.5 + lit * 0.4})`;
                    x.beginPath();
                    x.arc(q, sy - 1.6, 0.7, 0, 7);
                    x.fill();
                }
            }
            // Sichtfenster mit Füllstand (Kakaobohnen)
            const gx = w * 0.62;
            x.fillStyle = '#0b0e12';
            x.fillRect(gx - 0.8, 8, 7.6, 86);
            if (S.kind === 'deal' || S.kind === 'fut') {
                const fill = 80;
                const g = x.createLinearGradient(gx, 0, gx + 6, 0);
                g.addColorStop(0, '#5a3214');
                g.addColorStop(0.5, '#a0642c');
                g.addColorStop(1, '#4a2810');
                x.fillStyle = g;
                x.fillRect(gx, 92 - fill, 6, fill);
                for (let i = 0; i < 70; i++) { x.fillStyle = rr() < 0.5 ? 'rgba(40,18,6,.6)' : 'rgba(200,130,70,.4)'; x.fillRect(gx + rr() * 5.4, 92 - fill + rr() * fill, 1, 0.7); }
            }
            x.fillStyle = 'rgba(255,255,255,.28)';
            x.fillRect(gx + 0.6, 9, 1, 84);
            x.strokeStyle = '#7d8896';
            x.lineWidth = 0.8;
            x.strokeRect(gx - 0.8, 8, 7.6, 86);
            for (let q = 14; q < 92; q += 8) { x.fillStyle = '#c9d2dc'; x.fillRect(gx - 3, q, 2, 0.5); }
            // Farbband: Vertrag blau, Future gold
            if (S.kind === 'deal' || S.kind === 'fut') {
                const col = S.kind === 'deal' ? [40, 100, 210] : [220, 150, 30];
                x.save();
                x.beginPath();
                x.rect(0, 52, w, 9);
                x.clip();
                cylinderShade(x, 0, 52, w, 9, col, { spec: 0.5 });
                x.restore();
            }
            x.restore();
            // Dach-Kuppel
            const dg = x.createRadialGradient(w * 0.35, -4, 2, w / 2, 2, w * 0.6);
            dg.addColorStop(0, '#e6ebf1');
            dg.addColorStop(0.5, '#8d97a4');
            dg.addColorStop(1, '#3a424c');
            x.fillStyle = dg;
            x.beginPath();
            x.ellipse(w / 2, 2, w / 2, 9, 0, Math.PI, 0);
            x.lineTo(w, 4);
            x.ellipse(w / 2, 4, w / 2, 3, 0, 0, Math.PI);
            x.fill();
            x.fillStyle = '#4b5562';
            x.beginPath();
            x.ellipse(w / 2, -4, 9, 3, 0, 0, 7);
            x.fill();
            x.fillStyle = '#9aa5b2';
            x.fillRect(w / 2 - 4, -12, 8, 8);
            // Leiter mit Rückenschutz
            x.strokeStyle = '#59636f';
            x.lineWidth = 1;
            x.beginPath();
            x.moveTo(w + 2, -2); x.lineTo(w + 2, 98);
            x.moveTo(w + 7, -2); x.lineTo(w + 7, 98);
            for (let q = 2; q < 98; q += 5) { x.moveTo(w + 2, q); x.lineTo(w + 7, q); }
            x.stroke();
            x.strokeStyle = 'rgba(120,132,146,.7)';
            for (let q = 10; q < 90; q += 14) { x.beginPath(); x.ellipse(w + 4.5, q, 5.5, 2, 0, Math.PI, 0); x.stroke(); }
            // Typenschild
            x.fillStyle = '#0e131a';
            x.fillRect(w / 2 - 15, 80, 30, 11);
            x.strokeStyle = '#8d97a4';
            x.lineWidth = 0.6;
            x.strokeRect(w / 2 - 15, 80, 30, 11);
            x.restore();
        }
        // 5) Förderband-Gestell und Maschine (statische Teile)
        const by = L.by;
        x.fillStyle = '#1b2027';
        for (let xx = 60; xx < 760; xx += 70) { x.fillRect(xx, by + 80, 4, fy - by - 80 + 6); }
        const bg = x.createLinearGradient(0, by + 64, 0, by + 82);
        bg.addColorStop(0, '#3a414b');
        bg.addColorStop(0.5, '#151a20');
        bg.addColorStop(1, '#2a3038');
        x.fillStyle = bg;
        x.fillRect(36, by + 64, 728, 18);
        x.fillStyle = '#0d1014';
        x.fillRect(40, by + 66, 720, 4);
        const mg = x.createLinearGradient(0, by + 2, 0, by + 64);
        mg.addColorStop(0, '#6b7684');
        mg.addColorStop(0.15, '#4a5462');
        mg.addColorStop(1, '#262c35');
        x.fillStyle = 'rgba(0,0,0,.4)';
        x.fillRect(326, by + 8, 164, 60);
        x.fillStyle = mg;
        x.fillRect(318, by + 2, 164, 60);
        x.strokeStyle = '#ff9f1c';
        x.lineWidth = 1.5;
        x.strokeRect(318, by + 2, 164, 60);
        for (let q = 0; q < 6; q++) { x.fillStyle = '#1a1f26'; x.fillRect(430 + q * 6, by + 40, 3, 16); }
        x.fillStyle = 'rgba(255,255,255,.12)';
        x.fillRect(318, by + 2, 164, 2);
        return c;
    }


    return { farm, plant };
})();

// Als Web Worker: Auftrag annehmen, Bild rechnen, als JPEG zurückschicken
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = async e => {
        const { id, type, L, pxW } = e.data;
        try {
            const t0 = Date.now();
            const c = RenderCore[type](L, pxW);
            const tm = c._tm;
            const bmp = c.transferToImageBitmap();
            self.postMessage({ id, bmp, ms: Date.now() - t0, tm }, [bmp]);
        } catch (err) {
            self.postMessage({ id, err: String((err && err.stack) || err) });
        }
    };
}
