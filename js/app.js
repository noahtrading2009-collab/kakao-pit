// ===== KAKAO PIT – Start und Navigation =====

const App = (() => {
    let len = 'normal';

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
            <div class="how-roles">${Object.values(ROLES).map(R => `<div class="how-role" style="--rc:${R.color}"><b>${R.icon} ${R.name}</b><div class="dim small">${R.job}</div><p>${R.mission}</p>${roleRules(R)}</div>`).join('')}</div>
            <p>Jede Rolle hat ein eigenes <b>Mandat</b> – wie in der Realität: Hedger dürfen nur ihr echtes Geschäft absichern, nur Hedgefonds dürfen spekulieren.</p>
            <ul class="info-list">
                <li><b>4 Monate</b> Handel, am Ende jedes Monats wird abgerechnet (Mark-to-Market). Danach ist Fälligkeit.</li>
                <li>1 Kontrakt = 10 t. Einschuss 10 % – darum wirkt jede Kursbewegung mit Hebel. Margin Call unter 70 %.</li>
                <li>News kommen zuerst als <b>Gerücht</b>, dann als Bestätigung oder Dementi. Der Preis reagiert schon auf das Gerücht.</li>
                <li>Auf dem <b>Board</b> stellt ihr eigene Angebote ein und handelt direkt miteinander.</li>
                <li><b>Wertung:</b> Ergebnis gegenüber dem Plan (Startpreis ${fmt(CFG.p0)} CHF/t). Kooperativen und Fabriken bekommen zusätzlich bis zu ${fmt(CFG.missionBonus)} CHF Bonus für konsequente Absicherung.</li>
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

        $('seg-len').querySelectorAll('[data-len]').forEach(b => b.addEventListener('click', () => {
            len = b.dataset.len;
            $('seg-len').querySelectorAll('[data-len]').forEach(x => x.classList.toggle('active', x === b));
        }));
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
        $('btn-host').addEventListener('click', () => {
            Sound.init();
            Host.create(len);
        });
        $('btn-start').addEventListener('click', () => Host.start());
        $('bot-plus').addEventListener('click', () => Host.addBot());
        $('bot-minus').addEventListener('click', () => Host.removeBot());
        $('btn-how').addEventListener('click', howTo);
        $('h-sound').addEventListener('click', () => { $('h-sound').textContent = Sound.toggle() ? '🔇' : '🔊'; });
        $('modal-ov').addEventListener('click', e => { if (e.target.id === 'modal-ov') $('modal-ov').classList.add('hidden'); });
    }

    window.addEventListener('DOMContentLoaded', init);
    return { show, modal };
})();
