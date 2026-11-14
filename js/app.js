// ===== KAKAO PIT – Start und Navigation =====

const App = (() => {
    let len = 'normal';
    let years = 3;

    function show(id) {
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
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
        Sound.setMuted(Sound.muted());
        $('modal-ov').addEventListener('click', e => { if (e.target.id === 'modal-ov') $('modal-ov').classList.add('hidden'); });
    }

    window.addEventListener('DOMContentLoaded', init);
    return { show, modal };
})();
