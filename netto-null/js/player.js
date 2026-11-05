// ===== NETTO NULL – Spieler (Handy) =====

const Player = (() => {
    let peer = null;
    let conn = null;
    let code = '';
    let name = '';
    let key = '';
    let wish = '';
    let me = null;
    let pub = null;
    let ended = false;
    let rid = 1;
    // Entwurf des Gebots (lokal, bis «Gebot speichern»)
    let side = 'none';
    let qty = 0;
    let price = 80;
    let draftRound = -1;
    let lastPhase = '';

    function keyFor(c) {
        const k = `nettonull-key-${c}`;
        try {
            let v = localStorage.getItem(k);
            if (!v) {
                v = Math.random().toString(36).slice(2) + Date.now().toString(36);
                localStorage.setItem(k, v);
            }
            return v;
        } catch (e) {
            return Math.random().toString(36).slice(2);
        }
    }

    function join(c, n, co) {
        code = c.toUpperCase().trim();
        name = n.trim();
        if (co !== undefined) wish = co;
        key = keyFor(code);
        if (!Net.available()) {
            $('join-err').textContent = 'Verbindung nicht möglich (Internet?).';
            return;
        }
        $('join-err').textContent = 'Verbinde …';
        $('btn-join').disabled = true;
        if (peer) peer.destroy();
        peer = Net.join(code, {
            onOpen: c2 => {
                conn = c2;
                $('conn-lost').classList.add('hidden');
                conn.send({ t: 'join', name, key, co: wish });
            },
            onData,
            onClose: () => { if (!ended) $('conn-lost').classList.remove('hidden'); },
            onError: msg => {
                $('join-err').textContent = msg;
                $('btn-join').disabled = false;
            },
        });
    }

    function send(obj) {
        if (!conn || !conn.open) return toast('Keine Verbindung.', 'bad');
        conn.send({ ...obj, rid: rid++ });
    }

    function onData(msg) {
        if (!msg || !msg.t) return;
        if (msg.t === 'reject') {
            $('join-err').textContent = msg.msg;
            $('btn-join').disabled = false;
            return;
        }
        if (msg.t === 'welcome') {
            try {
                localStorage.setItem('nettonull-last', JSON.stringify({ code, name }));
            } catch (e) {
                // ignore
            }
            Sound.init();
            Sound.play('join');
            return;
        }
        if (msg.t === 's') {
            pub = msg.pub;
            me = msg.me;
            if (!me) return;
            if (pub.phase === 'lobby') showWait();
            else if (!ended) {
                if (!$('v-player').classList.contains('active')) App.show('v-player');
                if (pub.phase !== lastPhase) {
                    if (pub.phase === 'news') Sound.play('news');
                    if (pub.phase === 'result') Sound.play('gavel');
                    lastPhase = pub.phase;
                }
                render();
            }
            return;
        }
        if (msg.t === 'res') {
            if (msg.msg) toast(msg.msg, msg.ok ? 'good' : 'bad');
            if (msg.ok) Sound.play('card');
            else Sound.play('bad');
            return;
        }
        if (msg.t === 'end') {
            ended = true;
            showEnd(msg);
        }
    }

    // ===== Warteraum =====

    function showWait() {
        const C = COMPANIES[me.co];
        App.show('v-wait');
        $('w-card').style.setProperty('--cc', C.color);
        $('w-icon').textContent = C.icon;
        $('w-co').textContent = C.name;
        $('w-name').textContent = `Willkommen, ${me.name}!`;
        $('w-desc').textContent = C.desc;
        $('w-measures').innerHTML = C.measures.map(m => `<div class="wm"><span>${m.icon} ${m.name}</span><b>−${m.t} t</b><em>${fmt(m.cost)} CHF</em><small>≈ ${Math.round(m.cost / (m.t * CFG.rounds))} CHF pro eingesparte Tonne (wenn sofort gebaut)</small></div>`).join('');
        $('w-cos').querySelectorAll('[data-co]').forEach(b => b.classList.toggle('active', b.dataset.co === me.co));
    }

    // ===== Spiel =====

    function render() {
        const C = COMPANIES[me.co];
        document.body.style.setProperty('--cc', C.color);
        $('p-co').innerHTML = `<span class="p-emb">${C.icon}</span><span><b>${esc(me.name)}</b><small>${C.name}</small></span>`;
        $('p-year').innerHTML = `<small>Runde ${pub.round + 1}/${pub.rounds}</small><b>${pub.year}</b>`;
        $('p-rank').textContent = `#${me.rank}`;
        renderStatus();
        const ph = pub.phase;
        $('p-news').classList.toggle('hidden', ph !== 'news');
        $('p-decide').classList.toggle('hidden', ph !== 'decide');
        $('p-result').classList.toggle('hidden', ph !== 'result');
        if (ph === 'news') renderNews();
        if (ph === 'decide') renderDecide();
        if (ph === 'result') renderResult();
    }

    function renderStatus() {
        const e = me.emissions;
        const c = me.certs;
        const diff = c - e;
        const max = Math.max(e, c, 1);
        $('p-status').innerHTML = `
            <div class="st-grid">
                <div class="st"><small>🏭 Ausstoss diese Runde</small><b>${e} t</b></div>
                <div class="st"><small>📜 Deine Zertifikate</small><b>${c}</b></div>
                <div class="st"><small>💰 Geld</small><b>${fmt(me.cash)}</b></div>
            </div>
            <div class="balance">
                <div class="bal-row"><span>Ausstoss</span><div class="bal-bar"><i class="em" style="width:${(e / max) * 100}%"></i></div></div>
                <div class="bal-row"><span>Zertifikate</span><div class="bal-bar"><i class="ce" style="width:${(c / max) * 100}%"></i></div></div>
            </div>
            <div class="dim small">Gratis-Zuteilung diese Runde: <b>${me.alloc}</b> Zertifikate · Rest aus Vorrat und Handel</div>
            <div class="verdict ${diff >= 0 ? 'ok' : 'bad'}">${diff >= 0
                ? `✔ Gedeckt – <b>${diff}</b> Zertifikate übrig. Die kannst du verkaufen oder für später aufbewahren.`
                : `⚠️ Es fehlen <b>${-diff}</b> Zertifikate. Ohne Kauf oder Investition zahlst du <b>${fmt(-diff * CFG.penalty)} CHF</b> Strafe.`}</div>`;
    }

    function renderNews() {
        const ev = pub.event;
        $('p-news').innerHTML = `<div class="news-card">
            <div class="nc-icon">${ev ? ev.icon : '🏛️'}</div>
            <h2>${ev ? ev.title : 'Das Emissionshandelssystem startet'}</h2>
            <p>${ev ? ev.text : `Ab jetzt braucht jede Firma für jede Tonne CO₂ ein Zertifikat. Du bekommst diese Runde <b>${pub.cap}</b> gratis.`}</p>
            <div class="nc-cap">Gratis-Zertifikate diese Runde: <b>${pub.cap}</b></div>
            <div class="dim small pulse">Schau auf den Beamer – gleich geht's los.</div></div>`;
    }

    // ----- Entscheidungsphase -----

    let decideKey = '';
    function renderDecide() {
        if (draftRound !== pub.round) {
            draftRound = pub.round;
            const lastP = pub.prices.length ? pub.prices[pub.prices.length - 1] : 70;
            if (me.order) {
                side = me.order.side;
                qty = me.order.qty;
                price = me.order.price;
            } else {
                side = 'none';
                qty = 0;
                price = lastP;
            }
        }
        const k = JSON.stringify([me.measures, me.cash, me.certs, me.emissions, me.ready, me.order, side, qty, price]);
        if (k === decideKey) return;
        decideKey = k;
        const lastP = pub.prices.length ? pub.prices[pub.prices.length - 1] : null;
        const open = me.measures.filter(m => !m.built);
        const cheapest = open.length ? Math.min(...open.map(m => m.perTon)) : null;
        const ro = me.ready;
        const cards = me.measures.map(m => `<div class="mcard ${m.built ? 'built' : ''} ${m.now < m.cost ? 'sale' : ''}">
            <div class="mc-icon">${m.icon}</div>
            <div class="mc-name">${m.name}</div>
            <div class="mc-t">−${m.t} t <small>pro Runde</small></div>
            ${m.built ? '<div class="mc-done">✔ Gebaut</div>' : `<div class="mc-cost">${m.now < m.cost ? `<s>${fmt(m.cost)}</s> ` : ''}${fmt(m.now)} CHF</div>
            <div class="mc-per">≈ ${fmt(m.perTon)} CHF pro t <small>(bis ${CFG.years[CFG.rounds - 1]})</small></div>
            <button class="btn btn-build" data-build="${m.id}" ${ro || me.cash < m.now ? 'disabled' : ''}>Bauen</button>`}</div>`).join('');
        const surplus = me.certs - me.emissions;
        const maxSell = me.certs;
        const maxBuy = Math.floor(me.cash / Math.max(1, price));
        $('p-decide').innerHTML = `
            <div class="card sect">
                <div class="sect-h"><span>① Investieren</span><small>Einmal zahlen, jede Runde weniger CO₂</small></div>
                <div class="mcards">${cards}</div>
            </div>
            <div class="card sect">
                <div class="sect-h"><span>② Gebot für die Auktion</span><small>Alle handeln zum gleichen Preis</small></div>
                <div class="seg" id="o-side">
                    <button data-side="buy" class="${side === 'buy' ? 'active buy' : ''}">🛒 Kaufen</button>
                    <button data-side="none" class="${side === 'none' ? 'active' : ''}">✋ Nichts</button>
                    <button data-side="sell" class="${side === 'sell' ? 'active sell' : ''}">💸 Verkaufen</button>
                </div>
                ${side === 'none' ? `<p class="dim small">${surplus >= 0 ? `Du hast ${surplus} Zertifikate übrig – du könntest sie verkaufen.` : `Dir fehlen ${-surplus} Zertifikate – kaufen ist meist günstiger als die Strafe.`}</p>` : `
                <div class="o-row"><span>Menge</span>
                    <div class="stepper"><button data-q="-10">−10</button><button data-q="-1">−</button><b>${qty}</b><button data-q="1">+</button><button data-q="10">+10</button></div></div>
                <div class="o-quick">${side === 'buy' && surplus < 0 ? `<button data-set="${-surplus}">Was mir fehlt (${-surplus})</button>` : ''}${side === 'sell' && surplus > 0 ? `<button data-set="${surplus}">Alles Übrige (${surplus})</button>` : ''}</div>
                <div class="o-row"><span>${side === 'buy' ? 'Höchstens' : 'Mindestens'}</span><b class="o-price">${fmt(price)} CHF/t</b></div>
                <input type="range" id="o-price" min="5" max="${CFG.penalty + 50}" step="5" value="${price}">
                <div class="o-hints">
                    ${lastP !== null ? `<span>📊 Letzter Preis: <b>${fmt(lastP)}</b></span>` : '<span>📊 Noch kein Marktpreis</span>'}
                    <span>⚖️ Strafe: <b>${CFG.penalty}</b>/t</span>
                    ${cheapest !== null ? `<span>🔧 Deine billigste Massnahme: <b>≈ ${fmt(cheapest)}</b>/t</span>` : ''}
                </div>
                <p class="small dim">${side === 'buy' ? 'Du kaufst nur, wenn der Auktionspreis höchstens so hoch ist. Bezahlt wird der Einheitspreis.' : 'Du verkaufst nur, wenn der Auktionspreis mindestens so hoch ist.'}</p>
                ${side === 'sell' && qty > maxSell ? '<p class="bad small">Du hast nicht so viele Zertifikate.</p>' : ''}
                ${side === 'buy' && qty > maxBuy ? '<p class="bad small">Dafür reicht dein Geld nicht.</p>' : ''}`}
            </div>
            <div class="ready-bar">${ro
                ? `<div class="ready-msg">✅ Fertig – warte auf die anderen …</div><button class="btn btn-ghost" id="p-unready">Ändern</button>`
                : '<button class="btn btn-primary btn-big full" id="p-ready">✔ Fertig</button>'}</div>`;
        bindDecide();
    }

    function saveOrder() {
        send({ t: 'order', order: side === 'none' ? null : { side, qty, price } });
    }

    function bindDecide() {
        const root = $('p-decide');
        root.querySelectorAll('[data-build]').forEach(b => b.addEventListener('click', () => send({ t: 'build', id: b.dataset.build })));
        root.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => {
            if (me.ready) return;
            side = b.dataset.side;
            const surplus = me.certs - me.emissions;
            if (side === 'buy') qty = Math.max(0, -surplus) || 10;
            if (side === 'sell') qty = Math.max(0, surplus);
            decideKey = '';
            renderDecide();
        }));
        root.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
            qty = Math.max(0, qty + Number(b.dataset.q));
            decideKey = '';
            renderDecide();
        }));
        root.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
            qty = Number(b.dataset.set);
            decideKey = '';
            renderDecide();
        }));
        const r = $('o-price');
        if (r) {
            r.addEventListener('input', () => {
                price = Number(r.value);
                root.querySelector('.o-price').textContent = `${fmt(price)} CHF/t`;
            });
            r.addEventListener('change', () => { decideKey = ''; renderDecide(); });
        }
        const ready = $('p-ready');
        if (ready) ready.addEventListener('click', () => {
            if (side !== 'none' && qty > 0) saveOrder();
            else send({ t: 'order', order: null });
            send({ t: 'ready', v: true });
            Sound.play('ready');
        });
        const un = $('p-unready');
        if (un) un.addEventListener('click', () => send({ t: 'ready', v: false }));
    }

    // ----- Ergebnis -----

    function renderResult() {
        const a = pub.auction;
        const L = me.last;
        if (!L) return;
        let trade = 'Du hast diese Runde nicht gehandelt.';
        if (L.fill > 0) trade = `🛒 Gekauft: <b>${L.fill}</b> Zertifikate à <b>${fmt(a.price)}</b> = −${fmt(L.fill * a.price)} CHF`;
        if (L.fill < 0) trade = `💸 Verkauft: <b>${-L.fill}</b> Zertifikate à <b>${fmt(a.price)}</b> = +${fmt(-L.fill * a.price)} CHF`;
        if (me.order && !L.fill) trade = `Dein Gebot (${me.order.side === 'buy' ? 'kaufen bis' : 'verkaufen ab'} ${fmt(me.order.price)}) kam nicht zum Zug – der Preis lag bei ${a.price === null ? '–' : fmt(a.price)}.`;
        let tip;
        const open = me.measures.filter(m => !m.built);
        const cheapest = open.length ? Math.min(...open.map(m => m.perTon)) : null;
        if (L.penalty) tip = '💡 Strafen sind teuer. Kaufe rechtzeitig Zertifikate oder investiere früher.';
        else if (a.price !== null && cheapest !== null && cheapest < a.price) tip = `💡 Deine billigste Massnahme (≈ ${fmt(cheapest)}/t) ist günstiger als der CO₂-Preis (${fmt(a.price)}). Selbst sparen und Zertifikate verkaufen lohnt sich!`;
        else if (a.price !== null && cheapest !== null) tip = `💡 Zertifikate kaufen (${fmt(a.price)}/t) ist für dich billiger als deine Massnahmen (≈ ${fmt(cheapest)}/t). Genau dafür gibt es den Handel.`;
        else tip = '💡 Alle Massnahmen gebaut – überschüssige Zertifikate kannst du verkaufen.';
        $('p-result').innerHTML = `<div class="card res-card">
            <div class="res-price"><small>CO₂-Preis dieser Runde</small><b>${a.price === null ? '–' : fmt(a.price)}</b><span>CHF pro Tonne · ${fmt(a.qty)} gehandelt</span></div>
            <div class="res-line">${trade}</div>
            <div class="res-line">🏭 Ausgestossen: <b>${L.emissions} t</b> → ${L.penalty ? `<span class="bad">Strafe ${fmt(L.penalty)} CHF</span>` : '<span class="good">alles mit Zertifikaten gedeckt ✔</span>'}</div>
            ${L.invest ? `<div class="res-line">🔧 Investiert: ${fmt(L.invest)} CHF</div>` : ''}
            <div class="res-line">📜 Zertifikate auf Vorrat: <b>${L.certsLeft}</b>${pub.round + 1 >= pub.rounds ? ' <span class="dim">(verfallen am Spielende)</span>' : ''}</div>
            <div class="tip">${tip}</div>
            <div class="dim small pulse">Warte auf die nächste Runde …</div></div>`;
    }

    // ===== Ende =====

    function showEnd(msg) {
        App.show('v-pend');
        Sound.play('end');
        const r = msg.row;
        const C = COMPANIES[r.co];
        const save = msg.bench.solo - msg.bench.market;
        $('p-end').innerHTML = `<div class="card end-card" style="--cc:${C.color}">
            <div class="end-rank">#${msg.rank}<span>/${msg.total}</span></div>
            <div class="end-co">${C.icon} ${C.name}</div>
            <h2>${esc(r.name)}</h2>
            <div class="end-cash">${fmt(r.cash)} CHF</div>
            <div class="end-stats"><div><small>Investiert</small><b>${fmt(r.invested)}</b></div><div><small>Gekauft</small><b>${r.bought}</b></div><div><small>Verkauft</small><b>${r.sold}</b></div><div><small>Strafen</small><b>${fmt(r.penalties)}</b></div></div>
            <p>Deine Firma hat ihren Ausstoss um <b>${r.cut} t</b> pro Runde gesenkt.</p>
            <div class="tip">💡 Dank Handel hat die Klasse dasselbe Klimaziel um bis zu <b>${fmt(save)} CHF</b> günstiger erreicht als mit einer starren Vorschrift für jede Firma.</div>
            <h3>🏆 Top 3</h3><ol class="top3">${msg.top.map(t => `<li>${COMPANIES[t.co].icon} ${esc(t.name)} <b>${fmt(t.cash)}</b></li>`).join('')}</ol></div>`;
    }

    function toast(text, kind = '') {
        const el = document.createElement('div');
        el.className = `toast ${kind}`;
        el.textContent = text;
        $('toasts').appendChild(el);
        while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
        setTimeout(() => el.remove(), 3200);
    }

    function bind() {
        $('w-cos').querySelectorAll('[data-co]').forEach(b => b.addEventListener('click', () => send({ t: 'co', co: b.dataset.co })));
        $('btn-rejoin').addEventListener('click', () => join(code, name));
    }

    return { join, bind };
})();
