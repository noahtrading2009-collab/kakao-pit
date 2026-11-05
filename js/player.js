// ===== KAKAO PIT – Spieler (Handy) =====

const Player = (() => {
    let peer = null;
    let conn = null;
    let code = '';
    let name = '';
    let key = '';
    let role = null;
    let me = null;
    let pub = null;
    let qty = 1;
    let rid = 1;
    let ofSide = 'sell';
    let ofQty = 2;
    let ofPrice = null;
    let ended = false;
    let lastNews = 0;

    function keyFor(c) {
        const k = `kakaopit-key-${c}`;
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

    let wish = '';

    function join(c, n, r) {
        code = c.toUpperCase().trim();
        name = n.trim();
        if (r !== undefined) wish = r;
        key = keyFor(code);
        if (!Net.available()) {
            $('join-err').textContent = 'Verbindung nicht möglich: PeerJS konnte nicht geladen werden (Internet?).';
            return;
        }
        $('join-err').textContent = 'Verbinde …';
        $('btn-join').disabled = true;
        if (peer) peer.destroy();
        peer = Net.join(code, {
            onOpen: c2 => {
                conn = c2;
                $('conn-lost').classList.add('hidden');
                conn.send({ t: 'join', name, key, role: wish });
            },
            onData,
            onClose: () => { if (!ended) $('conn-lost').classList.remove('hidden'); },
            onError: msg => {
                $('join-err').textContent = msg;
                $('btn-join').disabled = false;
                if (me) $('conn-lost').classList.remove('hidden');
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
            role = msg.role;
            try {
                localStorage.setItem('kakaopit-last', JSON.stringify({ code, name }));
            } catch (e) {
                // ignore
            }
            showWait();
            if (msg.phase !== 'lobby') App.show('v-player');
            return;
        }
        if (msg.t === 'role') {
            role = msg.role;
            showWait();
            return;
        }
        if (msg.t === 's') {
            pub = msg.pub;
            me = msg.me;
            if (pub.phase !== 'lobby' && !ended && !$('v-player').classList.contains('active')) {
                App.show('v-player');
                Sound.play('bell');
                renderInfo();
            }
            if (pub.phase !== 'lobby') render();
            return;
        }
        if (msg.t === 'news') {
            const it = msg.item;
            if (['rumor', 'yes', 'no', 'flash', 'alert'].includes(it.kind) && it.sec !== lastNews) {
                lastNews = it.sec;
                newsFlash(it);
            }
            return;
        }
        if (msg.t === 'note') {
            toast(msg.text, msg.kind === 'bad' ? 'bad' : 'good');
            if (msg.kind === 'bad') Sound.play('alarm');
            return;
        }
        if (msg.t === 'res') {
            if (!msg.ok && msg.msg) {
                toast(msg.msg, 'bad');
                Sound.play('error');
            } else if (msg.ok && msg.q) {
                toast(`${msg.q > 0 ? 'Gekauft' : 'Verkauft'}: ${Math.abs(msg.q)} × ${fmt(msg.price)} CHF/t`, 'good');
                Sound.play(msg.q > 0 ? 'buy' : 'sell');
                if (navigator.vibrate) navigator.vibrate(30);
            } else if (msg.ok && msg.msg) toast(msg.msg, 'good');
            return;
        }
        if (msg.t === 'end') {
            ended = true;
            showEnd(msg);
        }
    }

    // ===== Warteraum =====

    function showWait() {
        const R = ROLES[role];
        $('w-role').innerHTML = `<span style="color:${R.color}">${R.icon} ${R.name}</span>`;
        $('w-title').textContent = `Willkommen, ${name}!`;
        $('w-mission').innerHTML = R.mission;
        $('w-hint').innerHTML = `💡 ${R.hint}`;
        $('w-roles').querySelectorAll('[data-role]').forEach(b => b.classList.toggle('active', b.dataset.role === role));
        App.show('v-wait');
        Sound.init();
        Sound.play('join');
    }

    // ===== Spielansicht =====

    const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    function render() {
        if (!me || !pub) return;
        const R = ROLES[me.role];
        $('p-role').innerHTML = `<span style="color:${R.color}">${R.icon}</span> ${esc(me.name)}`;
        $('p-month').textContent = pub.phase === 'settle' ? 'Abrechnung' : `Monat ${pub.month}/${pub.months}`;
        $('p-timer').textContent = pub.phase === 'settle' ? '⏸' : mmss(pub.secLeft);
        $('p-timer').classList.toggle('urgent', pub.phase === 'trading' && pub.secLeft <= 10);
        $('p-rank').textContent = `#${me.rank}/${pub.playerCount}`;

        const prev = Number($('p-price').dataset.v || pub.price);
        $('p-price').textContent = fmt(pub.price);
        $('p-price').dataset.v = pub.price;
        $('p-price').className = `big-price ${pub.price > prev ? 'up' : pub.price < prev ? 'down' : ''}`;
        const ch = pub.price / pub.p0 - 1;
        $('p-change').innerHTML = `<span class="${ch >= 0 ? 'up' : 'down'}">${pct(ch)}</span> <span class="dim">seit Start · Plan ${fmt(pub.p0)}</span>`;
        spark(pub.history);
        if (pub.feed && pub.feed[0]) $('p-news').innerHTML = `<span>${pub.feed[0].icon}</span> ${esc(pub.feed[0].text)}`;

        // Risiko in Tonnen
        const exp = me.exposure;
        $('p-exp').textContent = `${exp > 0 ? '+' : exp < 0 ? '−' : '±'}${Math.abs(exp)} t`;
        $('p-exp').className = Math.abs(exp) <= 20 ? 'good' : Math.abs(exp) >= 80 ? 'bad' : '';
        const g = $('p-gauge');
        const w = clamp(Math.abs(exp) / 200, 0, 0.5) * 100;
        g.style.width = `${w}%`;
        g.style.left = exp >= 0 ? '50%' : `${50 - w}%`;
        g.className = `gauge-bar ${Math.abs(exp) <= 20 ? 'ok' : exp > 0 ? 'long' : 'short'}`;
        const per = Math.abs(exp) * 100;
        let txt;
        if (me.role === 'spec') txt = exp === 0 ? 'Keine Position – kein Risiko, keine Chance.' : `Steigt Kakao um 100 CHF/t, ${exp > 0 ? 'gewinnst' : 'verlierst'} du ${fmt(per)} CHF.`;
        else if (Math.abs(exp) <= 20) txt = `🛡️ Gut abgesichert. Der Preis kann dir fast egal sein. Hedge-Quote bisher: <b>${Math.round(me.hedgeQuote * 100)} %</b>`;
        else txt = `${exp > 0 ? '⚠️ Fällt' : '⚠️ Steigt'} Kakao um 100 CHF/t, verlierst du ${fmt(per)} CHF. ${me.role === 'producer' ? 'Verkaufe' : 'Kaufe'} Futures, um dich abzusichern. Hedge-Quote bisher: <b>${Math.round(me.hedgeQuote * 100)} %</b>`;
        if (exp && me.role !== 'spec' && Math.sign(exp) !== Math.sign(R.physical)) txt = '🎲 Du bist überabgesichert – das ist jetzt eine Wette in die Gegenrichtung.';
        $('p-exp-text').innerHTML = txt;

        // Position
        $('p-pos').innerHTML = me.pos ? `<span class="${me.pos > 0 ? 'up' : 'down'}">${me.pos > 0 ? 'Long' : 'Short'} ${Math.abs(me.pos)}</span> <span class="dim">(${Math.abs(me.pos * CFG.size)} t)</span>` : '<span class="dim">keine</span>';
        $('p-unreal').textContent = signed(me.unreal);
        $('p-unreal').className = me.unreal > 0 ? 'up' : me.unreal < 0 ? 'down' : '';
        $('p-margin').textContent = `${fmtCHF(me.eq)} / ${fmt(me.req)}`;
        const mr = me.req ? clamp(me.eq / me.req, 0, 1.5) / 1.5 : 1;
        $('p-mbar').style.width = `${mr * 100}%`;
        $('p-mbar').className = me.req && me.eq < me.req * CFG.maintenance ? 'bad' : me.req && me.eq < me.req ? 'warn' : '';
        $('p-cash').textContent = fmtCHF(me.cash);
        $('p-result').textContent = `${signed(me.result)}${me.bonus ? ` (+${fmt(me.bonus)} Bonus)` : ''}`;
        $('p-result').className = me.result >= 0 ? 'up' : 'down';

        // Kurse
        const ask = Math.round(pub.price * (1 + CFG.spread));
        const bid = Math.round(pub.price * (1 - CFG.spread));
        $('p-ask').textContent = fmt(ask);
        $('p-bid').textContent = fmt(bid);
        const closed = pub.phase !== 'trading' || me.bankrupt;
        $('p-buy').disabled = closed;
        $('p-sell').disabled = closed;
        if (ofPrice === null) ofPrice = pub.price;
        $('of-qty').textContent = ofQty;
        $('of-price').textContent = fmt(ofPrice);
        renderOffers();
        renderRolePanel();
        renderCall();
    }

    // ===== Rollen-Panel: jede Rolle hat eigene Entscheidungen =====

    let panelKey = '';
    function renderRolePanel() {
        const el = $('p-rolepanel');
        let html = '';
        if (me.role === 'producer') {
            const d = me.physical - 100;
            const pods = Math.round(me.physical / 10);
            html = `<div class="rp-head"><span>🌱 Deine Plantage</span><b>${me.physical} t</b></div>
                <div class="pods">${Array.from({ length: 12 }, (_, i) => `<span class="${i < pods ? 'on' : ''}">🫘</span>`).join('')}</div>
                <div class="small">${d === 0 ? 'Erwartete Ernte wie geplant.' : `Erwartete Ernte <b class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${Math.abs(d)} t</b> gegenüber Plan.`}
                Abgesichert: <b>${Math.max(0, -me.pos * CFG.size)} t</b> von ${me.physical} t${-me.pos * CFG.size > me.physical ? ' <span class="bad">→ überabgesichert!</span>' : ''}.</div>
                ${me.harvestLog.map(h => `<div class="rp-log ${h.d < 0 ? 'bad' : 'good'}">${h.d < 0 ? '▼' : '▲'} ${Math.abs(h.d)} t · ${esc(h.text)}</div>`).join('')}
                ${me.protect ? '<div class="rp-ok">🛡️ Pflanzenschutz aktiv: Ernteverluste werden halbiert.</div>'
                    : `<button class="btn btn-ghost full" data-rp="protect">🛡️ Pflanzenschutz kaufen (${fmt(CFG.protectCost)} CHF)<small>halbiert Ernteverluste durch Dürre und Krankheit</small></button>`}`;
        } else if (me.role === 'processor') {
            const o = me.orderOffer;
            const orderT = me.orders.reduce((s, x) => s + x.t, 0);
            html = `<div class="rp-head"><span>🏭 Deine Aufträge</span><b>${-me.physical} t Bedarf</b></div>
                ${o ? `<div class="order-card"><div class="oc-top"><b>📦 ${esc(o.client)}</b><span class="oc-left">${o.left}s</span></div>
                    <div>Bestellt Schokolade aus <b>${o.t} t Kakao</b> zum festen Erlös von <b>${fmt(o.price)} CHF/t</b>.</div>
                    <div class="small">Heute kostet Kakao ${fmt(pub.price)} → Marge <b class="up">${fmt(o.price - pub.price)} CHF/t</b> (= ${fmt((o.price - pub.price) * o.t)} CHF) – aber nur, wenn du den Einkauf absicherst.</div>
                    <div class="oc-btns"><button class="btn btn-primary" data-rp="order-yes">Annehmen</button><button class="btn btn-ghost" data-rp="order-no">Ablehnen</button></div></div>`
                    : '<div class="small dim">Warte auf den nächsten Kundenauftrag …</div>'}
                <div class="small">Grundbedarf 100 t${orderT ? ` + ${orderT} t aus ${me.orders.length} Aufträgen` : ''}. Abgesichert: <b>${Math.max(0, me.pos * CFG.size)} t</b> von ${-me.physical} t.</div>
                ${me.orders.slice(-3).map(x => `<div class="rp-log">✔ ${esc(x.client)} · ${x.t} t zu ${fmt(x.price)} · Marge heute <b class="${x.price - pub.price >= 0 ? 'up' : 'down'}">${signed((x.price - pub.price) * x.t)}</b></div>`).join('')}`;
        } else {
            const last = me.reports[me.reports.length - 1];
            html = `<div class="rp-head"><span>🦈 Research-Abteilung</span><b>${me.rumorActive ? '🔥 Gerücht läuft' : 'ruhig'}</b></div>
                ${last ? `<div class="report">🕵️ ${esc(last.text)}</div>` : '<div class="small dim">Noch kein Bericht. Research lohnt sich, solange ein Gerücht läuft: Wer früher weiss, ob es stimmt, kann vor allen anderen handeln.</div>'}
                <button class="btn btn-ghost full" data-rp="research" ${me.researchReady ? 'disabled' : ''}>🕵️ Research-Bericht kaufen (${fmt(me.rumorActive ? CFG.researchCost : CFG.researchCost / 2)} CHF)${me.researchReady ? ` · bereit in ${me.researchReady}s` : ''}<small>Trefferquote ca. ${Math.round(CFG.researchHit * 100)} % – nicht immer richtig!</small></button>`;
        }
        const key = html;
        if (key === panelKey) return;
        panelKey = key;
        el.className = `card p-rolepanel ${me.role}`;
        el.innerHTML = html;
        el.querySelectorAll('[data-rp]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.rp;
            if (a === 'protect') send({ t: 'protect' });
            if (a === 'order-yes') send({ t: 'order', accept: true });
            if (a === 'order-no') send({ t: 'order', accept: false });
            if (a === 'research') send({ t: 'research' });
        }));
    }

    function renderOffers() {
        const list = pub.offers.map(o => {
            const mine = o.by === me.id;
            const takerBuys = o.side === 'sell';
            return `<div class="p-offer ${o.side}">
                <div><b>${ROLES[o.role].icon} ${esc(o.byName)}</b> <span class="${o.side === 'sell' ? 'down' : 'up'}">${o.side === 'sell' ? 'verkauft' : 'kauft'}</span> ${o.qty} @ <b>${fmt(o.price)}</b>
                <div class="obar"><span style="width:${(o.left / CFG.offerSec) * 100}%"></span></div></div>
                ${mine ? `<button class="btn btn-ghost btn-sm" data-cancel="${o.id}">Zurückziehen</button>` : `<button class="btn btn-sm ${takerBuys ? 'btn-buy' : 'btn-sell'}" data-accept="${o.id}">${takerBuys ? 'Kaufen' : 'Verkaufen'}</button>`}</div>`;
        }).join('');
        $('p-offers').innerHTML = list || '<div class="dim small">Keine Angebote. Stell selbst eines aufs Board – andere Trader können es annehmen.</div>';
        $('p-offers').querySelectorAll('[data-accept]').forEach(b => b.addEventListener('click', () => send({ t: 'accept', id: Number(b.dataset.accept) })));
        $('p-offers').querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => send({ t: 'cancel', id: Number(b.dataset.cancel) })));
    }

    let callShown = false;
    function renderCall() {
        const ov = $('call-ov');
        if (!me.call) {
            ov.classList.add('hidden');
            callShown = false;
            return;
        }
        if (!callShown) {
            Sound.play('alarm');
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            callShown = true;
        }
        ov.classList.remove('hidden');
        ov.innerHTML = `<div class="call-card"><div class="call-title">📞 MARGIN CALL</div>
            <div class="call-timer">${me.call.left}s</div>
            <p>Dein Margin-Konto liegt unter ${Math.round(CFG.maintenance * 100)} % des nötigen Einschusses. Schiess <b>${fmt(me.call.need)} CHF</b> nach oder verkleinere deine Position – sonst wird sie zwangsweise glattgestellt.</p>
            <button class="btn btn-primary btn-big" id="call-top" ${me.cash < me.call.need ? 'disabled' : ''}>Nachschiessen (${fmt(me.call.need)})</button>
            <button class="btn btn-ghost" id="call-reduce">Position halbieren</button></div>`;
        $('call-top').onclick = () => send({ t: 'topup' });
        $('call-reduce').onclick = () => send({ t: 'reduce' });
    }

    function spark(data) {
        const cv = $('p-spark');
        const dpr = window.devicePixelRatio || 1;
        const W = cv.clientWidth || 140;
        const H = cv.clientHeight || 56;
        if (cv.width !== W * dpr) {
            cv.width = W * dpr;
            cv.height = H * dpr;
        }
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, W, H);
        if (!data || data.length < 2) return;
        const lo = Math.min(...data);
        const hi = Math.max(...data);
        const span = hi - lo || 1;
        const up = data[data.length - 1] >= data[0];
        c.beginPath();
        data.forEach((v, i) => {
            const x = (i / (data.length - 1)) * (W - 4) + 2;
            const y = H - 4 - ((v - lo) / span) * (H - 8);
            i ? c.lineTo(x, y) : c.moveTo(x, y);
        });
        c.strokeStyle = up ? '#22e58a' : '#ff4d6a';
        c.lineWidth = 2;
        c.stroke();
    }

    function newsFlash(it) {
        const el = $('p-flash');
        const label = { rumor: 'GERÜCHT', yes: 'BESTÄTIGT', no: 'DEMENTI', flash: 'EILMELDUNG', alert: 'ACHTUNG' }[it.kind];
        el.className = `p-flash ${it.kind}`;
        el.innerHTML = `<b>${label}</b> ${it.icon} ${esc(it.text.replace(/^[A-ZÄÖÜ ]+: /, ''))}`;
        Sound.play(it.kind === 'alert' ? 'alarm' : 'news');
        if (navigator.vibrate) navigator.vibrate(60);
        clearTimeout(newsFlash.t);
        newsFlash.t = setTimeout(() => el.classList.add('hidden'), 4500);
    }

    function toast(text, kind = '') {
        const el = document.createElement('div');
        el.className = `p-toast ${kind}`;
        el.textContent = text;
        $('p-toasts').appendChild(el);
        while ($('p-toasts').children.length > 3) $('p-toasts').firstChild.remove();
        setTimeout(() => el.remove(), 3500);
    }

    function renderInfo() {
        const R = ROLES[role];
        $('tab-info').innerHTML = `<h3>${R.icon} Deine Mission</h3><p>${R.mission}</p><p>💡 ${R.hint}</p>
            <h3>So läuft's</h3><ul class="info-list">
                <li>1 Kontrakt = <b>${CFG.size} t</b> Kakao, Lieferung Dezember. Einschuss ${Math.round(CFG.marginRate * 100)} % des Werts.</li>
                <li><b>Kaufen</b> = Long (gewinnt, wenn Kakao steigt). <b>Verkaufen</b> = Short (gewinnt, wenn Kakao fällt).</li>
                <li>Am Ende jedes Monats wird abgerechnet (Mark-to-Market). Unter ${Math.round(CFG.maintenance * 100)} % Einschuss gibt's einen Margin Call.</li>
                <li>Auf dem <b>Board</b> könnt ihr direkt miteinander handeln – ohne Spread, halbe Gebühr.</li>
                <li>Gerüchte bewegen den Preis schon <i>vor</i> der Bestätigung.</li>
                ${R.physical ? `<li>Hedger erhalten bis zu <b>${fmt(CFG.missionBonus)} CHF Bonus</b> – je konsequenter abgesichert, desto mehr.</li>` : ''}
            </ul>
            <h3>Begriffe</h3>${GLOSSARY.map(([t, d]) => `<p><b>${t}:</b> ${d}</p>`).join('')}`;
    }

    // ===== Ende =====

    function showEnd(msg) {
        App.show('v-pend');
        const r = msg.row;
        const R = ROLES[r.role];
        Sound.play('end');
        const hedgeTxt = r.role === 'spec'
            ? `Als Hedgefonds hast du ${r.futPL >= 0 ? 'mit' : 'beim'} Spekulieren <b>${signed(r.futPL)} CHF</b> ${r.futPL >= 0 ? 'verdient' : 'verloren'}.`
            : `${r.role === 'producer' ? `Ernte: <b>${r.physical} t</b>. ` : `Aufträge: ${r.orders} (${r.orderT} t). `}Ohne Futures hätte dir dein Geschäft <b>${signed(r.physPL)} CHF</b> gebracht. Deine Futures: <b>${signed(r.futPL)} CHF</b>. Zusammen: <b>${signed(r.result)} CHF</b>. Hedge-Quote ${Math.round(r.hedgeQuote * 100)} %${r.bonus ? `, Bonus +${fmt(r.bonus)}` : ''}.`;
        $('p-end').innerHTML = `<div class="card">
            <div class="end-rank">#${msg.rank}<span class="dim">/${msg.total}</span></div>
            <div class="role-badge" style="color:${R.color}">${R.icon} ${R.name}</div>
            <h2>${esc(r.name)}</h2>
            <div class="end-score ${r.score >= 0 ? 'up' : 'down'}">${signed(r.score)} CHF</div>
            <p>Schlusskurs ${fmt(msg.final)} CHF/t (${pct(msg.final / msg.p0 - 1)}).</p>
            <p>${hedgeTxt}</p>
            ${r.liquidations ? `<p class="bad">📞 ${r.liquidations}× zwangsweise glattgestellt.</p>` : ''}
            <h3>🏆 Top 3</h3><ol class="top3">${msg.top.map(t => `<li>${ROLES[t.role].icon} ${esc(t.name)} <b>${signed(t.score)}</b></li>`).join('')}</ol>
            <p class="dim small">Die ausführliche Auswertung steht auf dem grossen Bildschirm.</p></div>`;
    }

    // ===== Bedienelemente =====

    function bind() {
        $('p-qty').querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
            qty = Number(b.dataset.q);
            $('p-qty').querySelectorAll('[data-q]').forEach(x => x.classList.toggle('active', x === b));
        }));
        $('p-buy').addEventListener('click', () => send({ t: 'trade', q: qty }));
        $('p-sell').addEventListener('click', () => send({ t: 'trade', q: -qty }));
        $('of-side').querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => {
            ofSide = b.dataset.side;
            $('of-side').querySelectorAll('[data-side]').forEach(x => x.classList.toggle('active', x === b));
            if (pub) ofPrice = Math.round(pub.price * (ofSide === 'sell' ? 1.003 : 0.997));
            render();
        }));
        document.querySelectorAll('[data-of]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.of;
            if (a === 'q-') ofQty = Math.max(1, ofQty - 1);
            if (a === 'q+') ofQty = Math.min(10, ofQty + 1);
            const step = Math.max(1, Math.round((pub ? pub.price : CFG.p0) * 0.002));
            if (a === 'p-') ofPrice -= step;
            if (a === 'p+') ofPrice += step;
            render();
        }));
        $('of-post').addEventListener('click', () => send({ t: 'offer', side: ofSide, qty: ofQty, price: ofPrice }));
        document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('.tabs [data-tab]').forEach(x => x.classList.toggle('active', x === b));
            $('tab-board').classList.toggle('hidden', b.dataset.tab !== 'board');
            $('tab-info').classList.toggle('hidden', b.dataset.tab !== 'info');
        }));
        $('btn-rejoin').addEventListener('click', () => join(code, name));
        $('w-roles').querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.role === role) return;
            Sound.play('join');
            send({ t: 'role', role: b.dataset.role });
        }));
    }

    return { join, bind };
})();
