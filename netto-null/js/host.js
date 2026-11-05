// ===== NETTO NULL – Host (Beamer) =====

const Host = (() => {
    let peer = null;
    let code = '';
    const conns = new Map();   // conn -> player id
    let skyKey = '';

    function create() {
        code = Net.makeCode();
        Engine.create();
        App.show('v-lobby');
        $('room-code').textContent = code;
        const url = `${location.origin}${location.pathname}?join=${code}`;
        $('join-url').textContent = url.replace(/^https?:\/\//, '');
        $('qr').innerHTML = '';
        if (typeof QRCode !== 'undefined') new QRCode($('qr'), { text: url, width: 180, height: 180, colorDark: '#04121f', colorLight: '#ffffff' });
        if (!Net.available()) {
            $('net-status').textContent = '⚠️ Keine Verbindung zum Vermittler (Internet?). Nur KI-Firmen möglich.';
            return lobby();
        }
        peer = Net.host(code, {
            onOpen: () => { $('net-status').textContent = '● Raum ist offen. Firmen können beitreten.'; },
            onConn: () => {},
            onData: handle,
            onClose: conn => conns.delete(conn),
            onError: e => {
                if (e === 'taken') {
                    peer.destroy();
                    create();
                } else $('net-status').textContent = `Verbindungsproblem: ${e}`;
            },
        });
        lobby();
    }

    function send(conn, msg) {
        try {
            if (conn.open) conn.send(msg);
        } catch (e) {
            // ignore
        }
    }

    function handle(conn, msg) {
        if (!msg || !msg.t) return;
        const G = Engine.G;
        if (msg.t === 'join') {
            let p = G.players.find(x => x.key === msg.key && !x.bot);
            if (!p) {
                if (G.phase !== 'lobby') return send(conn, { t: 'reject', msg: 'Das Spiel läuft schon. Warte auf die nächste Runde.' });
                const name = String(msg.name || 'Firma').slice(0, 16);
                if (G.players.some(x => x.name.toLowerCase() === name.toLowerCase())) return send(conn, { t: 'reject', msg: 'Dieser Name ist schon vergeben.' });
                p = Engine.addPlayer(name, msg.key, false, msg.co);
                Sound.play('join');
            }
            conns.set(conn, p.id);
            send(conn, { t: 'welcome', id: p.id });
            lobby();
            return push();
        }
        const id = conns.get(conn);
        if (!id) return;
        let res = null;
        if (msg.t === 'co') Engine.setCompany(id, msg.co);
        if (msg.t === 'build') res = Engine.build(id, msg.id);
        if (msg.t === 'order') res = Engine.setOrder(id, msg.order);
        if (msg.t === 'ready') {
            Engine.setReady(id, msg.v);
            if (msg.v) Sound.play('ready');
        }
        if (res) send(conn, { t: 'res', ...res, rid: msg.rid });
        if (G.phase === 'lobby') lobby();
        render();
        push();
    }

    function push() {
        const pub = Engine.publicState();
        for (const [conn, id] of conns) send(conn, { t: 's', pub, me: Engine.personal(id) });
    }

    // ===== Lobby =====

    function lobby() {
        const G = Engine.G;
        $('lobby-count').textContent = G.players.length;
        $('lobby-cos').innerHTML = COMPANY_ORDER.map(c => {
            const C = COMPANIES[c];
            const list = G.players.filter(p => p.co === c);
            return `<div class="co-col" style="--cc:${C.color}"><h4>${C.icon} ${C.short}</h4>${list.map(p => `<div class="lobby-p ${p.bot ? 'bot' : ''}">${p.bot ? '🤖 ' : ''}${esc(p.name)}</div>`).join('') || '<div class="dim small">–</div>'}</div>`;
        }).join('');
        $('bot-count').textContent = G.players.filter(p => p.bot).length;
        $('btn-start').disabled = G.players.length < 2;
    }

    function addBot() {
        const G = Engine.G;
        const used = new Set(G.players.map(p => p.name));
        const p = Engine.addPlayer('', `bot-${Math.random()}`, true);
        p.name = BOT_NAMES[p.co].find(n => !used.has(n)) || `KI-Firma ${G.players.length}`;
        lobby();
        push();
    }

    function removeBot() {
        const bots = Engine.G.players.filter(p => p.bot);
        if (bots.length) Engine.removePlayer(bots[bots.length - 1].id);
        lobby();
        push();
    }

    function start() {
        Engine.start();
        App.show('v-host');
        Sound.play('news');
        render();
        push();
    }

    // ===== Steuerung =====

    function next() {
        const G = Engine.G;
        if (G.phase === 'news') Engine.decide();
        else if (G.phase === 'decide') {
            Engine.auction();
            Sound.play('gavel');
        } else if (G.phase === 'result') {
            Engine.nextRound();
            if (Engine.G.phase === 'end') return showEnd();
            Sound.play('news');
        }
        render();
        push();
    }

    // ===== Darstellung =====

    function render() {
        const G = Engine.G;
        const pub = Engine.publicState();
        if (G.phase === 'lobby' || G.phase === 'end') return;
        $('h-years').innerHTML = CFG.years.map((y, i) => `<span class="${i < G.round ? 'done' : i === G.round ? 'now' : ''}">${y}</span>`).join('');
        const last = G.prices.length ? G.prices[G.prices.length - 1] : null;
        $('h-price').textContent = last === null ? '–' : fmt(last);
        renderSky(pub);
        renderRank(pub);
        renderPanel(pub);
        drawPriceChart(G.prices);
    }

    function renderRank(pub) {
        const rows = pub.players.slice().sort((a, b) => a.rank - b.rank);
        $('h-rank').innerHTML = rows.map(p => {
            const C = COMPANIES[p.co];
            return `<div class="rank-row"><span class="rk">${p.rank}</span><span>${C.icon}</span><span class="rn">${esc(p.name)}</span><span class="re" title="Ausstoss">${p.emissions} t</span><b class="rc">${fmt(p.cash)}</b>${pub.phase === 'decide' ? `<span class="rdy">${p.ready ? '✅' : '⏳'}</span>` : '<span></span>'}</div>`;
        }).join('');
    }

    function renderPanel(pub) {
        const G = Engine.G;
        const P = $('h-panel');
        const ev = pub.event;
        const capPrev = G.round > 0 ? CFG.cap[G.round - 1] : null;
        let html = '';
        let btn = '';
        if (pub.phase === 'news') {
            html = `<div class="phase-tag">Runde ${G.round + 1} von ${CFG.rounds} · ${pub.year}</div>
                ${ev ? `<div class="event"><div class="ev-icon">${ev.icon}</div><div><h2>${ev.title}</h2><p>${ev.text}</p></div></div>` : `<div class="event intro"><div class="ev-icon">🏛️</div><div><h2>Das Emissionshandelssystem startet</h2><p>Jede Firma braucht ab jetzt für jede Tonne CO₂ ein Zertifikat. Wer zu wenig hat, zahlt <b>${CFG.penalty} CHF Strafe pro Tonne</b>. Zertifikate dürfen gehandelt und für später aufbewahrt werden.</p></div></div>`}
                <div class="cap-box"><div><small>Gratis-Zertifikate pro Firma</small><b>${pub.cap}</b>${capPrev !== null ? `<em>vorher ${capPrev}</em>` : ''}</div>
                <div><small>Ausstoss ohne Massnahmen</small><b>${CFG.baseline + (ev && ev.extra ? ev.extra : 0)} t</b></div>
                <div class="cap-bar"><i style="width:${(pub.cap / CFG.baseline) * 100}%"></i></div></div>`;
            btn = '🧠 Entscheidungsphase starten';
        } else if (pub.phase === 'decide') {
            const ready = pub.players.filter(p => p.ready).length;
            const humans = pub.players.filter(p => !p.bot);
            html = `<div class="phase-tag">Runde ${G.round + 1} · Entscheidungen am Handy</div>
                <h2 class="big-q">Investieren? Kaufen? Verkaufen?</h2>
                <p class="dim">Jede Firma entscheidet in Ruhe. Kein Zeitdruck – wer fertig ist, drückt «Fertig».</p>
                <div class="ready-grid">${humans.map(p => `<span class="${p.ready ? 'on' : ''}">${COMPANIES[p.co].icon} ${esc(p.name)} ${p.ready ? '✅' : '⏳'}</span>`).join('') || '<span class="dim">Nur KI-Firmen</span>'}</div>
                <div class="ready-count">${ready} / ${pub.players.length} fertig${ready === pub.players.length ? ' – alle bereit! 🎉' : ''}</div>`;
            btn = '🔨 Auktion durchführen';
        } else if (pub.phase === 'result') {
            const a = pub.auction;
            const t = pub.totals[pub.totals.length - 1];
            html = `<div class="phase-tag">Runde ${G.round + 1} · Auktion & Abrechnung</div>
                <div class="result-grid">
                    <div class="chart-box"><canvas id="h-auction"></canvas></div>
                    <div class="res-side">
                        <div class="kpi"><small>CO₂-Preis</small><b>${a.price === null ? '–' : fmt(a.price)}</b><span>CHF pro Tonne</span></div>
                        <div class="kpi"><small>Gehandelt</small><b>${fmt(a.qty)}</b><span>Zertifikate</span></div>
                        <div class="kpi"><small>Ausstoss aller Firmen</small><b>${fmt(t.emissions)} t</b><span>${Math.round((1 - t.emissions / t.base) * 100)} % weniger als ohne Massnahmen</span></div>
                        ${t.uncovered ? `<div class="kpi bad"><small>Ohne Zertifikat</small><b>${fmt(t.uncovered)} t</b><span>→ ${fmt(t.uncovered * CFG.penalty)} CHF Strafe</span></div>` : '<div class="kpi good"><small>Klimaziel</small><b>✔</b><span>Alle Tonnen sind gedeckt</span></div>'}
                    </div>
                </div>`;
            btn = G.round + 1 >= CFG.rounds ? '🏁 Zur Schlussauswertung' : '➡️ Nächste Runde';
        }
        P.innerHTML = `${html}<div class="panel-btn"><button class="btn btn-primary btn-big" id="h-next">${btn}</button></div>`;
        $('h-next').onclick = next;
        if (pub.phase === 'result') requestAnimationFrame(() => drawAuction(pub.auction));
    }

    // ===== Skyline: je weniger CO₂, desto klarer der Himmel =====

    function building(co, x, base, e, built) {
        const s = 1;
        const smoke = Math.round((e / CFG.baseline) * 5);
        let b = '';
        if (co === 'energy') b = `<path d="M-30 0 Q-22 -60 -28 -110 L28 -110 Q22 -60 30 0Z" fill="#cbd2db"/><path d="M-28 -110 L28 -110 L26 -100 L-26 -100Z" fill="#9aa4b1"/>${built > 1 ? '<g class="turbine" transform="translate(48 -70)"><rect x="-2" y="0" width="4" height="70" fill="#e5e7eb"/><g class="blades"><rect x="-2" y="-34" width="4" height="34" fill="#fff"/><rect x="-2" y="-34" width="4" height="34" fill="#fff" transform="rotate(120)"/><rect x="-2" y="-34" width="4" height="34" fill="#fff" transform="rotate(240)"/></g></g>' : ''}${built ? '<g transform="translate(-70 -8)"><rect x="0" y="0" width="34" height="8" fill="#1e3a8a" transform="skewX(-25)"/></g>' : ''}`;
        else if (co === 'cement') b = '<rect x="-40" y="-60" width="34" height="60" fill="#a8a29e"/><rect x="-2" y="-90" width="22" height="90" fill="#d6d3d1"/><ellipse cx="9" cy="-90" rx="11" ry="4" fill="#e7e5e4"/><rect x="24" y="-40" width="26" height="40" fill="#78716c"/><path d="M-60 -20 L60 -50" stroke="#57534e" stroke-width="6"/>';
        else if (co === 'steel') b = '<rect x="-38" y="-70" width="76" height="70" fill="#64748b"/><rect x="-10" y="-120" width="20" height="50" fill="#475569"/><rect x="18" y="-105" width="12" height="35" fill="#475569"/><rect x="-30" y="-40" width="16" height="12" fill="#fb923c" class="glow"/><rect x="0" y="-40" width="16" height="12" fill="#fb923c" class="glow"/>';
        else if (co === 'air') b = '<path d="M-60 0 L-60 -40 Q0 -80 60 -40 L60 0Z" fill="#cbd5e1"/><rect x="-30" y="-24" width="60" height="24" fill="#334155"/><g class="plane" transform="translate(0 -110)"><path d="M-26 0 L22 -4 L28 0 L22 4Z" fill="#f8fafc"/><path d="M-2 0 L-12 -14 L-6 -14 L8 0 L-6 14 L-12 14Z" fill="#e2e8f0"/></g>';
        else b = '<rect x="-46" y="-50" width="30" height="50" rx="6" fill="#94a3b8"/><circle cx="12" cy="-30" r="30" fill="#cbd5e1"/><rect x="34" y="-90" width="12" height="90" fill="#64748b"/><path d="M-16 -30 L-6 -30 L-6 -10" stroke="#475569" stroke-width="4" fill="none"/>';
        const chimneyX = co === 'energy' ? 0 : co === 'cement' ? 9 : co === 'steel' ? 0 : co === 'air' ? 0 : 40;
        const chimneyY = co === 'energy' ? -110 : co === 'cement' ? -92 : co === 'steel' ? -120 : co === 'air' ? -100 : -90;
        let puffs = '';
        for (let i = 0; i < smoke; i++) puffs += `<circle class="puff" cx="${chimneyX}" cy="${chimneyY}" r="${10 + i * 3}" style="animation-delay:${-i * 0.8}s"/>`;
        return `<g transform="translate(${x} ${base}) scale(${s})">${co !== 'air' ? `<g class="smoke-col">${puffs}</g>` : `<g class="smoke-col trail">${puffs}</g>`}${b}</g>`;
    }

    function renderSky(pub) {
        const t = pub.totals[pub.totals.length - 1];
        const ratio = t ? t.emissions / t.base : 1;
        const clean = clamp((1 - ratio) / 0.45, 0, 1);
        const mix = (a, b) => {
            const pa = a.match(/\w\w/g).map(h => parseInt(h, 16));
            const pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
            return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * clean)).join(',')})`;
        };
        const top = mix('6b6150', '3a8ee6');
        const bottom = mix('b8a888', 'cdeeff');
        const players = pub.players;
        const n = Math.max(players.length, 1);
        const key = `${top}|${players.map(p => `${p.co}${p.emissions}${p.built}`).join(',')}`;
        if (key === skyKey) return;
        skyKey = key;
        const blds = players.map((p, i) => building(p.co, 80 + (i + 0.5) * (840 / n), 360, p.emissions, p.built)).join('');
        const labels = players.map((p, i) => `<text x="${80 + (i + 0.5) * (840 / n)}" y="392" text-anchor="middle" class="bl">${esc(p.name.slice(0, 12))}</text>`).join('');
        $('h-sky').innerHTML = `<svg viewBox="0 0 1000 420" preserveAspectRatio="xMidYMid slice">
            <defs><linearGradient id="hs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
            <rect width="1000" height="420" fill="url(#hs)"/>
            <circle cx="840" cy="90" r="46" fill="#fff6c8" opacity="${0.25 + clean * 0.75}"/>
            <path d="M0 290 L120 200 L190 250 L300 150 L380 230 L470 170 L560 240 L660 140 L760 230 L860 180 L1000 260 L1000 420 L0 420Z" fill="${mix('8a8170', 'a7c4e0')}" opacity=".8"/>
            <path d="M300 150 L325 172 L290 175Z M660 140 L690 165 L650 168Z" fill="#fff" opacity="${0.4 + clean * 0.6}"/>
            <path d="M0 330 Q250 300 500 325 T1000 320 L1000 420 L0 420Z" fill="${mix('6b6a4a', '58a55c')}"/>
            <rect y="360" width="1000" height="60" fill="${mix('4a4636', '3f7f45')}"/>
            ${blds}${labels}
            <rect width="1000" height="420" fill="rgba(120,105,80,${(1 - clean) * 0.28})"/>
        </svg>`;
    }

    // ===== Grafiken =====

    function setupCanvas(cv) {
        const dpr = window.devicePixelRatio || 1;
        const W = cv.clientWidth;
        const H = cv.clientHeight;
        cv.width = W * dpr;
        cv.height = H * dpr;
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { c, W, H };
    }

    function drawAuction(a) {
        const cv = $('h-auction');
        if (!cv || !a) return;
        const { c, W, H } = setupCanvas(cv);
        const L = 56;
        const B = 36;
        const T = 16;
        const R = 16;
        const maxQ = Math.max(10, ...(a.demand.map(d => d.q)), ...(a.supply.map(d => d.q))) * 1.08;
        const maxP = Math.max(100, ...a.demand.map(d => d.price), ...a.supply.map(d => d.price)) * 1.1;
        const X = q => L + (q / maxQ) * (W - L - R);
        const Y = p => H - B - (p / maxP) * (H - B - T);
        c.font = '12px "IBM Plex Mono", monospace';
        c.fillStyle = 'rgba(200,220,240,.7)';
        c.strokeStyle = 'rgba(200,220,240,.15)';
        for (let i = 0; i <= 4; i++) {
            const p = (maxP / 4) * i;
            c.beginPath();
            c.moveTo(L, Y(p));
            c.lineTo(W - R, Y(p));
            c.stroke();
            c.fillText(fmt(p), 6, Y(p) + 4);
        }
        c.fillText('Menge (Zertifikate) →', W - 170, H - 10);
        c.save();
        c.translate(14, T + 70);
        c.rotate(-Math.PI / 2);
        c.restore();
        const step = (list, color, label) => {
            if (!list.length) return;
            c.beginPath();
            let q0 = 0;
            c.moveTo(X(0), Y(list[0].price));
            list.forEach(d => {
                c.lineTo(X(d.q), Y(d.price));
                q0 = d.q;
            });
            c.strokeStyle = color;
            c.lineWidth = 4;
            c.shadowColor = color;
            c.shadowBlur = 10;
            c.stroke();
            c.shadowBlur = 0;
            const lastD = list[list.length - 1];
            c.fillStyle = color;
            c.font = 'bold 15px Sora, sans-serif';
            c.fillText(label, Math.min(X(q0) + 6, W - 120), Y(lastD.price) + (label === 'Nachfrage' ? 18 : -8));
        };
        // Stufen: jede Order ist eine horizontale Treppe
        const stairs = list => {
            const out = [];
            let q = 0;
            list.forEach(d => {
                out.push({ q, price: d.price });
                out.push({ q: d.q, price: d.price });
                q = d.q;
            });
            return out;
        };
        step(stairs(a.demand), '#34d399', 'Nachfrage');
        step(stairs(a.supply), '#f87171', 'Angebot');
        if (a.price !== null && a.qty) {
            c.setLineDash([6, 6]);
            c.strokeStyle = '#fde047';
            c.lineWidth = 2;
            c.beginPath();
            c.moveTo(L, Y(a.price));
            c.lineTo(X(a.qty), Y(a.price));
            c.lineTo(X(a.qty), H - B);
            c.stroke();
            c.setLineDash([]);
            c.fillStyle = '#fde047';
            c.beginPath();
            c.arc(X(a.qty), Y(a.price), 8, 0, Math.PI * 2);
            c.fill();
            c.font = 'bold 16px Sora, sans-serif';
            c.fillText(`Preis ${fmt(a.price)} CHF`, X(a.qty) + 12, Y(a.price) - 10);
        }
    }

    function drawPriceChart(prices) {
        const cv = $('h-pchart');
        if (!cv) return;
        const { c, W, H } = setupCanvas(cv);
        c.font = '11px "IBM Plex Mono", monospace';
        c.fillStyle = 'rgba(200,220,240,.6)';
        if (!prices.length) {
            c.fillText('Noch keine Auktion', 10, H / 2);
            return;
        }
        const max = Math.max(...prices, 50) * 1.2;
        const X = i => 20 + (i / Math.max(1, CFG.rounds - 1)) * (W - 40);
        const Y = p => H - 20 - (p / max) * (H - 36);
        c.beginPath();
        prices.forEach((p, i) => (i ? c.lineTo(X(i), Y(p)) : c.moveTo(X(i), Y(p))));
        c.strokeStyle = '#fde047';
        c.lineWidth = 3;
        c.stroke();
        prices.forEach((p, i) => {
            c.fillStyle = '#fde047';
            c.beginPath();
            c.arc(X(i), Y(p), 4, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#e2f0ff';
            c.fillText(fmt(p), X(i) - 10, Y(p) - 8);
            c.fillStyle = 'rgba(200,220,240,.6)';
            c.fillText(CFG.years[i], X(i) - 14, H - 4);
        });
    }

    // ===== Schlussauswertung =====

    function showEnd() {
        const d = Engine.debrief();
        App.show('v-end');
        Sound.play('end');
        const b = d.bench;
        const max = Math.max(b.solo, b.market, b.actual, 1);
        const save = b.solo - b.market;
        const first = d.totals[0];
        const lastT = d.totals[d.totals.length - 1];
        const top = d.rows.slice(0, 3);
        const seller = d.rows.slice().sort((x, y) => y.sold - x.sold)[0];
        const buyer = d.rows.slice().sort((x, y) => y.bought - x.bought)[0];
        $('end-wrap').innerHTML = `
            <div class="end-head"><div class="logo small">NETTO<span>NULL</span></div><h1>Schlussauswertung</h1></div>
            <div class="podium">${top.map((r, i) => `<div class="pod p${i + 1}"><div class="pod-medal">${['🥇', '🥈', '🥉'][i]}</div><div class="pod-co">${COMPANIES[r.co].icon} ${COMPANIES[r.co].short}</div><div class="pod-name">${esc(r.name)}</div><div class="pod-score">${fmt(r.cash)} CHF</div></div>`).join('')}</div>
            <div class="end-grid">
                <div class="card big-lesson">
                    <h3>💡 Die wichtigste Erkenntnis</h3>
                    <p>Um das gleiche Klimaziel zu erreichen (Ausstoss von <b>${fmt(first.base)} t</b> auf <b>${fmt(lastT.cap)} t</b> pro Runde), hätte es gekostet:</p>
                    <div class="bars">
                        <div class="bar-row"><span>Jede Firma muss ihr Ziel <b>allein</b> erreichen (Vorschrift)</span><div><i class="solo" style="width:${(b.solo / max) * 100}%"></i></div><b>${fmt(b.solo)}</b></div>
                        <div class="bar-row"><span>Mit Handel – <b>billigste Massnahmen zuerst</b> (Theorie)</span><div><i class="market" style="width:${(b.market / max) * 100}%"></i></div><b>${fmt(b.market)}</b></div>
                        <div class="bar-row"><span>So viel hat <b>eure Klasse</b> ausgegeben (Investitionen + Strafen)</span><div><i class="actual" style="width:${(b.actual / max) * 100}%"></i></div><b>${fmt(b.actual)}</b></div>
                    </div>
                    <p class="takeaway">Mit Zertifikatehandel wird CO₂ dort eingespart, wo es <b>am billigsten</b> ist. Das spart in diesem Spiel <b>${fmt(save)} CHF</b> (${Math.round((save / Math.max(1, b.solo)) * 100)} %) – bei <b>genau gleich viel</b> Klimaschutz, weil der Cap die Gesamtmenge festlegt.</p>
                </div>
                <div class="card">
                    <h3>📈 CO₂-Preis und Ausstoss</h3>
                    <canvas id="end-chart"></canvas>
                    <ul class="lessons">
                        <li>${LESSON_TEXT.externality}</li>
                        <li>${LESSON_TEXT.cap}</li>
                        <li>${LESSON_TEXT.price}</li>
                        <li>${LESSON_TEXT.efficiency}</li>
                    </ul>
                </div>
                <div class="card">
                    <h3>🏅 Auszeichnungen</h3>
                    <div class="awards">
                        ${seller && seller.sold ? `<div class="award">🌱 <span>Grösster Verkäufer</span><b>${esc(seller.name)}</b><small>${seller.sold} Zertifikate verkauft</small></div>` : ''}
                        ${buyer && buyer.bought ? `<div class="award">🛒 <span>Grösster Käufer</span><b>${esc(buyer.name)}</b><small>${buyer.bought} Zertifikate gekauft</small></div>` : ''}
                        ${(() => { const r = d.rows.slice().sort((x, y) => y.cut - x.cut)[0]; return `<div class="award">🔧 <span>Grösste Reduktion</span><b>${esc(r.name)}</b><small>−${r.cut} t pro Runde</small></div>`; })()}
                    </div>
                    <h3>💬 Diskussion</h3>
                    <ul class="lessons">
                        <li>Warum hat die Energie-Firma meistens verkauft und die Airline gekauft?</li>
                        <li>Wer hat das Klima mehr geschützt: die Firma, die viel investiert, oder die, die Zertifikate gekauft hat?</li>
                        <li>Was würde passieren, wenn der Staat den Cap nicht senkt?</li>
                        <li>Ist es gerecht, dass sich Firmen «freikaufen» können?</li>
                    </ul>
                </div>
                <div class="card">
                    <h3>📋 Alle Firmen</h3>
                    <table class="end-table"><tr><th>#</th><th>Firma</th><th>Investiert</th><th>Gekauft</th><th>Verkauft</th><th>Strafen</th><th>Vermögen</th></tr>
                    ${d.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${COMPANIES[r.co].icon} ${esc(r.name)}${r.bot ? ' 🤖' : ''}</td><td>${fmt(r.invested)}</td><td>${r.bought}</td><td>${r.sold}</td><td class="${r.penalties ? 'bad' : ''}">${fmt(r.penalties)}</td><td><b>${fmt(r.cash)}</b></td></tr>`).join('')}</table>
                </div>
            </div>
            <div class="end-btns"><button class="btn btn-primary btn-big" onclick="location.reload()">Neues Spiel</button></div>`;
        requestAnimationFrame(() => drawEndChart(d));
        for (const [conn, id] of conns) {
            const rank = d.rows.findIndex(r => r.id === id) + 1;
            send(conn, { t: 'end', rank, total: d.rows.length, row: d.rows[rank - 1], bench: b, top: top.map(r => ({ name: r.name, co: r.co, cash: r.cash })) });
        }
    }

    function drawEndChart(d) {
        const cv = $('end-chart');
        if (!cv) return;
        const { c, W, H } = setupCanvas(cv);
        const n = d.totals.length;
        const maxE = Math.max(...d.totals.map(t => t.base)) * 1.1;
        const maxP = Math.max(50, ...d.prices) * 1.2;
        const bw = (W - 60) / n;
        c.font = '11px "IBM Plex Mono", monospace';
        d.totals.forEach((t, i) => {
            const x = 40 + i * bw;
            const h = (t.emissions / maxE) * (H - 40);
            const hc = (t.cap / maxE) * (H - 40);
            c.fillStyle = 'rgba(148,163,184,.35)';
            c.fillRect(x + 6, H - 20 - h, bw - 12, h);
            c.fillStyle = '#38bdf8';
            c.fillRect(x + 2, H - 20 - hc - 2, bw - 4, 3);
            c.fillStyle = 'rgba(200,220,240,.7)';
            c.fillText(CFG.years[i], x + bw / 2 - 14, H - 4);
        });
        c.beginPath();
        d.prices.forEach((p, i) => {
            const x = 40 + i * bw + bw / 2;
            const y = H - 20 - (p / maxP) * (H - 40);
            i ? c.lineTo(x, y) : c.moveTo(x, y);
        });
        c.strokeStyle = '#fde047';
        c.lineWidth = 3;
        c.stroke();
        c.fillStyle = '#e2f0ff';
        c.fillText('▮ Ausstoss  ▬ Cap  ― CO₂-Preis', 40, 12);
    }

    window.addEventListener('resize', () => {
        if (Engine.G && Engine.G.phase !== 'lobby' && Engine.G.phase !== 'end') {
            drawPriceChart(Engine.G.prices);
            if (Engine.G.phase === 'result') drawAuction(Engine.G.auction);
        }
    });

    return { create, start, addBot, removeBot, next };
})();
