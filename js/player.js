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
    let ended = false;
    let lastTick = -1;
    let drumFor = '';
    let lastJoin = 0;
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
        lastJoin = Date.now();
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
            onStatus: s => { $('join-err').textContent = s; },
            onClose: () => {
                if (ended) return;
                $('conn-lost').classList.remove('hidden');
                setTimeout(revive, 1500);
            },
            onError: msg => {
                $('join-err').textContent = msg;
                $('btn-join').disabled = false;
                if (me) $('conn-lost').classList.remove('hidden');
            },
        });
    }

    // Nach Display-Sperre oder Netzwechsel still neu verbinden (gleicher Schlüssel = gleicher Spieler).
    function revive() {
        if (document.hidden || ended || !code || !name || !me) return;
        if (conn && conn.open) return;
        if (Date.now() - lastJoin < 4000) return;
        join(code, name);
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
            const view = termMode() ? 'v-term' : 'v-player';
            if (pub.phase !== 'lobby' && !ended && !$(view).classList.contains('active')) {
                const fromShop = $('v-shop').classList.contains('active');
                App.show(view);
                Sound.play('bell');
                renderInfo();
                if (fromShop) {
                    panelKey = '';
                    yearBanner(pub.year);
                }
            }
            if (pub.phase !== 'lobby') (view === 'v-term' ? renderTerm() : render());
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
                toast(tradeText(msg.q, msg.price), 'good');
                coach('trade', me.role === 'spec'
                    ? '✅ <b>Deine Wette läuft.</b> Mit dem anderen Knopf schliesst du sie wieder – dann ist Gewinn oder Verlust fix.'
                    : '✅ <b>Gut!</b> Diese Menge ist jetzt geschützt. Du kannst jederzeit mehr absichern – oder mit AUFLÖSEN zurücknehmen.');
                Sound.play(msg.q > 0 ? 'buy' : 'sell');
                if (navigator.vibrate) navigator.vibrate(30);
            } else if (msg.ok && msg.msg) toast(msg.msg, 'good');
            return;
        }
        if (msg.t === 'newFeatures') {
            coach(`new${msg.year}`, `✨ <b>Neu in Jahr ${msg.year}:</b><br>${msg.keys.map(k => `${FEATURE_TEXT[k].icon} <b>${FEATURE_TEXT[k].name}:</b> ${FEATURE_TEXT[k].text}`).join('<br>')}`);
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
        $('w-mission').innerHTML = `<p class="goal-line">🎯 <b>${R.goal}</b></p>${R.mission}`;
        $('w-rules').innerHTML = roleRules(R);
        $('w-earn').innerHTML = `<p class="future-intro">📜 ${FUTURE_INTRO}</p>${earnHTML(role)}`;
        $('w-hint').innerHTML = `💡 ${R.hint}`;
        $('w-roles').querySelectorAll('[data-role]').forEach(b => b.classList.toggle('active', b.dataset.role === role));
        App.show('v-wait');
        Sound.init();
        Sound.play('join');
    }

    // ===== Spielansicht (Cockpit: alles Wichtige ohne Scrollen, Knöpfe unten) =====

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

    // Vorzeichen + Pfeil: Gewinne/Verluste nie nur über die Farbe zeigen (farbenblind-tauglich)
    const arrow = v => (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '');
    const setHTML = (el, html) => { if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; } };

    function render() {
        if (!me || !pub) return;
        if (pub.phase !== 'pre' && tut.i >= 0 && !tut.done) tutAbort();
        const R = ROLES[me.role];
        document.body.dataset.role = me.role;
        if ($('p-role').dataset.k !== me.role + me.name + me.level) {
            $('p-role').dataset.k = me.role + me.name + me.level;
            $('p-role').innerHTML = `<span class="p-emb">${roleIcon(me.role, 26)}</span><span><b>${esc(me.name)}</b><small>${RANKS[me.level].icon} ${RANKS[me.level].name} · ${R.short}</small></span>`;
        }
        $('p-month').textContent = pub.phase === 'pre' ? 'Pre-Market' : pub.phase === 'settle' ? 'Abrechnung' : `Monat ${pub.month}/${pub.months}${pub.years > 1 ? ` · Jahr ${pub.year}` : ''}`;
        $('p-timer').textContent = pub.phase === 'settle' ? '⏸' : mmss(pub.secLeft);
        const urgent = pub.phase === 'trading' && pub.secLeft <= 10;
        $('p-timer').classList.toggle('urgent', urgent);
        if (urgent && pub.secLeft !== lastTick) {
            lastTick = pub.secLeft;
            Sound.play('tick');
        }
        $('p-rank').innerHTML = `<small>Platz</small>${me.rank}<small>/${me.roleCount}</small>`;

        const prev = Number($('p-price').dataset.v || pub.price);
        tween($('p-price'), pub.price);
        $('p-price').dataset.v = pub.price;
        $('p-price').className = `big-price ${pub.price > prev ? 'up' : pub.price < prev ? 'down' : ''}`;
        const ch = pub.price / pub.p0 - 1;
        $('p-change').innerHTML = `<span class="${ch >= 0 ? 'up' : 'down'}">${arrow(ch)}${pct(ch)}</span> <span class="dim">seit Jahresstart (${fmt(pub.p0)})</span>`;
        spark(pub.history);
        if (pub.feed && pub.feed[0]) setHTML($('p-news'), `<span>${pub.feed[0].icon}</span> ${esc(pub.feed[0].text)}`);

        renderNow();
        renderGoal();
        renderTrade(pub.phase !== 'trading' || pub.paused || me.bankrupt);
        if (me.role === 'spec') $('p-scene').innerHTML = '';
        else Scenes.render(me, pub);
        renderRolePanel();
        renderCall();
        coachTriggers();
    }

    // ===== «Was jetzt?» – ein Tipp, der die Entscheidung bewusst macht (ohne sie vorzusagen) =====
    function nowText() {
        const hedger = me.role !== 'spec';
        const lastMonth = pub.month >= pub.months;
        const end = pub.phase !== 'trading' || pub.secLeft > 10 ? ''
            : lastMonth ? ` ⏰ Noch ${pub.secLeft}s bis Dezember!` : ` ⏰ Noch ${pub.secLeft}s bis zur Monatsabrechnung.`;
        if (pub.phase === 'pre') {
            if (tut.now) return { k: 'rumor', t: tut.now, left: 30, span: 30 };
            const RR = pub.preReady;
            if (tut.done) return { k: 'ok', t: `✅ <b>Du bist bereit.</b> Die Börse öffnet, sobald alle fertig sind${RR ? ` (${RR.n} von ${RR.total})` : ''} – spätestens in ${mmss(pub.secLeft)}.` };
            return { k: 'paused', t: `🌅 <b>Pre-Market.</b> Die Börse ist noch geschlossen. Mach das Tutorial – sie öffnet spätestens in ${mmss(pub.secLeft)}.` };
        }
        if (pub.paused) return { k: 'paused', t: '⏸ <b>Pause.</b> Die Spielleitung erklärt etwas. Gleich geht es weiter.' };
        if (me.call) return { k: 'bad', t: '📞 <b>Margin Call!</b> Dein Pfand reicht nicht mehr. Geld nachschiessen oder Position verkleinern – sonst wird sie zwangsweise geschlossen.' };
        if (pub.phase === 'settle') return { k: '', t: '🧾 <b>Monatsabrechnung.</b> Gewinne und Verluste deiner Futures werden jetzt aufs Konto gebucht.' };
        const r = me.rumor;
        if (r) {
            const up = r.impact > 0;
            const q = me.role === 'producer'
                ? (up ? 'Jetzt teurer verkaufen – oder warten, ob es stimmt?' : 'Jetzt noch absichern, bevor er weiter fällt – oder ist es falsch?')
                : me.role === 'processor'
                    ? (up ? 'Jetzt noch kaufen, bevor es teurer wird – oder ist es falsch?' : 'Jetzt billiger kaufen – oder warten, ob es stimmt?')
                    : `Wettest du darauf, dass es stimmt (${up ? 'KAUFEN' : 'VERKAUFEN'})?`;
            if (r.left === 3 && drumFor !== r.text) {
                drumFor = r.text;
                Sound.play('drum');
                if (navigator.vibrate) navigator.vibrate([40, 80, 40, 80, 40]);
            }
            return { k: 'rumor', t: `${r.icon} <b>Gerücht:</b> ${esc(r.text)}. Der Preis ${up ? 'steigt' : 'fällt'} schon. ${q}${end}`, left: Math.max(0, r.left), span: r.left + r.since };
        }
        if (hedger) {
            if (lastMonth && me.open > 0 && pub.secLeft <= 20) return { k: 'bad', t: `⏰ <b>Letzte Chance:</b> ${me.open} t sind noch offen. Im Dezember wird das ${Math.round(CFG.spotPenalty * 100)} % schlechter gehandelt.${end}` };
            if (me.hedged < 0.05) return { k: '', t: me.role === 'producer'
                ? `Du hast noch nichts verkauft. Fällt der Preis bis Dezember, verlierst du. <b>Wann sicherst du ab?</b>${end}`
                : `Du hast noch nichts eingekauft. Steigt der Preis bis Dezember, zahlst du drauf. <b>Wann sicherst du ab?</b>${end}` };
            if (me.open === 0) return { k: 'ok', t: `🛡️ <b>Alles abgesichert.</b> Der Preis kann dir jetzt fast egal sein.${end}` };
            return { k: '', t: `${Math.round(me.hedged * 100)} % abgesichert, <b>${me.open} t</b> noch offen. Jetzt mehr – oder auf einen besseren Preis warten?${end}` };
        }
        if (!me.pos) return { k: '', t: `Keine Wette offen. Wird Kakao <b>teurer</b> (KAUFEN) oder <b>billiger</b> (VERKAUFEN)?${end}` };
        return { k: me.unreal >= 0 ? 'ok' : 'bad', t: `Du wettest auf <b>${me.pos > 0 ? 'steigende' : 'fallende'}</b> Preise (${arrow(me.unreal)}${signed(me.unreal)} CHF). Gewinn mitnehmen oder laufen lassen?${end}` };
    }

    function renderNow() {
        const n = nowText();
        const el = $('p-now');
        el.className = `p-now ${n.k}${pub.phase === 'trading' && pub.secLeft <= 10 ? ' urgent' : ''}`;
        const bar = n.left !== undefined ? `<i class="rumor-bar" style="width:${Math.min(100, (n.left / Math.max(1, n.span)) * 100)}%"></i><em class="rumor-left">${n.left}s</em>` : '';
        setHTML(el, `<span>${n.t}</span>${bar}`);
    }

    // ===== Ziel-Karte: Fortschritt, Preis, Rang, Risiko =====
    function renderGoal() {
        const R = ROLES[me.role];
        let html;
        const acct = `<div class="g-acct"><span>Futures <b>${me.pos ? `${me.pos > 0 ? 'Long' : 'Short'} ${Math.abs(me.pos * CFG.size)} t` : '–'}</b></span>
            <span>Offen <b class="${me.unreal > 0 ? 'up' : me.unreal < 0 ? 'down' : ''}">${arrow(me.unreal)}${signed(me.unreal)}</b></span>
            <span>Pfand <b class="${me.req && me.eq < me.req * CFG.maintenance ? 'bad' : ''}">${me.req ? `${Math.round((me.eq / me.req) * 100)} %` : '–'}</b></span>
            <span>Bargeld <b>${fmt(me.cash)}</b></span></div>`;
        if (me.role !== 'spec') {
            const prod = me.role === 'producer';
            const need = Math.max(0, prod ? me.physical : -me.physical);
            const hedged = Math.max(0, prod ? -me.pos * CFG.size : me.pos * CFG.size);
            const q = need ? hedged / need : 0;
            const over = hedged > need;
            const good = prod ? me.metric >= pub.p0 : me.metric <= pub.p0;
            html = `<div class="g-head">🎯 ${R.goal}</div>
                <div class="g-bar ${over ? 'over' : ''}"><i style="width:${Math.min(100, q * 100)}%"></i></div>
                <div class="g-row"><span>Abgesichert <b>${hedged} t</b> von ${need} t</span><b>${Math.round(q * 100)} %</b></div>
                <div class="g-score">
                    <div><small>${prod ? 'Dein Preis' : 'Dein Einkauf'} jetzt</small><b class="${good ? 'up' : 'down'}">${fmt(me.metric)}</b></div>
                    <div><small>Gesichert zu</small><b>${me.secured ? fmt(me.secured) : '–'}</b></div>
                    <div><small>Platz</small><b>${me.rank}<span class="dim">/${me.roleCount}</span></b></div></div>
                ${over ? `<div class="g-risk bad">🎲 Du hast mehr abgesichert, als du ${prod ? 'erntest' : 'brauchst'}. Das ist jetzt eine Wette – löse einen Teil auf.</div>`
                    : me.open ? `<div class="g-risk warn">⚠️ <b>${me.open} t offen.</b> ${prod ? 'Fällt' : 'Steigt'} Kakao um 100 CHF/t, verlierst du ${fmt(me.open * 100)} CHF. Offenes wird im Dezember ${Math.round(CFG.spotPenalty * 100)} % schlechter gehandelt – das steckt schon in «${prod ? 'Dein Preis' : 'Dein Einkauf'} jetzt».</div>`
                        : '<div class="g-risk ok">🛡️ Alles abgesichert – fast egal, wohin der Preis geht.</div>'}
                ${acct}`;
        } else {
            const b = me.bounds;
            const w = (Math.abs(me.pos) / Math.max(1, b.max)) * 50;
            html = `<div class="g-head">🎯 ${R.goal}</div>
                <div class="g-score">
                    <div><small>Gewinn</small><b class="${me.result >= 0 ? 'up' : 'down'}">${arrow(me.result)}${signed(me.result)}</b></div>
                    <div><small>Wette</small><b>${me.pos ? `${me.pos > 0 ? '▲ steigt' : '▼ fällt'}` : '–'}</b></div>
                    <div><small>Platz</small><b>${me.rank}<span class="dim">/${me.roleCount}</span></b></div></div>
                <div class="hm-row"><span>▼ fällt ${b.max * CFG.size} t</span><b>${me.pos ? `${Math.abs(me.pos * CFG.size)} t` : 'keine Wette'}</b><span>▲ steigt ${b.max * CFG.size} t</span></div>
                <div class="hm-bar mid"><i class="${me.pos >= 0 ? 'long' : 'short'}" style="left:${me.pos >= 0 ? 50 : 50 - w}%;width:${w}%"></i></div>
                <div class="g-risk ${me.pos ? 'warn' : ''}">${me.pos ? `Bewegt sich Kakao um 100 CHF/t gegen dich, verlierst du ${fmt(Math.abs(me.exposure) * 100)} CHF.` : 'Ohne Wette kein Risiko – aber auch kein Gewinn.'}</div>
                ${acct}`;
        }
        setHTML($('p-goal'), html);
    }

    // ===== Handelsknöpfe (unten fixiert) =====

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
        $('p-ask').textContent = fmt(Math.round(pub.price * (1 + CFG.spread)));
        $('p-bid').textContent = fmt(Math.round(pub.price * (1 - CFG.spread)));
        const tb = $('p-tbtns');
        if (me.role === 'producer') {
            setBtn('p-sell', 'ABSICHERN', 'Ernte verkaufen');
            setBtn('p-buy', 'AUFLÖSEN', 'zurücknehmen');
            tb.classList.add('rev');
        } else if (me.role === 'processor') {
            setBtn('p-buy', 'ABSICHERN', 'Kakao kaufen');
            setBtn('p-sell', 'AUFLÖSEN', 'zurücknehmen');
            tb.classList.remove('rev');
        } else {
            setBtn('p-buy', 'KAUFEN', '▲ Wette: steigt');
            setBtn('p-sell', 'VERKAUFEN', '▼ Wette: fällt');
            tb.classList.remove('rev');
        }
        const hedger = me.role !== 'spec';
        $('p-buy').classList.toggle('primary', hedger && me.role === 'processor');
        $('p-buy').classList.toggle('secondary', hedger && me.role === 'producer');
        $('p-sell').classList.toggle('primary', hedger && me.role === 'producer');
        $('p-sell').classList.toggle('secondary', hedger && me.role === 'processor');
        const practice = tutActive() && ['buy', 'sell', 'close'].includes(tut.wait);
        $('p-buy').disabled = !practice && (closed || room(1) <= 0);
        $('p-sell').disabled = !practice && (closed || room(-1) <= 0);
    }

    // Klartext nach einem Trade
    function tradeText(q, price) {
        const t = Math.abs(q) * CFG.size;
        const closing = me && me.pos && Math.sign(q) !== Math.sign(me.pos);
        if (me.role === 'producer') return q < 0
            ? `Du hast ${t} t zu ${fmt(price)} CHF/t verkauft. Fällt der Preis jetzt, bist du für diese Menge geschützt.`
            : `${t} t Absicherung zurückgenommen. Diese Menge hängt wieder am Preis.`;
        if (me.role === 'processor') return q > 0
            ? `Du hast ${t} t zu ${fmt(price)} CHF/t gekauft. Steigt der Preis jetzt, bist du für diese Menge geschützt.`
            : `${t} t Absicherung zurückgenommen. Diese Menge hängt wieder am Preis.`;
        if (closing) return `Wette um ${t} t verkleinert (zu ${fmt(price)}). Gewinn bzw. Verlust ist für diese Menge fix.`;
        return q > 0 ? `Gekauft: ${t} t zu ${fmt(price)} CHF/t. Du gewinnst, wenn Kakao steigt.` : `Verkauft: ${t} t zu ${fmt(price)} CHF/t. Du gewinnst, wenn Kakao fällt.`;
    }

    // ===== Rollen-Panel: nur Nebenmechaniken, die in diesem Jahr aktiv sind =====

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
        const F = me.feat || {};
        let html = '';
        if (me.role === 'producer') {
            const b = F.buyers && me.buyerOffer;
            const pricey = me.protectPrice > CFG.protectLow;
            // Eine Entscheidungskarte zur Zeit
            if (b) html += `<div class="order-card buyer${freshCard(b)}"><div class="oc-top"><b>🤝 ${esc(b.client)}</b><span class="oc-left" data-left="${b.left}"></span></div>
                    <div>Will <b>${b.t} t</b> zum festen Preis von <b>${fmt(b.price)} CHF/t</b> kaufen.</div>
                    <div class="small live">Börse gerade ${fmt(pub.price)} → <b class="${b.price >= pub.price ? 'up' : 'down'}">${b.price >= pub.price ? `▲ ${fmt(b.price - pub.price)} besser` : `▼ ${fmt(pub.price - b.price)} schlechter`}</b></div>
                    <div class="oc-btns"><button class="btn btn-primary" data-rp="buyer-yes">Verkaufen</button><button class="btn btn-ghost" data-rp="buyer-no">Ablehnen</button></div></div>`;
            if (F.yield) html += me.harvestLog.map(h => `<div class="rp-log ${h.d < 0 ? 'bad' : 'good'}">${h.d < 0 ? '▼' : '▲'} ${Math.abs(h.d)} t · ${esc(h.text)}</div>`).join('');
            if (F.protect) html += me.protect ? '<div class="rp-ok">🛡️ Pflanzenschutz aktiv: Ernteverluste werden halbiert.</div>'
                : `<button class="btn btn-ghost full ${pricey ? 'pricey' : ''}" data-rp="protect">🛡️ Pflanzenschutz · ${fmt(me.protectPrice)} CHF<small>${pricey ? '⚠️ Ein Gerücht läuft – jetzt teuer!' : 'Halbiert Ernteverluste. Jetzt günstig.'}</small></button>`;
        } else if (me.role === 'processor' && F.orders) {
            const o = me.orderOffer;
            if (o) html += `<div class="order-card${freshCard(o)}"><div class="oc-top"><b>📦 ${esc(o.client)}</b><span class="oc-left" data-left="${o.left}"></span></div>
                    <div>Bestellt Schokolade aus <b>${o.t} t Kakao</b>, fester Erlös <b>${fmt(o.price)} CHF/t</b>.</div>
                    <div class="small live">Kakao heute ${fmt(pub.price)} → Marge <b class="up">▲ ${fmt(o.price - pub.price)} CHF/t</b>. Dein Bedarf steigt um ${o.t} t.</div>
                    <div class="oc-btns"><button class="btn btn-primary" data-rp="order-yes">Annehmen</button><button class="btn btn-ghost" data-rp="order-no">Ablehnen</button></div></div>`;
            else html += '<div class="small dim">📦 Warte auf den nächsten Kundenauftrag …</div>';
            html += me.orders.slice(-2).map(x => `<div class="rp-log">✔ ${esc(x.client)} · ${x.t} t zu ${fmt(x.price)}</div>`).join('');
        } else if (me.role === 'spec') {
            html += '<div class="small">💻 <b>Tipp:</b> Öffne das Spiel am Laptop. Dort hast du das Hedgefonds-Terminal mit Weltkarte, Berichten und Risiko-Cockpit.</div>';
        }
        el.classList.toggle('hidden', !html);
        // Countdown und «neu»-Markierung gehören nicht zum Vergleich – sonst würde die Karte jede Sekunde neu gebaut.
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        tmp.querySelectorAll('.live').forEach(n => { n.innerHTML = ''; });
        const key = tmp.innerHTML.replace(/ data-left="\d+"/g, '').replace(/ fresh/g, '');
        if (key === panelKey) {
            const fresh = document.createElement('div');
            fresh.innerHTML = html;
            const lefts = [...fresh.querySelectorAll('[data-left]')].map(s => s.dataset.left);
            el.querySelectorAll('[data-left]').forEach((s, i) => { if (lefts[i] !== undefined) s.textContent = `${lefts[i]}s`; });
            const lives = [...fresh.querySelectorAll('.live')].map(n => n.innerHTML);
            el.querySelectorAll('.live').forEach((n, i) => { if (lives[i] !== undefined && n.innerHTML !== lives[i]) n.innerHTML = lives[i]; });
            return;
        }
        panelKey = key;
        el.className = `card p-rolepanel ${me.role}${html ? '' : ' hidden'}`;
        el.innerHTML = html;
        el.querySelectorAll('[data-left]').forEach(s => { s.textContent = `${s.dataset.left}s`; });
        el.querySelectorAll('[data-rp]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.rp;
            if (a === 'protect') send({ t: 'protect' });
            if (a === 'order-yes') send({ t: 'order', accept: true });
            if (a === 'order-no') send({ t: 'order', accept: false });
            if (a === 'buyer-yes') send({ t: 'buyer', accept: true });
            if (a === 'buyer-no') send({ t: 'buyer', accept: false });
        }));
    }

    let callShown = false;
    function renderCall() {
        if (tut.callOpen) return;
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
            <p>Der Preis ist gegen dich gelaufen. Dein Pfand bei der Börse reicht nicht mehr. Leg <b>${fmt(me.call.need)} CHF</b> nach – oder verkleinere deine Position. Sonst wird sie zwangsweise geschlossen.</p>
            <button class="btn btn-primary btn-big" id="call-top" ${me.cash < me.call.need ? 'disabled' : ''}>Geld nachschiessen (${fmt(me.call.need)})</button>
            <button class="btn btn-ghost" id="call-reduce">Position halbieren</button></div>`;
        $('call-top').onclick = () => send({ t: 'topup' });
        $('call-reduce').onclick = () => send({ t: 'reduce' });
    }

    // ===== Geführter Einstieg: kurze Erklärungen genau dann, wenn sie gebraucht werden =====
    const coachSeen = new Set();
    const coachQueue = [];
    let coachHl = null;
    // Kurze Erklärung; optional wird ein Bereich des Bildschirms hervorgehoben (sel).
    function coach(key, html, sel = null, step = null) {
        if (coachSeen.has(key)) return;
        coachSeen.add(key);
        coachQueue.push({ html, sel, step });
        if (coachQueue.length === 1) showCoach();
    }
    function showCoach() {
        if (tutActive()) return;
        const el = $('p-coach');
        if (coachHl) { coachHl.classList.remove('tour-hl'); coachHl = null; }
        if (!coachQueue.length) { el.classList.add('hidden'); return; }
        const c = coachQueue[0];
        const pre = pub && pub.phase === 'pre';
        el.innerHTML = `<div>${c.step ? `<small class="tour-step">${pre ? `PRE-MARKET · EINFÜHRUNG ${c.step}` : c.step}</small>` : ''}${c.html}</div><button class="btn btn-primary btn-sm">${c.step && c.step.split('/')[0] !== c.step.split('/')[1] ? 'Weiter' : 'OK'}</button>`;
        el.classList.remove('hidden');
        if (c.sel) {
            const t = document.querySelector(c.sel);
            if (t && t.offsetParent) {
                coachHl = t;
                t.classList.add('tour-hl');
                t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
        el.querySelector('button').onclick = () => {
            coachQueue.shift();
            showCoach();
        };
    }

    function coachTriggers() {
        const R = ROLES[me.role];
        if (pub.phase === 'pre') return tutStart();
        const btn = me.role === 'producer' ? '<b>ABSICHERN</b> verkauft einen Teil deiner Ernte schon heute zum aktuellen Preis.'
            : me.role === 'processor' ? '<b>ABSICHERN</b> kauft einen Teil deines Kakaos schon heute zum aktuellen Preis.'
                : '<b>KAUFEN</b> = Wette, dass Kakao steigt. <b>VERKAUFEN</b> = Wette, dass er fällt.';
        coach('start', `${roleIcon(me.role, 22)} <b>${R.goal}</b><br>${btn}`);
        if (me.rumor) coach('rumor', '📣 <b>Ein Gerücht!</b> Der Preis bewegt sich schon, bevor klar ist, ob es stimmt. Oben läuft der Countdown bis zur Auflösung.');
        if (pub.phase === 'settle') coach('settle', '🧾 <b>Monatsende:</b> Gewinne und Verluste deiner Futures werden jetzt aufs Konto gebucht («Mark-to-Market»).');
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
        c.stroke();
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
        el.innerHTML = `<b>${label}</b> ${it.icon} ${esc(it.text.replace(/^[A-ZÄÖÜ ]+(\([^)]*\))?: /, ''))}`;
        Sound.play(it.kind === 'alert' ? 'alarm' : 'news');
        if (navigator.vibrate) navigator.vibrate(it.kind === 'yes' || it.kind === 'no' ? [60, 60, 120] : 60);
        clearTimeout(newsFlash.t);
        newsFlash.t = setTimeout(() => el.classList.add('hidden'), 4500);
    }

    function toast(text, kind = '') {
        const el = document.createElement('div');
        el.className = `p-toast ${kind}`;
        el.textContent = text;
        $('p-toasts').appendChild(el);
        while ($('p-toasts').children.length > 2) $('p-toasts').firstChild.remove();
        setTimeout(() => el.remove(), 4500);
    }

    function renderInfo() {
        const R = ROLES[role];
        const hedger = R.physical !== 0;
        $('tab-info').innerHTML = `<p class="goal-line">🎯 <b>${R.goal}</b></p>
            <p class="future-intro">📜 ${FUTURE_INTRO}</p>${earnHTML(role)}${roleRules(R)}
            <h3>So läuft's</h3><ul class="info-list">
                <li>Es gibt ${CFG.months} Handelsmonate, dann ist Dezember: Jetzt wird geliefert und abgerechnet.</li>
                <li>Gerüchte bewegen den Preis schon, <i>bevor</i> klar ist, ob sie stimmen.</li>
                <li>Für jede Absicherung oder Wette hinterlegst du ${Math.round(CFG.marginRate * 100)} % als Pfand bei der Börse. Läuft der Preis gegen dich, musst du nachschiessen (Margin Call).</li>
                ${hedger ? `<li><b>Wertung:</b> Wer ${role === 'producer' ? 'zum höchsten' : 'zum tiefsten'} Preis pro Tonne ${role === 'producer' ? 'verkauft' : 'einkauft'}, gewinnt. Was im Dezember noch offen ist, wird ${Math.round(CFG.spotPenalty * 100)} % schlechter gehandelt.</li>`
                    : '<li><b>Wertung:</b> Der Hedgefonds mit dem höchsten Gewinn gewinnt.</li>'}
                <li>Pleite? Dann gibt dir die Bank einen Notkredit (${fmt(CFG.loan)} CHF, ${Math.round(CFG.loanRate * 100)} % Zins am Schluss) – du spielst weiter.</li>
            </ul>
            <h3>Begriffe</h3>${GLOSSARY.map(([t, d]) => `<p><b>${t}:</b> ${d}</p>`).join('')}`;
    }

    // ===== Tutorial im Pre-Market: alles einmal selbst ausprobieren =====
    // Schritte mit Übungen (Knopf drücken, Entscheidung treffen, Margin Call beantworten).
    // Übungs-Trades laufen nur auf dem Gerät – an der Börse passiert nichts.
    const tut = { steps: [], i: -1, wait: null, done: false, reports: [], rumor: null, now: null, callOpen: false, practicePos: 0 };
    const tutActive = () => tut.i >= 0 && !tut.done;

    function tutStart() {
        if (tut.i >= 0 || tut.done || !me || !pub || pub.phase !== 'pre') return;
        tut.steps = buildTut();
        tut.i = 0;
        tutShow();
    }

    function tutAbort() {
        if (tut.i < 0) return;
        tut.done = true;
        tut.wait = null;
        tut.now = null;
        tut.rumor = null;
        tut.reports = [];
        tut.callOpen = false;
        $('call-ov').classList.add('hidden');
        if (coachHl) { coachHl.classList.remove('tour-hl'); coachHl = null; }
        $('p-coach').classList.add('hidden');
        showCoach();
    }

    function bubble(step, html, buttons) {
        const el = $('p-coach');
        el.innerHTML = `<div>${step ? `<small class="tour-step">${step}</small>` : ''}${html}</div>
            <div class="tut-btns">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'btn-primary' : 'btn-ghost'} btn-sm" data-i="${i}">${b.label}</button>`).join('')}</div>`;
        el.classList.remove('hidden');
        el.querySelectorAll('[data-i]').forEach(x => { x.onclick = () => buttons[Number(x.dataset.i)].fn(); });
    }

    function tutShow() {
        if (coachHl) { coachHl.classList.remove('tour-hl'); coachHl = null; }
        const st = tut.steps[tut.i];
        if (!st) return;
        tut.wait = st.act || null;
        if (st.enter) st.enter();
        if (termMode()) renderTerm();
        else render();
        if (st.sel) {
            const t = document.querySelector(st.sel);
            if (t && t.offsetParent) {
                coachHl = t;
                t.classList.add('tour-hl');
                t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
        const label = tutLabel();
        const skip = { label: 'Überspringen', fn: () => tutFinish(true) };
        if (st.ready) {
            bubble(label, st.html, [{ label: '✅ Ich bin bereit', primary: true, fn: () => tutFinish(false) }]);
        } else if (st.choices) {
            bubble(label, st.html, st.choices.map(c => ({ label: c[0], primary: true, fn: () => tutNext(c[1]) })));
        } else if (st.act) {
            bubble(label, `${st.html}<div class="tut-do">${st.hint}</div>`, [skip]);
        } else {
            bubble(label, st.html, [{ label: 'Weiter', primary: true, fn: () => tutNext() }]);
        }
    }

    // Zum nächsten Schritt; optional zuerst eine Rückmeldung zur Übung einschieben
    // Schrittanzeige ohne die eingeschobenen Rückmeldungen
    function tutLabel() {
        const main = tut.steps.filter(x => !x.fb).length;
        const pos = tut.steps.slice(0, tut.i + 1).filter(x => !x.fb).length;
        return `TUTORIAL ${Math.max(1, pos)}/${main}`;
    }

    function tutNext(feedback) {
        if (feedback) tut.steps.splice(tut.i + 1, 0, { html: feedback, sel: tut.steps[tut.i].fbSel || null, fb: true });
        const st = tut.steps[tut.i];
        if (st && st.leave) st.leave();
        tut.i++;
        if (tut.i >= tut.steps.length) return tutFinish(false);
        tutShow();
    }

    function tutFinish(skipped) {
        send({ t: 'ready' });
        tutAbort();
        toast(skipped ? 'Tutorial übersprungen – du bist bereit.' : 'Super, du bist bereit! Die Börse öffnet, sobald alle fertig sind.', 'good');
        if (termMode()) renderTerm();
        else render();
    }

    // Übungs-Trade (nur auf dem Gerät)
    function tutTrade(dir) {
        if (!tutActive() || !tut.wait || !['buy', 'sell', 'close'].includes(tut.wait)) return false;
        const st = tut.steps[tut.i];
        const q = termMode() ? tQty : qty;
        const t = q * CFG.size;
        const price = dir > 0 ? Math.round(pub.price * (1 + CFG.spread)) : Math.round(pub.price * (1 - CFG.spread));
        const want = tut.wait === 'buy' ? 1 : tut.wait === 'sell' ? -1 : -Math.sign(tut.practicePos || 1);
        if (dir !== want) {
            bubble(tutLabel(), `${st.wrong}<div class="tut-do">${st.hint}</div>`, [{ label: 'Überspringen', fn: () => tutFinish(true) }]);
            Sound.play('error');
            return true;
        }
        Sound.play(dir > 0 ? 'buy' : 'sell');
        if (navigator.vibrate) navigator.vibrate(30);
        tut.practicePos += dir * q;
        tutNext(st.feedback(t, price));
        return true;
    }

    function tutPin(k) {
        if (!tutActive() || tut.wait !== 'pin') return false;
        if (k !== 'abj') {
            bubble(tutLabel(), `Hier gibt es keine Quelle zu diesem Gerücht. Lies das Gerücht nochmals: <b>Wo</b> soll gestreikt werden?<div class="tut-do">👉 Klicke auf den richtigen Ort.</div>`, [{ label: 'Überspringen', fn: () => tutFinish(true) }]);
            return false;
        }
        tSel = 'abj';
        tutNext();
        return true;
    }

    function tutSrc(key) {
        if (!tutActive() || tut.wait !== 'src') return false;
        const [, type] = key.split(':');
        if (type !== 'port') {
            bubble(tutLabel(), 'Die Quelle in der Politik passt auch – aber bei einem Hafenstreik sieht man es am schnellsten am Hafen selbst.<div class="tut-do">👉 Fordere das <b>Hafenradar</b> an.</div>', [{ label: 'Überspringen', fn: () => tutFinish(true) }]);
            return true;
        }
        Sound.play('tick');
        tut.wait = null;
        bubble(tutLabel(), '⏳ Dein Team arbeitet … (Übung: 3 Sekunden statt 6)', []);
        setTimeout(() => {
            tut.reports.push({ rid: -1, dir: 1, clear: true, practice: true, rel: 0.6, icon: '⚓', src: 'Hafenradar', place: 'Abidjan · Hafen', loc: 'abj', type: 'port', text: 'Hafen Abidjan: 14 Schiffe warten (normal 6), die Kräne stehen still.', rumor: tut.rumor.text });
            Sound.play('cash');
            tutNext();
        }, 3000);
        return true;
    }

    function buildTut() {
        const R = ROLES[me.role];
        const pen = Math.round(CFG.spotPenalty * 100);
        const pf = Math.round(CFG.marginRate * 100);
        const later = Object.entries(FEATURE_TEXT).filter(([, F]) => F.role === me.role).map(([k, F]) => `${F.icon} <b>${F.name}</b> (ab Jahr ${CFG.featureYear[k]}): ${F.text}`);
        const laterHTML = `🗓️ <b>Später in der Karriere</b> kommt dazu:<br>${later.length ? later.join('<br>') : 'Zwischen den Jahren baust du deine Firma aus.'}<br>Zwischen den Jahren investierst du deinen Gewinn (Ausbau) und steigst im Rang auf.`;
        const rumorUp = { icon: '☀️', text: 'Wetterdienst warnt vor Trockenheit' };
        const callStep = {
            html: `📞 <b>Übung: Margin Call.</b> Der Preis ist gegen dich gelaufen und dein Pfand (${pf} % des Werts) reicht nicht mehr.`,
            act: 'call', hint: '👉 Entscheide im roten Fenster.',
            enter: () => {
                tut.callOpen = true;
                const ov = $('call-ov');
                ov.classList.remove('hidden');
                ov.innerHTML = `<div class="call-card"><div class="call-title">📞 MARGIN CALL · ÜBUNG</div><div class="call-timer">25s</div>
                    <p>Dein Pfand bei der Börse reicht nicht mehr. Leg <b>4'200 CHF</b> nach – oder verkleinere deine Position. Sonst wird sie zwangsweise geschlossen.</p>
                    <button class="btn btn-primary btn-big" id="tc-top">Geld nachschiessen (4'200)</button><button class="btn btn-ghost" id="tc-red">Position halbieren</button></div>`;
                const done = fb => { tut.callOpen = false; ov.classList.add('hidden'); tutNext(fb); };
                $('tc-top').onclick = () => done('💰 <b>Nachgeschossen.</b> Deine Position bleibt offen, dein Bargeld wird weniger. Gut, wenn du sicher bist, dass sich der Preis wieder dreht.');
                $('tc-red').onclick = () => done('✂️ <b>Halbiert.</b> Du brauchst weniger Pfand und das Risiko sinkt – dafür ist der Verlust auf der verkauften Hälfte jetzt fix.');
            },
        };
        if (me.role === 'producer' || me.role === 'processor') {
            const prod = me.role === 'producer';
            const hedgeDir = prod ? 'sell' : 'buy';
            const undoDir = prod ? 'buy' : 'sell';
            return [
                { sel: '#p-goal', html: `🎯 <b>Dein Ziel:</b> ${R.goal}<br>Du ${prod ? 'erntest im Dezember 100 t' : 'brauchst im Dezember 100 t'}. Der Balken zeigt, wie viel davon schon zu einem festen Preis gesichert ist.` },
                { sel: '.p-price', html: `📈 Das ist der Kakaopreis – live. ${prod ? 'Steigt er, ist deine Ernte mehr wert. Fällt er, bekommst du weniger.' : 'Steigt er, wird dein Einkauf teurer. Fällt er, wird er billiger.'} Niemand weiss, wo er im Dezember steht.` },
                {
                    sel: '.p-dock', act: hedgeDir, hint: `👉 Wähle eine Menge und tippe auf <b>ABSICHERN</b>.`,
                    html: `🛡️ <b>Probier's aus:</b> Mit ABSICHERN ${prod ? 'verkaufst du einen Teil deiner Ernte schon heute' : 'kaufst du einen Teil deines Kakaos schon heute'} – zum aktuellen Preis. (Übung, an der Börse passiert nichts.)`,
                    wrong: 'AUFLÖSEN nimmt eine Absicherung zurück – du hast noch keine.',
                    feedback: (t, p) => `✅ <b>Geschafft!</b> Du hast ${t} t zu <b>${fmt(p)}</b> ${prod ? 'verkauft' : 'gekauft'}.<br>Beispiel: ${prod ? `Fällt Kakao auf 2'000, bringt deine Ernte weniger – aber dein Future gewinnt genau so viel dazu.` : `Steigt Kakao auf 3'000, wird dein Einkauf teurer – aber dein Future gewinnt genau so viel dazu.`} Für diese ${t} t bleibt es bei <b>${fmt(p)}</b>.`,
                },
                {
                    sel: '.p-dock', act: undoDir, hint: '👉 Tippe auf <b>AUFLÖSEN</b>.',
                    html: '↩️ Und wenn du es dir anders überlegst? Dann nimmst du die Absicherung zurück.',
                    wrong: 'Das wäre noch mehr Absicherung. Diesmal willst du zurücknehmen.',
                    feedback: t => `↩️ <b>Aufgelöst.</b> Die ${t} t hängen wieder am Preis. Hin und her kostet jedes Mal eine kleine Gebühr (${CFG.fee} CHF pro 10 t) und die Spanne zwischen Kauf- und Verkaufspreis.`,
                },
                {
                    sel: '#p-now', html: `📣 <b>Übung: Ein Gerücht!</b> «${rumorUp.text}». In dieser Zeile läuft ein Countdown bis zur Auflösung – der Preis steigt schon jetzt. Was machst du?`,
                    enter: () => { tut.now = `${rumorUp.icon} <b>Übung · Gerücht:</b> ${rumorUp.text}. Der Preis steigt schon.`; },
                    leave: () => { tut.now = null; },
                    choices: prod ? [
                        ['Jetzt absichern', '🤔 <b>Kann klug sein:</b> Du verkaufst zum höheren Preis. Wird das Gerücht <b>dementiert</b>, fällt der Preis zurück – gut für dich. Wird es <b>bestätigt</b>, steigt er weiter – dann hättest du noch mehr bekommen.'],
                        ['Abwarten', '🤔 <b>Kann auch klug sein:</b> Wird das Gerücht <b>bestätigt</b>, steigt der Preis weiter und du verkaufst später teurer. Wird es <b>dementiert</b>, fällt er zurück – und die Chance ist weg.'],
                    ] : [
                        ['Jetzt absichern', '🤔 <b>Kann klug sein:</b> Wird das Gerücht <b>bestätigt</b>, steigt der Preis weiter – du hast vorher billiger gekauft. Wird es <b>dementiert</b>, fällt er zurück – dann hättest du warten können.'],
                        ['Abwarten', '🤔 <b>Kann auch klug sein:</b> Wird das Gerücht <b>dementiert</b>, fällt der Preis zurück und du kaufst billiger. Wird es <b>bestätigt</b>, wird es noch teurer.'],
                    ],
                },
                { sel: '#p-goal', html: `🏆 <b>So wird gewertet:</b> «${prod ? 'Dein Preis' : 'Dein Einkauf'} jetzt» ist, was du pro Tonne ${prod ? 'bekommst' : 'zahlst'}, wenn heute Dezember wäre. Oben rechts siehst du deinen Platz – du trittst nur gegen die anderen ${prod ? 'Kooperativen' : 'Fabriken'} an.` },
                callStep,
                { sel: '#p-goal', html: `🧾 <b>Am Ende jedes Monats</b> wird abgerechnet: Gewinne und Verluste deiner Futures kommen aufs Konto. Nach ${CFG.months} Monaten ist <b>Dezember</b>.<br>⏰ Was dann noch nicht abgesichert ist, wird <b>${pen} % schlechter</b> gehandelt – Nichtstun ist also eine Wette.` },
                { html: laterHTML },
                { sel: '#p-help', html: '📖 Alle Regeln, ein Rechenbeispiel und die Begriffe findest du jederzeit hier unter <b>Hilfe</b>.' },
                { ready: true, html: '✅ <b>Du kennst jetzt alles!</b> Die Börse öffnet, sobald alle bereit sind.' },
            ];
        }
        if (termMode()) {
            const strike = { icon: '⚓', text: 'Hafenarbeiter in Abidjan drohen mit Streik' };
            return [
                { sel: '.t-top', html: `🦈 <b>Willkommen im Terminal.</b> ${R.goal} Oben siehst du Preis, Gewinn, Platz und Zeit.` },
                {
                    sel: '#t-rumors', html: `📣 <b>Übung: Ein Gerücht!</b> «${strike.text}». Hier läuft der Countdown bis zur Auflösung. Darunter die <b>Beweis-Waage</b> – noch weisst du nichts.`,
                    enter: () => { tut.rumor = { id: -1, icon: strike.icon, text: strike.text, region: null, left: 30, since: 0, jumpYes: 0.05, jumpNo: -0.03 }; },
                },
                { sel: '.t-map', act: 'pin', hint: '👉 Klicke auf den Ort, an dem du nachschauen würdest.', html: '🗺️ <b>Jedes Gerücht hat einen Ort.</b> Wo würdest du nachschauen, ob wirklich gestreikt wird? (Tipp: Ausschnitt Westafrika)' },
                { sel: '#t-loc', act: 'src', hint: '👉 Fordere das <b>Hafenradar</b> an.', html: '🛰️ An jedem Ort gibt es Quellen. Jede kostet <b>Geld und Zeit</b>. Seriöse Quellen lügen nie: Entweder ein <b>klarer Befund</b> – oder «kein klarer Befund».' },
                { sel: '#t-feed', html: '📰 <b>Dein Bericht ist da:</b> «14 Schiffe warten, die Kräne stehen still» – ein eindeutiger Befund. <b>Der Streik kommt.</b><br>Achtung: 💬 Social Media ist billig und schnell, liegt aber oft falsch.' },
                { sel: '#t-rumors', html: '⚖️ Die <b>Beweis-Waage</b> zeigt jetzt «Eindeutiger Befund: BESTÄTIGT». Ohne klaren Befund musst du abwägen – oder eine zweite Quelle versuchen.' },
                { sel: '#t-risk', html: '📊 Das <b>Risiko-Cockpit</b> rechnet aus, was deine Position bei «bestätigt» und «dementiert» wert wäre. Hebel und Pfand zeigen, wie viel du riskierst.' },
                {
                    sel: '#t-ticket', act: 'buy', hint: '👉 Wähle eine Menge und tippe auf <b>KAUFEN</b>.',
                    html: '💹 Ein Hafenstreik heisst: weniger Kakao kommt an → <b>der Preis steigt</b>. Wette darauf!',
                    wrong: 'VERKAUFEN wäre eine Wette auf fallende Preise. Ein Streik lässt den Preis aber steigen.',
                    feedback: (t, p) => `✅ <b>Wette platziert:</b> ${t} t zu ${fmt(p)}. Wird der Streik bestätigt, springt der Preis – du gewinnst. Du hinterlegst nur ${pf} % als Pfand – Gewinne und Verluste wirken mit Hebel.`,
                },
                {
                    sel: '#t-ticket', act: 'close', hint: '👉 Tippe auf <b>VERKAUFEN</b>, um die Wette zu schliessen.',
                    html: '🔒 Nach der Auflösung schliesst du die Wette – dann ist dein Gewinn fix.',
                    wrong: 'Noch mehr kaufen vergrössert die Wette. Zum Schliessen tippst du auf das Gegenteil.',
                    feedback: () => '💰 <b>Geschlossen.</b> So verdient ein Hedgefonds: richtig liegen, rechtzeitig rein und wieder raus.',
                    leave: () => { tut.rumor = null; tut.reports = []; tSel = null; },
                },
                { ...callStep, html: `📞 <b>Übung: Margin Call.</b> Liegst du falsch, schmilzt dein Pfand. Fällt es unter ${Math.round(CFG.maintenance * 100)} %, musst du handeln.` },
                { html: `🏆 <b>Wertung:</b> Der Hedgefonds mit dem höchsten Gewinn gewinnt – Kosten für Berichte zählen mit.<br>${laterHTML}` },
                { ready: true, html: '✅ <b>Bereit für den Markt!</b> Die Börse öffnet, sobald alle bereit sind.' },
            ];
        }
        // Hedgefonds auf dem Handy
        return [
            { sel: '#p-goal', html: `🎯 <b>Dein Ziel:</b> ${R.goal} Du hast keinen Kakao – du wettest auf den Preis.` },
            { sel: '.p-price', html: '📈 Das ist der Kakaopreis – live. Steigt er und du hast gekauft, gewinnst du. Fällt er, verlierst du.' },
            {
                sel: '.p-dock', act: 'buy', hint: '👉 Wähle eine Menge und tippe auf <b>KAUFEN</b>.', html: '💹 <b>Probier\'s aus:</b> KAUFEN = Wette, dass Kakao steigt. (Übung)',
                wrong: 'VERKAUFEN ist die Wette auf fallende Preise. Probier zuerst KAUFEN.',
                feedback: (t, p) => `✅ Gekauft: ${t} t zu ${fmt(p)}. Steigt Kakao um 100 CHF/t, gewinnst du ${fmt(t * 100)} CHF – fällt er, verlierst du so viel.`,
            },
            {
                sel: '.p-dock', act: 'close', hint: '👉 Tippe auf <b>VERKAUFEN</b>, um die Wette zu schliessen.', html: '🔒 Schliessen: Mit dem Gegen-Knopf beendest du die Wette. Dann ist Gewinn oder Verlust fix.',
                wrong: 'Noch mehr kaufen vergrössert die Wette. Zum Schliessen tippst du auf VERKAUFEN.',
                feedback: () => '💰 <b>Geschlossen.</b> So verdient ein Hedgefonds: richtig liegen, rechtzeitig rein und raus.',
            },
            {
                sel: '#p-now', html: `📣 <b>Übung: Ein Gerücht!</b> «${rumorUp.text}». Der Preis steigt schon. Wettest du darauf, dass es stimmt?`,
                enter: () => { tut.now = `${rumorUp.icon} <b>Übung · Gerücht:</b> ${rumorUp.text}. Der Preis steigt schon.`; },
                leave: () => { tut.now = null; },
                choices: [
                    ['Kaufen (stimmt)', '🎲 Wird es <b>bestätigt</b>, springt der Preis – du gewinnst. Wird es <b>dementiert</b>, fällt er – du verlierst. Ohne Informationen ist es eine Wette.'],
                    ['Verkaufen (falsch)', '🎲 Wird es <b>dementiert</b>, fällt der Preis zurück – du gewinnst. Wird es <b>bestätigt</b>, verlierst du.'],
                ],
            },
            callStep,
            { html: `💻 <b>Tipp:</b> Öffne das Spiel am Laptop. Dort hast du das Hedgefonds-Terminal mit Weltkarte und Berichten – so musst du nicht raten.<br>${laterHTML}` },
            { ready: true, html: '✅ <b>Du kennst jetzt alles!</b> Die Börse öffnet, sobald alle bereit sind.' },
        ];
    }

    // ===== Hedgefonds-Terminal (Laptop, Vollbild) =====
    // Hedgefonds auf einem breiten Bildschirm bekommen das Terminal statt des Handy-Cockpits.
    const termMode = () => me && me.role === 'spec' && window.innerWidth >= 1000;
    let tSel = null;          // gewählter Ort auf der Karte
    let tQty = 5;             // Kontrakte pro Order
    let tMapBuilt = false;

    // Weltkarte (zugeschnitten auf die relevanten Breiten) + vergrösserter Ausschnitt Westafrika
    const TW = 630;
    const TH = 210;
    const tx = lon => ((lon + 165) / 315) * TW;
    const ty = lat => ((70 - lat) / 100) * TH;
    const WEST = ['gh', 'ci', 'abj', 'acc'];
    const IW = 300;
    const IH = 150;
    const ix = lon => ((lon + 9) / 12) * IW;
    const iy = lat => ((10.2 - lat) / 7.2) * IH;

    // Beweis-Waage: Ein eindeutiger Befund einer seriösen Quelle stimmt immer → Gewissheit.
    // Ohne eindeutigen Befund verschiebt nur Social Media die Waage ein wenig (kann falsch liegen).
    function evidence(reports) {
        const sure = reports.find(r => r.clear);
        if (sure) return sure.dir > 0 ? 1 : 0;
        let L = 0;
        for (const r of reports) if (r.soft && r.dir) L += r.dir * Math.log(r.rel / (1 - r.rel));
        return 1 / (1 + Math.exp(-L));
    }
    const stars = rel => '★'.repeat(rel >= 0.6 ? 3 : rel >= 0.5 ? 2 : 1) + '☆'.repeat(rel >= 0.6 ? 0 : rel >= 0.5 ? 1 : 2);

    function pin(k, x, y, side, label) {
        const L = INTEL_LOCS[k];
        const icons = L.types.map(t => INTEL_TYPES[t].icon).join('');
        const right = side === 'l';
        return `<g class="t-pin" data-loc="${k}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
            <circle class="t-pulse" r="13"/><circle class="t-dot" r="5.5"/>
            <text class="t-pl" x="${right ? -9 : 9}" y="-4" text-anchor="${right ? 'end' : 'start'}">${esc(label || L.name)}</text>
            <text class="t-pi" x="${right ? -9 : 9}" y="10" text-anchor="${right ? 'end' : 'start'}">${icons}</text></g>`;
    }

    function buildMap() {
        let dots = '';
        for (const [lat, ranges] of LAND) {
            if (lat > 72 || lat < -32) continue;
            for (const [a, b] of ranges) {
                for (let lon = a; lon <= b; lon += 2.5) if (lon >= -165 && lon <= 150) dots += `<circle cx="${tx(lon).toFixed(1)}" cy="${ty(lat).toFixed(1)}" r="1.6"/>`;
            }
        }
        const world = Object.keys(INTEL_LOCS).filter(k => !WEST.includes(k))
            .map(k => pin(k, tx(INTEL_LOCS[k].lon), ty(INTEL_LOCS[k].lat), ['sha', 'id', 'lon'].includes(k) ? 'l' : 'r')).join('');
        // Rahmen um Westafrika auf der Weltkarte
        const bx = tx(-10);
        const by = ty(11);
        const box = `<g class="t-west"><rect x="${bx}" y="${by}" width="${tx(4) - bx}" height="${ty(3) - by}" rx="3"/><text x="${bx}" y="${by + (ty(3) - by) + 12}">Westafrika ↓</text></g>`;
        // Ausschnitt Westafrika: Küste am Golf von Guinea, Grenze Elfenbeinküste/Ghana
        const coast = [[-9, 4.6], [-7.5, 4.3], [-6, 4.9], [-4.6, 5.2], [-3, 5.1], [-2, 4.8], [-1, 5.1], [0, 5.6], [1, 6.1], [2, 6.3], [3, 6.4]];
        const cpts = coast.map(([lo, la]) => `${ix(lo).toFixed(1)},${iy(la).toFixed(1)}`).join(' ');
        const inset = `<svg viewBox="0 0 ${IW} ${IH}" class="t-inset-svg">
            <polygon points="0,0 ${IW},0 ${cpts.split(' ').reverse().join(' ')}" class="t-ins-land" transform="scale(1)"/>
            <polyline points="${cpts}" class="t-ins-coast"/>
            <line x1="${ix(-3)}" y1="${iy(10.2)}" x2="${ix(-3)}" y2="${iy(5.1)}" class="t-ins-border"/>
            <text x="${ix(-8.6)}" y="${iy(9.6)}" class="t-ins-c">ELFENBEINKÜSTE</text><text x="${ix(-2.6)}" y="${iy(9.6)}" class="t-ins-c">GHANA</text>
            <text x="${ix(-6)}" y="${iy(3.5)}" class="t-ins-sea">Golf von Guinea</text>
            ${pin('ci', ix(INTEL_LOCS.ci.lon), iy(INTEL_LOCS.ci.lat), 'r', 'Plantagen')}${pin('gh', ix(INTEL_LOCS.gh.lon), iy(INTEL_LOCS.gh.lat), 'r', 'Plantagen')}
            ${pin('abj', ix(INTEL_LOCS.abj.lon), iy(INTEL_LOCS.abj.lat) + 4, 'l', 'Hafen Abidjan')}${pin('acc', ix(INTEL_LOCS.acc.lon), iy(INTEL_LOCS.acc.lat) + 4, 'l', 'Accra · Tema')}</svg>`;
        $('t-map').innerHTML = `<svg viewBox="0 0 ${TW} ${TH}" class="t-world" preserveAspectRatio="xMidYMid meet"><g class="t-land">${dots}</g>
            <g class="t-grid-l">${[-20, 0, 20, 40, 60].map(l => `<line x1="0" x2="${TW}" y1="${ty(l)}" y2="${ty(l)}"/>`).join('')}</g>${box}${world}</svg>
            <div class="t-inset"><div class="t-inset-h">AUSSCHNITT WESTAFRIKA · 70 % der Welternte</div>${inset}</div>`;
        $('t-map').querySelectorAll('.t-pin').forEach(g => g.addEventListener('click', () => {
            if (tutActive() && tut.wait === 'pin') { tutPin(g.dataset.loc); return; }
            tSel = g.dataset.loc;
            Sound.play('tick');
            renderTerm();
        }));
        tMapBuilt = true;
    }

    function renderTerm() {
        if (!me || !pub || !me.intel) return;
        if (pub.phase !== 'pre' && tut.i >= 0 && !tut.done) tutAbort();
        if (!tMapBuilt) buildMap();
        const I = me.intel;
        document.body.dataset.role = 'spec';
        // Kopfzeile
        $('t-fund').innerHTML = `${roleIcon('spec', 22)} <b>${esc(me.name)}</b><small>${RANKS[me.level].icon} ${RANKS[me.level].name}</small>`;
        const ch = pub.price / pub.p0 - 1;
        $('t-price').textContent = fmt(pub.price);
        $('t-chg').innerHTML = `<span class="${ch >= 0 ? 'up' : 'down'}">${arrow(ch)}${pct(ch)}</span>`;
        $('t-pl').innerHTML = `<span class="${me.result >= 0 ? 'up' : 'down'}">${arrow(me.result)}${signed(me.result)}</span>`;
        $('t-rank').innerHTML = `${me.rank}<small>/${me.roleCount}</small>`;
        $('t-month').textContent = pub.phase === 'pre' ? 'PRE-MARKET' : pub.phase === 'settle' ? 'ABRECHNUNG' : `MONAT ${pub.month}/${pub.months}${pub.years > 1 ? ` · JAHR ${pub.year}` : ''}`;
        $('t-timer').textContent = pub.phase === 'settle' ? '⏸' : mmss(pub.secLeft);
        $('t-timer').classList.toggle('urgent', pub.phase === 'trading' && pub.secLeft <= 10);
        const n = nowText();
        $('t-now').className = `t-now ${n.k}`;
        setHTML($('t-now'), n.t);

        // Gerüchte + Beweis-Waage (im Tutorial mit Übungs-Gerücht und Übungs-Berichten)
        const rum = tut.rumor ? [tut.rumor, ...I.rumors] : I.rumors;
        const allReps = [...I.reports, ...tut.reports];
        setHTML($('t-rumors'), rum.length ? rum.map(r => {
            const reps = allReps.filter(x => x.rid === r.id);
            const p = evidence(reps);
            const span = Math.max(1, r.left + r.since);
            return `<div class="t-rumor ${r.left <= 3 ? 'tense' : ''}">
                <div class="tr-h"><span>${r.icon} ${esc(r.text)}</span><b>${r.left}s</b></div>
                ${r.region ? `<div class="tr-reg">📍 Betrifft: ${esc(REGIONS[r.region].name)}</div>` : ''}
                <i class="tr-bar" style="width:${(r.left / span) * 100}%"></i>
                <div class="t-scale"><span>DEMENTI</span><div class="ts-track"><em style="left:${(p * 100).toFixed(1)}%"></em></div><span>BESTÄTIGT</span></div>
                <div class="ts-read">${reps.some(x => x.clear) ? `<b class="${p >= 0.5 ? 'up' : 'down'}">✔ Eindeutiger Befund: ${p >= 0.5 ? 'BESTÄTIGT' : 'DEMENTI'}</b> – so wird es kommen.`
                    : reps.length ? `Noch kein eindeutiger Befund${reps.some(x => x.soft) ? ` · Social Media: eher ${p >= 0.5 ? 'BESTÄTIGT' : 'DEMENTI'} (unsicher)` : ''}`
                        : '<span class="dim">Noch keine Berichte. Wo auf der Karte würdest du nachschauen?</span>'}</div>
                ${reps.length ? `<div class="ts-chips">${reps.map(x => `<span class="${x.clear ? (x.dir > 0 ? 'up' : 'down') : ''}" title="${esc(x.text)}">${x.icon}${x.clear ? (x.dir > 0 ? '✔▲' : '✔▼') : x.soft ? (x.dir > 0 ? '~▲' : '~▼') : '?'}</span>`).join('')}</div>` : ''}
            </div>`;
        }).join('') : '<div class="t-empty">Kein Gerücht offen. Beobachte den Markt – das nächste kommt bestimmt.</div>');

        // Risiko-Cockpit
        const posT = me.pos * CFG.size;
        const lev = me.eq > 0 ? Math.abs(posT * pub.price) / Math.max(1, me.cash + me.eq) : 0;
        const reserve = me.req ? me.eq / me.req : null;
        const basis = me.pos ? posT : tQty * CFG.size;
        const scen = rum.map(r => {
            const yes = basis * pub.price * r.jumpYes;
            const no = basis * pub.price * r.jumpNo;
            return `<div class="t-scen"><div class="sc-t">${r.icon} ${esc(r.text)}</div>
                <div class="sc-row"><span>✅ Bestätigt: Kakao ${arrow(r.jumpYes)}${pct(r.jumpYes)}</span><b class="${yes >= 0 ? 'up' : 'down'}">${arrow(yes)}${signed(yes)}</b></div>
                <div class="sc-row"><span>❌ Dementi: Kakao ${arrow(r.jumpNo)}${pct(r.jumpNo)}</span><b class="${no >= 0 ? 'up' : 'down'}">${arrow(no)}${signed(no)}</b></div></div>`;
        }).join('');
        setHTML($('t-risk'), `<div class="t-kvs">
                <div><small>POSITION</small><b class="${me.pos > 0 ? 'up' : me.pos < 0 ? 'down' : ''}">${me.pos ? `${me.pos > 0 ? '▲ Long' : '▼ Short'} ${Math.abs(posT)} t` : 'flat'}</b></div>
                <div><small>OFFEN</small><b class="${me.unreal >= 0 ? 'up' : 'down'}">${arrow(me.unreal)}${signed(me.unreal)}</b></div>
                <div><small>HEBEL</small><b class="${lev > 4 ? 'down' : ''}">${lev.toFixed(1)}×</b></div>
                <div><small>PFAND</small><b class="${reserve !== null && reserve < CFG.maintenance ? 'down' : ''}">${reserve === null ? '–' : `${Math.round(reserve * 100)} %`}</b></div>
                <div><small>BARGELD</small><b>${fmt(me.cash)}</b></div>
                <div><small>INTEL-KOSTEN</small><b>${fmt(I.spent)}</b></div></div>
            ${rum.length ? `<div class="sc-h">Szenarien ${me.pos ? 'für deine Position' : `für ${tQty * CFG.size} t Long (Beispiel)`}</div>${scen}` : '<div class="t-empty">Szenarien erscheinen, sobald ein Gerücht läuft.</div>'}`);

        // Karte: Auswahl, laufender Auftrag, betroffene Region
        const hot = new Set(rum.filter(r => r.region).map(r => REGION_LOC[r.region]));
        $('t-map').querySelectorAll('.t-pin').forEach(g => {
            const k = g.dataset.loc;
            g.classList.toggle('sel', k === tSel);
            g.classList.toggle('hot', hot.has(k));
            g.classList.toggle('busy', !!(I.job && I.job.loc === k));
        });
        const job = I.job;
        $('t-job').classList.toggle('hidden', !job);
        if (job) setHTML($('t-job'), `<span>${INTEL_TYPES[job.type].icon} ${esc(INTEL_TYPES[job.type].name)} · ${esc(INTEL_LOCS[job.loc].name)}</span><b>${job.left}s</b><i style="width:${((job.dur - job.left) / Math.max(1, job.dur)) * 100}%"></i>`);
        $('t-loc').classList.toggle('hidden', !tSel);
        if (tSel) {
            const L = INTEL_LOCS[tSel];
            setHTML($('t-loc'), `<div class="tl-h"><b>📍 ${esc(L.name)}</b><button class="t-x" data-tx="close">✕</button></div>
                ${L.types.map(t => {
                    const c = I.costs[t];
                    const can = !job && pub.phase !== 'end' && me.cash >= c.cost;
                    return `<div class="tl-src"><span class="tl-ico">${INTEL_TYPES[t].icon}</span><span class="tl-n"><b>${esc(INTEL_TYPES[t].name)}</b><small>${c.dur} s · ${INTEL_TYPES[t].soft ? `unbestätigt, liegt oft falsch` : `Chance auf klaren Befund ${stars(c.rel / 100)} ${c.rel} %`}</small></span>
                        <button class="t-btn" data-src="${tSel}:${t}" ${can ? '' : 'disabled'}>${fmt(c.cost)} CHF</button></div>`;
                }).join('')}
                <div class="tl-hint">${job ? 'Dein Team arbeitet noch – ein Bericht nach dem anderen.' : 'Seriöse Quellen lügen nie: entweder ein klarer Befund – oder «kein klarer Befund». Passt die Quelle nicht zum Gerücht, ist das Geld weg.'}</div>`);
        }

        // Intel-Feed
        const feed = allReps.slice().reverse();
        setHTML($('t-feed'), feed.length ? feed.map(r => `<div class="t-rep ${r.clear ? (r.dir > 0 ? 'yes' : 'no') : r.soft ? 'soft' : 'none'}">
                <div class="rp-top"><span>${r.icon} ${esc(r.src)} · ${esc(r.place)}</span><small>${r.practice ? 'ÜBUNG' : r.clear ? '✔ EINDEUTIG' : r.soft ? '~ UNBESTÄTIGT' : r.none ? 'PASST NICHT' : '? UNKLAR'}</small></div>
                <div class="rp-txt">${esc(r.text)}</div>
                <div class="rp-tag">${r.clear ? (r.dir > 0 ? '✔ Das Gerücht wird BESTÄTIGT' : '✔ Das Gerücht wird DEMENTIERT') : r.soft ? (r.dir > 0 ? '~ spricht eher für BESTÄTIGT – kann falsch sein' : '~ spricht eher für DEMENTI – kann falsch sein') : r.none ? '– diese Quelle passt zu keinem laufenden Gerücht' : '? kein klarer Befund – nochmals versuchen oder andere Quelle'}${r.rumor ? ` · «${esc(r.rumor)}»` : ''}</div></div>`).join('')
            : '<div class="t-empty">Noch keine Berichte. Klicke auf der Karte einen Ort an.</div>');

        // Order-Ticket
        const closed = (pub.phase !== 'trading' || pub.paused || me.bankrupt) && !(tutActive() && ['buy', 'sell', 'close'].includes(tut.wait));
        const ask = Math.round(pub.price * (1 + CFG.spread));
        const bid = Math.round(pub.price * (1 - CFG.spread));
        setHTML($('t-ticket'), `<div class="tk-q"><small>MENGE</small>${[1, 2, 5, 10, 20].filter(q => q <= me.bounds.max).map(q => `<button class="${q === tQty ? 'on' : ''}" data-tq="${q}">${q * CFG.size} t</button>`).join('')}</div>
            <div class="tk-btns"><button class="tk-buy" data-tt="1" ${closed || room(1) <= 0 ? 'disabled' : ''}><b>KAUFEN</b><span>${fmt(ask)}</span><small>▲ Wette: steigt</small></button>
                <button class="tk-sell" data-tt="-1" ${closed || room(-1) <= 0 ? 'disabled' : ''}><b>VERKAUFEN</b><span>${fmt(bid)}</span><small>▼ Wette: fällt</small></button></div>
            ${me.pos ? `<button class="t-btn wide" data-tt="close" ${closed ? 'disabled' : ''}>Position schliessen (${Math.abs(posT)} t)</button>` : ''}
            <div class="tk-lim">Limit ±${me.bounds.max * CFG.size} t · Pfand ${Math.round(CFG.marginRate * 100)} % · Gebühr ${CFG.fee} CHF/Kontrakt</div>`);

        tChart();
        renderCall();
        if (pub.phase === 'pre') tutStart();
        coach('term', '🛰️ <b>Dein Terminal.</b> Jedes Gerücht hat einen Ort. Klicke ihn auf der Karte an und fordere einen Bericht an. Jeder Bericht ist nur ein Indiz – die Beweis-Waage links zeigt, wohin sie zeigen.');
        if (rum.length) coach('term-scen', '⚖️ <b>Risiko-Cockpit:</b> Links unten siehst du, was deine Position bei «bestätigt» und bei «dementiert» wert wäre. Wer zu früh oder zu gross wettet, riskiert viel.');
    }

    function tChart() {
        const cv = $('t-chart');
        const dpr = window.devicePixelRatio || 1;
        const W = cv.clientWidth;
        const H = cv.clientHeight;
        if (!W || !H) return;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
            cv.width = Math.round(W * dpr);
            cv.height = Math.round(H * dpr);
        }
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, W, H);
        const d = pub.history || [];
        if (d.length < 2) return;
        const lo = Math.min(...d, pub.p0) - 10;
        const hi = Math.max(...d, pub.p0) + 10;
        const X = i => 54 + (i / (d.length - 1)) * (W - 70);
        const Y = v => 10 + ((hi - v) / (hi - lo)) * (H - 26);
        c.font = '11px "JetBrains Mono", monospace';
        c.fillStyle = '#5b6b85';
        c.strokeStyle = 'rgba(120,150,200,.12)';
        for (let i = 0; i <= 3; i++) {
            const v = lo + ((hi - lo) * i) / 3;
            c.beginPath();
            c.moveTo(54, Y(v));
            c.lineTo(W - 16, Y(v));
            c.stroke();
            c.fillText(fmt(v), 4, Y(v) + 4);
        }
        c.setLineDash([3, 4]);
        c.strokeStyle = 'rgba(255,255,255,.3)';
        c.beginPath();
        c.moveTo(54, Y(pub.p0));
        c.lineTo(W - 16, Y(pub.p0));
        c.stroke();
        c.setLineDash([]);
        const up = d[d.length - 1] >= pub.p0;
        const col = up ? '#22e58a' : '#ff4d6a';
        c.beginPath();
        d.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
        c.strokeStyle = col;
        c.lineWidth = 2;
        c.stroke();
        c.lineTo(X(d.length - 1), H - 16);
        c.lineTo(X(0), H - 16);
        c.closePath();
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, up ? 'rgba(34,229,138,.22)' : 'rgba(255,77,106,.22)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fill();
        c.fillStyle = '#5b6b85';
        c.fillText('letzte 90 s', W - 90, H - 3);
    }

    function bindTerm() {
        $('v-term').addEventListener('click', ev => {
            const b = ev.target.closest('button');
            if (!b || b.disabled) return;
            if (b.dataset.src) { if (tutSrc(b.dataset.src)) return; send({ t: 'intel', src: b.dataset.src }); Sound.play('tick'); }
            if (b.dataset.tx === 'close') { tSel = null; renderTerm(); }
            if (b.dataset.tq) { tQty = Number(b.dataset.tq); renderTerm(); }
            if (b.dataset.tt === 'close') send({ t: 'trade', q: -me.pos });
            else if (b.dataset.tt) {
                const dir = Number(b.dataset.tt);
                if (tutTrade(dir)) return;
                send({ t: 'trade', q: dir * Math.max(1, Math.min(tQty, room(dir))) });
            }
        });
        window.addEventListener('resize', () => { if (me && pub && pub.phase !== 'lobby' && !ended) onData({ t: 's', pub, me }); });
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
        const key = JSON.stringify([me.upgrades, me.cash, me.level, last, yi && yi.rank]);
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
            ${yi && yi.mirror ? `<div class="card">${mirrorHTML(yi.mirror)}</div>` : ''}
            <div class="shop-h"><span>🏗️ Ausbau</span><b>💰 ${fmt(me.cash)} CHF</b></div>
            <p class="dim small">Investiere in deine Firma. Jede Investition kostet jetzt Geld – und muss sich in den nächsten Jahren auszahlen.</p>
            <div class="shop-cards">${ups.map(u => {
                const own = me.upgrades.includes(u.id);
                const can = !own && me.cash >= u.cost;
                return `<div class="shop-card ${own ? 'own' : ''}" style="--rc:${R.color}"><div class="sc-ico">${u.icon}</div><div class="sc-body"><b>${u.name}</b><p>${u.desc}</p></div>
                    ${own ? '<div class="sc-own">✔ Gekauft</div>' : `<button class="btn ${can ? 'btn-primary' : 'btn-ghost'} sc-buy" data-up="${u.id}" ${can ? '' : 'disabled'}>${fmt(u.cost)} CHF</button>`}</div>`;
            }).join('')}</div>
            <div class="dim small pulse">Der Host startet das nächste Jahr – oder es geht automatisch weiter, wenn die Zeit abläuft.</div>`;
        $('shop-body').querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => {
            send({ t: 'upgrade', id: b.dataset.up });
            Sound.play('buy');
        }));
    }

    // Persönlicher Spiegel: Was hat meine Absicherung gebracht? Wann habe ich gehandelt?
    function mirrorHTML(m) {
        if (!m) return '';
        const W = 300;
        const H = 80;
        const ps = m.hist.map(h => h[1]);
        const lo = Math.min(...ps, m.p0);
        const hi = Math.max(...ps, m.p0);
        const X = sec => 4 + (sec / Math.max(1, m.total)) * (W - 8);
        const Y = v => H - 8 - ((v - lo) / Math.max(1, hi - lo)) * (H - 16);
        const line = m.hist.map(([sec, v]) => `${X(sec).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
        const marks = m.moments.map((t, i) => `<g><circle cx="${X(t.s).toFixed(1)}" cy="${Y(t.price).toFixed(1)}" r="6" fill="${t.q > 0 ? '#22e58a' : '#ff4d6a'}" stroke="#fff" stroke-width="1.5"/><text x="${X(t.s).toFixed(1)}" y="${(Y(t.price) - 9).toFixed(1)}" text-anchor="middle" font-size="10" fill="#fff" font-weight="700">${i + 1}</text></g>`).join('');
        const hedger = m.role !== 'spec';
        const diffTxt = hedger
            ? (m.diff >= 0 ? `🛡️ Deine Absicherung hat dir <b class="up">▲ ${signed(m.diff)} CHF</b> gebracht.` : `🛡️ Ohne Absicherung hättest du <b class="down">${fmt(-m.diff)} CHF mehr</b> – dafür warst du geschützt.`)
            : `🦈 Deine Wetten: <b class="${m.diff >= 0 ? 'up' : 'down'}">${m.diff >= 0 ? '▲' : '▼'} ${signed(m.diff)} CHF</b>`;
        return `<div class="mirror"><h4>🪞 Dein Jahr im Rückblick</h4>
            <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${Y(m.p0)}" y2="${Y(m.p0)}" stroke="rgba(255,255,255,.3)" stroke-dasharray="3 4"/><polyline points="${line}" fill="none" stroke="#ffb547" stroke-width="2"/>${marks}</svg>
            ${m.moments.length ? `<div class="m-legend">${m.moments.map((t, i) => `${i + 1}: ${t.q > 0 ? '🟢 gekauft' : '🔴 verkauft'} ${Math.abs(t.q * CFG.size)} t zu ${fmt(t.price)}`).join(' · ')}</div>` : '<div class="m-legend">Kein Trade in diesem Jahr.</div>'}
            <div class="m-diff">${diffTxt}</div>
            <div class="m-text">💬 ${esc(m.text)}</div></div>`;
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
            ${msg.mirror ? mirrorHTML(msg.mirror) : ''}
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
        $('p-buy').addEventListener('click', () => { if (tutTrade(1)) return; send({ t: 'trade', q: me ? Math.max(1, Math.min(qty, room(1))) : qty }); });
        $('p-sell').addEventListener('click', () => { if (tutTrade(-1)) return; send({ t: 'trade', q: -(me ? Math.max(1, Math.min(qty, room(-1))) : qty) }); });
        $('btn-rejoin').addEventListener('click', () => join(code, name));
        bindTerm();
        document.addEventListener('visibilitychange', revive);
        window.addEventListener('online', revive);
        $('w-roles').querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.role === role) return;
            Sound.play('join');
            send({ t: 'role', role: b.dataset.role });
        }));
    }

    return { join, bind };
})();
