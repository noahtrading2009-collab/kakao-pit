// ===== KAKAO PIT – Bilder für die Leitstände (Steuerung) =====
// Die eigentliche Rechenarbeit passiert in js/render-worker.js – im Hintergrund-Thread,
// damit der Leitstand flüssig bleibt. Ohne Worker-Unterstützung wird im Hauptfenster gerechnet.
const Render = (() => {
    const cache = new Map();
    const waits = {};
    let seq = 0;
    let worker = null;
    const ver = ((document.currentScript && document.currentScript.src) || '').split('?v=')[1] || '1';
    try {
        if (typeof OffscreenCanvas !== 'undefined' && window.Worker) {
            worker = new Worker(`js/render-worker.js?v=${ver}`);
            worker.onmessage = e => {
                const { id, bmp, err, ms, tm } = e.data;
                const w = waits[id];
                delete waits[id];
                next();
                if (!w) return;
                if (bmp) {
                    store(w.key, bmp);
                    if (window.KP_DEBUG) console.log('Render', w.key, ms, 'ms', tm || '');
                    w.done && w.done();
                } else {
                    console.warn('Render-Fehler', err);
                    cache.delete(w.key);
                }
            };
            worker.onerror = ev => { console.warn('Render-Worker', ev.message); worker = null; };
        }
    } catch (e) { worker = null; }
    // Fertige Bilder als ImageBitmap (ohne JPEG-Umweg) – höchstens 4 behalten
    function store(key, bmp) {
        cache.set(key, { bmp });
        while (cache.size > 6) {
            const first = cache.keys().next().value;
            const v = cache.get(first);
            if (v && v.bmp && v.bmp.close) v.bmp.close();
            cache.delete(first);
        }
    }
    // Höchstens ein Auftrag läuft, ein weiterer wartet – ältere wartende Aufträge verfallen
    let busy = false;
    let queued = null;
    function run(job) {
        busy = true;
        const id = ++seq;
        waits[id] = job;
        worker.postMessage({ id, type: job.type, L: job.L, pxW: job.pxW });
    }
    function next() {
        busy = false;
        if (queued) { const j = queued; queued = null; run(j); }
    }
    function get(type, key, L, pxW, done) {
        const hit = cache.get(key);
        if (hit && hit.bmp) return hit.bmp;
        if (hit && hit.pending) return null;
        if (worker) {
            if (queued && queued.key === key) return null;
            if (queued) cache.delete(queued.key);
            cache.set(key, { pending: true });
            const job = { type, key, L, pxW, done };
            if (busy) queued = job;
            else run(job);
        } else if (typeof RenderCore !== 'undefined') {
            cache.set(key, { pending: true });
            setTimeout(() => {
                try {
                    const c = RenderCore[type](L, pxW);
                    store(key, c.transferToImageBitmap ? c.transferToImageBitmap() : c);
                    done && done();
                } catch (e) { console.warn('Render', e); }
            }, 50);
        }
        return null;
    }
    return {
        farm: (key, L, pxW, done) => get('farm', key, L, pxW, done),
        plant: (key, L, pxW, done) => get('plant', key, L, pxW, done),
    };
})();
