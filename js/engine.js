// ===== KAKAO PIT – Markt-Engine (läuft nur beim Host, der Host ist die Börse) =====
// Kontrakt: 10 t Kakao, Fälligkeit Dezember (nach CFG.months Handelsmonaten).
// Konten pro Spieler: cash (frei) + margin (Einschuss bei der Börse).
// Abrechnung (Mark-to-Market) am Ende jedes Monats gegen den Referenzpreis G.ref.
// Ein Trade zum Preis X verbucht sofort (ref − X) × Menge aufs Margin-Konto, damit die
// spätere Abrechnung gegen ref genau den Gewinn ab X ergibt.

const Engine = (() => {
    let G = null;
    let emit = () => {};

    function create(len, onEvent) {
        emit = onEvent || (() => {});
        G = {
            phase: 'lobby', len, monthSec: CFG.monthSec[len] || CFG.monthSec.normal,
            clock: 0, sec: 0, month: 1, settleLeft: 0,
            price: CFG.p0, ref: CFG.p0, marginRate: CFG.marginRate, pendingRate: null,
            history: [{ s: 0, p: CFG.p0 }], marks: [], feed: [], events: [], players: [], offers: [], tape: [],
            flow: 0, drift: 0, seq: 1,
        };
        return G;
    }

    // ===== Spieler =====

    function chooseRole() {
        const counts = { producer: 0, processor: 0, spec: 0 };
        G.players.forEach(p => { counts[p.role]++; });
        const min = Math.min(...Object.values(counts));
        return rand(Object.keys(counts).filter(k => counts[k] === min));
    }

    function addPlayer(name, key, bot = false, role = null) {
        const existing = key && G.players.find(p => p.key === key);
        if (existing) {
            existing.connected = true;
            return existing;
        }
        if (G.phase !== 'lobby' && !bot) return null;
        role = role || chooseRole();
        const R = ROLES[role];
        const p = {
            id: G.seq++, name: String(name || 'Trader').slice(0, 18), key, bot, role, connected: true,
            cash: R.cash, margin: 0, pos: 0, fees: 0, trades: 0, liquidations: 0, bankrupt: false,
            call: null, expAcc: 0, expN: 0, startValue: R.cash + R.physical * CFG.p0, notes: [],
        };
        G.players.push(p);
        return p;
    }

    // Players may pick or switch their role while the room is still in the lobby.
    function setRole(id, role) {
        const p = byId(id);
        if (!p || G.phase !== 'lobby' || !ROLES[role]) return false;
        const R = ROLES[role];
        p.role = role;
        p.cash = R.cash;
        p.startValue = R.cash + R.physical * CFG.p0;
        return true;
    }

    function removePlayer(id) {
        if (G.phase === 'lobby') G.players = G.players.filter(p => p.id !== id);
    }

    const byId = id => G.players.find(p => p.id === id);
    const unreal = p => p.pos * (G.price - G.ref) * CFG.size;
    const futEq = p => p.margin + unreal(p);
    const req = (p, pos = p.pos) => Math.abs(pos) * G.price * CFG.size * G.marginRate;
    const exposure = p => ROLES[p.role].physical + p.pos * CFG.size;
    const liveResult = p => p.cash + futEq(p) + ROLES[p.role].physical * G.price - p.startValue;
    function hedgeQuote(p) {
        if (p.role === 'spec' || !p.expN) return 0;
        return clamp(1 - p.expAcc / p.expN / Math.abs(ROLES[p.role].physical), 0, 1);
    }
    function bonus(p) {
        const q = hedgeQuote(p);
        return p.role !== 'spec' && !p.bankrupt && q >= 0.5 ? Math.round(CFG.missionBonus * q) : 0;
    }
    const score = p => liveResult(p) + bonus(p);

    function note(p, kind, text) {
        p.notes.push({ kind, text, sec: G.sec });
        if (p.notes.length > 20) p.notes.shift();
        emit('note', { pid: p.id, kind, text });
    }

    // ===== Handel =====

    function execute(p, q, price, fee, reducing) {
        p.margin += q * (G.ref - price) * CFG.size;
        p.pos += q;
        p.cash -= fee;
        p.fees += fee;
        p.trades++;
        const need = req(p);
        const eq = futEq(p);
        if (eq < need) {
            const t = Math.min(need - eq, Math.max(0, p.cash));
            p.cash -= t;
            p.margin += t;
        } else if (reducing && eq > need) {
            const r = Math.min(eq - need, Math.max(0, p.margin));
            p.margin -= r;
            p.cash += r;
        }
        if (p.call && (p.pos === 0 || futEq(p) >= req(p))) {
            p.call = null;
            note(p, 'good', 'Margin Call erledigt.');
        }
    }

    function check(p, newPos, fee) {
        if (!p || p.bankrupt) return 'Dein Konto ist gesperrt (Konkurs).';
        if (G.phase !== 'trading') return 'Die Börse ist gerade geschlossen.';
        const lim = ROLES[p.role].limit;
        if (Math.abs(newPos) > lim) return `Positionslimit: höchstens ${lim} Kontrakte.`;
        if (Math.abs(newPos) > Math.abs(p.pos) && p.cash + futEq(p) - fee < req(p, newPos)) {
            return `Zu wenig Geld für den Einschuss (${fmt(req(p, newPos))} CHF nötig).`;
        }
        return null;
    }

    function trade(id, q) {
        const p = byId(id);
        q = Math.trunc(q);
        if (!q) return { ok: false, msg: 'Ungültige Menge.' };
        const fee = Math.abs(q) * CFG.fee;
        const err = check(p, p && p.pos + q, fee);
        if (err) return { ok: false, msg: err };
        const price = Math.round(G.price * (1 + Math.sign(q) * CFG.spread));
        const reducing = Math.abs(p.pos + q) < Math.abs(p.pos);
        execute(p, q, price, fee, reducing);
        G.flow += q;
        pushTape({ who: p.name, role: p.role, q, price, kind: 'markt' });
        return { ok: true, price, q };
    }

    function pushTape(t) {
        G.tape.unshift({ ...t, sec: G.sec });
        if (G.tape.length > 30) G.tape.pop();
        emit('trade', t);
    }

    // ===== Angebote zwischen Spielern (Block-Deals) =====

    function postOffer(id, side, qty, price) {
        const p = byId(id);
        qty = Math.trunc(qty);
        price = Math.round(price);
        if (!(qty >= 1 && qty <= 10)) return { ok: false, msg: 'Menge 1 bis 10 Kontrakte.' };
        if (Math.abs(price / G.price - 1) > CFG.offerBand) return { ok: false, msg: `Preis höchstens ±${CFG.offerBand * 100} % vom Markt.` };
        if (G.offers.filter(o => o.by === id).length >= 2) return { ok: false, msg: 'Höchstens 2 offene Angebote.' };
        const q = side === 'buy' ? qty : -qty;
        const err = check(p, p && p.pos + q, 0);
        if (err) return { ok: false, msg: err };
        const o = { id: G.seq++, by: id, byName: p.name, role: p.role, side, qty, price, until: G.sec + CFG.offerSec };
        G.offers.push(o);
        emit('offer', o);
        return { ok: true, offer: o };
    }

    function cancelOffer(id, offerId) {
        G.offers = G.offers.filter(o => !(o.id === offerId && o.by === id));
        return { ok: true };
    }

    function acceptOffer(id, offerId) {
        const o = G.offers.find(x => x.id === offerId);
        if (!o) return { ok: false, msg: 'Angebot ist weg – jemand war schneller.' };
        if (o.by === id) return { ok: false, msg: 'Das ist dein eigenes Angebot.' };
        const maker = byId(o.by);
        const taker = byId(id);
        const qm = o.side === 'buy' ? o.qty : -o.qty;
        const fee = (o.qty * CFG.fee) / 2;
        const errT = check(taker, taker && taker.pos - qm, fee);
        if (errT) return { ok: false, msg: errT };
        const errM = check(maker, maker.pos + qm, fee);
        if (errM) {
            G.offers = G.offers.filter(x => x !== o);
            return { ok: false, msg: `${maker.name} kann nicht mehr liefern – Angebot gelöscht.` };
        }
        G.offers = G.offers.filter(x => x !== o);
        execute(maker, qm, o.price, fee, Math.abs(maker.pos + qm) < Math.abs(maker.pos));
        execute(taker, -qm, o.price, fee, Math.abs(taker.pos - qm) < Math.abs(taker.pos));
        pushTape({ who: `${taker.name} ⇄ ${maker.name}`, role: taker.role, q: -qm, price: o.price, kind: 'deal' });
        note(maker, 'good', `${taker.name} hat dein Angebot angenommen: ${o.side === 'buy' ? 'gekauft' : 'verkauft'} ${o.qty} × ${fmt(o.price)}.`);
        return { ok: true, price: o.price, q: -qm };
    }

    function topUp(id) {
        const p = byId(id);
        if (!p || !p.call) return { ok: false, msg: 'Kein Margin Call offen.' };
        const need = req(p) - futEq(p);
        const t = Math.min(need, p.cash);
        p.cash -= t;
        p.margin += t;
        if (futEq(p) >= req(p) - 0.5) {
            p.call = null;
            return { ok: true, msg: 'Nachgeschossen – Position bleibt offen.' };
        }
        return { ok: false, msg: 'Nicht genug Bargeld. Reduziere deine Position!' };
    }

    function liquidate(p, why) {
        if (p.pos !== 0) {
            const q = -p.pos;
            const price = Math.round(G.price * (1 + Math.sign(q) * CFG.spread * 2));
            execute(p, q, price, Math.abs(q) * CFG.fee, true);
            G.flow += q;
            pushTape({ who: `${p.name} (Zwangsglattstellung)`, role: p.role, q, price, kind: 'liq' });
        }
        p.call = null;
        p.liquidations++;
        if (p.cash + p.margin < 0) {
            p.cash += p.margin;
            p.margin = 0;
            p.bankrupt = true;
            note(p, 'bad', 'KONKURS: Dein Konto ist leer. Du kannst nicht mehr handeln.');
            feed({ kind: 'alert', icon: '💀', text: `${p.name} ist pleite!` });
        } else {
            p.cash += p.margin;
            p.margin = 0;
            note(p, 'bad', why);
        }
        emit('liquidation', { pid: p.id });
    }

    // ===== News =====

    function feed(item) {
        const it = { ...item, sec: G.sec, clock: G.clock };
        G.feed.unshift(it);
        if (G.feed.length > 40) G.feed.pop();
        emit('news', it);
    }

    function scheduleNews() {
        const total = CFG.months * G.monthSec;
        const pool = [...NEWS].sort(() => Math.random() - 0.5);
        const evs = [];
        for (let m = 0; m < CFG.months; m++) {
            const base = m * G.monthSec;
            const n = m === 0 ? 1 : 2;
            for (let k = 0; k < n && pool.length; k++) {
                const at = base + Math.round(10 + (k + Math.random() * 0.8) * ((G.monthSec - 25) / n));
                const def = pool.pop();
                evs.push({ type: 'rumor', def, at, resolveAt: Math.min(total - 4, at + 14 + Math.round(Math.random() * 12)), confirmed: Math.random() < def.prob, priced: 0, stage: 'pending' });
            }
        }
        [...SURPRISES].sort(() => Math.random() - 0.5).slice(0, 2).forEach((s, i) => {
            evs.push({ type: 'surprise', def: s, at: Math.round(G.monthSec * (1.3 + i * 1.4) + Math.random() * 20), stage: 'pending' });
        });
        if (Math.random() < 0.6) evs.push({ type: 'hike', def: MARGIN_HIKE, at: Math.round(G.monthSec * (1.5 + Math.random())), stage: 'pending' });
        G.events = evs.filter(e => e.at < total - 3).sort((a, b) => a.at - b.at);
    }

    function runNews() {
        let drift = 0;
        for (const e of G.events) {
            if (e.stage === 'pending' && G.clock >= e.at) {
                if (e.type === 'rumor') {
                    e.stage = 'rumor';
                    e.target = e.def.impact * e.def.prob * 0.6;
                    feed({ kind: 'rumor', icon: e.def.icon, text: `GERÜCHT: ${e.def.rumor}`, dir: Math.sign(e.def.impact) });
                } else if (e.type === 'surprise') {
                    e.stage = 'done';
                    drift += e.def.impact;
                    feed({ kind: 'flash', icon: e.def.icon, text: e.def.text, dir: Math.sign(e.def.impact) });
                } else if (e.type === 'hike') {
                    e.stage = 'done';
                    G.pendingRate = e.def.rate;
                    feed({ kind: 'alert', icon: e.def.icon, text: e.def.text });
                }
            }
            if (e.stage === 'rumor') {
                if (G.clock >= e.resolveAt) {
                    e.stage = 'done';
                    const jump = e.confirmed ? e.def.impact - e.priced : -e.priced;
                    drift += jump;
                    feed({ kind: e.confirmed ? 'yes' : 'no', icon: e.confirmed ? '✅' : '❌', text: e.confirmed ? `BESTÄTIGT: ${e.def.yes}` : `DEMENTI: ${e.def.no}`, dir: Math.sign(jump) });
                } else {
                    const d = (e.target - e.priced) * 0.22;
                    e.priced += d;
                    drift += d;
                }
            }
        }
        return drift;
    }

    function activeRumors() {
        return G.events.filter(e => e.stage === 'rumor').map(e => ({ impact: e.def.impact, priced: e.priced, left: e.resolveAt - G.clock }));
    }

    // ===== Ablauf =====

    function start() {
        if (G.phase !== 'lobby') return;
        scheduleNews();
        G.phase = 'trading';
        feed({ kind: 'bell', icon: '🔔', text: `Die Börse ist eröffnet! Kakao Dezember-Future: ${fmt(G.price)} CHF/t.` });
        emit('open', { month: 1 });
    }

    function settle() {
        G.phase = 'settle';
        G.settleLeft = CFG.settleSec;
        if (G.pendingRate) {
            G.marginRate = G.pendingRate;
            G.pendingRate = null;
        }
        const results = [];
        for (const p of G.players) {
            const pl = p.pos * (G.price - G.ref) * CFG.size;
            p.margin += pl;
            results.push({ pid: p.id, pl });
        }
        G.ref = G.price;
        for (const p of G.players) {
            if (p.bankrupt) continue;
            const need = req(p);
            if (p.pos !== 0 && p.margin < need * CFG.maintenance) {
                p.call = { need: need - p.margin, until: G.sec + CFG.callSec };
                note(p, 'bad', `MARGIN CALL: Schiess ${fmt(need - p.margin)} CHF nach oder reduziere deine Position – sonst Zwangsglattstellung in ${CFG.callSec} s!`);
            } else if (p.margin > need) {
                const r = p.margin - need;
                p.margin -= r;
                p.cash += r;
            }
        }
        G.marks.push({ month: G.month, price: G.price, clock: G.clock });
        feed({ kind: 'settle', icon: '🧾', text: `Abrechnung Monat ${G.month}: Alle Positionen zu ${fmt(G.price)} CHF/t bewertet.` });
        emit('settle', { month: G.month, results });
    }

    function finish() {
        G.phase = 'end';
        for (const p of G.players) {
            p.cash += p.margin;
            p.margin = 0;
            p.cash += ROLES[p.role].physical * G.price;
        }
        G.offers = [];
        feed({ kind: 'bell', icon: '🔔', text: `Fälligkeit! Schlusskurs ${fmt(G.price)} CHF/t.` });
        emit('end', debrief());
    }

    function tick() {
        if (!G || G.phase === 'lobby' || G.phase === 'end') return;
        G.sec++;
        if (G.phase === 'trading') {
            G.clock++;
            const news = runNews();
            const flow = clamp(G.flow * CFG.impact, -0.03, 0.03);
            G.flow = 0;
            const next = G.price * (1 + gauss() * CFG.vol + news + flow);
            G.price = Math.round(clamp(next, CFG.minPrice, CFG.maxPrice));
            G.history.push({ s: G.clock, p: G.price });
            for (const p of G.players) {
                if (p.role !== 'spec') {
                    p.expAcc += Math.abs(exposure(p));
                    p.expN++;
                }
            }
            G.offers = G.offers.filter(o => o.until > G.sec);
        }
        for (const p of G.players) {
            if (p.bankrupt || p.pos === 0) continue;
            if (futEq(p) < 0) liquidate(p, 'Dein Margin-Konto ist leer: Position zwangsweise glattgestellt.');
            else if (p.call && G.sec >= p.call.until) liquidate(p, 'Frist abgelaufen: Deine Position wurde zwangsweise glattgestellt.');
        }
        if (G.phase === 'trading' && G.clock % G.monthSec === 0) settle();
        else if (G.phase === 'settle') {
            G.settleLeft--;
            if (G.settleLeft <= 0) {
                if (G.month >= CFG.months) return finish();
                G.month++;
                G.phase = 'trading';
                feed({ kind: 'bell', icon: '🔔', text: `Monat ${G.month} von ${CFG.months}: Handel läuft.` });
                emit('open', { month: G.month });
            }
        }
    }

    // ===== Zustand für Bildschirme =====

    function secLeft() {
        if (G.phase === 'settle') return G.settleLeft;
        if (G.phase !== 'trading') return 0;
        return G.monthSec - (G.clock % G.monthSec);
    }

    function ranking() {
        return G.players.map(p => ({ id: p.id, name: p.name, role: p.role, bot: p.bot, score: Math.round(score(p)), pos: p.pos, bankrupt: p.bankrupt, connected: p.connected }))
            .sort((a, b) => b.score - a.score);
    }

    function publicState(full = false) {
        return {
            phase: G.phase, month: G.month, months: CFG.months, secLeft: secLeft(), monthSec: G.monthSec,
            price: G.price, ref: G.ref, p0: CFG.p0, marginRate: G.marginRate, pendingRate: G.pendingRate,
            history: full ? G.history : G.history.slice(-90).map(h => h.p),
            offers: G.offers.map(o => ({ id: o.id, by: o.by, byName: o.byName, role: o.role, side: o.side, qty: o.qty, price: o.price, left: o.until - G.sec })),
            tape: G.tape.slice(0, full ? 12 : 5),
            feed: G.feed.slice(0, full ? 8 : 4),
            ranking: ranking(),
            playerCount: G.players.length,
        };
    }

    function personal(id) {
        const p = byId(id);
        if (!p) return null;
        const rank = ranking().findIndex(r => r.id === id) + 1;
        return {
            id: p.id, name: p.name, role: p.role, cash: Math.round(p.cash), margin: Math.round(p.margin), pos: p.pos,
            eq: Math.round(futEq(p)), unreal: Math.round(unreal(p)), req: Math.round(req(p)), exposure: exposure(p),
            call: p.call ? { need: Math.round(Math.max(0, req(p) - futEq(p))), left: Math.max(0, p.call.until - G.sec) } : null,
            result: Math.round(liveResult(p)), bonus: bonus(p), hedgeQuote: hedgeQuote(p), rank, bankrupt: p.bankrupt,
            limit: ROLES[p.role].limit, notes: p.notes.slice(-3), liquidations: p.liquidations,
        };
    }

    function debrief() {
        const rows = G.players.map(p => {
            const R = ROLES[p.role];
            const physPL = R.physical * (G.price - CFG.p0);
            const result = p.cash - p.startValue;
            return {
                id: p.id, name: p.name, role: p.role, bot: p.bot, result: Math.round(result), physPL: Math.round(physPL),
                futPL: Math.round(result - physPL), fees: Math.round(p.fees), bonus: bonus(p), score: Math.round(result + bonus(p)),
                hedgeQuote: hedgeQuote(p), liquidations: p.liquidations, bankrupt: p.bankrupt, trades: p.trades,
            };
        }).sort((a, b) => b.score - a.score);
        return { rows, final: G.price, p0: CFG.p0, change: G.price / CFG.p0 - 1, history: G.history, marks: G.marks, feed: G.feed.slice(0, 20) };
    }

    return {
        create, addPlayer, setRole, removePlayer, start, tick, trade, postOffer, cancelOffer, acceptOffer, topUp,
        publicState, personal, debrief, activeRumors, exposure, futEq, req, byId,
        get G() { return G; },
    };
})();
