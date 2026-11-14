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
            onStatus: s => { $('join-err').textContent = s; },
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
        const R = ROLES[me.role];
        document.body.dataset.role = me.role;
        if ($('p-role').dataset.k !== me.role + me.name + me.level) {
            $('p-role').dataset.k = me.role + me.name + me.level;
            $('p-role').innerHTML = `<span class="p-emb">${roleIcon(me.role, 26)}</span><span><b>${esc(me.name)}</b><small>${RANKS[me.level].icon} ${RANKS[me.level].name} · ${R.short}</small></span>`;
        }
        $('p-month').textContent = pub.phase === 'settle' ? 'Abrechnung' : `Monat ${pub.month}/${pub.months}${pub.years > 1 ? ` · Jahr ${pub.year}` : ''}`;
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
        renderTrade(pub.phase !== 'trading' || me.bankrupt);
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
        $('p-buy').disabled = closed || room(1) <= 0;
        $('p-sell').disabled = closed || room(-1) <= 0;
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
        } else if (me.role === 'spec' && F.research) {
            const last = me.reports[me.reports.length - 1];
            if (last) html += `<div class="report">🕵️ ${esc(last.text)}</div>`;
            html += `<button class="btn btn-ghost full" data-rp="research" ${me.researchReady ? 'disabled' : ''}>🕵️ Research-Bericht · ${fmt(me.rumorActive ? me.researchCostNow : me.researchCostNow / 2)} CHF${me.researchReady ? ` · bereit in ${me.researchReady}s` : ''}<small>Sagt meistens richtig voraus, ob ein Gerücht stimmt (ca. ${Math.round(me.hitRate * 100)} %).</small></button>`;
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
            if (a === 'research') send({ t: 'research' });
        }));
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
            <p>Der Preis ist gegen dich gelaufen. Dein Pfand bei der Börse reicht nicht mehr. Leg <b>${fmt(me.call.need)} CHF</b> nach – oder verkleinere deine Position. Sonst wird sie zwangsweise geschlossen.</p>
            <button class="btn btn-primary btn-big" id="call-top" ${me.cash < me.call.need ? 'disabled' : ''}>Geld nachschiessen (${fmt(me.call.need)})</button>
            <button class="btn btn-ghost" id="call-reduce">Position halbieren</button></div>`;
        $('call-top').onclick = () => send({ t: 'topup' });
        $('call-reduce').onclick = () => send({ t: 'reduce' });
    }

    // ===== Geführter Einstieg: kurze Erklärungen genau dann, wenn sie gebraucht werden =====
    const coachSeen = new Set();
    const coachQueue = [];
    function coach(key, html) {
        if (coachSeen.has(key)) return;
        coachSeen.add(key);
        coachQueue.push(html);
        if (coachQueue.length === 1) showCoach();
    }
    function showCoach() {
        const el = $('p-coach');
        if (!coachQueue.length) { el.classList.add('hidden'); return; }
        el.innerHTML = `<div>${coachQueue[0]}</div><button class="btn btn-primary btn-sm">OK</button>`;
        el.classList.remove('hidden');
        el.querySelector('button').onclick = () => {
            coachQueue.shift();
            showCoach();
        };
    }
    function coachTriggers() {
        const R = ROLES[me.role];
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
        $('p-buy').addEventListener('click', () => send({ t: 'trade', q: me ? Math.max(1, Math.min(qty, room(1))) : qty }));
        $('p-sell').addEventListener('click', () => send({ t: 'trade', q: -(me ? Math.max(1, Math.min(qty, room(-1))) : qty) }));
        $('btn-rejoin').addEventListener('click', () => join(code, name));
        $('w-roles').querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.role === role) return;
            Sound.play('join');
            send({ t: 'role', role: b.dataset.role });
        }));
    }

    return { join, bind };
})();
