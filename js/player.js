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
    let mkt = 'cocoa';   // gewählter Markt: 'cocoa' oder 'sugar'
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
            if (pub.phase === 'shop' && !ended) {
                if (!$('v-shop').classList.contains('active')) {
                    App.show('v-shop');
                    shopKey = '';
                }
                renderShop();
                return;
            }
            if (pub.phase !== 'lobby' && !ended && !$('v-player').classList.contains('active')) {
                const fromShop = $('v-shop').classList.contains('active');
                App.show('v-player');
                Sound.play('bell');
                renderInfo();
                if (fromShop) {
                    panelKey = '';
                    yearBanner(pub.year);
                }
            }
            if (pub.phase !== 'lobby') render();
            return;
        }
        if (msg.t === 'yearEnd') {
            yearInfo = msg;
            Sound.play('end');
            if (msg.rank === 1) setTimeout(() => confetti(3000), 300);
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
        $('w-icon').innerHTML = roleIcon(role, 64);
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

    // Zahlen gleiten weich zum neuen Wert (statt zu springen)
    function tween(el, to, ms = 700) {
        const from = Number(el.dataset.tv || to);
        el.dataset.tv = to;
        if (from === to) { el.textContent = fmt(to); return; }
        const t0 = performance.now();
        const step = now => {
            if (Number(el.dataset.tv) !== to) return;
            const k = Math.min(1, (now - t0) / ms);
            const e = 1 - Math.pow(1 - k, 3);
            el.textContent = fmt(from + (to - from) * e);
            if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function render() {
        if (!me || !pub) return;
        const R = ROLES[me.role];
        document.body.dataset.role = me.role;
        if ($('p-role').dataset.k !== me.role + me.name + me.level) $('p-role').dataset.k = me.role + me.name + me.level, $('p-role').innerHTML = `<span class="p-emb">${roleIcon(me.role, 26)}</span><span><b>${esc(me.name)}</b><small>${RANKS[me.level].icon} ${RANKS[me.level].name} · ${R.job}</small></span>`;
        $('p-month').textContent = pub.phase === 'settle' ? 'Abrechnung' : `J${pub.year} · M${pub.month}/${pub.months}`;
        $('p-timer').textContent = pub.phase === 'settle' ? '⏸' : mmss(pub.secLeft);
        $('p-timer').classList.toggle('urgent', pub.phase === 'trading' && pub.secLeft <= 10);
        $('p-rank').textContent = `#${me.rank}/${me.roleCount}`;

        const prev = Number($('p-price').dataset.v || pub.price);
        tween($('p-price'), pub.price);
        $('p-price').dataset.v = pub.price;
        $('p-price').className = `big-price ${pub.price > prev ? 'up' : pub.price < prev ? 'down' : ''}`;
        const ch = pub.price / pub.p0 - 1;
        $('p-change').innerHTML = `<span class="${ch >= 0 ? 'up' : 'down'}">${pct(ch)}</span> <span class="dim">seit Start · Plan ${fmt(pub.p0)}</span>`;
        spark(pub.history);
        const sl = $('p-sugar');
        sl.classList.toggle('hidden', !(pub.sugar && pub.sugar.on));
        if (pub.sugar && pub.sugar.on) {
            const sc = pub.sugar.price / pub.sugar.p0 - 1;
            sl.innerHTML = `<span>🍬 Zucker</span><b>${fmt(pub.sugar.price)}</b><span class="${sc >= 0 ? 'up' : 'down'}">${pct(sc)}</span>${me.role === 'producer' ? '' : `<span class="dim">Pos. ${me.spos > 0 ? '+' : ''}${me.spos}</span>`}`;
        }
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
            $('p-result').className = me.metric >= pub.p0 ? 'up' : 'down';
        } else if (me.role === 'processor') {
            $('p-result-l').textContent = 'Dein Einkaufspreis';
            $('p-result').textContent = `${fmt(me.metric)} CHF/t`;
            $('p-result').className = me.metric <= pub.p0 ? 'up' : 'down';
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
        const sug = mkt === 'sugar';
        const b = sug ? me.sbounds : me.bounds;
        const pos = sug ? me.spos : me.pos;
        if (dir > 0) return pos < b.max ? b.max - pos : (pos < 0 ? -pos : 0);
        return pos > b.min ? pos - b.min : (pos > 0 ? pos : 0);
    }

    function canSugar() {
        return pub && pub.sugar && pub.sugar.on && me.role !== 'producer';
    }

    function setBtn(id, label, sub) {
        $(`${id}-l`).textContent = label;
        $(`${id}-s`).textContent = sub;
    }

    function renderTrade(closed) {
        if (!canSugar()) mkt = 'cocoa';
        const seg = $('p-mkt');
        seg.classList.toggle('hidden', !canSugar());
        seg.querySelectorAll('[data-mkt]').forEach(x => x.classList.toggle('active', x.dataset.mkt === mkt));
        if (mkt === 'sugar') return renderSugarTrade(closed);
        const ask = Math.round(pub.price * (1 + CFG.spread));
        const bid = Math.round(pub.price * (1 - CFG.spread));
        $('p-ask').textContent = fmt(ask);
        $('p-bid').textContent = fmt(bid);
        $('p-qty-unit').textContent = `Kontrakte à ${CFG.size} t`;
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
                <div class="score-line"><span>🎯 ${me.role === 'producer' ? 'Dein Preis bisher' : 'Dein Einkauf bisher'}</span><b class="${(me.role === 'producer' ? me.metric >= pub.p0 : me.metric <= pub.p0) ? 'good' : 'bad'}">${fmt(me.metric)} CHF/t</b><span class="rank-pill">#${me.rank} von ${me.roleCount}</span></div>
                ${me.bank === 'ok' ? '<div class="bank-line ok">🏦 Bankauflage erfüllt ✔</div>'
                    : me.bank === 'fail' ? `<div class="bank-line bad">🏦 Bankauflage verfehlt – ${fmt(CFG.bankFee)} CHF Zuschlag bezahlt</div>`
                    : `<div class="bank-line ${q >= CFG.bankQuota ? 'ok' : 'warn'}">🏦 Bank: bis Ende Monat ${CFG.bankMonth} mind. ${Math.round(CFG.bankQuota * 100)} % absichern${q >= CFG.bankQuota ? ' ✔' : ` – sonst ${fmt(CFG.bankFee)} CHF Zuschlag`}</div>`}`;
        }
        if ($('p-hmeter').dataset.h !== html) {
            $('p-hmeter').dataset.h = html;
            $('p-hmeter').innerHTML = html;
        }
    }

    // Zucker-Variante der Handelskarte (Fabrik: nur kaufen bis Bedarf, Fonds: frei)
    function renderSugarTrade(closed) {
        const s = pub.sugar;
        const b = me.sbounds;
        const tb = $('p-tbtns');
        $('p-ask').textContent = fmt(Math.round(s.price * (1 + CFG.spread * 1.5)));
        $('p-bid').textContent = fmt(Math.round(s.price * (1 - CFG.spread * 1.5)));
        $('p-qty-unit').textContent = `Kontrakte à ${CFG.sSize} t`;
        tb.classList.remove('rev');
        let html;
        if (me.role === 'processor') {
            $('p-trade-title').textContent = '🍬 Zucker-Einkauf sichern';
            $('p-trade-sub').textContent = `Bedarf ${-me.sphys} t pro Jahr`;
            setBtn('p-buy', 'ABSICHERN', 'Zucker kaufen');
            setBtn('p-sell', 'AUFLÖSEN', 'Verkauf');
            $('p-buy').classList.add('primary');
            $('p-sell').classList.add('secondary');
            $('p-buy').classList.remove('secondary');
            $('p-sell').classList.remove('primary');
            const need = Math.max(0, -me.sphys);
            const hedged = Math.max(0, me.spos * CFG.sSize);
            const q = need ? hedged / need : 0;
            html = `<div class="hm-row"><span>Zucker abgesichert</span><b class="${q >= 0.7 ? 'good' : ''}">${hedged} t <span class="dim">/ ${need} t</span></b><span>${Math.round(q * 100)} %</span></div>
                <div class="hm-bar sugar"><i class="fill" style="width:${Math.min(100, q * 100)}%"></i><em style="left:100%"></em></div>
                <div class="small dim">Zucker heute ${fmt(s.price)} CHF/t (Plan ${fmt(s.p0)}). Steigt Zucker, wird deine Schokolade teurer – ausser du hast abgesichert.</div>`;
        } else {
            $('p-trade-title').textContent = '🍬 Zucker-Desk';
            $('p-trade-sub').textContent = `Long & Short · Limit ±${b.max}`;
            setBtn('p-buy', 'KAUFEN', 'Long Zucker');
            setBtn('p-sell', 'VERKAUFEN', 'Short Zucker');
            ['p-buy', 'p-sell'].forEach(id => $(id).classList.remove('primary', 'secondary'));
            const w = (Math.abs(me.spos) / Math.max(1, b.max)) * 50;
            html = `<div class="hm-row"><span>Short ${b.max}</span><b class="${me.spos > 0 ? 'up' : me.spos < 0 ? 'down' : ''}">${me.spos > 0 ? 'Long ' : me.spos < 0 ? 'Short ' : ''}${Math.abs(me.spos)}</b><span>Long ${b.max}</span></div>
                <div class="hm-bar mid sugar"><i class="${me.spos >= 0 ? 'long' : 'short'}" style="left:${me.spos >= 0 ? 50 : 50 - w}%;width:${w}%"></i></div>
                <div class="small">Offener Gewinn Zucker: <b class="${me.sunreal >= 0 ? 'up' : 'down'}">${signed(me.sunreal)}</b></div>`;
        }
        $('p-buy').disabled = closed || room(1) <= 0;
        $('p-sell').disabled = closed || room(-1) <= 0;
        if ($('p-hmeter').dataset.h !== html) {
            $('p-hmeter').dataset.h = html;
            $('p-hmeter').innerHTML = html;
        }
    }

    // ===== Rollen-Panel: jede Rolle hat eigene Entscheidungen =====

    let panelKey = '';
    const seenCards = new Set();
    function freshCard(x) {
        const k = `${x.client}|${x.t}|${x.price}`;
        if (seenCards.has(k)) return '';
        seenCards.add(k);
        return ' fresh';
    }

    function renderRolePanel() {
        const el = $('p-rolepanel');
        let html = '';
        if (me.role === 'producer') {
            const d = me.physical - 100;
            const b = me.buyerOffer;
            const soldT = me.sales.reduce((s, x) => s + x.t, 0);
            const pricey = me.protectPrice > CFG.protectLow;
            html = `<div class="rp-head"><span>🌱 Deine Plantage</span><b>${me.physical} t</b></div>
                ${b ? `<div class="order-card buyer${freshCard(b)}"><div class="oc-top"><b>🤝 ${esc(b.client)}</b><span class="oc-left" data-left="${b.left}"></span></div>
                    <div>Will <b>${b.t} t</b> zum festen Preis von <b>${fmt(b.price)} CHF/t</b> kaufen.</div>
                    <div class="small live">Börse gerade ${fmt(pub.price)} → das Angebot ist <b class="${b.price >= pub.price ? 'up' : 'down'}">${b.price >= pub.price ? `${fmt(b.price - pub.price)} besser` : `${fmt(pub.price - b.price)} schlechter`}</b> als die Börse. Wer weiss, wo der Preis im Dezember steht?</div>
                    <div class="oc-btns"><button class="btn btn-primary" data-rp="buyer-yes">Verkaufen</button><button class="btn btn-ghost" data-rp="buyer-no">Ablehnen</button></div></div>`
                    : '<div class="small dim">Warte auf das nächste Händler-Angebot …</div>'}
                <div class="small">Noch nicht verkaufte Ernte: <b>${me.physical} t</b>${soldT ? ` · direkt verkauft: ${soldT} t` : ''}. Abgesichert: <b>${Math.max(0, -me.pos * CFG.size)} t</b>${-me.pos * CFG.size > me.physical ? ' <span class="bad">→ überabgesichert! Löse einen Teil auf.</span>' : ''}</div>
                ${me.harvestLog.map(h => `<div class="rp-log ${h.d < 0 ? 'bad' : 'good'}">${h.d < 0 ? '▼' : '▲'} ${Math.abs(h.d)} t · ${esc(h.text)}</div>`).join('')}
                ${me.sales.map(s => `<div class="rp-log live">✔ ${esc(s.client)} · ${s.t} t zu ${fmt(s.price)} · heute <b class="${s.price >= pub.price ? 'up' : 'down'}">${signed((s.price - pub.price) * s.t)}</b></div>`).join('')}
                ${me.protect ? '<div class="rp-ok">🛡️ Pflanzenschutz aktiv: Ernteverluste werden halbiert.</div>'
                    : `<button class="btn btn-ghost full ${pricey ? 'pricey' : ''}" data-rp="protect">🛡️ Pflanzenschutz (Versicherung) · ${fmt(me.protectPrice)} CHF<small>${pricey ? '⚠️ Ein Gerücht läuft – die Versicherung ist jetzt teuer!' : 'Jetzt günstig. Läuft ein Dürre-Gerücht, kostet sie ' + fmt(CFG.protectHigh) + ' CHF.'} Halbiert Ernteverluste.</small></button>`}`;
        } else if (me.role === 'processor') {
            const o = me.orderOffer;
            const orderT = me.orders.reduce((s, x) => s + x.t, 0);
            html = `<div class="rp-head"><span>🏭 Deine Aufträge</span><b>${-me.physical} t Bedarf</b></div>
                ${o ? `<div class="order-card${freshCard(o)}"><div class="oc-top"><b>📦 ${esc(o.client)}</b><span class="oc-left" data-left="${o.left}"></span></div>
                    <div>Bestellt Schokolade aus <b>${o.t} t Kakao</b> zum festen Erlös von <b>${fmt(o.price)} CHF/t</b>.</div>
                    <div class="small live">Heute kostet Kakao ${fmt(pub.price)} → Marge <b class="up">${fmt(o.price - pub.price)} CHF/t</b> (= ${fmt((o.price - pub.price) * o.t)} CHF) – aber nur, wenn du den Einkauf absicherst.</div>
                    <div class="oc-btns"><button class="btn btn-primary" data-rp="order-yes">Annehmen</button><button class="btn btn-ghost" data-rp="order-no">Ablehnen</button></div></div>`
                    : '<div class="small dim">Warte auf den nächsten Kundenauftrag …</div>'}
                <div class="small">Grundbedarf 100 t${orderT ? ` + ${orderT} t aus ${me.orders.length} Aufträgen` : ''}. Abgesichert: <b>${Math.max(0, me.pos * CFG.size)} t</b> von ${-me.physical} t.</div>
                ${me.orders.slice(-3).map(x => `<div class="rp-log live">✔ ${esc(x.client)} · ${x.t} t zu ${fmt(x.price)} · Marge heute <b class="${x.price - pub.price >= 0 ? 'up' : 'down'}">${signed((x.price - pub.price) * x.t)}</b></div>`).join('')}`;
        } else {
            const last = me.reports[me.reports.length - 1];
            html = `<div class="rp-head"><span>🦈 Research-Abteilung</span><b>${me.rumorActive ? '🔥 Gerücht läuft' : 'ruhig'}</b></div>
                ${last ? `<div class="report">🕵️ ${esc(last.text)}</div>` : '<div class="small dim">Noch kein Bericht. Research lohnt sich, solange ein Gerücht läuft: Wer früher weiss, ob es stimmt, kann vor allen anderen handeln.</div>'}
                <button class="btn btn-ghost full" data-rp="research" ${me.researchReady ? 'disabled' : ''}>🕵️ Research-Bericht kaufen (${fmt(me.rumorActive ? CFG.researchCost : CFG.researchCost / 2)} CHF)${me.researchReady ? ` · bereit in ${me.researchReady}s` : ''}<small>Trefferquote ca. ${Math.round(CFG.researchHit * 100)} % – nicht immer richtig!</small></button>`;
        }
        // Countdown und «neu»-Markierung gehören nicht zum Vergleich – sonst würde die Karte jede Sekunde neu gebaut.
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        tmp.querySelectorAll('.live').forEach(n => { n.innerHTML = ''; });
        const key = tmp.innerHTML.replace(/ data-left="\d+"/g, '').replace(/ fresh/g, '');
        const tickLeft = () => el.querySelectorAll('[data-left]').forEach(s => { s.textContent = `${s.dataset.left}s`; });
        if (key === panelKey) {
            // Nur die veränderlichen Teile aktualisieren – die Karte selbst bleibt stehen.
            const fresh = document.createElement('div');
            fresh.innerHTML = html;
            const lefts = [...fresh.querySelectorAll('[data-left]')].map(s => s.dataset.left);
            el.querySelectorAll('[data-left]').forEach((s, i) => { if (lefts[i] !== undefined) s.textContent = `${lefts[i]}s`; });
            const lives = [...fresh.querySelectorAll('.live')].map(n => n.innerHTML);
            el.querySelectorAll('.live').forEach((n, i) => { if (lives[i] !== undefined && n.innerHTML !== lives[i]) n.innerHTML = lives[i]; });
            return;
        }
        panelKey = key;
        el.className = `card p-rolepanel ${me.role}`;
        el.innerHTML = html;
        tickLeft();
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

    // ===== Jahresende & Ausbau (Handy) =====

    let yearInfo = null;
    let shopKey = '';

    function renderShop() {
        if (!me || !pub) return;
        const R = ROLES[me.role];
        const ups = UPGRADES[me.role] || [];
        const yi = yearInfo;
        const last = me.yearsDone[me.yearsDone.length - 1];
        const key = JSON.stringify([me.upgrades, me.cash, me.level, last, yi && yi.rank, me.stored]);
        $('shop-timer').textContent = `${Math.floor(Math.max(0, pub.shopLeft) / 60)}:${String(Math.max(0, pub.shopLeft) % 60).padStart(2, '0')}`;
        if (key === shopKey) return;
        shopKey = key;
        const metricTxt = !last ? '' : me.role === 'producer' ? `${fmt(last.metric)} CHF/t erzielt` : me.role === 'processor' ? `${fmt(last.metric)} CHF/t Einkauf` : `${signed(last.result)} CHF Gewinn`;
        $('shop-body').innerHTML = `
            <div class="card sh-year" style="--rc:${R.color}">
                <div class="sy-k">JAHR ${pub.year} VON ${pub.years} ABGESCHLOSSEN</div>
                <div class="sy-res ${last && last.result >= 0 ? 'up' : 'down'}">${last ? signed(last.result) : '–'} <small>CHF</small></div>
                <div class="sy-m">${metricTxt}${yi ? ` · Platz <b>${yi.rank}</b> von ${yi.total}` : ''}</div>
                <div class="sy-rank"><span class="rank-badge l${me.level}">${RANKS[me.level].icon} ${RANKS[me.level].name}</span>${yi && yi.row && yi.row.promoted ? '<span class="promo-me">⬆️ Aufgestiegen!</span>' : ''}</div>
                <div class="sy-tot">Karriere bisher: <b class="${me.total - me.upSpent >= 0 ? 'up' : 'down'}">${signed(me.total - me.upSpent - me.interest)}</b> CHF</div>
            </div>
            <div class="shop-h"><span>🏗️ Ausbau</span><b>💰 ${fmt(me.cash)} CHF</b></div>
            <p class="dim small">Investiere in deine Firma. Jede Investition kostet jetzt Geld – und muss sich in den nächsten Jahren auszahlen.</p>
            <div class="shop-cards">${ups.map(u => {
                const own = me.upgrades.includes(u.id);
                const can = !own && me.cash >= u.cost;
                return `<div class="shop-card ${own ? 'own' : ''}" style="--rc:${R.color}"><div class="sc-ico">${u.icon}</div><div class="sc-body"><b>${u.name}</b><p>${u.desc}</p></div>
                    ${own ? '<div class="sc-own">✔ Gekauft</div>' : `<button class="btn ${can ? 'btn-primary' : 'btn-ghost'} sc-buy" data-up="${u.id}" ${can ? '' : 'disabled'}>${fmt(u.cost)} CHF</button>`}</div>`;
            }).join('')}</div>
            ${me.role === 'producer' && me.upgrades.includes('storage') ? `<div class="card store-card"><div class="shop-h"><span>🏚️ Lagerhaus</span><b>${me.stored} t eingelagert</b></div>
                <p class="small">Statt zum Schlusskurs von <b>${fmt(pub.price)} CHF/t</b> zu verkaufen, kannst du Kakao einlagern und nächstes Jahr verkaufen. Lohnt sich nur, wenn der Preis um mehr als ${CFG.storeFee} CHF/t (Lagerkosten) steigt!</p>
                <div class="store-btns">${[0, 20, 40, 60].filter(t => t <= CFG.storeMax).map(t => `<button class="btn ${me.stored === t ? 'btn-primary' : 'btn-ghost'}" data-store="${t}">${t} t</button>`).join('')}</div></div>` : ''}
            <div class="dim small pulse">Der Host startet das nächste Jahr – oder es geht automatisch weiter, wenn die Zeit abläuft.</div>`;
        $('shop-body').querySelectorAll('[data-store]').forEach(b => b.addEventListener('click', () => {
            send({ t: 'store', t2: Number(b.dataset.store) });
            Sound.play('tick');
        }));
        $('shop-body').querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => {
            send({ t: 'upgrade', id: b.dataset.up });
            Sound.play('buy');
        }));
    }

    function yearBanner(year) {
        const el = $('p-yearban');
        el.innerHTML = `<small>ERNTEJAHR</small><b>${year}</b>`;
        el.classList.remove('hidden', 'go');
        void el.offsetWidth;
        el.classList.add('go');
        setTimeout(() => el.classList.add('hidden'), 2400);
    }

    // ===== Ende (Karriere) =====

    function showEnd(msg) {
        App.show('v-pend');
        const c = msg.career;
        const R = ROLES[c.role];
        const isStar = msg.star && msg.star.id === c.id;
        if (msg.rank === 1 || isStar) setTimeout(() => confetti(4500), 500);
        Sound.play('end');
        $('p-end').innerHTML = `<div class="card end-card" style="--rc:${R.color}">
            <div class="end-emb">${roleIcon(c.role, 72)}</div>
            <div class="end-rank">#${msg.rank}<span class="dim">/${msg.total}</span></div>
            <div class="dim small">Platz ${msg.rank} von ${msg.total} ${c.role === 'spec' ? 'Hedgefonds' : c.role === 'producer' ? 'Kooperativen' : 'Fabriken'}</div>
            <h2>${esc(c.name)}</h2>
            <span class="rank-badge l${c.level}">${RANKS[c.level].icon} ${RANKS[c.level].name}</span>
            <div class="end-score ${c.final >= 0 ? 'up' : 'down'}">${signed(c.final)} CHF</div>
            <div class="end-years">${c.years.map(y => `<div><small>Jahr ${y.year}</small><b class="${y.result >= 0 ? 'up' : 'down'}">${signed(y.result)}</b></div>`).join('')}</div>
            ${c.upgrades.length ? `<p class="small">Ausbau: ${c.upgrades.map(u => { const x = UPGRADES[c.role].find(z => z.id === u); return x ? `${x.icon} ${x.name}` : ''; }).join(' · ')} <span class="dim">(−${fmt(c.upSpent)} CHF)</span></p>` : '<p class="small dim">Kein Ausbau gekauft.</p>'}
            ${c.interest ? `<p class="small bad">🏦 Zinsen für Notkredite: −${fmt(c.interest)} CHF</p>` : ''}
            ${msg.star ? (isStar ? `<div class="star-me">⭐ Du bist TRADER DES TAGES! (${signed(msg.star.points)} Punkte)</div>` : `<p class="dim small">⭐ Trader des Tages: <b>${esc(msg.star.name)}</b> · deine Punkte: ${signed(c.points)}</p>`) : ''}
            <h3>🏆 Top 3 deiner Rolle</h3><ol class="top3">${msg.top.map(t => `<li>${esc(t.name)} <b>${signed(t.final)}</b></li>`).join('')}</ol>
            <p class="dim small">Die Preisverleihung läuft auf dem grossen Bildschirm!</p></div>`;
    }

    // ===== Bedienelemente =====

    function bind() {
        $('p-qty').querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
            qty = Number(b.dataset.q);
            $('p-qty').querySelectorAll('[data-q]').forEach(x => x.classList.toggle('active', x === b));
        }));
        // Menge automatisch aufs Mandat begrenzen (z. B. nur noch 3 Kontrakte bis zur vollen Absicherung).
        $('p-buy').addEventListener('click', () => send({ t: 'trade', mkt, q: me ? Math.max(1, Math.min(qty, room(1))) : qty }));
        $('p-sell').addEventListener('click', () => send({ t: 'trade', mkt, q: -(me ? Math.max(1, Math.min(qty, room(-1))) : qty) }));
        $('p-mkt').querySelectorAll('[data-mkt]').forEach(b => b.addEventListener('click', () => {
            mkt = b.dataset.mkt;
            $('p-hmeter').dataset.h = '';
            Sound.play('tick');
            if (me && pub) render();
        }));
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
