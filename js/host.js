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

    // Avatar: Initialen auf einem Farbverlauf, der aus dem Namen berechnet wird (immer gleich für denselben Namen)
    function avatar(name, bot) {
        let hsh = 0;
        for (const ch of String(name)) hsh = (hsh * 31 + ch.codePointAt(0)) >>> 0;
        const hue = hsh % 360;
        const ini = String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
        return `<i class="av ${bot ? 'bot' : ''}" style="--h:${hue}">${esc(ini)}</i>`;
    }

    // Schwebender Kakao-Staub hinter dem Beamer (30 Bilder/s, pausiert im Hintergrund)
    const Ambient = (() => {
        let cv = null;
        let c = null;
        let parts = [];
        let last = 0;
        const spawn = any => ({
            x: Math.random() * innerWidth,
            y: any ? Math.random() * innerHeight : innerHeight + 20,
            r: 0.8 + Math.random() * 2.6,
            v: 6 + Math.random() * 20,
            w: Math.random() * 6.28,
            a: 0.12 + Math.random() * 0.33,
            col: Math.random() < 0.7 ? '255,170,90' : Math.random() < 0.5 ? '255,226,170' : '140,170,255',
        });
        function size() {
            const d = Math.min(1.5, window.devicePixelRatio || 1);
            cv.width = innerWidth * d;
            cv.height = innerHeight * d;
            c.setTransform(d, 0, 0, d, 0, 0);
        }
        function step(t) {
            requestAnimationFrame(step);
            if (document.hidden || t - last < 33) return;
            const dt = Math.min(0.1, (t - last) / 1000);
            last = t;
            c.clearRect(0, 0, innerWidth, innerHeight);
            for (const p of parts) {
                p.y -= p.v * dt;
                p.w += dt * 0.7;
                p.x += Math.sin(p.w) * 9 * dt;
                if (p.y < -20) Object.assign(p, spawn(false));
                const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
                g.addColorStop(0, `rgba(${p.col},${p.a})`);
                g.addColorStop(1, `rgba(${p.col},0)`);
                c.fillStyle = g;
                c.fillRect(p.x - p.r * 4, p.y - p.r * 4, p.r * 8, p.r * 8);
            }
        }
        return {
            start() {
                if (cv || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
                cv = document.createElement('canvas');
                cv.id = 'ambient';
                document.body.prepend(cv);
                c = cv.getContext('2d');
                size();
                window.addEventListener('resize', size);
                parts = Array.from({ length: 48 }, () => spawn(true));
                requestAnimationFrame(step);
            },
        };
    })();

    function joinUrl() {
        return `${location.origin}${location.pathname}?join=${code}`;
    }

    function create(length, years) {
        len = length;
        code = Net.makeCode();
        Engine.create(len, onEngine, years);
        Ambient.start();
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
            onStatus: s => {
                if (s === 'reconnect') $('net-status').innerHTML = '<span class="bad">● Verbindung zum Vermittler unterbrochen</span> – verbinde automatisch neu … (Spiel läuft weiter)';
            },
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
        else if (msg.t === 'topup') r = Engine.topUp(e.pid);
        else if (msg.t === 'reduce' && p && p.pos) r = Engine.trade(e.pid, -Math.sign(p.pos) * Math.ceil(Math.abs(p.pos) / 2));
        else if (msg.t === 'protect') r = Engine.protect(e.pid);
        else if (msg.t === 'order') r = Engine.answerOrder(e.pid, !!msg.accept);
        else if (msg.t === 'buyer') r = Engine.answerBuyer(e.pid, !!msg.accept);
        else if (msg.t === 'research') r = Engine.research(e.pid);
        else if (msg.t === 'upgrade') r = Engine.buyUpgrade(e.pid, String(msg.id));
        send(e, { t: 'res', rid: msg.rid, ok: r.ok, msg: r.msg || null, price: r.price || null, q: r.q || null });
        push(e);
    }

    // ===== Engine-Ereignisse =====

    function onEngine(type, data) {
        if (type === 'news') {
            conns.forEach(e => send(e, { t: 'news', item: data }));
            if (['rumor', 'yes', 'no', 'flash', 'alert'].includes(data.kind)) flash(data);
            if (data.region) addMapPin(data);
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
        } else if (type === 'newFeatures') {
            conns.forEach(e => {
                const p = Engine.byId(e.pid);
                if (!p) return;
                const mine = data.keys.filter(k => FEATURE_TEXT[k].role === p.role);
                if (mine.length) send(e, { t: 'newFeatures', year: data.year, keys: mine });
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

    // Kleine Welt-Szene pro Rolle als Kopf der Lobby-Spalte
    const LOBBY_SCENE = {
        producer: `<svg viewBox="0 0 300 90" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ls1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3e8fd6"/><stop offset="1" stop-color="#f5d9a0"/></linearGradient></defs><rect width="300" height="90" fill="url(#ls1)"/><circle cx="235" cy="26" r="13" fill="#fff3b0" class="ls-sun"/><g class="ls-cloud"><ellipse cx="60" cy="22" rx="26" ry="8" fill="rgba(255,255,255,.8)"/><ellipse cx="78" cy="17" rx="16" ry="8" fill="rgba(255,255,255,.9)"/></g><path d="M0 62 Q 80 40 160 58 T 300 52 V90 H0Z" fill="#2d6e2c"/><path d="M0 76 Q 100 60 200 74 T 300 70 V90 H0Z" fill="#3c8c3a"/>${[30, 80, 130, 180, 230, 275].map((x, i) => `<g class="ls-tree" style="animation-delay:${i * -0.7}s" transform="translate(${x} ${66 + (i % 2) * 8})"><rect x="-1.5" y="-14" width="3" height="16" fill="#5b3a1f"/><circle cy="-20" r="9" fill="#2f9e44"/><circle cx="-6" cy="-15" r="6" fill="#3fbf55"/><circle cx="6" cy="-15" r="6" fill="#2f9e44"/><ellipse cx="2" cy="-8" rx="2" ry="3.4" fill="#f0a63a"/></g>`).join('')}</svg>`,
        processor: `<svg viewBox="0 0 300 90" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ls2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2230"/><stop offset="1" stop-color="#4a3a2c"/></linearGradient></defs><rect width="300" height="90" fill="url(#ls2)"/><g class="ls-smoke"><circle cx="232" cy="18" r="7"/><circle cx="240" cy="9" r="9"/><circle cx="250" cy="2" r="11"/></g><rect x="226" y="22" width="12" height="40" fill="#5b6576"/><path d="M70 62 V44 L100 30 V44 L130 30 V44 L160 30 V44 L190 30 V44 L220 30 V62Z" fill="#4a5568"/><rect x="70" y="62" width="150" height="28" fill="#2d3748"/>${[0, 1, 2, 3].map(i => `<rect x="${82 + i * 34}" y="68" width="20" height="10" rx="2" fill="#ffcf6b" class="ls-win" style="animation-delay:${i * 0.5}s"/>`).join('')}<rect x="18" y="26" width="36" height="64" rx="6" fill="#aeb8c6"/><rect x="21" y="52" width="30" height="36" rx="4" fill="#c86a12"/><g class="ls-belt">${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 30}" y="82" width="18" height="8" rx="2" fill="#7a4320"/>`).join('')}</g></svg>`,
        spec: `<svg viewBox="0 0 300 90" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ls3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140d2a"/><stop offset="1" stop-color="#2a1b4f"/></linearGradient></defs><rect width="300" height="90" fill="url(#ls3)"/>${[[20, 50], [44, 34], [70, 58], [96, 40], [122, 26], [148, 46], [174, 30], [200, 18], [226, 38], [252, 22], [278, 12]].map(([x, yy], i) => `<g class="ls-candle" style="animation-delay:${i * 0.12}s"><line x1="${x}" x2="${x}" y1="${yy - 8}" y2="${yy + 22}" stroke="${i % 3 === 1 ? '#ff4d6a' : '#22e58a'}" stroke-width="1.5"/><rect x="${x - 5}" y="${yy}" width="10" height="${12 + (i % 3) * 3}" fill="${i % 3 === 1 ? '#ff4d6a' : '#22e58a'}" rx="1.5"/></g>`).join('')}<polyline points="20,64 70,70 122,48 174,52 226,40 278,26" fill="none" stroke="#ffb547" stroke-width="2" class="ls-line"/><rect y="78" width="300" height="12" fill="rgba(0,0,0,.35)"/></svg>`,
    };

    function renderLobby() {
        const G = Engine.G;
        if (!G || G.phase !== 'lobby') return;
        const key = G.players.map(p => `${p.id}:${p.role}:${p.name}`).join('|');
        if (key !== lobbyHtml) {
            lobbyHtml = key;
            // Nur die Spielerlisten neu zeichnen – die Szenen bleiben stehen und laufen weiter.
            if (!$('lobby-roles').querySelector('.role-col')) {
                $('lobby-roles').innerHTML = Object.keys(ROLES).map(k => `<div class="role-col" data-role="${k}" style="--rc:${ROLES[k].color}">
                    <div class="rc-world">${LOBBY_SCENE[k]}<span class="rc-emb">${roleIcon(k, 44)}</span></div>
                    <h4>${ROLES[k].name} <span class="rc-n">0</span></h4><div class="rc-job">${esc(ROLES[k].goal)}</div>
                    <div class="rc-list"></div></div>`).join('');
            }
            Object.keys(ROLES).forEach(k => {
                const col = $('lobby-roles').querySelector(`[data-role="${k}"]`);
                const ps = G.players.filter(p => p.role === k);
                col.querySelector('.rc-n').textContent = ps.length;
                col.querySelector('.rc-list').innerHTML = ps.map(p => {
                    const fresh = !seenInLobby.has(`${p.id}:${p.role}`);
                    seenInLobby.add(`${p.id}:${p.role}`);
                    return `<div class="lobby-player ${p.bot ? 'bot' : ''} ${fresh ? 'fresh' : ''}">${avatar(p.name, p.bot)}<span>${esc(p.name)}</span>${p.bot ? '<em>KI</em>' : ''}</div>`;
                }).join('') || '<div class="rc-empty">Wartet auf Trader …</div>';
            });
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
        const bot = Engine.addPlayer(name, `bot-${Math.random()}`, true, role);
        // Kooperativen-Bots heissen nach ihrer Anbauregion
        if (bot && role === 'producer' && bot.region) {
            const pool = REGION_BOTS[bot.region] || [];
            bot.name = pool.find(n => !used.has(n)) || bot.name;
        }
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
        renderMap(S);
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
                ${list.map((r, i) => `<div class="rank-row ${r.bankrupt ? 'dead' : ''} ${i === 0 ? 'lead' : ''}" data-k="${r.id}"><span class="rk">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
                    <span class="rn">${avatar(r.name, r.bot)}${esc(r.name)}${r.bot ? ' <span class="dim">🤖</span>' : ''}${r.connected === false && !r.bot ? ' <span class="dim">⚠</span>' : ''}</span>
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

    // Wie viel haben Kooperativen und Fabriken schon abgesichert?
    function renderHedges(S) {
        const hedgers = S.ranking.filter(r => r.role !== 'spec').sort((a, b) => a.id - b.id).slice(0, 8);
        const el = $('h-offers');
        const key = hedgers.map(r => r.id).join(',');
        // Gleiche Zeilen wie vorher? Dann nur Balken und Zahlen anpassen – die Balken gleiten dann weich.
        if (el.dataset.k !== key) {
            el.dataset.k = key;
            el.innerHTML = `<div class="bank-note">Was im Dezember offen ist, wird ${Math.round(CFG.spotPenalty * 100)} % schlechter gehandelt.</div>`
                + hedgers.map(r => `<div class="hedge-row" data-k="${r.id}"><span>${roleIcon(r.role, 16)} ${esc(r.name)}</span>
                    <div class="hbar"><i style="width:0%"></i></div><b></b></div>`).join('');
        }
        for (const r of hedgers) {
            const row = el.querySelector(`[data-k="${r.id}"]`);
            if (!row) continue;
            const bar = row.querySelector('.hbar i');
            const w = `${Math.min(100, Math.min(1.2, r.hedged) * 100)}%`;
            if (bar.style.width !== w) bar.style.width = w;
            bar.className = r.hedged >= 0.7 ? 'ok' : 'low';
            const txt = `${Math.round(r.hedged * 100)} %`;
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

    // ===== Weltkarte (Punkte-Karte) mit Regionen und Ereignissen =====
    const MAP_W = 360;
    const MAP_H = 140;
    const mx = lon => lon + 180;
    const my = lat => 80 - lat;
    const mapPins = [];
    let mapBaseKey = '';
    let mapPinKey = '';

    function landAt(lat, lon) {
        let best = null;
        for (const row of LAND) if (best === null || Math.abs(row[0] - lat) < Math.abs(best[0] - lat)) best = row;
        if (!best || Math.abs(best[0] - lat) > 2.5) return false;
        return best[1].some(([a, b]) => lon >= a && lon <= b);
    }

    let mapDots = null;
    function dots() {
        if (mapDots) return mapDots;
        let out = '';
        for (let lat = 77.5; lat >= -57.5; lat -= 2.5) {
            for (let lon = -178.75; lon <= 178.75; lon += 2.5) {
                if (landAt(lat, lon)) out += `<circle cx="${mx(lon).toFixed(1)}" cy="${my(lat).toFixed(1)}" r="0.85"/>`;
            }
        }
        mapDots = out;
        return out;
    }

    function addMapPin(item) {
        if (!item.region || !REGIONS[item.region]) return;
        mapPins.push({ region: item.region, icon: item.yieldIcon || item.icon, kind: item.kind, at: Date.now() });
        while (mapPins.length > 12) mapPins.shift();
    }

    function renderMap(S) {
        const el = $('h-map');
        if (!el) return;
        const G = Engine.G;
        const coops = G.players.filter(p => p.role === 'producer');
        const baseKey = coops.map(p => p.id + p.region).join(',');
        if (baseKey !== mapBaseKey) {
            mapBaseKey = baseKey;
            mapPinKey = '';
            const regs = Object.entries(REGIONS).filter(([, r]) => r.crop === 'cocoa').map(([k, r]) => {
                const here = coops.filter(p => p.region === k);
                const x = mx(r.lon);
                const y = my(r.lat);
                const sug = r.crop === 'sugar';
                const below = r.lat < 0 || k === 'ivory';
                const lx = k === 'ivory' ? x - 3 : k === 'ghana' ? x + 3 : x;
                const anchor = k === 'ivory' ? 'end' : k === 'ghana' ? 'start' : 'middle';
                return `<g class="reg ${sug ? 'sug' : 'coc'}"><circle class="reg-glow" cx="${x}" cy="${y}" r="5"/><circle class="reg-dot" cx="${x}" cy="${y}" r="2"/>
                    <text x="${lx}" y="${below ? y + 9 : y - 5}" text-anchor="${anchor}" class="reg-l">${sug ? '🍬 ' : ''}${r.name}${here.length ? ` · ${here.length}` : ''}</text>
                    ${here.length ? `<text x="${lx}" y="${below ? y + 15 : y - 10.5}" text-anchor="${anchor}" class="reg-p">${here.slice(0, 3).map(p => esc(p.name.slice(0, 8))).join(', ')}</text>` : ''}</g>`;
            }).join('');
            el.innerHTML = `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="xMidYMid meet" class="worldmap">
                <defs><radialGradient id="mapglow"><stop offset="0" stop-color="rgba(255,181,71,.25)"/><stop offset="1" stop-color="rgba(255,181,71,0)"/></radialGradient></defs>
                <rect x="0" y="${my(23.5)}" width="${MAP_W}" height="${my(-23.5) - my(23.5)}" class="tropics"/>
                <line x1="0" x2="${MAP_W}" y1="${my(0)}" y2="${my(0)}" class="equator"/>
                <g class="land">${dots()}</g>
                <g class="regs">${regs}</g><g id="map-pins"></g></svg>`;
        }
        // Ereignis-Marker (pulsieren 25 Sekunden lang)
        const now = Date.now();
        const live = mapPins.filter(p => now - p.at < 25000);
        const pinKey = live.map(p => p.at).join(',');
        if (pinKey !== mapPinKey) {
            mapPinKey = pinKey;
            const g = $('map-pins');
            if (g) {
                g.innerHTML = live.map(p => {
                    const r = REGIONS[p.region];
                    const x = mx(r.lon);
                    const y = my(r.lat);
                    const col = p.kind === 'yes' ? '#22e58a' : p.kind === 'no' ? '#a78bfa' : p.kind === 'rumor' ? '#ffb547' : '#ff4d6a';
                    return `<g class="pin"><circle cx="${x}" cy="${y}" r="3" stroke="${col}" class="pin-ring"/><circle cx="${x}" cy="${y}" r="3" stroke="${col}" class="pin-ring d2"/>
                        <text x="${x + 4}" y="${y + 2}" class="pin-ico">${p.icon}</text></g>`;
                }).join('');
            }
        }
    }

    function renderTape(S) {
        if (!$('h-tape')) return;
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
            const yPlan = y(S.p0);
            const xNow = x(h[h.length - 1].s);
            // Zukunft: schraffiert, damit klar ist, wie viel Handelszeit noch bleibt
            if (!target && xNow < W - R - 4) {
                c.save();
                c.beginPath();
                c.rect(xNow, T, W - R - xNow, H - T - B);
                c.clip();
                c.strokeStyle = 'rgba(140,170,230,.11)';
                c.lineWidth = 1;
                for (let d = -H; d < W; d += 14) {
                    c.beginPath();
                    c.moveTo(d, H);
                    c.lineTo(d + H, 0);
                    c.stroke();
                }
                c.restore();
                const ng = c.createLinearGradient(0, T, 0, H - B);
                ng.addColorStop(0, 'rgba(255,255,255,0)');
                ng.addColorStop(0.5, 'rgba(255,255,255,.28)');
                ng.addColorStop(1, 'rgba(255,255,255,0)');
                c.fillStyle = ng;
                c.fillRect(xNow - 0.5, T, 1, H - T - B);
            }
            // Weiche Linie (Kurven durch die Mittelpunkte)
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
            // Über dem Plan grün, darunter rot – Fläche jeweils zwischen Kurve und Planlinie
            const halves = [
                { clip: [0, 0, W, yPlan], c1: '#22e58a', a: 'rgba(34,229,138,.30)', g0: T, g1: yPlan, rev: false },
                { clip: [0, yPlan, W, H], c1: '#ff4d6a', a: 'rgba(255,77,106,.30)', g0: H - B, g1: yPlan, rev: true },
            ];
            for (const hv of halves) {
                c.save();
                c.beginPath();
                c.rect(...hv.clip);
                c.clip();
                path();
                c.lineTo(x(h[h.length - 1].s), yPlan);
                c.lineTo(x(h[0].s), yPlan);
                c.closePath();
                const g = c.createLinearGradient(0, hv.g0, 0, hv.g1);
                g.addColorStop(0, hv.a);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                c.fillStyle = g;
                c.fill();
                path();
                c.strokeStyle = hv.c1;
                c.globalAlpha = 0.22;
                c.lineWidth = 10;
                c.stroke();
                c.globalAlpha = 1;
                path();
                c.lineWidth = 2.8;
                c.shadowColor = hv.c1;
                c.shadowBlur = 16;
                c.stroke();
                c.shadowBlur = 0;
                c.restore();
            }
            // Hoch und Tief des Jahres
            if (!target && h.length > 8) {
                let hiI = 0;
                let loI = 0;
                h.forEach((pt, i) => {
                    if (pt.p > h[hiI].p) hiI = i;
                    if (pt.p < h[loI].p) loI = i;
                });
                c.font = 'bold 11px "JetBrains Mono", monospace';
                for (const [i, isHi] of [[hiI, true], [loI, false]]) {
                    if (i >= h.length - 3) continue;
                    const px = x(h[i].s);
                    const py = y(h[i].p);
                    c.fillStyle = isHi ? '#22e58a' : '#ff4d6a';
                    c.beginPath();
                    if (isHi) { c.moveTo(px, py - 6); c.lineTo(px - 5, py - 13); c.lineTo(px + 5, py - 13); }
                    else { c.moveTo(px, py + 6); c.lineTo(px - 5, py + 13); c.lineTo(px + 5, py + 13); }
                    c.fill();
                    const lab = `${isHi ? 'H' : 'T'} ${fmt(h[i].p)}`;
                    const tw = c.measureText(lab).width;
                    c.fillStyle = 'rgba(5,8,15,.75)';
                    c.fillRect(px - tw / 2 - 5, isHi ? py - 31 : py + 15, tw + 10, 16);
                    c.fillStyle = isHi ? '#7dffc0' : '#ff9aac';
                    c.fillText(lab, px - tw / 2, isHi ? py - 19 : py + 27);
                }
            }
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
        // «k-»-Präfix: Die Klasse «flash» trägt jeder Banner – sonst wären alle rot.
        el.className = `flash k-${n.kind}`;
        const region = (n.text.match(/^[A-ZÄÖÜ ]+\(([^)]*)\)/) || [])[1];
        const sub = n.kind === 'rumor' ? 'Noch nicht bestätigt – der Markt spekuliert'
            : n.kind === 'yes' ? 'Das Gerücht stimmt' : n.kind === 'no' ? 'Falscher Alarm' : n.kind === 'alert' ? 'Börsenaufsicht' : 'Soeben gemeldet';
        el.innerHTML = `<div class="fl-icon">${n.icon}</div>
            <div class="fl-body"><div class="fl-label"><i></i>${label}${region ? ` · ${esc(region)}` : ''}<span>${sub}</span></div>
            <div class="fl-text">${esc(n.text.replace(/^[A-ZÄÖÜ ]+(\([^)]*\))?: /, ''))}</div></div>
            <div class="fl-bar"></div>`;
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
        const spot = d.rows.filter(r => r.spotPaid > 0).sort((a, b) => b.spotPaid - a.spotPaid)[0];
        if (spot) out.push(`⏰ <b>${esc(spot.name)}</b> hatte im Dezember noch ${spot.open} t offen und musste ${fmt(spot.spotPaid)} CHF Abschlag für den Notverkauf bzw. Notkauf zahlen. Wer nicht absichert, wettet – und Wetten kosten.`);
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

    // ===== Überblick über alle gespielten Jahre =====
    function yearSpark(y, w = 220, h = 64) {
        const hs = y.history && y.history.length > 1 ? y.history : [y.p0, y.final];
        const lo = Math.min(...hs, y.p0);
        const hi = Math.max(...hs, y.p0);
        const span = Math.max(1, hi - lo);
        const X = i => (i / (hs.length - 1)) * w;
        const Y = v => h - 4 - ((v - lo) / span) * (h - 8);
        const pts = hs.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
        const up = y.final >= y.p0;
        const col = up ? '#22e58a' : '#ff4d6a';
        const gid = `ys${y.year}${Math.random().toString(36).slice(2, 6)}`;
        return `<svg viewBox="0 0 ${w} ${h}" class="yc-spark" preserveAspectRatio="none">
            <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
            <line x1="0" x2="${w}" y1="${Y(y.p0).toFixed(1)}" y2="${Y(y.p0).toFixed(1)}" class="yc-plan"/>
            <polygon points="0,${h} ${pts} ${w},${h}" fill="url(#${gid})"/>
            <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>
            <circle cx="${X(hs.length - 1).toFixed(1)}" cy="${Y(hs[hs.length - 1]).toFixed(1)}" r="3.5" fill="${col}"/></svg>`;
    }

    function yearCards(log, compact = false) {
        return log.map((y, i) => {
            const ch = y.final / y.p0 - 1;
            const w = y.winners || {};
            const win = [
                ['producer', w.producer, r => `${fmt(r.metric)}<small>/t</small>`],
                ['processor', w.processor, r => `${fmt(r.metric)}<small>/t</small>`],
                ['spec', w.spec, r => signed(r.result)],
            ].filter(([, r]) => r).map(([role, r, v]) => `<div class="yc-w" style="--rc:${ROLES[role].color}">${roleIcon(role, 16)}<span>${esc(r.name)}</span><b>${v(r)}</b></div>`).join('');
            return `<div class="yc ${compact ? 'compact' : ''}" style="animation-delay:${i * 0.12}s">
                <div class="yc-h"><b>Jahr ${y.year}</b><span class="yc-ch ${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${pct(ch)}</span></div>
                ${yearSpark(y)}
                <div class="yc-px"><span>${fmt(y.p0)} → <b>${fmt(y.final)}</b> CHF/t</span>${y.hi ? `<small>Hoch ${fmt(y.hi)} · Tief ${fmt(y.lo)}</small>` : ''}</div>
                ${compact ? '' : `<div class="yc-wins">${win}</div>`}
                ${y.star ? `<div class="yc-star">⭐ ${esc(y.star.name)}</div>` : ''}
                ${!compact && y.events && y.events.length ? `<div class="yc-ev">${y.events.map(e => `<span title="${esc(e.text)}" class="${e.dir > 0 ? 'up' : e.dir < 0 ? 'down' : ''}">${e.icon} ${esc(e.text.replace(/^[A-ZÄÖÜ ]+(\([^)]*\))?: /, '').slice(0, 42))}</span>`).join('')}</div>` : ''}
            </div>`;
        }).join('');
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
            ${G.yearLog.length > 1 ? `<div class="yo-prev"><div class="yo-prev-h">🗓️ Bisherige Jahre</div><div class="yc-grid compact">${yearCards(G.yearLog, true)}</div></div>` : ''}
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
                <div class="card wide"><h3>🗓️ Alle Jahre im Überblick</h3><div class="yc-grid">${yearCards(d.yearLog)}</div></div>
                <div class="card"><h3>📈 Kursverlauf im letzten Jahr</h3><canvas id="end-chart"></canvas>
                    <h3>💡 Was wir gelernt haben</h3><ul class="lessons">${lessons(d).map(l => `<li>${l}</li>`).join('')}</ul></div>
                <div class="card"><h3>🗣️ Diskussion</h3><ol class="lessons">
                    <li>Welche Investition hat sich am meisten gelohnt – und welche nicht?</li>
                    <li>Welche Kooperative hat den besten Zeitpunkt zum Absichern erwischt – Können oder Glück?</li>
                    <li>Warum haben gut abgesicherte Spieler nicht unbedingt am meisten verdient – und waren trotzdem erfolgreich?</li>
                    <li>Wer war die Gegenpartei der Kooperativen, als sie Futures verkauften?</li></ol></div>
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
