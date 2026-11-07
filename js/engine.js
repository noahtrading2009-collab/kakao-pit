// ===== KAKAO PIT – Markt-Engine (läuft nur beim Host, der Host ist die Börse) =====
// Kontrakt: 10 t Kakao, Fälligkeit Dezember (nach CFG.months Handelsmonaten).
// Konten pro Spieler: cash (frei) + margin (Einschuss bei der Börse).
// Abrechnung (Mark-to-Market) am Ende jedes Monats gegen den Referenzpreis G.ref.
// Ein Trade zum Preis X verbucht sofort (ref − X) × Menge aufs Margin-Konto, damit die
// spätere Abrechnung gegen ref genau den Gewinn ab X ergibt.

const Engine = (() => {
    let G = null;
    let emit = () => {};

    function create(len, onEvent, years) {
        emit = onEvent || (() => {});
        G = {
            phase: 'lobby', len, monthSec: CFG.monthSec[len] || CFG.monthSec.normal,
            clock: 0, sec: 0, month: 1, settleLeft: 0,
            p0: CFG.p0, price: CFG.p0, ref: CFG.p0, marginRate: CFG.marginRate, pendingRate: null,
            history: [{ s: 0, p: CFG.p0 }], marks: [], feed: [], events: [], players: [], offers: [], tape: [],
            flow: 0, drift: 0, seq: 1, trades: [],
            year: 1, years: years || CFG.years, yearLog: [], shopLeft: 0,
            sug: { on: false, price: CFG.sP0, ref: CFG.sP0, p0: CFG.sP0, history: [{ s: 0, p: CFG.sP0 }], flow: 0, events: [] },
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
            call: null, expAcc: 0, expN: 0, startValue: R.cash + R.physical * G.p0, planValue: R.physical * G.p0, notes: [],
            physical: R.physical, basePhys: R.physical, revenue: 0, protect: false, harvestLog: [],
            upgrades: [], total: 0, yearPts: [], years: [], upSpent: 0, interest: 0, loans: 0, level: 0,
            spos: 0, sphys: 0, sbase: 0, region: null, stored: 0, storedNow: 0, storeFee: 0,
            orders: [], orderOffer: null, nextOrderAt: 8 + Math.floor(Math.random() * CFG.orderEvery),
            reports: [], researchAt: -999, researchSpent: 0,
            costs: 0,                                   // Pflanzenschutz, Bankzuschlag (für den Hedge-Vergleich)
            buyerOffer: null, nextBuyerAt: 10 + Math.floor(Math.random() * CFG.buyerEvery), sales: [], extraAt: [],
            cancels: 0, nextCancelAt: 40 + Math.floor(Math.random() * 30),
        };
        if (role === 'producer') {
            // 1–2 Mal liefern Mitglieder Nachernte (zufälliger Zeitpunkt in Monat 1–3)
            const n = 1 + (Math.random() < 0.5 ? 1 : 0);
            for (let i = 0; i < n; i++) p.extraAt.push(0.1 + Math.random() * 0.6);   // Anteil der Spielzeit
        }
        if (role === 'producer') p.region = pickRegion();
        G.players.push(p);
        return p;
    }

    function pickRegion() {
        const cnt = Object.fromEntries(COCOA_REGIONS.map(r => [r, 0]));
        G.players.forEach(p => { if (p.region && cnt[p.region] !== undefined) cnt[p.region]++; });
        const min = Math.min(...Object.values(cnt));
        return rand(COCOA_REGIONS.filter(r => cnt[r] === min));
    }

    // Players may pick or switch their role while the room is still in the lobby.
    function setRole(id, role) {
        const p = byId(id);
        if (!p || G.phase !== 'lobby' || !ROLES[role]) return false;
        const R = ROLES[role];
        p.role = role;
        p.cash = R.cash;
        p.physical = R.physical;
        p.basePhys = R.physical;
        p.region = role === 'producer' ? (p.region || pickRegion()) : null;
        p.startValue = R.cash + R.physical * G.p0;
        p.planValue = R.physical * G.p0;
        return true;
    }

    function removePlayer(id) {
        if (G.phase === 'lobby') G.players = G.players.filter(p => p.id !== id);
    }

    const byId = id => G.players.find(p => p.id === id);
    const has = (p, u) => p.upgrades.includes(u);
    const cooldown = p => (has(p, "network") ? CFG.researchCooldown / 2 : CFG.researchCooldown);
    const hitRate = p => (has(p, "analysts") ? 0.93 : CFG.researchHit);
    const unrealC = p => p.pos * (G.price - G.ref) * CFG.size;
    const sunreal = p => p.spos * (G.sug.price - G.sug.ref) * CFG.sSize;
    const unreal = p => unrealC(p) + sunreal(p);
    const futEq = p => p.margin + unreal(p);
    const req = (p, pos = p.pos, spos = p.spos) => (Math.abs(pos) * G.price * CFG.size + Math.abs(spos) * G.sug.price * CFG.sSize) * G.marginRate;
    const exposure = p => p.physical + p.pos * CFG.size;
    const liveResult = p => p.cash + futEq(p) + p.physical * G.price + p.sphys * G.sug.price + p.revenue - p.startValue;
    // Was hat die Absicherung (Futures inkl. Gebühren) bisher gebracht? Geschäft und Zusatzkosten herausgerechnet.
    const hedgeEffect = p => liveResult(p) - (p.physical * G.price + p.revenue - p.planValue + p.sphys * G.sug.price - p.sbase * G.sug.p0) + p.costs + p.researchSpent;
    function hedgeQuote(p) {
        if (p.role === 'spec' || !p.expN) return 0;
        return clamp(1 - p.expAcc / p.expN / 100, 0, 1);
    }
    // Kein Hedge-Bonus mehr: Hedger treten gegeneinander um den besten Preis an.
    const bonus = () => 0;
    const score = p => liveResult(p);
    // Kennzahl pro Rolle: Bauern = erzielter Preis pro Tonne (Plan 100 t),
    // Fabrik = effektiver Einkaufspreis pro Tonne Grundbedarf, Fonds = Gewinn.
    function metric(p, res = liveResult(p)) {
        // Bauern: Gesamterlös (Ernte + Direktverkäufe + Futures − Kosten) geteilt durch alle Tonnen inkl. Nachernte.
        if (p.role === 'producer') return Math.round((res + p.planValue) / Math.max(10, p.physical + p.sales.reduce((s, x) => s + x.t, 0)));
        if (p.role === 'processor') return Math.round((-p.planValue - res) / Math.max(10, -p.basePhys));
        return Math.round(res);
    }

    // Bankauflage: Hedger müssen bis Ende Monat CFG.bankMonth mindestens CFG.bankQuota abgesichert haben.
    function hedgedShare(p) {
        if (p.role === 'producer') return p.physical > 0 ? Math.max(0, -p.pos * CFG.size) / p.physical : 0;
        if (p.role === 'processor') return -p.physical > 0 ? Math.max(0, p.pos * CFG.size) / -p.physical : 0;
        return 0;
    }

    function bankCheck() {
        for (const p of G.players) {
            if (p.role === 'spec' || p.bankrupt) continue;
            const q = hedgedShare(p);
            if (q + 1e-9 >= CFG.bankQuota) {
                p.bank = 'ok';
                note(p, 'good', `🏦 Bankauflage erfüllt (${Math.round(q * 100)} % abgesichert). Dein Kredit bleibt günstig.`);
            } else {
                p.bank = 'fail';
                p.cash -= CFG.bankFee;
                p.costs += CFG.bankFee;
                p.bankPaid = CFG.bankFee;
                note(p, 'bad', `🏦 Bankauflage verfehlt (nur ${Math.round(q * 100)} % statt ${Math.round(CFG.bankQuota * 100)} %): Die Bank verlangt ${fmt(CFG.bankFee)} CHF Risikozuschlag.`);
            }
        }
        feed({ kind: 'alert', icon: '🏦', text: `Bankprüfung: Hedger mit weniger als ${Math.round(CFG.bankQuota * 100)} % Absicherung zahlen ${fmt(CFG.bankFee)} CHF Zuschlag.` });
    }

    function note(p, kind, text) {
        p.notes.push({ kind, text, sec: G.sec });
        if (p.notes.length > 20) p.notes.shift();
        emit('note', { pid: p.id, kind, text });
    }

    // ===== Handel =====

    function execute(p, q, price, fee, reducing) {
        // Für den Chart: Wer ist wann ein- bzw. ausgestiegen?
        G.trades.push({ s: G.clock, pid: p.id, q, price, open: Math.abs(p.pos + q) > Math.abs(p.pos) });
        if (G.trades.length > 3000) G.trades.shift();
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

    // Jede Rolle hat ihren eigenen erlaubten Bereich (Mandat):
    // Kooperative nur Short bis zur Erntemenge, Fabrik nur Long bis zum Bedarf, Fonds frei.
    function bounds(p) {
        if (p.role === 'producer') return { min: -Math.floor(Math.max(0, p.physical) / CFG.size), max: 0 };
        if (p.role === 'processor') return { min: 0, max: Math.floor(Math.max(0, -p.physical) / CFG.size) };
        const lim = ROLES[p.role].limit + (has(p, "credit") ? 10 : 0);
        return { min: -lim, max: lim };
    }

    function mandate(p, newPos) {
        const b = bounds(p);
        if (newPos >= b.min && newPos <= b.max) return null;
        // Bestehende Überabsicherung abbauen ist immer erlaubt.
        if (Math.abs(newPos) < Math.abs(p.pos) && Math.sign(newPos) !== -Math.sign(p.pos)) return null;
        if (p.role === 'producer') {
            if (newPos > 0) return 'Als Kooperative darfst du keine Futures kaufen – du sicherst nur deine Ernte ab. Spekulieren ist Sache der Hedgefonds.';
            return `Mandat: Du darfst höchstens deine Ernte absichern – ${p.physical} t = ${-b.min} Kontrakte.`;
        }
        if (p.role === 'processor') {
            if (newPos < 0) return 'Als Fabrik darfst du keine Futures verkaufen – du sicherst nur deinen Einkauf ab. Spekulieren ist Sache der Hedgefonds.';
            return `Mandat: Du darfst höchstens deinen Bedarf absichern – ${-p.physical} t = ${b.max} Kontrakte. Mehr Aufträge = mehr Bedarf.`;
        }
        return `Positionslimit: höchstens ${b.max} Kontrakte.`;
    }

    function check(p, newPos, fee) {
        if (!p || p.bankrupt) return 'Dein Konto ist gesperrt (Konkurs).';
        if (G.phase !== 'trading') return 'Die Börse ist gerade geschlossen.';
        const m = mandate(p, newPos);
        if (m) return m;
        if (Math.abs(newPos) > Math.abs(p.pos) && p.cash + futEq(p) - fee < req(p, newPos)) {
            return `Zu wenig Geld für den Einschuss (${fmt(req(p, newPos))} CHF nötig).`;
        }
        return null;
    }

    function trade(id, q, mkt) {
        if (mkt === 'sugar') return tradeSugar(id, q);
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

    // ===== Zucker-Markt (ab Jahr 2) =====
    function sbounds(p) {
        if (!G.sug.on || p.role === 'producer') return { min: 0, max: 0 };
        if (p.role === 'processor') return { min: 0, max: Math.floor(Math.max(0, -p.sphys) / CFG.sSize) };
        const lim = CFG.sLimit + (has(p, 'credit') ? 5 : 0);
        return { min: -lim, max: lim };
    }

    function tradeSugar(id, q) {
        const p = byId(id);
        q = Math.trunc(q);
        if (!q) return { ok: false, msg: 'Ungültige Menge.' };
        if (!p || p.bankrupt) return { ok: false, msg: 'Dein Konto ist gesperrt (Konkurs).' };
        if (!G.sug.on) return { ok: false, msg: `Zucker wird erst ab Jahr ${CFG.sugarYear} gehandelt.` };
        if (G.phase !== 'trading') return { ok: false, msg: 'Die Börse ist gerade geschlossen.' };
        const b = sbounds(p);
        const np = p.spos + q;
        const reducing = Math.abs(np) < Math.abs(p.spos) && Math.sign(np) !== -Math.sign(p.spos);
        if ((np < b.min || np > b.max) && !reducing) {
            if (p.role === 'producer') return { ok: false, msg: 'Kooperativen handeln keinen Zucker.' };
            if (p.role === 'processor') return { ok: false, msg: np < 0 ? 'Als Fabrik darfst du Zucker nur kaufen – zum Absichern.' : `Mandat: höchstens dein Zuckerbedarf – ${-p.sphys} t = ${b.max} Kontrakte.` };
            return { ok: false, msg: `Zucker-Limit: höchstens ${b.max} Kontrakte.` };
        }
        const fee = Math.abs(q) * CFG.sFee;
        if (Math.abs(np) > Math.abs(p.spos) && p.cash + futEq(p) - fee < req(p, p.pos, np)) {
            return { ok: false, msg: `Zu wenig Geld für den Einschuss (${fmt(req(p, p.pos, np))} CHF nötig).` };
        }
        const price = Math.round(G.sug.price * (1 + Math.sign(q) * CFG.spread * 1.5));
        p.margin += q * (G.sug.ref - price) * CFG.sSize;
        p.spos = np;
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
        G.sug.flow += q;
        pushTape({ who: `${p.name} · Zucker`, role: p.role, q, price, kind: 'sugar' });
        return { ok: true, price, q, mkt: 'sugar' };
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
        if (p.spos !== 0) {
            const q = -p.spos;
            const price = Math.round(G.sug.price * (1 + Math.sign(q) * CFG.spread * 3));
            p.margin += q * (G.sug.ref - price) * CFG.sSize;
            p.spos = 0;
            G.sug.flow += q;
        }
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

    // ===== Rollen-Aktionen =====

    // Kooperative: Pflanzenschutz ist eine Versicherung – billig, solange es ruhig ist,
    // teuer, sobald ein Dürre- oder Krankheitsgerücht läuft.
    function protectPrice(p) {
        const risky = G.events.some(e => e.stage === 'rumor' && e.def.yield && e.def.yield < 1 && (!p || !e.region || e.region === p.region));
        return risky ? CFG.protectHigh : CFG.protectLow;
    }

    function protect(id) {
        const p = byId(id);
        if (!p || p.role !== 'producer') return { ok: false, msg: 'Nur für Kooperativen.' };
        if (p.protect) return { ok: false, msg: 'Deine Plantage ist schon geschützt.' };
        if (G.phase !== 'trading' && G.phase !== 'settle') return { ok: false, msg: 'Erst wenn die Börse läuft.' };
        const c = protectPrice(p);
        if (p.cash < c) return { ok: false, msg: 'Zu wenig Geld.' };
        p.cash -= c;
        p.costs += c;
        p.protect = true;
        return { ok: true, msg: `Pflanzenschutz für ${fmt(c)} CHF gekauft: Ernteverluste werden ab jetzt halbiert.` };
    }

    // Kooperative: Händler bieten Direktverkäufe zu festem Preis an (Terminverkauf ohne Börse).
    function spawnBuyers() {
        const total = CFG.months * G.monthSec;
        for (const p of G.players) {
            if (p.role !== 'producer' || p.bankrupt) continue;
            if (p.buyerOffer && G.sec >= p.buyerOffer.until) p.buyerOffer = null;
            // Nachernte von Mitgliedern
            while (p.extraAt.length && G.clock / total >= p.extraAt[0]) {
                p.extraAt.shift();
                const t = 10 + 5 * Math.floor(Math.random() * 3);
                p.physical += t;
                p.startValue += t * G.p0;
                p.planValue += t * G.p0;   // die Mitglieder werden zum Planpreis bezahlt – zählt nur die Preisänderung + Marge
                note(p, 'good', `🚜 Mitglieder liefern Nachernte: +${t} t. Diese Menge ist noch nicht abgesichert!`);
            }
            if (p.buyerOffer || G.clock < p.nextBuyerAt || G.clock > total - 15 || p.physical < 20) continue;
            const t = Math.min(10 * (1 + Math.floor(Math.random() * 3)), Math.floor(p.physical / 10) * 10 - 10);
            if (t < 10) continue;
            const prem = Math.round((-130 + Math.random() * 280) / 5) * 5;   // mal besser, mal schlechter als die Börse
            p.buyerOffer = { id: G.seq++, client: rand(BUYERS), t, price: Math.round(G.price + prem), until: G.sec + CFG.orderSec };
            p.nextBuyerAt = G.clock + Math.round(CFG.buyerEvery * (0.7 + Math.random() * 0.6));
            note(p, 'good', `🤝 ${p.buyerOffer.client} will ${t} t kaufen – fester Preis ${fmt(p.buyerOffer.price)} CHF/t.`);
        }
    }

    function answerBuyer(id, accept) {
        const p = byId(id);
        if (!p || !p.buyerOffer) return { ok: false, msg: 'Das Angebot ist nicht mehr gültig.' };
        const o = p.buyerOffer;
        p.buyerOffer = null;
        if (!accept) return { ok: true, msg: `Angebot von ${o.client} abgelehnt.` };
        if (o.t > p.physical) return { ok: false, msg: 'So viel Kakao hast du nicht mehr.' };
        p.physical -= o.t;
        p.revenue += o.t * o.price;
        p.sales.push({ client: o.client, t: o.t, price: o.price });
        const over = -p.pos * CFG.size > p.physical;
        return { ok: true, msg: `Verkauft: ${o.t} t an ${o.client} zu ${fmt(o.price)} CHF/t – dieser Preis ist fix.${over ? ' ⚠️ Jetzt bist du überabgesichert – löse einen Teil auf!' : ''}` };
    }

    // Fabrik: Kunden stornieren manchmal Aufträge – dann ist man plötzlich überabgesichert.
    function cancelOrders() {
        const total = CFG.months * G.monthSec;
        for (const p of G.players) {
            if (p.role !== 'processor' || p.bankrupt || !p.orders.length) continue;
            if (G.clock < p.nextCancelAt || G.clock > total - 20) continue;
            p.nextCancelAt = G.clock + 45 + Math.floor(Math.random() * 40);
            if (Math.random() > CFG.cancelProb) continue;
            const i = Math.floor(Math.random() * p.orders.length);
            const o = p.orders.splice(i, 1)[0];
            p.physical += o.t;
            p.revenue -= o.t * o.price;
            p.cancels++;
            const over = p.pos * CFG.size > -p.physical;
            note(p, 'bad', `❌ ${o.client} storniert den Auftrag über ${o.t} t. Dein Bedarf sinkt auf ${-p.physical} t.${over ? ' Du bist jetzt überabgesichert – löse einen Teil auf!' : ''}`);
        }
    }

    function harvestShock(def, confirmed, region) {
        if (!def.yield || !confirmed) return;
        for (const p of G.players) {
            if (p.role !== 'producer') continue;
            if (region && p.region !== region) continue;
            let f = def.yield;
            if (f < 1 && p.protect) f = 1 - (1 - f) / 2;
            if (f < 1 && has(p, "irrigation")) f = 1 - (1 - f) / 2;
            p.lastSky = def.id;
            const before = p.physical;
            p.physical = Math.max(10, Math.round(p.physical * f));
            const d = p.physical - before;
            p.harvestLog.push({ text: def.yes, d });
            note(p, d < 0 ? 'bad' : 'good', d < 0
                ? `🌱 Deine Ernte schrumpft um ${-d} t auf ${p.physical} t${p.protect ? ' (Pflanzenschutz hat die Hälfte gerettet)' : ''}. Prüfe deine Absicherung!`
                : `🌱 Deine Ernte wächst um ${d} t auf ${p.physical} t. Du kannst mehr absichern.`);
        }
    }

    // Fabrik: Kundenaufträge zu festem Verkaufspreis.
    function spawnOrders(mult = 1) {
        const total = CFG.months * G.monthSec;
        for (const p of G.players) {
            if (p.role !== 'processor' || p.bankrupt) continue;
            if (p.orderOffer && G.sec >= p.orderOffer.until) p.orderOffer = null;
            if (p.orderOffer || G.clock < p.nextOrderAt || G.clock > total - 15 || -p.physical >= 200) continue;
            const t = 10 * (1 + Math.floor(Math.random() * 3));
            const margin = Math.round((60 + Math.random() * 160) * mult * (has(p, "pralines") ? 1.6 : 1));
            p.orderOffer = { id: G.seq++, client: rand(CLIENTS), t, price: Math.round(G.price + margin), until: G.sec + CFG.orderSec };
            p.nextOrderAt = G.clock + Math.round(CFG.orderEvery * (has(p, "marketing") ? 0.55 : 1) * (0.7 + Math.random() * 0.6));
            note(p, 'good', `📦 Neuer Auftrag: ${p.orderOffer.client} will Schokolade aus ${t} t Kakao – fester Erlös ${fmt(p.orderOffer.price)} CHF/t.`);
        }
    }

    function answerOrder(id, accept) {
        const p = byId(id);
        if (!p || !p.orderOffer) return { ok: false, msg: 'Der Auftrag ist nicht mehr gültig.' };
        const o = p.orderOffer;
        p.orderOffer = null;
        if (!accept) return { ok: true, msg: `Auftrag von ${o.client} abgelehnt.` };
        p.physical -= o.t;
        p.revenue += o.t * o.price;
        p.orders.push({ client: o.client, t: o.t, price: o.price, at: G.price });
        return { ok: true, msg: `Auftrag angenommen: ${o.t} t zu ${fmt(o.price)} CHF/t. Dein Bedarf steigt auf ${-p.physical} t – sichere ihn ab!` };
    }

    // Hedgefonds: Research-Bericht über ein laufendes Gerücht.
    function research(id) {
        const p = byId(id);
        if (!p || p.role !== 'spec') return { ok: false, msg: 'Nur für Hedgefonds.' };
        if (G.phase !== 'trading') return { ok: false, msg: 'Erst wenn die Börse läuft.' };
        if (G.sec - p.researchAt < cooldown(p)) return { ok: false, msg: `Die Analysten brauchen noch ${cooldown(p) - (G.sec - p.researchAt)} s.` };
        const rumor = G.events.find(e => e.stage === 'rumor');
        const cost = Math.round((rumor ? CFG.researchCost : CFG.researchCost / 2) * (has(p, "network") ? 0.5 : 1));
        if (p.cash < cost) return { ok: false, msg: 'Zu wenig Geld für Research.' };
        p.cash -= cost;
        p.researchSpent += cost;
        p.researchAt = G.sec;
        let text;
        if (rumor) {
            const says = Math.random() < hitRate(p) ? rumor.confirmed : !rumor.confirmed;
            const dir = (says ? rumor.def.impact : -rumor.priced) > 0 ? 'steigen' : 'fallen';
            text = `«${rumor.def.rumor}»: Unsere Quelle erwartet ein ${says ? 'BESTÄTIGT' : 'DEMENTI'}. Kakao dürfte dann ${dir}. (Trefferquote ca. ${Math.round(hitRate(p) * 100)} %, Auflösung in ca. ${rumor.resolveAt - G.clock} s)`;
        } else {
            text = 'Zurzeit läuft kein Gerücht. Die Analysten sehen nichts Konkretes (halber Preis verrechnet).';
        }
        p.reports.push({ text, sec: G.sec });
        return { ok: true, msg: 'Research-Bericht ist da.', report: text };
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
        const pool = shuffleArr([...NEWS]);
        const evs = [];
        for (let m = 0; m < CFG.months; m++) {
            const base = m * G.monthSec;
            const n = m === 0 ? 1 : 2;
            for (let k = 0; k < n && pool.length; k++) {
                const at = base + Math.round(10 + (k + Math.random() * 0.8) * ((G.monthSec - 25) / n));
                const def = pool.pop();
                evs.push({ type: 'rumor', def, at, resolveAt: Math.min(total - 4, at + 14 + Math.round(Math.random() * 12)), confirmed: Math.random() < def.prob, priced: 0, stage: 'pending', region: def.yield ? rand(COCOA_REGIONS) : null });
            }
        }
        shuffleArr([...SURPRISES]).slice(0, 2).forEach((s, i) => {
            evs.push({ type: 'surprise', def: s, at: Math.round(G.monthSec * (1.3 + i * 1.4) + Math.random() * 20), stage: 'pending' });
        });
        if (Math.random() < 0.6) evs.push({ type: 'hike', def: MARGIN_HIKE, at: Math.round(G.monthSec * (1.5 + Math.random())), stage: 'pending' });
        G.events = evs.filter(e => e.at < total - 3).sort((a, b) => a.at - b.at);
        G.sug.events = G.sug.on ? shuffleArr([...SUGAR_NEWS]).slice(0, 3).map((def, i) => ({ def, at: Math.round(total * (0.15 + i * 0.27 + Math.random() * 0.12)), done: false })) : [];
    }

    function runNews() {
        let drift = 0;
        for (const e of G.events) {
            if (e.stage === 'pending' && G.clock >= e.at) {
                if (e.type === 'rumor') {
                    e.stage = 'rumor';
                    e.target = e.def.impact * e.def.prob * 0.6;
                    feed({ kind: 'rumor', icon: e.def.icon, text: `GERÜCHT${e.region ? ` (${REGIONS[e.region].name})` : ''}: ${e.def.rumor}`, dir: Math.sign(e.def.impact), region: e.region || null });
                    if (e.def.yield) G.players.filter(p => p.role === 'producer' && (!e.region || p.region === e.region)).forEach(p => note(p, 'bad', `🌱 Achtung: Dieses Gerücht betrifft deine Region ${REGIONS[p.region].name} (${e.def.yield < 1 ? `bis −${Math.round((1 - e.def.yield) * 100)} %` : `bis +${Math.round((e.def.yield - 1) * 100)} %`}).`));
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
                    feed({ kind: e.confirmed ? 'yes' : 'no', icon: e.confirmed ? '✅' : '❌', text: `${e.confirmed ? 'BESTÄTIGT' : 'DEMENTI'}${e.region ? ` (${REGIONS[e.region].name})` : ''}: ${e.confirmed ? e.def.yes : e.def.no}`, dir: Math.sign(jump), region: e.region || null, yieldIcon: e.def.icon });
                    harvestShock(e.def, e.confirmed, e.region);
                    if (e.def.orders && e.confirmed) G.orderBoost = G.clock + 40;
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
        for (const p of G.players) p.margin += p.spos * (G.sug.price - G.sug.ref) * CFG.sSize;
        G.sug.ref = G.sug.price;
        for (const p of G.players) {
            if (p.bankrupt) continue;
            const need = req(p);
            if ((p.pos !== 0 || p.spos !== 0) && p.margin < need * CFG.maintenance) {
                p.call = { need: need - p.margin, until: G.sec + CFG.callSec };
                note(p, 'bad', `MARGIN CALL: Schiess ${fmt(need - p.margin)} CHF nach oder reduziere deine Position – sonst Zwangsglattstellung in ${CFG.callSec} s!`);
            } else if (p.margin > need) {
                const r = p.margin - need;
                p.margin -= r;
                p.cash += r;
            }
        }
        if (G.month === CFG.bankMonth) bankCheck();
        G.marks.push({ month: G.month, price: G.price, clock: G.clock });
        feed({ kind: 'settle', icon: '🧾', text: `Abrechnung Monat ${G.month}: Alle Positionen zu ${fmt(G.price)} CHF/t bewertet.` });
        emit('settle', { month: G.month, results });
    }

    // ===== Jahresende (Fälligkeit) =====
    function finish() {
        for (const p of G.players) {
            p.cash += p.margin;
            p.margin = 0;
            p.cash += p.physical * G.price + p.revenue + p.sphys * G.sug.price;
            p.orderOffer = null;
            p.buyerOffer = null;
            p.call = null;
        }
        G.offers = [];
        feed({ kind: 'bell', icon: '🔔', text: `Fälligkeit Jahr ${G.year}! Schlusskurs ${fmt(G.price)} CHF/t.` });
        const d = debrief();
        // Zusatzerträge aus dem Kerngeschäft (unabhängig vom Handel): Ernte-Marge und Fairtrade-Prämie
        for (const r of d.rows) {
            const p = byId(r.id);
            let extra = 0;
            if (p.role === 'producer') {
                const tons = p.physical - p.storedNow + p.sales.reduce((s, x) => s + x.t, 0);
                extra = tons * CFG.farmMargin + (has(p, 'fairtrade') ? tons * CFG.fairPremium : 0);
            } else if (p.role === 'processor') {
                extra = -p.basePhys * CFG.chocMargin;   // Verarbeitungsmarge auf den Grundbedarf
            }
            // Kasse sauber abschliessen: Ernte bzw. Grundbedarf zum Planwert ist schon im Startwert enthalten,
            // damit bleibt nach dem Jahr genau «Start + Jahresergebnis» in der Kasse.
            p.cash -= p.basePhys * G.p0 + p.sbase * G.sug.p0;
            p.cash += extra;
            r.extra = Math.round(extra);
            r.yearResult = r.result + r.extra;
            p.total += r.yearResult;
            p.yearPts.push(r.points);
            p.years.push({ year: G.year, result: r.yearResult, metric: r.metric, points: r.points });
            const before = p.level;
            p.level = Math.min(RANKS.length - 1, p.yearPts.filter(x => x >= 0).length);
            r.promoted = p.level > before;
            r.level = p.level;
            r.total = p.total;
        }
        G.yearLog.push({ year: G.year, final: G.price, p0: G.p0, star: d.star ? { id: d.star.id, name: d.star.name, role: d.star.role } : null });
        if (G.year < G.years) {
            G.phase = 'shop';
            G.shopLeft = CFG.shopSec;
            emit('yearEnd', d);
            // KI-Firmen bauen nach und nach aus (mit Reserve)
            G.players.filter(p => p.bot).forEach(p => {
                const opts = shuffleArr((UPGRADES[p.role] || []).filter(u => !has(p, u.id)));
                for (const u of opts) {
                    if (p.cash - u.cost > ROLES[p.role].cash * 0.55 && Math.random() < 0.7) {
                        setTimeout(() => { if (G.phase === 'shop') buyUpgrade(p.id, u.id); }, 2000 + Math.random() * 15000);
                    }
                }
            });
        } else {
            G.phase = 'end';
            emit('end', finalDebrief(d));
        }
    }

    // ===== Ausbauphase =====
    function buyUpgrade(id, uid) {
        const p = byId(id);
        if (!p || G.phase !== 'shop') return { ok: false, msg: 'Ausbauen geht nur zwischen den Jahren.' };
        const u = (UPGRADES[p.role] || []).find(x => x.id === uid);
        if (!u) return { ok: false, msg: 'Unbekannter Ausbau.' };
        if (has(p, uid)) return { ok: false, msg: 'Schon gekauft.' };
        if (p.cash < u.cost) return { ok: false, msg: `Zu wenig Geld (${fmt(u.cost)} CHF nötig).` };
        p.cash -= u.cost;
        p.upSpent += u.cost;
        p.upgrades.push(uid);
        emit('upgrade', { pid: p.id, name: p.name, role: p.role, u });
        return { ok: true, msg: `${u.icon} ${u.name} gekauft!` };
    }

    // Lagerhaus: Ernte zum Schlusskurs zurückbehalten, nächstes Jahr zum dann gültigen Preis verkaufen
    function storeHarvest(id, t) {
        const p = byId(id);
        if (!p || G.phase !== 'shop' || p.role !== 'producer') return { ok: false, msg: 'Nur Kooperativen in der Ausbauphase.' };
        if (!has(p, 'storage')) return { ok: false, msg: 'Dafür brauchst du ein Lagerhaus.' };
        t = clamp(Math.round(t / 10) * 10, 0, CFG.storeMax);
        // vorherige Einlagerung rückgängig machen
        p.cash += p.stored * G.price + p.storeFee;
        const cost = t * G.price + t * CFG.storeFee;
        if (p.cash < cost) {
            p.cash -= p.stored * G.price + p.storeFee;
            return { ok: false, msg: 'Zu wenig Geld für so viel Lager.' };
        }
        p.cash -= cost;
        p.stored = t;
        p.storeFee = t * CFG.storeFee;
        return { ok: true, msg: t ? `🏚️ ${t} t eingelagert (Wert ${fmt(t * G.price)} CHF, Lagerkosten ${fmt(p.storeFee)} CHF).` : 'Lager geleert.' };
    }

    function nextYear() {
        if (G.phase !== 'shop') return;
        G.year++;
        G.p0 = G.price;
        G.ref = G.price;
        G.month = 1;
        G.clock = 0;
        G.history = [{ s: 0, p: G.price }];
        G.marks = [];
        G.trades = [];
        G.tape = [];
        G.offers = [];
        G.marginRate = CFG.marginRate;
        G.pendingRate = null;
        G.orderBoost = 0;
        G.sug.on = G.year >= CFG.sugarYear;
        G.sug.p0 = G.sug.price;
        G.sug.ref = G.sug.price;
        G.sug.history = [{ s: 0, p: G.sug.price }];
        G.sug.flow = 0;
        for (const p of G.players) {
            const R = ROLES[p.role];
            // Notkredit für Pleitiers – mit saftigem Zins
            if (p.bankrupt || p.cash < 8000) {
                p.cash += CFG.loan;
                p.loans++;
                p.interest += CFG.loan * CFG.loanRate;
                p.bankrupt = false;
                note(p, 'bad', `🏦 Notkredit: ${fmt(CFG.loan)} CHF, aber ${fmt(CFG.loan * CFG.loanRate)} CHF Zins werden am Ende abgezogen.`);
            }
            p.pos = 0;
            p.margin = 0;
            p.call = null;
            p.basePhys = R.physical + (p.role === 'producer' && has(p, 'land') ? 30 : 0);
            p.physical = p.basePhys + p.stored;
            p.storedNow = p.stored;
            p.spos = 0;
            p.sbase = p.role === 'processor' && G.sug.on ? -CFG.sNeed : 0;
            p.sphys = p.sbase;
            p.revenue = 0;
            p.protect = false;
            p.harvestLog = [];
            p.orders = [];
            p.orderOffer = null;
            p.sales = [];
            p.buyerOffer = null;
            p.costs = 0;
            p.researchSpent = 0;
            p.reports = [];
            p.bank = null;
            p.bankPaid = 0;
            p.expAcc = 0;
            p.expN = 0;
            p.fees = 0;
            p.liquidations = 0;
            p.cancels = 0;
            p.lastSky = null;
            p.nextOrderAt = 8 + Math.floor(Math.random() * CFG.orderEvery);
            p.nextBuyerAt = 10 + Math.floor(Math.random() * CFG.buyerEvery);
            p.nextCancelAt = 40 + Math.floor(Math.random() * 30);
            p.extraAt = [];
            if (p.role === 'producer') {
                const n = 1 + (Math.random() < 0.5 ? 1 : 0);
                for (let i = 0; i < n; i++) p.extraAt.push(0.1 + Math.random() * 0.6);
            }
            p.startValue = p.cash + p.physical * G.p0 + p.sphys * G.sug.p0 + p.storeFee;
            p.planValue = p.physical * G.p0;
            if (p.stored) note(p, 'good', `🏚️ Aus dem Lager: ${p.stored} t vom letzten Jahr sind wieder im Verkauf (Einstand ${fmt(G.p0)} CHF/t).`);
            p.stored = 0;
            p.storeFee = 0;
            if (p.role === 'processor' && has(p, 'contract')) {
                const price = G.p0 + 150;
                p.physical -= 30;
                p.revenue += 30 * price;
                p.orders.push({ client: 'Grosskunde (Vertrag)', t: 30, price, at: G.price });
            }
        }
        scheduleNews();
        G.phase = 'trading';
        feed({ kind: 'bell', icon: '🔔', text: `Jahr ${G.year} beginnt! Neuer Planpreis: ${fmt(G.p0)} CHF/t.` });
        if (G.sug.on && G.year === CFG.sugarYear) feed({ kind: 'alert', icon: '🍬', text: `NEU: Zucker-Futures! Fabriken brauchen ${CFG.sNeed} t Zucker pro Jahr. Zucker: ${fmt(G.sug.price)} CHF/t.` });
        emit('year', { year: G.year });
        emit('open', { month: 1 });
    }

    function tick() {
        if (!G || G.phase === 'lobby' || G.phase === 'end') return;
        if (G.phase === 'shop') {
            G.sec++;
            G.shopLeft--;
            if (G.shopLeft <= 0) nextYear();
            return;
        }
        G.sec++;
        if (G.phase === 'trading') {
            G.clock++;
            const news = runNews();
            const flow = clamp(G.flow * CFG.impact, -0.006, 0.006);
            G.flow = 0;
            const next = G.price * (1 + gauss() * CFG.vol + news + flow);
            G.price = Math.round(clamp(next, CFG.minPrice, CFG.maxPrice));
            G.history.push({ s: G.clock, p: G.price });
            if (G.sug.on) {
                let sj = 0;
                for (const e of G.sug.events) {
                    if (!e.done && G.clock >= e.at) {
                        e.done = true;
                        sj += e.def.impact;
                        feed({ kind: 'flash', icon: e.def.icon, text: e.def.text, dir: Math.sign(e.def.impact), region: e.def.region, sugar: true });
                    }
                }
                const sf = clamp(G.sug.flow * CFG.impact * 0.6, -0.003, 0.003);
                G.sug.flow = 0;
                const pull = 0.0015 * (CFG.sP0 / G.sug.price - 1);   // Zucker pendelt langfristig um den Normalpreis
                G.sug.price = Math.round(clamp(G.sug.price * (1 + gauss() * CFG.sVol + sj + sf + pull), 200, 3000));
                G.sug.history.push({ s: G.clock, p: G.sug.price });
            }
            for (const p of G.players) {
                if (p.role !== 'spec') {
                    p.expAcc += Math.abs(exposure(p));
                    p.expN++;
                }
            }
            G.offers = G.offers.filter(o => o.until > G.sec);
            spawnOrders(G.orderBoost && G.clock < G.orderBoost ? 1.6 : 1);
            spawnBuyers();
            cancelOrders();
        }
        for (const p of G.players) {
            if (p.bankrupt || (p.pos === 0 && p.spos === 0)) continue;
            if (futEq(p) < 0) {
                // Konto leer: zuerst automatisch vom freien Geld nachschiessen, nur wenn das nicht reicht → Zwangsglattstellung.
                const gap = -futEq(p) + req(p) * 0.3;
                if (p.cash >= -futEq(p)) {
                    const t = Math.min(gap, p.cash);
                    p.cash -= t;
                    p.margin += t;
                    note(p, 'bad', `💸 Starker Kurssprung: ${fmt(t)} CHF automatisch aufs Margin-Konto nachgeschossen. Dein Bargeld schmilzt!`);
                } else liquidate(p, 'Dein Margin-Konto ist leer und dein Bargeld reicht nicht: Position zwangsweise glattgestellt.');
            }
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
        return G.players.map(p => ({ id: p.id, name: p.name, role: p.role, bot: p.bot, score: Math.round(score(p)), metric: metric(p), hedged: hedgedShare(p), bank: p.bank || null, level: p.level, total: Math.round(p.total), pos: p.pos, bankrupt: p.bankrupt, connected: p.connected }))
            .sort((a, b) => b.score - a.score);
    }

    function publicState(full = false) {
        return {
            phase: G.phase, month: G.month, months: CFG.months, secLeft: secLeft(), monthSec: G.monthSec,
            year: G.year, years: G.years, shopLeft: G.shopLeft,
            sugar: { on: G.sug.on, price: G.sug.price, p0: G.sug.p0, history: G.sug.history.slice(full ? 0 : -90).map(h => (full ? h : h.p)) },
            price: G.price, ref: G.ref, p0: G.p0, marginRate: G.marginRate, pendingRate: G.pendingRate,
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
        const rk = ranking().filter(r => r.role === p.role);
        const rank = rk.findIndex(r => r.id === id) + 1;
        return {
            roleCount: rk.length, metric: metric(p), hedgeEffect: Math.round(hedgeEffect(p)), protectPrice: protectPrice(p),
            buyerOffer: p.buyerOffer ? { client: p.buyerOffer.client, t: p.buyerOffer.t, price: p.buyerOffer.price, left: Math.max(0, p.buyerOffer.until - G.sec) } : null,
            sales: p.sales.slice(-3), cancels: p.cancels, hedged: hedgedShare(p), bank: p.bank || null, bankDue: G.month <= CFG.bankMonth,
            id: p.id, name: p.name, role: p.role, cash: Math.round(p.cash), margin: Math.round(p.margin), pos: p.pos,
            eq: Math.round(futEq(p)), unreal: Math.round(unrealC(p)), req: Math.round(req(p)), exposure: exposure(p),
            call: p.call ? { need: Math.round(Math.max(0, req(p) - futEq(p))), left: Math.max(0, p.call.until - G.sec) } : null,
            result: Math.round(liveResult(p)), bonus: bonus(p), hedgeQuote: hedgeQuote(p), rank, bankrupt: p.bankrupt,
            limit: ROLES[p.role].limit, bounds: bounds(p), notes: p.notes.slice(-3), liquidations: p.liquidations,
            physical: p.physical, revenue: Math.round(p.revenue), protect: p.protect, harvestLog: p.harvestLog.slice(-3),
            orders: p.orders.map(o => ({ client: o.client, t: o.t, price: o.price })),
            orderOffer: p.orderOffer ? { client: p.orderOffer.client, t: p.orderOffer.t, price: p.orderOffer.price, left: Math.max(0, p.orderOffer.until - G.sec) } : null,
            reports: p.reports.slice(-2), researchReady: Math.max(0, cooldown(p) - (G.sec - p.researchAt)), researchCostNow: Math.round(CFG.researchCost * (has(p, "network") ? 0.5 : 1)), hitRate: hitRate(p),
            rumorActive: G.events.some(e => e.stage === 'rumor'),
            sky: ((G.events.find(e => e.stage === 'rumor' && e.def.yield && (!e.region || e.region === p.region)) || {}).def || {}).id || p.lastSky || 'sun',
            skyRumor: G.events.some(e => e.stage === 'rumor' && e.def.yield && (!e.region || e.region === p.region)),
            month: G.month, year: G.year, years: G.years, shopLeft: G.shopLeft,
            upgrades: p.upgrades.slice(), level: p.level, total: Math.round(p.total), upSpent: p.upSpent, interest: p.interest, loans: p.loans,
            yearsDone: p.years.slice(),
            spos: p.spos, sphys: p.sphys, sbounds: sbounds(p), sunreal: Math.round(sunreal(p)), region: p.region, stored: p.stored, storeFee: p.storeFee,
        };
    }

    function debrief() {
        const rows = G.players.map(p => {
            const R = ROLES[p.role];
            // Effect of price, harvest size and customer orders on the physical business (vs. plan).
            const physPL = p.physical * G.price + p.revenue - p.basePhys * G.p0;
            const result = p.cash - p.startValue;
            return {
                id: p.id, name: p.name, role: p.role, bot: p.bot, result: Math.round(result), physPL: Math.round(physPL),
                physical: p.physical, protect: p.protect, orders: p.orders.length, orderT: p.orders.reduce((s, o) => s + o.t, 0),
                orderMargin: Math.round(p.orders.reduce((s, o) => s + o.t * (o.price - G.price), 0)), researchSpent: p.researchSpent, reports: p.reports.length,
                futPL: Math.round(result - physPL), fees: Math.round(p.fees), bonus: bonus(p), score: Math.round(result + bonus(p)),
                hedgeQuote: hedgeQuote(p), liquidations: p.liquidations, bankrupt: p.bankrupt, trades: p.trades,
                metric: metric(p, result), bank: p.bank || null, bankPaid: p.bankPaid || 0,
            };
        }).sort((a, b) => b.score - a.score);
        // Trader des Tages: Punkte = wie viel besser als der Durchschnitt der eigenen Rolle,
        // geteilt durch die typische Streuung der Rolle (damit alle Rollen gleiche Chancen haben).
        const SCALE = { producer: 110, processor: 60, spec: 10000 };
        const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
        for (const r of rows) {
            const peers = rows.filter(x => x.role === r.role);
            if (r.role === 'spec') {
                const base = peers.length > 1 ? avg(peers.map(x => x.result)) : 0;
                r.points = Math.round((10 * (r.result - base)) / SCALE.spec);
            } else {
                const base = peers.length > 1 ? avg(peers.map(x => x.metric)) : G.price;   // allein in der Rolle: Vergleich mit «gar nicht absichern»
                r.points = Math.round((10 * (r.role === 'producer' ? r.metric - base : base - r.metric)) / SCALE[r.role]);
            }
        }
        const star = rows.filter(r => !r.bankrupt).sort((a, b) => b.points - a.points)[0] || null;
        return { rows, star, trades: G.trades, final: G.price, p0: G.p0, change: G.price / G.p0 - 1, history: G.history, marks: G.marks, feed: G.feed.slice(0, 20) };
    }

    // ===== Karriere-Auswertung über alle Jahre =====
    function finalDebrief(last) {
        const career = G.players.map(p => ({
            id: p.id, name: p.name, role: p.role, bot: p.bot, level: p.level,
            years: p.years.slice(), upgrades: p.upgrades.slice(), upSpent: p.upSpent, interest: p.interest, loans: p.loans,
            points: p.yearPts.reduce((s, x) => s + x, 0),
            final: Math.round(p.total - p.upSpent - p.interest),
        })).sort((a, b) => b.final - a.final);
        const star = career.slice().sort((a, b) => b.points - a.points)[0] || null;
        return { ...last, career, careerStar: star, yearLog: G.yearLog.slice(), years: G.years };
    }

    return {
        create, addPlayer, setRole, removePlayer, start, tick, trade, postOffer, cancelOffer, acceptOffer, topUp,
        protect, answerOrder, research, answerBuyer, protectPrice, buyUpgrade, nextYear, storeHarvest, sbounds,
        publicState, personal, debrief, activeRumors, exposure, futEq, req, byId,
        get G() { return G; },
    };
})();
