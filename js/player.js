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
        document.body.dataset.role = role;
        $('w-card').style.setProperty('--rc', R.color);
        $('w-icon').textContent = R.icon;
        $('w-role').innerHTML = `<span style="color:${R.color}">${R.name}</span><small>${R.job}</small>`;
        $('w-title').textContent = `Willkommen, ${name}!`;
        $('w-mission').innerHTML = R.mission;
        $('w-rules').innerHTML = roleRules(R);
        $('w-earn').innerHTML = `<p class="future-intro">📜 ${FUTURE_INTRO}</p>${earnHTML(role)}`;
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
        document.body.dataset.role = me.role;
        $('p-role').innerHTML = `<span class="p-emb">${R.icon}</span><span><b>${esc(me.name)}</b><small>${R.job}</small></span>`;
        $('p-month').textContent = pub.phase === 'settle' ? 'Abrechnung' : `Monat ${pub.month}/${pub.months}`;
        $('p-timer').textContent = pub.phase === 'settle' ? '⏸' : mmss(pub.secLeft);
        $('p-timer').classList.toggle('urgent', pub.phase === 'trading' && pub.secLeft <= 10);
        $('p-rank').textContent = `#${me.rank}/${me.roleCount}`;

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
        else if (Math.abs(exp) <= 20) txt = `🛡️ Gut abgesichert. Der Preis kann dir fast egal sein. Abgesichert: <b>${Math.round(me.hedged * 100)} %</b>`;
        else txt = `${exp > 0 ? '⚠️ Fällt' : '⚠️ Steigt'} Kakao um 100 CHF/t, verlierst du ${fmt(per)} CHF. ${me.role === 'producer' ? 'Verkaufe' : 'Kaufe'} Futures, um dich abzusichern. Abgesichert: <b>${Math.round(me.hedged * 100)} %</b>`;
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
        if (me.role === 'producer') {
            $('p-result-l').textContent = 'Dein erzielter Preis';
            $('p-result').textContent = `${fmt(me.metric)} CHF/t`;
            $('p-result').className = me.metric >= CFG.p0 ? 'up' : 'down';
        } else if (me.role === 'processor') {
            $('p-result-l').textContent = 'Dein Einkaufspreis';
            $('p-result').textContent = `${fmt(me.metric)} CHF/t`;
            $('p-result').className = me.metric <= CFG.p0 ? 'up' : 'down';
        } else {
            $('p-result-l').textContent = 'Gewinn';
            $('p-result').textContent = signed(me.result);
            $('p-result').className = me.result >= 0 ? 'up' : 'down';
        }

        // Kurse
        const ask = Math.round(pub.price * (1 + CFG.spread));
        const bid = Math.round(pub.price * (1 - CFG.spread));
        $('p-ask').textContent = fmt(ask);
        $('p-bid').textContent = fmt(bid);
        const closed = pub.phase !== 'trading' || me.bankrupt;
        renderTrade(closed);
        if (ofPrice === null) ofPrice = pub.price;
        $('of-qty').textContent = ofQty;
        $('of-price').textContent = fmt(ofPrice);
        Scenes.render(me, pub);
        renderOffers();
        renderRolePanel();
        renderCall();
    }

    // ===== Handels-Karte: jede Rolle hat ihr eigenes Mandat =====

    // Erlaubte Menge für Kauf (q>0) bzw. Verkauf (q<0) gemäss Mandat.
    function room(dir) {
        const b = me.bounds;
        if (dir > 0) return me.pos < b.max ? b.max - me.pos : (me.pos < 0 ? -me.pos : 0);
        return me.pos > b.min ? me.pos - b.min : (me.pos > 0 ? me.pos : 0);
    }

    function setBtn(id, label, sub) {
        $(`${id}-l`).textContent = label;
        $(`${id}-s`).textContent = sub;
    }

    function renderTrade(closed) {
        const b = me.bounds;
        const tb = $('p-tbtns');
        let hedged;
        let need;
        if (me.role === 'producer') {
            need = Math.max(0, me.physical);
            hedged = Math.max(0, -me.pos * CFG.size);
            $('p-trade-title').textContent = '🔒 Ernte auf Termin verkaufen';
            $('p-trade-sub').textContent = 'Nur Short · max. deine Ernte';
            setBtn('p-sell', 'ABSICHERN', 'Ernte verkaufen');
            setBtn('p-buy', 'AUFLÖSEN', 'Rückkauf');
            tb.classList.add('rev');
        } else if (me.role === 'processor') {
            need = Math.max(0, -me.physical);
            hedged = Math.max(0, me.pos * CFG.size);
            $('p-trade-title').textContent = '🔒 Einkauf auf Termin sichern';
            $('p-trade-sub').textContent = 'Nur Long · max. dein Bedarf';
            setBtn('p-buy', 'ABSICHERN', 'Kakao kaufen');
            setBtn('p-sell', 'AUFLÖSEN', 'Verkauf');
            tb.classList.remove('rev');
        } else {
            $('p-trade-title').textContent = '⚡ Trading-Desk';
            $('p-trade-sub').textContent = `Long & Short · Limit ±${b.max}`;
            setBtn('p-buy', 'KAUFEN', 'Long');
            setBtn('p-sell', 'VERKAUFEN', 'Short');
            tb.classList.remove('rev');
        }
        const hedger = me.role !== 'spec';
        $('p-buy').classList.toggle('primary', hedger && me.role === 'processor');
        $('p-buy').classList.toggle('secondary', hedger && me.role === 'producer');
        $('p-sell').classList.toggle('primary', hedger && me.role === 'producer');
        $('p-sell').classList.toggle('secondary', hedger && me.role === 'processor');
        $('p-buy').disabled = closed || room(1) <= 0;
        $('p-sell').disabled = closed || room(-1) <= 0;
        // Absicherungs-Meter bzw. Positions-Meter
        let html;
        if (me.role === 'spec') {
            const w = (Math.abs(me.pos) / b.max) * 50;
            html = `<div class="hm-row"><span>Short ${b.max}</span><b class="${me.pos > 0 ? 'up' : me.pos < 0 ? 'down' : ''}">${me.pos > 0 ? 'Long ' : me.pos < 0 ? 'Short ' : ''}${Math.abs(me.pos)}</b><span>Long ${b.max}</span></div>
                <div class="hm-bar mid"><i class="${me.pos >= 0 ? 'long' : 'short'}" style="left:${me.pos >= 0 ? 50 : 50 - w}%;width:${w}%"></i></div>`;
        } else {
            const q = need ? hedged / need : 0;
            const over = hedged > need;
            html = `<div class="hm-row"><span>Abgesichert</span><b class="${over ? 'bad' : q >= 0.7 ? 'good' : ''}">${hedged} t <span class="dim">/ ${need} t</span></b><span>${Math.round(q * 100)} %</span></div>
                <div class="hm-bar"><i class="${over ? 'over' : 'fill'}" style="width:${Math.min(100, q * 100)}%"></i><em class="bankmark" style="left:${CFG.bankQuota * 100}%"></em><em style="left:100%"></em></div>
                ${over ? '<div class="small bad">⚠️ Überabgesichert – baue die Position ab (AUFLÖSEN).</div>' : ''}
                <div class="hedge-effect ${me.hedgeEffect >= 0 ? 'good' : 'bad'}">🛡️ Deine Absicherung hat dir bisher <b>${me.hedgeEffect >= 0 ? `+${fmt(me.hedgeEffect)} CHF gerettet` : `${fmt(-me.hedgeEffect)} CHF gekostet`}</b><small>${me.hedgeEffect >= 0 ? 'Ohne Futures stündest du so viel schlechter da.' : 'Ohne Futures stündest du besser da – dafür warst du geschützt.'}</small></div>
                <div class="score-line"><span>🎯 ${me.role === 'producer' ? 'Dein Preis bisher' : 'Dein Einkauf bisher'}</span><b class="${(me.role === 'producer' ? me.metric >= CFG.p0 : me.metric <= CFG.p0) ? 'good' : 'bad'}">${fmt(me.metric)} CHF/t</b><span class="rank-pill">#${me.rank} von ${me.roleCount}</span></div>
                ${me.bank === 'ok' ? '<div class="bank-line ok">🏦 Bankauflage erfüllt ✔</div>'
                    : me.bank === 'fail' ? `<div class="bank-line bad">🏦 Bankauflage verfehlt – ${fmt(CFG.bankFee)} CHF Zuschlag bezahlt</div>`
                    : `<div class="bank-line ${q >= CFG.bankQuota ? 'ok' : 'warn'}">🏦 Bank: bis Ende Monat ${CFG.bankMonth} mind. ${Math.round(CFG.bankQuota * 100)} % absichern${q >= CFG.bankQuota ? ' ✔' : ` – sonst ${fmt(CFG.bankFee)} CHF Zuschlag`}</div>`}`;
        }
        if ($('p-hmeter').dataset.h !== html) {
            $('p-hmeter').dataset.h = html;
            $('p-hmeter').innerHTML = html;
        }
    }

    // ===== Rollen-Panel: jede Rolle hat eigene Entscheidungen =====

    let panelKey = '';
    function renderRolePanel() {
        const el = $('p-rolepanel');
        let html = '';
        if (me.role === 'producer') {
            const d = me.physical - 100;
            const b = me.buyerOffer;
            const soldT = me.sales.reduce((s, x) => s + x.t, 0);
            const pricey = me.protectPrice > CFG.protectLow;
            html = `<div class="rp-head"><span>🌱 Deine Plantage</span><b>${me.physical} t</b></div>
                ${b ? `<div class="order-card buyer"><div class="oc-top"><b>🤝 ${esc(b.client)}</b><span class="oc-left">${b.left}s</span></div>
                    <div>Will <b>${b.t} t</b> zum festen Preis von <b>${fmt(b.price)} CHF/t</b> kaufen.</div>
                    <div class="small">Börse gerade ${fmt(pub.price)} → das Angebot ist <b class="${b.price >= pub.price ? 'up' : 'down'}">${b.price >= pub.price ? `${fmt(b.price - pub.price)} besser` : `${fmt(pub.price - b.price)} schlechter`}</b> als die Börse. Wer weiss, wo der Preis im Dezember steht?</div>
                    <div class="oc-btns"><button class="btn btn-primary" data-rp="buyer-yes">Verkaufen</button><button class="btn btn-ghost" data-rp="buyer-no">Ablehnen</button></div></div>`
                    : '<div class="small dim">Warte auf das nächste Händler-Angebot …</div>'}
                <div class="small">Noch nicht verkaufte Ernte: <b>${me.physical} t</b>${soldT ? ` · direkt verkauft: ${soldT} t` : ''}. Abgesichert: <b>${Math.max(0, -me.pos * CFG.size)} t</b>${-me.pos * CFG.size > me.physical ? ' <span class="bad">→ überabgesichert! Löse einen Teil auf.</span>' : ''}</div>
                ${me.harvestLog.map(h => `<div class="rp-log ${h.d < 0 ? 'bad' : 'good'}">${h.d < 0 ? '▼' : '▲'} ${Math.abs(h.d)} t · ${esc(h.text)}</div>`).join('')}
                ${me.sales.map(s => `<div class="rp-log">✔ ${esc(s.client)} · ${s.t} t zu ${fmt(s.price)} · heute <b class="${s.price >= pub.price ? 'up' : 'down'}">${signed((s.price - pub.price) * s.t)}</b></div>`).join('')}
                ${me.protect ? '<div class="rp-ok">🛡️ Pflanzenschutz aktiv: Ernteverluste werden halbiert.</div>'
                    : `<button class="btn btn-ghost full ${pricey ? 'pricey' : ''}" data-rp="protect">🛡️ Pflanzenschutz (Versicherung) · ${fmt(me.protectPrice)} CHF<small>${pricey ? '⚠️ Ein Gerücht läuft – die Versicherung ist jetzt teuer!' : 'Jetzt günstig. Läuft ein Dürre-Gerücht, kostet sie ' + fmt(CFG.protectHigh) + ' CHF.'} Halbiert Ernteverluste.</small></button>`}`;
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
            if (a === 'buyer-yes') send({ t: 'buyer', accept: true });
            if (a === 'buyer-no') send({ t: 'buyer', accept: false });
            if (a === 'research') send({ t: 'research' });
        }));
    }

    function renderOffers() {
        // Board-Formular: Hedger dürfen nur in ihre Richtung anbieten.
        const sides = me.role === 'producer' ? ['sell'] : me.role === 'processor' ? ['buy'] : ['sell', 'buy'];
        if (!sides.includes(ofSide)) ofSide = sides[0];
        $('of-side').querySelectorAll('[data-side]').forEach(x => {
            x.classList.toggle('hidden', !sides.includes(x.dataset.side));
            x.classList.toggle('active', x.dataset.side === ofSide);
        });
        const list = pub.offers.map(o => {
            const mine = o.by === me.id;
            const takerBuys = o.side === 'sell';
            const allowed = room(takerBuys ? 1 : -1) >= o.qty;
            return `<div class="p-offer ${o.side}">
                <div><b>${ROLES[o.role].icon} ${esc(o.byName)}</b> <span class="${o.side === 'sell' ? 'down' : 'up'}">${o.side === 'sell' ? 'verkauft' : 'kauft'}</span> ${o.qty} @ <b>${fmt(o.price)}</b>
                <div class="obar"><span style="width:${(o.left / CFG.offerSec) * 100}%"></span></div></div>
                ${mine ? `<button class="btn btn-ghost btn-sm" data-cancel="${o.id}">Zurückziehen</button>`
                    : allowed ? `<button class="btn btn-sm ${takerBuys ? 'btn-buy' : 'btn-sell'}" data-accept="${o.id}">${takerBuys ? 'Kaufen' : 'Verkaufen'}</button>`
                    : '<span class="locked">🔒 nicht dein Mandat</span>'}</div>`;
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
        const col = up ? '34,229,138' : '255,77,106';
        c.strokeStyle = `rgb(${col})`;
        c.lineWidth = 2;
        c.shadowColor = `rgba(${col},.6)`;
        c.shadowBlur = 8;
        c.stroke();
        c.shadowBlur = 0;
        c.lineTo(W - 2, H);
        c.lineTo(2, H);
        c.closePath();
        const gr = c.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, `rgba(${col},.28)`);
        gr.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = gr;
        c.fill();
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
        $('tab-info').innerHTML = `<h3>${R.icon} Deine Mission · ${R.job}</h3><p class="future-intro">📜 ${FUTURE_INTRO}</p>${earnHTML(role)}${roleRules(R)}<p>💡 ${R.hint}</p>
            <h3>So läuft's</h3><ul class="info-list">
                <li>1 Kontrakt = <b>${CFG.size} t</b> Kakao, Lieferung Dezember. Einschuss ${Math.round(CFG.marginRate * 100)} % des Werts.</li>
                <li><b>Kaufen</b> = Long (gewinnt, wenn Kakao steigt). <b>Verkaufen</b> = Short (gewinnt, wenn Kakao fällt).</li>
                <li>Am Ende jedes Monats wird abgerechnet (Mark-to-Market). Unter ${Math.round(CFG.maintenance * 100)} % Einschuss gibt's einen Margin Call.</li>
                <li>Gerüchte bewegen den Preis schon <i>vor</i> der Bestätigung.</li>
                ${R.physical ? `<li><b>Wertung:</b> Du trittst gegen die anderen ${R.short === 'Fabrik' ? 'Fabriken' : 'Kooperativen'} an. ${role === 'producer' ? 'Wer den höchsten Preis pro Tonne erzielt, gewinnt.' : 'Wer am günstigsten einkauft, gewinnt (Auftragsmargen senken deinen Preis).'}</li><li>🏦 <b>Bankauflage:</b> Bis Ende Monat ${CFG.bankMonth} mindestens ${Math.round(CFG.bankQuota * 100)} % absichern, sonst ${fmt(CFG.bankFee)} CHF Zuschlag.</li><li>💸 Margin Calls treffen auch Hedger: Wer zu viel absichert und zu wenig Bargeld hat, wird zwangsweise glattgestellt.</li>` : '<li><b>Wertung:</b> Der Hedgefonds mit dem höchsten Gewinn gewinnt.</li>'}
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
            : `${r.role === 'producer' ? `Ernte: <b>${r.physical} t</b>. ` : `Aufträge: ${r.orders} (${r.orderT} t). `}Ohne Futures hätte dir dein Geschäft <b>${signed(r.physPL)} CHF</b> gebracht. Deine Futures: <b>${signed(r.futPL)} CHF</b>. Zusammen: <b>${signed(r.result)} CHF</b>.${r.bank === 'fail' ? ` Bankzuschlag: −${fmt(r.bankPaid)} CHF.` : ''}`;
        $('p-end').innerHTML = `<div class="card">
            <div class="end-rank">#${msg.rank}<span class="dim">/${msg.total}</span></div>
            <div class="role-badge" style="color:${R.color}">${R.icon} ${R.name}</div>
            <h2>${esc(r.name)}</h2>
            <div class="end-score ${r.role === 'spec' ? (r.score >= 0 ? 'up' : 'down') : ''}">${r.role === 'producer' ? `${fmt(r.metric)} CHF/t erzielt` : r.role === 'processor' ? `${fmt(r.metric)} CHF/t Einkauf` : `${signed(r.score)} CHF`}</div>
            <div class="dim small">Platz ${msg.rank} von ${msg.total} ${r.role === 'spec' ? 'Hedgefonds' : r.role === 'producer' ? 'Kooperativen' : 'Fabriken'}</div>
            <p>Schlusskurs ${fmt(msg.final)} CHF/t (${pct(msg.final / msg.p0 - 1)}).</p>
            <p>${hedgeTxt}</p>
            ${r.liquidations ? `<p class="bad">📞 ${r.liquidations}× zwangsweise glattgestellt.</p>` : ''}
            ${msg.star ? (msg.star.id === r.id ? `<div class="star-me">⭐ Du bist TRADER DES TAGES! (${signed(msg.star.points)} Punkte)</div>` : `<p class="dim small">⭐ Trader des Tages: <b>${esc(msg.star.name)}</b> · deine Punkte: ${signed(r.points)}</p>`) : ''}
            <h3>🏆 Top 3 deiner Rolle</h3><ol class="top3">${msg.top.map(t => `<li>${ROLES[t.role].icon} ${esc(t.name)} <b>${t.role === 'spec' ? signed(t.score) : `${fmt(t.metric)}/t`}</b></li>`).join('')}</ol>
            <p class="dim small">Die ausführliche Auswertung steht auf dem grossen Bildschirm.</p></div>`;
    }

    // ===== Bedienelemente =====

    function bind() {
        $('p-qty').querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
            qty = Number(b.dataset.q);
            $('p-qty').querySelectorAll('[data-q]').forEach(x => x.classList.toggle('active', x === b));
        }));
        // Menge automatisch aufs Mandat begrenzen (z. B. nur noch 3 Kontrakte bis zur vollen Absicherung).
        $('p-buy').addEventListener('click', () => send({ t: 'trade', q: me ? Math.max(1, Math.min(qty, room(1))) : qty }));
        $('p-sell').addEventListener('click', () => send({ t: 'trade', q: -(me ? Math.max(1, Math.min(qty, room(-1))) : qty) }));
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
