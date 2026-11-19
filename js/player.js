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
            if (pub.phase === 'lobby') deskPrewarm();
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
        const col = up ? '86,199,150' : '226,104,120';
        c.strokeStyle = `rgb(${col})`;
        c.lineWidth = 2;
        c.shadowColor = `rgb(${col})`;
        c.shadowBlur = 0;
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
    const DESK_SEL = { '#p-goal': '#d-goal', '.p-dock': '#d-ticket', '.p-price': '.d-top .t-kv', '#p-now': '#d-now', '#p-rolepanel': '#d-deals', '#p-help': null };
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

    // Lebendige Ebene über dem gerechneten Luftbild – EINE Leinwand, eine Zeichen-Schleife.
    // Alles entsteht zufällig neu (Wolken, Autos, Rauch, Vögel), nichts wiederholt sich als Schleife.
    // Der Zustand bleibt erhalten, wenn der Leitstand jede Sekunde aktualisiert wird – nichts springt zurück.
    const LIFE = { on: false, raf: 0, last: 0, key: '', rect: '', clouds: [], smoke: [], glints: [], cars: [], birds: [], drops: [], wind: 0, windT: 0, nextCar: 0, nextBird: 8, emit: [] };
    let lifeSpr = null;
    function lifeSprites() {
        if (lifeSpr) return lifeSpr;
        const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return c; };
        const clouds = [11, 23, 37, 51].map(seed => mk(440, 220, x => {
            x.filter = 'blur(9px)';
            const r = RenderCore.rng(seed);
            const n = 9 + ((r() * 6) | 0);
            for (let i = 0; i < n; i++) {
                const px = 90 + r() * 260;
                const py = 85 + r() * 60 - (i % 3) * 8;
                const pr = 34 + r() * 46;
                const g = x.createRadialGradient(px - pr * 0.3, py - pr * 0.35, pr * 0.1, px, py, pr);
                g.addColorStop(0, 'rgba(255,255,255,.95)');
                g.addColorStop(0.65, 'rgba(234,238,245,.72)');
                g.addColorStop(1, 'rgba(205,214,228,0)');
                x.fillStyle = g;
                x.beginPath(); x.arc(px, py, pr, 0, 7); x.fill();
            }
        }));
        const shade = mk(440, 220, x => {
            x.filter = 'blur(22px)';
            x.fillStyle = 'rgba(8,18,8,.5)';
            x.beginPath(); x.ellipse(220, 115, 150, 58, 0, 0, 7); x.fill();
        });
        const puff = mk(64, 64, x => {
            const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
            g.addColorStop(0, 'rgba(232,232,226,.9)');
            g.addColorStop(0.5, 'rgba(225,225,220,.45)');
            g.addColorStop(1, 'rgba(220,220,215,0)');
            x.fillStyle = g; x.fillRect(0, 0, 64, 64);
        });
        lifeSpr = { clouds, shade, puff };
        return lifeSpr;
    }
    const lr = (a, b) => a + Math.random() * (b - a);
    function lifeCloud(fresh) {
        const L = LIFE;
        const sc = lr(0.55, 1.25);
        return { v: (Math.random() * 4) | 0, x: fresh ? lr(-200, 800) : -460 * sc - lr(0, 120), y: lr(-40, L.VH - 120), sc, sp: lr(5, 12), a: lr(0.65, 0.95), dy: lr(-0.6, 0.6) };
    }
    function lifeCar() {
        const L = LIFE;
        const kinds = [['#e9e9e6', 10, 4.6], ['#b8342a', 10, 4.6], ['#2d6db0', 10, 4.6], ['#f3f3f0', 10, 4.6], ['#c99a1c', 10, 4.6], ['#6d7a3a', 17, 5.6], ['#d8d2c4', 17, 5.6]];
        const k = kinds[(Math.random() * kinds.length) | 0];
        const dir = Math.random() < 0.5 ? 1 : -1;
        return { s: dir > 0 ? 0 : L.roadLen, dir, sp: lr(14, 26) * (k[1] > 12 ? 0.75 : 1), col: k[0], len: k[1], wid: k[2], wait: 0 };
    }
    function lifeAt(s) {
        const R = LIFE.road;
        const cum = LIFE.roadCum;
        let lo = 0;
        let hi = cum.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
        const t = (s - cum[lo]) / Math.max(0.001, cum[hi] - cum[lo]);
        return [R[lo][0] + (R[hi][0] - R[lo][0]) * t, R[lo][1] + (R[hi][1] - R[lo][1]) * t, Math.atan2(R[hi][1] - R[lo][1], R[hi][0] - R[lo][0])];
    }
    function lifeSetup(LAY, VH) {
        const L = LIFE;
        L.VH = VH;
        L.sky = me.sky || 'sun';
        L.road = RenderCore.samplePath(LAY.road, 4);
        L.roadCum = [0];
        for (let i = 1; i < L.road.length; i++) L.roadCum.push(L.roadCum[i - 1] + Math.hypot(L.road[i][0] - L.road[i - 1][0], L.road[i][1] - L.road[i - 1][1]));
        L.roadLen = L.roadCum[L.roadCum.length - 1] || 1;
        L.river = RenderCore.samplePath(LAY.river, 3);
        L.emit = LAY.villages.map((v, vi) => {
            const fr = RenderCore.rng(5000 + vi);
            return { x: v[0] + 2 + fr() * 8, y: v[1] + 2 + fr() * 6, next: Math.random() * 1.5, burn: Math.random() < 0.8 };
        });
        const nC = L.sky === 'drought' ? 1 : L.sky === 'rain' || L.sky === 'blackpod' ? 6 : 3;
        L.clouds = Array.from({ length: nC }, () => lifeCloud(true));
        L.cars = [];
        L.nextCar = lr(0.5, 3);
        for (let i = 0; i < 2; i++) { const c = lifeCar(); c.s = lr(0, L.roadLen); L.cars.push(c); }
        L.smoke = [];
        L.glints = [];
        L.birds = [];
        L.drops = [];
    }
    function lifeStep(dt, t) {
        const L = LIFE;
        // Wind dreht langsam und zufällig
        L.windT -= dt;
        if (L.windT <= 0) { L.windTo = lr(0.4, 1.6); L.windT = lr(6, 18); }
        L.wind += ((L.windTo || 1) - L.wind) * Math.min(1, dt * 0.3);
        for (const c of L.clouds) {
            c.x += c.sp * L.wind * dt;
            c.y += c.dy * dt;
            if (c.x > 820) Object.assign(c, lifeCloud(false));
        }
        // Rauch: jedes Dorf zündet unregelmässig, Feuer gehen aus und wieder an
        for (const e of L.emit) {
            e.next -= dt;
            if (e.next > 0) continue;
            if (Math.random() < 0.02) e.burn = !e.burn;
            e.next = lr(0.35, 1.1);
            if (e.burn && L.smoke.length < (Gfx.low() ? 70 : 260)) L.smoke.push({ x: e.x + lr(-0.8, 0.8), y: e.y, vx: lr(-1, 1), vy: lr(-4.5, -2.8), age: 0, life: lr(3, 5.5), r0: lr(1.4, 2.2) });
        }
        for (const s of L.smoke) {
            s.age += dt;
            s.vx += (L.wind * 3.2 - s.vx) * dt * 0.6;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vy *= 1 - dt * 0.15;
        }
        L.smoke = L.smoke.filter(s => s.age < s.life);
        // Glitzern auf dem Fluss
        const want = L.sky === 'rain' || L.sky === 'blackpod' ? 6 : 22;
        while (L.glints.length < want && L.river.length) {
            const [gx, gy] = L.river[(Math.random() * L.river.length) | 0];
            L.glints.push({ x: gx + lr(-4, 4), y: gy + lr(-3, 3), age: 0, life: lr(0.8, 2.2), w: lr(1.6, 3.2) });
        }
        for (const g of L.glints) g.age += dt;
        L.glints = L.glints.filter(g => g.age < g.life);
        // Autos: kommen unregelmässig, fahren mit eigenem Tempo, halten Abstand
        L.nextCar -= dt;
        if (L.nextCar <= 0 && L.cars.length < 5) { L.cars.push(lifeCar()); L.nextCar = lr(3, 14); }
        for (const c of L.cars) {
            const ahead = L.cars.filter(o => o !== c && o.dir === c.dir && (o.s - c.s) * c.dir > 0).reduce((m, o) => Math.min(m, Math.abs(o.s - c.s)), 1e9);
            const sp = ahead < c.len + 10 ? 0 : ahead < c.len + 26 ? c.sp * 0.4 : c.sp;
            c.s += c.dir * sp * dt;
        }
        L.cars = L.cars.filter(c => c.s >= -20 && c.s <= L.roadLen + 20);
        // Vögel: ab und zu ein kleiner Schwarm in zufälliger Richtung
        L.nextBird -= dt;
        if (L.nextBird <= 0) {
            L.nextBird = lr(12, 35);
            const n = 1 + ((Math.random() * 5) | 0);
            const fromL = Math.random() < 0.5;
            const y0 = lr(40, L.VH - 60);
            const ang = (fromL ? 0 : Math.PI) + lr(-0.35, 0.35);
            for (let i = 0; i < n; i++) L.birds.push({ x: (fromL ? -20 : 820) - Math.cos(ang) * i * lr(10, 18), y: y0 + lr(-14, 14), vx: Math.cos(ang) * lr(26, 34), vy: Math.sin(ang) * 28, ph: Math.random() * 7, f: lr(7, 10) });
        }
        for (const b of L.birds) { b.x += b.vx * dt; b.y += b.vy * dt + Math.sin(t * 0.8 + b.ph) * 4 * dt; b.ph += b.f * dt; }
        L.birds = L.birds.filter(b => b.x > -60 && b.x < 860);
        // Regen
        if (L.sky === 'rain' || L.sky === 'blackpod') {
            while (L.drops.length < 140) L.drops.push({ x: lr(-40, 800), y: lr(-20, L.VH), sp: lr(260, 380) });
            for (const d of L.drops) { d.y += d.sp * dt; d.x += d.sp * 0.18 * dt; if (d.y > L.VH) { d.y = lr(-30, 0); d.x = lr(-40, 800); } }
        }
    }
    function lifeDraw(x) {
        const L = LIFE;
        const S = lifeSprites();
        x.setTransform(L.scale, 0, 0, L.scale, 0, 0);
        x.clearRect(0, 0, 800, L.VH);
        // Glitzern
        for (const g of L.glints) {
            const a = Math.sin((g.age / g.life) * Math.PI);
            x.fillStyle = `rgba(255,250,228,${(a * 0.85).toFixed(3)})`;
            x.fillRect(g.x - (g.w * a) / 2, g.y, g.w * a, 0.9);
        }
        // Autos
        for (const c of L.cars) {
            const [px, py, ang] = lifeAt(Math.max(0, Math.min(L.roadLen, c.s)));
            x.save();
            x.translate(px, py);
            x.rotate(ang + (c.dir < 0 ? Math.PI : 0));
            x.translate(0, c.dir < 0 ? -1.6 : 1.6); // Rechtsverkehr
            x.fillStyle = 'rgba(0,0,0,.38)';
            x.fillRect(-c.len / 2 + 1, -c.wid / 2 + 1.3, c.len, c.wid);
            x.fillStyle = c.col;
            x.fillRect(-c.len / 2, -c.wid / 2, c.len, c.wid);
            x.fillStyle = '#1b2530';
            x.fillRect(c.len / 2 - (c.len > 12 ? 5 : 3.4), -c.wid / 2 + 0.6, 1.8, c.wid - 1.2);
            if (c.len > 12) { x.fillStyle = 'rgba(120,80,40,.85)'; x.fillRect(-c.len / 2 + 1, -c.wid / 2 + 0.8, c.len - 7, c.wid - 1.6); }
            x.restore();
        }
        // Rauch
        for (const s of L.smoke) {
            const q = s.age / s.life;
            const r = s.r0 + q * 7;
            x.globalAlpha = Math.min(1, q * 6) * (1 - q) * 0.75;
            x.drawImage(S.puff, s.x - r, s.y - r, r * 2, r * 2);
        }
        x.globalAlpha = 1;
        // Wolkenschatten, dann Wolken
        for (const c of L.clouds) { x.globalAlpha = c.a * 0.8; x.drawImage(S.shade, c.x + 70 * c.sc, c.y + 95 * c.sc, 440 * c.sc * 0.5, 220 * c.sc * 0.5); }
        for (const c of L.clouds) { x.globalAlpha = c.a; x.drawImage(S.clouds[c.v], c.x, c.y, 440 * c.sc * 0.5, 220 * c.sc * 0.5); }
        x.globalAlpha = 1;
        // Vögel
        x.strokeStyle = '#18200f';
        x.lineWidth = 1.4;
        x.lineCap = 'round';
        x.beginPath();
        for (const b of L.birds) {
            const fl = Math.sin(b.ph) * 3;
            x.moveTo(b.x - 6, b.y - fl);
            x.quadraticCurveTo(b.x - 3, b.y - 2.5, b.x, b.y);
            x.quadraticCurveTo(b.x + 3, b.y - 2.5, b.x + 6, b.y - fl);
        }
        x.stroke();
        // Regen
        if (L.drops.length && (L.sky === 'rain' || L.sky === 'blackpod')) {
            x.strokeStyle = 'rgba(210,225,240,.28)';
            x.lineWidth = 0.7;
            x.beginPath();
            for (const d of L.drops) { x.moveTo(d.x, d.y); x.lineTo(d.x + 1.6, d.y + 9); }
            x.stroke();
        }
    }
    function lifeLoop(now) {
        const L = LIFE;
        const cv = $('d-life');
        const desk = $('v-desk');
        if (!L.on || !cv || !desk || !desk.classList.contains('active')) { L.raf = 0; L.last = 0; return; }
        L.raf = requestAnimationFrame(lifeLoop);
        // höchstens 40 Bilder pro Sekunde – flüssig, aber schont den Laptop
        if (L.last && now - L.last < (Gfx.low() ? 48 : 24)) return; // niedrig: ca. 20 Bilder/s
        const dt = L.last ? Math.min(0.1, (now - L.last) / 1000) : 0.016;
        L.last = now;
        if (L.mode === 'plant') { PLINE.T += dt * PLINE.sp; plantFrame(L.ctx); } else { lifeStep(dt, now / 1000); lifeDraw(L.ctx); }
    }
    // ===== Fabrik: der echte Weg von der Bohne zur Tafel – 13 Schritte, lebendig gezeichnet =====
    // Hintere Reihe (links → rechts): Rohkakao wird zu Schokoladenmasse.
    // Vordere Reihe (rechts → links): aus der Masse werden verpackte Tafeln.
    const PST = [
        { k: 'clean', x: 70, row: 0, name: 'Reinigen', p: 'Sieb · Magnet · Luftstrom', txt: 'Die Jutesäcke werden geleert. Siebe, Magnete und ein Luftstrom holen Steine, Fasern und Metallteile heraus.' },
        { k: 'roast', x: 185, row: 0, name: 'Rösten', p: '120–140 °C · 20–40 min', txt: 'In der drehenden Trommel entsteht das typische Kakao-Aroma. Danach kühlen die Bohnen auf dem Kühlsieb ab.' },
        { k: 'winnow', x: 300, row: 0, name: 'Brechen & Schälen', p: 'Schalen ≈ 12 % → Tee, Tierfutter', txt: 'Walzen brechen die Bohnen, ein Luftstrom bläst die leichten Schalen weg. Übrig bleiben die Kakao-Nibs.' },
        { k: 'grind', x: 410, row: 0, name: 'Mahlen', p: '≈ 70 °C · Nibs enthalten 54 % Fett', txt: 'Mahlsteine zerreiben die Nibs. Die Kakaobutter schmilzt – aus Bruch wird flüssige Kakaomasse.' },
        { k: 'mix', x: 520, row: 0, name: 'Mischen', p: 'Milchschokolade: ≈ 30 % Kakao', txt: 'Kakaomasse, Zucker, Milchpulver und extra Kakaobutter werden zu einem Teig geknetet.' },
        { k: 'refine', x: 640, row: 0, name: 'Feinwalzen', p: '5 Walzen · feiner als 20 µm', txt: 'Fünf Walzen zerreiben Zucker- und Kakaoteilchen so fein, dass die Zunge nichts mehr spürt.' },
        { k: 'conche', x: 726, row: 1, name: 'Conchieren', p: '50–80 °C · 6–72 Stunden', txt: 'Stundenlanges Rühren und Belüften: Säure und Bitterstoffe verfliegen, die Schokolade wird zartschmelzend.' },
        { k: 'temper', x: 606, row: 1, name: 'Temperieren', p: '45 → 27 → 31 °C', txt: 'Erwärmen, abkühlen, leicht wieder erwärmen – so bilden sich die richtigen Kristalle. Ergebnis: Glanz und Knack.' },
        { k: 'deposit', x: 490, row: 1, name: 'Giessen & Rütteln', p: '100 g pro Tafel', txt: 'Die Masse wird genau dosiert in Tafelformen gegossen. Rütteln treibt die Luftblasen heraus.' },
        { k: 'cool', x: 355, row: 1, name: 'Kühlen', p: '≈ 12 °C · 20 Minuten', txt: 'Langsames Abkühlen im Kühltunnel, damit die Kristalle stabil bleiben und die Tafel glänzt.' },
        { k: 'demould', x: 236, row: 1, name: 'Ausformen', p: 'leere Formen fahren zurück', txt: 'Die Formen werden gedreht, die Tafeln fallen heraus. Die leeren Formen laufen unten zurück zur Giessanlage.' },
        { k: 'wrap', x: 136, row: 1, name: 'Verpacken', p: 'bis 600 Tafeln pro Minute', txt: 'Alufolie schützt vor Licht und Feuchtigkeit, darüber kommt die Banderole mit dem Markennamen.' },
        { k: 'ship', x: 46, row: 1, name: 'Versand', p: 'Karton → Palette → Handel', txt: 'Tafeln kommen in Kartons, Kartons auf Paletten – und ab in die Läden.' },
    ];
    const PW = { clean: 62, roast: 96, winnow: 70, grind: 84, mix: 84, refine: 64, conche: 104, temper: 66, deposit: 84, cool: 150, demould: 66, wrap: 78, ship: 60 };
    const PLINE = { T: 0, sp: 1, HH: 0, B1: 0, B2: 0, stat: null, statKey: '' };
    const lerp = (a, b, t) => a + (b - a) * t;
    function rrect(x, x0, y0, w, h, r) { x.beginPath(); x.moveTo(x0 + r, y0); x.arcTo(x0 + w, y0, x0 + w, y0 + h, r); x.arcTo(x0 + w, y0 + h, x0, y0 + h, r); x.arcTo(x0, y0 + h, x0, y0, r); x.arcTo(x0, y0, x0 + w, y0, r); x.closePath(); }
    function steel(x, x0, y0, w, h, r = 3, tone = 1) {
        const g = x.createLinearGradient(x0, 0, x0 + w, 0);
        const c = v => `rgb(${Math.round(v[0] * tone)},${Math.round(v[1] * tone)},${Math.round(v[2] * tone)})`;
        g.addColorStop(0, c([70, 76, 84]));
        g.addColorStop(0.18, c([168, 176, 186]));
        g.addColorStop(0.32, c([214, 220, 226]));
        g.addColorStop(0.55, c([138, 146, 156]));
        g.addColorStop(0.85, c([92, 99, 108]));
        g.addColorStop(1, c([58, 63, 70]));
        x.fillStyle = g;
        rrect(x, x0, y0, w, h, r);
        x.fill();
        x.strokeStyle = 'rgba(0,0,0,.45)';
        x.lineWidth = 0.6;
        x.stroke();
        x.fillStyle = 'rgba(255,255,255,.22)';
        x.fillRect(x0 + 2, y0 + 0.6, w - 4, 0.8);
    }
    function enamel(x, x0, y0, w, h, col, r = 3) {
        const g = x.createLinearGradient(0, y0, 0, y0 + h);
        g.addColorStop(0, col[0]);
        g.addColorStop(1, col[1]);
        x.fillStyle = g;
        rrect(x, x0, y0, w, h, r);
        x.fill();
        x.strokeStyle = 'rgba(0,0,0,.4)';
        x.lineWidth = 0.6;
        x.stroke();
        x.fillStyle = 'rgba(255,255,255,.18)';
        x.fillRect(x0 + 2, y0 + 0.7, w - 4, 0.9);
    }
    const shadowAt = (x, cx, yb, w) => { const g = x.createRadialGradient(cx, yb, 1, cx, yb, w / 2 + 8); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(cx, yb, w / 2 + 8, 5, 0, 0, 7); x.fill(); };
    const legs = (x, x0, w, yt, yb) => { x.fillStyle = '#2b3036'; for (const lx of [x0 + 3, x0 + w - 6]) { x.fillRect(lx, yt, 3, yb - yt); x.fillStyle = '#3c434b'; x.fillRect(lx, yb - 1.5, 4.5, 1.5); x.fillStyle = '#2b3036'; } };
    const panelBox = (x, px, py) => { x.fillStyle = '#14181d'; rrect(x, px, py, 16, 11, 1.5); x.fill(); x.fillStyle = '#0c2a1c'; x.fillRect(px + 2, py + 2, 12, 4); };
    function belt(x, xa, xb, y, h = 4) {
        const g = x.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, '#30353c');
        g.addColorStop(0.5, '#15181c');
        g.addColorStop(1, '#2a2f35');
        x.fillStyle = g;
        x.fillRect(xa, y, xb - xa, h);
        x.fillStyle = '#4b525b';
        x.fillRect(xa, y - 0.8, xb - xa, 0.8);
        x.fillStyle = '#20252a';
        for (let q = xa + 6; q < xb - 2; q += 22) x.fillRect(q, y + h, 1.6, 7);
    }
    // Statische Teile: einmal zeichnen (Maschinenkörper, Bänder, Rohre)
    function plantStatic(x, P) {
        const { B1, B2 } = P;
        const W = id => PW[id];
        const at = id => PST.find(s => s.k === id).x;
        // --- Bänder & Rohre der hinteren Reihe ---
        belt(x, 92, 140, B1 - 16);            // Reinigung → Röster
        belt(x, 236, 268, B1 - 16);           // Röster → Brecher
        belt(x, 336, 372, B1 - 16);           // Nibs → Mühle
        belt(x, 562, 610, B1 - 16);           // Teig → Walzwerk
        belt(x, 670, 744, B1 - 30);           // Flocken → Rutsche
        // Rohr Mühle → Mischer (Kakaomasse)
        x.fillStyle = '#7e8791'; x.fillRect(452, B1 - 52, 26, 5); x.fillStyle = '#c3cad2'; x.fillRect(452, B1 - 52, 26, 1.2);
        // Rutsche hinunter zur Conche
        steel(x, 744, B1 - 40, 10, (B2 - 70) - (B1 - 40), 2);
        // --- vordere Reihe ---
        belt(x, 274, 548, B2 - 18, 5);       // Formen-Band (Giessen → Kühltunnel → Ausformen)
        belt(x, 250, 520, B2 - 6, 3);        // Rücklauf leere Formen
        belt(x, 160, 206, B2 - 18, 4);       // Tafeln → Verpackung
        belt(x, 70, 98, B2 - 18, 4);         // verpackte Tafeln → Versand
        // Rohre Conche → Temperierer → Giessanlage
        for (const [xa, xb, y] of [[640, 676, B2 - 70], [520, 572, B2 - 74]]) { x.fillStyle = '#7e8791'; x.fillRect(xa, y, xb - xa, 5); x.fillStyle = '#c3cad2'; x.fillRect(xa, y, xb - xa, 1.2); }

        // ===== hintere Reihe =====
        // 1 Reinigen: Trichter + Rüttelsieb + Ausschusskiste
        { const cx = at('clean'); const w = W('clean'); shadowAt(x, cx, B1, w); legs(x, cx - w / 2 + 4, w - 8, B1 - 40, B1);
          x.fillStyle = '#c9ccd0'; x.beginPath(); x.moveTo(cx - 22, B1 - 98); x.lineTo(cx + 22, B1 - 98); x.lineTo(cx + 6, B1 - 70); x.lineTo(cx - 6, B1 - 70); x.closePath(); x.fill();
          const hg = x.createLinearGradient(cx - 22, 0, cx + 22, 0); hg.addColorStop(0, 'rgba(0,0,0,.35)'); hg.addColorStop(0.35, 'rgba(255,255,255,.25)'); hg.addColorStop(1, 'rgba(0,0,0,.4)'); x.fillStyle = hg; x.fill();
          steel(x, cx - 5, B1 - 70, 10, 10, 1);
          enamel(x, cx - w / 2, B1 - 56, w, 16, ['#e6e2d8', '#a9a497'], 2);
          x.fillStyle = '#2a2f35'; x.fillRect(cx - w / 2 + 3, B1 - 54, w - 6, 2);
          enamel(x, cx + w / 2 - 4, B1 - 22, 16, 14, ['#6b4a2c', '#3e2a17'], 1); // Kiste mit Steinen
          x.fillStyle = '#8d8a83'; for (let q = 0; q < 5; q++) { x.beginPath(); x.arc(cx + w / 2 + q * 2.6, B1 - 21 + (q % 2), 1.2, 0, 7); x.fill(); }
          panelBox(x, cx - w / 2 - 2, B1 - 36); }
        // 2 Rösten: Trommel auf Gestell, Brenner, Kamin, Kühlsieb
        { const cx = at('roast'); const w = W('roast'); shadowAt(x, cx, B1, w + 20); legs(x, cx - w / 2, w, B1 - 34, B1);
          enamel(x, cx - w / 2, B1 - 34, w, 10, ['#7a2a1f', '#4a170f'], 2);
          steel(x, cx - w / 2 + 4, B1 - 78, w - 26, 40, 18);
          x.fillStyle = '#2a2f35'; x.beginPath(); x.ellipse(cx - w / 2 + 6, B1 - 58, 5, 18, 0, 0, 7); x.fill(); // Trommeltür
          x.strokeStyle = '#b9c0c8'; x.lineWidth = 1; x.beginPath(); x.ellipse(cx - w / 2 + 6, B1 - 58, 5, 18, 0, 0, 7); x.stroke();
          steel(x, cx + 10, B1 - 112, 9, 36, 2); x.fillStyle = '#1a1d21'; x.fillRect(cx + 10, B1 - 114, 9, 3); // Kamin
          // Kühlsieb (rund, flach) rechts
          x.fillStyle = '#3a4048'; x.beginPath(); x.ellipse(cx + 38, B1 - 22, 18, 6, 0, 0, 7); x.fill();
          x.fillStyle = '#7c848e'; x.beginPath(); x.ellipse(cx + 38, B1 - 24, 18, 6, 0, 0, 7); x.fill();
          x.fillStyle = '#4b2a14'; x.beginPath(); x.ellipse(cx + 38, B1 - 24.5, 15, 4.6, 0, 0, 7); x.fill();
          panelBox(x, cx - w / 2 + 2, B1 - 104); }
        // 3 Brechen & Schälen: Brecherwalzen oben, Windsichter-Schrank, Schalen-Sack
        { const cx = at('winnow'); const w = W('winnow'); shadowAt(x, cx, B1, w + 16);
          enamel(x, cx - w / 2, B1 - 92, w, 92, ['#e8e4da', '#9d988b'], 3);
          for (let q = 0; q < 4; q++) { x.fillStyle = 'rgba(40,44,50,.55)'; x.fillRect(cx - w / 2 + 6, B1 - 70 + q * 12, w - 12, 1.2); }
          x.fillStyle = '#20252b'; rrect(x, cx - 18, B1 - 104, 36, 14, 3); x.fill();
          steel(x, cx + w / 2 - 2, B1 - 84, 22, 8, 3); // Schalen-Kanal
          x.fillStyle = '#9b7a4f'; rrect(x, cx + w / 2 + 14, B1 - 30, 20, 30, 5); x.fill(); // Jutesack
          x.fillStyle = 'rgba(0,0,0,.25)'; for (let q = 0; q < 6; q++) x.fillRect(cx + w / 2 + 15, B1 - 28 + q * 4.5, 18, 0.6);
          x.fillStyle = '#20252b'; x.fillRect(cx - 8, B1 - 18, 16, 6); // Auslauf Nibs
          panelBox(x, cx - w / 2 + 4, B1 - 86); }
        // 4 Mahlen: runder Trog mit zwei Mahlsteinen
        { const cx = at('grind'); const w = W('grind'); shadowAt(x, cx, B1, w + 6); legs(x, cx - w / 2 + 6, w - 12, B1 - 30, B1);
          enamel(x, cx - w / 2 + 4, B1 - 46, w - 8, 18, ['#6d7680', '#3b4249'], 2);
          steel(x, cx - w / 2, B1 - 72, w, 28, 8);
          x.fillStyle = '#2a1407'; x.beginPath(); x.ellipse(cx, B1 - 72, w / 2 - 3, 7, 0, 0, 7); x.fill();
          steel(x, cx - 3, B1 - 104, 6, 30, 2); // Antriebswelle
          enamel(x, cx - 16, B1 - 112, 32, 10, ['#3a5b7a', '#1f3549'], 2); // Motor
          panelBox(x, cx + w / 2 - 14, B1 - 40); }
        // 5 Mischen: Kneter mit drei Trichtern (Zucker, Milchpulver, Kakaobutter)
        { const cx = at('mix'); const w = W('mix'); shadowAt(x, cx, B1, w + 6); legs(x, cx - w / 2 + 4, w - 8, B1 - 30, B1);
          steel(x, cx - w / 2, B1 - 66, w, 38, 12);
          x.fillStyle = '#0f1216'; rrect(x, cx - 18, B1 - 58, 36, 20, 4); x.fill(); // Sichtfenster
          [['Zucker', '#f4f1ea', -26], ['Milch', '#efe2c4', 0], ['Butter', '#e9cf85', 26]].forEach(([lb, col, dx]) => {
              x.fillStyle = '#b8bec5'; x.beginPath(); x.moveTo(cx + dx - 10, B1 - 112); x.lineTo(cx + dx + 10, B1 - 112); x.lineTo(cx + dx + 3, B1 - 92); x.lineTo(cx + dx - 3, B1 - 92); x.closePath(); x.fill();
              x.fillStyle = col; x.fillRect(cx + dx - 8, B1 - 111, 16, 5);
              x.fillStyle = '#2b3036'; x.fillRect(cx + dx - 1.5, B1 - 92, 3, 26);
              x.fillStyle = 'rgba(20,16,12,.85)'; x.font = '600 5.5px Inter, sans-serif'; x.textAlign = 'center'; x.fillText(lb.toUpperCase(), cx + dx, B1 - 114);
          });
          panelBox(x, cx + w / 2 - 18, B1 - 26); }
        // 6 Feinwalzen: Ständer mit fünf Walzen
        { const cx = at('refine'); const w = W('refine'); shadowAt(x, cx, B1, w + 10);
          enamel(x, cx - w / 2, B1 - 100, 8, 100, ['#3a5b7a', '#1f3549'], 2); enamel(x, cx + w / 2 - 8, B1 - 100, 8, 100, ['#3a5b7a', '#1f3549'], 2);
          for (let q = 0; q < 5; q++) steel(x, cx - w / 2 + 8, B1 - 96 + q * 16, w - 16, 13, 6.5);
          x.fillStyle = '#2b3036'; x.fillRect(cx - w / 2 + 6, B1 - 14, w - 12, 4);
          panelBox(x, cx + w / 2 - 2, B1 - 60); }

        // Tiefe: hintere Reihe leicht abdunkeln
        x.fillStyle = 'rgba(10,8,6,.16)';
        x.fillRect(0, B1 - 120, 800, 120);

        // ===== vordere Reihe =====
        // 7 Conche: langer Trog mit Rührwerk
        { const cx = at('conche'); const w = W('conche'); shadowAt(x, cx, B2, w); legs(x, cx - w / 2 + 6, w - 12, B2 - 32, B2);
          steel(x, cx - w / 2, B2 - 76, w, 46, 20);
          x.fillStyle = '#2a1407'; x.beginPath(); x.ellipse(cx, B2 - 74, w / 2 - 6, 6, 0, 0, 7); x.fill();
          enamel(x, cx - 14, B2 - 96, 28, 12, ['#7a2a1f', '#4a170f'], 2); // Antrieb
          x.fillStyle = '#14181d'; rrect(x, cx + w / 2 - 30, B2 - 52, 24, 16, 2); x.fill(); }
        // 8 Temperieren: Schrank mit Anzeige
        { const cx = at('temper'); const w = W('temper'); shadowAt(x, cx, B2, w);
          enamel(x, cx - w / 2, B2 - 90, w, 90, ['#e8e4da', '#9d988b'], 3);
          x.fillStyle = '#0d1014'; rrect(x, cx - w / 2 + 6, B2 - 82, w - 12, 34, 3); x.fill();
          steel(x, cx - w / 2 + 10, B2 - 40, w - 20, 26, 3);
          for (let q = 0; q < 4; q++) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(cx - w / 2 + 14, B2 - 36 + q * 5.5, w - 28, 1); } }
        // 9 Giessen & Rütteln: Portal mit Dosierkopf
        { const cx = at('deposit'); const w = W('deposit'); shadowAt(x, cx, B2, w);
          enamel(x, cx - w / 2, B2 - 92, 8, 74, ['#3a5b7a', '#1f3549'], 2); enamel(x, cx + w / 2 - 8, B2 - 92, 8, 74, ['#3a5b7a', '#1f3549'], 2);
          enamel(x, cx - w / 2, B2 - 98, w, 12, ['#3a5b7a', '#1f3549'], 2);
          steel(x, cx - 26, B2 - 86, 52, 22, 4); // Trichter mit Masse
          x.fillStyle = '#2a1407'; x.fillRect(cx - 23, B2 - 84, 46, 4);
          enamel(x, cx - w / 2 + 6, B2 - 22, w - 12, 4, ['#59616b', '#2b3036'], 1); } // Rütteltisch
        // 10 Kühltunnel
        { const cx = at('cool'); const w = W('cool'); shadowAt(x, cx, B2, w);
          enamel(x, cx - w / 2, B2 - 52, w, 40, ['#dfe6ec', '#97a3ad'], 5);
          for (let q = 0; q < 5; q++) { x.fillStyle = '#0d1a24'; rrect(x, cx - w / 2 + 10 + q * 27, B2 - 44, 20, 12, 2); x.fill(); }
          for (let q = 0; q < 3; q++) steel(x, cx - w / 2 + 20 + q * 48, B2 - 62, 18, 10, 2); // Kühlaggregate
          legs(x, cx - w / 2 + 4, w - 8, B2 - 12, B2); }
        // 11 Ausformen: Drehstation
        { const cx = at('demould'); const w = W('demould'); shadowAt(x, cx, B2, w);
          enamel(x, cx - w / 2, B2 - 86, 7, 70, ['#3a5b7a', '#1f3549'], 2); enamel(x, cx + w / 2 - 7, B2 - 86, 7, 70, ['#3a5b7a', '#1f3549'], 2);
          enamel(x, cx - w / 2, B2 - 90, w, 8, ['#3a5b7a', '#1f3549'], 2);
          x.fillStyle = '#c3cad2'; x.beginPath(); x.arc(cx, B2 - 52, 3, 0, 7); x.fill(); }
        // 12 Verpacken: Schlauchbeutel-Maschine mit Folienrolle
        { const cx = at('wrap'); const w = W('wrap'); shadowAt(x, cx, B2, w);
          enamel(x, cx - w / 2, B2 - 50, w, 36, ['#e8e4da', '#9d988b'], 4);
          x.fillStyle = '#0f1216'; rrect(x, cx - 18, B2 - 44, 36, 12, 2); x.fill();
          legs(x, cx - w / 2 + 4, w - 8, B2 - 14, B2);
          steel(x, cx + 8, B2 - 82, 4, 32, 1); }
        // 13 Versand: Palette
        { const cx = at('ship'); shadowAt(x, cx, B2, 50);
          x.fillStyle = '#7a5a34'; x.fillRect(cx - 24, B2 - 6, 48, 4); x.fillStyle = '#5a3f22'; for (let q = 0; q < 3; q++) x.fillRect(cx - 22 + q * 20, B2 - 2, 5, 2.5); }
    }

    // Lebendige Teile: jedes Bild neu
    function plantDyn(x, P, T) {
        const { B1, B2 } = P;
        const at = id => PST.find(s => s.k === id).x;
        const stream = (xa, xb, y, gap, v, draw) => { const L = xb - xa; const n = Math.ceil(L / gap); for (let i = 0; i < n; i++) { const d = (T * v + i * gap) % L; draw(v >= 0 ? xa + d : xb - d, y, i); } };
        const bean = (bx, by, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(bx, by, 2.2, 1.4, 0.3, 0, 7); x.fill(); };
        // --- hintere Reihe: Material wandert nach rechts ---
        stream(92, 140, B1 - 18, 6, 9, (bx, by) => bean(bx, by, '#8a5a34'));
        stream(236, 268, B1 - 18, 6, 9, (bx, by) => bean(bx, by, '#4a2a14'));
        stream(336, 372, B1 - 18, 4, 9, (bx, by, i) => { x.fillStyle = i % 2 ? '#3d200c' : '#5a3216'; x.fillRect(bx - 1, by - 1.2, 2 + (i % 3), 1.6); });
        stream(562, 610, B1 - 19, 12, 7, (bx, by) => { x.fillStyle = '#6a3b1e'; x.beginPath(); x.ellipse(bx, by, 4, 2, 0, 0, 7); x.fill(); });
        stream(670, 744, B1 - 32, 5, 9, (bx, by, i) => { x.fillStyle = i % 2 ? '#7a4a28' : '#8b5a33'; x.fillRect(bx - 1.5, by - 1, 3, 1.2); });
        // Kakaomasse im Rohr (laufende Striche)
        x.fillStyle = '#5a2c10'; for (let q = 0; q < 4; q++) x.fillRect(452 + ((T * 14 + q * 7) % 26), B1 - 50.5, 3, 2);
        // Rutsche: Flocken fallen zur Conche
        x.fillStyle = '#8b5a33'; for (let q = 0; q < 6; q++) { const p = ((T * 0.9 + q / 6) % 1); x.fillRect(747, lerp(B1 - 36, B2 - 74, p), 3, 1.4); }

        // 1 Reinigen: Bohnen fallen, Sieb rüttelt
        { const cx = at('clean'); const j = Math.sin(T * 50) * 0.7;
          for (let q = 0; q < 4; q++) bean(cx + (q % 2 ? 1.5 : -1.5), B1 - 70 + ((T * 40 + q * 4) % 14), '#8a5a34');
          x.fillStyle = '#d9d2c2'; x.fillRect(cx - 26 + j, B1 - 58, 52, 2);
          x.fillStyle = 'rgba(220,210,190,.35)'; for (let q = 0; q < 6; q++) { const p = (T * 0.6 + q / 6) % 1; x.fillRect(cx - 20 + q * 7 + j, B1 - 60 - p * 10, 0.8, 0.8); }
          x.fillStyle = (Math.floor(T * 2) % 2) ? '#4ade80' : '#14532d'; x.fillRect(cx - 29, B1 - 33, 3, 2); }
        // 2 Rösten: drehende Trommel, Flammen, Abluft, Kühlsieb-Arm, Temperatur
        { const cx = at('roast'); const x0 = cx - 44; const w = 70;
          x.save(); rrect(x, x0, B1 - 78, w, 40, 18); x.clip();
          x.strokeStyle = 'rgba(40,44,50,.55)'; x.lineWidth = 1.4;
          for (let q = 0; q < 6; q++) { const px = x0 + ((q * 14 + T * 10) % (w + 14)) - 7; x.beginPath(); x.moveTo(px, B1 - 78); x.lineTo(px + 6, B1 - 38); x.stroke(); }
          x.restore();
          for (let q = 0; q < 5; q++) { const fl = 4 + Math.sin(T * 13 + q * 1.7) * 2 + Math.sin(T * 29 + q) * 1; const fx = x0 + 10 + q * 12; const g = x.createLinearGradient(0, B1 - 34 - fl, 0, B1 - 34); g.addColorStop(0, 'rgba(255,200,80,0)'); g.addColorStop(0.5, 'rgba(255,150,40,.9)'); g.addColorStop(1, 'rgba(80,140,255,.9)'); x.fillStyle = g; x.beginPath(); x.moveTo(fx - 2.5, B1 - 34); x.quadraticCurveTo(fx, B1 - 34 - fl * 2, fx + 2.5, B1 - 34); x.fill(); }
          for (let q = 0; q < 4; q++) { const p = (T * 0.35 + q / 4) % 1; x.fillStyle = `rgba(210,205,198,${(0.38 * (1 - p)).toFixed(3)})`; x.beginPath(); x.arc(cx + 14.5 + p * 10, B1 - 116 - p * 26, 2.5 + p * 7, 0, 7); x.fill(); }
          const a = T * 1.6; x.strokeStyle = '#c3cad2'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(cx + 38 - Math.cos(a) * 14, B1 - 24.5 - Math.sin(a) * 4.2); x.lineTo(cx + 38 + Math.cos(a) * 14, B1 - 24.5 + Math.sin(a) * 4.2); x.stroke();
          x.fillStyle = '#7dffb0'; x.font = '600 4.6px "IBM Plex Mono", monospace'; x.textAlign = 'center'; x.fillText(`${Math.round(134 + Math.sin(T * 0.7) * 3)}°C`, cx - 40, B1 - 98.5); }
        // 3 Brechen & Schälen: Walzen drehen, Schalen fliegen in den Sack, Nibs fallen
        { const cx = at('winnow');
          for (const [ox, dir] of [[-8, 1], [8, -1]]) { x.fillStyle = '#6d757e'; x.beginPath(); x.arc(cx + ox, B1 - 97, 5.5, 0, 7); x.fill(); x.strokeStyle = '#c3cad2'; x.lineWidth = 0.9; for (let q = 0; q < 3; q++) { const a = T * 4 * dir + (q * Math.PI * 2) / 3; x.beginPath(); x.moveTo(cx + ox, B1 - 97); x.lineTo(cx + ox + Math.cos(a) * 5, B1 - 97 + Math.sin(a) * 5); x.stroke(); } }
          for (let q = 0; q < 8; q++) { const p = (T * 0.7 + q / 8) % 1; const fx = lerp(cx + 55, cx + 60, p) + Math.sin(p * 9 + q) * 3; const fy = lerp(B1 - 80, B1 - 28, p) - Math.sin(p * Math.PI) * 8; x.fillStyle = `rgba(196,160,112,${(0.9 - p * 0.5).toFixed(2)})`; x.save(); x.translate(fx, fy); x.rotate(T * 6 + q); x.fillRect(-1.6, -0.6, 3.2, 1.2); x.restore(); }
          x.fillStyle = '#4a2a12'; for (let q = 0; q < 4; q++) x.fillRect(cx - 4 + q * 2.4, B1 - 12 + ((T * 30 + q * 3) % 6), 1.4, 1.4); }
        // 4 Mahlen: zwei Mahlsteine kreisen im Trog
        { const cx = at('grind'); for (let q = 0; q < 2; q++) { const a = T * 1.3 + q * Math.PI; const sx = cx + Math.cos(a) * 16; const sy = B1 - 73 + Math.sin(a) * 2.4; const g = x.createRadialGradient(sx - 2, sy - 3, 1, sx, sy, 9); g.addColorStop(0, '#d6d1c7'); g.addColorStop(1, '#6f6a62'); x.fillStyle = g; x.beginPath(); x.ellipse(sx, sy - 4, 8, 6, 0, 0, 7); x.fill(); }
          x.strokeStyle = 'rgba(160,100,60,.4)'; x.lineWidth = 0.6; x.beginPath(); x.ellipse(cx, B1 - 72, 22 + Math.sin(T * 3) * 2, 3.5, 0, 0, 7); x.stroke(); }
        // 5 Mischen: Zutaten rieseln abwechselnd, Knethaken drehen
        { const cx = at('mix');
          [['#f4f1ea', -26, 0], ['#efe2c4', 0, 2.1], ['#e9cf85', 26, 4.2]].forEach(([col, dx, ph]) => { if (Math.sin(T * 0.9 + ph) < 0.2) return; x.fillStyle = col; for (let q = 0; q < 5; q++) x.fillRect(cx + dx - 0.8, B1 - 92 + ((T * 50 + q * 6) % 30) - 2, 1.6, 2); });
          x.save(); rrect(x, cx - 18, B1 - 58, 36, 20, 4); x.clip(); x.fillStyle = '#5a3018'; x.fillRect(cx - 18, B1 - 46, 36, 8);
          for (let q = 0; q < 2; q++) { const a = T * 2.2 + q * Math.PI; x.strokeStyle = '#aab2bb'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx - 8 + q * 16, B1 - 48); x.lineTo(cx - 8 + q * 16 + Math.cos(a) * 7, B1 - 48 + Math.sin(a) * 6); x.stroke(); }
          x.restore(); }
        // 6 Feinwalzen: Walzen drehen gegenläufig, Film wird dünner, Flocken fallen
        { const cx = at('refine'); const w = 48;
          for (let q = 0; q < 5; q++) { const y = B1 - 96 + q * 16; x.save(); rrect(x, cx - w / 2, y, w, 13, 6.5); x.clip(); x.fillStyle = 'rgba(30,34,40,.4)'; const off = ((q % 2 ? -1 : 1) * T * 8) % 8; for (let s = -8; s < w + 8; s += 8) x.fillRect(cx - w / 2 + s + off, y, 1.2, 13); x.restore();
              x.fillStyle = `rgba(110,62,28,${(0.85 - q * 0.12).toFixed(2)})`; x.fillRect(cx - w / 2 + 2, y + 12, w - 4, 1.4 + (4 - q) * 0.3); }
          x.fillStyle = '#8b5a33'; for (let q = 0; q < 5; q++) { const p = (T * 0.8 + q / 5) % 1; x.fillRect(cx + 20 + q, B1 - 18 - (1 - p) * 4, 2.4, 1); } }

        // --- vordere Reihe: Formen und Tafeln wandern nach links ---
        const V = 16;           // Bandgeschwindigkeit
        const G = 34;           // Abstand der Formen
        const dep = at('deposit');
        const dem = at('demould');
        const mould = (mx, my, full) => { x.fillStyle = '#c9d2da'; x.fillRect(mx - 12, my - 5, 24, 6); x.fillStyle = full ? '#3e1c08' : '#8f9aa6'; x.fillRect(mx - 10.5, my - 4, 21, 4); x.strokeStyle = full ? '#2a1205' : '#b4bec8'; x.lineWidth = 0.5; x.beginPath(); for (let q = 1; q < 4; q++) { x.moveTo(mx - 10.5 + q * 5.25, my - 4); x.lineTo(mx - 10.5 + q * 5.25, my); } x.stroke(); if (full) { x.fillStyle = 'rgba(255,220,180,.4)'; x.fillRect(mx - 10, my - 4, 20, 0.7); } };
        // Formen-Band: rechts (leer) → Giessanlage (voll) → Tunnel (versteckt) → Ausformen
        const shake = Math.sin(T * 60) * 0.6;
        stream(dem + 30, 548, B2 - 20, G, -V, (mx, my) => {
            if (mx > 282 && mx < 428) return; // im Tunnel
            const full = mx < dep + 2;
            mould(mx + (Math.abs(mx - dep) < 30 ? shake : 0), my, full);
        });
        // Dosierkolben + Tropfen: im Takt der ankommenden Formen
        { const ph = ((T * V) % G) / G; const down = Math.max(0, Math.sin(ph * Math.PI * 2)) * 6;
          for (let q = 0; q < 4; q++) { const nx = dep - 15 + q * 10; steel(x, nx - 2, B2 - 64 + down, 4, 10, 1); if (down > 3) { x.fillStyle = '#4a2410'; x.fillRect(nx - 0.8, B2 - 54 + down, 1.6, 30 - down); } } }
        // Kühltunnel: kalter Nebel, Anzeige
        { const cx = at('cool'); for (let q = 0; q < 6; q++) { const p = (T * 0.4 + q / 6) % 1; x.fillStyle = `rgba(210,235,255,${(0.32 * (1 - p)).toFixed(3)})`; x.beginPath(); x.arc(cx - 50 + q * 20 + Math.sin(T + q) * 3, B2 - 64 - p * 16, 3 + p * 6, 0, 7); x.fill(); }
          for (let q = 0; q < 5; q++) { x.fillStyle = `rgba(120,190,255,${(0.18 + 0.1 * Math.sin(T * 2 + q)).toFixed(3)})`; x.fillRect(cx - 65 + q * 27, B2 - 44, 20, 12); }
          x.fillStyle = '#9fd6ff'; x.font = '600 5px "IBM Plex Mono", monospace'; x.textAlign = 'center'; x.fillText('12°C', cx + 60, B2 - 46); }
        // Ausformen: Form dreht sich, Tafel fällt
        { const ph = ((T * V) % G) / G; const a = ph < 0.5 ? ph * 2 * Math.PI : Math.PI;
          x.save(); x.translate(dem, B2 - 52); x.rotate(a); x.fillStyle = '#c9d2da'; x.fillRect(-12, -3, 24, 6); x.fillStyle = ph < 0.5 ? '#3e1c08' : '#8f9aa6'; x.fillRect(-10.5, -2, 21, 4); x.restore();
          if (ph >= 0.5) { const p = (ph - 0.5) * 2; x.fillStyle = '#3e1c08'; x.fillRect(dem - 10, lerp(B2 - 48, B2 - 24, p), 20, 4); } }
        // Rücklauf: leere Formen zurück zur Giessanlage
        stream(260, 512, B2 - 8, G, V, (mx, my) => { x.globalAlpha = 0.85; mould(mx, my + 1, false); x.globalAlpha = 1; });
        // Tafeln → Verpackung
        stream(160, 206, B2 - 22, 17, -V, (bx, by) => { x.fillStyle = '#3e1c08'; x.fillRect(bx - 8, by - 1, 16, 4); x.strokeStyle = '#2a1205'; x.lineWidth = 0.5; x.beginPath(); for (let q = 1; q < 4; q++) { x.moveTo(bx - 8 + q * 4, by - 1); x.lineTo(bx - 8 + q * 4, by + 3); } x.stroke(); });
        // Verpacken: Folienrolle dreht, Backen schliessen
        { const cx = at('wrap'); const a = T * 5; x.fillStyle = '#d4a017'; x.beginPath(); x.arc(cx + 10, B2 - 84, 7, 0, 7); x.fill(); x.strokeStyle = '#f5d36b'; x.lineWidth = 1; x.beginPath(); x.arc(cx + 10, B2 - 84, 4.5, a, a + 2); x.stroke(); x.fillStyle = '#5a4510'; x.beginPath(); x.arc(cx + 10, B2 - 84, 1.6, 0, 7); x.fill();
          const jaw = Math.abs(Math.sin(T * Math.PI * (V / 17))) * 3; x.fillStyle = '#aab2bb'; x.fillRect(cx - 4, B2 - 44 + jaw, 8, 3); x.fillRect(cx - 4, B2 - 35 - jaw, 8, 3);
          x.fillStyle = '#7dffb0'; x.font = '600 4.4px "IBM Plex Mono", monospace'; x.textAlign = 'center'; x.fillText('480/min', cx - 22, B2 - 39); }
        stream(70, 98, B2 - 22, 14, -V, (bx, by) => { x.fillStyle = '#d4a017'; x.fillRect(bx - 7, by - 1, 14, 4); x.fillStyle = '#7a1f2b'; x.fillRect(bx - 3, by - 1, 6, 4); });
        // Versand: Kartons stapeln sich, volle Palette fährt weg
        { const cx = at('ship'); const per = 1.6; const n = Math.floor(T / per) % 13; for (let q = 0; q < Math.min(n, 12); q++) { const col = q % 3; const row = Math.floor(q / 3); x.fillStyle = '#b48a55'; x.fillRect(cx - 21 + col * 14, B2 - 15 - row * 10, 13, 9); x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(cx - 21 + col * 14, B2 - 11 - row * 10, 13, 1); x.fillStyle = '#7a1f2b'; x.fillRect(cx - 17 + col * 14, B2 - 13 - row * 10, 5, 2); } }
        // Conche: Rührarm, Aroma-Dampf, Laufzeit
        { const cx = at('conche'); const a = T * 1.1;
          x.strokeStyle = '#c3cad2'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx - Math.cos(a) * 40, B2 - 74 - Math.sin(a) * 4); x.lineTo(cx + Math.cos(a) * 40, B2 - 74 + Math.sin(a) * 4); x.stroke();
          for (let q = 0; q < 4; q++) { const p = (T * 0.3 + q / 4) % 1; x.fillStyle = `rgba(200,170,140,${(0.3 * (1 - p)).toFixed(3)})`; x.beginPath(); x.arc(cx - 30 + q * 20 + Math.sin(T + q) * 4, B2 - 82 - p * 22, 2 + p * 6, 0, 7); x.fill(); }
          const h = (T * 0.25) % 12; x.fillStyle = '#7dffb0'; x.font = '600 4.6px "IBM Plex Mono", monospace'; x.textAlign = 'center'; x.fillText(`${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} h`, cx + 40, B2 - 45);
          x.strokeStyle = '#d9b26f'; x.lineWidth = 1; x.beginPath(); x.arc(cx + 40, B2 - 52, 3.5, -Math.PI / 2, -Math.PI / 2 + (h / 12) * Math.PI * 2); x.stroke(); }
        // Temperieren: Temperaturkurve 45 → 27 → 31 °C mit laufendem Punkt
        { const cx = at('temper'); const w = 54; const x0 = cx - w / 2; const y0 = B2 - 80; const ph = (T * 0.12) % 1;
          const tempAt = p => (p < 0.4 ? lerp(45, 27, p / 0.4) : p < 0.6 ? 27 : lerp(27, 31, (p - 0.6) / 0.4));
          const yOf = c => y0 + 22 - ((c - 25) / 22) * 18;
          x.strokeStyle = 'rgba(125,255,176,.35)'; x.lineWidth = 0.8; x.beginPath(); for (let i = 0; i <= 30; i++) { const p = i / 30; const px = x0 + 3 + p * (w - 6); const py = yOf(tempAt(p)); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
          const cur = tempAt(ph); x.fillStyle = '#7dffb0'; x.beginPath(); x.arc(x0 + 3 + ph * (w - 6), yOf(cur), 1.4, 0, 7); x.fill();
          x.font = '600 6px "IBM Plex Mono", monospace'; x.textAlign = 'center'; x.fillText(`${cur.toFixed(1)}°C`, cx, y0 + 31);
          x.fillStyle = '#5a2c10'; for (let q = 0; q < 4; q++) { x.fillRect(640 + ((T * 12 + q * 9) % 36), B2 - 69.5, 3, 2); x.fillRect(520 + ((T * 12 + q * 13) % 52), B2 - 73.5, 3, 2); } }
        // Zähler: Tafeln heute
        const bars = Math.floor((T * V) / G) * 6 + 1200;
        x.fillStyle = 'rgba(14,11,8,.78)'; rrect(x, 652, P.B1 - 146, 140, 20, 4); x.fill(); x.strokeStyle = 'rgba(214,178,112,.35)'; x.lineWidth = 0.6; x.stroke();
        x.fillStyle = '#a3978a'; x.font = '600 5px Inter, sans-serif'; x.textAlign = 'left'; x.fillText('HEUTE PRODUZIERT', 658, P.B1 - 133);
        x.fillStyle = '#f3dcaa'; x.font = '600 9px "IBM Plex Mono", monospace'; x.textAlign = 'right'; x.fillText(`${bars.toLocaleString('de-CH')} Tafeln`, 786, P.B1 - 132);
    }

    // Leinwand der Fabrik einrichten (gleiche Fläche wie das Hallenbild) und die Schleife starten
    function plantLife(HH, show, sp) {
        const host = $('d-world');
        if (!host) return;
        let cv = $('d-life');
        if (!cv) { cv = document.createElement('canvas'); cv.id = 'd-life'; host.parentElement.insertBefore(cv, host); }
        const L = LIFE;
        if (!show) return;
        L.args = null;
        L.mode = 'plant';
        PLINE.sp = sp;
        PLINE.HH = HH;
        PLINE.B1 = HH - 150;
        PLINE.B2 = HH - 22;
        const W = host.offsetWidth;
        const H = host.offsetHeight;
        const f = Math.min(W / 800, H / HH);
        const ox = host.offsetLeft + (W - 800 * f) / 2;
        const oy = host.offsetTop + (H - HH * f) / 2;
        const zq = Math.min(2.5, Math.round(DZ.s * 2) / 2);
        const rect = `p|${ox.toFixed(1)}|${oy.toFixed(1)}|${f.toFixed(4)}|${zq}|${Gfx.level()}|${HH}`;
        if (L.rect !== rect || cv.style.display === 'none') {
            L.rect = rect;
            const dpr = Gfx.low() ? 1 : Math.min(1.5, window.devicePixelRatio || 1) * zq;
            cv.width = Math.round(800 * f * dpr);
            cv.height = Math.round(HH * f * dpr);
            cv.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;width:${800 * f}px;height:${HH * f}px;pointer-events:none;z-index:0;display:block`;
            L.ctx = cv.getContext('2d');
            L.scale = f * dpr;
            // statische Maschinen einmal vorzeichnen
            const st = document.createElement('canvas');
            st.width = cv.width;
            st.height = cv.height;
            const sx = st.getContext('2d');
            sx.setTransform(L.scale, 0, 0, L.scale, 0, 0);
            plantStatic(sx, PLINE);
            PLINE.stat = st;
            deskZoomApply();
        }
        L.on = true;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) { plantFrame(L.ctx); return; }
        if (!L.raf) L.raf = requestAnimationFrame(lifeLoop);
    }
    function plantFrame(x) {
        const L = LIFE;
        const y0 = Math.floor((PLINE.HH - 300) * L.scale);
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, y0, x.canvas.width, x.canvas.height - y0);
        if (PLINE.stat) x.drawImage(PLINE.stat, 0, y0, x.canvas.width, x.canvas.height - y0, 0, y0, x.canvas.width, x.canvas.height - y0);
        x.setTransform(L.scale, 0, 0, L.scale, 0, 0);
        plantDyn(x, PLINE, PLINE.T);
    }

    // Hover-Karte für eine Station
    function stationTip(ev, el) {
        const tip = $('d-tip');
        const s = PST[Number(el.dataset.st)];
        if (!tip || !s) return;
        const key = `st|${el.dataset.st}`;
        if (tip.dataset.k !== key) {
            tip.dataset.k = key;
            const H = holdings();
            const extra = s.k === 'clean' ? `<div class="dt-r ${H.open ? 'open' : ''}">Dein Rohkakao: ${H.contract + H.futIn} t gesichert · ${H.open} t noch offen</div>` : s.k === 'ship' ? `<div class="dt-m">Marge pro Tonne: ${fmt(CFG.chocMargin * (me.marginMult || 1))} CHF</div>` : '';
            tip.innerHTML = `<div class="dt-h"><b>${PST.indexOf(s) + 1} · ${esc(s.name)}</b><span class="dt-st fut">${s.row ? 'Tafel' : 'Masse'}</span></div>
                <div class="dt-t" style="font-size:13px">${esc(s.p)}</div>
                <div class="dt-l">${esc(s.txt)}</div>${extra}`;
        }
        const pan = tip.parentElement.getBoundingClientRect();
        tip.classList.add('on');
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        let x = ev.clientX - pan.left + 16;
        let y = ev.clientY - pan.top - th - 12;
        if (x + tw > pan.width - 8) x = ev.clientX - pan.left - tw - 16;
        if (y < 6) y = ev.clientY - pan.top + 14;
        tip.style.transform = `translate(${Math.max(6, Math.min(x, pan.width - tw - 6))}px, ${Math.max(6, Math.min(y, pan.height - th - 6))}px)`;
    }

    // SVG-Ebene über der Linie: Schritt-Nummern, Namen, Flächen für die Maus
    function plantLineSVG(HH) {
        const B = [HH - 150, HH - 22];
        const items = PST.map((s, i) => {
            const w = PW[s.k];
            const yb = B[s.row];
            const h = s.row ? 100 : 118;
            return `<g class="pst" data-st="${i}"><rect class="pst-hit" x="${s.x - w / 2 - 4}" y="${yb - h}" width="${w + 8}" height="${h + 6}" rx="6"/>
                <g transform="translate(${s.x} ${yb + 9})"><circle r="5.4" class="pst-n"/><text y="2" text-anchor="middle" class="pst-nt">${i + 1}</text><text x="8" y="2.4" class="pst-t">${esc(s.name)}</text></g></g>`;
        }).join('');
        return `<text x="40" y="${HH - 284}" class="p-wall-t pst-head">SCHOKOLADEN-PRODUKTION · VON DER BOHNE ZUR TAFEL</text>
            ${items}`;
    }

    function deskLife(LAY, VH, show) {
        const host = $('d-world');
        if (!host) return;
        let cv = $('d-life');
        if (!cv) {
            cv = document.createElement('canvas');
            cv.id = 'd-life';
            host.parentElement.insertBefore(cv, host);
        }
        const L = LIFE;
        L.args = [LAY, VH, show];
        if (show && L.mode !== 'farm') { L.mode = 'farm'; L.rect = ''; }
        if (!show || !LAY || typeof RenderCore === 'undefined') {
            if (cv.style.display !== 'none') cv.style.display = 'none';
            L.on = false;
            return;
        }
        // Gleiche Fläche wie das Bild (object-fit: contain)
        const W = host.offsetWidth;
        const H = host.offsetHeight;
        const f = Math.min(W / 800, H / VH);
        const ox = host.offsetLeft + (W - 800 * f) / 2;
        const oy = host.offsetTop + (H - VH * f) / 2;
        const zq = Math.min(2.5, Math.round(DZ.s * 2) / 2);
        const gq = Gfx.level();
        const rect = `${ox.toFixed(1)}|${oy.toFixed(1)}|${f.toFixed(4)}|${zq}|${gq}`;
        if (L.rect !== rect || cv.style.display === 'none') {
            L.rect = rect;
            const dpr = Gfx.low() ? 1 : Math.min(1.5, window.devicePixelRatio || 1) * zq;
            cv.width = Math.round(800 * f * dpr);
            cv.height = Math.round(VH * f * dpr);
            cv.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;width:${800 * f}px;height:${VH * f}px;pointer-events:none;z-index:0;display:block`;
            L.ctx = cv.getContext('2d');
            L.scale = f * dpr;
            deskZoomApply();
        }
        const key = `${VH}|${LAY.villages.length}|${me.sky || 'sun'}`;
        if (L.key !== key) { L.key = key; lifeSetup(LAY, VH); }
        L.on = true;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) { lifeDraw(L.ctx); return; }
        if (!L.raf) L.raf = requestAnimationFrame(lifeLoop);
    }

    // Gerechnetes Bild als Leinwand hinter der Status-Ebene (gleiche Position wie #d-world)
    function deskBg(bmp) {
        const host = $('d-world');
        if (!host) return;
        let cv = $('d-bg');
        if (!cv) {
            cv = document.createElement('canvas');
            cv.id = 'd-bg';
            host.parentElement.insertBefore(cv, host);
        }
        const css = `position:absolute;left:${host.offsetLeft}px;top:${host.offsetTop}px;width:${host.offsetWidth}px;height:${host.offsetHeight}px;object-fit:contain;pointer-events:none;z-index:0;display:${bmp ? 'block' : 'none'}`;
        if (cv._css !== css) { cv._css = css; cv.style.cssText = css; deskZoomApply(); }
        if (bmp && cv._bmp !== bmp) {
            if (!cv._bmp && cv.animate) cv.animate([{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 700, easing: 'cubic-bezier(.2,.7,.2,1)' });
            cv.width = bmp.width;
            cv.height = bmp.height;
            cv.getContext('2d').drawImage(bmp, 0, 0);
            cv._bmp = bmp;
        }
    }

    // Massstab: Je mehr Tonnen, desto mehr Tonnen pro Dorf/Silo – so passt immer alles aufs Bild.
    const deskUnit = (total, max) => [10, 20, 25, 50, 100, 200, 500].find(u => Math.ceil(total / u) <= max) || 1000;
    // Seitenverhältnis des Kartenfelds (Höhe/Breite), damit die Grafik den Platz ganz ausfüllt
    function deskAspect() {
        const el = $('d-world');
        const r = el && el.getBoundingClientRect();
        if (!r || !r.width || !r.height) return 0.5;
        return clamp(r.height / r.width, 0.42, 1.25);
    }
    // Alle y-Koordinaten eines Pfads (absolute Koordinatenpaare) strecken
    const sy = (d, k) => { let i = 0; return d.replace(/-?\d+(\.\d+)?/g, m => (i++ % 2 ? (Number(m) * k).toFixed(1) : m)); };

    // Kooperative: Region mit den Dörfern der Mitglieder – detaillierte Landkarte
    // Dorf-Plätze (x 0..800, y 0..400) – werden auf die Kartenhöhe gestreckt
    const VILLAGES = [[150, 110], [270, 85], [390, 125], [510, 92], [625, 135], [200, 205], [325, 230], [455, 200], [575, 238], [690, 210], [130, 300], [255, 322], [395, 312], [525, 330], [650, 305], [740, 115], [80, 200], [740, 300], [460, 40], [180, 40], [600, 30], [330, 370], [90, 375], [560, 380]];
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
            <path d="M-11 0 L0 -10 L11 0 Z" fill="url(#${i % 3 === 1 ? 'texTinRust' : 'texTin'})"/><path d="M0 -10 L11 0 L0 0 Z" fill="rgba(0,0,0,.32)"/><path d="M-11 0 L0 -10 L11 0 Z" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".5"/>
            <path d="M-11 0 L0 -10 L11 0" fill="none" stroke="rgba(255,230,180,.35)" stroke-width=".8"/></g>`;
    }
    function tilesFor(H, prod, max) {
        const total = H.contract + H.futIn + H.open + (prod ? H.lost : H.cut);
        const unit = deskUnit(total, max);
        const tiles = [];
        const push = (t, k) => { for (let i = 0; i < Math.round(t / unit); i++) tiles.push(k); };
        push(H.contract, 'deal');
        push(H.futIn, 'fut');
        push(H.open, 'open');
        push(prod ? H.lost : H.cut, prod ? 'lost' : 'cut');
        return { unit, tiles: tiles.slice(0, max) };
    }
    let deskUnitNow = 10;

    // Landschaft der Kooperative: Fluss, Strasse, Felder und Dörfer so anordnen, dass alles seinen Platz hat –
    // kein Dorf auf Fluss, Strasse oder Feld, keine Felder über Wasser oder Weg, Abstand zu den Kartenbeschriftungen.
    const FIELDS_BASE = [[90, 40, 150, 70, -12], [330, 30, 170, 60, 8], [560, 50, 160, 70, -6], [60, 170, 120, 90, 15], [420, 150, 140, 70, -18], [690, 160, 100, 90, 10], [160, 360, 200, 40, 4], [470, 270, 130, 50, -10], [250, 120, 90, 50, 22], [600, 330, 120, 50, -14], [120, 300, 110, 50, 6], [520, 420, 150, 60, -8]];
    const layoutCache = new Map();
    function farmLayout(VH, n) {
        const key = `${VH}|${n}`;
        if (layoutCache.has(key)) return layoutCache.get(key);
        const k = VH / 400;
        const river = sy('M0 260 C 120 230, 200 300, 320 270 S 520 200, 640 260 S 760 330, 800 300', k);
        const road = sy('M40 380 C 200 350, 420 360, 560 370 S 740 390, 790 360', k);
        const samp = typeof RenderCore !== 'undefined' && RenderCore.samplePath ? RenderCore.samplePath : () => [];
        const rp = samp(river, 5);
        const qp = samp(road, 5);
        const dist = (pts, x, y) => { let b = 1e12; for (const [px, py] of pts) { const d = (px - x) ** 2 + (py - y) ** 2; if (d < b) b = d; } return Math.sqrt(b); };
        const ptsOf = ([fx, fy, fw, fh, fr]) => {
            const a = (fr * Math.PI) / 180;
            const cx = fx + fw / 2;
            const cy = fy + fh / 2;
            const out = [];
            for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) for (const v of [-0.5, 0, 0.5]) out.push([cx + u * fw * Math.cos(a) - v * fh * Math.sin(a), cy + u * fw * Math.sin(a) + v * fh * Math.cos(a)]);
            return out;
        };
        const fields = FIELDS_BASE.map(([fx, fy, fw, fh, fr]) => [fx, fy * k, fw, fh * Math.min(k, 1.4), fr])
            .filter(f => f[1] + f[3] < VH - 20 && ptsOf(f).every(([x, y]) => dist(rp, x, y) > 18 && dist(qp, x, y) > 13 && x > 22 && x < 790));
        const inField = (x, y, pad) => fields.some(([fx, fy, fw, fh, fr]) => {
            const a = (-fr * Math.PI) / 180;
            const dx = x - (fx + fw / 2);
            const dy = y - (fy + fh / 2);
            return Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) < fw / 2 + pad && Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) < fh / 2 + pad;
        });
        const free = ([x, y]) => y > 48 && y < VH - 58 && x > 60 && x < 742
            && dist(rp, x, y) > 48 && dist(qp, x, y) > 42 && !inField(x, y, 30)
            && !(x > 660 && y < 120) && !(x < 170 && y > VH - 80) && !(x > 670 && Math.abs(y - 360 * k) < 55);
        const cands = [];
        for (let y = 50; y <= VH - 50; y += 18) for (let x = 60; x <= 740; x += 20) {
            const c = [x + (rnd(x * 7 + y) - 0.5) * 14, y + (rnd(x + y * 3) - 0.5) * 10];
            if (free(c)) cands.push(c);
        }
        // Gleichmässig verteilen: immer den Platz wählen, der am weitesten von den bisherigen Dörfern weg ist
        const villages = [];
        const gap = ([x, y]) => villages.reduce((m, [vx, vy]) => Math.min(m, Math.hypot(x - vx, (y - vy) * 1.45)), 1e9);
        if (cands.length) villages.push(cands.reduce((b, c) => (Math.hypot(c[0] - 400, c[1] - VH / 2) < Math.hypot(b[0] - 400, b[1] - VH / 2) ? c : b)));
        while (villages.length < n && cands.length) {
            let best = null;
            let bg = -1;
            for (const c of cands) { const g = gap(c); if (g > bg) { bg = g; best = c; } }
            if (!best || bg < 70) break;
            villages.push(best);
        }
        const out = { river, road, fields, villages };
        layoutCache.set(key, out);
        return out;
    }

    function farmSVG() {
        const H = holdings();
        const VH = Math.round((800 * deskAspect()) / 40) * 40; // in Stufen, damit kleine Grössenänderungen kein neues Bild auslösen
        const k = VH / 400;
        const LAY = farmLayout(VH, 24);
        const { unit, tiles } = tilesFor(H, true, Math.max(4, LAY.villages.length));
        deskUnitNow = unit;
        const smuggle = me.decision && me.decision.kind === 'smuggle';
        const partners = [];
        ((me.deals && me.deals.signed) || []).forEach(d => { for (let t = 0; t < d.t; t += unit) partners.push(`Vertrag mit ${d.with} zu ${fmt(d.price)} CHF/t`); });
        const tip = (kk, i) => (kk === 'deal' ? partners[i] || 'Per Vertrag verkauft' : kk === 'fut' ? 'Mit Futures abgesichert – der Preis ist fix' : kk === 'lost' ? 'An Schmuggler verloren' : 'Offen – hängt am Preis im Dezember');
        const badge = { deal: ['📜', 'Vertrag'], fut: ['🔒', 'Future'], lost: ['🚚', 'weg'], open: ['○', 'offen'] };
        // Bei vielen Dörfern werden sie etwas kleiner
        const vs = tiles.length > 16 ? 0.82 : 1;
        // Plätze für so viele Dörfer, wie es braucht – in Lese-Reihenfolge (oben links → unten rechts)
        const occupied = LAY.villages.slice(0, tiles.length).sort((a, b) => (Math.round(a[1] / 90) - Math.round(b[1] / 90)) || a[0] - b[0]);
        const { river, road } = LAY;
        const FIELDS = LAY.fields;
        // Gerechnetes Luftbild (hohe Auflösung) – bis es fertig ist, zeigt die Vektorgrafik die Karte
        const pxW = Gfx.low() ? Math.min(1200, Math.ceil(((($('d-world') && $('d-world').offsetWidth) || 800) * 1.25) / 400) * 400) : Math.min(2560, Math.ceil(((($('d-world') && $('d-world').offsetWidth) || 800) * HQ() * 2) / 400) * 400); // hoch: doppelte Reserve fürs Hineinzoomen
        // Erst ein schnelles Vorschaubild (halbe Auflösung), danach das scharfe – so ist sofort etwas zu sehen
        // Alle Dorfplätze kommen ins Bild (auch Nachbardörfer) – so ändert es sich nicht, wenn sich die Tonnen ändern
        const LDATA = { VH, villages: LAY.villages, sky: me.sky, river, road, fields: FIELDS };
        const img = typeof Render !== 'undefined' ? Render.farm(`farm|${VH}|${Math.max(800, pxW)}|${me.sky || 'sun'}`, LDATA, Math.max(800, pxW), deskRedraw) : null;
        deskBg(img);
        deskLife(LAY, VH, !!img);
        if (!img) return deskLoader(true);
        DINFO = [];
        DPOS = occupied.map(([x, y]) => [x, y]);
        DVB = `0 0 800 ${VH}`;
        const villages = tiles.slice(0, occupied.length).map((kk, i) => {
            const [x, y] = occupied[i];
            const trees = Array.from({ length: 7 }, (_, j) => {
                const a = rnd(i * 13 + j) * Math.PI * 2;
                const r = 34 + rnd(i * 7 + j * 3) * 14;
                return cocoaTree(Math.cos(a) * r, Math.sin(a) * r * 0.55 + 8, 0.75 + rnd(i + j * 5) * 0.4, i + j);
            }).join('');
            const [ico, lbl] = badge[kk];
            const vr = RenderCore.rng(900 + i);
            DINFO[i] = {
                name: villageName(i), kk, t: unit,
                what: tip(kk, i),
                fam: Math.round(18 + vr() * 70),
                trees: Math.round((unit * 2000) / 1000) * 1000,
                risk: kk === 'open' ? `Fällt Kakao um 100 CHF/t, fehlen dir hier ${fmt(unit * 100)} CHF.` : kk === 'lost' ? 'Diese Ernte ist weg – sie zählt nicht mehr.' : 'Preis ist fix – egal, was der Markt macht.',
            };
            return `<g class="vil ${kk}${DSEL.has(i) ? ' sel' : ''}" data-i="${i}" transform="translate(${x} ${y.toFixed(1)}) scale(${vs})" style="animation-delay:${i * 0.04}s">
                ${img ? '<ellipse class="vil-hit" rx="44" ry="28"/><ellipse class="vil-ring" rx="44" ry="28"/>' : `<ellipse class="vil-ground" rx="40" ry="17" cy="10"/><ellipse class="vil-ring" rx="40" ry="17" cy="10"/>
                <ellipse rx="27" ry="10" cy="9" fill="#a8865a" opacity=".55"/>
                <g class="dry-mat"><rect x="-26" y="10" width="14" height="6" rx="1" fill="#6b3d1e"/><rect x="-25" y="11" width="12" height="4" fill="url(#dBeans)"/></g>
                ${trees}
                ${hut(-12, 4, 1, i)}${hut(6, -2, 1.15, i + 1)}${hut(18, 8, 0.85, i + 2)}`}
                ${kk !== 'lost' && !img ? `<g class="hut-smoke"><circle cx="8" cy="-16" r="3"/><circle cx="11" cy="-25" r="4"/></g>` : ''}
                ${kk === 'lost' ? '<path class="vil-x" d="M-18 -12 L18 18 M18 -12 L-18 18"/>' : ''}
                <g class="vil-tag" transform="translate(0 40)"><rect x="-38" y="-10" width="76" height="19" rx="9.5"/><text y="4" text-anchor="middle">${ico} ${lbl} · ${unit} t</text></g>${img ? `<text class="vil-name" y="-34" text-anchor="middle">${esc(villageName(i))}</text>` : ''}</g>`;
        }).join('');
        // Felder (Kakao-Reihen) und Waldstücke als Hintergrund (nur ohne gerechnetes Bild)
        const fields = FIELDS
            .map(([x, y, w, h, r], i) => `<g transform="rotate(${r} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y.toFixed(1)}" width="${w}" height="${h.toFixed(1)}" rx="4" fill="url(#texSoil)"/><rect x="${x}" y="${y.toFixed(1)}" width="${w}" height="${h.toFixed(1)}" rx="4" fill="url(#${i % 2 ? 'dRows' : 'dRows2'})"/></g>`).join('');
        const forest = Array.from({ length: Math.round(60 * k) }, (_, i) => {
            const x = rnd(i * 3.1) * 800;
            const y = rnd(i * 5.7 + 2) * VH;
            if (occupied.some(([vx, vy]) => Math.hypot(vx - x, (vy - y) * 1.6) < 70)) return '';
            const r = 6 + rnd(i) * 9;
            return `<circle cx="${(x + r * 0.35).toFixed(0)}" cy="${(y + r * 0.35).toFixed(0)}" r="${r.toFixed(1)}" fill="rgba(0,0,0,.35)"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="url(#dForest)"/><circle cx="${(x - r * 0.3).toFixed(0)}" cy="${(y - r * 0.3).toFixed(0)}" r="${(r * 0.45).toFixed(1)}" fill="rgba(170,230,120,.18)"/>`;
        }).join('');
        const contours = Array.from({ length: Math.round(4 * k) + 2 }, (_, i) => `<path d="${sy(`M-20 ${60 + i * 18} C 180 ${20 + i * 22}, 380 ${110 + i * 12}, 560 ${50 + i * 20} S 760 ${10 + i * 24}, 820 ${40 + i * 18}`, k)}" class="contour"/>`).join('');
        const nT = Math.floor(VH / 50);
        const ticks = Array.from({ length: 17 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="${i % 2 ? 4 : 8}"/><line x1="${i * 50}" y1="${VH}" x2="${i * 50}" y2="${VH - (i % 2 ? 4 : 8)}"/>`).join('')
            + Array.from({ length: nT + 1 }, (_, i) => `<line x1="0" y1="${i * 50}" x2="${i % 2 ? 4 : 8}" y2="${i * 50}"/><line x1="800" y1="${i * 50}" x2="${i % 2 ? 796 : 792}" y2="${i * 50}"/>`).join('');
        return `<svg viewBox="0 0 800 ${VH}" class="d-svg farm-map ${img ? 'rendered' : ''}" preserveAspectRatio="xMidYMid meet">
            <defs><radialGradient id="dfl" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#3a7a32"/><stop offset=".6" stop-color="#25562a"/><stop offset="1" stop-color="#132c16"/></radialGradient>
            <pattern id="dft" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="5" cy="6" r="2.2" fill="rgba(110,190,90,.22)"/><circle cx="16" cy="15" r="3" fill="rgba(40,100,40,.3)"/><circle cx="17" cy="4" r="1" fill="rgba(200,230,150,.18)"/></pattern>
            <pattern id="dRows" width="12" height="10" patternUnits="userSpaceOnUse"><circle cx="7" cy="6" r="3.6" fill="rgba(20,14,6,.45)"/><circle cx="6" cy="5" r="3.5" fill="#3f8a36"/><circle cx="7.4" cy="5.6" r="1.6" fill="#2e6e28"/><circle cx="4.8" cy="3.8" r="1.4" fill="rgba(200,240,150,.25)"/></pattern>
            <pattern id="dRows2" width="10" height="9" patternUnits="userSpaceOnUse"><circle cx="5.9" cy="5.4" r="3.2" fill="rgba(20,14,6,.45)"/><circle cx="5" cy="4.5" r="3.1" fill="#4c8d33"/><circle cx="6.2" cy="5.1" r="1.4" fill="#3a7428"/><circle cx="4" cy="3.5" r="1.2" fill="rgba(200,240,150,.25)"/></pattern>
            <radialGradient id="dForest" cx="40%" cy="35%"><stop offset="0" stop-color="#3f8f3a"/><stop offset="1" stop-color="#173d18"/></radialGradient>
            <radialGradient id="dTreeG" cx="35%" cy="30%"><stop offset="0" stop-color="#5cc04d"/><stop offset="1" stop-color="#1f5a20"/></radialGradient>
            <pattern id="dBeans" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#8a4b22"/><circle cx="1.5" cy="1.5" r="1" fill="#b46a32"/></pattern>
            <linearGradient id="dRiver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4ff"/><stop offset="1" stop-color="#2f6fb8"/></linearGradient>
            <radialGradient id="dVig" cx="50%" cy="50%" r="72%"><stop offset=".6" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(0,0,0,.45)"/></radialGradient></defs>
            ${img ? '' : `<rect width="800" height="${VH}" fill="url(#texTerrain)"/><rect width="800" height="${VH}" fill="url(#dfl)" opacity=".22"/>
            ${contours}${fields}${forest}
            <path d="${river}" class="river-bank"/><path d="${river}" class="river"/><path d="${river}" class="river-flow"/>
            <path d="${road}" class="road"/><path d="${road}" class="road-mid"/>`}
            <line x1="12" y1="0" x2="12" y2="${VH}" class="border"/><text x="22" y="22" class="border-t">GRENZE ←</text>
            <g class="port" transform="translate(735 ${(360 * k).toFixed(1)})"><rect x="-30" y="-15" width="60" height="26" rx="5"/><text y="4" text-anchor="middle">⚓ Hafen</text></g>
            ${smuggle ? `<g class="trucks"><text class="truck t1" x="560" y="${368 * k}">🚚</text><text class="truck t2" x="420" y="${362 * k}">🚚</text><path d="${sy('M560 360 C 400 300, 200 330, 14 300', k)}" class="smug-path"/></g>` : ''}
            ${img ? '' : `<g class="cloud-shadows"><ellipse cx="0" cy="${120 * k}" rx="140" ry="40"/><ellipse cx="-300" cy="${290 * k}" rx="180" ry="50"/></g>`}
            ${villages}
            ${img ? '' : `<g class="d-bird"><path d="M0 0 q6 -6 12 0 q6 -6 12 0"/></g><g class="d-bird b2"><path d="M0 0 q5 -5 10 0 q5 -5 10 0"/></g>`}
            ${img ? '' : `<rect width="800" height="${VH}" fill="url(#dVig)" pointer-events="none"/>`}
            <g class="map-ticks">${ticks}</g>
            <g class="compass" transform="translate(760 70)"><circle r="20"/><path d="M0 -17 L5 0 L0 17 L-5 0Z" class="cn"/><path d="M0 -17 L5 0 L-5 0Z" class="cn-n"/><text y="-23" text-anchor="middle">N</text></g>
            <g class="scalebar" transform="translate(30 ${VH - 30})"><rect width="100" height="5" fill="#e7f5df"/><rect width="50" height="5" fill="#25562a"/><rect width="100" height="5" fill="none" stroke="#e7f5df"/><text x="0" y="18">0</text><text x="100" y="18" text-anchor="end">10 km</text></g>
            <text x="740" y="26" text-anchor="end" class="reg-t">📍 ${me.region ? esc(REGIONS[me.region].name) : ''}</text>
        </svg>`;
    }

    // Fabrik: Silo-Halle, Rohrleitungen und Produktionslinie – passt sich dem Platz an
    function plantSVG() {
        const H = holdings();
        const { unit, tiles } = tilesFor(H, false, 30);
        deskUnitNow = unit;
        const sPartners = [];
        ((me.deals && me.deals.signed) || []).forEach(d => { for (let t = 0; t < d.t; t += unit) sPartners.push(`Vertrag mit ${d.with} zu ${fmt(d.price)} CHF/t`); });
        const n = Math.max(1, tiles.length);
        const ar = deskAspect();
        const w = 64;
        const gap = 10;
        // Beste Anordnung suchen: so gross wie möglich, Halle füllt das Feld
        let best = null;
        for (let per = 3; per <= Math.min(12, Math.max(3, n)); per++) {
            const rows = Math.ceil(n / per);
            const s = Math.min(1.7, 720 / (per * (w + gap)));
            const hNeed = 50 + rows * 150 * s + 350;
            const sFit = Math.min(s, s * ((800 * ar) / hNeed));
            if (!best || sFit > best.s) best = { per, rows, s: sFit };
        }
        const { per, rows, s } = best;
        const x0 = 400 - (Math.min(per, n) * (w + gap) - gap) * s / 2;
        const rowH = 150 * s;
        const top = 50;
        const ly = top + rows * rowH;
        const HH = Math.ceil(Math.max(800 * ar, ly + 340) / 40) * 40;
        const by = HH - 300; // Wand bis hier, darunter der Hallenboden mit der Produktion
        const pipeY = Math.min(ly + 4, by - 6);
        const cx = i => x0 + (i % per) * (w + gap) * s + (w / 2) * s;
        const lastRow = tiles.map((_, i) => i).filter(i => Math.floor(i / per) === rows - 1);
        const xa = cx(lastRow[0] || 0);
        const xb = cx(lastRow[lastRow.length - 1] || 0);
        const pxW = Gfx.low() ? Math.min(1200, Math.ceil(((($('d-world') && $('d-world').offsetWidth) || 800) * 1.25) / 400) * 400) : Math.min(2560, Math.ceil(((($('d-world') && $('d-world').offsetWidth) || 800) * HQ() * 2) / 400) * 400); // hoch: doppelte Reserve fürs Hineinzoomen
        // Erst ein schnelles Vorschaubild (halbe Auflösung), danach das scharfe – so ist sofort etwas zu sehen
        const LDATA = {
            HH, by, pipeY, xa, xb, v2: true, inX: 70, inY: HH - 248,
            silos: tiles.map((kk, i) => ({ x: x0 + (i % per) * (w + gap) * s, y: top + Math.floor(i / per) * rowH, s, kind: 'n', i })),
            drops: lastRow.map(i => [cx(i), top + (rows - 1) * rowH + 122 * s]),
        };
        const img = typeof Render !== 'undefined' ? Render.plant(`plant|${HH}|${per}|${s.toFixed(3)}|${tiles.length}|${Math.max(800, pxW)}`, LDATA, Math.max(800, pxW), deskRedraw) : null;
        deskBg(img);
        if (!img) { deskLife(null, 0, false); return deskLoader(false); }
        const secured = tiles.filter(k => k === 'deal' || k === 'fut').length / Math.max(1, tiles.length);
        plantLife(HH, true, 0.55 + 0.45 * secured);
        DINFO = [];
        DPOS = [];
        DVB = `0 0 800 ${HH}`;
        const silos = tiles.map((kk, i) => {
            const x = x0 + (i % per) * (w + gap) * s;
            const y = top + Math.floor(i / per) * rowH;
            const fill = kk === 'deal' || kk === 'fut' ? 86 : 0;
            const fillId = kk === 'deal' ? 'pFillD' : 'pFillF';
            const gauge = Array.from({ length: 9 }, (_, j) => `<line x1="-5" x2="${j % 2 ? -2 : -7}" y1="${12 + j * 10}" y2="${12 + j * 10}"/>`).join('');
            const ladder = Array.from({ length: 9 }, (_, j) => `<line x1="${w + 2}" x2="${w + 8}" y1="${10 + j * 10}" y2="${10 + j * 10}"/>`).join('');
            const tipS = `${unit} t · ${kk === 'deal' ? (sPartners[i] || 'Per Vertrag gekauft') : kk === 'fut' ? 'Mit Futures abgesichert – Einkaufspreis fix' : kk === 'cut' ? 'Gestrichen – durch deinen Krisen-Entscheid' : 'Offen – Preis im Dezember unbekannt'}`;
            if (img) {
                DPOS[i] = [x + (w / 2) * s, y + 40 * s];
                DINFO[i] = {
                    name: `Silo S-${String(i + 1).padStart(2, '0')}`, kk, t: unit,
                    what: tipS.replace(/^\d+ t · /, ''),
                    bars: unit * 20000,
                    risk: kk === 'open' ? `Steigt Kakao um 100 CHF/t, zahlst du hier ${fmt(unit * 100)} CHF mehr.` : kk === 'cut' ? 'Gestrichen – wird nicht mehr gebraucht.' : 'Einkaufspreis fix – egal, was der Markt macht.',
                };
                return `<g class="silo r ${kk}${DSEL.has(i) ? ' sel' : ''}" data-i="${i}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})">
                    <rect class="s-hit" x="-4" y="-12" width="${w + 16}" height="140"/>
                    ${kk === 'deal' || kk === 'fut' ? `<rect x="${(w * 0.62).toFixed(1)}" y="12" width="6" height="80" fill="url(#beanFill)"/><rect x="${(w * 0.62 + 0.6).toFixed(1)}" y="13" width="1" height="78" fill="rgba(255,255,255,.28)"/><rect x="0" y="52" width="${w}" height="9" fill="url(#${kk === 'deal' ? 'bandD' : 'bandF'})"/>` : ''}
                    <text x="${w / 2}" y="88.5" text-anchor="middle" class="s-id">S-${String(i + 1).padStart(2, '0')}</text>
                    <circle cx="${w - 9}" cy="12" r="3" class="s-led ${kk}"/>
                    ${kk === 'cut' ? `<path class="vil-x" d="M8 10 L${w - 8} 92 M${w - 8} 10 L8 92"/>` : ''}
                    <text x="${w / 2}" y="${140}" text-anchor="middle" class="s-t">${kk === 'deal' ? '📜 Vertrag' : kk === 'fut' ? '🔒 Future' : kk === 'cut' ? 'gestrichen' : 'offen'}</text></g>`;
            }
            return `<g class="silo ${kk}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})" style="animation-delay:${i * 0.03}s"><title>${tipS}</title>
                <ellipse cx="${w / 2 + 4}" cy="124" rx="${w / 2 + 6}" ry="6" fill="rgba(0,0,0,.4)"/>
                <path d="M8 100 L4 122 M${w - 8} 100 L${w - 4} 122 M${w / 2} 104 L${w / 2} 122" class="s-legs"/>
                <path d="M0 96 L${w / 2 - 8} 112 L${w / 2 + 8} 112 L${w} 96 Z" fill="url(#pMetal)" stroke="#5b6576"/>
                <rect class="s-body" width="${w}" height="100" rx="10" fill="url(#pMetal)"/>
                <rect width="${w}" height="100" rx="10" fill="url(#texMetal)" opacity=".3" style="mix-blend-mode:overlay" pointer-events="none"/>
                <g transform="translate(${-((i * 53) % 160)} ${-((i * 37) % 160)})"><rect x="${(i * 53) % 160}" y="${(i * 37) % 160}" width="${w}" height="100" rx="10" fill="url(#texRust)" opacity="${kk === 'open' ? 0.55 : 0.28}" pointer-events="none"/></g>
                <rect x="${w * 0.36}" y="6" width="1.6" height="88" fill="rgba(255,255,255,.4)" pointer-events="none"/>
                ${fill ? `<rect class="s-fill" x="4" y="${96 - fill}" width="${w - 8}" height="${fill}" rx="6" fill="url(#${fillId})"/><path class="s-wave" d="M4 ${96 - fill + 3} q${(w - 8) / 4} -6 ${(w - 8) / 2} 0 t${(w - 8) / 2} 0 v6 h-${w - 8}z"/>` : ''}
                <rect x="4" y="8" width="${w - 8}" height="88" rx="6" fill="url(#pGlass)" pointer-events="none"/>
                <line x1="0" x2="${w}" y1="34" y2="34" class="s-band"/><line x1="0" x2="${w}" y1="68" y2="68" class="s-band"/>
                ${[8, 20, 32, 44, 56].map(rx => `<circle cx="${rx}" cy="34" r="1.2" class="s-rivet"/><circle cx="${rx}" cy="68" r="1.2" class="s-rivet"/>`).join('')}
                <g class="s-gauge">${gauge}</g><g class="s-ladder"><line x1="${w + 2}" x2="${w + 2}" y1="4" y2="98"/><line x1="${w + 8}" x2="${w + 8}" y1="4" y2="98"/>${ladder}</g>
                <ellipse class="s-top" cx="${w / 2}" cy="2" rx="${w / 2}" ry="8"/><ellipse cx="${w / 2}" cy="0" rx="10" ry="3" fill="#56627a"/>
                <rect x="${w / 2 - 15}" y="80" width="30" height="11" rx="2" class="s-plate"/><text x="${w / 2}" y="88.5" text-anchor="middle" class="s-id">S-${String(i + 1).padStart(2, '0')}</text>
                <circle cx="${w - 9}" cy="12" r="3" class="s-led ${kk}"/>
                ${kk === 'cut' ? `<path class="vil-x" d="M8 10 L${w - 8} 92 M${w - 8} 10 L8 92"/>` : ''}
                <text x="${w / 2}" y="${140}" text-anchor="middle" class="s-t">${kk === 'deal' ? '📜 Vertrag' : kk === 'fut' ? '🔒 Future' : kk === 'cut' ? 'gestrichen' : 'offen'}</text></g>`;
        }).join('');
        const mm = Math.round((me.marginMult || 1) * 100);
        const drops = lastRow.map(i => `<path d="M${cx(i).toFixed(1)} ${(top + (rows - 1) * rowH + 122 * s).toFixed(1)} V${pipeY}" class="pipe-v"/>`).join('');
        const lights = [120, 300, 500, 680].map(x => `<g><rect x="${x - 30}" y="0" width="60" height="5" fill="#2a3240"/><ellipse cx="${x}" cy="6" rx="36" ry="4" fill="rgba(255,230,170,.75)"/><path d="M${x - 36} 6 L${x - 110} ${HH} L${x + 110} ${HH} L${x + 36} 6Z" fill="url(#pBeam)"/></g>`).join('');
        // Wandbeschriftung und Lüftungsgitter für mehr Tiefe
        const vents = [60, 740].map(x => `<g transform="translate(${x - 26} ${Math.max(20, top - 36)})"><rect width="52" height="22" rx="3" fill="#0d1117" stroke="#2a3240"/>${[0, 1, 2, 3].map(j => `<rect x="5" y="${4 + j * 4.2}" width="42" height="2" fill="#2a3240"/>`).join('')}</g>`).join('');
        return `<svg viewBox="0 0 800 ${HH}" class="d-svg plant-map ${img ? 'rendered' : ''}" preserveAspectRatio="xMidYMid meet">
            <defs><linearGradient id="pMetal" x1="0" x2="1"><stop offset="0" stop-color="#2a313c"/><stop offset=".25" stop-color="#4b5566"/><stop offset=".45" stop-color="#6b778a"/><stop offset=".7" stop-color="#3a4250"/><stop offset="1" stop-color="#232933"/></linearGradient>
            <linearGradient id="pGlass" x1="0" x2="1"><stop offset="0" stop-color="rgba(255,255,255,0)"/><stop offset=".2" stop-color="rgba(255,255,255,.16)"/><stop offset=".3" stop-color="rgba(255,255,255,0)"/></linearGradient>
            <linearGradient id="pFillF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf6b"/><stop offset=".15" stop-color="#d98a2b"/><stop offset="1" stop-color="#6b3a12"/></linearGradient>
            <linearGradient id="pFillD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc8ff"/><stop offset=".15" stop-color="#3b82f6"/><stop offset="1" stop-color="#1b3f86"/></linearGradient>
            <linearGradient id="pWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10151d"/><stop offset=".7" stop-color="#1a212c"/><stop offset="1" stop-color="#0c1016"/></linearGradient>
            <linearGradient id="pBeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,230,170,.10)"/><stop offset="1" stop-color="rgba(255,230,170,0)"/></linearGradient>
            <pattern id="pPanel" width="80" height="40" patternUnits="userSpaceOnUse"><rect width="80" height="40" fill="none" stroke="rgba(255,255,255,.035)"/><circle cx="4" cy="4" r="1" fill="rgba(255,255,255,.08)"/><circle cx="76" cy="4" r="1" fill="rgba(255,255,255,.08)"/></pattern>
            <pattern id="pFloor" width="40" height="14" patternUnits="userSpaceOnUse"><rect width="40" height="14" fill="#151a22"/><path d="M0 0 H40 M0 0 V14" stroke="rgba(255,255,255,.05)"/></pattern>
            <pattern id="pHaz" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="16" height="8" fill="#ff9f1c"/><path d="M0 8 L8 0 L12 0 L4 8Z M8 8 L16 0 L16 4 L12 8Z" fill="#111"/></pattern>
            <pattern id="pFoil" width="8" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="16" fill="#d4a017"/><rect width="4" height="16" fill="#f5d36b"/></pattern>
            <linearGradient id="beanFill" x1="0" x2="1"><stop offset="0" stop-color="#4a2810"/><stop offset=".5" stop-color="#a0642c"/><stop offset="1" stop-color="#3e200c"/></linearGradient>
            <linearGradient id="bandD" x1="0" x2="1"><stop offset="0" stop-color="#0c1f45"/><stop offset=".3" stop-color="#2f6fd0"/><stop offset=".42" stop-color="#7fb0f5"/><stop offset=".7" stop-color="#23529e"/><stop offset="1" stop-color="#0a1a3a"/></linearGradient>
            <linearGradient id="bandF" x1="0" x2="1"><stop offset="0" stop-color="#4a3006"/><stop offset=".3" stop-color="#c98a1a"/><stop offset=".42" stop-color="#f6cd6a"/><stop offset=".7" stop-color="#a8700f"/><stop offset="1" stop-color="#3a2604"/></linearGradient>
            <linearGradient id="chocFall" x1="0" x2="1"><stop offset="0" stop-color="#3a1c0a"/><stop offset=".3" stop-color="#7a4422"/><stop offset=".45" stop-color="#b47a4c"/><stop offset=".6" stop-color="#6a3a1c"/><stop offset="1" stop-color="#2e1607"/></linearGradient></defs>
            ${img ? '' : `<rect width="800" height="${HH}" fill="url(#texConcrete)"/><rect width="800" height="${HH}" fill="url(#pWall)" opacity=".7"/><rect width="800" height="${HH}" fill="url(#pPanel)"/>
            ${lights}${vents}`}
            <text x="400" y="${Math.max(30, top - 18)}" text-anchor="middle" class="p-wall-t">KAKAO-LAGER · ${tiles.length} SILOS À ${unit} T</text>
            <path d="M${xa.toFixed(1)} ${pipeY} H70 V${HH - 250}" class="pipe-flow"/>
            ${silos}
            ${plantLineSVG(HH)}
            <text x="40" y="${HH - 273}" class="pl-k">Marge ${fmt(CFG.chocMargin * (me.marginMult || 1))} CHF/t · Ruf ${mm} % · Linie läuft mit ${Math.round((0.55 + 0.45 * (tiles.filter(k => k === 'deal' || k === 'fut').length / Math.max(1, tiles.length))) * 100)} % – je mehr Kakao gesichert, desto schneller</text></svg>`;
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
        const sel = DSEL.size ? `<div class="tk-sel"><span>◉ ${DSEL.size} ${prod ? (DSEL.size === 1 ? 'Dorf' : 'Dörfer') : 'Silo' + (DSEL.size === 1 ? '' : 's')} ausgewählt · <b>${dQty * CFG.size} t</b></span><button data-dsel="clear">Auswahl löschen</button></div>` : '';
        const openN = DINFO.filter(d => d && d.kk === 'open').length;
        const allOpen = openN ? `<button class="tk-all ${DSEL.size === openN ? 'on' : ''}" data-dsel="all" title="Alle offenen ${prod ? 'Dörfer' : 'Silos'} auf der Karte auswählen">alle offenen</button>` : '';
        return `<h3>Order-Ticket</h3><div class="tk-q"><small>MENGE</small>${[1, 2, 5, 10].map(q => `<button class="${!DSEL.size && q === dQty ? 'on' : ''}" data-dq="${q}">${q * CFG.size} t</button>`).join('')}${allOpen}</div>${sel}
            <div class="tk-btns">${hedgeBtn}${undoBtn}</div>
            <div class="tk-lim">Pfand ${Math.round(CFG.marginRate * 100)} % · Gebühr ${CFG.fee} CHF pro 10 t · Was im Dezember offen ist: −${Math.round(CFG.spotPenalty * 100)} %</div>`;
    }

    // ===== Interaktive Karte: Zoom, Verschieben, Hover-Karten, Auswahl =====
    let DINFO = [];
    const DSEL = new Set();
    const DZ = { s: 1, tx: 0, ty: 0 };
    const VNAMES = {
        ivory: ['Abengourou', 'Daloa', 'Soubré', 'Gagnoa', 'Duékoué', 'Divo', 'Issia', 'Méagui', 'Guiglo', 'Sinfra', 'Bouaflé', 'Vavoua', 'Oumé', 'Lakota', 'Tiassalé', 'Agboville', 'Adzopé', 'Aboisso', 'Zouan', 'Bangolo', 'Buyo', 'Grabo', 'Sassandra', 'Bonon'],
        ghana: ['Goaso', 'Sefwi Wiawso', 'Bibiani', 'Juaboso', 'Enchi', 'Asankragwa', 'Dunkwa', 'Konongo', 'Nkawkaw', 'Akim Oda', 'Assin Fosu', 'Twifo', 'Bogoso', 'Tarkwa', 'Prestea', 'Mpraeso', 'Begoro', 'Kade', 'Asamankese', 'Suhum', 'Nsawam', 'Obuasi', 'Bekwai', 'Mankranso'],
        ecuador: ['Vinces', 'Quevedo', 'Naranjal', 'Balao', 'Machala', 'Pasaje', 'El Empalme', 'Ventanas', 'Babahoyo', 'Milagro', 'Yaguachi', 'Daule', 'Pichincha', 'Puebloviejo', 'Valencia', 'Mocache', 'Palenque', 'Baba', 'Montalvo', 'Urdaneta', 'Catarama', 'Ricaurte', 'Simón Bolívar', 'La Troncal'],
        indonesia: ['Mamuju', 'Polewali', 'Majene', 'Luwu', 'Palopo', 'Masamba', 'Malili', 'Soroako', 'Kolaka', 'Bombana', 'Konawe', 'Poso', 'Parigi', 'Toli-Toli', 'Donggala', 'Sigi', 'Morowali', 'Banggai', 'Luwuk', 'Ampana', 'Pinrang', 'Sidrap', 'Wajo', 'Bone'],
    };
    const villageName = i => { const l = VNAMES[me.region] || VNAMES.ivory; return l[i % l.length] + (i >= l.length ? ' II' : ''); };

    function deskLoader(prod) {
        if (DZ.s !== 1) { DZ.s = 1; DZ.tx = 0; DZ.ty = 0; setTimeout(deskZoomApply, 0); }
        return `<div class="d-load ${prod ? 'farm' : 'plant'}"><div class="d-load-in">
            <svg viewBox="0 0 64 64" class="d-load-ico"><circle cx="32" cy="32" r="29" class="d-load-track"/><circle cx="32" cy="32" r="29" class="d-load-arc"/>
            ${prod ? '<path d="M32 16 c9 4 13 12 10 22 c-2 7 -8 10 -10 10 c-2 0 -8 -3 -10 -10 c-3 -10 1 -18 10 -22z M32 18 V46" class="d-load-bean"/>' : '<path d="M18 46 V28 l7 5 V24 l7 5 V20 l7 5 V46z M42 46 V22 h5 V46" class="d-load-bean"/>'}</svg>
            <b>${prod ? 'Luftbild wird berechnet' : 'Fabrikhalle wird aufgebaut'}</b>
            <small>${prod ? (me.region && REGIONS[me.region] ? `${REGIONS[me.region].name} · ` : '') : ''}einmalig in hoher Auflösung – danach sofort da</small>
            <div class="d-load-bar"><i></i></div></div></div>`;
    }

    // Gleiche Vergrösserung für Bild, Leben und Status-Ebene (alle liegen im selben Paneel)
    function deskZoomApply() {
        const host = $('d-world');
        if (!host) return;
        for (const el of [$('d-bg'), $('d-life'), host, $('d-fx')]) {
            if (!el) continue;
            const ex = el.offsetLeft ?? host.offsetLeft; // SVG-Ebene hat kein offsetLeft – liegt genau über der Karte
            const ey = el.offsetTop ?? host.offsetTop;
            el.style.transformOrigin = '0 0';
            const dx = (DZ.s - 1) * ex + DZ.tx;
            const dy = (DZ.s - 1) * ey + DZ.ty;
            el.style.transform = DZ.s === 1 ? '' : `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${DZ.s.toFixed(4)})`;
            // Nur die Kartenfläche zeigen – nichts ragt über Titel oder Legende
            if (DZ.s === 1) { el.style.clipPath = ''; continue; }
            const hx = host.offsetLeft;
            const hy = host.offsetTop;
            const ew = el.offsetWidth ?? host.offsetWidth;
            const eh = el.offsetHeight ?? host.offsetHeight;
            const L = Math.max(0, (hx - ex - dx) / DZ.s);
            const T = Math.max(0, (hy - ey - dy) / DZ.s);
            const R = Math.max(0, ew - (hx + host.offsetWidth - ex - dx) / DZ.s);
            const B = Math.max(0, eh - (hy + host.offsetHeight - ey - dy) / DZ.s);
            el.style.clipPath = `inset(${T.toFixed(1)}px ${R.toFixed(1)}px ${B.toFixed(1)}px ${L.toFixed(1)}px)`;
        }
        const pan = host.parentElement;
        pan.classList.toggle('zoomed', DZ.s > 1.001);
        const z = pan.querySelector('.dz-val');
        if (z) z.textContent = `${Math.round(DZ.s * 100)} %`;
        if (typeof deskMini === 'function') deskMini();
    }
    function deskZoomClamp() {
        const host = $('d-world');
        const ex = host.offsetLeft;
        const ey = host.offsetTop;
        const W = host.offsetWidth;
        const H = host.offsetHeight;
        DZ.tx = Math.min(ex - DZ.s * ex, Math.max(ex + W - DZ.s * (ex + W), DZ.tx));
        DZ.ty = Math.min(ey - DZ.s * ey, Math.max(ey + H - DZ.s * (ey + H), DZ.ty));
        if (DZ.s <= 1.001) { DZ.s = 1; DZ.tx = 0; DZ.ty = 0; }
    }
    let lifeSharpT = 0;
    function deskZoomTo(s, px, py) {
        const host = $('d-world');
        if (!host) return;
        if (px === undefined) { px = host.offsetLeft + host.offsetWidth / 2; py = host.offsetTop + host.offsetHeight / 2; }
        const ns = Math.max(1, Math.min(4, s));
        const cx = (px - DZ.tx) / DZ.s;
        const cy = (py - DZ.ty) / DZ.s;
        DZ.s = ns;
        DZ.tx = px - ns * cx;
        DZ.ty = py - ns * cy;
        deskZoomClamp();
        deskZoomApply();
        // Nach dem Zoomen die bewegte Ebene schärfer rechnen
        clearTimeout(lifeSharpT);
        lifeSharpT = setTimeout(() => { if (LIFE.mode === 'plant' && LIFE.on) plantLife(PLINE.HH, true, PLINE.sp); else if (LIFE.args) deskLife(...LIFE.args); }, 250);
    }

    function deskTipShow(ev, el) {
        const tip = $('d-tip');
        const d = DINFO[Number(el.dataset.i)];
        if (!tip || !d) return;
        const prod = me.role === 'producer';
        const st = { deal: ['Vertrag', 'deal'], fut: ['Future', 'fut'], open: ['offen', 'open'], lost: ['verloren', 'lost'], cut: ['gestrichen', 'lost'] }[d.kk] || ['', ''];
        const key = `${el.dataset.i}|${d.kk}|${DSEL.has(Number(el.dataset.i))}`;
        if (tip.dataset.k !== key) {
            tip.dataset.k = key;
            tip.innerHTML = `<div class="dt-h"><b>${esc(d.name)}</b><span class="dt-st ${st[1]}">${st[0]}</span></div>
                <div class="dt-t">${d.t} t <small>${prod ? 'Ernte' : 'Kakao-Bohnen'}</small></div>
                <div class="dt-l">${esc(d.what)}</div>
                <div class="dt-m">${prod ? `${d.fam} Familien · ca. ${fmt(d.trees)} Kakaobäume` : `reicht für ca. ${fmt(d.bars)} Tafeln à 100 g`}</div>
                <div class="dt-r ${d.kk}">${esc(d.risk)}</div>
                ${d.kk === 'open' ? `<div class="dt-a">${DSEL.has(Number(el.dataset.i)) ? '✓ ausgewählt – klicken zum Abwählen' : 'Klicken: zum Absichern auswählen'}</div>` : ''}`;
        }
        const pan = tip.parentElement.getBoundingClientRect();
        let x = ev.clientX - pan.left + 16;
        let y = ev.clientY - pan.top + 14;
        tip.classList.add('on');
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        if (x + tw > pan.width - 8) x = ev.clientX - pan.left - tw - 16;
        if (y + th > pan.height - 8) y = ev.clientY - pan.top - th - 14;
        tip.style.transform = `translate(${Math.max(6, Math.min(x, pan.width - tw - 6))}px, ${Math.max(6, Math.min(y, pan.height - th - 6))}px)`;
    }
    const deskTipHide = () => { const t = $('d-tip'); if (t) { t.classList.remove('on'); t.dataset.k = ''; } };

    function deskSelTons() { return [...DSEL].reduce(s => s + deskUnitNow, 0); }
    function deskSelSync() {
        // nur offene Dörfer/Silos bleiben ausgewählt
        for (const i of [...DSEL]) if (!DINFO[i] || DINFO[i].kk !== 'open') DSEL.delete(i);
        if (DSEL.size) dQty = Math.max(1, Math.round(deskSelTons() / CFG.size));
    }

    window.addEventListener('gfxchange', () => {
        if (!me || !pub) return;
        if ($('v-desk').classList.contains('active')) renderDesk();
        else if ($('v-term').classList.contains('active')) renderTerm();
        else if ($('v-player').classList.contains('active')) render();
    });
    function bindDeskMap() {
        const host = $('d-world');
        const pan = host.parentElement;
        if (pan.dataset.bound) return;
        pan.dataset.bound = '1';
        const tip = document.createElement('div');
        tip.id = 'd-tip';
        tip.className = 'd-tip';
        pan.appendChild(tip);
        const ctl = document.createElement('div');
        ctl.className = 'dz-ctl';
        ctl.innerHTML = '<button data-z="in" title="Hineinzoomen">+</button><span class="dz-val">100 %</span><button data-z="out" title="Herauszoomen">−</button><button data-z="reset" title="Ganze Karte">⤢</button>';
        pan.appendChild(ctl);
        const hint = document.createElement('div');
        hint.className = 'dz-hint';
        hint.textContent = 'Mausrad: zoomen · Ziehen: verschieben · Doppelklick: ganze Karte';
        pan.appendChild(hint);
        ctl.addEventListener('click', ev => {
            const b = ev.target.closest('button');
            if (!b) return;
            if (b.dataset.z === 'in') deskZoomTo(DZ.s * 1.4);
            if (b.dataset.z === 'out') deskZoomTo(DZ.s / 1.4);
            if (b.dataset.z === 'reset') deskZoomTo(1);
        });
        const local = ev => { const r = pan.getBoundingClientRect(); return [ev.clientX - r.left - pan.clientLeft, ev.clientY - r.top - pan.clientTop]; };
        host.addEventListener('wheel', ev => {
            if ($('d-world').querySelector('.d-load')) return;
            ev.preventDefault();
            const [px, py] = local(ev);
            deskZoomTo(DZ.s * Math.exp(-ev.deltaY * 0.0018), px, py);
        }, { passive: false });
        let drag = null;
        host.addEventListener('pointerdown', ev => {
            if (ev.button !== 0) return;
            drag = { x: ev.clientX, y: ev.clientY, tx: DZ.tx, ty: DZ.ty, moved: false };
        });
        window.addEventListener('pointermove', ev => {
            if (drag && DZ.s > 1) {
                const dx = ev.clientX - drag.x;
                const dy = ev.clientY - drag.y;
                if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; pan.classList.add('dragging'); deskTipHide(); }
                if (drag.moved) {
                    DZ.tx = drag.tx + dx;
                    DZ.ty = drag.ty + dy;
                    deskZoomClamp();
                    deskZoomApply();
                    return;
                }
            }
            if (!drag || !drag.moved) {
                const el = ev.target.closest && ev.target.closest('#d-world [data-i]');
                const st = !el && ev.target.closest && ev.target.closest('#d-world [data-st]');
                if (el) deskTipShow(ev, el); else if (st) stationTip(ev, st); else deskTipHide();
            }
        });
        window.addEventListener('pointerup', () => {
            if (drag && drag.moved) { pan.classList.remove('dragging'); host._noClick = true; setTimeout(() => { host._noClick = false; }, 0); }
            drag = null;
        });
        host.addEventListener('pointerleave', deskTipHide);
        host.addEventListener('dblclick', ev => { ev.preventDefault(); deskZoomTo(DZ.s > 1.05 ? 1 : 2.2, ...local(ev)); });
        host.addEventListener('click', ev => {
            if (host._noClick) return;
            const el = ev.target.closest('[data-i]');
            if (!el) return;
            const i = Number(el.dataset.i);
            if (!DINFO[i] || DINFO[i].kk !== 'open') return;
            if (DSEL.has(i)) DSEL.delete(i); else DSEL.add(i);
            Sound.play && Sound.play('tick');
            if (!DSEL.size) dQty = 2;
            renderDesk();
            deskTipShow(ev, $('d-world').querySelector(`[data-i="${i}"]`) || el);
        });
        window.addEventListener('resize', () => { DZ.s = 1; DZ.tx = 0; DZ.ty = 0; deskZoomApply(); });
        window.addEventListener('keydown', ev => {
            if (!$('v-desk').classList.contains('active') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)) return;
            if (ev.key === '+' || ev.key === '=') deskZoomTo(DZ.s * 1.4);
            else if (ev.key === '-' || ev.key === '_') deskZoomTo(DZ.s / 1.4);
            else if (ev.key === '0') deskZoomTo(1);
            else if (ev.key === 'Escape' && DSEL.size) { DSEL.clear(); dQty = 2; renderDesk(); }
            else return;
            ev.preventDefault();
        });
    }

    // ===== Effekt-Ebene über der Karte: Gewinne/Verluste live, Absicherungs-Siegel =====
    let DPOS = [];
    let DVB = '0 0 800 800';
    const FX = { price: null, acc: 0, t: 0, kinds: null, role: '' };
    function fxLayer() {
        const host = $('d-world');
        let fx = $('d-fx');
        if (!fx) {
            fx = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            fx.id = 'd-fx';
            fx.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            host.parentElement.insertBefore(fx, host.nextSibling);
        }
        if (fx.getAttribute('viewBox') !== DVB) fx.setAttribute('viewBox', DVB);
        const css = `position:absolute;left:${host.offsetLeft}px;top:${host.offsetTop}px;width:${host.offsetWidth}px;height:${host.offsetHeight}px;pointer-events:none;z-index:2;overflow:visible`;
        if (fx._css !== css) { fx._css = css; fx.style.cssText = css; deskZoomApply(); }
        return fx;
    }
    function fxAdd(markup, ms) {
        const fx = fxLayer();
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.innerHTML = markup;
        fx.appendChild(g);
        setTimeout(() => g.remove(), ms);
    }
    function deskFx(tilesNow) {
        if (!$('d-world') || $('d-world').querySelector('.d-load') || !DPOS.length) { FX.kinds = null; return; }
        const prod = me.role === 'producer';
        const now = performance.now();
        if (FX.role !== me.role) { FX.role = me.role; FX.kinds = null; FX.price = null; }
        // 1) Siegel: offen → abgesichert
        const kinds = DINFO.map(d => d && d.kk);
        if (FX.kinds && FX.kinds.length === kinds.length) {
            let n = 0;
            kinds.forEach((k, i) => {
                if (FX.kinds[i] === 'open' && (k === 'fut' || k === 'deal') && DPOS[i]) {
                    const [x, y] = DPOS[i];
                    const col = k === 'fut' ? '#f3d58f' : '#9cc3f2';
                    setTimeout(() => fxAdd(`<g transform="translate(${x} ${y})" class="fx-seal">
                        <circle r="30" class="fx-burst" style="stroke:${col}"/><circle r="30" class="fx-burst b2" style="stroke:${col}"/>
                        ${Array.from({ length: 10 }, (_, j) => { const a = (j / 10) * Math.PI * 2; return `<line x1="${(Math.cos(a) * 20).toFixed(1)}" y1="${(Math.sin(a) * 20).toFixed(1)}" x2="${(Math.cos(a) * 34).toFixed(1)}" y2="${(Math.sin(a) * 34).toFixed(1)}" class="fx-ray" style="stroke:${col}"/>`; }).join('')}
                        <g class="fx-lock"><circle r="15" fill="rgba(20,14,8,.9)" stroke="${col}" stroke-width="1.5"/><text y="6" text-anchor="middle" font-size="15">${k === 'fut' ? '🔒' : '📜'}</text></g>
                        <text y="-36" text-anchor="middle" class="fx-sealt" style="fill:${col}">${k === 'fut' ? 'ABGESICHERT' : 'VERTRAG'}</text></g>`, 1900), n++ * 110);
                }
            });
            if (n) Sound.play('cash');
        }
        FX.kinds = kinds;
        // 2) Live: was der Preis gerade mit den offenen Tonnen macht
        if (pub.phase !== 'trading' || pub.paused) { FX.price = pub.price; FX.acc = 0; FX.t = now; return; }
        if (FX.price === null) { FX.price = pub.price; FX.t = now; return; }
        FX.acc += pub.price - FX.price;
        FX.price = pub.price;
        if (now - FX.t < 2600) return;
        FX.t = now;
        const d = Math.round(FX.acc);
        FX.acc = 0;
        if (!d) return;
        const good = prod ? d > 0 : d < 0;
        kinds.forEach((k, i) => {
            if (k !== 'open' || !DPOS[i]) return;
            const [x, y] = DPOS[i];
            const v = Math.abs(d) * deskUnitNow;
            setTimeout(() => fxAdd(`<g transform="translate(${x} ${y - 18})"><text text-anchor="middle" class="fx-delta ${good ? 'up' : 'down'}">${good ? '+' : '−'}${fmt(v)}</text></g>`, 2200), i * 40);
        });
        // Abgesicherte bleiben ruhig – kurz zeigen, dass sie nicht mitschwanken
        kinds.forEach((k, i) => {
            if ((k !== 'fut' && k !== 'deal') || !DPOS[i] || Math.random() > 0.35) return;
            const [x, y] = DPOS[i];
            setTimeout(() => fxAdd(`<g transform="translate(${x} ${y - 18})"><text text-anchor="middle" class="fx-delta fix">± 0</text></g>`, 2200), 200 + i * 40);
        });
    }

    // Minikarte (beim Zoomen): wo bin ich gerade?
    function deskMini() {
        const pan = $('d-world') && $('d-world').parentElement;
        if (!pan) return;
        let m = pan.querySelector('.dz-mini');
        if (!m) {
            m = document.createElement('div');
            m.className = 'dz-mini';
            m.innerHTML = '<canvas></canvas><i></i>';
            pan.appendChild(m);
            m.addEventListener('click', ev => {
                const host = $('d-world');
                const r = m.getBoundingClientRect();
                const fx = (ev.clientX - r.left) / r.width;
                const fy = (ev.clientY - r.top) / r.height;
                // Punkt der Karte in die Mitte holen
                const cx = host.offsetLeft + fx * host.offsetWidth;
                const cy = host.offsetTop + fy * host.offsetHeight;
                DZ.tx = host.offsetLeft + host.offsetWidth / 2 - DZ.s * cx;
                DZ.ty = host.offsetTop + host.offsetHeight / 2 - DZ.s * cy;
                deskZoomClamp();
                deskZoomApply();
            });
        }
        const host = $('d-world');
        const bg = $('d-bg');
        if (DZ.s <= 1.001 || !bg || !bg._bmp) { m.classList.remove('on'); return; }
        m.classList.add('on');
        const W = host.offsetWidth;
        const H = host.offsetHeight;
        const mw = 150;
        const mh = Math.round((mw * H) / W);
        const cv = m.querySelector('canvas');
        if (cv._src !== bg._bmp || cv.height !== mh * 2) {
            cv._src = bg._bmp;
            cv.width = mw * 2;
            cv.height = mh * 2;
            const b = bg._bmp;
            const f = Math.min((mw * 2) / b.width, (mh * 2) / b.height);
            const x = cv.getContext('2d');
            x.clearRect(0, 0, cv.width, cv.height);
            x.drawImage(b, (cv.width - b.width * f) / 2, (cv.height - b.height * f) / 2, b.width * f, b.height * f);
        }
        m.style.width = `${mw}px`;
        m.style.height = `${mh}px`;
        const ex = host.offsetLeft;
        const ey = host.offsetTop;
        const x0 = ((ex - DZ.tx) / DZ.s - ex) / W;
        const y0 = ((ey - DZ.ty) / DZ.s - ey) / H;
        const vr = m.querySelector('i');
        vr.style.cssText = `left:${(x0 * 100).toFixed(2)}%;top:${(y0 * 100).toFixed(2)}%;width:${(100 / DZ.s).toFixed(2)}%;height:${(100 / DZ.s).toFixed(2)}%`;
    }

    // Fertiges Bild → nur neu zeichnen, wenn der Leitstand gerade sichtbar ist
    const deskRedraw = () => { if ($('v-desk').classList.contains('active')) renderDesk(); };
    // Schon im Warteraum das Luftbild bzw. die Fabrikhalle rechnen lassen (unsichtbar, in der richtigen Grösse),
    // damit beim Start der Börse alles sofort da ist.
    let prewarmKey = '';
    function deskPrewarm() {
        if (!me || !deskMode() || $('v-desk').classList.contains('active')) return;
        const key = `${me.role}|${window.innerWidth}x${window.innerHeight}|${me.sky || ''}`;
        if (key === prewarmKey) return;
        prewarmKey = key;
        const d = $('v-desk');
        const prod = me.role === 'producer';
        d.classList.toggle('farm', prod);
        d.classList.toggle('plant', !prod);
        d.classList.add('prewarm');
        try { prod ? farmSVG() : plantSVG(); } catch (e) { if (window.KP_DEBUG) console.warn('Vorrechnen', e); }
        d.classList.remove('prewarm');
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
        bindDeskMap();
        const mapHTML = prod ? farmSVG() : plantSVG();
        deskSelSync();
        setHTML($('d-world'), mapHTML);
        deskZoomApply();
        deskFx();
        $('d-world-h').innerHTML = prod ? `Deine Mitglieder <span>1 Dorf = ${deskUnitNow} t Ernte</span>` : `Kakao-Bedarf <span>1 Silo = ${deskUnitNow} t</span>`;
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
            if (b.dataset.dq) { DSEL.clear(); dQty = Number(b.dataset.dq); renderDesk(); }
            if (b.dataset.dsel === 'all') { DINFO.forEach((d, i) => { if (d && d.kk === 'open') DSEL.add(i); }); renderDesk(); return; }
            if (b.dataset.dsel) { DSEL.clear(); dQty = 2; renderDesk(); }
            if (b.dataset.dt) {
                const dir = Number(b.dataset.dt);
                if (tutTrade(dir)) return;
                send({ t: 'trade', q: dir * Math.max(1, Math.min(dQty, room(dir))) });
                if (DSEL.size) { DSEL.clear(); dQty = 2; }
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
        return `<g class="t-pin" data-loc="${k}" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><g class="t-pin-in">
            <circle class="t-hit" r="16"/><circle class="t-pulse" r="13"/><circle class="t-dot" r="5.5"/>
            <text class="t-pl" x="${right ? -9 : 9}" y="-4" text-anchor="${right ? 'end' : 'start'}">${esc(label || L.name)}</text>
            <text class="t-pi" x="${right ? -9 : 9}" y="10" text-anchor="${right ? 'end' : 'start'}">${icons}</text></g></g>`;
    }

    function buildMap() {
        // Punkteraster 1° aus echten Natural-Earth-Daten, dazu die exakte Küstenlinie
        const rowOf = lat => LAND_HI[78 - lat];
        const isLand = (lon, lat) => { const r = rowOf(lat); return !!r && r[1].some(([a, b]) => lon >= a && lon <= b); };
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
            <defs><pattern id="tCrop" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(86,199,150,.28)" stroke-width="1.5"/></pattern></defs>
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
        $('t-map').innerHTML = `<svg viewBox="0 0 ${TW} ${TH}" class="t-world" preserveAspectRatio="xMidYMid meet"><image href="${paintImage(TW, TH, 6, x => {
                const W2 = [];
                const BELT = [];
                // Ozean: weicher Schimmer, zur Mitte hin heller
                const og = x.createRadialGradient(TW * 0.42, TH * 0.48, 10, TW * 0.5, TH * 0.5, TW * 0.62);
                og.addColorStop(0, 'rgba(46,58,74,.55)');
                og.addColorStop(0.6, 'rgba(22,28,38,.35)');
                og.addColorStop(1, 'rgba(8,10,14,0)');
                x.fillStyle = og;
                x.fillRect(0, 0, TW, TH);
                // Äquator & Wendekreise (Kakao wächst nur ca. 20° um den Äquator)
                const bg = x.createLinearGradient(0, ty(20), 0, ty(-20));
                bg.addColorStop(0, 'rgba(185,207,148,0)');
                bg.addColorStop(0.5, 'rgba(185,207,148,.06)');
                bg.addColorStop(1, 'rgba(185,207,148,0)');
                x.fillStyle = bg;
                x.fillRect(0, ty(20), TW, ty(-20) - ty(20));
                x.shadowColor = 'rgba(169,196,220,.55)';
                x.shadowBlur = 1.6;
                x.fillStyle = 'rgba(150,186,214,.34)';
                x.beginPath();
                for (let lat = 72; lat >= -32; lat--) for (let lon = -165; lon <= 150; lon++) {
                    if (!isLand(lon, lat)) continue;
                    if (lon >= -10 && lon <= 4 && lat >= 4 && lat <= 11) { W2.push([lon, lat]); continue; }
                    if (Math.abs(lat) <= 12) { BELT.push([lon, lat]); continue; }
                    const r0 = 0.62 + ((lon * 7 + lat * 13) % 5) * 0.03;
                    x.moveTo(tx(lon) + r0, ty(lat)); x.arc(tx(lon), ty(lat), r0, 0, Math.PI * 2);
                }
                x.fill();
                x.shadowColor = 'rgba(185,207,148,.6)';
                x.fillStyle = 'rgba(185,207,148,.5)';
                x.beginPath();
                for (const [lon, lat] of BELT) { x.moveTo(tx(lon) + 0.72, ty(lat)); x.arc(tx(lon), ty(lat), 0.72, 0, Math.PI * 2); }
                x.fill();
                x.shadowBlur = 0;
                x.fillStyle = 'rgba(217,178,111,.75)';
                x.beginPath();
                for (const [lon, lat] of W2) { x.moveTo(tx(lon) + 0.72, ty(lat)); x.arc(tx(lon), ty(lat), 0.72, 0, Math.PI * 2); }
                x.fill();
                x.lineJoin = 'round';
                x.strokeStyle = 'rgba(169,196,220,.18)';
                x.lineWidth = 1.6;
                x.stroke(new Path2D(coastD));
                x.strokeStyle = 'rgba(190,212,232,.75)';
                x.lineWidth = 0.45;
                x.stroke(new Path2D(coastD));
            })}" x="0" y="0" width="${TW}" height="${TH}"/>
            <g class="t-grid-l">${[-20, 0, 20, 40, 60].map(l => `<line x1="0" x2="${TW}" y1="${ty(l)}" y2="${ty(l)}"/><text x="3" y="${ty(l) - 2}">${Math.abs(l)}°${l > 0 ? 'N' : l < 0 ? 'S' : ''}</text>`).join('')}${[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120].map(l => `<line class="v" x1="${tx(l)}" x2="${tx(l)}" y1="0" y2="${TH}"/>`).join('')}</g>
            <g class="t-routes"><path d="${`M${tx(-4)} ${ty(5)} Q ${tx(-20)} ${ty(40)} ${tx(4)} ${ty(51)}`}"/><path d="${`M${tx(-4)} ${ty(5)} Q ${tx(-40)} ${ty(30)} ${tx(-74)} ${ty(40.7)}`}"/></g>${box}${world}</svg>
            <div class="t-inset"><div class="t-inset-h">AUSSCHNITT WESTAFRIKA · 70 % der Welternte</div>${inset}</div>`;
        termMapInteract();
        $('t-map').querySelectorAll('.t-pin').forEach(g => g.addEventListener('click', () => {
            if (g.ownerSVGElement && g.ownerSVGElement._dragged) return;
            if (tutActive() && tut.wait === 'pin') { tutPin(g.dataset.loc); return; }
            tSel = g.dataset.loc;
            Sound.play('tick');
            renderTerm();
        }));
        tMapBuilt = true;
    }

    // ===== Interaktive Weltkarte im Terminal: Zoom, Verschieben, Hover-Karten, Live-Effekte =====
    function svgZoom(svg, W, H, max) {
        svg._z = { s: 1, x: 0, y: 0, W, H, max };
        const apply = () => {
            const z = svg._z;
            const w = W / z.s;
            const h = H / z.s;
            z.x = Math.max(0, Math.min(W - w, z.x));
            z.y = Math.max(0, Math.min(H - h, z.y));
            if (z.s <= 1.001) { z.s = 1; z.x = 0; z.y = 0; }
            svg.setAttribute('viewBox', `${z.x.toFixed(2)} ${z.y.toFixed(2)} ${(W / z.s).toFixed(2)} ${(H / z.s).toFixed(2)}`);
            svg.style.setProperty('--iz', (1 / Math.sqrt(z.s)).toFixed(4));
            svg.classList.toggle('zoomed', z.s > 1.001);
            const v = svg.parentElement && svg.closest('.t-map') && svg.closest('.t-map').querySelector(`.tz-val[data-for="${svg.dataset.zid}"]`);
            if (v) v.textContent = `${Math.round(z.s * 100)} %`;
        };
        const toSvg = (cx, cy) => {
            const m = svg.getScreenCTM();
            if (!m) return [W / 2, H / 2];
            const pt = new DOMPoint(cx, cy).matrixTransform(m.inverse());
            return [pt.x, pt.y];
        };
        svg._zoomTo = (s, cx, cy) => {
            const z = svg._z;
            let px; let py;
            if (cx === undefined) { px = z.x + W / z.s / 2; py = z.y + H / z.s / 2; } else [px, py] = toSvg(cx, cy);
            const ns = Math.max(1, Math.min(max, s));
            // Punkt unter der Maus bleibt stehen
            z.x = px - (px - z.x) * (z.s / ns);
            z.y = py - (py - z.y) * (z.s / ns);
            z.s = ns;
            apply();
        };
        svg.addEventListener('wheel', ev => { ev.preventDefault(); svg._zoomTo(svg._z.s * Math.exp(-ev.deltaY * 0.0018), ev.clientX, ev.clientY); }, { passive: false });
        let drag = null;
        svg.addEventListener('pointerdown', ev => { if (ev.button === 0) drag = { cx: ev.clientX, cy: ev.clientY, x: svg._z.x, y: svg._z.y, moved: false }; });
        window.addEventListener('pointermove', ev => {
            if (!drag || svg._z.s <= 1) return;
            const dx = ev.clientX - drag.cx;
            const dy = ev.clientY - drag.cy;
            if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; svg.classList.add('dragging'); termTipHide(); }
            if (!drag.moved) return;
            const m = svg.getScreenCTM();
            const k = m ? 1 / m.a : W / svg.clientWidth;
            svg._z.x = drag.x - dx * k;
            svg._z.y = drag.y - dy * k;
            apply();
        });
        window.addEventListener('pointerup', () => {
            if (drag && drag.moved) { svg._dragged = true; setTimeout(() => { svg._dragged = false; }, 0); svg.classList.remove('dragging'); }
            drag = null;
        });
        svg.addEventListener('dblclick', ev => { ev.preventDefault(); svg._zoomTo(svg._z.s > 1.05 ? 1 : 2.5, ev.clientX, ev.clientY); });
        apply();
    }

    function termTipShow(ev, g) {
        const tip = $('t-tip');
        const k = g.dataset.loc;
        const L = INTEL_LOCS[k];
        if (!tip || !L || !me || !me.intel) return;
        const I = me.intel;
        const rum = I.rumors || [];
        const hot = rum.filter(r => r.region && REGION_LOC[r.region] === k);
        const busy = I.job && I.job.loc === k;
        const reps = (I.reports || []).filter(r => r.loc === k);
        const role = { lon: 'Hier wird Kakao gehandelt (ICE London) – und gelagert.', nyc: 'Hier sitzen die grossen Fonds. Ihre Käufe bewegen den Preis.', bru: 'EU-Regeln und Nachfrage aus Europa.', sha: 'Wachsende Schokoladen-Nachfrage in Asien.', web: 'Schnell und billig – aber oft falsch.', abj: 'Grösster Kakao-Hafen der Welt.', acc: 'Zweitgrösster Exporthafen Westafrikas.' }[k] || (L.region ? `Anbaugebiet · ${REGIONS[L.region].name}` : '');
        const key = `${k}|${hot.length}|${busy ? I.job.left : ''}|${reps.length}|${I.costs && JSON.stringify(I.costs).length}`;
        if (tip.dataset.k !== key) {
            tip.dataset.k = key;
            tip.innerHTML = `<div class="dt-h"><b>${esc(L.name)}</b>${hot.length ? '<span class="dt-st hot">Gerücht</span>' : busy ? '<span class="dt-st fut">im Einsatz</span>' : ''}</div>
                <div class="dt-l">${esc(role)}</div>
                ${hot.map(r => `<div class="dt-r open">${r.icon} ${esc(r.text)} · noch ${r.left}s</div>`).join('')}
                <div class="tt-src">${L.types.map(t => { const c = I.costs[t]; return `<div><span>${INTEL_TYPES[t].icon} ${esc(INTEL_TYPES[t].name)}</span><b>${fmt(c.cost)}</b><small>${c.dur}s · ${INTEL_TYPES[t].soft ? 'unsicher' : `${c.rel} %`}</small></div>`; }).join('')}</div>
                ${busy ? `<div class="dt-m">⏳ Dein Team arbeitet hier – noch ${I.job.left}s</div>` : ''}
                ${reps.length ? `<div class="dt-m">${reps.length} Bericht${reps.length > 1 ? 'e' : ''} von hier · zuletzt: ${esc(reps[reps.length - 1].text).slice(0, 90)}</div>` : ''}
                <div class="dt-a">Klicken: Bericht anfordern</div>`;
        }
        const pan = tip.parentElement.getBoundingClientRect();
        tip.classList.add('on');
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        let x = ev.clientX - pan.left + 16;
        let y = ev.clientY - pan.top + 14;
        if (x + tw > pan.width - 8) x = ev.clientX - pan.left - tw - 16;
        if (y + th > pan.height - 8) y = ev.clientY - pan.top - th - 14;
        tip.style.transform = `translate(${Math.max(6, Math.min(x, pan.width - tw - 6))}px, ${Math.max(6, Math.min(y, pan.height - th - 6))}px)`;
    }
    const termTipHide = () => { const t = $('t-tip'); if (t) { t.classList.remove('on'); t.dataset.k = ''; } };

    function termMapInteract() {
        const map = $('t-map');
        const pan = map.parentElement;
        const world = map.querySelector('.t-world');
        const inset = map.querySelector('.t-inset-svg');
        if (world) { world.dataset.zid = 'w'; svgZoom(world, TW, TH, 6); }
        if (inset) { inset.dataset.zid = 'i'; svgZoom(inset, IW, IH, 4); }
        if (!pan.querySelector('#t-tip')) {
            const tip = document.createElement('div');
            tip.id = 't-tip';
            tip.className = 'd-tip t-tipc';
            pan.appendChild(tip);
            const ctl = document.createElement('div');
            ctl.className = 'dz-ctl tz-ctl';
            ctl.innerHTML = '<button data-z="in" title="Hineinzoomen">+</button><span class="dz-val tz-val" data-for="w">100 %</span><button data-z="out" title="Herauszoomen">−</button><button data-z="reset" title="Ganze Welt">⤢</button>';
            pan.appendChild(ctl);
            ctl.addEventListener('click', ev => {
                const b = ev.target.closest('button');
                const w = $('t-map').querySelector('.t-world');
                if (!b || !w || !w._zoomTo) return;
                if (b.dataset.z === 'in') w._zoomTo(w._z.s * 1.5);
                if (b.dataset.z === 'out') w._zoomTo(w._z.s / 1.5);
                if (b.dataset.z === 'reset') w._zoomTo(1);
            });
            const hint = document.createElement('div');
            hint.className = 'dz-hint tz-hint';
            hint.textContent = 'Mausrad: zoomen · Ziehen: verschieben · Ort: Bericht anfordern';
            pan.appendChild(hint);
            map.addEventListener('pointermove', ev => {
                if (ev.buttons) return;
                const g = ev.target.closest && ev.target.closest('.t-pin');
                if (g) termTipShow(ev, g); else termTipHide();
            });
            map.addEventListener('pointerleave', termTipHide);
        }
    }

    // Live-Effekte: Gewinn/Verlust an der Börse, neue Berichte, neue Gerüchte
    const TFX = { unreal: null, t: 0, reps: null, rums: null };
    function tfxAdd(k, markup, ms) {
        const g = $('t-map').querySelector(`.t-pin[data-loc="${k}"]`);
        if (!g || !g.ownerSVGElement) return;
        const fx = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        fx.setAttribute('transform', `translate(${g.dataset.x} ${g.dataset.y})`);
        fx.setAttribute('class', 't-fx');
        fx.innerHTML = `<g class="t-pin-in">${markup}</g>`;
        g.ownerSVGElement.appendChild(fx);
        setTimeout(() => fx.remove(), ms);
    }
    function termFx() {
        if (!me || !me.intel) return;
        const I = me.intel;
        const now = performance.now();
        // neue Berichte → Signal am Ort
        const n = (I.reports || []).length;
        if (TFX.reps !== null && n > TFX.reps) {
            for (const r of I.reports.slice(TFX.reps)) {
                const col = r.clear ? (r.dir > 0 ? '#7fe0b4' : '#f08a9a') : r.soft ? '#e9cf98' : '#a3978a';
                const lbl = r.clear ? (r.dir > 0 ? '✔ BESTÄTIGT' : '✔ DEMENTI') : r.soft ? '~ UNSICHER' : r.none ? 'PASST NICHT' : '? UNKLAR';
                tfxAdd(r.loc, `<circle r="10" class="fx-burst" style="stroke:${col}"/><circle r="10" class="fx-burst b2" style="stroke:${col}"/><text y="-16" text-anchor="middle" class="fx-sealt t" style="fill:${col}">${lbl}</text>`, 2000);
            }
        }
        TFX.reps = n;
        // neues Gerücht → Schockwelle am betroffenen Ort
        const ids = (I.rumors || []).map(r => r.id);
        if (TFX.rums) for (const r of I.rumors) if (!TFX.rums.includes(r.id)) {
            const k = r.region ? REGION_LOC[r.region] : 'web';
            tfxAdd(k, `<circle r="8" class="t-shock"/><circle r="8" class="t-shock s2"/><circle r="8" class="t-shock s3"/>`, 2600);
        }
        TFX.rums = ids;
        // offener Gewinn/Verlust → steigt an der Börse London auf
        if (pub.phase !== 'trading' || pub.paused || !me.pos) { TFX.unreal = me.unreal; TFX.t = now; return; }
        if (TFX.unreal === null) { TFX.unreal = me.unreal; TFX.t = now; return; }
        if (now - TFX.t < 2600) return;
        const d = Math.round(me.unreal - TFX.unreal);
        TFX.unreal = me.unreal;
        TFX.t = now;
        if (!d) return;
        tfxAdd('lon', `<text y="-14" text-anchor="middle" class="fx-delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</text>`, 2200);
    }

    // ===== Terminal: lebendige Weltkarte (Schiffe, Lastwagen, Tag/Nacht, Kurse, Intel-Einsatz) =====
    const ROUTES_W = [
        [[-4, 4.4], [-7, 2], [-17, 11], [-19, 27], [-12, 42], [-6, 48], [4.2, 51.9]],          // Abidjan → Rotterdam
        [[0.6, 5.0], [-1, 2.2], [-16, 9], [-18.5, 25], [-11, 40], [-5, 48.3], [4.8, 52.4]],    // Tema → Amsterdam
        [[-4, 4.4], [-12, 2.5], [-32, 10], [-55, 26], [-70, 37], [-74, 40.6]],                // Abidjan → New York
        [[-80, -2.2], [-82, 3], [-79.6, 9], [-76, 16], [-73, 27], [-74, 40.6]],               // Guayaquil → New York
        [[120.5, -2], [119, -5], [117.5, 2], [114, 11], [120, 24], [121.5, 31.2]],             // Sulawesi → Shanghai
        [[-4, 4.4], [8, -2], [12, -20], [18, -34], [40, -30], [55, -8], [52, 12], [43, 12.5]], // Abidjan → Asien (um Afrika)
    ];
    const TA = { on: false, raf: 0, last: 0, T: 0, ships: [], price: null, flash: 0, flashUp: true, term: null, termT: -1 };
    function polyLen(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; }
    function polyAt(pts, cum, d) {
        let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const t = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
        return [lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t), Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])];
    }
    function termAnimSetup() {
        const map = $('t-map');
        for (const [cls, sel] of [['ta-w', '.t-world'], ['ta-i', '.t-inset-svg']]) {
            const svg = map.querySelector(sel);
            if (!svg || svg.parentElement.querySelector(`canvas.${cls}`)) continue;
            const cv = document.createElement('canvas');
            cv.className = `t-anim ${cls}`;
            svg.parentElement.insertBefore(cv, svg.nextSibling);
            svg._anim = cv;
        }
        // Schiffe: Weltkarte in Kartenkoordinaten (Länge/Breite → x/y)
        if (!TA.ships.length) {
            ROUTES_W.forEach((R, ri) => {
                const pts = R.map(([lo, la]) => [tx(lo), ty(la)]);
                const cum = polyLen(pts);
                const n = ri < 3 ? 3 : 2;
                for (let q = 0; q < n; q++) TA.ships.push({ pts, cum, d: (cum[cum.length - 1] / n) * q + Math.random() * 20, v: 4 + Math.random() * 2.5, dir: q % 2 ? -1 : 1 });
            });
        }
        if (!TA.raf) TA.raf = requestAnimationFrame(termAnimLoop);
    }
    // Tag/Nacht-Grenze aus Datum und Uhrzeit
    function terminator() {
        const now = new Date();
        const day = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 0)) / 864e5;
        const dec = (-23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10)) * Math.PI) / 180;
        const lon0 = -((now.getUTCHours() + now.getUTCMinutes() / 60 - 12) * 15);
        const pts = [];
        for (let lo = -165; lo <= 150; lo += 3) {
            const la = (Math.atan(-Math.cos(((lo - lon0) * Math.PI) / 180) / Math.tan(dec)) * 180) / Math.PI;
            pts.push([tx(lo), ty(la)]);
        }
        return { pts, southNight: dec > 0 };
    }
    function canvasFor(svg) {
        const cv = svg._anim;
        if (!cv) return null;
        const r = svg.getBoundingClientRect();
        const pr = cv.parentElement.getBoundingClientRect();
        const dpr = Gfx.low() ? 1 : Math.min(2, window.devicePixelRatio || 1);
        const W = Math.round(r.width * dpr);
        const H = Math.round(r.height * dpr);
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        const css = `left:${(r.left - pr.left).toFixed(1)}px;top:${(r.top - pr.top).toFixed(1)}px;width:${r.width.toFixed(1)}px;height:${r.height.toFixed(1)}px`;
        if (cv._css !== css) { cv._css = css; cv.style.cssText = css; }
        const m = svg.getScreenCTM();
        if (!m) return null;
        const x = cv.getContext('2d');
        // Kartenkoordinaten → Leinwand
        x.setTransform(m.a * dpr, 0, 0, m.d * dpr, (m.e - r.left) * dpr, (m.f - r.top) * dpr);
        x.clearRect(-1e4, -1e4, 2e4, 2e4);
        return { x, k: 1 / m.a, z: (svg._z && svg._z.s) || 1 };
    }
    function termAnimLoop(now) {
        const view = $('v-term');
        if (!view || !view.classList.contains('active') || !me || !pub) { TA.raf = 0; TA.last = 0; return; }
        TA.raf = requestAnimationFrame(termAnimLoop);
        if (TA.last && now - TA.last < (Gfx.low() ? 50 : 33)) return;
        const dt = TA.last ? Math.min(0.1, (now - TA.last) / 1000) : 0.03;
        TA.last = now;
        TA.T += dt;
        const T = TA.T;
        const map = $('t-map');
        const world = map.querySelector('.t-world');
        const inset = map.querySelector('.t-inset-svg');
        // ---------- Weltkarte ----------
        const W = world && canvasFor(world);
        if (W) {
            const { x, k, z } = W;
            const s = k; // 1 Bildschirm-Pixel in Kartenmass
            // Tag/Nacht
            if (!Gfx.low()) {
                if (T - TA.termT > 20 || !TA.term) { TA.term = terminator(); TA.termT = T; }
                const { pts, southNight } = TA.term;
                const edge = southNight ? TH + 20 : -20;
                for (let q = 0; q < 3; q++) {
                    x.fillStyle = `rgba(4,6,12,${q === 0 ? 0.22 : 0.07})`;
                    x.beginPath();
                    pts.forEach(([px, py], i) => (i ? x.lineTo(px, py + (southNight ? q * 4 : -q * 4)) : x.moveTo(px, py + (southNight ? q * 4 : -q * 4))));
                    x.lineTo(TW + 20, edge); x.lineTo(-20, edge); x.closePath(); x.fill();
                }
            }
            // Schiffe mit Kielwasser
            for (const sh of TA.ships) {
                const L = sh.cum[sh.cum.length - 1];
                sh.d += sh.v * dt * sh.dir * (pub.paused ? 0.2 : 1);
                if (sh.d > L) sh.d -= L; if (sh.d < 0) sh.d += L;
                const [px, py, a] = polyAt(sh.pts, sh.cum, sh.d);
                const ang = sh.dir > 0 ? a : a + Math.PI;
                x.save(); x.translate(px, py); x.rotate(ang); x.scale(s * 1.3, s * 1.3);
                const wk = x.createLinearGradient(-18, 0, 0, 0); wk.addColorStop(0, 'rgba(200,225,255,0)'); wk.addColorStop(1, 'rgba(200,225,255,.45)');
                x.fillStyle = wk; x.beginPath(); x.moveTo(-18, -2.5); x.lineTo(-3, -1); x.lineTo(-3, 1); x.lineTo(-18, 2.5); x.closePath(); x.fill();
                x.fillStyle = '#e9dcc4'; x.beginPath(); x.moveTo(5, 0); x.lineTo(2, -2); x.lineTo(-4, -2); x.lineTo(-4, 2); x.lineTo(2, 2); x.closePath(); x.fill();
                x.fillStyle = '#b8863f'; x.fillRect(-3, -1.2, 3.5, 2.4);
                x.restore();
            }
            // Live-Kurs an den Börsen London und New York
            if (TA.price !== null && pub.price !== TA.price) { TA.flash = 1; TA.flashUp = pub.price > TA.price; }
            TA.price = pub.price;
            TA.flash = Math.max(0, TA.flash - dt * 1.2);
            [['lon', 'ICE LONDON', pub.price], ['nyc', 'ICE NEW YORK', Math.round(pub.price * 1.07)]].forEach(([key, lb, pr]) => {
                const L = INTEL_LOCS[key];
                const px = tx(L.lon);
                const py = ty(L.lat);
                x.save(); x.translate(px, py); x.scale(s, s);
                const ox = key === 'lon' ? 14 : -94;
                const oy = -38;
                const fl = TA.flash;
                x.fillStyle = 'rgba(12,10,8,.86)';
                rrect(x, ox, oy, 80, 22, 5); x.fill();
                x.strokeStyle = fl > 0 ? (TA.flashUp ? `rgba(86,199,150,${0.4 + fl * 0.6})` : `rgba(226,104,120,${0.4 + fl * 0.6})`) : 'rgba(214,178,112,.4)';
                x.lineWidth = 1; x.stroke();
                x.fillStyle = '#a3978a'; x.font = '600 6.5px Inter, sans-serif'; x.textAlign = 'left'; x.fillText(lb, ox + 6, oy + 8.5);
                x.fillStyle = fl > 0 ? (TA.flashUp ? '#7fe0b4' : '#f08a9a') : '#f3dcaa'; x.font = '600 9.5px "IBM Plex Mono", monospace'; x.fillText(fmt(pr), ox + 6, oy + 18.5);
                x.fillStyle = TA.flashUp ? '#56c796' : '#e26878'; x.font = '600 8px Inter, sans-serif'; x.textAlign = 'right'; x.fillText(TA.flashUp ? '▲' : '▼', ox + 74, oy + 18);
                x.strokeStyle = 'rgba(214,178,112,.35)'; x.beginPath(); x.moveTo(key === 'lon' ? 3 : -3, -3); x.lineTo(key === 'lon' ? ox : ox + 80, oy + 22); x.stroke();
                x.restore();
            });
            // Intel-Einsatz: Bogen vom Fonds (New York) zum Einsatzort
            const job = me.intel && me.intel.job;
            if (job && job.loc !== 'nyc') {
                const A = INTEL_LOCS.nyc;
                const B = INTEL_LOCS[job.loc];
                const west = WEST.includes(job.loc);
                const ax = tx(A.lon); const ay = ty(A.lat);
                const bx = west ? tx(-3) : tx(B.lon); const by = west ? ty(7) : ty(B.lat);
                const cx = (ax + bx) / 2; const cy = Math.min(ay, by) - Math.abs(bx - ax) * 0.25 - 10;
                x.save();
                x.setLineDash([3 * s, 3 * s]); x.lineDashOffset = -T * 12 * s;
                x.strokeStyle = 'rgba(169,196,220,.75)'; x.lineWidth = 1.2 * s;
                x.beginPath(); x.moveTo(ax, ay); x.quadraticCurveTo(cx, cy, bx, by); x.stroke();
                x.setLineDash([]);
                const p = (T * 0.45) % 1; const qx = (1 - p) * (1 - p) * ax + 2 * (1 - p) * p * cx + p * p * bx; const qy = (1 - p) * (1 - p) * ay + 2 * (1 - p) * p * cy + p * p * by;
                const g = x.createRadialGradient(qx, qy, 0, qx, qy, 5 * s); g.addColorStop(0, 'rgba(230,240,255,1)'); g.addColorStop(1, 'rgba(169,196,220,0)');
                x.fillStyle = g; x.beginPath(); x.arc(qx, qy, 5 * s, 0, 7); x.fill();
                // Radar am Ziel
                const ra = T * 3;
                x.strokeStyle = 'rgba(169,196,220,.6)'; x.lineWidth = 1 * s;
                x.beginPath(); x.arc(bx, by, 10 * s, 0, 7); x.stroke();
                x.fillStyle = 'rgba(169,196,220,.18)'; x.beginPath(); x.moveTo(bx, by); x.arc(bx, by, 10 * s, ra, ra + 0.9); x.closePath(); x.fill();
                x.restore();
            }
            // Gerüchte: Symbol schwebt über der betroffenen Region
            for (const r of (me.intel && me.intel.rumors) || []) {
                const k2 = r.region ? REGION_LOC[r.region] : 'web';
                const L = INTEL_LOCS[k2];
                if (!L || WEST.includes(k2)) continue;
                x.save(); x.translate(tx(L.lon), ty(L.lat) - 16 * s + Math.sin(T * 2) * 2 * s); x.scale(s, s);
                x.font = '12px "Noto Color Emoji", sans-serif'; x.textAlign = 'center'; x.globalAlpha = 0.9; x.fillText(r.icon, 0, 0); x.restore();
            }
        }
        // ---------- Ausschnitt Westafrika ----------
        const I = inset && canvasFor(inset);
        if (I) {
            const { x, k } = I;
            const s = k;
            // Lastwagen: Plantage → Hafen
            const truckRoutes = [
                [[ix(INTEL_LOCS.ci.lon), iy(INTEL_LOCS.ci.lat)], [ix(-5.2), iy(6.4)], [ix(INTEL_LOCS.abj.lon), iy(INTEL_LOCS.abj.lat) + 2]],
                [[ix(INTEL_LOCS.gh.lon), iy(INTEL_LOCS.gh.lat)], [ix(-0.6), iy(6.4)], [ix(INTEL_LOCS.acc.lon), iy(INTEL_LOCS.acc.lat) + 2]],
            ];
            truckRoutes.forEach((R, ri) => {
                const cum = polyLen(R);
                const L = cum[cum.length - 1];
                x.strokeStyle = 'rgba(214,178,112,.28)'; x.lineWidth = 1.4 * s; x.setLineDash([2 * s, 2.5 * s]);
                x.beginPath(); R.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke(); x.setLineDash([]);
                for (let q = 0; q < 3; q++) {
                    const d = ((T * 9 + q * (L / 3) + ri * 7) % L);
                    const [px, py, a] = polyAt(R, cum, d);
                    x.save(); x.translate(px, py); x.rotate(a); x.scale(s, s);
                    x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(-4, -1.6, 9, 4);
                    x.fillStyle = '#c99a5b'; x.fillRect(-5, -2.2, 7, 4.4); x.fillStyle = '#e9dcc4'; x.fillRect(2, -2, 3, 4);
                    x.restore();
                }
            });
            // Schiffe legen in Abidjan und Tema ab
            [['abj', -1], ['acc', 1]].forEach(([key, side], si) => {
                const L = INTEL_LOCS[key];
                const px0 = ix(L.lon); const py0 = iy(L.lat) + 4;
                for (let q = 0; q < 2; q++) {
                    const p = ((T * 0.05 + q * 0.5 + si * 0.25) % 1);
                    const px = px0 + side * p * 26; const py = py0 + 6 + p * 20;
                    x.save(); x.translate(px, py); x.rotate(Math.atan2(20, side * 26)); x.scale(s * 1.1, s * 1.1); x.globalAlpha = Math.min(1, p * 5) * (1 - p);
                    x.fillStyle = 'rgba(200,225,255,.35)'; x.beginPath(); x.moveTo(-14, -2); x.lineTo(-3, -1); x.lineTo(-3, 1); x.lineTo(-14, 2); x.fill();
                    x.fillStyle = '#e9dcc4'; x.beginPath(); x.moveTo(5, 0); x.lineTo(2, -2); x.lineTo(-4, -2); x.lineTo(-4, 2); x.lineTo(2, 2); x.closePath(); x.fill();
                    x.fillStyle = '#b8863f'; x.fillRect(-3, -1.2, 3.5, 2.4);
                    x.restore();
                }
            });
            // Wetter über der Region eines laufenden Gerüchts
            for (const r of (me.intel && me.intel.rumors) || []) {
                const k2 = r.region ? REGION_LOC[r.region] : null;
                if (!k2 || !WEST.includes(k2)) continue;
                const L = INTEL_LOCS[k2];
                const cx = ix(L.lon); const cy = iy(L.lat) - 18;
                if (/regen|black|pilz|schimmel/i.test(r.text)) {
                    x.fillStyle = 'rgba(200,210,225,.55)'; for (let q = 0; q < 3; q++) { x.beginPath(); x.arc(cx - 8 + q * 8, cy, 6 * s * 1.2 + 2, 0, 7); x.fill(); }
                    x.strokeStyle = 'rgba(160,200,255,.6)'; x.lineWidth = 0.8 * s; for (let q = 0; q < 8; q++) { const p = (T * 1.5 + q / 8) % 1; x.beginPath(); x.moveTo(cx - 12 + q * 3.4, cy + 5 + p * 14); x.lineTo(cx - 13 + q * 3.4, cy + 9 + p * 14); x.stroke(); }
                } else if (/dürre|trocken|hitze/i.test(r.text)) {
                    const g = x.createRadialGradient(cx, cy, 1, cx, cy, 14); g.addColorStop(0, 'rgba(255,200,90,.85)'); g.addColorStop(1, 'rgba(255,170,60,0)');
                    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 14 + Math.sin(T * 3) * 1.5, 0, 7); x.fill();
                } else {
                    x.save(); x.translate(cx, cy + Math.sin(T * 2) * 1.5); x.scale(s, s); x.font = '12px "Noto Color Emoji", sans-serif'; x.textAlign = 'center'; x.fillText(r.icon, 0, 4); x.restore();
                }
            }
        }
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
        termFx();
        termAnimSetup();
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
        if (!cv) return; // Kein Chart auf Terminal/Leitstand: alle schauen auf den grossen Screen
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
        const acc = term ? '132,180,214' : getComputedStyle(cv).getPropertyValue('--tcr').trim() || '217,178,111';
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
            c.strokeStyle = upC ? 'rgba(86,199,150,.45)' : 'rgba(226,104,120,.45)';
            c.fillStyle = upC ? 'rgba(86,199,150,.16)' : 'rgba(226,104,120,.16)';
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
        for (const [y0, y1, rgb, top] of [[0, yPlan, '86,199,150', true], [yPlan, H, '226,104,120', false]]) {
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
            c.shadowBlur = 0;
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
            c.fillStyle = 'rgba(10,8,6,.8)';
            c.fillRect(px - tw / 2, isHi ? py - 20 : py + 6, tw, 14);
            c.fillStyle = isHi ? '#7dffc0' : '#ff9aac';
            c.fillText(lab, px - tw / 2 + 4, isHi ? py - 9.5 : py + 16.5);
        }
        // Geld-/Briefkurs als Band und Preisschild am rechten Rand
        const last = d[n - 1];
        const col = last >= pub.p0 ? '#56c796' : '#e26878';
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
        c.fillStyle = 'rgba(86,199,150,.8)';
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
        const col = up ? '#56c796' : '#e26878';
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
            const c = buy ? '#56c796' : '#e26878';
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
                <rect x="${tx}" y="${ty - 10}" width="${tw}" height="20" rx="10" fill="rgba(10,8,6,.92)" stroke="${c}" stroke-width="1"/>
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
