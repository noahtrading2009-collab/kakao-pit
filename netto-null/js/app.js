// ===== NETTO NULL – Start und Navigation =====

const App = (() => {
    function show(id) {
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
        window.scrollTo(0, 0);
    }

    function modal(html) {
        $('modal').innerHTML = `${html}<div class="modal-btns"><button class="btn btn-primary" id="modal-ok">Verstanden</button></div>`;
        $('modal-ov').classList.remove('hidden');
        $('modal-ok').onclick = () => $('modal-ov').classList.add('hidden');
    }

    function howTo() {
        modal(`<h2>So funktioniert NETTO NULL</h2>
            <p>Ihr leitet Firmen, die CO₂ ausstossen. Der Staat begrenzt den Ausstoss mit einem <b>Cap</b>: Jede Runde gibt es weniger Verschmutzungsrechte (Zertifikate). Für jede Tonne CO₂ braucht eure Firma ein Zertifikat – sonst kostet es <b>${CFG.penalty} CHF Strafe pro Tonne</b>.</p>
            <div class="how-steps">
                <div><b>📰 1. News</b><p>Der Beamer zeigt, was diese Runde passiert und wie viele Gratis-Zertifikate es gibt.</p></div>
                <div><b>🧠 2. Entscheiden</b><p>Am Handy: in Klimaschutz investieren und ein Gebot für die Auktion abgeben. Dann «Fertig».</p></div>
                <div><b>🔨 3. Auktion</b><p>Alle Gebote treffen sich: Wo Angebot und Nachfrage sich kreuzen, entsteht der CO₂-Preis.</p></div>
                <div><b>🏙️ 4. Abrechnung</b><p>Jede Tonne wird mit einem Zertifikat bezahlt. Je weniger CO₂, desto klarer der Himmel.</p></div>
            </div>
            <p><b>Der Trick:</b> Jede Branche kann unterschiedlich günstig sparen. Wer billig sparen kann, verkauft übrige Zertifikate. Wer teuer sparen müsste, kauft sie. Gewinner ist die Firma mit dem meisten Geld nach ${CFG.rounds} Runden.</p>
            <div class="how-cos">${COMPANY_ORDER.map(c => { const C = COMPANIES[c]; const lo = Math.min(...C.measures.map(m => m.cost / (m.t * CFG.rounds))); const hi = Math.max(...C.measures.map(m => m.cost / (m.t * CFG.rounds))); return `<div style="--cc:${C.color}"><b>${C.icon} ${C.short}</b><small>${Math.round(lo)}–${Math.round(hi)} CHF pro t</small></div>`; }).join('')}</div>
            <p class="dim small">Keine Timer, kein Stress: Der Host geht weiter, wenn alle bereit sind.</p>`);
    }

    function init() {
        Player.bind();
        const params = new URLSearchParams(location.search);
        const joinCode = params.get('join');
        let last = null;
        try {
            last = JSON.parse(localStorage.getItem('nettonull-last'));
        } catch (e) {
            // ignore
        }
        if (joinCode) $('in-code').value = joinCode.toUpperCase();
        else if (last) $('in-code').value = last.code;
        if (last) $('in-name').value = last.name;
        if (joinCode) document.body.classList.add('joining');
        $('seg-co').querySelectorAll('[data-co]').forEach(b => b.addEventListener('click', () => {
            $('seg-co').querySelectorAll('[data-co]').forEach(x => x.classList.toggle('active', x === b));
        }));
        $('btn-join').addEventListener('click', () => {
            Sound.init();
            const code = $('in-code').value.trim().toUpperCase();
            const name = $('in-name').value.trim();
            if (code.length !== 5) return ($('join-err').textContent = 'Der Raumcode hat 5 Zeichen.');
            if (!name) return ($('join-err').textContent = 'Bitte gib einen Firmennamen ein.');
            const a = $('seg-co').querySelector('.active');
            Player.join(code, name, a ? a.dataset.co : '');
        });
        $('in-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });
        $('btn-host').addEventListener('click', () => { Sound.init(); Host.create(); });
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
