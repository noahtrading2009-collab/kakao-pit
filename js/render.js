// ===== KAKAO PIT – Bild-Renderer für die Leitstände =====
// Landschaft der Kooperative (Luftbild) und Lagerhalle der Fabrik werden Pixel für Pixel
// im Browser gerechnet: Licht von links oben, Schatten, Materialien, tausende Einzelbäume.
// Das Bild wird einmal pro Zustand berechnet, zwischengespeichert und als <image> ins SVG gelegt.

const Render = (() => {
    const cache = new Map();
    const LIGHT = { x: -0.6, y: -0.8 }; // Sonne links oben

    // ---------- Zufall & Rauschen (deterministisch, damit das Bild stabil bleibt) ----------
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
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

    // Pfad abtasten (SVG-Pfadsyntax) → Punkte, für Abstandsprüfungen
    function samplePath(d, step = 6) {
        const host = document.getElementById('tex-defs') || document.body.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        host.appendChild(p);
        const L = p.getTotalLength();
        const pts = [];
        for (let s = 0; s <= L; s += step) { const q = p.getPointAtLength(s); pts.push([q.x, q.y]); }
        p.remove();
        return pts;
    }
    const near = (pts, x, y, r) => pts.some(([px, py]) => (px - x) * (px - x) + (py - y) * (py - y) < r * r);

    // ---------- Sprites: Baumkronen mit Licht und Blattstruktur ----------
    const sprites = {};
    function treeSprite(R, hue, seed) {
        const key = `${R}|${hue.join(',')}|${seed}`;
        if (sprites[key]) return sprites[key];
        const S = Math.ceil(R * 2.6);
        const c = canvas(S, S);
        const x = c.getContext('2d');
        const r = rng(seed);
        const cx = S / 2;
        const cy = S / 2;
        // Kronen-Unterseite (dunkel)
        x.fillStyle = `rgb(${hue[0] * 0.45},${hue[1] * 0.45},${hue[2] * 0.45})`;
        x.beginPath();
        x.arc(cx + R * 0.08, cy + R * 0.08, R, 0, Math.PI * 2);
        x.fill();
        // viele Blattbüschel, oben links heller
        const n = Math.round(10 + R * 1.2);
        for (let i = 0; i < n; i++) {
            const a = r() * Math.PI * 2;
            const d = Math.sqrt(r()) * R * 0.72;
            const bx = cx + Math.cos(a) * d;
            const by = cy + Math.sin(a) * d;
            const br = R * (0.28 + r() * 0.3);
            const lit = clamp01(0.5 + (-(bx - cx) - (by - cy)) / (2 * R));
            const g = x.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
            const k1 = 0.75 + lit * 0.6;
            const k2 = 0.35 + lit * 0.25;
            g.addColorStop(0, `rgb(${Math.min(255, hue[0] * k1 + 18)},${Math.min(255, hue[1] * k1 + 22)},${Math.min(255, hue[2] * k1 + 8)})`);
            g.addColorStop(1, `rgb(${hue[0] * k2},${hue[1] * k2},${hue[2] * k2})`);
            x.fillStyle = g;
            x.beginPath();
            x.arc(bx, by, br, 0, Math.PI * 2);
            x.fill();
        }
        // feine Blattsprenkel
        for (let i = 0; i < Math.min(160, R * R * 0.35); i++) {
            const a = r() * Math.PI * 2;
            const d = Math.sqrt(r()) * R * 0.95;
            x.fillStyle = r() < 0.5 ? 'rgba(210,255,160,.18)' : 'rgba(0,20,0,.22)';
            x.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.9, 0.9);
        }
        sprites[key] = c;
        return c;
    }
    function shadowSprite(R) {
        const key = `sh${R}`;
        if (sprites[key]) return sprites[key];
        const S = Math.ceil(R * 3);
        const c = canvas(S, S);
        const x = c.getContext('2d');
        const g = x.createRadialGradient(S / 2, S / 2, R * 0.4, S / 2, S / 2, R * 1.25);
        g.addColorStop(0, 'rgba(0,0,0,.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, S, S);
        sprites[key] = c;
        return c;
    }
    // Sprites werden in Pixel-Auflösung gerechnet (R·k) und in Einheiten gezeichnet – nie unscharf
    let SK = 1;
    function drawTree(x, px, py, R, hue, seed) {
        const Rp = Math.max(2, Math.round(R * SK));
        const hq = hue;
        const sh = shadowSprite(Rp);
        x.drawImage(sh, px - sh.width / SK / 2 + R * 0.55, py - sh.height / SK / 2 + R * 0.7, sh.width / SK, sh.height / SK);
        const t = treeSprite(Rp, hq, seed);
        x.drawImage(t, px - t.width / SK / 2, py - t.height / SK / 2, t.width / SK, t.height / SK);
    }
    function palm(x, px, py, R, r) {
        x.save();
        x.translate(px + R * 0.6, py + R * 0.7);
        x.fillStyle = 'rgba(0,0,0,.35)';
        for (let i = 0; i < 9; i++) { x.rotate((Math.PI * 2) / 9); x.beginPath(); x.ellipse(R * 0.5, 0, R * 0.55, R * 0.12, 0, 0, Math.PI * 2); x.fill(); }
        x.restore();
        x.save();
        x.translate(px, py);
        for (let i = 0; i < 9; i++) {
            x.rotate((Math.PI * 2) / 9 + (r() - 0.5) * 0.2);
            const g = x.createLinearGradient(0, 0, R, 0);
            g.addColorStop(0, '#2f5e1f');
            g.addColorStop(1, '#7fb84a');
            x.fillStyle = g;
            x.beginPath();
            x.ellipse(R * 0.5, 0, R * 0.55, R * 0.13, 0, 0, Math.PI * 2);
            x.fill();
            x.strokeStyle = 'rgba(20,40,10,.5)';
            x.lineWidth = 0.4;
            x.beginPath();
            x.moveTo(0, 0);
            x.lineTo(R, 0);
            x.stroke();
        }
        x.fillStyle = '#5a4020';
        x.beginPath();
        x.arc(0, 0, R * 0.12, 0, Math.PI * 2);
        x.fill();
        x.restore();
    }

    // ---------- Asynchron rechnen, Ergebnis als Blob-URL zwischenspeichern ----------
    function get(key, paint, done) {
        const hit = cache.get(key);
        if (hit && hit.url) return hit.url;
        if (hit) return null;
        cache.set(key, { url: null });
        setTimeout(() => {
            try {
                const c = paint();
                c.toBlob(b => {
                    if (!b) return;
                    cache.set(key, { url: URL.createObjectURL(b) });
                    if (cache.size > 12) { const first = cache.keys().next().value; const v = cache.get(first); if (v && v.url) URL.revokeObjectURL(v.url); cache.delete(first); }
                    done && done();
                }, 'image/jpeg', 0.93);
            } catch (e) { console.warn('Render', e); }
        }, 30);
        return null;
    }

    // =====================================================================
    // KOOPERATIVE: Luftbild
    // L = { VH, villages:[[x,y]], fields:[[x,y,w,h,rot]], river:'d', road:'d', sky }
    // =====================================================================
    function farm(L, pxW) {
        const W = 800;
        const H = L.VH;
        const k = Math.min(3.2, pxW / W);
        SK = k;
        const PW = Math.round(W * k);
        const PH = Math.round(H * k);
        const c = canvas(PW, PH);
        const x = c.getContext('2d');
        const r = rng(77);
        const pal = {
            sun: [[60, 104, 40], [98, 134, 58], [150, 132, 82]],
            drought: [[110, 112, 52], [150, 140, 76], [186, 156, 98]],
            rain: [[40, 96, 40], [70, 126, 52], [120, 120, 76]],
            blackpod: [[56, 84, 44], [86, 108, 60], [120, 112, 80]],
            record: [[48, 112, 40], [86, 148, 56], [140, 136, 80]],
        }[L.sky] || [[60, 104, 40], [98, 134, 58], [150, 132, 82]];
        // 1) Gelände (halbe Auflösung, weich hochskaliert)
        const tw = Math.ceil(PW / 3);
        const th = Math.ceil(PH / 3);
        const tc = canvas(tw, th);
        const tx = tc.getContext('2d');
        const img = tx.createImageData(tw, th);
        const hgt = new Float32Array(tw * th);
        const sc = 3 / k;
        for (let yy = 0; yy < th; yy++) for (let xx = 0; xx < tw; xx++) hgt[yy * tw + xx] = fbm(xx * sc * 0.009, yy * sc * 0.009, 4);
        for (let yy = 0; yy < th; yy++) {
            for (let xx = 0; xx < tw; xx++) {
                const i = yy * tw + xx;
                const u = xx * sc;
                const v = yy * sc;
                const h = hgt[i];
                const hx = hgt[yy * tw + Math.min(tw - 1, xx + 1)] - hgt[yy * tw + Math.max(0, xx - 1)];
                const hy = hgt[Math.min(th - 1, yy + 1) * tw + xx] - hgt[Math.max(0, yy - 1) * tw + xx];
                const shade = 1 + (hx * LIGHT.x + hy * LIGHT.y) * -55;
                const m = clamp01((fbm(u * 0.022 + 40, v * 0.022, 3) - 0.3) / 0.42);
                const d = vn(u * 0.25, v * 0.25);
                let R = mix(pal[0][0], pal[1][0], m);
                let G = mix(pal[0][1], pal[1][1], m);
                let B = mix(pal[0][2], pal[1][2], m);
                if (m > 0.72) { const q = clamp01((m - 0.72) * 3); R = mix(R, pal[2][0], q); G = mix(G, pal[2][1], q); B = mix(B, pal[2][2], q); }
                if (h < 0.44) { const q = clamp01((0.44 - h) * 5); R = mix(R, 30, q * 0.8); G = mix(G, 62, q * 0.8); B = mix(B, 30, q * 0.8); }
                const det = (d - 0.5) * 34 + (r() - 0.5) * 10;
                img.data[i * 4] = R * shade + det;
                img.data[i * 4 + 1] = G * shade + det;
                img.data[i * 4 + 2] = B * shade + det * 0.6;
                img.data[i * 4 + 3] = 255;
            }
        }
        tx.putImageData(img, 0, 0);
        x.imageSmoothingQuality = 'high';
        x.drawImage(tc, 0, 0, PW, PH);
        // Feine Bodenstruktur in voller Auflösung (gekachelt, Overlay)
        const dc = canvas(256, 256);
        const dx = dc.getContext('2d');
        const di = dx.createImageData(256, 256);
        for (let q = 0; q < 256 * 256; q++) {
            const qx = q % 256;
            const qy = (q / 256) | 0;
            const v = 128 + (vn(qx * 0.18, qy * 0.18) - 0.5) * 120 + (vn(qx * 0.7 + 50, qy * 0.7) - 0.5) * 70 + (r() - 0.5) * 60;
            di.data[q * 4] = v; di.data[q * 4 + 1] = v; di.data[q * 4 + 2] = v; di.data[q * 4 + 3] = 255;
        }
        dx.putImageData(di, 0, 0);
        x.save();
        x.globalCompositeOperation = 'overlay';
        x.globalAlpha = 0.55;
        x.fillStyle = x.createPattern(dc, 'repeat');
        x.fillRect(0, 0, PW, PH);
        x.restore();
        // Grashalme
        for (let i = 0; i < PW * PH * 0.02; i++) {
            const px = r() * PW;
            const py = r() * PH;
            x.fillStyle = r() < 0.5 ? 'rgba(190,230,120,.10)' : 'rgba(10,30,5,.14)';
            x.fillRect(px, py, k * 0.6, k * 1.4);
        }
        x.save();
        x.scale(k, k);
        const river = samplePath(L.river, 5);
        const road = samplePath(L.road, 5);
        // 2) Strasse (rote Lateriterde) mit Fahrspuren
        const roadP = new Path2D(L.road);
        x.lineCap = 'round';
        x.lineJoin = 'round';
        x.strokeStyle = 'rgba(60,40,20,.35)';
        x.lineWidth = 13;
        x.stroke(roadP);
        x.strokeStyle = '#a8653a';
        x.lineWidth = 10;
        x.stroke(roadP);
        x.strokeStyle = 'rgba(80,40,18,.45)';
        x.lineWidth = 1.2;
        x.setLineDash([]);
        x.save(); x.translate(0, -2); x.stroke(roadP); x.restore();
        x.save(); x.translate(0, 2); x.stroke(roadP); x.restore();
        x.strokeStyle = 'rgba(230,170,120,.25)';
        x.lineWidth = 3;
        x.stroke(roadP);
        // 3) Felder: Erde mit Furchen und Kakaobäume in Reihen
        for (const [fx, fy, fw, fh, rot] of L.fields) {
            x.save();
            x.translate(fx + fw / 2, fy + fh / 2);
            x.rotate((rot * Math.PI) / 180);
            const g = x.createLinearGradient(-fw / 2, -fh / 2, fw / 2, fh / 2);
            g.addColorStop(0, '#7a5534');
            g.addColorStop(1, '#5e3f25');
            x.fillStyle = g;
            x.fillRect(-fw / 2, -fh / 2, fw, fh);
            x.strokeStyle = 'rgba(40,24,10,.35)';
            x.lineWidth = 0.6;
            for (let yy = -fh / 2 + 2; yy < fh / 2; yy += 2.2) { x.beginPath(); x.moveTo(-fw / 2, yy); x.lineTo(fw / 2, yy); x.stroke(); }
            // Graskante
            x.strokeStyle = 'rgba(40,70,25,.8)';
            x.lineWidth = 1.6;
            x.strokeRect(-fw / 2, -fh / 2, fw, fh);
            const sp = 6.2;
            for (let yy = -fh / 2 + sp / 2; yy < fh / 2; yy += sp) {
                for (let xx = -fw / 2 + sp / 2; xx < fw / 2; xx += sp) {
                    if (r() < 0.06) continue;
                    const Rr = 2.5 + r() * 0.8;
                    const v = (r() * 3) | 0;
                    drawTree(x, xx + (r() - 0.5) * 0.8, yy + (r() - 0.5) * 0.8, Rr, [[60, 114, 40], [70, 126, 44], [54, 104, 38]][v], v);
                }
            }
            x.restore();
        }
        // 4) Fluss: Ufer, Wasser mit Tiefe und Lichtreflexen
        const riverP = new Path2D(L.river);
        x.strokeStyle = 'rgba(80,62,36,.9)';
        x.lineWidth = 24;
        x.stroke(riverP);
        x.strokeStyle = '#8c7650';
        x.lineWidth = 19;
        x.stroke(riverP);
        x.strokeStyle = '#2d5a6e';
        x.lineWidth = 14;
        x.stroke(riverP);
        x.strokeStyle = '#3d7a8c';
        x.lineWidth = 9;
        x.stroke(riverP);
        x.strokeStyle = 'rgba(120,180,200,.5)';
        x.lineWidth = 3;
        x.stroke(riverP);
        x.setLineDash([2, 9, 5, 14]);
        x.strokeStyle = 'rgba(230,245,255,.45)';
        x.lineWidth = 0.8;
        x.save(); x.translate(-1.5, -1.5); x.stroke(riverP); x.restore();
        x.setLineDash([]);
        // 5) Dörfer: Lehmplatz, Wellblechdächer von oben, Trockentische mit Bohnen, Palmen, Pfade
        const homes = L.villages;
        for (const [vx, vy] of homes) {
            // Pfad zur Strasse
            let best = road[0];
            for (const q of road) if ((q[0] - vx) ** 2 + (q[1] - vy) ** 2 < (best[0] - vx) ** 2 + (best[1] - vy) ** 2) best = q;
            // gewundener Trampelpfad
            const pts = [[vx, vy]];
            const steps = 8;
            for (let q = 1; q < steps; q++) {
                const t = q / steps;
                pts.push([vx + (best[0] - vx) * t + Math.sin(t * Math.PI * 2 + vx) * 10 + (r() - 0.5) * 6, vy + (best[1] - vy) * t + (r() - 0.5) * 4]);
            }
            pts.push(best);
            x.lineCap = 'round';
            x.lineJoin = 'round';
            for (const [lw, col] of [[3, 'rgba(70,45,25,.35)'], [1.8, 'rgba(176,118,74,.8)']]) {
                x.strokeStyle = col;
                x.lineWidth = lw;
                x.beginPath();
                x.moveTo(pts[0][0], pts[0][1]);
                for (let q = 1; q < pts.length - 1; q++) x.quadraticCurveTo(pts[q][0], pts[q][1], (pts[q][0] + pts[q + 1][0]) / 2, (pts[q][1] + pts[q + 1][1]) / 2);
                x.lineTo(best[0], best[1]);
                x.stroke();
            }
            // Lehmplatz
            const g = x.createRadialGradient(vx, vy, 4, vx, vy, 36);
            g.addColorStop(0, 'rgba(176,118,74,.95)');
            g.addColorStop(0.7, 'rgba(150,104,64,.7)');
            g.addColorStop(1, 'rgba(150,104,64,0)');
            x.fillStyle = g;
            x.beginPath();
            x.ellipse(vx, vy, 40, 26, 0, 0, Math.PI * 2);
            x.fill();
        }
        // Wald: viele Einzelbäume, nicht auf Feldern, Wegen, Fluss oder Dörfern
        const inField = (px, py) => L.fields.some(([fx, fy, fw, fh, rot]) => {
            const a = (-rot * Math.PI) / 180;
            const dx = px - (fx + fw / 2);
            const dy = py - (fy + fh / 2);
            const qx = dx * Math.cos(a) - dy * Math.sin(a);
            const qy = dx * Math.sin(a) + dy * Math.cos(a);
            return Math.abs(qx) < fw / 2 + 4 && Math.abs(qy) < fh / 2 + 4;
        });
        const trees = [];
        for (let i = 0; i < 4200; i++) {
            const px = r() * W;
            const py = r() * H;
            const dens = fbm(px * 0.012 + 9, py * 0.012, 3);
            if (dens < 0.47 && r() > 0.12) continue;
            if (inField(px, py) || near(river, px, py, 16) || near(road, px, py, 9) || homes.some(([vx, vy]) => (vx - px) ** 2 + ((vy - py) * 1.5) ** 2 < 46 * 46)) continue;
            trees.push([px, py, 3 + r() * 4.5 + (dens > 0.6 ? 2 : 0), (r() * 4) | 0]);
        }
        trees.sort((a, b) => a[1] - b[1]);
        const greens = [[46, 96, 38], [58, 110, 42], [40, 86, 34], [70, 118, 46]];
        for (const [px, py, R, s] of trees) drawTree(x, px, py, R, greens[s % 4], s);
        // Häuser
        for (let vi = 0; vi < homes.length; vi++) {
            const [vx, vy] = homes[vi];
            const rr = rng(1000 + vi);
            for (let j = 0; j < 2; j++) {
                const mx = vx - 26 + rr() * 10 + j * 30;
                const my = vy + 8 + rr() * 6;
                x.fillStyle = 'rgba(0,0,0,.3)';
                x.fillRect(mx + 1.5, my + 1.5, 11, 6);
                x.fillStyle = '#4a2a16';
                x.fillRect(mx, my, 11, 6);
                for (let b = 0; b < 30; b++) { x.fillStyle = rr() < 0.5 ? '#7a4524' : '#9a5a30'; x.fillRect(mx + 0.6 + rr() * 9.8, my + 0.6 + rr() * 4.8, 0.9, 0.6); }
            }
            const nh = 4 + Math.floor(rr() * 3);
            for (let j = 0; j < nh; j++) {
                const a = (j / nh) * Math.PI * 2 + rr() * 0.6;
                const d = 8 + rr() * 12;
                const hx = vx + Math.cos(a) * d * 1.3;
                const hy = vy + Math.sin(a) * d * 0.8 - 4;
                const hw = 9 + rr() * 5;
                const hh = 6 + rr() * 3;
                const rot = (rr() - 0.5) * 0.9;
                const rust = rr() < 0.35;
                x.save();
                x.translate(hx, hy);
                x.rotate(rot);
                // Schlagschatten
                x.fillStyle = 'rgba(0,0,0,.4)';
                x.fillRect(-hw / 2 + 2.2, -hh / 2 + 2.6, hw, hh);
                // Dach: zwei Flächen, Wellen quer, First in der Mitte
                const top = rust ? ['#b07a4e', '#8a5636'] : ['#c4ccd4', '#8e98a3'];
                x.fillStyle = top[0];
                x.fillRect(-hw / 2, -hh / 2, hw, hh / 2);
                x.fillStyle = top[1];
                x.fillRect(-hw / 2, 0, hw, hh / 2);
                x.strokeStyle = rust ? 'rgba(60,30,12,.45)' : 'rgba(60,66,74,.45)';
                x.lineWidth = 0.25;
                for (let q = -hw / 2 + 0.6; q < hw / 2; q += 0.75) { x.beginPath(); x.moveTo(q, -hh / 2); x.lineTo(q, hh / 2); x.stroke(); }
                if (!rust && rr() < 0.5) { x.fillStyle = 'rgba(150,80,40,.35)'; x.fillRect(-hw / 2 + rr() * hw * 0.5, -hh / 2, hw * 0.3, hh); }
                x.strokeStyle = 'rgba(255,255,255,.55)';
                x.lineWidth = 0.4;
                x.beginPath();
                x.moveTo(-hw / 2, 0);
                x.lineTo(hw / 2, 0);
                x.stroke();
                x.strokeStyle = 'rgba(0,0,0,.45)';
                x.lineWidth = 0.4;
                x.strokeRect(-hw / 2, -hh / 2, hw, hh);
                x.restore();
            }
            for (let j = 0; j < 3; j++) palm(x, vx - 30 + rr() * 60, vy - 18 + rr() * 30, 5 + rr() * 2, rr);
        }
        // 6) Licht und Farbe: leichte Vignette und warme Sonne von links oben
        const sun = x.createLinearGradient(0, 0, W, H);
        sun.addColorStop(0, 'rgba(255,230,170,.10)');
        sun.addColorStop(1, 'rgba(0,10,30,.16)');
        x.fillStyle = sun;
        x.fillRect(0, 0, W, H);
        const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,.38)');
        x.fillStyle = vg;
        x.fillRect(0, 0, W, H);
        x.restore();
        return c;
    }

    // =====================================================================
    // FABRIK: Lagerhalle (Frontansicht)
    // L = { HH, silos:[{x,y,s,kind}], by, pipeY, xa, xb }
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
        const k = Math.min(3.2, pxW / W);
        const c = canvas(W * k, H * k);
        const x = c.getContext('2d');
        const r = rng(4242);
        x.scale(k, k);
        // 1) Wand: Betonplatten mit Fugen, Flecken, Laufspuren
        const wc = canvas(W * k / 3, H * k / 3);
        const wx = wc.getContext('2d');
        const wi = wx.createImageData(wc.width, wc.height);
        const s = 3 / k;
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

    return {
        farm: (key, L, pxW, done) => get(key, () => farm(L, pxW), done),
        plant: (key, L, pxW, done) => get(key, () => plant(L, pxW), done),
    };
})();
