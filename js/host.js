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

    function create(length, years) {
        len = length;
        code = Net.makeCode();
        Engine.create(len, onEngine, years);
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
            const wish = ROLES[msg.role] ? msg.role : null;
            const p = Engine.addPlayer(String(msg.name || '').trim() || 'Trader', String(msg.key || ''), false, wish);
            if (!p) return send(e, { t: 'reject', msg: 'Das Spiel läuft schon. Warte auf die nächste Runde.' });
            e.pid = p.id;
            send(e, { t: 'welcome', pid: p.id, role: p.role, name: p.name, phase: Engine.G.phase, code });
            push(e);
            Sound.play('join');
            renderLobby();
            return;
        }
        if (!e.pid) return;
        if (msg.t === 'role') {
            if (Engine.setRole(e.pid, msg.role)) {
                send(e, { t: 'role', role: msg.role });
                renderLobby();
            } else send(e, { t: 'res', ok: false, msg: 'Die Rolle kann nur vor dem Start gewechselt werden.' });
            return;
        }
        let r = { ok: false, msg: 'Unbekannte Aktion.' };
        const p = Engine.byId(e.pid);
        if (msg.t === 'trade') r = Engine.trade(e.pid, Number(msg.q));
        else if (msg.t === 'offer') r = Engine.postOffer(e.pid, msg.side === 'buy' ? 'buy' : 'sell', Number(msg.qty), Number(msg.price));
        else if (msg.t === 'accept') r = Engine.acceptOffer(e.pid, Number(msg.id));
        else if (msg.t === 'cancel') r = Engine.cancelOffer(e.pid, Number(msg.id));
        else if (msg.t === 'topup') r = Engine.topUp(e.pid);
        else if (msg.t === 'reduce' && p && p.pos) r = Engine.trade(e.pid, -Math.sign(p.pos) * Math.ceil(Math.abs(p.pos) / 2));
        else if (msg.t === 'protect') r = Engine.protect(e.pid);
        else if (msg.t === 'order') r = Engine.answerOrder(e.pid, !!msg.accept);
        else if (msg.t === 'buyer') r = Engine.answerBuyer(e.pid, !!msg.accept);
        else if (msg.t === 'research') r = Engine.research(e.pid);
        else if (msg.t === 'upgrade') r = Engine.buyUpgrade(e.pid, String(msg.id));
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
        } else if (type === 'yearEnd') {
            showYearEnd(data);
            conns.forEach(e => {
                const row = data.rows.find(r => r.id === e.pid);
                if (!row) return;
                const B = BOARDS.find(b => b.role === row.role);
                const peers = data.rows.filter(r => r.role === row.role).sort(B.sort);
                send(e, { t: 'yearEnd', row, rank: peers.indexOf(row) + 1, total: peers.length, year: Engine.G.year, final: data.final });
            });
        } else if (type === 'upgrade') {
            shopFeed.unshift(data);
            renderShopFeed();
            Sound.play('cash');
        } else if (type === 'year') {
            $('year-ov').classList.add('hidden');
            axis.lo = null;
            anim.cur = null;
            volCache.n = -1;
            yearIntro(data.year);
        } else if (type === 'end') {
            clearInterval(loopTimer);
            const career = data.career;
            conns.forEach(e => {
                const row = career.find(r => r.id === e.pid);
                if (!row) return;
                const peers = career.filter(r => r.role === row.role);
                send(e, { t: 'end', career: row, rank: peers.indexOf(row) + 1, total: peers.length, top: peers.slice(0, 3).map(r => ({ name: r.name, role: r.role, final: r.final })), star: data.careerStar ? { id: data.careerStar.id, name: data.careerStar.name, role: data.careerStar.role, points: data.careerStar.points } : null, years: data.years });
            });
            $('year-ov').classList.add('hidden');
            setTimeout(() => showEnd(data), 1500);
        }
    }

    // ===== Lobby =====

    // Nur neu hinzugekommene Namen werden animiert – sonst würde alles bei jedem Update blinken.
    const seenInLobby = new Set();
    let lobbyHtml = '';

    function renderLobby() {
        const G = Engine.G;
        if (!G || G.phase !== 'lobby') return;
        const key = G.players.map(p => `${p.id}:${p.role}:${p.name}`).join('|');
        if (key !== lobbyHtml) {
            lobbyHtml = key;
            const cols = Object.keys(ROLES).map(k => {
                const ps = G.players.filter(p => p.role === k);
                return `<div class="role-col" style="--rc:${ROLES[k].color}"><h4>${roleIcon(k, 22)} ${ROLES[k].name} <span class="dim">${ps.length}</span></h4>
                    ${ps.map(p => {
                        const fresh = !seenInLobby.has(`${p.id}:${p.role}`);
                        seenInLobby.add(`${p.id}:${p.role}`);
                        return `<div class="lobby-player ${p.bot ? 'bot' : ''} ${fresh ? 'fresh' : ''}">${p.bot ? '🤖 ' : ''}${esc(p.name)}</div>`;
                    }).join('') || '<div class="dim small">–</div>'}</div>`;
            }).join('');
            $('lobby-roles').innerHTML = cols;
        }
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
        $('h-year').innerHTML = `<small>Jahr</small><b>${S.year}</b><small>/ ${S.years}</small>`;
        if (S.phase === 'shop') {
            const t = $('yo-timer');
            if (t) t.textContent = mmss(Math.max(0, S.shopLeft));
            $('h-timer').textContent = 'AUSBAU';
            return;
        }
        $('h-months').innerHTML = Array.from({ length: S.months }, (_, i) => `<span class="${i + 1 < S.month ? 'done' : i + 1 === S.month ? 'now' : ''}">M${i + 1}</span>`).join('') + '<span class="due">DEZ</span>';
        $('h-timer').textContent = S.phase === 'settle' ? 'ABRECHNUNG' : mmss(S.secLeft);
        $('h-timer').classList.toggle('urgent', S.phase === 'trading' && S.secLeft <= 10);
        const pe = $('h-price');
        pe.className = S.price > lastPrice ? 'up flashup' : S.price < lastPrice ? 'down flashdown' : '';
        lastPrice = S.price;
        const ch = S.price / S.p0 - 1;
        $('h-change').textContent = `${ch > 0 ? '▲' : ch < 0 ? '▼' : '•'} ${pct(ch)}`;
        $('h-change').className = `chg ${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}`;
        // Chart und Preis werden flüssig (60 fps) zum neuen Wert animiert.
        anim.from = anim.cur === null ? S.price : anim.to;
        anim.to = S.price;
        anim.t0 = performance.now();
        anim.S = S;
        if (!anim.running) {
            anim.running = true;
            requestAnimationFrame(frame);
        }
        // Fallback: Wenn das Gerät keine Animationsbilder liefert (z. B. Tab im Hintergrund), trotzdem aktuell zeichnen.
        if (performance.now() - (anim.lastFrame || 0) > 1500) {
            $('h-price').textContent = fmt(S.price);
            drawChart(S, null, S.price, performance.now(), 1);
        }
        renderRank(S);
        renderNews(S);
        renderHedges(S);
        renderTape(S);
    }

    const anim = { S: null, from: 0, to: 0, cur: null, t0: 0, running: false };

    function frame(now) {
        const G = Engine.G;
        if (!G || G.phase === 'end' || G.phase === 'lobby' || !anim.S) {
            anim.running = false;
            return;
        }
        // Linear über die ganze Sekunde: Kurs und Zeitachse wandern gleichmässig weiter (kein Ruck, kein Stocken).
        anim.lastFrame = performance.now();
        const k = Math.min(1, (now - anim.t0) / 1000);
        anim.k = k;
        anim.cur = anim.from + (anim.to - anim.from) * k;
        $('h-price').textContent = fmt(anim.cur);
        drawChart(anim.S, null, anim.cur, now, k);
        requestAnimationFrame(frame);
    }

    // Jede Rolle hat ihre eigene Rangliste: Bauern um den besten Verkaufspreis,
    // Fabriken um den günstigsten Einkauf, Fonds um den höchsten Gewinn.
    const BOARDS = [
        { role: 'producer', title: 'Bester Verkaufspreis', sort: (a, b) => b.metric - a.metric, val: r => `${fmt(r.metric)}<small>/t</small>`, cls: r => (r.metric >= Engine.G.p0 ? 'up' : 'down') },
        { role: 'processor', title: 'Günstigster Einkauf', sort: (a, b) => a.metric - b.metric, val: r => `${fmt(r.metric)}<small>/t</small>`, cls: r => (r.metric <= Engine.G.p0 ? 'up' : 'down') },
        { role: 'spec', title: 'Höchster Gewinn', sort: (a, b) => b.metric - a.metric, val: r => signed(r.metric), cls: r => (r.metric >= 0 ? 'up' : 'down') },
    ];

    // Ändert sich die Reihenfolge, gleiten die Zeilen an ihren neuen Platz (FLIP-Animation).
    // Sonst werden nur die Zahlen aktualisiert – nichts flackert.
    function renderRank(S) {
        const el = $('h-rank');
        const groups = BOARDS.map(B => ({ B, list: S.ranking.filter(r => r.role === B.role).sort(B.sort).slice(0, 5) })).filter(g => g.list.length);
        const key = groups.map(g => g.list.map(r => `${r.id}${r.bankrupt ? 'x' : ''}`).join(',')).join('|');
        if (el.dataset.k === key) {
            for (const { B, list } of groups) {
                for (const r of list) {
                    const rs = el.querySelector(`[data-k="${r.id}"] .rs`);
                    const v = B.val(r);
                    if (rs && rs.innerHTML !== v) {
                        rs.innerHTML = v;
                        rs.className = `rs ${B.cls(r)}`;
                    }
                }
            }
            return;
        }
        const before = new Map([...el.querySelectorAll('[data-k]')].map(n => [n.dataset.k, n.getBoundingClientRect().top]));
        el.dataset.k = key;
        el.innerHTML = groups.map(({ B, list }) => {
            const R = ROLES[B.role];
            return `<div class="rk-group" style="--rc:${R.color}"><div class="rk-head"><b>${roleIcon(B.role, 20)} ${R.short}</b> <span>${B.title}</span></div>
                ${list.map((r, i) => `<div class="rank-row ${r.bankrupt ? 'dead' : ''}" data-k="${r.id}"><span class="rk">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
                    <span class="rn">${esc(r.name)}${r.bot ? ' <span class="dim">🤖</span>' : ''}${r.connected === false && !r.bot ? ' <span class="dim">⚠</span>' : ''}</span>
                    <span class="rs ${B.cls(r)}">${B.val(r)}</span></div>`).join('')}</div>`;
        }).join('');
        el.querySelectorAll('[data-k]').forEach(n => {
            const top = before.get(n.dataset.k);
            if (top === undefined || !n.animate) return;
            const dy = top - n.getBoundingClientRect().top;
            if (Math.abs(dy) < 2) return;
            n.animate([{ transform: `translateY(${dy}px)`, background: 'rgba(255,181,71,.25)' }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,1,.3,1)' });
        });
    }

    // Absicherung der Hedger + Bankprüfung (statt Board)
    function renderHedges(S) {
        const G = Engine.G;
        const due = G.month <= CFG.bankMonth;
        const hedgers = S.ranking.filter(r => r.role !== 'spec').sort((a, b) => a.id - b.id).slice(0, 8);
        const el = $('h-offers');
        const key = `${due}|${hedgers.map(r => r.id).join(',')}`;
        // Gleiche Zeilen wie vorher? Dann nur Balken und Zahlen anpassen – die Balken gleiten dann weich.
        if (el.dataset.k !== key) {
            el.dataset.k = key;
            el.innerHTML = `<div class="bank-note ${due ? '' : 'done'}">🏦 ${due ? `Bankprüfung Ende Monat ${CFG.bankMonth}: mindestens <b>${Math.round(CFG.bankQuota * 100)} %</b> absichern – sonst ${fmt(CFG.bankFee)} CHF Zuschlag` : 'Bankprüfung vorbei'}</div>`
                + hedgers.map(r => `<div class="hedge-row" data-k="${r.id}"><span>${roleIcon(r.role, 16)} ${esc(r.name)}</span>
                    <div class="hbar"><i style="width:0%"></i><em style="left:${CFG.bankQuota * 100}%"></em></div><b></b></div>`).join('');
        }
        for (const r of hedgers) {
            const row = el.querySelector(`[data-k="${r.id}"]`);
            if (!row) continue;
            const bar = row.querySelector('.hbar i');
            const w = `${Math.min(100, Math.min(1.2, r.hedged) * 100)}%`;
            if (bar.style.width !== w) bar.style.width = w;
            bar.className = r.hedged >= CFG.bankQuota ? 'ok' : 'low';
            const txt = `${Math.round(r.hedged * 100)} %${r.bank === 'fail' ? ' 💸' : r.bank === 'ok' ? ' ✔' : ''}`;
            const b = row.querySelector('b');
            if (b.textContent !== txt) b.textContent = txt;
        }
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

    const axis = { lo: null, hi: null };
    const volCache = { n: -1, bins: [], max: 0 };

    function volumeBins() {
        const tr = Engine.G.trades;
        if (volCache.n === tr.length) return volCache;
        const m = new Map();
        for (const t of tr) {
            const v = m.get(t.s) || { abs: 0, net: 0 };
            v.abs += Math.abs(t.q);
            v.net += t.q;
            m.set(t.s, v);
        }
        volCache.n = tr.length;
        volCache.bins = [...m.entries()];
        volCache.max = Math.max(0, ...volCache.bins.map(([, v]) => v.abs));
        return volCache;
    }

    function drawChart(S, target = null, live = null, now = 0, k = 1) {
        const c = target || ctx;
        const el = target ? target.canvas : cv;
        if (!c) return;
        const dpr = window.devicePixelRatio || 1;
        const W = el.width / dpr;
        const H = el.height / dpr;
        const total = S.months * S.monthSec;
        let h = S.history;
        if (live !== null && h.length > 1) {
            // Der neueste Punkt wandert in der Zeit und im Preis gleichmässig vom letzten Punkt aus nach vorne.
            h = h.slice();
            const prev = h[h.length - 2];
            const last = h[h.length - 1];
            h[h.length - 1] = { s: prev.s + (last.s - prev.s) * k, p: live };
        }
        const prices = h.map(x => x.p);
        let lo = Math.min(...prices, S.p0) * 0.97;
        let hi = Math.max(...prices, S.p0) * 1.03;
        if (hi - lo < 300) {
            const m = (hi + lo) / 2;
            lo = m - 150;
            hi = m + 150;
        }
        if (!target) {
            // Achse gleitet sanft mit, statt zu springen
            if (axis.lo === null) {
                axis.lo = lo;
                axis.hi = hi;
            }
            axis.lo += (lo - axis.lo) * 0.06;
            axis.hi += (hi - axis.hi) * 0.06;
            lo = Math.min(axis.lo, Math.min(...prices) - 5);
            hi = Math.max(axis.hi, Math.max(...prices) + 5);
        }
        const L = 64;
        const R = 18;
        const T = 22;
        const B = 30;
        const x = s => L + (s / total) * (W - L - R);
        const y = p => T + ((hi - p) / (hi - lo)) * (H - T - B);
        c.clearRect(0, 0, W, H);
        // Monate als abwechselnde Bänder, aktueller Monat hervorgehoben
        for (let m = 0; m < S.months; m++) {
            const x0 = x(m * S.monthSec);
            const x1 = x((m + 1) * S.monthSec);
            const cur = !target && m + 1 === S.month;
            c.fillStyle = cur ? 'rgba(255,181,71,.06)' : m % 2 ? 'rgba(255,255,255,.018)' : 'rgba(0,0,0,0)';
            c.fillRect(x0, T, x1 - x0, H - T - B);
            c.fillStyle = cur ? 'rgba(255,181,71,.55)' : 'rgba(140,160,200,.35)';
            c.font = 'bold 11px "JetBrains Mono", monospace';
            c.fillText(`M${m + 1}`, x0 + 8, H - B - 8);
        }
        // Handelsvolumen pro Sekunde als dezente Balken am unteren Rand (grün = mehr gekauft, rot = mehr verkauft)
        const vol = volumeBins();
        if (vol.max) {
            const bw = Math.max(1.5, (W - L - R) / total - 0.6);
            for (const [s, v] of vol.bins) {
                const bh = (v.abs / vol.max) * 46;
                c.fillStyle = v.net >= 0 ? 'rgba(34,229,138,.28)' : 'rgba(255,77,106,.28)';
                c.fillRect(x(s) - bw / 2, H - B - bh, bw, bh);
            }
        }
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
            // Weiche Linie (Kurven durch die Mittelpunkte) mit Leuchten
            const path = () => {
                c.beginPath();
                c.moveTo(x(h[0].s), y(h[0].p));
                for (let i = 1; i < h.length - 1; i++) {
                    const mx = (x(h[i].s) + x(h[i + 1].s)) / 2;
                    const my = (y(h[i].p) + y(h[i + 1].p)) / 2;
                    c.quadraticCurveTo(x(h[i].s), y(h[i].p), mx, my);
                }
                c.lineTo(x(h[h.length - 1].s), y(h[h.length - 1].p));
            };
            path();
            c.strokeStyle = col;
            c.globalAlpha = 0.25;
            c.lineWidth = 9;
            c.stroke();
            c.globalAlpha = 1;
            path();
            c.lineWidth = 2.6;
            c.shadowColor = col;
            c.shadowBlur = 14;
            c.stroke();
            c.shadowBlur = 0;
            const last = h[h.length - 1];
            const lx = x(last.s);
            const ly = y(last.p);
            if (!target) {
                // pulsierender Ring am aktuellen Kurs
                const ph = ((now || performance.now()) % 1400) / 1400;
                c.beginPath();
                c.arc(lx, ly, 6 + ph * 18, 0, Math.PI * 2);
                c.strokeStyle = col;
                c.globalAlpha = 1 - ph;
                c.lineWidth = 2;
                c.stroke();
                c.globalAlpha = 1;
                // gestrichelte Linie zum Preisschild rechts
                c.setLineDash([3, 5]);
                c.strokeStyle = col;
                c.globalAlpha = 0.5;
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(lx, ly);
                c.lineTo(W - R, ly);
                c.stroke();
                c.setLineDash([]);
                c.globalAlpha = 1;
                const tag = fmt(last.p);
                c.font = 'bold 13px "JetBrains Mono", monospace';
                const tw = c.measureText(tag).width + 14;
                const tx = Math.min(W - R - tw, Math.max(lx + 14, W - R - tw));
                c.fillStyle = col;
                c.beginPath();
                c.roundRect ? c.roundRect(tx, ly - 11, tw, 22, 6) : c.rect(tx, ly - 11, tw, 22);
                c.fill();
                c.fillStyle = '#05080f';
                c.fillText(tag, tx + 7, ly + 5);
            }
            c.beginPath();
            c.arc(lx, ly, 5.5, 0, Math.PI * 2);
            c.fillStyle = '#fff';
            c.fill();
            c.beginPath();
            c.arc(lx, ly, 3.5, 0, Math.PI * 2);
            c.fillStyle = col;
            c.fill();
        }
        drawTradeMarks(c, x, y, W, L, T);
        // News markers on the timeline
        const feedItems = (S.feed || []).filter(n => ['rumor', 'yes', 'no', 'flash', 'alert'].includes(n.kind) && n.clock > 0);
        c.font = '16px sans-serif';
        feedItems.forEach(n => {
            const pt = h.find(q => q.s === n.clock) || h[h.length - 1];
            c.fillText(n.icon, x(n.clock) - 8, y(pt.p) - 12);
        });
    }

    // ===== Ein- und Ausstiege der Spieler im Chart =====
    // Nur echte Spieler (keine KI), nahe Trades zusammengefasst, Kürzel nur ohne Überlappung.
    const MARK_COLORS = ['#38bdf8', '#f472b6', '#facc15', '#4ade80', '#fb923c', '#c084fc', '#2dd4bf', '#f87171', '#a3e635', '#e879f9', '#60a5fa', '#fbbf24'];

    function markColor(pid) {
        const humans = Engine.G.players.filter(p => !p.bot).map(p => p.id);
        return MARK_COLORS[Math.max(0, humans.indexOf(pid)) % MARK_COLORS.length];
    }

    function tradeMarks() {
        const G = Engine.G;
        const human = new Set(G.players.filter(p => !p.bot).map(p => p.id));
        const out = [];
        for (const t of G.trades) {
            if (!human.has(t.pid)) continue;
            const last = out[out.length - 1];
            const prev = [...out].reverse().find(m => m.pid === t.pid);
            if (prev && prev.open === t.open && Math.sign(prev.q) === Math.sign(t.q) && t.s - prev.s <= 4) {
                prev.q += t.q;
                prev.price = t.price;
                continue;
            }
            out.push({ ...t });
            if (last && out.length > 80) out.shift();
        }
        return out;
    }

    function drawTradeMarks(c, x, y, W, L, T) {
        const G = Engine.G;
        const marks = tradeMarks();
        if (!marks.length) return;
        const labels = [];
        const free = (bx, by, bw, bh) => !labels.some(r => bx < r.x + r.w && bx + bw > r.x && by < r.y + r.h && by + bh > r.y);
        c.save();
        for (const m of marks) {
            const p = G.players.find(q => q.id === m.pid);
            if (!p) continue;
            const col = markColor(m.pid);
            const px = x(m.s);
            const py = y(m.price);
            const up = m.q > 0;
            c.lineWidth = 2;
            if (m.open) {
                // Einstieg: gefülltes Dreieck (▲ gekauft, ▼ verkauft)
                c.beginPath();
                if (up) { c.moveTo(px, py - 9); c.lineTo(px - 7, py + 4); c.lineTo(px + 7, py + 4); } else { c.moveTo(px, py + 9); c.lineTo(px - 7, py - 4); c.lineTo(px + 7, py - 4); }
                c.closePath();
                c.fillStyle = col;
                c.fill();
                c.strokeStyle = '#0b1020';
                c.stroke();
            } else {
                // Ausstieg: Ring
                c.beginPath();
                c.arc(px, py, 6, 0, Math.PI * 2);
                c.fillStyle = '#0b1020';
                c.fill();
                c.strokeStyle = col;
                c.lineWidth = 3;
                c.stroke();
            }
            const tag = p.name.slice(0, 3);
            c.font = 'bold 11px "Space Grotesk", sans-serif';
            const tw = c.measureText(tag).width + 8;
            const ty = up ? py + 12 : py - 26;
            const tx = px - tw / 2;
            if (free(tx, ty, tw, 15)) {
                labels.push({ x: tx, y: ty, w: tw, h: 15 });
                c.fillStyle = 'rgba(11,16,32,.85)';
                c.fillRect(tx, ty, tw, 15);
                c.fillStyle = col;
                c.fillText(tag, tx + 4, ty + 11);
            }
        }
        // Legende oben links
        const humans = G.players.filter(q => !q.bot && marks.some(m => m.pid === q.id));
        let lx = L + 8;
        const ly = T + 4;
        c.font = '12px "Space Grotesk", sans-serif';
        const key = '▲▼ Einstieg    ◯ Ausstieg';
        const kw = c.measureText(key).width + 22;
        const items = humans.map(h => ({ h, w: c.measureText(h.name.slice(0, 10)).width + 32 }));
        const total = kw + items.reduce((s, i) => s + i.w, 0) + 8;
        c.fillStyle = 'rgba(11,16,32,.8)';
        c.fillRect(L + 2, T - 6, Math.min(W - L - 20, total), 20);
        c.fillStyle = '#c8d3e6';
        c.fillText(key, lx, ly + 8);
        lx += kw;
        items.forEach(({ h, w }) => {
            if (lx + w > W - 20) return;
            c.fillStyle = markColor(h.id);
            c.fillRect(lx, ly, 10, 10);
            c.fillStyle = '#e6edf7';
            c.fillText(h.name.slice(0, 10), lx + 15, ly + 9);
            lx += w;
        });
        c.restore();
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
        const prev = G.marks.length > 1 ? G.marks[G.marks.length - 2].price : G.p0;
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
        const coops = d.rows.filter(r => r.role === 'producer').sort((a, b) => b.metric - a.metric);
        if (coops.length > 1) {
            const a = coops[0];
            const z = coops[coops.length - 1];
            out.push(`🌱 Gleiche Ernte, anderer Preis: <b>${esc(a.name)}</b> hat <b>${fmt(a.metric)} CHF/t</b> erzielt, <b>${esc(z.name)}</b> nur <b>${fmt(z.metric)} CHF/t</b>. Der Unterschied liegt fast nur im <i>Zeitpunkt</i> der Absicherung (und bei der Erntemenge).`);
        } else if (coops.length) out.push(`🌱 <b>${esc(coops[0].name)}</b> hat <b>${fmt(coops[0].metric)} CHF/t</b> erzielt – der Plan war ${fmt(d.p0)}.`);
        const facs = d.rows.filter(r => r.role === 'processor').sort((a, b) => a.metric - b.metric);
        if (facs.length) out.push(`🏭 Günstigster Einkauf: <b>${esc(facs[0].name)}</b> mit <b>${fmt(facs[0].metric)} CHF/t</b> (inkl. Auftragsmargen)${facs.length > 1 ? `, teuerster: ${esc(facs[facs.length - 1].name)} mit ${fmt(facs[facs.length - 1].metric)} CHF/t` : ''}.`);
        const hedgers = d.rows.filter(r => r.role !== 'spec');
        const good = hedgers.filter(r => r.hedgeQuote >= 0.6).sort((a, b) => Math.abs(b.physPL) - Math.abs(a.physPL))[0];
        if (good) out.push(`🛡️ <b>${esc(good.name)}</b> war gut abgesichert: Ohne Futures hätte das Geschäft <b>${signed(good.physPL)} CHF</b> gebracht, die Futures <b>${signed(good.futPL)} CHF</b>. Die beiden heben sich weitgehend auf – das ist Hedging.`);
        const naked = hedgers.filter(r => r.hedgeQuote < 0.4).sort((a, b) => a.result - b.result)[0];
        if (naked) out.push(`🎲 <b>${esc(naked.name)}</b> hat kaum abgesichert und trug das volle Preisrisiko: <b>${signed(naked.result)} CHF</b>. ${naked.result > 0 ? 'Diesmal Glück gehabt – das ist Spekulation, kein Plan.' : 'Genau davor schützt ein Future.'}`);
        const fined = d.rows.filter(r => r.bank === 'fail');
        if (fined.length) out.push(`🏦 ${fined.map(r => esc(r.name)).join(', ')} ${fined.length === 1 ? 'hat' : 'haben'} die Bankauflage verfehlt und ${fmt(CFG.bankFee)} CHF Zuschlag bezahlt. Banken verlangen Absicherung, weil sie sonst das Preisrisiko mittragen.`);
        const specs = d.rows.filter(r => r.role === 'spec').sort((a, b) => b.result - a.result);
        if (specs.length) out.push(`🦈 Bester Hedgefonds: <b>${esc(specs[0].name)}</b> mit ${signed(specs[0].result)} CHF. ${specs[specs.length - 1].result < 0 ? `Schlechtester: ${esc(specs[specs.length - 1].name)} mit ${signed(specs[specs.length - 1].result)} CHF.` : ''} Spekulanten übernehmen das Risiko, das Hedger loswerden wollen.`);
        const shrunk = d.rows.filter(r => r.role === 'producer' && r.physical !== 100).sort((a, b) => a.physical - b.physical)[0];
        if (shrunk) out.push(`🌱 <b>${esc(shrunk.name)}</b> hat am Ende <b>${shrunk.physical} t</b> statt 100 t geerntet${shrunk.protect ? ' (mit Pflanzenschutz)' : ''}. Futures sichern den <i>Preis</i> ab, nicht die <i>Menge</i>: Wer mehr verkauft, als er erntet, ist überabgesichert und spekuliert plötzlich.`);
        const factory = d.rows.filter(r => r.role === 'processor' && r.orders).sort((a, b) => b.orderT - a.orderT)[0];
        if (factory) out.push(`🏭 <b>${esc(factory.name)}</b> hat ${factory.orders} Kundenaufträge über ${factory.orderT} t angenommen. Marge zum Schlusskurs: <b class="${factory.orderMargin >= 0 ? 'up' : 'down'}">${signed(factory.orderMargin)} CHF</b>. Mit Long-Futures war diese Marge schon beim Annehmen fix.`);
        const analyst = d.rows.filter(r => r.role === 'spec' && r.reports).sort((a, b) => b.result - a.result)[0];
        if (analyst) out.push(`🕵️ <b>${esc(analyst.name)}</b> hat ${analyst.reports} Research-Berichte gekauft (${fmt(analyst.researchSpent)} CHF). Information hat einen Preis – und ist nie ganz sicher.`);
        const liq = d.rows.filter(r => r.liquidations > 0);
        if (liq.length) out.push(`📞 ${liq.length} ${liq.length === 1 ? 'Trader wurde' : 'Trader wurden'} zwangsweise glattgestellt (${liq.map(r => esc(r.name)).join(', ')}). Hebel wirkt in beide Richtungen – wer nicht nachschiessen kann, verliert die Position.`);
        return out;
    }

    // ===== Jahresende & Ausbauphase =====

    let shopFeed = [];

    function yearRowVal(r) {
        if (r.role === 'spec') return signed(r.yearResult);
        return `${fmt(r.metric)}<small>/t</small>`;
    }

    function showYearEnd(d) {
        const G = Engine.G;
        shopFeed = [];
        $('settle-ov').classList.add('hidden');
        $('flash').classList.add('hidden');
        Sound.play('end');
        setTimeout(() => confetti(2500), 300);
        const cols = BOARDS.map(B => {
            const list = d.rows.filter(r => r.role === B.role).sort(B.sort);
            if (!list.length) return '';
            const R = ROLES[B.role];
            return `<div class="yo-col" style="--rc:${R.color}"><div class="yo-col-h">${roleIcon(B.role, 30)}<div><b>${R.short}</b><small>${B.title}</small></div></div>
                ${list.slice(0, 4).map((r, i) => `<div class="yo-row ${i === 0 ? 'win' : ''}" style="animation-delay:${0.25 + i * 0.12}s"><span class="yo-rk">${['🥇', '🥈', '🥉'][i] || i + 1}</span><span class="yo-n">${esc(r.name)}${r.bot ? ' 🤖' : ''}</span><span class="yo-v ${B.cls(r)}">${yearRowVal(r)}</span><span class="yo-res ${r.yearResult >= 0 ? 'up' : 'down'}">${signed(r.yearResult)}</span></div>`).join('')}</div>`;
        }).join('');
        const promos = d.rows.filter(r => r.promoted).map(r => `<span class="promo">${RANKS[r.level].icon} <b>${esc(r.name)}</b> steigt auf: <b>${RANKS[r.level].name}</b></span>`).join('');
        const el = $('year-ov');
        el.innerHTML = `<div class="yo-card">
            <div class="yo-top"><div><div class="yo-kicker">JAHR ${G.year} VON ${G.years} ABGESCHLOSSEN</div><h2>Schlusskurs ${fmt(d.final)} CHF/t <span class="${d.change >= 0 ? 'up' : 'down'}">${pct(d.change)}</span></h2></div>
                ${d.star ? `<div class="yo-star">⭐ Trader des Jahres<b>${roleIcon(d.star.role, 22)} ${esc(d.star.name)}</b></div>` : ''}</div>
            <div class="yo-cols">${cols}</div>
            ${promos ? `<div class="yo-promos">${promos}</div>` : ''}
            <div class="yo-shop"><div class="yo-shop-h"><span>🏗️ AUSBAUPHASE</span><b id="yo-timer">${Math.floor(CFG.shopSec / 60)}:${String(CFG.shopSec % 60).padStart(2, '0')}</b></div>
                <p>Investiert euren Gewinn am Handy in eure Firma. Jede Investition muss sich in den nächsten Jahren auszahlen!</p>
                <div id="yo-feed" class="yo-feed"><div class="dim small">Noch keine Investitionen …</div></div>
                <button class="btn btn-primary btn-big" id="yo-next">Weiter zu Jahr ${G.year + 1} ▶</button></div>
        </div>`;
        el.classList.remove('hidden');
        $('yo-next').onclick = () => {
            Engine.nextYear();
            render();
            conns.forEach(push);
        };
    }

    function renderShopFeed() {
        const f = $('yo-feed');
        if (!f) return;
        f.innerHTML = shopFeed.slice(0, 8).map((x, i) => `<div class="yo-buy ${i === 0 ? 'fresh' : ''}" style="--rc:${ROLES[x.role].color}">${x.u.icon} <b>${esc(x.name)}</b> kauft <b>${x.u.name}</b><span>−${fmt(x.u.cost)}</span></div>`).join('');
    }

    function yearIntro(year) {
        const el = $('year-intro');
        el.innerHTML = `<div class="yi-k">ERNTEJAHR</div><div class="yi-n">${year}</div><div class="yi-s">Neuer Planpreis ${fmt(Engine.G.p0)} CHF/t · neue Ernte, neue Gerüchte</div>`;
        el.classList.remove('hidden', 'go');
        void el.offsetWidth;
        el.classList.add('go');
        Sound.play('bell');
        setTimeout(() => el.classList.add('hidden'), 2900);
    }

    // ===== Preisverleihung (Schluss-Show) =====

    function showEnd(d) {
        App.show('v-end');
        const career = d.career;
        const stages = [];
        stages.push(() => `<div class="sh-stage sh-intro"><div class="sh-kicker">NACH ${d.years} ${d.years === 1 ? 'JAHR' : 'JAHREN'} KAKAO-HANDEL</div><h1 class="sh-title">Die Preisverleihung</h1><div class="sh-drum">🥁</div></div>`);
        for (const B of BOARDS) {
            const list = career.filter(r => r.role === B.role);
            if (!list.length) continue;
            const w = list[0];
            const R = ROLES[B.role];
            stages.push(() => {
                setTimeout(() => confetti(2600, [R.color, '#ffffff', '#ffd27a']), 900);
                return `<div class="sh-stage sh-award" style="--rc:${R.color}"><div class="sh-kicker">BESTE${B.role === 'spec' ? 'R' : ''} ${R.name.toUpperCase()}</div>
                    <div class="sh-envelope">✉️</div>
                    <div class="sh-reveal"><div class="sh-emb">${roleIcon(B.role, 120)}</div><div class="sh-name">${esc(w.name)}</div>
                    <div class="sh-rank">${RANKS[w.level].icon} ${RANKS[w.level].name}</div>
                    <div class="sh-val ${w.final >= 0 ? 'up' : 'down'}">${signed(w.final)} CHF</div>
                    <div class="sh-sub">${w.years.map(y => `Jahr ${y.year}: <b class="${y.result >= 0 ? 'up' : 'down'}">${signed(y.result)}</b>`).join(' · ')}</div></div></div>`;
            });
        }
        if (d.careerStar) {
            const s = d.careerStar;
            stages.push(() => {
                setTimeout(() => confetti(5500), 1000);
                Sound.play('end');
                return `<div class="sh-stage sh-starstage"><div class="sh-kicker">UND JETZT DER WICHTIGSTE PREIS</div><div class="sh-bigstar">⭐</div>
                    <div class="sh-reveal"><div class="sh-title">Trader des Tages</div><div class="sh-name">${roleIcon(s.role, 64)} ${esc(s.name)}</div>
                    <div class="sh-sub">${signed(s.points)} Punkte · über alle Jahre am deutlichsten besser als die eigene Rolle</div></div></div>`;
            });
        }
        let i = 0;
        let timer = null;
        const wrap = $('end-wrap');
        const next = () => {
            if (i >= stages.length) return board(d);
            wrap.innerHTML = `<div class="show">${stages[i]()}<button class="btn btn-ghost sh-skip" id="sh-skip">Überspringen ⏭</button></div>`;
            $('sh-skip').onclick = () => {
                clearTimeout(timer);
                board(d);
            };
            Sound.play(i === 0 ? 'drum' : 'fanfare');
            i++;
            timer = setTimeout(next, i === 1 ? 3200 : 4600);
        };
        next();
    }

    function board(d) {
        const career = d.career;
        const order = BOARDS.flatMap(B => career.filter(r => r.role === B.role).map((r, i) => ({ r, i })));
        const ys = Array.from({ length: d.years }, (_, k) => k + 1);
        const table = order.map(({ r, i }) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td><span class="tb-n">${roleIcon(r.role, 18)} ${esc(r.name)}${r.bot ? ' 🤖' : ''}</span></td>
            <td><span class="rank-badge l${r.level}">${RANKS[r.level].icon} ${RANKS[r.level].name}</span></td>
            ${ys.map(y => { const yy = r.years.find(x => x.year === y); return `<td class="num ${yy && yy.result >= 0 ? 'up' : 'down'}">${yy ? signed(yy.result) : '–'}</td>`; }).join('')}
            <td class="num">${r.upgrades.map(u => (UPGRADES[r.role].find(x => x.id === u) || {}).icon || '').join(' ') || '–'}${r.upSpent ? `<small class="dim"> −${fmt(r.upSpent)}</small>` : ''}</td>
            <td class="num ${r.final >= 0 ? 'up' : 'down'}"><b>${signed(r.final)}</b></td>
            <td class="num ${r.points >= 0 ? 'up' : 'down'}">${signed(r.points)}</td></tr>`).join('');
        const winners = BOARDS.map(B => ({ B, r: career.filter(x => x.role === B.role)[0] })).filter(x => x.r);
        const podium = winners.map(({ B, r }, k) => `<div class="pod p${k === 1 ? 1 : k === 0 ? 2 : 3}" style="--rc:${ROLES[r.role].color}"><div class="pod-medal">🏆</div><div class="pod-emb">${roleIcon(r.role, 56)}</div><div class="pod-role">Beste${B.role === 'spec' ? 'r' : ''} ${ROLES[B.role].short}</div><div class="pod-name">${esc(r.name)}</div><div class="pod-score ${r.final >= 0 ? 'up' : 'down'}">${signed(r.final)}</div></div>`).join('');
        $('end-wrap').innerHTML = `
            <div class="end-head"><div class="logo small"><span class="logo-k">KAKAO</span><span class="logo-p">PIT</span></div><h1>Karriere-Bilanz · ${d.years} ${d.years === 1 ? 'Jahr' : 'Jahre'}</h1></div>
            ${d.careerStar ? `<div class="star card" style="--rc:${ROLES[d.careerStar.role].color}"><div class="star-ico">⭐</div><div><div class="star-t">Trader des Tages</div><div class="star-n">${roleIcon(d.careerStar.role, 36)} ${esc(d.careerStar.name)}</div>
                <div class="star-d">${signed(d.careerStar.points)} Punkte über alle Jahre</div></div></div>` : ''}
            <div class="podium">${podium}</div>
            <div class="end-grid">
                <div class="card wide"><h3>📊 Alle Firmen über ${d.years} ${d.years === 1 ? 'Jahr' : 'Jahre'}</h3>
                    <table class="end-table"><thead><tr><th>#</th><th>Firma</th><th>Rang</th>${ys.map(y => `<th>Jahr ${y}</th>`).join('')}<th>Ausbau</th><th>Endergebnis</th><th>⭐</th></tr></thead><tbody>${table}</tbody></table>
                    <p class="dim small">Endergebnis = Summe der Jahresergebnisse − Ausbau-Investitionen − Zinsen für Notkredite. Hat sich der Ausbau gelohnt?</p></div>
                <div class="card"><h3>📈 Kursverlauf im letzten Jahr</h3><canvas id="end-chart"></canvas>
                    <h3>💡 Was wir gelernt haben</h3><ul class="lessons">${lessons(d).map(l => `<li>${l}</li>`).join('')}</ul></div>
                <div class="card"><h3>🗣️ Diskussion</h3><ol class="lessons">
                    <li>Welche Investition hat sich am meisten gelohnt – und welche nicht?</li>
                    <li>Welche Kooperative hat den besten Zeitpunkt zum Absichern erwischt – Können oder Glück?</li>
                    <li>Warum haben gut abgesicherte Spieler nicht unbedingt am meisten verdient – und waren trotzdem erfolgreich?</li>
                    <li>Wer war die Gegenpartei der Kooperativen, als sie Futures verkauften?</li></ol>
                    <h3>🗓️ Die Jahre im Überblick</h3>${d.yearLog.map(y => `<div class="yl-row"><b>Jahr ${y.year}</b><span>${fmt(y.p0)} → ${fmt(y.final)} CHF/t</span><span class="${y.final >= y.p0 ? 'up' : 'down'}">${pct(y.final / y.p0 - 1)}</span>${y.star ? `<span>⭐ ${esc(y.star.name)}</span>` : ''}</div>`).join('')}</div>
            </div>
            <div class="end-btns"><button class="btn btn-primary btn-big" onclick="location.href=location.pathname">Neues Spiel</button></div>`;
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
