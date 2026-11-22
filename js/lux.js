// ===== KAKAO PIT – Ausstattung: Guilloche wie auf einer Banknote, gravierte Ornamente =====
const Lux = (() => {
    const gold = a => `rgba(217,178,111,${a})`;
    // Rosette aus überlagerten Epitrochoiden (klassische Guilloche)
    function rosette(size, rings) {
        const c = size / 2;
        let paths = '';
        rings.forEach(([R, amp, lobes, n, a]) => {
            for (let k = 0; k < n; k++) {
                const ph = (k / n) * Math.PI * 2 / lobes;
                let d = '';
                for (let i = 0; i <= 540; i++) {
                    const t = (i / 540) * Math.PI * 2;
                    const r = R + amp * Math.sin(lobes * t + ph);
                    d += `${i ? 'L' : 'M'}${(c + Math.cos(t) * r).toFixed(1)} ${(c + Math.sin(t) * r).toFixed(1)}`;
                }
                paths += `<path d="${d}Z" fill="none" stroke="${gold(a)}" stroke-width="0.6"/>`;
            }
        });
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
    }
    // Wellenband (für Rahmen und Kopfzeilen)
    function band(w, h, lines, a) {
        let paths = '';
        for (let k = 0; k < lines; k++) {
            const ph = (k / lines) * Math.PI * 2;
            let d = '';
            for (let x = 0; x <= w; x += 2) d += `${x ? 'L' : 'M'}${x} ${(h / 2 + Math.sin((x / w) * Math.PI * 4 + ph) * (h * 0.38)).toFixed(2)}`;
            paths += `<path d="${d}" fill="none" stroke="${gold(a)}" stroke-width="0.6"/>`;
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${paths}</svg>`;
    }
    const url = s => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}")`;
    function init() {
        const root = document.documentElement.style;
        root.setProperty('--g-rosette', url(rosette(1400, [[560, 46, 18, 6, 0.16], [420, 34, 14, 5, 0.12], [290, 26, 11, 4, 0.1], [170, 18, 9, 3, 0.09]])));
        root.setProperty('--g-small', url(rosette(220, [[92, 9, 12, 4, 0.5], [66, 7, 9, 3, 0.4], [40, 5, 7, 2, 0.35]])));
        root.setProperty('--g-band', url(band(240, 18, 5, 0.42)));
        // Feines Leder: Korn + weiche Flecken, einmal berechnet
        try {
            const c = document.createElement('canvas');
            c.width = c.height = 256;
            const x = c.getContext('2d');
            const im = x.createImageData(256, 256);
            let seed = 9;
            const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
            for (let i = 0; i < im.data.length; i += 4) {
                const v = rnd();
                const g = v > 0.5 ? 255 : 0;
                im.data[i] = im.data[i + 1] = im.data[i + 2] = g;
                im.data[i + 3] = Math.round(Math.abs(v - 0.5) * 22);
            }
            x.putImageData(im, 0, 0);
            x.globalCompositeOperation = 'source-over';
            for (let k = 0; k < 70; k++) {
                const px = rnd() * 256; const py = rnd() * 256; const r = 6 + rnd() * 18;
                const g = x.createRadialGradient(px, py, 0, px, py, r);
                g.addColorStop(0, `rgba(0,0,0,${(0.05 + rnd() * 0.05).toFixed(3)})`);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                x.fillStyle = g;
                x.fillRect(px - r, py - r, r * 2, r * 2);
            }
            root.setProperty('--m-leather', `url(${c.toDataURL('image/png')})`);
        } catch (e) { /* egal */ }
        if (!document.querySelector('.lux-bg')) {
            const bg = document.createElement('div');
            bg.className = 'lux-bg';
            document.body.prepend(bg);
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    return { rosette, band };
})();
