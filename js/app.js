// ===== KAKAO PIT – Start und Navigation =====

const App = (() => {
    let len = 'normal';
    let years = 3;

    function show(id) {
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
        // Neue Ansicht beginnt immer oben (sonst ist z. B. der Preis abgeschnitten)
        const v = document.getElementById(id);
        if (v) { v.scrollTop = 0; v.querySelectorAll('.p-scroll').forEach(x => { x.scrollTop = 0; }); }
    }

    function modal(html) {
        $('modal').innerHTML = `${html}<div class="modal-btns"><button class="btn btn-primary" id="modal-ok">Verstanden</button></div>`;
        $('modal-ov').classList.remove('hidden');
        $('modal-ok').onclick = () => $('modal-ov').classList.add('hidden');
    }

    function howTo() {
        modal(`<h2>So funktioniert KAKAO PIT</h2>
            <p>Ihr handelt <b>Kakao-Futures</b> mit Lieferung im Dezember. Ein grosser Bildschirm ist die Börse: Live-Kurs, News und Rangliste. Alle anderen spielen auf dem Handy.</p>
            <p class="future-intro">📜 ${FUTURE_INTRO}</p>
            <div class="how-roles">${Object.entries(ROLES).map(([k, R]) => `<div class="how-role" style="--rc:${R.color}"><b>${roleIcon(k, 28)} ${R.name}</b><p class="goal-line">🎯 <b>${R.goal}</b></p><p>${R.mission}</p>${earnHTML(k)}${roleRules(R)}</div>`).join('')}</div>
            <p>Jede Rolle hat ein eigenes <b>Mandat</b> – wie in der Realität: Hedger dürfen nur ihr echtes Geschäft absichern, nur Hedgefonds dürfen spekulieren.</p>
            <ul class="info-list">
                <li>📜 <b>Lieferverträge:</b> Kooperativen und Fabriken schliessen direkt Verträge ab (Menge und Preis für Dezember). Brechen kostet Strafe – und alle sehen es.</li>
                <li>🕵️🍫 <b>Ab Jahr 2:</b> Schmuggler locken die Bauern der Kooperativen, Fabriken geraten in die Schokoladen-Krise. Einmal pro Karriere kommt ein 🚨 Krisenjahr.</li>
                <li>💻 <b>Hedgefonds spielen am Laptop:</b> Im Terminal hat jedes Gerücht einen Ort. Dort fordert man Berichte an (Satellit, Hafen, Politik …). Jeder Bericht ist nur ein Indiz – die Beweis-Waage zeigt, wohin sie zeigen.</li>
                <li>🌍 <b>Weltkarte:</b> Jede Kooperative liegt in einer Region (Ghana, Elfenbeinküste, Ecuador, Indonesien). Dürre, Krankheit oder Rekordernten treffen nur die betroffene Region.</li>
                <li>🏆 <b>Karriere:</b> Gespielt werden bis zu 3 Erntejahre. Nach jedem Jahr gibt es einen Jahresbericht und eine <b>Ausbauphase</b>: Investiert euren Gewinn in eure Firma (mehr Land, Pralinen-Linie, Analysten …). Gute Jahre bringen Ränge: Junior → Trader → Senior → Legende. Am Schluss: die grosse Preisverleihung.</li>
                <li><b>4 Monate</b> Handel, am Ende jedes Monats wird abgerechnet (Mark-to-Market). Danach ist Fälligkeit.</li>
                <li>1 Kontrakt = 10 t. Einschuss 10 % – darum wirkt jede Kursbewegung mit Hebel. Margin Call unter 70 %.</li>
                <li>News kommen zuerst als <b>Gerücht</b>, dann als Bestätigung oder Dementi. Der Preis reagiert schon auf das Gerücht.</li>
                <li><b>Wertung:</b> Ergebnis gegenüber dem Plan (Startpreis ${fmt(CFG.p0)} CHF/t). Jede Rolle hat ihre eigene Rangliste: Kooperativen kämpfen um den <b>besten Verkaufspreis</b>, Fabriken um den <b>günstigsten Einkauf</b>, Hedgefonds um den <b>höchsten Gewinn</b>.</li>
                <li>⏰ Was Kooperativen und Fabriken bis Dezember nicht abgesichert haben, wird dann ${Math.round(CFG.spotPenalty * 100)} % schlechter gehandelt (Notverkauf bzw. Notkauf).</li>
                <li>Zu wenig Leute? Der Host kann <b>KI-Trader</b> dazunehmen.</li>
            </ul>
            <p class="dim small">Technik: Die Geräte verbinden sich direkt über WebRTC. Zum Finden dient ein öffentlicher Vermittler (PeerJS) – dafür braucht es Internet.</p>`);
    }

    // Laufband auf der Startseite (Deko)
    function ticker() {
        const items = [['KAKAO DEZ', 2400], ['KAKAO MÄR', 2436], ['ZUCKER', 512], ['KAFFEE', 3890], ['WEIZEN', 238], ['MILCHPULVER', 3120], ['HASELNUSS', 7450], ['CHF/USD', 1.13]];
        const html = items.map(([n, v]) => {
            const ch = (Math.random() - 0.45) * 4;
            return `<span><b>${n}</b> ${v < 10 ? v.toFixed(2) : fmt(v * (1 + ch / 100))} <i class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(2)}%</i></span>`;
        }).join('');
        $('ticker').innerHTML = html + html;
    }

    function init() {
        ticker();
        Player.bind();
        const params = new URLSearchParams(location.search);
        const joinCode = params.get('join');
        let last = null;
        try {
            last = JSON.parse(localStorage.getItem('kakaopit-last'));
        } catch (e) {
            // ignore
        }
        if (joinCode) $('in-code').value = joinCode.toUpperCase();
        else if (last) $('in-code').value = last.code;
        if (last) $('in-name').value = last.name;
        if (joinCode) document.body.classList.add('joining');
        // Zwischenschritt: zuerst «Mitspielen» oder «Spiel leiten», dann das passende Formular
        const setStep = (s, focus) => {
            const v = $('v-start');
            if (v.dataset.step === s) return;
            v.dataset.step = s;
            if (focus && s === 'join') setTimeout(() => ($('in-code').value ? $('in-name') : $('in-code')).focus(), 380);
            if (s !== 'choose') window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        setStep(joinCode ? 'join' : 'choose');
        $('v-start').addEventListener('click', e => {
            const b = e.target.closest('[data-step]');
            if (!b) return;
            if (typeof Sound !== 'undefined' && Sound.play) Sound.play('tick');
            setStep(b.dataset.step, true);
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && $('v-start').classList.contains('active') && $('v-start').dataset.step !== 'choose') setStep('choose');
        });

        $('seg-years').querySelectorAll('[data-years]').forEach(b => b.addEventListener('click', () => {
            years = Number(b.dataset.years);
            $('seg-years').querySelectorAll('[data-years]').forEach(x => x.classList.toggle('active', x === b));
        }));
        $('seg-len').querySelectorAll('[data-len]').forEach(b => b.addEventListener('click', () => {
            len = b.dataset.len;
            $('seg-len').querySelectorAll('[data-len]').forEach(x => x.classList.toggle('active', x === b));
        }));
        $('seg-role').querySelectorAll('[data-role]').forEach(b => { if (b.dataset.role) b.querySelector('i').innerHTML = roleIcon(b.dataset.role, 34); });
        $('seg-role').querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => {
            $('seg-role').querySelectorAll('[data-role]').forEach(x => x.classList.toggle('active', x === b));
        }));
        $('btn-join').addEventListener('click', () => {
            Sound.init();
            const code = $('in-code').value.trim().toUpperCase();
            const name = $('in-name').value.trim();
            if (code.length !== 5) return ($('join-err').textContent = 'Der Raumcode hat 5 Zeichen.');
            if (!name) return ($('join-err').textContent = 'Bitte gib einen Namen ein.');
            const active = $('seg-role').querySelector('.active');
            Player.join(code, name, active ? active.dataset.role : '');
        });
        $('in-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });
        // Während des Tippens Deko-Animationen pausieren – das Eingabefeld reagiert dann sofort.
        ['in-code', 'in-name'].forEach(id => {
            $(id).addEventListener('focus', () => document.body.classList.add('typing'));
            $(id).addEventListener('blur', () => document.body.classList.remove('typing'));
        });
        $('in-code').addEventListener('input', e => {
            const el = e.target;
            const v = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
            if (v !== el.value) el.value = v;
        });
        $('btn-host').addEventListener('click', () => {
            Sound.init();
            Host.create(len, years);
        });
        $('btn-start').addEventListener('click', () => Host.start());
        $('bot-plus').addEventListener('click', () => Host.addBot());
        $('bot-minus').addEventListener('click', () => Host.removeBot());
        $('btn-how').addEventListener('click', howTo);
        // Ton an/aus auf allen Geräten (Beamer, Handy, Terminal) – wird gespeichert
        document.querySelectorAll('.snd-btn').forEach(b => b.addEventListener('click', () => Sound.toggle()));
        document.querySelectorAll('.gfx-btn').forEach(b => b.addEventListener('click', () => Gfx.toggle()));
        Gfx.paint();
        Sound.setMuted(Sound.muted());
        $('modal-ov').addEventListener('click', e => { if (e.target.id === 'modal-ov') $('modal-ov').classList.add('hidden'); });
    }

    window.addEventListener('DOMContentLoaded', init);
    return { show, modal };
})();

// ===== Startseite: animierte Kulisse (Weltkarte, Schiffsrouten, Live-Kurs, schwebende Bohnen) =====
(() => {
    const view = document.getElementById('v-start');
    if (!view || typeof LAND_HI === 'undefined') return;
    const W = 1200;
    const H = 520;
    const X = lon => ((lon + 170) / 340) * W;
    const Y = lat => ((75 - lat) / 130) * H;
    const step = window.innerWidth < 720 ? 3 : 2;
    const dotsImg = paintImage(W, H, 2, x => {
        x.fillStyle = 'rgba(200,170,120,.28)';
        x.beginPath();
        for (const [lat, ranges] of LAND_HI) {
            if (lat % step || lat > 74 || lat < -55) continue;
            for (const [a, b] of ranges) {
                for (let lon = Math.ceil(a / step) * step; lon <= b; lon += step) {
                    if (lon < -170 || lon > 170) continue;
                    x.moveTo(X(lon) + 1.25, Y(lat));
                    x.arc(X(lon), Y(lat), 1.25, 0, Math.PI * 2);
                }
            }
        }
        x.fill();
    });
    const spots = [['Elfenbeinküste', -5.5, 6.8], ['Ghana', -1.2, 6.9], ['Ecuador', -79, -1.5], ['Indonesien', 120, -2], ['Kamerun', 12, 4.5], ['Brasilien', -39.5, -14]];
    const hubs = [['London', -0.1, 51.5], ['New York', -74, 40.7], ['Amsterdam', 4.9, 52.4]];
    const route = (a, b, bend) => {
        const x1 = X(a[1]);
        const y1 = Y(a[2]);
        const x2 = X(b[1]);
        const y2 = Y(b[2]);
        return `M${x1.toFixed(0)} ${y1.toFixed(0)} Q ${((x1 + x2) / 2).toFixed(0)} ${((y1 + y2) / 2 - bend).toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}`;
    };
    const routes = [[spots[0], hubs[2], 90], [spots[1], hubs[0], 70], [spots[0], hubs[1], 120], [spots[2], hubs[1], 60], [spots[3], hubs[2], 160]]
        .map(([a, b, k], i) => `<path d="${route(a, b, k)}" class="sb-route" style="animation-delay:${-i * 1.3}s"/><circle r="3" class="sb-ship"><animateMotion dur="${7 + i * 1.5}s" repeatCount="indefinite" begin="${-i * 2}s" path="${route(a, b, k)}"/></circle>`).join('');
    const pins = spots.map(([n, lon, lat], i) => `<g transform="translate(${X(lon).toFixed(0)} ${Y(lat).toFixed(0)})"><circle r="4" class="sb-pin"/><circle r="4" class="sb-ring" style="animation-delay:${i * 0.6}s"/>${['Ghana', 'Kamerun'].includes(n) ? '' : `<text x="8" y="-6" class="sb-lab">${n}</text>`}</g>`).join('')
        + hubs.map(([n, lon, lat]) => `<g transform="translate(${X(lon).toFixed(0)} ${Y(lat).toFixed(0)})"><rect x="-3" y="-3" width="6" height="6" class="sb-hub"/>${n === 'Amsterdam' ? '' : `<text x="7" y="4" class="sb-lab hub">${n}</text>`}</g>`).join('');
    // Endlos laufender Kurs: zwei identische Hälften, damit die Schleife nahtlos ist
    let p = 260;
    const pts = [];
    for (let i = 0; i <= 60; i++) {
        p += Math.sin(i * 0.7) * 14 + Math.cos(i * 1.9) * 9 + (i < 30 ? -1.2 : 1.2);
        pts.push(p);
    }
    pts[60] = pts[0];
    const seg = off => pts.map((v, i) => `${(off + i * 20).toFixed(0)},${v.toFixed(1)}`).join(' ');
    const candles = pts.slice(0, 60).map((v, i) => {
        const n = pts[i + 1];
        return `<rect x="${i * 20 + 6}" y="${Math.min(v, n).toFixed(1)}" width="8" height="${Math.max(2, Math.abs(n - v)).toFixed(1)}" class="${n < v ? 'up' : 'down'}"/>`;
    }).join('');
    const bg = document.createElement('div');
    bg.className = 'start-bg';
    bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" class="sb-map"><defs><radialGradient id="sbFade" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="sbMask"><rect width="${W}" height="${H}" fill="url(#sbFade)"/></mask></defs>
            <g mask="url(#sbMask)"><image href="${dotsImg}" x="0" y="0" width="${W}" height="${H}"/>${routes}${pins}</g></svg>
        <div class="sb-chart"><svg viewBox="0 0 2400 400" preserveAspectRatio="none"><defs><linearGradient id="sbArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9b26f" stop-opacity=".22"/><stop offset="1" stop-color="#d9b26f" stop-opacity="0"/></linearGradient></defs>
            <g class="sb-roll"><g class="sb-candles">${candles}</g><g class="sb-candles" transform="translate(1200 0)">${candles}</g>
            <polygon points="0,400 ${seg(0)} ${seg(1200)} 2400,400" fill="url(#sbArea)"/><polyline points="${seg(0)} ${seg(1200)}" class="sb-line"/></g></svg></div>
        <div class="sb-beans">${Array.from({ length: 12 }, (_, i) => `<i style="left:${(i * 83) % 100}%;animation-delay:${-i * 2.3}s;animation-duration:${16 + (i % 5) * 4}s;--s:${0.6 + (i % 4) * 0.25};--r:${(i * 47) % 360}deg"></i>`).join('')}</div>`;
    view.prepend(bg);
})();
