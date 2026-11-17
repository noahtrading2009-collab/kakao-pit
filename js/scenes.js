// ===== KAKAO PIT – Rollen-Welten (eigene Grafik pro Rolle) =====

const Scenes = (() => {
    let lastKey = '';
    let lastSold = 0;

    const SKY = {
        sun: { a: '#62b4ff', b: '#ffe6b3', leaf: '#2f9e44', leaf2: '#3fbf55', hill: '#3c8c3a', hill2: '#2d6e2c', label: '☀️ Gutes Wetter' },
        drought: { a: '#ff7a2f', b: '#ffd98a', leaf: '#9a9a3a', leaf2: '#b5ad48', hill: '#a8853f', hill2: '#8a6a2e', label: '🔥 Dürre' },
        blackpod: { a: '#3a3650', b: '#7d7394', leaf: '#3c5a36', leaf2: '#4a6b40', hill: '#3d5c35', hill2: '#2c4527', label: '🍂 Black Pod' },
        rain: { a: '#4d6b8f', b: '#b4c8dc', leaf: '#23a04a', leaf2: '#36c25e', hill: '#3a9a46', hill2: '#2b7a36', label: '🌧️ Regenzeit' },
        record: { a: '#4fb0ff', b: '#d2f4ff', leaf: '#20b04a', leaf2: '#3bd264', hill: '#45a948', hill2: '#338a37', label: '🌾 Rekordernte' },
    };

    function pod(x, y, r, c) {
        return `<g transform="translate(${x} ${y}) rotate(${r})"><ellipse rx="3.4" ry="6.2" fill="${c}"/><path d="M-1.6 -5.4 Q-2.8 0 -1.6 5.4 M1.6 -5.4 Q2.8 0 1.6 5.4 M0 -6 V6" stroke="rgba(0,0,0,.22)" stroke-width=".55" fill="none"/><ellipse cx="-1.2" cy="-2.2" rx=".9" ry="2" fill="rgba(255,255,255,.35)"/></g>`;
    }
    function tree(x, y, s, sky, sick, ripe) {
        const c = sick ? '#3b2a2a' : ripe;
        return `<g class="tree-g" style="animation-delay:${(-(x * 7) % 45) / 10}s"><g transform="translate(${x} ${y}) scale(${s})">
            <ellipse cx="5" cy="4" rx="20" ry="4" fill="rgba(0,0,0,.22)"/>
            <path d="M-4 4 C-3 -10 -4.5 -22 -2 -33 L2 -33 C3.5 -22 3 -10 4 4 Z" fill="#6a4423"/><path d="M1 4 C1.6 -10 1.2 -22 2 -33 C3.5 -22 3 -10 4 4Z" fill="#3e2613"/>
            <path d="M-1 -24 Q-7 -30 -13 -33 M1 -27 Q7 -32 12 -36" stroke="#5b3a1f" stroke-width="2.2" fill="none" stroke-linecap="round"/>
            <circle cx="-13" cy="-33" r="11" fill="${sky.hill2}"/><circle cx="13" cy="-34" r="11" fill="${sky.hill2}"/>
            <circle cx="0" cy="-42" r="17" fill="${sky.leaf}"/><circle cx="-12" cy="-35" r="11" fill="${sky.leaf2}"/><circle cx="12" cy="-36" r="11.5" fill="${sky.leaf}"/>
            <circle cx="-6" cy="-48" r="8" fill="${sky.leaf2}"/><circle cx="7" cy="-49" r="6" fill="${sky.leaf2}"/>
            <circle cx="-7" cy="-50" r="4" fill="rgba(255,255,255,.16)"/><circle cx="-15" cy="-38" r="3" fill="rgba(255,255,255,.1)"/>
            <path d="M-9 -28 a12 6 0 0 0 20 0" fill="rgba(0,0,0,.18)"/>
            ${pod(-4.5, -17, 8, c)}${pod(4.5, -11, -10, c)}${pod(0, -24, 0, c)}${sick ? '<circle cx="-4" cy="-15" r="1.6" fill="#1a1414"/>' : ''}
        </g></g>`;
    }
    function tufts(y, n, col) {
        return Array.from({ length: n }, (_, i) => { const x = (i * 53 + 17) % 360; return `<path d="M${x} ${y + (i % 3) * 6} l2 -7 l1.5 7 l2 -9 l1.5 9 l2 -6 l1 6" fill="none" stroke="${col}" stroke-width="1.2"/>`; }).join('');
    }

    // ---------- Kooperative: Plantage ----------
    function plantation(me, pub) {
        const sky = SKY[me.sky] || SKY.sun;
        const n = clamp(Math.round(me.physical / 10), 1, 14);
        const sick = me.sky === 'blackpod' && !me.skyRumor;
        const back = Math.ceil(n / 2);
        const front = n - back;
        let trees = '';
        for (let i = 0; i < back; i++) trees += tree(30 + (i + 0.5) * (300 / back), 128, 0.78, sky, sick && i % 2 === 0, '#f0a63a');
        for (let i = 0; i < front; i++) trees += tree(18 + (i + 0.5) * (324 / Math.max(1, front)), 168, 1, sky, sick && i % 3 === 1, '#e8892a');
        let weather = '';
        if (me.sky === 'drought') weather = '<circle cx="290" cy="42" r="34" fill="#fff3b0" class="sun-glow"/><circle cx="290" cy="42" r="22" fill="#ffd34d"/>';
        else if (me.sky === 'rain' || me.sky === 'blackpod') {
            weather = `<g class="clouds"><ellipse cx="90" cy="38" rx="44" ry="16" fill="rgba(235,240,250,.85)"/><ellipse cx="120" cy="30" rx="30" ry="16" fill="rgba(235,240,250,.9)"/><ellipse cx="250" cy="44" rx="50" ry="17" fill="rgba(225,232,245,.8)"/><ellipse cx="280" cy="34" rx="28" ry="15" fill="rgba(235,240,250,.9)"/></g>`;
            if (me.sky === 'rain') weather += `<g class="rain">${Array.from({ length: 26 }, (_, i) => `<line x1="${10 + i * 14}" y1="${50 + (i % 3) * 8}" x2="${4 + i * 14}" y2="${66 + (i % 3) * 8}"/>`).join('')}</g>`;
            else weather += `<g class="spores">${Array.from({ length: 18 }, (_, i) => `<circle cx="${(i * 47) % 350 + 5}" cy="${70 + ((i * 29) % 70)}" r="${1.5 + (i % 3)}"/>`).join('')}</g>`;
        } else {
            // Sonne in der Mitte (rechts oben steht der Börsenpreis), dazu ziehende Wolken und Vögel
            weather = `<circle cx="196" cy="34" r="17" fill="#fff1a8" class="sun-glow"/>
                <g class="drift"><ellipse cx="60" cy="58" rx="30" ry="9" fill="rgba(255,255,255,.75)"/><ellipse cx="80" cy="52" rx="18" ry="9" fill="rgba(255,255,255,.85)"/></g>
                <g class="drift d2"><ellipse cx="20" cy="76" rx="24" ry="7" fill="rgba(255,255,255,.55)"/><ellipse cx="36" cy="71" rx="14" ry="7" fill="rgba(255,255,255,.65)"/></g>
                <g class="bird"><path d="M20 62 q5 -5 10 0 q5 -5 10 0" fill="none" stroke="#2b3a4a" stroke-width="1.6" stroke-linecap="round"/></g>
                <g class="bird" style="animation-delay:-6s"><path d="M0 74 q4 -4 8 0 q4 -4 8 0" fill="none" stroke="#2b3a4a" stroke-width="1.4" stroke-linecap="round"/></g>
                ${me.sky === 'record' ? '<path d="M40 130 A 140 110 0 0 1 320 130" fill="none" stroke="url(#rb)" stroke-width="10" opacity=".55"/>' : ''}`;
        }
        const svg = `<svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice">
            <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky.a}"/><stop offset="1" stop-color="${sky.b}"/></linearGradient>
            <linearGradient id="rb" x1="0" x2="1"><stop offset="0" stop-color="#ff5e5e"/><stop offset=".3" stop-color="#ffd84d"/><stop offset=".6" stop-color="#5eff8a"/><stop offset="1" stop-color="#5ea8ff"/></linearGradient></defs>
            <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient>
            <linearGradient id="hillG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
            <pattern id="beanP" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#7a3f1c"/><circle cx="1.5" cy="1.5" r="1" fill="#b0652d"/></pattern>
            <rect width="360" height="200" fill="url(#sky)"/>${weather}
            <path d="M0 108 L40 80 L70 96 L120 62 L160 92 L210 70 L250 94 L300 66 L360 98 L360 140 L0 140Z" fill="${sky.hill2}" opacity=".45"/>
            <path d="M112 66 L120 62 L128 67 L122 70Z M292 70 L300 66 L307 71 L300 73Z" fill="rgba(255,255,255,.5)"/>
            <rect y="60" width="360" height="80" fill="url(#haze)"/>
            <path d="M0 120 Q 90 86 190 114 T 360 104 L360 200 L0 200Z" fill="${sky.hill2}"/><path d="M0 120 Q 90 86 190 114 T 360 104 L360 200 L0 200Z" fill="url(#hillG)"/><path d="M0 120 Q 90 86 190 114 T 360 104 L360 200 L0 200Z" fill="url(#texTerrain)" opacity=".35" style="mix-blend-mode:overlay"/>
            <g transform="translate(316 108)"><rect x="-10" y="-8" width="20" height="12" fill="#e2c999"/><rect x="-10" y="-8" width="6" height="12" fill="rgba(0,0,0,.12)"/><path d="M-13 -7 L0 -17 L13 -7Z" fill="#8a5a32"/><path d="M0 -17 L13 -7 L0 -7Z" fill="#6a4122"/><rect x="-2" y="-3" width="4" height="7" fill="#3b2412"/>
                <rect x="-36" y="-2" width="20" height="5" fill="url(#beanP)"/><path d="M-36 3 V8 M-16 3 V8" stroke="#5b3a1f" stroke-width="1.2"/></g>
            <path d="M0 150 Q 120 122 230 146 T 360 140 L360 200 L0 200Z" fill="${sky.hill}"/><path d="M0 150 Q 120 122 230 146 T 360 140 L360 200 L0 200Z" fill="url(#hillG)"/><path d="M0 150 Q 120 122 230 146 T 360 140 L360 200 L0 200Z" fill="url(#texTerrain)" opacity=".4" style="mix-blend-mode:overlay"/>
            ${tufts(150, 14, sky.hill2)}
            ${trees}
            ${tufts(186, 18, 'rgba(0,0,0,.25)')}</svg>`;
        const d = me.physical - 100;
        return `<div class="scene farm">${svg}
            <div class="sc-chip tl">${me.skyRumor ? '📡 Prognose: ' : ''}${sky.label}</div>
            ${me.region ? `<div class="sc-chip tl2">📍 ${REGIONS[me.region].name}</div>` : ''}
            <div class="sc-chip tr">Börse <b class="sc-price"></b></div>
            <div class="sc-big"><small>Erwartete Ernte</small><b>${me.physical} t</b>${d ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${Math.abs(d)} t</em>` : ''}</div></div>`;
    }

    // Lagerhaus: jeder Sack = 10 t, verkaufte Säcke tragen ein Terminvertrag-Siegel.
    function sacks(me) {
        const n = Math.max(1, Math.ceil(me.physical / 10));
        const sold = Math.max(0, -me.pos);
        let html = '';
        for (let i = 0; i < n; i++) html += `<span class="sack ${i < sold ? 'sold' : ''} ${i < sold && i >= lastSold ? 'stamp' : ''}"><i>🫘</i>${i < sold ? '<em>VERKAUFT</em>' : ''}</span>`;
        lastSold = sold;
        for (let i = n; i < sold; i++) html += '<span class="sack missing"><i>?</i><em>FEHLT</em></span>';
        return `<div class="barn"><div class="barn-head">🏚️ Lagerhaus <span class="dim small">1 Sack = 10 t · ${Math.min(sold, n)} von ${n} auf Termin verkauft</span></div><div class="sacks">${html}</div></div>`;
    }

    // ---------- Fabrik ----------
    function factory(me, pub) {
        const need = Math.max(0, -me.physical);
        const hedged = Math.max(0, me.pos * CFG.size);
        const q = need ? clamp(hedged / need, 0, 1) : 0;
        const siloH = 120;
        const fillH = Math.round(siloH * q);
        const bars = Math.min(8, 2 + me.orders.length);
        const svg = `<svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice">
            <defs><linearGradient id="fsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2230"/><stop offset="1" stop-color="#39465a"/></linearGradient>
            <linearGradient id="silo" x1="0" x2="1"><stop offset="0" stop-color="#8a96a8"/><stop offset=".5" stop-color="#d5dde8"/><stop offset="1" stop-color="#7a8698"/></linearGradient>
            <linearGradient id="choc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d39a62"/><stop offset="1" stop-color="#c86a12"/></linearGradient></defs>
            <rect width="360" height="200" fill="url(#fsky)"/>
            <g class="smoke"><circle cx="292" cy="34" r="9"/><circle cx="300" cy="22" r="12"/><circle cx="312" cy="10" r="15"/></g>
            <rect x="284" y="40" width="18" height="60" fill="#5b6576"/><rect x="284" y="46" width="18" height="5" fill="#ff9f1c"/>
            <pattern id="brick" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="16" height="8" fill="#5a3a2e"/><path d="M0 0 H16 M0 4 H16 M8 0 V4 M0 4 V8 M16 4 V8" stroke="#3a241c" stroke-width=".8"/><rect x="1" y="1" width="6" height="2" fill="rgba(255,255,255,.04)"/></pattern>
            ${Array.from({ length: 22 }, (_, i) => `<circle cx="${(i * 67) % 360}" cy="${(i * 23) % 40 + 4}" r="${i % 4 ? 0.6 : 1}" fill="#fff" opacity="${0.3 + (i % 3) * 0.2}"/>`).join('')}
            <path d="M0 120 L30 120 L30 92 L52 92 L52 120 L88 120 L88 104 L100 104 L100 120 Z" fill="#141a24"/>
            <path d="M110 100 L110 70 L150 50 L150 70 L190 50 L190 70 L230 50 L230 70 L270 50 L270 70 L310 50 L310 100 Z" fill="#4a5568"/>
            ${[0, 1, 2, 3, 4].map(i => `<path d="M${150 + i * 40 - 40} 70 L${150 + i * 40} 50 L${150 + i * 40} 70Z" fill="rgba(255,207,107,.0)"/><path d="M${150 + i * 40} 52 L${150 + i * 40} 70 L${146 + i * 40} 70 L${146 + i * 40} 54Z" fill="#9fc6e8" opacity=".7"/>`).join('')}
            <rect x="110" y="98" width="200" height="4" fill="#232a36"/>
            <rect x="110" y="100" width="200" height="66" fill="url(#brick)"/>
            <rect x="150" y="84" width="120" height="14" rx="2" fill="#11161f" stroke="#ff9f1c" stroke-width="1"/><text x="210" y="94.5" text-anchor="middle" font-size="8.5" font-weight="800" fill="#ffcf8a" font-family="monospace" letter-spacing="1.5">CHOCOLATERIE</text>
            ${[0, 1, 2, 3, 4].map(i => `<rect x="${122 + i * 38}" y="112" width="24" height="18" rx="2" fill="#ffcf6b" class="win" style="animation-delay:${i * 0.4}s"/><path d="M${134 + i * 38} 112 V130 M${122 + i * 38} 121 H${146 + i * 38}" stroke="#2d3748" stroke-width="1.5"/><rect x="${121 + i * 38}" y="129" width="26" height="2.5" fill="#8a96a8"/>`).join('')}
            <rect x="194" y="138" width="32" height="28" fill="#2a313c"/><rect x="196" y="140" width="28" height="26" fill="#1a202c"/>${[0, 1, 2, 3, 4].map(i => `<line x1="196" x2="224" y1="${144 + i * 5}" y2="${144 + i * 5}" stroke="#2d3748"/>`).join('')}
            <path d="M80 70 H118 V100" fill="none" stroke="#8a96a8" stroke-width="5"/><path d="M80 70 H118 V100" fill="none" stroke="#c3ccd8" stroke-width="1.2" stroke-dasharray="3 5"/><circle cx="118" cy="70" r="4" fill="#5b6576"/>
            <rect x="24" y="${44}" width="56" height="${siloH}" rx="8" fill="url(#silo)"/><rect x="24" y="44" width="56" height="${siloH}" rx="8" fill="url(#texMetal)" opacity=".3" style="mix-blend-mode:overlay"/><rect x="24" y="44" width="56" height="${siloH}" rx="8" fill="url(#texRust)" opacity=".35"/>
            <rect x="28" y="${44 + siloH - fillH}" width="48" height="${fillH}" rx="5" fill="url(#choc)" class="silo-fill"/>
            <ellipse cx="52" cy="44" rx="28" ry="8" fill="#c3ccd8"/><ellipse cx="52" cy="42" rx="8" ry="2.5" fill="#8a96a8"/>
            ${[0, 1, 2, 3].map(i => `<line x1="24" x2="80" y1="${70 + i * 26}" y2="${70 + i * 26}" stroke="rgba(0,0,0,.25)"/>`).join('')}
            <path d="M84 48 V164 M90 48 V164" stroke="#8a96a8" stroke-width="1.2"/>${Array.from({ length: 12 }, (_, i) => `<line x1="84" x2="90" y1="${54 + i * 9.5}" y2="${54 + i * 9.5}" stroke="#8a96a8" stroke-width="1"/>`).join('')}
            <path d="M30 164 L34 176 M74 164 L70 176" stroke="#5b6576" stroke-width="3"/>
            <text x="52" y="${44 + siloH / 2 + 5}" text-anchor="middle" class="silo-txt">${Math.round(q * 100)}%</text>
            <rect x="0" y="176" width="360" height="24" fill="#1a1f29"/>
            <rect x="0" y="168" width="360" height="8" fill="#4a5568"/>
            <g class="belt">${Array.from({ length: bars * 2 }, (_, i) => `<rect x="${i * (360 / bars)}" y="152" width="30" height="16" rx="3" fill="#7a4320" stroke="#c98a4b" stroke-width="1"/><path d="M${i * (360 / bars) + 10} 152 V168 M${i * (360 / bars) + 20} 152 V168" stroke="#5a2f15" stroke-width="1.5"/>`).join('')}</g>
            <rect x="0" y="194" width="360" height="6" fill="url(#hz)"/>
            <defs><pattern id="hz" width="16" height="6" patternUnits="userSpaceOnUse"><rect width="16" height="6" fill="#ff9f1c"/><path d="M0 6 L6 0 L10 0 L4 6Z M8 6 L14 0 L16 0 L16 2 L12 6Z" fill="#111"/></pattern></defs>
        </svg>`;
        return `<div class="scene plant">${svg}
            <div class="sc-chip tl">🛢️ Kakao-Silo gesichert</div>
            <div class="sc-chip tr">Kakao <b class="sc-price"></b></div>
            <div class="sc-big"><small>Bedarf Dezember</small><b>${need} t</b><em>${hedged} t gesichert</em></div></div>`;
    }

    // ---------- Hedgefonds: Terminal ----------
    function terminal(me, pub) {
        const p = pub.price;
        const rows = [];
        for (let i = 5; i >= 1; i--) rows.push({ side: 'ask', px: Math.round(p * (1 + CFG.spread * i * 1.6)), q: 2 + ((p * i) % 9 | 0) });
        for (let i = 1; i <= 5; i++) rows.push({ side: 'bid', px: Math.round(p * (1 - CFG.spread * i * 1.6)), q: 2 + ((p * (i + 3)) % 9 | 0) });
        const maxQ = Math.max(...rows.map(r => r.q));
        const book = rows.map(r => `<div class="ob ${r.side}"><i style="width:${(r.q / maxQ) * 100}%"></i><span>${fmt(r.px)}</span><b>${r.q}</b></div>`).join('');
        const lev = me.eq > 0 ? (Math.abs(me.pos) * CFG.size * p) / Math.max(1, me.cash + me.eq) : 0;
        return `<div class="scene term">
            <div class="term-top"><span>CC·DEZ</span><span class="blink">● LIVE</span><span>M${pub.month}/${pub.months}</span></div>
            <div class="term-grid">
                <div class="term-px"><small>LAST</small><b class="${p >= pub.p0 ? 'up' : 'down'}">${fmt(p)}</b><span class="${p >= pub.p0 ? 'up' : 'down'}">${pct(p / pub.p0 - 1)}</span>
                    <div class="term-kv"><span>POS</span><b class="${me.pos > 0 ? 'up' : me.pos < 0 ? 'down' : ''}">${me.pos > 0 ? '+' : ''}${me.pos}</b></div>
                    <div class="term-kv"><span>P&amp;L</span><b class="${me.unreal >= 0 ? 'up' : 'down'}">${signed(me.unreal)}</b></div>
                    <div class="term-kv"><span>HEBEL</span><b>${lev.toFixed(1)}×</b></div></div>
                <div class="term-book"><div class="ob-h"><span>PREIS</span><span>KONTR.</span></div>${book}</div>
            </div></div>`;
    }

    function render(me, pub) {
        const el = $('p-scene');
        let html;
        if (me.role === 'producer') html = plantation(me, pub);
        else if (me.role === 'processor') html = factory(me, pub);
        else html = terminal(me, pub);
        if (html !== lastKey) {
            lastKey = html;
            el.innerHTML = html;
        }
        const sp = el.querySelector('.sc-price');
        if (sp) sp.textContent = fmt(pub.price);
    }

    return { render };
})();
