// ===== KAKAO PIT – Host (grosser Bildschirm, ist gleichzeitig die Börse) =====

const Host = (() => {
    let code = null;
    let peer = null;
    let len = 'normal';
    const conns = new Map();
    let loopTimer = null;
    let lobbyTimer = null;
    let botCount = 0;
    let lastPrice = CFG.p0;
    let flashTimer = null;

    function joinUrl() {
        return `${location.origin}${location.pathname}?join=${code}`;
    }

    function create(length) {
        len = length;
        code = Net.makeCode();
        Engine.create(len, onEngine);
        Bots.reset();
        botCount = 0;
        App.show('v-lobby');
        $('room-code').textContent = code;
        $('h-code').textContent = code;
        const url = joinUrl();
        $('join-url').textContent = location.protocol === 'file:' ? 'Achtung: Die Datei muss online liegen, damit Handys beitreten können.' : url.replace(/^https?:\/\//, '').replace(/\?join=.*/, '');
        $('qr').innerHTML = '';
        if (typeof QRCode !== 'undefined' && location.protocol !== 'file:') {
            new QRCode($('qr'), { text: url, width: 180, height: 180, colorDark: '#e6edf7', colorLight: '#0d1424' });
        }
        if (!Net.available()) {
            $('net-status').innerHTML = '<span class="bad">PeerJS konnte nicht geladen werden. Besteht eine Internetverbindung?</span> Ihr könnt trotzdem mit KI-Tradern spielen.';
        } else {
            connect();
        }
        renderLobby();
        lobbyTimer = setInterval(renderLobby, 1000);
    }

    function connect() {
        peer = Net.host(code, {
            onOpen: () => { $('net-status').innerHTML = '<span class="good">● Raum ist offen.</span> Spieler können beitreten.'; },
            onConn: c => { conns.set(c.peer, { conn: c, pid: null }); },
            onData: handle,
            onClose: c => {
                const e = conns.get(c.peer);
                if (e && e.pid) {
                    const p = Engine.byId(e.pid);
                    if (p) p.connected = false;
                    if (Engine.G.phase === 'lobby') Engine.removePlayer(e.pid);
                }
                conns.delete(c.peer);
                renderLobby();
            },
            onError: t => {
                if (t === 'taken') {
                    peer.destroy();
                    code = Net.makeCode();
                    $('room-code').textContent = code;
                    $('h-code').textContent = code;
                    connect();
                } else {
                    $('net-status').innerHTML = `<span class="bad">Verbindungsproblem (${esc(t)}).</span> Prüft das Internet – oder das Schulnetz blockiert WebRTC.`;
                }
            },
        });
    }

    // ===== Nachrichten der Spieler =====

    function send(e, obj) {
        try {
            if (e && e.conn && e.conn.open) e.conn.send(obj);
        } catch (err) {
            // Verbindung weg – Spieler kann neu verbinden.
        }
    }

    function push(e) {
        if (!e.pid) return;
        const G = Engine.G;
        if (G.phase === 'end') return;
        send(e, { t: 's', pub: Engine.publicState(false), me: Engine.personal(e.pid) });
    }

    function handle(conn, msg) {
        const e = conns.get(conn.peer) || { conn, pid: null };
        conns.set(conn.peer, e);
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'join') {
            const p = Engine.addPlayer(String(msg.name || '').trim() || 'Trader', String(msg.key || ''));
            if (!p) return send(e, { t: 'reject', msg: 'Das Spiel läuft schon. Warte auf die nächste Runde.' });
            e.pid = p.id;
            send(e, { t: 'welcome', pid: p.id, role: p.role, name: p.name, phase: Engine.G.phase, code });
            push(e);
            Sound.play('join');
            renderLobby();
            return;
        }
        if (!e.pid) return;
        let r = { ok: false, msg: 'Unbekannte Aktion.' };
        const p = Engine.byId(e.pid);
        if (msg.t === 'trade') r = Engine.trade(e.pid, Number(msg.q));
        else if (msg.t === 'offer') r = Engine.postOffer(e.pid, msg.side === 'buy' ? 'buy' : 'sell', Number(msg.qty), Number(msg.price));
        else if (msg.t === 'accept') r = Engine.acceptOffer(e.pid, Number(msg.id));
        else if (msg.t === 'cancel') r = Engine.cancelOffer(e.pid, Number(msg.id));
        else if (msg.t === 'topup') r = Engine.topUp(e.pid);
        else if (msg.t === 'reduce' && p && p.pos) r = Engine.trade(e.pid, -Math.sign(p.pos) * Math.ceil(Math.abs(p.pos) / 2));
        send(e, { t: 'res', rid: msg.rid, ok: r.ok, msg: r.msg || null, price: r.price || null, q: r.q || null });
        push(e);
        if (r.ok && (msg.t === 'offer' || msg.t === 'accept')) conns.forEach(push);
    }

    // ===== Engine-Ereignisse =====

    function onEngine(type, data) {
        if (type === 'news') {
            conns.forEach(e => send(e, { t: 'news', item: data }));
            if (['rumor', 'yes', 'no', 'flash', 'alert'].includes(data.kind)) flash(data);
            if (data.kind === 'bell') Sound.play('bell');
        } else if (type === 'note') {
            conns.forEach(e => { if (e.pid === data.pid) send(e, { t: 'note', kind: data.kind, text: data.text }); });
        } else if (type === 'settle') {
            showSettle(data);
        } else if (type === 'trade') {
            Sound.play('tick');
        } else if (type === 'end') {
            clearInterval(loopTimer);
            const rows = data.rows;
            conns.forEach(e => {
                const row = rows.find(r => r.id === e.pid);
                if (row) send(e, { t: 'end', row, rank: rows.indexOf(row) + 1, total: rows.length, final: data.final, p0: data.p0, top: rows.slice(0, 3).map(r => ({ name: r.name, role: r.role, score: r.score })) });
            });
            setTimeout(() => showEnd(data), 1500);
        }
    }

    // ===== Lobby =====

    function renderLobby() {
        const G = Engine.G;
        if (!G || G.phase !== 'lobby') return;
        const cols = Object.keys(ROLES).map(k => {
            const ps = G.players.filter(p => p.role === k);
            return `<div class="role-col" style="--rc:${ROLES[k].color}"><h4>${ROLES[k].icon} ${ROLES[k].name} <span class="dim">${ps.length}</span></h4>
                ${ps.map(p => `<div class="lobby-player ${p.bot ? 'bot' : ''}">${p.bot ? '🤖 ' : ''}${esc(p.name)}</div>`).join('') || '<div class="dim small">–</div>'}</div>`;
        }).join('');
        $('lobby-roles').innerHTML = cols;
        $('lobby-count').textContent = G.players.length;
        $('bot-count').textContent = botCount;
        $('btn-start').disabled = G.players.length < 2;
        $('btn-start').title = G.players.length < 2 ? 'Mindestens 2 Trader (oder KI-Trader dazunehmen)' : '';
    }

    function addBot() {
        const G = Engine.G;
        const counts = { producer: 0, processor: 0, spec: 0 };
        G.players.forEach(p => { counts[p.role]++; });
        const role = Object.keys(counts).sort((a, b) => counts[a] - counts[b])[0];
        const used = new Set(G.players.map(p => p.name));
        const name = BOT_NAMES[role].find(n => !used.has(n)) || `${ROLES[role].short} ${G.players.length + 1}`;
        Engine.addPlayer(name, `bot-${Math.random()}`, true, role);
        botCount++;
        renderLobby();
    }

    function removeBot() {
        const G = Engine.G;
        const bot = [...G.players].reverse().find(p => p.bot);
        if (!bot) return;
        Engine.removePlayer(bot.id);
        botCount--;
        renderLobby();
    }

    function start() {
        clearInterval(lobbyTimer);
        Sound.init();
        Engine.start();
        App.show('v-host');
        lastPrice = Engine.G.price;
        resizeChart();
        render();
        conns.forEach(push);
        loopTimer = setInterval(loop, 1000);
    }

    function loop() {
        Engine.tick();
        if (Engine.G.phase === 'end') return;
        Bots.step();
        render();
        conns.forEach(push);
    }

    // ===== Darstellung =====

    const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    function render() {
        const S = Engine.publicState(true);
        $('h-months').innerHTML = Array.from({ length: S.months }, (_, i) => `<span class="${i + 1 < S.month ? 'done' : i + 1 === S.month ? 'now' : ''}">M${i + 1}</span>`).join('') + '<span class="due">DEZ</span>';
        $('h-timer').textContent = S.phase === 'settle' ? 'ABRECHNUNG' : mmss(S.secLeft);
        $('h-timer').classList.toggle('urgent', S.phase === 'trading' && S.secLeft <= 10);
        const pe = $('h-price');
        pe.textContent = fmt(S.price);
        pe.className = S.price > lastPrice ? 'up flashup' : S.price < lastPrice ? 'down flashdown' : '';
        lastPrice = S.price;
        const ch = S.price / S.p0 - 1;
        $('h-change').textContent = pct(ch);
        $('h-change').className = `chg ${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}`;
        drawChart(S);
        renderRank(S);
        renderNews(S);
        renderOffers(S);
        renderTape(S);
    }

    function renderRank(S) {
        $('h-rank').innerHTML = S.ranking.slice(0, 12).map((r, i) => {
            const R = ROLES[r.role];
            const pos = r.pos > 0 ? `<span class="up">L ${r.pos}</span>` : r.pos < 0 ? `<span class="down">S ${-r.pos}</span>` : '<span class="dim">–</span>';
            return `<div class="rank-row ${r.bankrupt ? 'dead' : ''}"><span class="rk">${i + 1}</span><span class="rr" style="color:${R.color}">${R.icon}</span>
                <span class="rn">${esc(r.name)}${r.bot ? ' <span class="dim">🤖</span>' : ''}${r.connected === false && !r.bot ? ' <span class="dim">⚠</span>' : ''}</span>
                <span class="rp">${pos}</span><span class="rs ${r.score >= 0 ? 'up' : 'down'}">${signed(r.score)}</span></div>`;
        }).join('') + (S.ranking.length > 12 ? `<div class="dim small">+ ${S.ranking.length - 12} weitere</div>` : '');
    }

    function newsClass(k) {
        return { rumor: 'rumor', yes: 'yes', no: 'no', flash: 'flash', alert: 'alert', settle: 'settle', bell: 'bell' }[k] || '';
    }

    function renderNews(S) {
        $('h-news').innerHTML = S.feed.slice(0, 6).map(n => `<div class="news ${newsClass(n.kind)} ${Engine.G.sec - n.sec < 1 ? 'fresh' : ''}"><span class="ni">${n.icon}</span><span>${esc(n.text)}</span></div>`).join('');
    }

    function renderOffers(S) {
        $('h-offers').innerHTML = S.offers.length ? S.offers.slice(0, 6).map(o => `<div class="offer-row ${o.side}">
            <span>${ROLES[o.role].icon} ${esc(o.byName)}</span><span class="${o.side === 'sell' ? 'down' : 'up'}">${o.side === 'sell' ? 'verkauft' : 'kauft'} ${o.qty}</span>
            <b>@ ${fmt(o.price)}</b><span class="obar"><span style="width:${(o.left / CFG.offerSec) * 100}%"></span></span></div>`).join('')
            : '<div class="dim small">Noch keine Angebote. Spieler können auf dem Handy eigene Preise aufs Board stellen.</div>';
    }

    function renderTape(S) {
        $('h-tape').innerHTML = S.tape.slice(0, 8).map(t => `<div class="tape ${t.kind} ${Engine.G.sec - t.sec < 1 ? 'fresh' : ''}"><span class="${t.q > 0 ? 'up' : 'down'}">${t.q > 0 ? '▲' : '▼'} ${Math.abs(t.q)}</span><span>${esc(t.who)}</span><b>${fmt(t.price)}</b></div>`).join('');
    }

    // ===== Chart =====

    let cv = null;
    let ctx = null;

    function resizeChart() {
        cv = $('chart');
        const r = cv.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        cv.width = r.width * dpr;
        cv.height = r.height * dpr;
        cv.style.width = `${r.width}px`;
        cv.style.height = `${r.height}px`;
        ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawChart(S, target = null) {
        const c = target || ctx;
        const el = target ? target.canvas : cv;
        if (!c) return;
        const dpr = window.devicePixelRatio || 1;
        const W = el.width / dpr;
        const H = el.height / dpr;
        const total = S.months * S.monthSec;
        const h = S.history;
        const prices = h.map(x => x.p);
        let lo = Math.min(...prices, S.p0) * 0.97;
        let hi = Math.max(...prices, S.p0) * 1.03;
        if (hi - lo < 300) {
            const m = (hi + lo) / 2;
            lo = m - 150;
            hi = m + 150;
        }
        const L = 64;
        const R = 18;
        const T = 22;
        const B = 30;
        const x = s => L + (s / total) * (W - L - R);
        const y = p => T + ((hi - p) / (hi - lo)) * (H - T - B);
        c.clearRect(0, 0, W, H);
        c.font = '12px "JetBrains Mono", monospace';
        c.fillStyle = '#5b6b85';
        c.strokeStyle = 'rgba(120,150,200,.10)';
        c.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const p = lo + ((hi - lo) * i) / 5;
            c.beginPath();
            c.moveTo(L, y(p));
            c.lineTo(W - R, y(p));
            c.stroke();
            c.fillText(fmt(p), 6, y(p) + 4);
        }
        for (let m = 1; m <= S.months; m++) {
            const xx = x(m * S.monthSec);
            c.strokeStyle = m === S.months ? 'rgba(255,200,80,.5)' : 'rgba(120,150,200,.25)';
            c.setLineDash([4, 6]);
            c.beginPath();
            c.moveTo(xx, T);
            c.lineTo(xx, H - B);
            c.stroke();
            c.setLineDash([]);
            c.fillStyle = '#5b6b85';
            c.fillText(m === S.months ? 'Fälligkeit' : `Abrechnung M${m}`, xx - (m === S.months ? 70 : 104), H - 10);
        }
        c.strokeStyle = 'rgba(255,255,255,.25)';
        c.setLineDash([2, 4]);
        c.beginPath();
        c.moveTo(L, y(S.p0));
        c.lineTo(W - R, y(S.p0));
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = 'rgba(255,255,255,.4)';
        c.fillText(`Plan ${fmt(S.p0)}`, W - R - 90, y(S.p0) - 6);
        if (h.length > 1) {
            const up = h[h.length - 1].p >= S.p0;
            const col = up ? '#22e58a' : '#ff4d6a';
            const grad = c.createLinearGradient(0, T, 0, H - B);
            grad.addColorStop(0, up ? 'rgba(34,229,138,.28)' : 'rgba(255,77,106,.28)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            c.beginPath();
            h.forEach((pt, i) => (i ? c.lineTo(x(pt.s), y(pt.p)) : c.moveTo(x(pt.s), y(pt.p))));
            c.lineTo(x(h[h.length - 1].s), H - B);
            c.lineTo(x(h[0].s), H - B);
            c.closePath();
            c.fillStyle = grad;
            c.fill();
            c.beginPath();
            h.forEach((pt, i) => (i ? c.lineTo(x(pt.s), y(pt.p)) : c.moveTo(x(pt.s), y(pt.p))));
            c.strokeStyle = col;
            c.lineWidth = 2.5;
            c.shadowColor = col;
            c.shadowBlur = 12;
            c.stroke();
            c.shadowBlur = 0;
            const last = h[h.length - 1];
            c.beginPath();
            c.arc(x(last.s), y(last.p), 5, 0, Math.PI * 2);
            c.fillStyle = col;
            c.fill();
        }
        // News markers on the timeline
        const feedItems = (S.feed || []).filter(n => ['rumor', 'yes', 'no', 'flash', 'alert'].includes(n.kind) && n.clock > 0);
        c.font = '16px sans-serif';
        feedItems.forEach(n => {
            const pt = h.find(q => q.s === n.clock) || h[h.length - 1];
            c.fillText(n.icon, x(n.clock) - 8, y(pt.p) - 12);
        });
    }

    // ===== Overlays =====

    function flash(n) {
        const el = $('flash');
        if (!el) return;
        const label = { rumor: 'GERÜCHT', yes: 'BESTÄTIGT', no: 'DEMENTI', flash: 'EILMELDUNG', alert: 'ACHTUNG' }[n.kind];
        el.className = `flash ${n.kind}`;
        el.innerHTML = `<div class="fl-label">${label}</div><div class="fl-text">${n.icon} ${esc(n.text.replace(/^[A-ZÄÖÜ ]+: /, ''))}</div>`;
        Sound.play(n.kind === 'alert' ? 'alarm' : 'news');
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => el.classList.add('hidden'), 5000);
    }

    function showSettle(data) {
        const G = Engine.G;
        const calls = G.players.filter(p => p.call).map(p => esc(p.name));
        const prev = G.marks.length > 1 ? G.marks[G.marks.length - 2].price : CFG.p0;
        const el = $('settle-ov');
        el.innerHTML = `<div class="settle-card card"><div class="dim">MONATSENDE · MARK-TO-MARKET</div><h2>Abrechnung Monat ${data.month}</h2>
            <div class="settle-price">${fmt(G.price)} <span class="${G.price >= prev ? 'up' : 'down'}">${pct(G.price / prev - 1)}</span></div>
            <p>Alle Positionen werden zum aktuellen Preis bewertet. Gewinne und Verluste fliessen auf die Margin-Konten.</p>
            ${calls.length ? `<p class="bad">📞 Margin Call für: ${calls.join(', ')}</p>` : '<p class="good">Keine Margin Calls.</p>'}
            ${G.marginRate > CFG.marginRate ? `<p class="bad">⚖️ Einschuss jetzt ${Math.round(G.marginRate * 100)} %</p>` : ''}
            ${data.month >= CFG.months ? '<p><b>Das war der letzte Monat. Gleich ist Fälligkeit!</b></p>' : ''}</div>`;
        el.classList.remove('hidden');
        Sound.play('bell');
        setTimeout(() => el.classList.add('hidden'), (CFG.settleSec - 1) * 1000);
    }

    function lessons(d) {
        const out = [];
        const dir = d.change >= 0 ? 'gestiegen' : 'gefallen';
        out.push(`Kakao ist von ${fmt(d.p0)} auf <b>${fmt(d.final)} CHF/t</b> ${dir} (${pct(d.change)}). Für 100 t sind das <b>${signed(100 * (d.final - d.p0))} CHF</b> Unterschied.`);
        const hedgers = d.rows.filter(r => r.role !== 'spec');
        const good = hedgers.filter(r => r.hedgeQuote >= 0.6).sort((a, b) => Math.abs(b.physPL) - Math.abs(a.physPL))[0];
        if (good) out.push(`🛡️ <b>${esc(good.name)}</b> (${ROLES[good.role].short}) hat sich zu ${Math.round(good.hedgeQuote * 100)} % abgesichert. Ohne Futures: <b>${signed(good.physPL)} CHF</b>. Mit Futures: <b>${signed(good.result)} CHF</b>. Die Futures haben den Preiseffekt zu einem grossen Teil ausgeglichen – in beide Richtungen. Genau das ist Hedging: Man verzichtet auf Glück, um Pech zu vermeiden.`);
        const naked = hedgers.filter(r => r.hedgeQuote < 0.4).sort((a, b) => a.result - b.result)[0];
        if (naked) out.push(`🎲 <b>${esc(naked.name)}</b> hat kaum abgesichert (${Math.round(naked.hedgeQuote * 100)} %) und trug das volle Preisrisiko: <b>${signed(naked.result)} CHF</b>. ${naked.result > 0 ? 'Diesmal Glück gehabt – das ist Spekulation, kein Plan.' : 'Genau davor schützt ein Future.'}`);
        const specs = d.rows.filter(r => r.role === 'spec').sort((a, b) => b.result - a.result);
        if (specs.length) out.push(`🦈 Bester Hedgefonds: <b>${esc(specs[0].name)}</b> mit ${signed(specs[0].result)} CHF. ${specs[specs.length - 1].result < 0 ? `Schlechtester: ${esc(specs[specs.length - 1].name)} mit ${signed(specs[specs.length - 1].result)} CHF.` : ''} Spekulanten übernehmen das Risiko, das Hedger loswerden wollen.`);
        const liq = d.rows.filter(r => r.liquidations > 0);
        if (liq.length) out.push(`📞 ${liq.length} ${liq.length === 1 ? 'Trader wurde' : 'Trader wurden'} zwangsweise glattgestellt (${liq.map(r => esc(r.name)).join(', ')}). Hebel wirkt in beide Richtungen – wer nicht nachschiessen kann, verliert die Position.`);
        return out;
    }

    function showEnd(d) {
        App.show('v-end');
        Sound.play('end');
        const podium = d.rows.slice(0, 3).map((r, i) => `<div class="pod p${i + 1}"><div class="pod-medal">${['🥇', '🥈', '🥉'][i]}</div><div class="pod-name">${ROLES[r.role].icon} ${esc(r.name)}</div><div class="pod-score ${r.score >= 0 ? 'up' : 'down'}">${signed(r.score)}</div></div>`).join('');
        const best = role => d.rows.filter(r => r.role === role)[0];
        const awards = Object.keys(ROLES).map(k => best(k)).filter(Boolean).map(r => `<div class="award" style="--rc:${ROLES[r.role].color}">${ROLES[r.role].icon} Beste${r.role === 'spec' ? 'r' : ''} ${ROLES[r.role].short}<b>${esc(r.name)}</b></div>`).join('');
        const table = d.rows.map((r, i) => `<tr class="${r.bankrupt ? 'dead' : ''}"><td>${i + 1}</td><td>${ROLES[r.role].icon} ${esc(r.name)}${r.bot ? ' 🤖' : ''}</td>
            <td class="num ${r.physPL >= 0 ? 'up' : 'down'}">${r.role === 'spec' ? '–' : signed(r.physPL)}</td>
            <td class="num ${r.futPL >= 0 ? 'up' : 'down'}">${signed(r.futPL)}</td>
            <td class="num">${r.role === 'spec' ? '–' : `${Math.round(r.hedgeQuote * 100)} %`}</td>
            <td class="num">${r.bonus ? `+${fmt(r.bonus)}` : '–'}</td>
            <td class="num ${r.score >= 0 ? 'up' : 'down'}"><b>${signed(r.score)}</b></td></tr>`).join('');
        $('end-wrap').innerHTML = `
            <div class="end-head"><div class="logo small"><span class="logo-k">KAKAO</span><span class="logo-p">PIT</span></div><h1>Fälligkeit · Schlusskurs ${fmt(d.final)} <span class="${d.change >= 0 ? 'up' : 'down'}">${pct(d.change)}</span></h1></div>
            <div class="podium">${podium}</div>
            <div class="awards">${awards}</div>
            <div class="end-grid">
                <div class="card"><h3>📈 Der Kursverlauf</h3><canvas id="end-chart"></canvas>
                    <h3>💡 Was wir gelernt haben</h3><ul class="lessons">${lessons(d).map(l => `<li>${l}</li>`).join('')}</ul></div>
                <div class="card"><h3>📊 Alle Trader</h3>
                    <table class="end-table"><thead><tr><th>#</th><th>Trader</th><th title="Gewinn/Verlust auf Kakao-Ernte oder -Einkauf durch die Preisänderung">Kakao</th><th title="Gewinn/Verlust aus Futures inkl. Gebühren">Futures</th><th>Hedge</th><th>Bonus</th><th>Total</th></tr></thead><tbody>${table}</tbody></table>
                    <p class="dim small">Kakao = Wirkung der Preisänderung auf eure Ernte bzw. euren Einkauf. Futures = Gewinn/Verlust aus allen Kontrakten. Bei guten Hedgern heben sich beide fast auf.</p>
                    <h3>🗣️ Diskussion</h3><ol class="lessons"><li>Warum haben gut abgesicherte Spieler nicht unbedingt am meisten verdient – und waren trotzdem erfolgreich?</li><li>Wer war die Gegenpartei der Kooperativen, als sie Futures verkauften?</li><li>Wann hat ein Gerücht den Preis bewegt – vor oder nach der Bestätigung?</li></ol>
                </div>
            </div>
            <div class="end-btns"><button class="btn btn-primary btn-big" onclick="location.href=location.pathname">Neue Runde</button></div>`;
        const ec = $('end-chart');
        const r = ec.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        ec.width = (r.width - 36) * dpr;
        ec.height = 240 * dpr;
        ec.style.width = `${r.width - 36}px`;
        ec.style.height = '240px';
        const c = ec.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawChart({ ...Engine.publicState(true), feed: d.feed }, c);
    }

    window.addEventListener('resize', () => {
        if (Engine.G && Engine.G.phase !== 'lobby' && Engine.G.phase !== 'end') {
            resizeChart();
            render();
        }
    });

    return { create, start, addBot, removeBot };
})();
