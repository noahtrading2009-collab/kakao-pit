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
    // Vibration nur, wenn der Browser es erlaubt (nach der ersten Berührung)
    const buzz = pat => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(pat); } catch (e) { /* egal */ } };
    let nowFlash = null;
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
            const view = termMode() ? 'v-term' : deskMode() ? 'v-desk' : 'v-player';
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
            if (pub.phase !== 'lobby') (view === 'v-term' ? renderTerm() : view === 'v-desk' ? renderDesk() : render());
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
                buzz(30);
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
        if (nowFlash && Date.now() < nowFlash.until) return { k: nowFlash.k, t: nowFlash.t };
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
                buzz([40, 80, 40, 80, 40]);
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
        setHTML($('p-goal'), goalHTML());
    }

    function goalHTML() {
        const R = ROLES[me.role];
        let html;
        const acct = `<div class="g-acct"><span>Futures <b>${me.pos ? `${me.pos > 0 ? 'Long' : 'Short'} ${Math.abs(me.pos * CFG.size)} t` : '–'}</b></span>
            <span>Offen <b class="${me.unreal > 0 ? 'up' : me.unreal < 0 ? 'down' : ''}">${arrow(me.unreal)}${signed(me.unreal)}</b></span>
            <span>Pfand <b class="${me.req && me.eq < me.req * CFG.maintenance ? 'bad' : ''}">${me.req ? `${Math.round((me.eq / me.req) * 100)} %` : '–'}</b></span>
            <span>Bargeld <b>${fmt(me.cash)}</b></span></div>`;
        if (me.role !== 'spec') {
            const prod = me.role === 'producer';
            // Verträge sind eine Absicherung mit fixem Preis – sie zählen mit
            const dt = me.dealsT || 0;
            const need = Math.max(0, prod ? me.physical : -me.physical) + dt;
            const hedged = Math.max(0, prod ? -me.pos * CFG.size : me.pos * CFG.size) + dt;
            const q = need ? hedged / need : 0;
            const over = hedged > need;
            const good = prod ? me.metric >= pub.p0 : me.metric <= pub.p0;
            html = `<div class="g-head">🎯 ${R.goal}</div>
                <div class="g-bar seg ${over ? 'over' : ''}"><i class="sg-deal" style="width:${need ? Math.min(100, (dt / need) * 100) : 0}%"></i><i class="sg-fut" style="width:${need ? Math.max(0, Math.min(100, ((hedged - dt) / need) * 100)) : 0}%"></i></div>
                <div class="g-legend"><span class="sg-deal">📜 ${dt} t Vertrag</span><span class="sg-fut">🔒 ${Math.max(0, hedged - dt)} t Futures</span><span class="sg-open">offen ${Math.max(0, need - hedged)} t</span></div>
                <div class="g-row"><span>Abgesichert <b>${hedged} t</b> von ${need} t${dt ? ` <small class="dim">(${dt} t per Vertrag)</small>` : ''}</span><b>${Math.round(q * 100)} %</b></div>
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
        return html;
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

    // ===== Entscheidungskarte (Schmuggler, Trocknung, Schokoladen-Krise) =====
    function decisionHTML() {
        const D = me.decision;
        if (!D) return '';
        const left = `<span class="oc-left" data-left="${D.left}"></span>`;
        if (D.kind === 'smuggle') {
            return `<div class="dec-card warn fresh"><div class="oc-top"><b>🕵️ Schmuggler locken deine Bauern</b>${left}</div>
                <div>Über die Grenze zahlen Schmuggler <b>${fmt(D.smugP)} CHF/t</b> – deine Kooperative zahlt den Bauern nur ${fmt(pub.p0)}. Ohne Bonus verschwinden etwa <b>${D.loss} t</b>.</div>
                <div class="oc-btns col"><button class="btn btn-primary" data-rp="dec-pay" ${me.cash < D.bonus ? 'disabled' : ''}>🤝 Bonus zahlen: ${fmt(D.bonus)} CHF</button><button class="btn btn-ghost" data-rp="dec-none">Nichts tun (−${D.loss} t)</button></div>
                <div class="small dim">Weniger Tonnen heisst: Was du schon abgesichert hast, ist plötzlich zu viel.</div></div>`;
        }
        if (D.kind === 'dry') {
            return `<div class="dec-card fresh"><div class="oc-top"><b>☀️ Die Ernte muss trocknen</b>${left}</div>
                <div>Wie trocknest du die Bohnen? Das entscheidet über die Qualität – und den Preis im Dezember.</div>
                <div class="oc-btns col"><button class="btn btn-primary" data-rp="dec-sun">☀️ An der Sonne: Qualität A, +${CFG.qSun} CHF/t<small>${Math.round(CFG.rainRisk * 100)} % Regenrisiko: dann verderben 12 %</small></button>
                <button class="btn btn-ghost" data-rp="dec-fast">🔥 Im Ofen: sicher, aber Qualität B (${CFG.qFast} CHF/t)</button></div></div>`;
        }
        if (D.kind === 'recipe') {
            return `<div class="dec-card warn fresh"><div class="oc-top"><b>🍫 Schokoladen-Krise: Kakao ${pct(D.rise)}</b>${left}</div>
                <div>Deine Schokolade wird teurer in der Herstellung. Wie reagierst du?</div>
                <div class="oc-btns col">
                    <button class="btn btn-ghost" data-rp="dec-price">💸 Preise erhöhen<small>Mehr Marge pro Tafel – aber 20 % weniger Kunden</small></button>
                    <button class="btn btn-ghost" data-rp="dec-recipe">🧪 Rezeptur ändern<small>15 % weniger Kakao – merkt es jemand?</small></button>
                    <button class="btn btn-ghost" data-rp="dec-shrink">📏 Tafel verkleinern<small>10 % weniger Kakao, etwas mehr Marge – Mogelpackung?</small></button>
                    <button class="btn btn-ghost" data-rp="dec-absorb">🤝 Kosten selbst tragen<small>Ehrlich – gut abgesichert tut es weniger weh</small></button></div>
                <div class="small dim">Weniger Kakao nötig heisst: Hast du schon viel abgesichert, ist es plötzlich zu viel.</div></div>`;
        }
        return '';
    }

    // Entscheidungen stehen ganz oben – mit Ton und Vibration, damit niemand sie verpasst
    let decKey = '';
    function renderDecision() {
        const el = $('p-decision');
        const D = me.decision;
        if (!D) { el.classList.add('hidden'); el.innerHTML = ''; decKey = ''; return; }
        el.classList.remove('hidden');
        if (decKey !== String(D.id)) {
            decKey = String(D.id);
            el.innerHTML = decisionHTML();
            Sound.play('alarm');
            buzz([120, 80, 120]);
            el.parentElement.scrollTop = 0;
            el.querySelectorAll('[data-rp]').forEach(b => b.addEventListener('click', () => {
                send({ t: 'decide', choice: b.dataset.rp.slice(4) });
                Sound.play('tick');
            }));
        }
        const l = el.querySelector('[data-left]');
        if (l) l.textContent = `${D.left}s`;
    }

    // ===== Lieferverträge zwischen Kooperativen und Fabriken =====
    let dealT = 20;
    let dealP = null;
    let dealPSet = false;   // hat der Spieler den Preis selbst verstellt? Sonst folgt er dem Markt.
    function dealsHTML() {
        const V = me.deals;
        if (!V) return '';
        const prod = me.role === 'producer';
        const otherName = prod ? 'Fabriken' : 'Kooperativen';
        const open = pub.phase === 'trading';
        if (!dealPSet || dealP === null || Math.abs(dealP / pub.price - 1) > CFG.dealBand) dealP = Math.round(pub.price / 10) * 10;
        const offers = V.offers.map(o => {
            const better = prod ? o.price - pub.price : pub.price - o.price;
            return `<div class="dl-row"><span><b>${esc(o.name)}</b>${o.rep ? ` <em class="bad">⚠️ ${o.rep}× gebrochen</em>` : ''}<small>${prod ? 'kauft' : 'verkauft'} ${o.t} t zu <b>${fmt(o.price)}</b> · <i data-left="${o.left}"></i></small>
                <small class="live">Börse ${fmt(pub.price)} → <b class="${better >= 0 ? 'up' : 'down'}">${better >= 0 ? '▲ besser' : '▼ schlechter'} um ${fmt(Math.abs(better))}</b></small></span>
                <button class="btn btn-primary btn-sm" data-rp="dacc-${o.id}" ${open ? '' : 'disabled'}>Annehmen</button></div>`;
        }).join('');
        const signed = V.signed.map(d => {
            const val = (prod ? d.price - pub.price : pub.price - d.price) * d.t;
            return `<div class="dl-row signed"><span><b>✔ ${esc(d.with)}</b><small>${d.t} t zu ${fmt(d.price)} – fix für Dezember</small>
                <small class="live">Heute für dich: <b class="${val >= 0 ? 'up' : 'down'}">${val >= 0 ? '▲' : '▼'} ${signed2(val)}</b></small></span>
                <button class="btn btn-ghost btn-sm brk" data-rp="dbrk-${d.id}">💔 Brechen<small>−${fmt(d.fee)}</small></button></div>`;
        }).join('');
        const mine = V.mine.map(d => `<div class="dl-row mine"><span><b>Dein Angebot</b><small>${d.t} t zu ${fmt(d.price)} an alle ${otherName} · <i data-left="${d.left}"></i></small></span>
            <button class="btn btn-ghost btn-sm" data-rp="dcan-${d.id}">Zurückziehen</button></div>`).join('');
        const form = V.mine.length ? '' : `<div class="dl-form"><div class="dl-q">${[10, 20, 30, 40, 50].map(t => `<button class="${t === dealT ? 'on' : ''}" data-rp="dt-${t}">${t} t</button>`).join('')}</div>
            <div class="dl-p"><button data-rp="dp-m">−</button><span>zu <b>${fmt(dealP)}</b> CHF/t</span><button data-rp="dp-p">+</button>
            <button class="btn btn-primary btn-sm" data-rp="dsend" ${open ? '' : 'disabled'}>${prod ? 'Verkaufen anbieten' : 'Kaufen anbieten'}</button></div></div>`;
        return `<div class="deals"><div class="dl-h">📜 Lieferverträge <small>direkt mit den ${otherName}${me.rep ? ` · <span class="bad">du hast ${me.rep}× gebrochen</span>` : ''}</small></div>
            ${offers || ''}${signed}${mine}${form}</div>`;
    }
    const signed2 = v => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;

    function renderRolePanel() {
        const el = $('p-rolepanel');
        renderDecision();
        const html = rolePanelHTML();
        rolePanelApply(el, html);
    }

    function rolePanelHTML(withDeals = true) {
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
        } else if (me.role === 'processor' && F.orders && !me.decision) {
            const o = me.orderOffer;
            if (o) html += `<div class="order-card${freshCard(o)}"><div class="oc-top"><b>📦 ${esc(o.client)}</b><span class="oc-left" data-left="${o.left}"></span></div>
                    <div>Bestellt Schokolade aus <b>${o.t} t Kakao</b>, fester Erlös <b>${fmt(o.price)} CHF/t</b>.</div>
                    <div class="small live">Kakao heute ${fmt(pub.price)} → Marge <b class="up">▲ ${fmt(o.price - pub.price)} CHF/t</b>. Dein Bedarf steigt um ${o.t} t.</div>
                    <div class="oc-btns"><button class="btn btn-primary" data-rp="order-yes">Annehmen</button><button class="btn btn-ghost" data-rp="order-no">Ablehnen</button></div></div>`;
            else html += '<div class="small dim">📦 Warte auf den nächsten Kundenauftrag …</div>';
            html += me.orders.slice(-2).map(x => `<div class="rp-log">✔ ${esc(x.client)} · ${x.t} t zu ${fmt(x.price)}</div>`).join('');
        }
        if (withDeals && me.role !== 'spec' && F.deals) html += dealsHTML();
        if (me.role === 'spec') {
            html += '<div class="small">💻 <b>Tipp:</b> Öffne das Spiel am Laptop. Dort hast du das Hedgefonds-Terminal mit Weltkarte, Berichten und Risiko-Cockpit.</div>';
        }
        return html;
    }

    function rolePanelApply(el, html) {
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
        el.querySelectorAll('[data-rp]').forEach(b => b.addEventListener('click', () => rpAction(b.dataset.rp)));
    }

    const rerender = () => (deskMode() ? renderDesk() : renderRolePanel());

    // Aktionen aus Rollen-Panel und Leitstand (gleiche Knöpfe)
    function rpAction(a) {
            if (a === 'protect') send({ t: 'protect' });
            if (a === 'order-yes') send({ t: 'order', accept: true });
            if (a === 'order-no') send({ t: 'order', accept: false });
            if (a === 'buyer-yes') send({ t: 'buyer', accept: true });
            if (a === 'buyer-no') send({ t: 'buyer', accept: false });
            if (a.startsWith('dec-')) { send({ t: 'decide', choice: a.slice(4) }); Sound.play('tick'); }
            if (a.startsWith('dacc-')) send({ t: 'dealAccept', id: Number(a.slice(5)) });
            if (a.startsWith('dcan-')) send({ t: 'dealCancel', id: Number(a.slice(5)) });
            if (a.startsWith('dbrk-')) {
                const d = me.deals.signed.find(x => x.id === Number(a.slice(5)));
                if (d && confirm(`Vertrag mit ${d.with} brechen? Du zahlst ${fmt(d.fee)} CHF Strafe – und alle sehen es auf dem Beamer.`)) send({ t: 'dealBreak', id: d.id });
            }
            if (a.startsWith('dt-')) { dealT = Number(a.slice(3)); panelKey = ''; rerender(); }
            if (a === 'dp-m' || a === 'dp-p') {
                const lo = Math.ceil((pub.price * (1 - CFG.dealBand)) / 10) * 10;
                const hi = Math.floor((pub.price * (1 + CFG.dealBand)) / 10) * 10;
                dealP = clamp(dealP + (a === 'dp-p' ? 10 : -10), lo, hi);
                dealPSet = true;
                panelKey = '';
                rerender();
            }
            if (a === 'dsend') { send({ t: 'dealOffer', qty: dealT, price: dealP }); dealPSet = false; }
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
            buzz([200, 100, 200]);
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
        const dpr = HQ();
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
        // feines Raster
        c.beginPath();
        c.strokeStyle = 'rgba(255,255,255,.05)';
        c.lineWidth = 1;
        for (let i = 1; i < 4; i++) { c.moveTo(0, Math.round((H * i) / 4) + 0.5); c.lineTo(W, Math.round((H * i) / 4) + 0.5); }
        for (let i = 1; i < 6; i++) { c.moveTo(Math.round((W * i) / 6) + 0.5, 0); c.lineTo(Math.round((W * i) / 6) + 0.5, H); }
        c.stroke();
        c.beginPath();
        data.forEach((v, i) => {
            const x = (i / (data.length - 1)) * (W - 4) + 2;
            const y = H - 4 - ((v - lo) / span) * (H - 8);
            i ? c.lineTo(x, y) : c.moveTo(x, y);
        });
        const col = up ? '34,229,138' : '255,77,106';
        c.strokeStyle = `rgb(${col})`;
        c.lineWidth = 2;
        c.shadowColor = `rgb(${col})`;
        c.shadowBlur = 8;
        c.stroke();
        c.shadowBlur = 0;
        c.lineTo(W - 2, H);
        c.lineTo(2, H);
        c.closePath();
        const gr = c.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, `rgba(${col},.3)`);
        gr.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = gr;
        c.fill();
        const ly = H - 4 - ((data[data.length - 1] - lo) / span) * (H - 8);
        c.beginPath();
        c.arc(W - 2, ly, 3.2, 0, Math.PI * 2);
        c.fillStyle = '#fff';
        c.fill();
        c.beginPath();
        c.arc(W - 2, ly, 2, 0, Math.PI * 2);
        c.fillStyle = `rgb(${col})`;
        c.fill();
    }

    function newsFlash(it) {
        const el = $('p-flash');
        const label = { rumor: 'GERÜCHT', yes: 'BESTÄTIGT', no: 'DEMENTI', flash: 'EILMELDUNG', alert: 'ACHTUNG' }[it.kind];
        const text = `<b>${label}</b> ${it.icon} ${esc(it.text.replace(/^[A-ZÄÖÜ ]+(\([^)]*\))?: /, ''))}`;
        Sound.play(it.kind === 'alert' ? 'alarm' : 'news');
        buzz(it.kind === 'yes' || it.kind === 'no' ? [60, 60, 120] : 60);
        clearTimeout(newsFlash.t);
        if (termMode() || deskMode()) {
            // Grosse Ansichten: Meldung erscheint in der Info-Zeile oben – nichts schwebt über dem Bildschirm
            el.classList.add('hidden');
            nowFlash = { k: { yes: 'ok', no: 'paused', rumor: 'rumor' }[it.kind] || 'bad', t: text, until: Date.now() + 5000 };
            renderAny();
            newsFlash.t = setTimeout(() => { nowFlash = null; if (me && pub) renderAny(); }, 5000);
            return;
        }
        // «pk-»-Präfix: Die Klasse «flash» gehört dem Beamer-Banner
        el.className = `p-flash pk-${it.kind}`;
        el.innerHTML = text;
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
        // Das Tutorial ersetzt die kurzen Start-Hinweise
        coachSeen.add('start');
        coachSeen.add('term');
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
        renderAny();
        if (st.sel && tutSel(st.sel)) {
            const t = document.querySelector(tutSel(st.sel));
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
    function renderAny() {
        if (termMode()) renderTerm();
        else if (deskMode()) renderDesk();
        else render();
    }
    // Im Leitstand heissen die Bereiche anders als auf dem Handy
    const DESK_SEL = { '#p-goal': '#d-goal', '.p-dock': '#d-ticket', '.p-price': '#d-chartp', '#p-now': '#d-now', '#p-rolepanel': '#d-deals', '#p-help': null };
    const tutSel = sel => (deskMode() && sel in DESK_SEL ? DESK_SEL[sel] : sel);

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
        renderAny();
    }

    // Übungs-Trade (nur auf dem Gerät)
    function tutTrade(dir) {
        if (!tutActive() || !tut.wait || !['buy', 'sell', 'close'].includes(tut.wait)) return false;
        const st = tut.steps[tut.i];
        const q = termMode() ? tQty : deskMode() ? dQty : qty;
        const t = q * CFG.size;
        const price = dir > 0 ? Math.round(pub.price * (1 + CFG.spread)) : Math.round(pub.price * (1 - CFG.spread));
        const want = tut.wait === 'buy' ? 1 : tut.wait === 'sell' ? -1 : -Math.sign(tut.practicePos || 1);
        if (dir !== want) {
            bubble(tutLabel(), `${st.wrong}<div class="tut-do">${st.hint}</div>`, [{ label: 'Überspringen', fn: () => tutFinish(true) }]);
            Sound.play('error');
            return true;
        }
        Sound.play(dir > 0 ? 'buy' : 'sell');
        buzz(30);
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
        const later = Object.entries(FEATURE_TEXT).filter(([k]) => featFor(k, me.role) && CFG.featureYear[k] > 1 && CFG.featureYear[k] < 99 && (pub.years > 1 || CFG.singleYearFeatures.includes(k))).map(([k, F]) => `${F.icon} <b>${F.name}</b> (${pub.years === 1 ? 'kann in diesem Spiel vorkommen' : `ab Jahr ${CFG.featureYear[k]}`}): ${F.text}`);
        const crisis = pub.years > 1 ? '<br>🚨 <b>Einmal in der Karriere kommt ein Krisenjahr:</b> Der Preis explodiert und die Börse verdoppelt den Einschuss – wer zu wenig Bargeld hat, muss seine Absicherung im schlechtesten Moment auflösen.' : '';
        const laterHTML = `🗓️ <b>${pub.years > 1 ? 'Später in der Karriere' : 'Im Lauf des Spiels'}</b> kommt dazu:<br>${later.length ? later.join('<br>') : '–'}${crisis}${pub.years > 1 ? '<br>Zwischen den Jahren investierst du deinen Gewinn (Ausbau) und steigst im Rang auf.' : ''}`;
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
                    sel: '#p-rolepanel', html: `📜 <b>Lieferverträge:</b> Hier machst du den ${prod ? 'Fabriken' : 'Kooperativen'} ein Angebot – oder nimmst eines an. Ein Vertrag fixiert Menge und Preis für Dezember, direkt mit einem Menschen im Raum.<br>💔 Brechen geht – kostet aber <b>${CFG.breachFee} CHF pro Tonne</b> Strafe, und der Beamer zeigt es allen. Wem traust du?`,
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

    // ===== Leitstand für Kooperative und Fabrik (Laptop, Vollbild) =====
    const deskMode = () => me && (me.role === 'producer' || me.role === 'processor') && window.innerWidth >= 1000;
    let dQty = 2;
    let dDecKey = '';

    // Wie viele Tonnen sind wie gesichert? (Grundlage für Dörfer bzw. Silos)
    function holdings() {
        const prod = me.role === 'producer';
        const contract = me.dealsT || 0;
        const remaining = Math.max(0, prod ? me.physical : -me.physical);
        const fut = Math.max(0, prod ? -me.pos * CFG.size : me.pos * CFG.size);
        const futIn = Math.min(fut, remaining);
        return { prod, contract, fut, futIn, over: Math.max(0, fut - remaining), open: Math.max(0, remaining - futIn), lost: prod ? me.lostSmuggle || 0 : 0, cut: prod ? 0 : me.needCut || 0 };
    }

    // Kooperative: Region mit den Dörfern der Mitglieder (1 Dorf = 10 t) – detaillierte Landkarte
    const VILLAGES = [[150, 120], [260, 90], [380, 130], [500, 95], [610, 140], [200, 210], [320, 235], [450, 205], [570, 240], [680, 215], [130, 300], [250, 320], [390, 315], [520, 330], [640, 310], [730, 120]];
    // Feste Pseudo-Zufallszahlen, damit die Karte bei jedem Neuzeichnen gleich aussieht
    const rnd = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    function cocoaTree(x, y, s, k) {
        return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(2)})"><ellipse cx="3" cy="2" rx="9" ry="3.5" fill="rgba(0,0,0,.28)"/>
            <rect x="-1.2" y="-8" width="2.4" height="9" fill="#5b3a1f"/><circle cx="0" cy="-11" r="7.5" fill="url(#dTreeG)"/>
            <circle cx="-2.5" cy="-13.5" r="2.6" fill="rgba(255,255,255,.14)"/>${k % 3 === 0 ? '<ellipse cx="1.6" cy="-4" rx="1.2" ry="2" fill="#f0a63a"/>' : ''}</g>`;
    }
    function hut(x, y, s, i) {
        const wall = ['#e9d3a6', '#dcc191', '#f1dfb8'][i % 3];
        return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="2" cy="9.5" rx="11" ry="3" fill="rgba(0,0,0,.3)"/>
            <rect x="-8" y="-1" width="16" height="10" fill="${wall}"/><rect x="-8" y="-1" width="5" height="10" fill="rgba(0,0,0,.12)"/>
            <rect x="-1.6" y="3" width="3.6" height="6" fill="#4a2c16"/><rect x="3.5" y="1.5" width="3" height="2.6" fill="#3b2a1a"/>
            <path d="M-11 0 L0 -10 L11 0 Z" fill="#9a6538"/><path d="M0 -10 L11 0 L0 0 Z" fill="#6f4423"/>
            <path d="M-11 0 L0 -10 L11 0" fill="none" stroke="rgba(255,230,180,.35)" stroke-width=".8"/></g>`;
    }
    function farmSVG() {
        const H = holdings();
        const tiles = [];
        const push = (n, k) => { for (let i = 0; i < n; i++) tiles.push(k); };
        push(Math.round(H.contract / 10), 'deal');
        push(Math.round(H.futIn / 10), 'fut');
        push(Math.round(H.open / 10), 'open');
        push(Math.round(H.lost / 10), 'lost');
        const smuggle = me.decision && me.decision.kind === 'smuggle';
        const partners = [];
        ((me.deals && me.deals.signed) || []).forEach(d => { for (let t = 0; t < d.t; t += 10) partners.push(`Vertrag mit ${d.with} zu ${fmt(d.price)} CHF/t`); });
        const tip = (k, i) => (k === 'deal' ? partners[i] || 'Per Vertrag verkauft' : k === 'fut' ? 'Mit Futures abgesichert – der Preis ist fix' : k === 'lost' ? 'An Schmuggler verloren' : 'Offen – hängt am Preis im Dezember');
        const badge = { deal: ['📜', 'Vertrag'], fut: ['🔒', 'Future'], lost: ['🚚', 'weg'], open: ['○', 'offen'] };
        const villages = tiles.slice(0, VILLAGES.length).map((k, i) => {
            const [x, y] = VILLAGES[i];
            const trees = Array.from({ length: 7 }, (_, j) => {
                const a = rnd(i * 13 + j) * Math.PI * 2;
                const r = 34 + rnd(i * 7 + j * 3) * 14;
                return cocoaTree(Math.cos(a) * r, Math.sin(a) * r * 0.55 + 8, 0.75 + rnd(i + j * 5) * 0.4, i + j);
            }).join('');
            const [ico, lbl] = badge[k];
            return `<g class="vil ${k}" transform="translate(${x} ${y})" style="animation-delay:${i * 0.04}s"><title>10 t · ${tip(k, i)}</title>
                <ellipse class="vil-ground" rx="40" ry="17" cy="10"/><ellipse class="vil-ring" rx="40" ry="17" cy="10"/>
                <ellipse rx="27" ry="10" cy="9" fill="#a8865a" opacity=".55"/>
                <g class="dry-mat"><rect x="-26" y="10" width="14" height="6" rx="1" fill="#6b3d1e"/><rect x="-25" y="11" width="12" height="4" fill="url(#dBeans)"/></g>
                ${trees}
                ${hut(-12, 4, 1, i)}${hut(6, -2, 1.15, i + 1)}${hut(18, 8, 0.85, i + 2)}
                ${k !== 'lost' ? `<g class="hut-smoke"><circle cx="8" cy="-16" r="3"/><circle cx="11" cy="-25" r="4"/></g>` : ''}
                ${k === 'lost' ? '<path class="vil-x" d="M-18 -12 L18 18 M18 -12 L-18 18"/>' : ''}
                <g class="vil-tag" transform="translate(0 40)"><rect x="-34" y="-10" width="68" height="19" rx="9.5"/><text y="4" text-anchor="middle">${ico} ${lbl}</text></g></g>`;
        }).join('');
        // Felder (Kakao-Reihen) und Waldstücke als Hintergrund
        const fields = [[90, 40, 150, 70, -12], [330, 30, 170, 60, 8], [560, 50, 160, 70, -6], [60, 170, 120, 90, 15], [420, 150, 140, 70, -18], [690, 160, 100, 90, 10], [160, 360, 200, 40, 4], [470, 270, 130, 50, -10]]
            .map(([x, y, w, h, r], i) => `<g transform="rotate(${r} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="url(#${i % 2 ? 'dRows' : 'dRows2'})" stroke="rgba(20,40,15,.5)" stroke-width="1.5"/></g>`).join('');
        const forest = Array.from({ length: 60 }, (_, i) => {
            const x = rnd(i * 3.1) * 800;
            const y = rnd(i * 5.7 + 2) * 400;
            if (VILLAGES.some(([vx, vy]) => Math.hypot(vx - x, (vy - y) * 1.6) < 70)) return '';
            return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(6 + rnd(i) * 9).toFixed(1)}" fill="url(#dForest)"/>`;
        }).join('');
        const contours = [0, 1, 2, 3].map(i => `<path d="M${-20} ${60 + i * 18} C 180 ${20 + i * 22}, 380 ${110 + i * 12}, 560 ${50 + i * 20} S 760 ${10 + i * 24}, 820 ${40 + i * 18}" class="contour"/>`).join('');
        const ticks = Array.from({ length: 17 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="${i % 2 ? 4 : 8}"/><line x1="${i * 50}" y1="400" x2="${i * 50}" y2="${i % 2 ? 396 : 392}"/>`).join('')
            + Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${i * 50}" x2="${i % 2 ? 4 : 8}" y2="${i * 50}"/><line x1="800" y1="${i * 50}" x2="${i % 2 ? 796 : 792}" y2="${i * 50}"/>`).join('');
        return `<svg viewBox="0 0 800 400" class="d-svg farm-map">
            <defs><radialGradient id="dfl" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#3a7a32"/><stop offset=".6" stop-color="#25562a"/><stop offset="1" stop-color="#132c16"/></radialGradient>
            <pattern id="dft" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="5" cy="6" r="2.2" fill="rgba(110,190,90,.22)"/><circle cx="16" cy="15" r="3" fill="rgba(40,100,40,.3)"/><circle cx="17" cy="4" r="1" fill="rgba(200,230,150,.18)"/></pattern>
            <pattern id="dRows" width="12" height="10" patternUnits="userSpaceOnUse"><rect width="12" height="10" fill="#2f6a2a"/><circle cx="6" cy="5" r="3.6" fill="#3f8a36"/><circle cx="5" cy="4" r="1.3" fill="rgba(255,255,255,.12)"/></pattern>
            <pattern id="dRows2" width="10" height="9" patternUnits="userSpaceOnUse"><rect width="10" height="9" fill="#386b26"/><circle cx="5" cy="4.5" r="3.2" fill="#4c8d33"/><circle cx="4" cy="3.6" r="1.1" fill="rgba(255,255,255,.12)"/></pattern>
            <radialGradient id="dForest" cx="40%" cy="35%"><stop offset="0" stop-color="#3f8f3a"/><stop offset="1" stop-color="#173d18"/></radialGradient>
            <radialGradient id="dTreeG" cx="35%" cy="30%"><stop offset="0" stop-color="#5cc04d"/><stop offset="1" stop-color="#1f5a20"/></radialGradient>
            <pattern id="dBeans" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#8a4b22"/><circle cx="1.5" cy="1.5" r="1" fill="#b46a32"/></pattern>
            <linearGradient id="dRiver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4ff"/><stop offset="1" stop-color="#2f6fb8"/></linearGradient>
            <radialGradient id="dVig" cx="50%" cy="50%" r="70%"><stop offset=".6" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(0,0,0,.45)"/></radialGradient></defs>
            <rect width="800" height="400" fill="url(#dfl)"/><rect width="800" height="400" fill="url(#dft)"/>
            ${contours}${fields}${forest}
            <path d="M0 260 C 120 230, 200 300, 320 270 S 520 200, 640 260 S 760 330, 800 300" class="river-bank"/>
            <path d="M0 260 C 120 230, 200 300, 320 270 S 520 200, 640 260 S 760 330, 800 300" class="river"/>
            <path d="M0 260 C 120 230, 200 300, 320 270 S 520 200, 640 260 S 760 330, 800 300" class="river-flow"/>
            <path d="M40 380 C 200 350, 420 360, 560 370 S 740 390, 790 360" class="road"/>
            <path d="M40 380 C 200 350, 420 360, 560 370 S 740 390, 790 360" class="road-mid"/>
            <g class="bridge" transform="translate(560 368) rotate(-8)"><rect x="-12" y="-10" width="24" height="20" rx="2"/></g>
            <line x1="12" y1="0" x2="12" y2="400" class="border"/><text x="22" y="22" class="border-t">GRENZE ←</text>
            <g class="port" transform="translate(735 360)"><rect x="-30" y="-15" width="60" height="26" rx="5"/><text y="4" text-anchor="middle">⚓ Hafen</text></g>
            ${smuggle ? `<g class="trucks"><text class="truck t1" x="560" y="368">🚚</text><text class="truck t2" x="420" y="362">🚚</text><path d="M560 360 C 400 300, 200 330, 14 300" class="smug-path"/></g>` : ''}
            <g class="cloud-shadows"><ellipse cx="0" cy="120" rx="140" ry="40"/><ellipse cx="-300" cy="290" rx="180" ry="50"/></g>
            ${villages}
            <g class="d-bird"><path d="M0 0 q6 -6 12 0 q6 -6 12 0"/></g><g class="d-bird b2"><path d="M0 0 q5 -5 10 0 q5 -5 10 0"/></g>
            <rect width="800" height="400" fill="url(#dVig)" pointer-events="none"/>
            <g class="map-ticks">${ticks}</g>
            <g class="compass" transform="translate(760 70)"><circle r="20"/><path d="M0 -17 L5 0 L0 17 L-5 0Z" class="cn"/><path d="M0 -17 L5 0 L-5 0Z" class="cn-n"/><text y="-23" text-anchor="middle">N</text></g>
            <g class="scalebar" transform="translate(30 336)"><rect width="100" height="5" fill="#e7f5df"/><rect width="50" height="5" fill="#25562a"/><rect width="100" height="5" fill="none" stroke="#e7f5df"/><text x="0" y="18">0</text><text x="100" y="18" text-anchor="end">10 km</text></g>
            <text x="740" y="26" text-anchor="end" class="reg-t">📍 ${me.region ? esc(REGIONS[me.region].name) : ''}</text>
        </svg>`;
    }

    // Fabrik: Silo-Halle (1 Silo = 10 t Bedarf), Rohrleitungen und Produktionslinie
    function plantSVG() {
        const H = holdings();
        const tiles = [];
        const push = (n, k) => { for (let i = 0; i < n; i++) tiles.push(k); };
        push(Math.round(H.contract / 10), 'deal');
        push(Math.round(H.futIn / 10), 'fut');
        push(Math.round(H.open / 10), 'open');
        push(Math.round(H.cut / 10), 'cut');
        const sPartners = [];
        ((me.deals && me.deals.signed) || []).forEach(d => { for (let t = 0; t < d.t; t += 10) sPartners.push(`Vertrag mit ${d.with} zu ${fmt(d.price)} CHF/t`); });
        const n = Math.max(1, Math.min(20, tiles.length));
        const per = Math.min(10, n);
        const rows = Math.ceil(n / per);
        const w = 64;
        const gap = 10;
        const x0 = 400 - (per * (w + gap) - gap) / 2;
        const rowH = 150;
        const silos = tiles.slice(0, n).map((k, i) => {
            const x = x0 + (i % per) * (w + gap);
            const y = 40 + Math.floor(i / per) * rowH;
            const fill = k === 'deal' || k === 'fut' ? 86 : 0;
            const fillId = k === 'deal' ? 'pFillD' : 'pFillF';
            const gauge = Array.from({ length: 9 }, (_, j) => `<line x1="-5" x2="${j % 2 ? -2 : -7}" y1="${12 + j * 10}" y2="${12 + j * 10}"/>`).join('');
            const ladder = Array.from({ length: 9 }, (_, j) => `<line x1="${w + 2}" x2="${w + 8}" y1="${10 + j * 10}" y2="${10 + j * 10}"/>`).join('');
            return `<g class="silo ${k}" transform="translate(${x} ${y})"><title>10 t · ${k === 'deal' ? (sPartners[i] || 'Per Vertrag gekauft') : k === 'fut' ? 'Mit Futures abgesichert – Einkaufspreis fix' : k === 'cut' ? 'Gestrichen – durch deinen Krisen-Entscheid' : 'Offen – Preis im Dezember unbekannt'}</title>
                <ellipse cx="${w / 2 + 4}" cy="124" rx="${w / 2 + 6}" ry="6" fill="rgba(0,0,0,.4)"/>
                <path d="M8 100 L4 122 M${w - 8} 100 L${w - 4} 122 M${w / 2} 104 L${w / 2} 122" class="s-legs"/>
                <path d="M0 96 L${w / 2 - 8} 112 L${w / 2 + 8} 112 L${w} 96 Z" fill="url(#pMetal)" stroke="#5b6576"/>
                <rect class="s-body" width="${w}" height="100" rx="10" fill="url(#pMetal)"/>
                ${fill ? `<rect class="s-fill" x="4" y="${96 - fill}" width="${w - 8}" height="${fill}" rx="6" fill="url(#${fillId})"/><path class="s-wave" d="M4 ${96 - fill + 3} q${(w - 8) / 4} -6 ${(w - 8) / 2} 0 t${(w - 8) / 2} 0 v6 h-${w - 8}z"/>` : ''}
                <rect x="4" y="8" width="${w - 8}" height="88" rx="6" fill="url(#pGlass)" pointer-events="none"/>
                <line x1="0" x2="${w}" y1="34" y2="34" class="s-band"/><line x1="0" x2="${w}" y1="68" y2="68" class="s-band"/>
                ${[8, 20, 32, 44, 56].map(rx => `<circle cx="${rx}" cy="34" r="1.2" class="s-rivet"/><circle cx="${rx}" cy="68" r="1.2" class="s-rivet"/>`).join('')}
                <g class="s-gauge">${gauge}</g><g class="s-ladder"><line x1="${w + 2}" x2="${w + 2}" y1="4" y2="98"/><line x1="${w + 8}" x2="${w + 8}" y1="4" y2="98"/>${ladder}</g>
                <ellipse class="s-top" cx="${w / 2}" cy="2" rx="${w / 2}" ry="8"/><ellipse cx="${w / 2}" cy="0" rx="10" ry="3" fill="#56627a"/>
                <rect x="${w / 2 - 15}" y="80" width="30" height="11" rx="2" class="s-plate"/><text x="${w / 2}" y="88.5" text-anchor="middle" class="s-id">S-${String(i + 1).padStart(2, '0')}</text>
                <circle cx="${w - 9}" cy="12" r="3" class="s-led ${k}"/>
                ${k === 'cut' ? `<path class="vil-x" d="M8 10 L${w - 8} 92 M${w - 8} 10 L8 92"/>` : ''}
                <text x="${w / 2}" y="${140}" text-anchor="middle" class="s-t">${k === 'deal' ? '📜 Vertrag' : k === 'fut' ? '🔒 Future' : k === 'cut' ? 'gestrichen' : 'offen'}</text></g>`;
        }).join('');
        const ly = 40 + rows * rowH;
        const mm = Math.round((me.marginMult || 1) * 100);
        const HH = ly + 130;
        // Sammelleitung unter den Silos zur Maschine
        const pipeY = ly - 8;
        const drops = tiles.slice(0, n).map((k, i) => {
            if (Math.floor(i / per) !== rows - 1) return '';
            const x = x0 + (i % per) * (w + gap) + w / 2;
            return `<path d="M${x} ${pipeY - 26} V${pipeY}" class="pipe-v"/>`;
        }).join('');
        const lights = [120, 300, 500, 680].map(x => `<g><rect x="${x - 30}" y="0" width="60" height="5" fill="#2a3240"/><ellipse cx="${x}" cy="6" rx="36" ry="4" fill="rgba(255,230,170,.75)"/><path d="M${x - 36} 6 L${x - 110} ${HH} L${x + 110} ${HH} L${x + 36} 6Z" fill="url(#pBeam)"/></g>`).join('');
        return `<svg viewBox="0 0 800 ${HH}" class="d-svg plant-map">
            <defs><linearGradient id="pMetal" x1="0" x2="1"><stop offset="0" stop-color="#2a313c"/><stop offset=".25" stop-color="#4b5566"/><stop offset=".45" stop-color="#6b778a"/><stop offset=".7" stop-color="#3a4250"/><stop offset="1" stop-color="#232933"/></linearGradient>
            <linearGradient id="pGlass" x1="0" x2="1"><stop offset="0" stop-color="rgba(255,255,255,0)"/><stop offset=".2" stop-color="rgba(255,255,255,.16)"/><stop offset=".3" stop-color="rgba(255,255,255,0)"/></linearGradient>
            <linearGradient id="pFillF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf6b"/><stop offset=".15" stop-color="#d98a2b"/><stop offset="1" stop-color="#6b3a12"/></linearGradient>
            <linearGradient id="pFillD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc8ff"/><stop offset=".15" stop-color="#3b82f6"/><stop offset="1" stop-color="#1b3f86"/></linearGradient>
            <linearGradient id="pWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10151d"/><stop offset=".7" stop-color="#1a212c"/><stop offset="1" stop-color="#0c1016"/></linearGradient>
            <linearGradient id="pBeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,230,170,.10)"/><stop offset="1" stop-color="rgba(255,230,170,0)"/></linearGradient>
            <pattern id="pPanel" width="80" height="40" patternUnits="userSpaceOnUse"><rect width="80" height="40" fill="none" stroke="rgba(255,255,255,.035)"/><circle cx="4" cy="4" r="1" fill="rgba(255,255,255,.08)"/><circle cx="76" cy="4" r="1" fill="rgba(255,255,255,.08)"/></pattern>
            <pattern id="pFloor" width="40" height="14" patternUnits="userSpaceOnUse"><rect width="40" height="14" fill="#151a22"/><path d="M0 0 H40 M0 0 V14" stroke="rgba(255,255,255,.05)"/></pattern>
            <pattern id="pHaz" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="16" height="8" fill="#ff9f1c"/><path d="M0 8 L8 0 L12 0 L4 8Z M8 8 L16 0 L16 4 L12 8Z" fill="#111"/></pattern>
            <pattern id="pFoil" width="8" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="16" fill="#d4a017"/><rect width="4" height="16" fill="#f5d36b"/></pattern></defs>
            <rect width="800" height="${HH}" fill="url(#pWall)"/><rect width="800" height="${HH}" fill="url(#pPanel)"/>
            ${lights}
            <rect x="0" y="${ly + 50}" width="800" height="${HH - ly - 50}" fill="url(#pFloor)"/>
            <rect x="0" y="${ly + 48}" width="800" height="4" fill="url(#pHaz)" opacity=".8"/>
            ${silos}
            ${drops}<path d="M${x0 + w / 2} ${pipeY} H${x0 + (Math.min(per, n) - 1) * (w + gap) + w / 2}" class="pipe-h"/>
            <path d="M400 ${pipeY} V${ly + 4}" class="pipe-h"/><path d="M${x0 + w / 2} ${pipeY} H400 V${ly + 4}" class="pipe-flow"/>
            <g transform="translate(0 ${ly})">
                <rect x="40" y="66" width="720" height="14" rx="7" class="belt-r"/>
                ${Array.from({ length: 19 }, (_, i) => `<circle cx="${48 + i * 39.5}" cy="73" r="4.5" class="roller"/>`).join('')}
                <g class="d-belt">${Array.from({ length: 16 }, (_, i) => `<g transform="translate(${40 + i * 48} 48)"><rect width="34" height="18" rx="3" class="bar"/><rect x="11" width="12" height="18" fill="url(#pFoil)"/><path d="M5 2 V16 M29 2 V16" stroke="#5a2f15" stroke-width="1.2"/></g>`).join('')}</g>
                <g class="machine-g"><rect x="320" y="4" width="160" height="58" rx="8" class="machine"/>
                    <rect x="334" y="14" width="44" height="22" rx="3" class="m-screen"/><path d="M337 30 l6 -6 l6 3 l6 -9 l6 5 l8 -6" class="m-trace"/>
                    <circle cx="450" cy="24" r="10" class="m-gauge"/><path d="M450 24 L456 17" class="m-needle"/>
                    <circle cx="392" cy="20" r="3" class="m-led a"/><circle cx="402" cy="20" r="3" class="m-led b"/><circle cx="412" cy="20" r="3" class="m-led c"/>
                    <text x="400" y="54" text-anchor="middle" class="m-t">🍫 PRODUKTION</text></g>
                <g class="d-smoke"><circle cx="470" cy="-6" r="6"/><circle cx="476" cy="-16" r="8"/></g>
                <text x="40" y="108" class="m-k">Verarbeitungsmarge: ${fmt(CFG.chocMargin * (me.marginMult || 1))} CHF/t · Ruf & Preise ${mm} %</text>
            </g></svg>`;
    }

    function deskTicket() {
        const prod = me.role === 'producer';
        const practice = tutActive() && ['buy', 'sell', 'close'].includes(tut.wait);
        const closed = (pub.phase !== 'trading' || pub.paused || me.bankrupt) && !practice;
        const can = dir => practice || (!closed && room(dir) > 0);
        const ask = Math.round(pub.price * (1 + CFG.spread));
        const bid = Math.round(pub.price * (1 - CFG.spread));
        const hedgeBtn = `<button class="${prod ? 'tk-sell' : 'tk-buy'} main" data-dt="${prod ? -1 : 1}" ${can(prod ? -1 : 1) ? '' : 'disabled'}><b>ABSICHERN</b><span>${fmt(prod ? bid : ask)}</span><small>${prod ? 'Ernte heute verkaufen' : 'Kakao heute kaufen'}</small></button>`;
        const undoBtn = `<button class="tk-undo" data-dt="${prod ? 1 : -1}" ${can(prod ? 1 : -1) ? '' : 'disabled'}><b>AUFLÖSEN</b><span>${fmt(prod ? ask : bid)}</span><small>zurücknehmen</small></button>`;
        return `<h3>Order-Ticket</h3><div class="tk-q"><small>MENGE</small>${[1, 2, 5, 10].map(q => `<button class="${q === dQty ? 'on' : ''}" data-dq="${q}">${q * CFG.size} t</button>`).join('')}</div>
            <div class="tk-btns">${hedgeBtn}${undoBtn}</div>
            <div class="tk-lim">Pfand ${Math.round(CFG.marginRate * 100)} % · Gebühr ${CFG.fee} CHF pro 10 t · Was im Dezember offen ist: −${Math.round(CFG.spotPenalty * 100)} %</div>`;
    }

    function renderDesk() {
        if (!me || !pub) return;
        if (pub.phase !== 'pre' && tut.i >= 0 && !tut.done) tutAbort();
        const R = ROLES[me.role];
        const prod = me.role === 'producer';
        document.body.dataset.role = me.role;
        $('v-desk').classList.toggle('farm', prod);
        $('v-desk').classList.toggle('plant', !prod);
        $('d-brand').innerHTML = prod ? '🌱 KOOPERATIVEN-<span>ZENTRALE</span>' : '🏭 FABRIK-<span>LEITSTAND</span>';
        $('d-fund').innerHTML = `${roleIcon(me.role, 22)} <b>${esc(me.name)}</b><small>${RANKS[me.level].icon} ${RANKS[me.level].name}${me.rep ? ` · <span class="bad">⚠️ ${me.rep}× gebrochen</span>` : ''}</small>`;
        const ch = pub.price / pub.p0 - 1;
        $('d-price').textContent = fmt(pub.price);
        $('d-chg').innerHTML = `<span class="${ch >= 0 ? 'up' : 'down'}">${arrow(ch)}${pct(ch)}</span>`;
        $('d-metric-l').textContent = prod ? 'DEIN PREIS JETZT' : 'DEIN EINKAUF JETZT';
        const good = prod ? me.metric >= pub.p0 : me.metric <= pub.p0;
        $('d-metric').innerHTML = `<span class="${good ? 'up' : 'down'}">${fmt(me.metric)}</span>`;
        $('d-rank').innerHTML = `${me.rank}<small>/${me.roleCount}</small>`;
        $('d-month').textContent = pub.phase === 'pre' ? 'PRE-MARKET' : pub.phase === 'settle' ? 'ABRECHNUNG' : `MONAT ${pub.month}/${pub.months}${pub.years > 1 ? ` · JAHR ${pub.year}` : ''}`;
        $('d-timer').textContent = pub.phase === 'settle' ? '⏸' : mmss(pub.secLeft);
        $('d-timer').classList.toggle('urgent', pub.phase === 'trading' && pub.secLeft <= 10);
        if (pub.phase === 'trading' && pub.secLeft <= 10 && pub.secLeft !== lastTick) { lastTick = pub.secLeft; Sound.play('tick'); }
        const n = nowText();
        $('d-now').className = `t-now ${n.k}`;
        setHTML($('d-now'), n.t + (n.left !== undefined ? ` <b class="rumor-left2">${n.left}s</b>` : ''));

        setHTML($('d-goal'), `<h3>Ziel & Absicherung</h3>${goalHTML()}`);
        setHTML($('d-side'), `<h3>${prod ? 'Plantage' : 'Aufträge & Produktion'}</h3>${rolePanelHTML(false) || `<div class="t-empty">${prod ? 'Ab Jahr 2 kommen Wetter und Schmuggler dazu.' : 'Ab Jahr 2 kommen Kundenaufträge und die Schokoladen-Krise dazu.'}</div>`}`);
        $('d-side').querySelectorAll('[data-left]').forEach(x => { x.textContent = `${x.dataset.left}s`; });

        // Mitte: Dörfer bzw. Silos
        const H = holdings();
        $('d-world-h').innerHTML = prod ? `Deine Mitglieder <span>1 Dorf = 10 t Ernte</span>` : `Kakao-Bedarf <span>1 Silo = 10 t</span>`;
        setHTML($('d-world'), prod ? farmSVG() : plantSVG());
        setHTML($('d-legend'), `<span class="lg deal">📜 Vertrag ${H.contract} t</span><span class="lg fut">🔒 Futures ${H.futIn} t</span><span class="lg open">⚠️ offen ${H.open} t</span>${H.lost ? `<span class="lg lost">🚚 verloren ${H.lost} t</span>` : ''}${H.cut ? `<span class="lg cut">✂️ gestrichen ${H.cut} t</span>` : ''}${H.over ? `<span class="lg lost">🎲 ${H.over} t zu viel abgesichert!</span>` : ''}`);

        // Entscheidung als grosses Fenster in der Mitte
        const dec = $('d-decision');
        if (me.decision) {
            dec.classList.remove('hidden');
            if (dDecKey !== String(me.decision.id)) {
                dDecKey = String(me.decision.id);
                dec.innerHTML = decisionHTML();
                Sound.play('alarm');
            }
            const l = dec.querySelector('[data-left]');
            if (l) l.textContent = `${me.decision.left}s`;
        } else { dec.classList.add('hidden'); dDecKey = ''; }

        setHTML($('d-deals'), `<h3>Vertragsbörse <span>direkt mit den ${prod ? 'Fabriken' : 'Kooperativen'}</span></h3>${dealsHTML() || '<div class="t-empty">Lieferverträge kommen später.</div>'}`);
        $('d-deals').querySelectorAll('[data-left]').forEach(x => { x.textContent = `${x.dataset.left}s`; });
        setHTML($('d-ticket'), deskTicket());
        tChart('d-chart');
        renderCall();
        coachTriggers();
    }

    function bindDesk() {
        $('v-desk').addEventListener('click', ev => {
            const b = ev.target.closest('button');
            if (!b || b.disabled) return;
            if (b.dataset.rp) rpAction(b.dataset.rp);
            if (b.dataset.dq) { dQty = Number(b.dataset.dq); renderDesk(); }
            if (b.dataset.dt) {
                const dir = Number(b.dataset.dt);
                if (tutTrade(dir)) return;
                send({ t: 'trade', q: dir * Math.max(1, Math.min(dQty, room(dir))) });
            }
        });
    }

    // ===== Hedgefonds-Terminal (Laptop, Vollbild) =====
    // Hedgefonds auf einem breiten Bildschirm bekommen das Terminal statt des Handy-Cockpits.
    const termMode = () => me && me.role === 'spec' && window.innerWidth >= 1000;
    let tSel = null;          // gewählter Ort auf der Karte
    let tQty = 5;             // Kontrakte pro Order
    let tMapBuilt = false;

    // Weltkarte (zugeschnitten auf die relevanten Breiten) + vergrösserter Ausschnitt Westafrika
    const TW = 630;
    const TH = 232;
    const tx = lon => ((lon + 165) / 315) * TW;
    const ty = lat => 10 + ((72 - lat) / 104) * (TH - 20);
    const WEST = ['gh', 'ci', 'abj', 'acc'];
    const IW = 450;
    const IH = 150;
    const ix = lon => ((lon + 12) / 18) * IW;
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
        // Punkteraster 1° aus echten Natural-Earth-Daten, dazu die exakte Küstenlinie
        const rowOf = lat => LAND_HI[78 - lat];
        const isLand = (lon, lat) => { const r = rowOf(lat); return !!r && r[1].some(([a, b]) => lon >= a && lon <= b); };
        let dots = '';
        for (let lat = 72; lat >= -32; lat--) {
            for (let lon = -165; lon <= 150; lon++) {
                if (!isLand(lon, lat)) continue;
                const wa = lon >= -10 && lon <= 4 && lat >= 4 && lat <= 11;
                dots += `<circle cx="${tx(lon).toFixed(1)}" cy="${ty(lat).toFixed(1)}" r=".72"${wa ? ' class="wa"' : ''}/>`;
            }
        }
        const coastD = COAST_HI.map(c => {
            let d = '';
            for (let i = 0; i < c.length; i += 2) {
                const lo = c[i] / 2;
                const la = c[i + 1] / 2;
                if (lo < -165 || lo > 150 || la > 73 || la < -33) { d += ' '; continue; }
                d += `${d && !d.endsWith(' ') && Math.abs(c[i] - c[i - 2]) < 180 ? 'L' : 'M'}${tx(lo).toFixed(1)} ${ty(la).toFixed(1)}`;
            }
            return d.replace(/ +/g, '');
        }).join('');
        const world = Object.keys(INTEL_LOCS).filter(k => !WEST.includes(k))
            .map(k => pin(k, tx(INTEL_LOCS[k].lon), ty(INTEL_LOCS[k].lat), ['sha', 'id', 'lon'].includes(k) ? 'l' : 'r')).join('');
        // Rahmen um Westafrika auf der Weltkarte
        const bx = tx(-10);
        const by = ty(11);
        const box = `<g class="t-west"><rect x="${bx}" y="${by}" width="${tx(4) - bx}" height="${ty(3) - by}" rx="3"/><text x="${bx}" y="${by + (ty(3) - by) + 12}">Westafrika ↓</text></g>`;
        // Ausschnitt Westafrika: Küste am Golf von Guinea, Grenze Elfenbeinküste/Ghana
        const coast = [[-30, 13], [-16, 9.5], [-12.5, 7.4], [-11.4, 6.8], [-10.4, 6.1], [-9, 4.9], [-7.5, 4.3], [-6, 4.9], [-4.6, 5.2], [-3, 5.1], [-2, 4.8], [-1, 5.1], [0, 5.6], [1, 6.1], [2, 6.3], [3, 6.4], [4.4, 6.3], [5.2, 5.6], [5.8, 4.6], [6.5, 4.3], [9, 4.2], [24, 3.6]];
        const cpts = coast.map(([lo, la]) => `${ix(lo).toFixed(1)},${iy(la).toFixed(1)}`).join(' ');
        const inset = `<svg viewBox="0 0 ${IW} ${IH}" class="t-inset-svg">
            ${Object.entries(WA_HI).map(([k, rs]) => `<path class="t-cty ${k}" d="${rs.map(r => { let d = ''; for (let i = 0; i < r.length; i += 2) d += `${i ? 'L' : 'M'}${ix(r[i] / 100).toFixed(1)} ${iy(r[i + 1] / 100).toFixed(1)}`; return `${d}Z`; }).join('')}"/>`).join('')}
            <defs><pattern id="tCrop" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(34,229,138,.28)" stroke-width="1.5"/></pattern></defs>
            ${[1, 2, 3].map(k => `<polyline points="${coast.map(([lo, la]) => `${ix(lo).toFixed(1)},${(iy(la) + k * 9).toFixed(1)}`).join(' ')}" class="t-ins-depth"/>`).join('')}
            <path d="M${ix(-8.2)} ${iy(9.4)} C ${ix(-6.5)} ${iy(8)}, ${ix(-5.2)} ${iy(7.8)}, ${ix(-4.8)} ${iy(5.25)} C ${ix(-3.8)} ${iy(6.8)}, ${ix(-1.6)} ${iy(7.2)}, ${ix(-0.4)} ${iy(5.7)}" class="t-ins-crop"/>
            <path d="M${ix(-5.4)} ${iy(9.8)} C ${ix(-5.2)} ${iy(8.4)}, ${ix(-5.6)} ${iy(7)}, ${ix(-5.1)} ${iy(5.2)}" class="t-ins-river"/>
            <path d="M${ix(-0.4)} ${iy(9.6)} C ${ix(0.2)} ${iy(8.6)}, ${ix(-0.2)} ${iy(7.4)}, ${ix(0.4)} ${iy(6.6)} C ${ix(0.7)} ${iy(6.2)}, ${ix(0.6)} ${iy(6)}, ${ix(0.7)} ${iy(5.85)}" class="t-ins-river"/>
            <ellipse cx="${ix(-0.1)}" cy="${iy(7.9)}" rx="9" ry="18" transform="rotate(-15 ${ix(-0.1)} ${iy(7.9)})" class="t-ins-lake"/>
            <g class="t-ins-scale" transform="translate(${IW - 70} ${IH - 12})"><line x1="0" x2="45" y1="0" y2="0"/><line x1="0" x2="0" y1="-3" y2="3"/><line x1="45" x2="45" y1="-3" y2="3"/><text x="22" y="-4" text-anchor="middle">200 km</text></g>
            <text x="${ix(-7.4)}" y="${iy(6.6)}" class="t-ins-belt">KAKAO-GÜRTEL</text>
            
            <text x="${ix(-11.6)}" y="${iy(9.6)}" class="t-ins-c">LIBERIA</text><text x="${ix(1.35)}" y="${iy(9.6)}" class="t-ins-c">TOGO</text><text x="${ix(3.4)}" y="${iy(9.6)}" class="t-ins-c">NIGERIA</text>
            <text x="${ix(-8.6)}" y="${iy(9.6)}" class="t-ins-c">ELFENBEINKÜSTE</text><text x="${ix(-2.6)}" y="${iy(9.6)}" class="t-ins-c">GHANA</text>
            <text x="${ix(-6)}" y="${iy(3.5)}" class="t-ins-sea">Golf von Guinea</text>
            ${pin('ci', ix(INTEL_LOCS.ci.lon), iy(INTEL_LOCS.ci.lat), 'r', 'Plantagen')}${pin('gh', ix(INTEL_LOCS.gh.lon), iy(INTEL_LOCS.gh.lat), 'r', 'Plantagen')}
            ${pin('abj', ix(INTEL_LOCS.abj.lon), iy(INTEL_LOCS.abj.lat) + 4, 'l', 'Hafen Abidjan')}${pin('acc', ix(INTEL_LOCS.acc.lon), iy(INTEL_LOCS.acc.lat) + 4, 'l', 'Accra · Tema')}</svg>`;
        $('t-map').innerHTML = `<svg viewBox="0 0 ${TW} ${TH}" class="t-world" preserveAspectRatio="xMidYMid meet"><g class="t-land">${dots}</g><path d="${coastD}" class="t-coast"/>
            <g class="t-grid-l">${[-20, 0, 20, 40, 60].map(l => `<line x1="0" x2="${TW}" y1="${ty(l)}" y2="${ty(l)}"/><text x="3" y="${ty(l) - 2}">${Math.abs(l)}°${l > 0 ? 'N' : l < 0 ? 'S' : ''}</text>`).join('')}${[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120].map(l => `<line class="v" x1="${tx(l)}" x2="${tx(l)}" y1="0" y2="${TH}"/>`).join('')}</g>
            <g class="t-routes"><path d="${`M${tx(-4)} ${ty(5)} Q ${tx(-20)} ${ty(40)} ${tx(4)} ${ty(51)}`}"/><path d="${`M${tx(-4)} ${ty(5)} Q ${tx(-40)} ${ty(30)} ${tx(-74)} ${ty(40.7)}`}"/></g>${box}${world}</svg>
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
            const pinEl = $('t-map').querySelector(`.t-pin[data-loc="${tSel}"]`);
            if (pinEl) {
                const pr = pinEl.getBoundingClientRect();
                const mr = $('t-map').getBoundingClientRect();
                $('t-loc').classList.toggle('left', pr.left + pr.width / 2 > mr.left + mr.width / 2);
            }
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

    // Profi-Chart für Terminal und Leitstand: 5-Sekunden-Kerzen, glatte Linie, Raster, Preisschild
    function tChart(id = 't-chart') {
        const cv = $(id);
        const dpr = HQ();
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
        if (d.length < 2) {
            c.font = '12px "JetBrains Mono", monospace';
            c.fillStyle = 'rgba(140,160,200,.5)';
            c.fillText(pub.phase === 'pre' ? 'Börse geschlossen – der Chart startet mit der Eröffnung.' : 'Warte auf Kursdaten …', 16, H / 2);
            return;
        }
        const term = id === 't-chart';
        const acc = term ? '79,209,255' : getComputedStyle(cv).getPropertyValue('--tcr').trim() || '255,181,71';
        const L = 62;
        const R = 86;
        const T = 12;
        const B = 22;
        const span = Math.max(...d, pub.p0) - Math.min(...d, pub.p0);
        const pad = Math.max(8, span * 0.12);
        const lo = Math.min(...d, pub.p0) - pad;
        const hi = Math.max(...d, pub.p0) + pad;
        const n = d.length;
        const X = i => L + (i / (n - 1)) * (W - L - R);
        const Y = v => T + ((hi - v) / (hi - lo)) * (H - T - B);
        // Hintergrund: feines Raster (Haupt- und Nebenlinien)
        const steps = 8;
        for (let i = 0; i <= steps; i++) {
            const v = lo + ((hi - lo) * i) / steps;
            const major = i % 2 === 0;
            c.strokeStyle = major ? 'rgba(120,150,200,.13)' : 'rgba(120,150,200,.05)';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(L, Math.round(Y(v)) + 0.5);
            c.lineTo(W - R, Math.round(Y(v)) + 0.5);
            c.stroke();
            if (major) {
                c.font = '10.5px "JetBrains Mono", monospace';
                c.fillStyle = '#5b6b85';
                c.textAlign = 'right';
                c.fillText(fmt(v), L - 8, Y(v) + 4);
                c.textAlign = 'left';
                c.fillStyle = 'rgba(120,150,200,.35)';
                c.fillRect(L - 4, Math.round(Y(v)), 4, 1);
            }
        }
        // Zeitachse: alle 10 s eine Linie, beschriftet relativ zu jetzt
        c.font = '10px "JetBrains Mono", monospace';
        for (let s = 0; s < n; s += 5) {
            const i = n - 1 - s;
            const major = s % 10 === 0;
            c.strokeStyle = major ? 'rgba(120,150,200,.09)' : 'rgba(120,150,200,.04)';
            c.beginPath();
            c.moveTo(Math.round(X(i)) + 0.5, T);
            c.lineTo(Math.round(X(i)) + 0.5, H - B);
            c.stroke();
            if (major && s && X(i) > L + 20) {
                c.fillStyle = '#4d5d78';
                c.textAlign = 'center';
                c.fillText(`−${s}s`, X(i), H - 6);
                c.textAlign = 'left';
            }
        }
        c.fillStyle = 'rgba(255,255,255,.45)';
        c.textAlign = 'center';
        c.fillText('jetzt', X(n - 1), H - 6);
        c.textAlign = 'left';
        // Planpreis
        const yPlan = Y(pub.p0);
        c.setLineDash([3, 4]);
        c.strokeStyle = 'rgba(255,255,255,.32)';
        c.beginPath();
        c.moveTo(L, yPlan);
        c.lineTo(W - R, yPlan);
        c.stroke();
        c.setLineDash([]);
        c.font = 'bold 10px "JetBrains Mono", monospace';
        c.fillStyle = 'rgba(255,255,255,.5)';
        c.fillText(`PLAN ${fmt(pub.p0)}`, L + 6, yPlan - 5);
        // 5-Sekunden-Kerzen (Eröffnung, Hoch, Tief, Schluss)
        const cw = Math.max(3, ((W - L - R) / (n - 1)) * 5 * 0.62);
        for (let a = 0; a < n - 1; a += 5) {
            const seg = d.slice(a, Math.min(n, a + 6));
            if (seg.length < 2) continue;
            const o = seg[0];
            const cl = seg[seg.length - 1];
            const h1 = Math.max(...seg);
            const l1 = Math.min(...seg);
            const xm = X(a + (seg.length - 1) / 2);
            const upC = cl >= o;
            c.strokeStyle = upC ? 'rgba(34,229,138,.45)' : 'rgba(255,77,106,.45)';
            c.fillStyle = upC ? 'rgba(34,229,138,.16)' : 'rgba(255,77,106,.16)';
            c.beginPath();
            c.moveTo(Math.round(xm) + 0.5, Y(h1));
            c.lineTo(Math.round(xm) + 0.5, Y(l1));
            c.stroke();
            const y0 = Math.min(Y(o), Y(cl));
            const bh = Math.max(1.5, Math.abs(Y(o) - Y(cl)));
            c.fillRect(xm - cw / 2, y0, cw, bh);
            c.strokeRect(Math.round(xm - cw / 2) + 0.5, Math.round(y0) + 0.5, Math.round(cw), Math.round(bh));
        }
        // Glatte Kurslinie, über dem Plan grün, darunter rot
        const path = () => {
            c.beginPath();
            c.moveTo(X(0), Y(d[0]));
            for (let i = 1; i < n - 1; i++) c.quadraticCurveTo(X(i), Y(d[i]), (X(i) + X(i + 1)) / 2, (Y(d[i]) + Y(d[i + 1])) / 2);
            c.lineTo(X(n - 1), Y(d[n - 1]));
        };
        for (const [y0, y1, rgb, top] of [[0, yPlan, '34,229,138', true], [yPlan, H, '255,77,106', false]]) {
            c.save();
            c.beginPath();
            c.rect(0, y0, W, y1 - y0);
            c.clip();
            path();
            c.lineTo(X(n - 1), yPlan);
            c.lineTo(X(0), yPlan);
            c.closePath();
            const g = c.createLinearGradient(0, top ? T : H - B, 0, yPlan);
            g.addColorStop(0, `rgba(${rgb},.26)`);
            g.addColorStop(1, `rgba(${rgb},0)`);
            c.fillStyle = g;
            c.fill();
            path();
            c.strokeStyle = `rgba(${rgb},.2)`;
            c.lineWidth = 7;
            c.stroke();
            path();
            c.strokeStyle = `rgb(${rgb})`;
            c.lineWidth = 2;
            c.shadowColor = `rgb(${rgb})`;
            c.shadowBlur = 10;
            c.stroke();
            c.shadowBlur = 0;
            c.restore();
        }
        // Hoch und Tief im Fenster
        let hiI = 0;
        let loI = 0;
        d.forEach((v, i) => { if (v > d[hiI]) hiI = i; if (v < d[loI]) loI = i; });
        c.font = 'bold 10px "JetBrains Mono", monospace';
        for (const [i, isHi] of [[hiI, true], [loI, false]]) {
            if (i > n - 4 || d[hiI] === d[loI]) continue;
            const px = X(i);
            const py = Y(d[i]);
            const lab = `${isHi ? 'H' : 'T'} ${fmt(d[i])}`;
            const tw = c.measureText(lab).width + 8;
            c.fillStyle = 'rgba(5,8,15,.8)';
            c.fillRect(px - tw / 2, isHi ? py - 20 : py + 6, tw, 14);
            c.fillStyle = isHi ? '#7dffc0' : '#ff9aac';
            c.fillText(lab, px - tw / 2 + 4, isHi ? py - 9.5 : py + 16.5);
        }
        // Geld-/Briefkurs als Band und Preisschild am rechten Rand
        const last = d[n - 1];
        const col = last >= pub.p0 ? '#22e58a' : '#ff4d6a';
        const ly = Y(last);
        const ask = Math.round(last * (1 + CFG.spread));
        const bid = Math.round(last * (1 - CFG.spread));
        c.fillStyle = `rgba(${acc},.06)`;
        c.fillRect(L, Y(ask), W - R - L, Math.max(1, Y(bid) - Y(ask)));
        c.setLineDash([2, 4]);
        c.strokeStyle = col;
        c.globalAlpha = 0.6;
        c.beginPath();
        c.moveTo(X(n - 1), ly);
        c.lineTo(W - R + 4, ly);
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
        const tag = fmt(last);
        c.font = 'bold 12px "JetBrains Mono", monospace';
        const tw = c.measureText(tag).width + 16;
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(W - R + 4, ly);
        c.lineTo(W - R + 11, ly - 10);
        c.lineTo(W - R + 11 + tw, ly - 10);
        c.lineTo(W - R + 11 + tw, ly + 10);
        c.lineTo(W - R + 11, ly + 10);
        c.closePath();
        c.fill();
        c.fillStyle = '#05080f';
        c.fillText(tag, W - R + 18, ly + 4);
        c.font = '9.5px "JetBrains Mono", monospace';
        c.fillStyle = 'rgba(255,107,129,.8)';
        c.fillText(`B ${fmt(ask)}`, W - R + 14, Math.max(T + 8, ly - 16));
        c.fillStyle = 'rgba(34,229,138,.8)';
        c.fillText(`G ${fmt(bid)}`, W - R + 14, Math.min(H - B, ly + 23));
        c.beginPath();
        c.arc(X(n - 1), ly, 4.5, 0, Math.PI * 2);
        c.fillStyle = '#fff';
        c.fill();
        c.beginPath();
        c.arc(X(n - 1), ly, 2.8, 0, Math.PI * 2);
        c.fillStyle = col;
        c.fill();
        // Rahmen-Ecken
        c.strokeStyle = `rgba(${acc},.5)`;
        c.lineWidth = 1.5;
        for (const [x0, y0, sx, sy] of [[L, T, 1, 1], [W - R, T, -1, 1], [L, H - B, 1, -1], [W - R, H - B, -1, -1]]) {
            c.beginPath();
            c.moveTo(x0 + sx * 10, y0);
            c.lineTo(x0, y0);
            c.lineTo(x0, y0 + sy * 10);
            c.stroke();
        }
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
        // Echte Proportionen (keine verzerrten Kreise): fester Massstab, Breite passt sich an
        const W = 600;
        const H = 190;
        const L = 46;
        const R = 12;
        const T = 16;
        const B = 26;
        const ps = m.hist.map(h => h[1]);
        const all = [...ps, m.p0, ...m.moments.map(t => t.price)];
        const pad = (Math.max(...all) - Math.min(...all)) * 0.18 + 10;
        const lo = Math.min(...all) - pad;
        const hi = Math.max(...all) + pad;
        const X = sec => L + (sec / Math.max(1, m.total)) * (W - L - R);
        const Y = v => T + ((hi - v) / Math.max(1, hi - lo)) * (H - T - B);
        const pts = m.hist.map(([sec, v]) => `${X(sec).toFixed(1)},${Y(v).toFixed(1)}`);
        const last = m.hist[m.hist.length - 1];
        const up = m.final >= m.p0;
        const col = up ? '#22e58a' : '#ff4d6a';
        const gid = `mg${Math.random().toString(36).slice(2, 7)}`;
        // Monatsraster
        const months = 4;
        let grid = '';
        for (let i = 1; i < months; i++) grid += `<line x1="${X((m.total * i) / months)}" x2="${X((m.total * i) / months)}" y1="${T}" y2="${H - B}" class="mr-grid"/>`;
        for (let i = 0; i < months; i++) grid += `<text x="${X((m.total * (i + 0.5)) / months)}" y="${H - 8}" text-anchor="middle" class="mr-ax">M${i + 1}</text>`;
        // Trades: Kauf ▲ unter der Linie, Verkauf ▼ darüber, mit kleinem Preisschild
        // Schilder so stapeln, dass sie sich nie überdecken
        const placed = [];
        const hits = (a, b) => a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4 && a.y < b.y + 22 && b.y < a.y + 22;
        const marks = m.moments.map(t => {
            const x = X(t.s);
            const y = Y(t.price);
            const buy = t.q > 0;
            const c = buy ? '#22e58a' : '#ff4d6a';
            const label = `${buy ? 'Kauf' : 'Verkauf'} ${Math.abs(t.q * CFG.size)} t · ${fmt(t.price)}`;
            const tw = label.length * 6.2 + 14;
            const tx = clamp(x - tw / 2, L, W - R - tw);
            let ty = buy ? y + 24 : y - 24;
            for (let k = 0; k < 6 && placed.some(p => hits(p, { x: tx, y: ty, w: tw })); k++) ty += buy ? 22 : -22;
            ty = clamp(ty, T + 10, H - B - 10);
            placed.push({ x: tx, y: ty, w: tw });
            return `<g class="mr-mark">
                <line x1="${x}" x2="${x}" y1="${y}" y2="${buy ? ty - 9 : ty + 9}" stroke="${c}" stroke-width="1" stroke-dasharray="2 2" opacity=".7"/>
                <path d="${buy ? `M${x} ${y + 3} l-6 9 h12 z` : `M${x} ${y - 3} l-6 -9 h12 z`}" fill="${c}"/>
                <rect x="${tx}" y="${ty - 10}" width="${tw}" height="20" rx="10" fill="rgba(5,8,15,.92)" stroke="${c}" stroke-width="1"/>
                <text x="${tx + tw / 2}" y="${ty + 4}" text-anchor="middle" class="mr-tag" fill="${c}">${label}</text></g>`;
        }).join('');
        const hedger = m.role !== 'spec';
        const diffTxt = hedger
            ? (m.diff >= 0 ? `🛡️ Deine Absicherung hat dir <b class="up">▲ ${signed(m.diff)} CHF</b> gebracht.` : `🛡️ Ohne Absicherung hättest du <b class="down">${fmt(-m.diff)} CHF mehr</b> – dafür warst du geschützt.`)
            : `🦈 Deine Wetten: <b class="${m.diff >= 0 ? 'up' : 'down'}">${m.diff >= 0 ? '▲' : '▼'} ${signed(m.diff)} CHF</b>`;
        return `<div class="mirror"><h4>🪞 Dein Jahr im Rückblick</h4>
            <svg viewBox="0 0 ${W} ${H}" class="mr-svg">
                <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
                <text x="${L - 6}" y="${Y(hi - pad) + 4}" text-anchor="end" class="mr-ax">${fmt(hi - pad)}</text>
                <text x="${L - 6}" y="${Y(lo + pad) + 4}" text-anchor="end" class="mr-ax">${fmt(lo + pad)}</text>
                ${grid}
                <line x1="${L}" x2="${W - R}" y1="${Y(m.p0)}" y2="${Y(m.p0)}" class="mr-plan"/>
                <text x="${W - R}" y="${Y(m.p0) - 5}" text-anchor="end" class="mr-ax">Plan ${fmt(m.p0)}</text>
                <polygon points="${L},${H - B} ${pts.join(' ')} ${X(last[0]).toFixed(1)},${H - B}" fill="url(#${gid})"/>
                <polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
                <circle cx="${X(last[0])}" cy="${Y(last[1])}" r="4" fill="${col}" stroke="#fff" stroke-width="1.5"/>
                ${marks}
            </svg>
            ${m.moments.length ? '' : '<div class="m-legend">Kein Trade in diesem Jahr.</div>'}
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
        if (tut.i >= 0 && !tut.done) tutAbort();
        coachQueue.length = 0;
        $('p-coach').classList.add('hidden');
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
        bindDesk();
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
