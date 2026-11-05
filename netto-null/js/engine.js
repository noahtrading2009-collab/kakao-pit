// ===== NETTO NULL – Spiellogik (läuft beim Host) =====

const Engine = (() => {
    let G = null;

    function create() {
        G = {
            phase: 'lobby', round: -1, seq: 1, players: [],
            events: [null, ...shuffle(EVENTS.slice()).slice(0, CFG.rounds - 1)],
            capCut: 0, prices: [], volumes: [], totals: [], auction: null, auctions: [],
        };
        return G;
    }

    const byId = id => G.players.find(p => p.id === id);
    const event = () => G.events[G.round] || null;

    function pickCompany() {
        const count = Object.fromEntries(COMPANY_ORDER.map(c => [c, 0]));
        G.players.forEach(p => count[p.co]++);
        return COMPANY_ORDER.slice().sort((a, b) => count[a] - count[b])[0];
    }

    function addPlayer(name, key, bot = false, wish = '') {
        const p = {
            id: G.seq++, name, key, bot, co: COMPANIES[wish] ? wish : pickCompany(),
            cash: CFG.startCash, certs: 0, built: [], invested: 0, penalties: 0, bought: 0, sold: 0, spent: 0, earned: 0, rev: 0,
            ready: false, order: null, history: [], last: null,
        };
        G.players.push(p);
        return p;
    }

    function setCompany(id, co) {
        const p = byId(id);
        if (!p || G.phase !== 'lobby' || !COMPANIES[co]) return false;
        p.co = co;
        return true;
    }

    function removePlayer(id) {
        G.players = G.players.filter(p => p.id !== id);
    }

    // ===== Rechnen =====

    function capNow() {
        return Math.max(0, CFG.cap[G.round] - G.capCut);
    }

    function alloc(p) {
        return Math.round(capNow() * COMPANIES[p.co].alloc);
    }

    function emissions(p) {
        const ev = event();
        const cut = p.built.reduce((s, id) => s + measure(p, id).t, 0);
        return Math.max(0, CFG.baseline - cut + (ev && ev.extra ? ev.extra : 0));
    }

    function measure(p, id) {
        return COMPANIES[p.co].measures.find(m => m.id === id);
    }

    function costNow(p, m) {
        const ev = event();
        let d = 0;
        if (ev && ev.discount) {
            if (ev.sector && ev.sector === p.co) d = ev.discount;
            else if (ev.tag && m.id.startsWith(ev.tag)) d = ev.discount;
            else if (!ev.sector && !ev.tag) d = ev.discount;
        }
        return Math.round(m.cost * (1 - d));
    }

    // Kosten pro eingesparter Tonne über die restlichen Runden
    function perTon(p, m) {
        const left = CFG.rounds - G.round;
        return Math.round(costNow(p, m) / (m.t * left));
    }

    function need(p) {
        return emissions(p) - p.certs;
    }

    // ===== Ablauf =====

    function start() {
        G.round = -1;
        nextRound();
    }

    function nextRound() {
        G.round++;
        if (G.round >= CFG.rounds) return finish();
        const ev = event();
        if (ev && ev.capCut) G.capCut += ev.capCut;
        const cap = capNow();
        for (const p of G.players) {
            p.certs += alloc(p);
            p.cash += CFG.revenue + (ev && ev.revenue ? ev.revenue : 0);
            p.rev += CFG.revenue + (ev && ev.revenue ? ev.revenue : 0);
            p.ready = false;
            if (!p.order || p.order.side !== 'buy') p.unfilled = false;
            p.order = null;
            p.roundInvest = 0;
        }
        G.auction = null;
        G.phase = 'news';
    }

    function decide() {
        if (G.phase !== 'news') return;
        G.phase = 'decide';
        G.players.filter(p => p.bot).forEach(botDecide);
    }

    function build(id, mid) {
        const p = byId(id);
        if (!p || G.phase !== 'decide') return { ok: false, msg: 'Investieren geht nur in der Entscheidungsphase.' };
        if (p.ready) return { ok: false, msg: 'Du hast schon «Fertig» gedrückt.' };
        const m = measure(p, mid);
        if (!m || p.built.includes(mid)) return { ok: false, msg: 'Schon gebaut.' };
        const c = costNow(p, m);
        if (p.cash < c) return { ok: false, msg: `Zu wenig Geld (${fmt(c)} CHF nötig).` };
        p.cash -= c;
        p.invested += c;
        p.roundInvest += c;
        p.built.push(mid);
        if (p.order && p.order.side === 'sell' && p.order.qty > p.certs) p.order.qty = p.certs;
        return { ok: true, msg: `${m.name} gebaut: −${m.t} t CO₂ pro Runde.` };
    }

    function setOrder(id, o) {
        const p = byId(id);
        if (!p || G.phase !== 'decide') return { ok: false, msg: 'Gebote gehen nur in der Entscheidungsphase.' };
        if (p.ready) return { ok: false, msg: 'Du hast schon «Fertig» gedrückt.' };
        if (!o || !o.qty) {
            p.order = null;
            return { ok: true };
        }
        const side = o.side === 'buy' ? 'buy' : 'sell';
        const qty = Math.max(0, Math.trunc(o.qty));
        const price = clamp(Math.round(o.price), 1, CFG.maxPrice);
        if (side === 'sell' && qty > p.certs) return { ok: false, msg: `Du hast nur ${p.certs} Zertifikate.` };
        if (side === 'buy' && qty * price > p.cash) return { ok: false, msg: `Dafür reicht dein Geld nicht (${fmt(qty * price)} CHF).` };
        p.order = { side, qty, price };
        return { ok: true };
    }

    function setReady(id, v) {
        const p = byId(id);
        if (!p || G.phase !== 'decide') return;
        p.ready = !!v;
    }

    const allReady = () => G.players.length > 0 && G.players.every(p => p.ready);

    // ===== Auktion: ein Einheitspreis für alle (Call-Auktion) =====

    function auction() {
        if (G.phase !== 'decide') return;
        const buys = [];
        const sells = [];
        for (const p of G.players) {
            if (!p.order || !p.order.qty) continue;
            const arr = p.order.side === 'buy' ? buys : sells;
            arr.push({ p, price: p.order.price, qty: p.order.qty, r: Math.random() });
        }
        buys.sort((a, b) => b.price - a.price || a.r - b.r);
        sells.sort((a, b) => a.price - b.price || a.r - b.r);
        // Kurven für die Grafik
        const curve = list => {
            let q = 0;
            return list.map(o => { q += o.qty; return { q, price: o.price }; });
        };
        const demand = curve(buys);
        const supply = curve(sells);
        // Schnittpunkt suchen (Einheit für Einheit)
        let bi = 0;
        let si = 0;
        let bLeft = buys[0] ? buys[0].qty : 0;
        let sLeft = sells[0] ? sells[0].qty : 0;
        let qty = 0;
        let lastB = null;
        let lastS = null;
        while (bi < buys.length && si < sells.length && buys[bi].price >= sells[si].price) {
            const q = Math.min(bLeft, sLeft);
            qty += q;
            lastB = buys[bi].price;
            lastS = sells[si].price;
            bLeft -= q;
            sLeft -= q;
            if (!bLeft && ++bi < buys.length) bLeft = buys[bi].qty;
            if (!sLeft && ++si < sells.length) sLeft = sells[si].qty;
        }
        let price;
        if (qty) price = Math.round((lastB + lastS) / 2);
        else if (buys.length && sells.length) price = Math.round((buys[0].price + sells[0].price) / 2);
        else price = G.prices.length ? G.prices[G.prices.length - 1] : null;
        // Ausführen zum Einheitspreis
        let rest = qty;
        for (const o of buys) {
            const q = Math.min(o.qty, rest);
            rest -= q;
            o.fill = q;
            o.p.unfilled = q < o.qty;
            o.p.certs += q;
            o.p.cash -= q * price;
            o.p.bought += q;
            o.p.spent += q * price;
        }
        rest = qty;
        for (const o of sells) {
            const q = Math.min(o.qty, rest);
            rest -= q;
            o.fill = q;
            o.p.certs -= q;
            o.p.cash += q * price;
            o.p.sold += q;
            o.p.earned += q * price;
        }
        G.auction = { price, qty, demand, supply, fills: [...buys, ...sells].map(o => ({ id: o.p.id, side: o.p.order.side, qty: o.qty, fill: o.fill, limit: o.price })) };
        G.auctions.push({ price, qty });
        if (price !== null) G.prices.push(price);
        G.volumes.push(qty);
        settle();
    }

    // ===== Abrechnung: jede Tonne braucht ein Zertifikat =====

    function settle() {
        let tot = 0;
        let pen = 0;
        for (const p of G.players) {
            const e = emissions(p);
            tot += e;
            let penalty = 0;
            if (p.certs >= e) p.certs -= e;
            else {
                penalty = (e - p.certs) * CFG.penalty;
                pen += e - p.certs;
                p.cash -= penalty;
                p.penalties += penalty;
                p.certs = 0;
            }
            const f = G.auction.fills.find(x => x.id === p.id);
            p.last = { emissions: e, penalty, fill: f ? (f.side === 'buy' ? f.fill : -f.fill) : 0, invest: p.roundInvest, certsLeft: p.certs };
            p.history.push({ round: G.round, ...p.last, cash: p.cash });
        }
        G.totals.push({ emissions: tot, cap: G.players.reduce((s, p) => s + alloc(p), 0), base: CFG.baseline * G.players.length, uncovered: pen });
        G.phase = 'result';
    }

    function finish() {
        G.phase = 'end';
        G.round = CFG.rounds - 1;
    }

    // ===== KI-Firmen =====

    function botDecide(p) {
        const E = G.prices.length ? G.prices[G.prices.length - 1] : 90;
        const left = CFG.rounds - G.round;
        const opts = COMPANIES[p.co].measures.filter(m => !p.built.includes(m.id)).sort((a, b) => perTon(p, a) - perTon(p, b));
        // Erwarteter Mangel bis Spielende (Ausstoss minus künftige Gratis-Zertifikate minus Vorrat)
        const shortfall = () => {
            let s = -p.certs;
            for (let r = G.round; r < CFG.rounds; r++) {
                s += emissions(p);
                if (r > G.round) s -= Math.round(Math.max(0, CFG.cap[r] - G.capCut) * COMPANIES[p.co].alloc);
            }
            return s;
        };
        // Bauen, wenn die Massnahme billiger ist als der erwartete CO₂-Preis
        // (dann lohnt sich sparen und Zertifikate verkaufen).
        for (const m of opts) {
            const pt = perTon(p, m);
            if (pt < E * (0.85 + Math.random() * 0.3) && p.cash - costNow(p, m) > 2000) build(p.id, m.id);
        }
        const rest = COMPANIES[p.co].measures.filter(m => !p.built.includes(m.id)).map(m => perTon(p, m));
        const mac = rest.length ? Math.min(...rest) : CFG.penalty;
        const S = shortfall();
        const last = left === 1;
        if (S > 0) {
            // Mangel: kaufen – höchstens so teuer wie die eigene nächste Massnahme (oder Strafe)
            const n = need(p);
            const qty0 = last ? Math.max(0, n) : Math.max(Math.max(0, n), Math.ceil(S / left) + 4);
            const lim = Math.round(clamp(Math.min(mac, CFG.penalty * 0.9) * (0.92 + Math.random() * 0.16), 10, CFG.penalty - 10));
            const qty = Math.min(qty0, S + Math.max(0, n), Math.floor(p.cash / lim));
            if (qty > 0) setOrder(p.id, { side: 'buy', qty, price: lim });
            // Wenn sogar die nächste Massnahme billiger ist als gekaufte Zertifikate: bauen
            const nextM = COMPANIES[p.co].measures.filter(m => !p.built.includes(m.id)).sort((a, b) => perTon(p, a) - perTon(p, b))[0];
            if (nextM && perTon(p, nextM) < E * 0.95 && p.cash - costNow(p, nextM) > 2000) build(p.id, nextM.id);
            // Letztes Mal keine Zertifikate bekommen? Dann lieber selbst sparen statt Strafe zahlen.
            if (p.unfilled) {
                for (const m of COMPANIES[p.co].measures.filter(x => !p.built.includes(x.id)).sort((a, b) => perTon(p, a) - perTon(p, b))) {
                    if (shortfall() > m.t / 2 && perTon(p, m) < CFG.penalty * 0.8 && p.cash - costNow(p, m) > 1000) build(p.id, m.id);
                }
            }
        } else if (S < 0) {
            // Überschuss bis Spielende: verkaufen
            const spare = Math.min(p.certs, -S - (last ? 0 : 8));
            const lim = last ? 5 : Math.round(clamp(E * (0.7 + Math.random() * 0.2), 5, CFG.maxPrice));
            if (spare > 0) setOrder(p.id, { side: 'sell', qty: spare, price: lim });
        }
        p.ready = true;
    }

    // ===== Sichten =====

    function ranking() {
        return G.players.slice().sort((a, b) => b.cash - a.cash).map(p => p.id);
    }

    function publicState() {
        const rk = ranking();
        return {
            phase: G.phase, round: G.round, rounds: CFG.rounds, year: CFG.years[Math.max(0, G.round)], event: event(),
            cap: G.round >= 0 ? capNow() : CFG.cap[0], prices: G.prices, volumes: G.volumes, totals: G.totals, auction: G.auction,
            players: G.players.map(p => ({ id: p.id, name: p.name, co: p.co, bot: p.bot, ready: p.ready, cash: p.cash, rank: rk.indexOf(p.id) + 1, emissions: G.round >= 0 ? emissions(p) : CFG.baseline, built: p.built.length })),
        };
    }

    function personal(id) {
        const p = byId(id);
        if (!p) return null;
        const C = COMPANIES[p.co];
        return {
            id: p.id, name: p.name, co: p.co, cash: p.cash, certs: p.certs, ready: p.ready, order: p.order,
            emissions: G.round >= 0 ? emissions(p) : CFG.baseline, need: G.round >= 0 ? need(p) : 0, alloc: G.round >= 0 ? alloc(p) : Math.round(CFG.cap[0] * COMPANIES[p.co].alloc),
            measures: C.measures.map(m => ({ ...m, built: p.built.includes(m.id), now: G.round >= 0 ? costNow(p, m) : m.cost, perTon: G.round >= 0 ? perTon(p, m) : 0 })),
            invested: p.invested, penalties: p.penalties, bought: p.bought, sold: p.sold, last: p.last, history: p.history,
            rank: ranking().indexOf(p.id) + 1, profit: p.cash - CFG.startCash,
        };
    }

    // ===== Auswertung: Was hätte es ohne Handel gekostet? =====

    // Kosten, um eine Gesamt-Einsparung (Tonnen über alle Runden, Aufbewahren erlaubt)
    // mit den billigsten Massnahmen zu erreichen. Massnahmen werden sofort gebaut.
    function cheapest(measures, need) {
        const list = measures.slice().sort((a, b) => a.cost / a.t - b.cost / b.t);
        let saved = 0;
        let cost = 0;
        for (const m of list) {
            if (saved >= need) break;
            const gain = m.t * CFG.rounds;
            // teilweise nötig? Dann nur anteilig (wie wenn man später baut)
            const part = Math.min(1, (need - saved) / gain);
            saved += gain * part;
            cost += m.cost * part;
        }
        if (saved < need) cost += (need - saved) * CFG.penalty;
        return Math.round(cost);
    }

    function benchmarks() {
        let capCut = 0;
        const caps = [];
        const extras = [];
        for (let r = 0; r < CFG.rounds; r++) {
            const ev = G.events[r];
            if (ev && ev.capCut) capCut += ev.capCut;
            caps.push(Math.max(0, CFG.cap[r] - capCut));
            extras.push(ev && ev.extra ? ev.extra : 0);
        }
        const needOf = p => caps.reduce((s, c, r) => s + Math.max(0, CFG.baseline + extras[r] - Math.round(c * COMPANIES[p.co].alloc)), 0);
        const solo = G.players.reduce((s, p) => s + cheapest(COMPANIES[p.co].measures, needOf(p)), 0);
        const pool = G.players.flatMap(p => COMPANIES[p.co].measures);
        const totalNeed = caps.reduce((s, c, r) => s + Math.max(0, G.players.reduce((a, p) => a + CFG.baseline + extras[r] - Math.round(c * COMPANIES[p.co].alloc), 0)), 0);
        const market = cheapest(pool, totalNeed);
        const actual = G.players.reduce((s, p) => s + p.invested + p.penalties, 0);
        return { solo, market, actual };
    }

    function debrief() {
        const rows = G.players.map(p => ({
            id: p.id, name: p.name, co: p.co, bot: p.bot, cash: p.cash, profit: p.cash - CFG.startCash - p.rev,
            invested: p.invested, penalties: p.penalties, bought: p.bought, sold: p.sold, spent: p.spent,
            earnedSales: p.earned, cut: p.built.reduce((s, id) => s + measure(p, id).t, 0), built: p.built.length,
        })).sort((a, b) => b.cash - a.cash);
        return { rows, prices: G.prices, totals: G.totals, bench: benchmarks(), n: G.players.length };
    }

    return {
        get G() { return G; },
        create, addPlayer, setCompany, removePlayer, start, decide, build, setOrder, setReady, allReady, auction, nextRound,
        publicState, personal, debrief, botDecide,
    };
})();
